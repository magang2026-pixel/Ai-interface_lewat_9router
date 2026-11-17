// Sajikan UI + proxy /v1 ke 9router loopback. Browser bicara same-origin,
// jadi tak ada preflight CORS (9router menolak OPTIONS non-loopback dengan 401).
// Pakai: node serve.mjs   (PORT, API_KEY bisa di-override lewat env)
import http from "node:http";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { extname, join, resolve } from "node:path";

const ROOT = resolve(".");
const PORT = Number(process.env.PORT || 8090);
const UP = "http://127.0.0.1:20128";
const KEY = process.env.API_KEY || readKey();

function readKey() {
  try {
    const c = JSON.parse(readFileSync(join(homedir(), ".config/opencode/opencode.json"), "utf8"));
    return c.provider?.["9router"]?.options?.apiKey || "";
  } catch { return ""; }
}

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".ico": "image/x-icon",
};

function serveStatic(res, pathname) {
  let p = decodeURIComponent(pathname);
  if (p === "/") p = "/index.html";
  const file = resolve(ROOT, "." + p);
  if (!file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { "content-type": "text/plain" });
    return res.end("404");
  }
  res.writeHead(200, {
    "content-type": MIME[extname(file)] || "application/octet-stream",
    "cache-control": "no-cache",
  });
  createReadStream(file).pipe(res);
}

function proxy(req, res, u) {
  const headers = { ...req.headers, host: "127.0.0.1:20128" };
  if (KEY) headers.authorization = "Bearer " + KEY;
  const pr = http.request({
    hostname: "127.0.0.1", port: 20128, method: req.method,
    path: u.pathname + u.search, headers,
  }, (pres) => {
    res.writeHead(pres.statusCode, pres.headers);
    pres.pipe(res);
  });
  pr.on("error", (e) => {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { message: "proxy: " + e.message } }));
  });
  req.pipe(pr);
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/v1" || u.pathname.startsWith("/v1/")) return proxy(req, res, u);
  serveStatic(res, u.pathname);
});
server.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    console.error(`Port ${PORT} sedang dipakai. Coba: PORT=${PORT + 1} npm run dev`);
    process.exit(1);
  }
  throw e;
});
server.listen(PORT, "0.0.0.0", () => {
  console.log(`UI     http://localhost:${PORT}`);
  console.log(`proxy  /v1 -> ${UP}  ${KEY ? "(key disuntik)" : "(TANPA key!)"}`);
});