// Bikin cert self-signed untuk LAN. Jalankan sekali: npm run cert
import { execFileSync } from "node:child_process";
import { networkInterfaces } from "node:os";

const ips = Object.values(networkInterfaces()).flat()
  .filter((a) => a && a.family === "IPv4" && !a.internal).map((a) => a.address);
const san = ["DNS:localhost", "IP:127.0.0.1", ...ips.map((ip) => "IP:" + ip)].join(",");

execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "825",
  "-keyout", "key.pem", "-out", "cert.pem", "-subj", "/CN=aixych",
  "-addext", "subjectAltName=" + san], { stdio: "inherit" });

console.log("\ncert.pem + key.pem dibuat untuk: " + san);
console.log("Jalankan ulang server, lalu buka https://<ip-lan>:8443 (klik Advanced -> Proceed).");