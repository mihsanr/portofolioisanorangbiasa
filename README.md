# Ihsan Rizka — Portfolio (gaya galekto/projects)

Situs statis murni (HTML/CSS/JS, tanpa build step, tanpa dependency runtime).
Satu halaman: preloader TV (SMPTE bars), hero biru #0000FF "PROJECTS", 9 baris
proyek (hover = teks hitam + scramble + gambar melayang 16:10 dengan tilt &
glare), marquee klien, Journey (latar beranimasi biru → krem saat scroll),
skills, kontak, footer gelap. Overlay CRT (scanline/grain/vignette/frame
barrel) dan fluid WebGL putih di latar. Kursor kustom plus (+) blend-difference.

Channel: AF Medika, Vinco Shorts (6 video), Motion Graphics (semua 35 video),
Rabbani (album + PDF biro), Logo & Brand (semua logo + Logofolio PDF),
Poster & Campaign (+ Menu Ongkel Bob & Panduan Lomba PDF), Merch & Apparel
(semua), Social Content (semua feed), Personal Project (semua).
PDF asli ada di `assets/docs/` (kartu "OPEN PDF" di galeri), halamannya
dirender jadi WebP. Album gambar per folder tercatat di ALBUMS (js/media.js).

## Menjalankan lokal
Apa pun static server bisa. Contoh:
```
python -m http.server 8734 --directory .
```
lalu buka http://localhost:8734

## Deploy
Upload seluruh isi folder `site/` ke Netlify / Vercel / GitHub Pages / Cloudflare Pages.
Tidak ada konfigurasi khusus. Total ±44 MB (39 MB video).

## Struktur
- `index.html` — root ala linktree (@isanorgbiasa): avatar, ikon sosmed, kartu link (portfolio, free tools, donate, req lagu, next up, TikTok, IG, product). CSS inline, tanpa preloader/BGM supaya cepat dibuka dari bio. Link lama `/#projects` dsb otomatis dialihkan ke `work.html`.
- `index.html` juga memuat **Preview Wall** di atas profil (`js/tapes.js` + `js/fisheye.js`, variant `preview`): hanya item di halaman atlas pertama + `atlas-0-sm.webp`, klik/ketuk karya → `work.html#tape/<slug>`.
- `work.html` — portofolio (dulu `index.html`): hero ringkas, **CH 00 · Globe semua karya** (video + gambar + dokumen, filter `SEMUA · VIDEO · DESAIN`), **PRIME TIME** (3–4 case terpilih, kartu bertumpuk saat scroll — isinya `PRIME` di `js/data.js`), Channel Guide (8 proyek + strip thumbnail), marquee klien (ikut arah scroll), Journey (CV), skills, CTA kontak + jejak stiker.
  Deep link: `work.html#tape/<slug>` membuka Viewer langsung (tanpa preloader) untuk video, gambar, maupun dokumen; `work.html#ch-01` membuka modal channel 1.
- `product.html` — layar "NO SIGNAL": MOTION — COMING SOON (CH 99 / Off Air).
- `next.html` — "Next Up": ide proyek yang bisa di-Join Waitlist, urut dari waitlist terbanyak.
  Halaman baru sengaja ada di root supaya semua path relatif (`assets/`, `css/`, `js/`) tetap jalan.
- `tools.html` — daftar Free Tools. Tiap tool satu halaman di `tools/`:
  - `tools/teleprompter.html` (+ `css/prompter.css`, `js/prompter.js`) — layar penuh, tanpa chrome situs.
  - `tools/bpm-frame.html` (`js/bpm.js`) — BPM ↔ frame: beat map, tap tempo, metronome (Web Audio, BGM dibisukan lewat event `bgm:hush`), clean-BPM.
  - `tools/timecode.html` (`js/timecode.js`) — frame ↔ timecode ↔ detik, drop-frame 29.97/59.94, retime & conform, durasi in/out.
  - Kalkulator berbagi `js/framecore.js` (daftar FPS + matematika timecode) dan `css/calc.css`.
    Area tool diberi `data-keep-brand` supaya klik di dalamnya tidak mengganti warna brand (theme.js).
    `sfx.js`/`bgm.js` mencari `assets/` relatif ke lokasi skripnya, jadi halaman di subfolder tetap bersuara.
- `js/data.js` — daftar proyek & media. Tambah/kurangi karya di sini.
- `js/media.js` — hasil generate: dimensi gambar + placeholder blur (LQIP). Regenerate dengan skrip sharp bila menambah gambar.
- `js/fluid.js` — simulasi fluid WebGL2 (efek liquid hover). Otomatis mati jika WebGL2 tidak ada atau `prefers-reduced-motion`.
- `js/main.js` — render channel, modal galeri TV, kursor kustom, grain CRT, preloader (sekali per sesi), pemasangan Wall + routing hash.
  Juga: chip kursor (`.cursor-chip`, desktop), headline `[data-react]` yang bereaksi ke kursor (huruf dekat kursor Barlow → VT323; kata dalam `<em>` kebalikannya; teks utuh tetap di `aria-label`), kartu PRIME TIME, jejak stiker di CTA, marquee klien, tombol dengan ikon yang pindah sisi.
- `js/fisheye.js` — **IHSAN.TV Wall / Globe**: dinding karya tak berujung dengan lensa fisheye per piksel (WebGL, satu pass:
  tiap piksel layar dipetakan balik `L = R/k · atanh(L'/R)` ke dunia datar lalu dicari tile-nya, jadi tepi tile,
  thumbnail, dan video ikut melengkung). Fallback Canvas 2D → grid statis.
  - Isi = `WALL` (video, gambar, dokumen). Lebar tile mengikuti rasio karya (9:16 … 2:1) dalam kelipatan sepertiga tile 9:16; dunia dibuat cukup besar supaya tiap item tampil sekali sebelum ada yang diulang, dan tetangga dari channel yang sama dihindari.
  - Thumbnail ada di ≤ 3 atlas 2048². Versi `-sm` dimuat dulu, lalu versi penuh; tile yang atlasnya belum datang memakai warna rata-ratanya (tidak pernah hitam).
  - Hover video memutar **cuplikan** `assets/video/snip/<slug>.mp4`; thumbnail baru diganti setelah frame video benar-benar ter-decode. Gambar & dokumen hanya membesar.
  - Konstanta yang bisa di-tuning ada di atas file: `GAP` (10), `K` (1.25), `CAP`, `DRIFT`, `FRICTION`. Geometri tile (`UNIT_REF`, `spanOf`) harus sama dengan `scripts/build-tapes.mjs`.
  - API: `Fisheye.mount(el, { tapes, atlas, variant: 'full'|'preview', onOpen(item), onHover(item|null) })` → `{ focus(slug), setFilter('all'|'v'|'x'), filter, setPaused(bool), destroy() }`.
- `js/viewer.js` — Viewer "channel zapping": video bersuara + teletext (↑/↓ tape, ←/→ / 1–8 channel), **gambar** dengan blur-up LQIP (←/→ = karya lain di channel yang sama), **dokumen** (sampul + tombol BUKA PDF). SALIN LINK, Back menutup.
- `js/tapes.js` — **hasil generate** (`scripts/build-tapes.mjs`), jangan diedit manual: `TAPES` (semua video, untuk Viewer), `WALL` (isi Globe), `WALL_ATLAS`.
- `js/chrome.js` — "TV chrome" untuk subpage: frame CRT barrel, kursor, grain, status nav saat scroll. Hanya dimuat di subpage (work.html tetap pakai main.js).
- `js/sfx.js`, `js/bgm.js` — SFX & BGM, dipakai semua halaman. State BGM di localStorage `ihsan.bgm`.
  Volume klik dihitung dari peak tiap file supaya semua klik setara: ubah `CLICK_PEAK_DB` (default −26 dBFS; hover ≈ −40) untuk mengeraskan/memelankan semuanya, atau `window.SFX_MASTER` (0…1). File SFX baru → ukur `ffmpeg -i file.mp3 -af volumedetect -f null -` dan isi `FILE_PEAK_DB`.
- `js/theme.js` — warna brand berganti tiap klik; juga menangkap `pagereveal` untuk transisi CRT antar halaman (`@view-transition` di `css/style.css`; Chrome/Edge/Safari, browser lain pindah halaman seperti biasa, `prefers-reduced-motion` mematikannya).
- `js/waitlist-data.js` — daftar ide Next Up (`id`, `title`, `type`, `price`, `desc`, `status`: voting | in_production | done, `seed`).
- `js/waitlist.js` — render & Join Waitlist. Semua akses data lewat objek `store` (`list`, `join`, `hasJoined`).
- `assets/img/*.webp` — gambar terkompresi (max 1100px, q80).
- `assets/video/*.mp4 + .webp` — video H.264 720p (CRF 26, faststart) + poster frame.
- `assets/cv/Muhammad-Ihsan-Rizka-CV.pdf` — tombol "Download full CV".

## Data Wall (`scripts/build-tapes.mjs`)
Dijalankan manual setiap video **atau gambar** ditambah/diubah (tidak saat deploy). Butuh `ffprobe`/`ffmpeg` di PATH
dan paket `sharp` (sudah ada di `node_modules` folder induk):
```
node scripts/build-tapes.mjs            # cuplikan yang sudah ada dilewati
node scripts/build-tapes.mjs --force    # encode ulang semua cuplikan
```
Yang ditulis:
- `js/tapes.js` — `TAPES` (semua video; rasio dari ffprobe, channel & label dari `js/data.js`), `WALL`, `WALL_ATLAS`.
- `assets/video/snip/<slug>.mp4 + .webp` — cuplikan 4–6 detik dari bagian paling ramai (360p, tanpa audio, ≤ 350 KB) + poster frame pertamanya (cukup terang: luminans rata-rata > 0,15). Dipakai hover Globe dan kartu PRIME TIME; Viewer tetap memakai file penuh.
- `assets/video/thumb/<slug>.webp` — thumbnail satuan video (strip channel & fallback).
- `assets/video/thumb/atlas-{0,1,2}.webp` (2048², tile tinggi 160px, badge jenis ▶ / ▣ / PDF di pojok) + `atlas-N-sm.webp` (1024²). Halaman 0 = featured + semua video + dokumen + gambar bergiliran per channel.
- `assets/img/trail/t<N>.webp` — stiker jejak kursor di CTA (daftar slug di `_trail` pada `scripts/tapes-meta.json`; latar putihnya dibuang).
- Grid fallback tanpa-JS di antara penanda `<!-- tapes:fallback -->` pada `work.html` & `index.html`.

Isi Globe (`WALL`) = semua video **kecuali** yang cocok `WALL_EXCLUDE` (sekarang `vinco-*`; Vinco tetap ada di channel 01 & Viewer — hapus aturan itu bila mau dikembalikan ke Globe) + semua gambar unik di `PROJECTS[].media` + dokumen PDF (sampulnya). Label gambar diambil dari `label` di `js/data.js` bila ada; kalau tidak, "judul channel + nomor". Urutan tampil memakai seed tetap dan menyebar tiap channel merata.
Metadata manual (klien, peran, tahun, `featured` = kandidat tile di tengah saat Wall dibuka) ada di `scripts/tapes-meta.json` — isi hanya yang pasti.

## Menambah karya baru
1. Kompres gambar ke WebP (max sisi panjang ~1100px) ke `assets/img/<slug>.webp`.
2. Tambahkan entri `<slug>: {w, h, lqip}` di `js/media.js` (atau regenerate).
3. Daftarkan di `js/data.js` pada channel yang sesuai (`{t:'i', s:'<slug>'}`; tambahkan `label:'...'` kalau karya itu punya nama).
4. Jalankan `node scripts/build-tapes.mjs` supaya masuk Globe (atlas dibuat ulang).
Video: transcode `ffmpeg -i in.mp4 -vf scale=-2:1280 -c:v libx264 -crf 26 -c:a aac -b:a 96k -movflags +faststart out.mp4`, buat poster `.webp`, daftarkan `{t:'v', s:'<slug>', label:'...'}`, lalu jalankan `node scripts/build-tapes.mjs` supaya masuk Wall.
Video > 8 MB sebaiknya di-encode ulang: `-preset slow -crf 29 -maxrate 1500k -bufsize 3000k`.

## Waitlist (Supabase — Fase 2)
- `js/supabase-config.js` — URL project + **publishable/anon key** (publik, aman di frontend).
  Jangan pernah taruh `service_role` / `sb_secret_…` di sini; `waitlist.js` menolak key seperti itu.
  Kosongkan keduanya → kembali ke mode demo lokal (localStorage).
- `supabase/waitlist.sql` — skema lengkap, aman dijalankan ulang: tabel `ideas` + `votes`
  (PK `idea_id, voter_id`), RLS aktif, publik hanya SELECT `ideas` + RPC `list_waitlist(voter_id)`
  dan `join_waitlist(idea_id, voter_id)`. Tabel `votes` tidak bisa dibaca/ditulis langsung.
- Menerapkan perubahan skema: `supabase db query --linked --project-ref <ref> -f supabase/waitlist.sql`
  (atau tempel di SQL Editor dashboard).
- Kelola ide lewat Table Editor tabel `ideas`: ubah `status` (voting / in_production / done),
  `sort` untuk urutan saat jumlah sama, `seed` untuk angka awal. Ide baru langsung tampil
  tanpa ubah kode. `js/waitlist-data.js` hanya dipakai mode demo lokal.
- `voter_id` = UUID acak per browser (`ihsan.waitlist.voter`). Satu browser satu vote per ide.
- Anti-spam: `join_waitlist` membatasi per IP — maks **5 vote per ide / 24 jam** dan **10 vote / jam**
  (konstanta `c_per_idea`, `c_idea_win`, `c_per_ip`, `c_ip_win` di `supabase/waitlist.sql`).
  IP diambil dari header Cloudflare `cf-connecting-ip` (tidak bisa dipalsukan klien) dan hanya
  disimpan sebagai hash SHA-256 bersalt (`votes.ip_hash`; salt di `private.config`, tidak terekspos API).
  Batasnya sengaja longgar karena banyak pengguna seluler berbagi IP (CGNAT).
