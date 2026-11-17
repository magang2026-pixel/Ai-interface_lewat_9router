# Claude Chat — UI chat untuk 9router

Antarmuka chat ringan (satu file `index.html`, tanpa build) untuk endpoint
OpenAI-compatible 9router. Streaming, kirim gambar, riwayat, slash command,
dan filter model otomatis.

## Fitur

- Streaming token (SSE) di atas `POST /v1/chat/completions`.
- Kirim gambar via tombol, tempel (`Ctrl+V`), atau tarik file ke jendela.
- Riwayat percakapan di `localStorage`, sidebar dengan hapus/rename judul.
- Slash command di kotak chat:
  - `/model` — pilih model (daftar dari `/v1/models`)
  - `/new` — percakapan baru
  - `/clear` — kosongkan percakapan aktif
  - `/theme` — terang/gelap
  - `/key` — buka setelan
  - `/help` — daftar perintah
- Markdown + syntax highlight + tombol salin kode.
- Stop generate (`AbortController`) dan ulangi pesan.
- Mode terang/gelap, menghormati `prefers-color-scheme`.
- **Filter model otomatis**: setiap model diuji mini-request di latar belakang,
  yang gagal disembunyikan. Hasil di-cache 6 jam. `antigravity` (`ag/*`) dibuang.

## Arsitektur singkat

```
browser  ──HTTP──>  serve.mjs (port 8090)
                     ├─ /            → index.html (statis)
                     └─ /v1/*        → proxy ke 127.0.0.1:20128/v1
```

Kenapa proxy? 9router menolak preflight CORS (`OPTIONS`) dari IP non-loopback
dengan `401`, sehingga browser di perangkat lain selalu gagal `Failed to fetch`.
Proxy membuat UI dan API **same-origin**, dan menyuntik API key di sisi server.

## Prasyarat

- Node.js 18+ (tanpa dependensi npm).
- 9router berjalan dan mendengarkan `127.0.0.1:20128`.

## Menjalankan

```bash
cd claude-chat
npm run dev
```

Keluaran:

```
UI     http://localhost:8090
proxy  /v1 -> http://127.0.0.1:20128  (key disuntik)
```

Buka `http://localhost:8090`. Dari perangkat lain di LAN/tailscale, gunakan IP
mesin ini, mis. `http://192.168.1.10:8090`.

Ganti port:

```bash
PORT=8091 npm run dev
```

Hentikan:

```bash
fuser -k 8090/tcp
```

## Kunci API (keamanan)

Kunci **tidak** ditulis di repo. `serve.mjs` membacanya saat start dari:

1. `$API_KEY`, kalau di-set;
2. `~/.config/opencode/opencode.json` → `provider["9router"].options.apiKey`.

Contoh override lewat shell (jangan simpan di file yang di-commit):

```bash
API_KEY=sk-... npm run dev
```

Karena proxy menyuntik key, browser tidak perlu diisi kunci.

**Penting sebelum push ke GitHub:**

- `.gitignore` sudah menutup `.env*`, `*.key`, `*.pem`, `secrets*`, `*.log`,
  `node_modules/`, dan artefak tes.
- Repo ini **tidak** memuat kunci; kunci hidup di `~/.config/opencode/` (di luar repo).
- Jangan pernah `git add -f` file rahasia.
- Port 8090 menyuntik API key otomatis. **Jangan** buka ke internet publik.
  Cukup LAN atau tailscale. Kalau perlu, batasi dengan firewall atau bind ke
  `127.0.0.1` (`HOST` belum didukung; edit `server.listen` bila perlu).

Cek cepat sebelum commit:

```bash
git grep -nE 'sk-[a-zA-Z0-9-]{8,}' || echo "bersih"
```

## Model

Daftar diambil dari `/v1/models`. Saat pertama dimuat, semua model diuji paralel
(3 worker, timeout 8 detik, `max_tokens: 1`). Yang gagal tidak ditampilkan; yang
hidup dipakai. Hasil disimpan di `localStorage` (`pc.ping`) selama 6 jam.

Di dropdown model:

- **uji ulang** — tes ulang paksa (mis. setelah kena rate-limit).
- **gagal** — toggle untuk menampilkan model yang dibuang beserta kode error.

Model `antigravity` (`ag/*`, `combo_antigravity_gemini`) dikecualikan.

## Struktur file

```
index.html    UI lengkap (CSS + JS inline)
serve.mjs     server statis + proxy /v1 + injeksi key
package.json  script npm
selfcheck.mjs uji API 9router (streaming + gambar)
uicheck.mjs   smoke test UI via Chrome headless (CDP)
```

## Skrip cek

`selfcheck.mjs` — memastikan endpoint dan jalur gambar bekerja:

```bash
API_KEY=sk-... node selfcheck.mjs
```

`uicheck.mjs` — buka UI di Chrome headless, cek error runtime, overflow
horizontal, dan ukuran target sentuh:

```bash
CHROME_PATH=/path/ke/chrome node uicheck.mjs
# kalau library Chrome ada di folder lain:
LD_LIBRARY_PATH=/path/ke/libs node uicheck.mjs
```

## Troubleshooting

| Gejala | Penyebab / solusi |
|---|---|
| `model tak termuat` | Jalankan lewat `npm run dev`, bukan `file://`. Cek Setelan → Tes koneksi. |
| `Failed to fetch` | Halaman dibuka dari `file://` atau bukan lewat `serve.mjs`. |
| `Port 8090 sedang dipakai` | `PORT=8091 npm run dev` atau `fuser -k 8090/tcp`. |
| Model hilang dari daftar | Model sedang mati. Klik **uji ulang**, atau toggle **gagal**. |
| Gambar ditolak | Pilih model bertanda `· gambar`. |
| Error `500/403/503` saat chat | Model itu mati di sisi penyedia. Ganti ke model lain. |