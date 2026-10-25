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
- `index.html` — halaman utama: hero, Channel Guide (8 proyek), marquee klien, Journey (CV), skills, kontak.
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
- `js/main.js` — render channel, modal galeri TV, kursor kustom, grain CRT, jam OSD.
- `js/chrome.js` — "TV chrome" untuk subpage: frame CRT barrel, kursor, grain, status nav saat scroll. Hanya dimuat di subpage (index tetap pakai main.js).
- `js/sfx.js`, `js/bgm.js` — SFX & BGM, dipakai semua halaman. State BGM di localStorage `ihsan.bgm`.
- `js/waitlist-data.js` — daftar ide Next Up (`id`, `title`, `type`, `price`, `desc`, `status`: voting | in_production | done, `seed`).
- `js/waitlist.js` — render & Join Waitlist. Semua akses data lewat objek `store` (`list`, `join`, `hasJoined`).
- `assets/img/*.webp` — gambar terkompresi (max 1100px, q80).
- `assets/video/*.mp4 + .webp` — video H.264 720p (CRF 26, faststart) + poster frame.
- `assets/cv/Muhammad-Ihsan-Rizka-CV.pdf` — tombol "Download full CV".

## Menambah karya baru
1. Kompres gambar ke WebP (max sisi panjang ~1100px) ke `assets/img/<slug>.webp`.
2. Tambahkan entri `<slug>: {w, h, lqip}` di `js/media.js` (atau regenerate).
3. Daftarkan di `js/data.js` pada channel yang sesuai (`{t:'i', s:'<slug>'}`).
Video: transcode `ffmpeg -i in.mp4 -vf scale=-2:1280 -c:v libx264 -crf 26 -c:a aac -b:a 96k -movflags +faststart out.mp4`, buat poster `.webp`, daftarkan `{t:'v', s:'<slug>', label:'...'}`.

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
