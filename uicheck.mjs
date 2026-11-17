// Smoke test UI: buka index.html di Chrome headless (via CDP), cek error runtime,
// overflow horizontal, dan ukuran target sentuh. Bukan bagian aplikasi.
// Pakai: CHROME_PATH=/path/to/chrome node uicheck.mjs
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";

const CHROME = process.env.CHROME_PATH || "chrome";
const url = process.env.PAGE || ("file://" + resolve(process.argv[2] || "index.html"));
const PORT = 9333;
const profile = mkdtempSync(join(tmpdir(), "uicheck-"));
const chrome = spawn(CHROME, ["--headless=new", "--no-sandbox", "--disable-gpu",
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function version() {
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) return r.json(); } catch {}
    await sleep(100);
  }
  throw new Error("Chrome tidak mau start (cek CHROME_PATH / LD_LIBRARY_PATH).");
}

const vinfo = await version();
console.log("chrome:", vinfo.Browser);
let id = 0;
const waiters = new Map();
const errors = [];
const ws = new WebSocket((await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`, { method: "PUT" })).json()).webSocketDebuggerUrl);

ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && waiters.has(m.id)) { waiters.get(m.id)(m); waiters.delete(m.id); return; }
  if (m.method === "Runtime.exceptionThrown") errors.push("exception: " + (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text));
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error")
    errors.push("console.error: " + m.params.args.map((a) => a.value ?? a.description ?? "").join(" "));
  if (m.method === "Log.entryAdded" && m.params.entry.level === "error" && !/Failed to load resource/i.test(m.params.entry.text))
    errors.push("log: " + m.params.entry.text);
});
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
const send = (method, params = {}) => new Promise((res) => { const n = ++id; waiters.set(n, (m) => res(m.result)); ws.send(JSON.stringify({ id: n, method, params })); });

await send("Runtime.enable");
await send("Page.enable");
await send("Page.navigate", { url });
await sleep(3000); // tunggu font/CDN + skrip init

const probe = `(() => {
  const small = [...document.querySelectorAll('button,a[href],input,textarea')].filter(el => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.height < 44;
  }).map(el => ((el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 26) || el.tagName) + ' h' + Math.round(el.getBoundingClientRect().height));
  return JSON.stringify({
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    h1: [...document.querySelectorAll('h1,h2')].map(e => e.tagName).join(','),
    small, bg: getComputedStyle(document.body).backgroundColor,
    font: getComputedStyle(document.body).fontFamily.split(',')[0]
  });
})()`;

let bad = 0;
for (const [w, h] of [[1440, 900], [390, 844], [320, 640]]) {
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 820 });
  await sleep(500);
  const r = await send("Runtime.evaluate", { expression: probe, returnByValue: true });
  const d = JSON.parse(r.result.value);
  const ok = d.overflow <= 1;
  if (!ok) bad++;
  console.log(`\n[${w}x${h}] overflow=${d.overflow}px  font=${d.font}  bg=${d.bg}  ${ok ? "OK" : "FAIL"}`);
  console.log("  target <44px:", d.small.length ? d.small.join(" | ") : "tak ada");
}
// tema terang -> gelap
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Runtime.evaluate", { expression: "document.getElementById('themeBtn').click()" });
await sleep(300);
const dark = await send("Runtime.evaluate", { expression: "getComputedStyle(document.body).backgroundColor", returnByValue: true });
console.log("\ndark bg:", dark.result.value);

chrome.kill();
assert.equal(bad, 0, "ada overflow di salah satu lebar");
assert.equal(errors.length, 0, "error runtime: " + errors.join(" | "));
console.log("\nUICHECK: PASS");
process.exit(0);
