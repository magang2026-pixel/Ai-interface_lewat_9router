// Self-check: pastikan 9router balas streaming dan menerima gambar (vision).
// Pakai: API_KEY=sk-... node selfcheck.mjs   (atau: node selfcheck.mjs sk-...)
import assert from "node:assert/strict";

const base = process.env.BASE_URL || "http://127.0.0.1:20128/v1";
const key = process.env.API_KEY || process.argv[2];
if (!key) { console.error("Butuh API_KEY (env) atau argumen pertama."); process.exit(2); }

// PNG 1x1 transparan, cukup untuk uji jalur image_url.
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

async function models() {
  const r = await fetch(base + "/models", { headers: { Authorization: "Bearer " + key } });
  assert.equal(r.status, 200, "GET /models harus 200");
  const j = await r.json();
  assert.ok(Array.isArray(j.data) && j.data.length, "/models harus punya data");
  return j.data;
}

async function stream(model, content) {
  const r = await fetch(base + "/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
    body: JSON.stringify({ model, stream: true, messages: [{ role: "user", content }] }),
  });
  assert.equal(r.status, 200, "chat/completions harus 200");
  assert.ok(r.body, "respons harus punya body stream");
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "", text = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true }).replace(/\r/g, "");
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, i); buf = buf.slice(i + 2);
      for (const line of block.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try { text += JSON.parse(data).choices?.[0]?.delta?.content || ""; } catch {}
      }
    }
  }
  return text;
}

const list = await models();
console.log("models:", list.length);
const pref = [process.env.MODEL, "gemini/gemini-3.5-flash-lite", "cbai/glm-5.1", "cbai/glm-5v-turbo",
  "openrouter/nvidia/nemotron-3.5-lightning:free", "combo_motion", "Pion_1"].filter(Boolean);
const order = [...new Set([...pref, ...list.filter((m) => m.capabilities?.vision).map((m) => m.id), ...list.map((m) => m.id)])];

// 9router punya banyak upstream; sebagian sedang mati (500/503). Ambil yang pertama hidup.
let picked = null, t1 = "";
for (const id of order) {
  try {
    const t = await stream(id, "Balas satu kata: halo");
    if (t.trim()) { picked = id; t1 = t; break; }
  } catch (e) { console.log("  lewati", id, "-", String(e.message).slice(0, 60)); }
}
assert.ok(picked, "tak ada model yang membalas; cek koneksi 9router/upstream");
console.log("teks OK:", picked, JSON.stringify(t1.slice(0, 60)));

const t2 = await stream(picked, [
  { type: "text", text: "Ada berapa piksel gambar ini? Jawab singkat." },
  { type: "image_url", image_url: { url: PNG } },
]);
assert.ok(t2.trim().length > 0, "jalur gambar harus mengembalikan isi");
console.log("gambar OK:", JSON.stringify(t2.slice(0, 60)));

console.log("SELFCHECK: PASS");
