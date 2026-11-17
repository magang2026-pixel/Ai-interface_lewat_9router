# AiXych — UI chat untuk 9router

Antarmuka chat ringan (satu file `index.html`, tanpa build) untuk endpoint
OpenAI-compatible 9router. Streaming, kirim gambar, riwayat, slash command,
dan filter model otomatis.

## Fitur

- Streaming token (SSE) di atas `POST /v1/chat/completions`.
- Kirim gambar via tombol, tempel (`Ctrl+V`), atau tarik file ke jendela.
- **Input suara**: klik ikon mikrofon, bicara, klik lagi. Rekaman diubah ke
  WAV 16 kHz mono di peramban lalu ditranskripsi lewat `/v1/audio/transcriptions`
  (model `gemini/gemini-3.5-flash-lite`). Hasil masuk ke kotak pesan, tidak
  langsung terkirim. Auto-stop 60 detik. Butuh HTTPS atau `localhost`.
- Riwayat percakapan di `localStorage`, sidebar dengan hapus/rename judul.
- Slash command di kotak chat:
  - `/model` — pilih model (daftar dari `/v1/models`)
  - `/model gambar` · `/model suara` · `/model thinking` · `/model pdf` — saring berdasarkan kemampuan
  - `/new` — percakapan baru
  - `/clear` — kosongkan percakapan aktif
  - `/theme` — terang/gelap
  - `/key` — buka setelan
  - `/help` — daftar perintah
- Markdown + syntax highlight + tombol salin kode.
- Stop generate (`AbortController`) dan ulangi pesan.
- Mode terang/gelap, menghormati `prefers-color-scheme`.
- **System prompt** bisa diubah di Setelan (kosong = bawaan AiXych: menyebut model
  aktif dan menolak mengaku sebagai Anthropic/Claude/OpenAI).
- **Filter model otomatis**: opsional. Mati secara default — tidak ada tes
  berjalan saat daftar dibuka, jadi tidak menunggu. Nyalakan di Setelan atau
  tekan **uji ulang**. Model gagal disembunyikan (cache 24 jam), model hidup
  6 jam. `antigravity` (`ag/*`) dibuang.
- **Filter kapabilitas**: chip `Semua · Gambar · Suara · Gambar+Suara · Thinking · PDF`,
  diambil dari `capabilities` di `/v1/models`.

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
proxy  /v1 → http://127.0.0.1:20128  (key disuntik)
HTTPS  https://192.168.2.7:8443  (cert self-signed)
```

Baris `HTTPS` hanya muncul setelah `npm run cert`.

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

## Input suara (mic)

Klik ikon mikrofon di kiri kotak pesan → bicara → klik lagi. Teks hasil
transkripsi disisipkan ke kotak pesan (tidak langsung terkirim). Auto-stop 60
detik; selama merekam baris bantuan menampilkan `Merekam 0:07 · klik mikrofon
untuk berhenti`.

### Cara kerjanya

```
getUserMedia (mic) → Web Audio (mono) → resample 16 kHz → WAV PCM16
                                                          (di peramban)
   → POST /v1/audio/transcriptions   model=gemini/gemini-3.5-flash-lite
   → { "text": "..." }  →  disisipkan ke kotak pesan
```

Tanpa dependensi, tanpa ffmpeg. STT hanya didukung provider Gemini; provider
lain (nvidia, groq, openrouter, cloudflare) menolak dengan
`Provider '...' does not support STT` — bukan salah konfigurasi.

### Kenapa harus HTTPS

`getUserMedia` hanya ada di **secure context**: `https://` atau `localhost`.
`http://<IP-LAN>:8090` tidak memberi akses mic — aturan browser, bukan bug
aplikasi. Karena itu server juga mendengarkan HTTPS.

### Menyalakan mic

```bash
cd claude-chat
npm run cert     # sekali saja: cert.pem + key.pem (SAN localhost + semua IP mesin)
npm run dev      # HTTP :8090 dan HTTPS :8443 jalan bersamaan
```

Keluaran yang benar:

```
UI     http://localhost:8090
proxy  /v1 → http://127.0.0.1:20128  (key disuntik)
HTTPS  https://192.168.2.7:8443  (cert self-signed)
```

Buka `https://<ip-lan>:8443`. Peringatan cert muncul sekali per browser:

- Chrome/Edge: **Advanced** → **Proceed to \<ip\> (unsafe)**
- Firefox: **Advanced** → **Accept the Risk and Continue**

Setelah itu klik ikon mikrofon dan izinkan akses.

### Cek cepat kalau mic mati

```bash
ss -ltn | grep -E ':8090|:8443'                                  # dua-duanya LISTEN
curl -k -o /dev/null -w "%{http_code}\n" https://<ip-lan>:8443/   # 200
tail -5 /tmp/chatsrv.log                                          # ada baris HTTPS
```

Kalau `:8443` tidak ada di `ss`, server hidup tanpa HTTPS (mis. dijalankan
sebelum `npm run cert`). Ulangi:

```bash
fuser -k 8090/tcp; fuser -k 8443/tcp
npm run dev
```

### Menghentikan / mengganti

| Kebutuhan | Perintah |
|---|---|
| Hentikan semua | `fuser -k 8090/tcp; fuser -k 8443/tcp` |
| Matikan HTTPS saja | `fuser -k 8443/tcp` |
| Port HTTPS lain | `TLSPORT=9443 npm run dev` |
| HTTP saja (tanpa mic) | rename `cert.pem` & `key.pem`, lalu `npm run dev` |
| IP mesin berubah | `npm run cert` lagi |

Cert berlaku 825 hari. `cert.pem`/`key.pem` masuk `.gitignore`.

### Alternatif HTTPS

```bash
sudo tailscale serve --bg http://127.0.0.1:8090
```

Buka `https://<host>.<tailnet>.ts.net`. Hanya jalan di perangkat yang login
akun tailnet yang sama; di luar itu muncul `NXDOMAIN`. Port 443 dipakai
tailscale, jadi `TLSPORT=443` bentrok sampai `sudo tailscale serve reset`.

Punya domain + cert valid (Let's Encrypt)? Arahkan A record ke IP LAN mesin ini
dan ganti `cert.pem`/`key.pem` dengan cert asli — `serve.mjs` tidak perlu diubah.

## Model

Daftar diambil dari `/v1/models`. Model `antigravity` (`ag/*`,
`combo_antigravity_gemini`) dikecualikan.

**Pindai otomatis = mati secara default.** Saat daftar dimuat, tidak ada tes
yang berjalan — jadi tidak ada tunggu-menunggu. Untuk mengetahui model mana
yang hidup, klik **uji ulang** di dropdown model, atau nyalakan
*Setelan → Pindai model otomatis*. Saat menyala, semua model diuji paralel
(3 worker, timeout 8 detik, `max_tokens: 1`).

Cache hasil di `localStorage` (`pc.ping`): model hidup 6 jam, model gagal
24 jam. Model gagal **tidak ditampilkan** (jadi tidak diuji ulang terus).
Klik **gagal** untuk melihatnya beserta kode error.

Di dropdown model:

- **Chip kemampuan** — saring `Gambar`, `Suara`, `Gambar+Suara`, `Thinking`, `PDF`.
  Diambil dari `capabilities` (`vision`, `audioInput`, `pdf`, `reasoning`).
- **uji ulang** — tes ulang paksa (mis. setelah kena rate-limit).
- **gagal** — toggle untuk menampilkan model yang dibuang beserta kode error.

## Setelan

| Field | Guna |
|---|---|
| URL dasar | Endpoint 9router. Lewat proxy, otomatis `location.origin + "/v1"`. |
| Kunci API | Kosongkan bila `serve.mjs` sudah menyuntik kunci. |
| System prompt | Identitas/aturan model. Kosong = bawaan AiXych. |
| Pindai model otomatis | Mati = tidak ada tes model tanpa perintah. |

Bawaan system prompt:

```
Kamu AiXych, antarmuka chat ini. Model yang sedang dipakai: <model>.
Jangan mengaku sebagai produk Anthropic, Claude, OpenAI, atau Google; bila
ditanya siapa kamu atau model apa yang menjawab, sebutkan AiXych dan model di atas.
```

Ini instruksi, bukan jaminan: model tetap bisa mengelak. Sumber kebenaran
adalah nilai `model` di dropdown dan `usage` dari API.

## Struktur file

```
index.html    UI lengkap (CSS + JS inline)
cuking.png    ikon aplikasi / favicon
serve.mjs     server statis + proxy /v1 + injeksi key
cert.mjs      bikin cert self-signed untuk HTTPS (npm run cert)
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
| `ERR_EMPTY_RESPONSE` / reset di `:8443` | Dibuka sebagai `http://`, atau antivirus/proxy membunuh TLS non-443 | Pakai `https://`; kalau tetap, pindah ke 443: `sudo tailscale serve reset` lalu `sudo -E env "PATH=$PATH" TLSPORT=443 node serve.mjs` |
| `DNS_PROBE_FINISHED_NXDOMAIN` | Nama `*.ts.net` dibuka dari perangkat yang tidak login tailnet | Pakai IP LAN, atau daftarkan domain sendiri |
| Mic jalan tapi teks kosong | Rekaman < 0,4 detik atau terlalu pelan | Rekam lebih lama / dekatkan mic |
| Ikon mikrofon tidak bereaksi | Halaman dibuka lewat `http://<IP>` bukan HTTPS/localhost. `getUserMedia` butuh secure context — lihat bagian Input suara. |
| `Izin mikrofon ditolak` | Aktifkan izin mikrofon untuk situs ini di setelan peramban. |
| `Gagal transkripsi: Provider ... does not support STT` | `STT_MODEL` di `index.html` bukan model Gemini. Hanya provider Gemini yang mendukung STT. |