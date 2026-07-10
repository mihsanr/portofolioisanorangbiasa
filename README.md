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
- `index.html` — satu halaman: hero, Channel Guide (8 proyek), marquee klien, Journey (CV), skills, kontak.
- `js/data.js` — daftar proyek & media. Tambah/kurangi karya di sini.
- `js/media.js` — hasil generate: dimensi gambar + placeholder blur (LQIP). Regenerate dengan skrip sharp bila menambah gambar.
- `js/fluid.js` — simulasi fluid WebGL2 (efek liquid hover). Otomatis mati jika WebGL2 tidak ada atau `prefers-reduced-motion`.
- `js/main.js` — render channel, modal galeri TV, kursor kustom, grain CRT, jam OSD.
- `assets/img/*.webp` — gambar terkompresi (max 1100px, q80).
- `assets/video/*.mp4 + .webp` — video H.264 720p (CRF 26, faststart) + poster frame.
- `assets/cv/Muhammad-Ihsan-Rizka-CV.pdf` — tombol "Download full CV".

## Menambah karya baru
1. Kompres gambar ke WebP (max sisi panjang ~1100px) ke `assets/img/<slug>.webp`.
2. Tambahkan entri `<slug>: {w, h, lqip}` di `js/media.js` (atau regenerate).
3. Daftarkan di `js/data.js` pada channel yang sesuai (`{t:'i', s:'<slug>'}`).
Video: transcode `ffmpeg -i in.mp4 -vf scale=-2:1280 -c:v libx264 -crf 26 -c:a aac -b:a 96k -movflags +faststart out.mp4`, buat poster `.webp`, daftarkan `{t:'v', s:'<slug>', label:'...'}`.
