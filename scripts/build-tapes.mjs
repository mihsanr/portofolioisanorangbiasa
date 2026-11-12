#!/usr/bin/env node
/* Generator data IHSAN.TV — dijalankan manual (bukan saat deploy):

     node scripts/build-tapes.mjs            (snippet yang sudah ada dilewati)
     node scripts/build-tapes.mjs --force    (encode ulang semua snippet)

   Membaca assets/video/*.mp4 (ffprobe) + js/media.js + js/data.js + scripts/tapes-meta.json,
   lalu menulis:
     js/tapes.js                              TAPES (semua video, dipakai Viewer) + WALL (isi Globe) + WALL_ATLAS
     assets/video/snip/<slug>.mp4 + .webp     cuplikan 4–6 dtk tanpa audio (≤ 350 KB) + poster frame pertamanya
     assets/video/thumb/<slug>.webp           thumbnail satuan video (tinggi 240px) untuk strip channel & fallback
     assets/video/thumb/atlas-{0,1,2}.webp    atlas 2048² (tile tinggi 160px) · atlas-N-sm.webp = 1024²
     assets/img/trail/t<N>.webp               stiker kecil untuk jejak kursor di CTA footer
     blok <!-- tapes:fallback --> di work.html & index.html (grid statis tanpa JS)

   Isi Globe (WALL) = semua video KECUALI yang cocok WALL_EXCLUDE (Vinco) + semua gambar unik di
   PROJECTS[].media + dokumen PDF (sampulnya). Vinco tetap ada di TAPES → channel 01 & Viewer.

   Butuh: ffmpeg + ffprobe di PATH, paket `sharp` (node_modules di folder induk). */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, statSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VID = join(ROOT, 'assets/video');
const IMG = join(ROOT, 'assets/img');
const THUMB = join(VID, 'thumb');
const SNIP = join(VID, 'snip');
const TRAIL = join(IMG, 'trail');
for (const d of [THUMB, SNIP, TRAIL]) mkdirSync(d, { recursive: true });
const FORCE = process.argv.includes('--force');

/* Video yang TIDAK masuk Globe. Hapus aturan ini bila Vinco boleh kembali ke Globe. */
const WALL_EXCLUDE = (slug) => slug.startsWith('vinco-');

/* ---------- data.js ---------- */
const ctx = vm.createContext({});
const { PROJECTS, MEDIA } = vm.runInContext(
  readFileSync(join(ROOT, 'js/media.js'), 'utf8') + '\n' +
  readFileSync(join(ROOT, 'js/data.js'), 'utf8') + '\n;({ PROJECTS, MEDIA })', ctx);
const where = new Map();
PROJECTS.forEach((p, i) => p.media.forEach((m) => {
  if (m.t === 'v' && !where.has(m.s)) where.set(m.s, { ch: i + 1, label: m.label });
}));
const meta = JSON.parse(readFileSync(join(ROOT, 'scripts/tapes-meta.json'), 'utf8'));

function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rnd = mulberry(0x1415A7);
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

/* ---------- tile geometry — HARUS sama dengan js/fisheye.js ---------- */
const REF_TH = 150, GAP = 10, UNIT = (REF_TH * 9 / 16 + GAP) / 3; // lebar 1 sel = sepertiga tile 9:16
const R_MIN = 9 / 16, R_MAX = 2;
const clampR = (r) => Math.round(Math.min(R_MAX, Math.max(R_MIN, r)) * 100) / 100;
const spanOf = (r) => Math.max(3, Math.min(10, Math.round((r * REF_TH + GAP) / UNIT)));
const aspectOf = (n) => (n * UNIT - GAP) / REF_TH;

/* ---------- probe every video ---------- */
const ratioName = (w, h) => { const r = w / h; return r < 0.65 ? '9:16' : r < 0.9 ? '4:5' : r < 1.25 ? '1:1' : '16:9'; };
const slugs = readdirSync(VID).filter((f) => f.endsWith('.mp4')).map((f) => f.slice(0, -4)).sort();
const tapes = [];
for (const s of slugs) {
  const w = where.get(s);
  if (!w) { console.warn(`skip ${s}: not in any channel of data.js`); continue; }
  const j = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height:format=duration', '-of', 'json', join(VID, `${s}.mp4`)], { encoding: 'utf8' }));
  const { width, height } = j.streams[0];
  const m = meta[s] || {};
  tapes.push({
    s, r: ratioName(width, height), ch: w.ch, label: w.label,
    client: m.client || '', role: m.role || [], year: m.year || '',
    d: Math.round(+j.format.duration), featured: !!m.featured,
    _w: width, _h: height, _dur: +j.format.duration,
  });
}

/* ---------- frame quality ---------- */
const BRIGHT = 0.15 * 255; // luminans rata-rata minimum
async function quality(input) {
  const st = await sharp(input).stats();
  const mean = st.channels.slice(0, 3).reduce((a, c) => a + c.mean, 0) / 3;
  const dev = st.channels.slice(0, 3).reduce((a, c) => a + c.stdev, 0) / 3;
  return { mean, dev, ok: mean > BRIGHT && dev > 18 };
}
const grab = (file, at) => execFileSync('ffmpeg', ['-v', 'error', '-ss', String(at), '-i', file,
  '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', '-'], { maxBuffer: 64 << 20 });
/* poster = frame pertama, sering slate hitam/kosong → ambil frame lain yang cukup terang */
async function frameFor(t) {
  const poster = join(VID, `${t.s}.webp`);
  if (existsSync(poster) && (await quality(poster)).ok) return poster;
  let best = null, bm = -1;
  for (const at of [0.35, 0.55, 0.2, 0.75, 0.45, 0.65]) {
    const png = grab(join(VID, `${t.s}.mp4`), t._dur * at);
    const q = await quality(png);
    if (q.ok) return png;
    if (q.mean > bm) { bm = q.mean; best = png; }
  }
  return best || poster;
}

/* ---------- snippet: 4–6 detik dari bagian paling ramai ---------- */
const SNIP_LEN = 5, SNIP_MAX = 350 * 1024;
function analyse(file) {
  const FPS = 2, S = 32, px = S * S;
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-an',
    '-vf', `fps=${FPS},scale=${S}:${S},format=gray`, '-f', 'rawvideo', '-'], { maxBuffer: 512 << 20 });
  const n = Math.floor(raw.length / px);
  const mean = new Float32Array(n), dev = new Float32Array(n), diff = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0, s2 = 0, d = 0;
    for (let k = 0; k < px; k++) {
      const v = raw[i * px + k]; s += v; s2 += v * v;
      if (i) d += Math.abs(v - raw[(i - 1) * px + k]);
    }
    mean[i] = s / px; dev[i] = Math.sqrt(Math.max(0, s2 / px - mean[i] * mean[i])); diff[i] = d / px;
  }
  return { n, FPS, mean, dev, diff };
}
function pickStart(an, len) {
  const w = Math.round(len * an.FPS);
  if (an.n <= w + 1) return 0;
  let best = -1, bs = -Infinity;
  for (let i = 0; i + w < an.n; i++) {
    if (!(an.mean[i] > BRIGHT && an.dev[i] > 18)) continue; // frame pertama = poster → harus terang
    let s = 0;
    for (let k = 1; k <= w; k++) s += Math.min(an.diff[i + k], 22) - (an.mean[i + k] < 30 ? 8 : 0);
    if (s > bs + 1e-6) { bs = s; best = i; }
  }
  if (best < 0) { // tak ada frame yang lolos → frame paling terang
    let bm = -1;
    for (let i = 0; i + w < an.n; i++) if (an.mean[i] > bm) { bm = an.mean[i]; best = i; }
  }
  return Math.max(0, best) / an.FPS;
}
function encodeSnip(t, out) {
  const src = join(VID, `${t.s}.mp4`);
  const len0 = Math.min(SNIP_LEN, Math.max(1, t._dur - 0.1));
  const start = t._dur <= SNIP_LEN + 1 ? 0 : pickStart(analyse(src), SNIP_LEN);
  const scale = t._w < t._h ? 'scale=360:-2' : 'scale=-2:360';
  let size = 0, used = '';
  for (const [crf, len] of [[30, len0], [33, len0], [36, len0], [36, Math.min(4, len0)], [40, Math.min(4, len0)]]) {
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', start.toFixed(2), '-t', len.toFixed(2), '-i', src, '-an',
      '-vf', `${scale}:flags=lanczos,fps=24`, '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf),
      '-profile:v', 'main', '-pix_fmt', 'yuv420p', '-g', '48', '-movflags', '+faststart', out]);
    size = statSync(out).size; used = `crf${crf} ${len.toFixed(1)}s`;
    if (size <= SNIP_MAX) break;
  }
  return { start, size, used };
}

/* ---------- WALL items ---------- */
const wallVideos = tapes.filter((t) => !WALL_EXCLUDE(t.s));
const wall = [];
let snipBytes = 0, snipNew = 0;
for (const t of wallVideos) {
  const mp4 = join(SNIP, `${t.s}.mp4`), webp = join(SNIP, `${t.s}.webp`);
  const fresh = existsSync(mp4) && existsSync(webp) && statSync(mp4).mtimeMs >= statSync(join(VID, `${t.s}.mp4`)).mtimeMs;
  if (FORCE || !fresh) {
    const r = encodeSnip(t, mp4);
    await sharp(grab(mp4, 0)).webp({ quality: 76 }).toFile(webp);
    snipNew++;
    console.log(`snip ${t.s}: @${r.start.toFixed(1)}s ${r.used} ${(r.size / 1024) | 0} KB${r.size > SNIP_MAX ? '  ← OVER 350 KB' : ''}`);
  }
  snipBytes += statSync(mp4).size;
  const it = { s: t.s, k: 'v', ch: t.ch, label: t.label, r: clampR(t._w / t._h), d: t.d, _src: webp };
  if (t.client) it.client = t.client;
  if (t.featured) it.f = 1;
  wall.push(it);
}
const seenImg = new Set();
PROJECTS.forEach((p, i) => {
  let nr = 0;
  for (const m of p.media) {
    if (m.t === 'i') {
      const d = MEDIA[m.s];
      if (!d || seenImg.has(m.s)) continue;
      seenImg.add(m.s); nr++;
      // label dari data.js bila ada; kalau tidak: judul channel + nomor (nama klien TIDAK ditebak)
      wall.push({ s: m.s, k: 'i', ch: i + 1, label: m.label || `${p.title} ${nr}`, r: clampR(d.w / d.h), _src: join(IMG, `${m.s}.webp`) });
    } else if (m.t === 'd') {
      const d = MEDIA[m.cover];
      if (!d) { console.warn(`doc ${m.doc}: cover missing`); continue; }
      wall.push({ s: m.doc, k: 'd', ch: i + 1, label: m.label, r: clampR(d.w / d.h), n: m.pages, cv: m.cover, _src: join(IMG, `${m.cover}.webp`) });
    }
  }
});
{ // slug harus unik lintas jenis — dipakai untuk #tape/<slug>
  const seen = new Set();
  for (const it of wall) { if (seen.has(it.s)) throw new Error(`duplicate wall slug: ${it.s}`); seen.add(it.s); }
}

/* ---------- thumbnails satuan (video saja; strip channel & fallback) ---------- */
for (const t of tapes) {
  const snipPoster = join(SNIP, `${t.s}.webp`);
  const src = existsSync(snipPoster) && !WALL_EXCLUDE(t.s) ? snipPoster : await frameFor(t);
  const buf = await sharp(src).resize({ height: 240 }).toBuffer();
  const px = await sharp(buf).resize(1, 1, { fit: 'fill' }).raw().toBuffer();
  t.c = '#' + [...px.slice(0, 3)].map((v) => v.toString(16).padStart(2, '0')).join('');
  await sharp(buf).webp({ quality: 74 }).toFile(join(THUMB, `${t.s}.webp`));
}

/* ---------- atlas: 3 halaman 2048², tile tinggi 160px ---------- */
const TH = 160, PAD = 4, AW = 2048, AH = 2048, MAX_PAGES = 3;
/* badge jenis di pojok kiri-atas tile (ikut melengkung bersama tile) */
const PIX = { P: ['111', '101', '111', '100', '100'], D: ['110', '101', '101', '101', '110'], F: ['111', '100', '111', '100', '100'] };
function badge(kind) {
  const h = 19, u = 2.2;
  let w = 21, glyph = '';
  if (kind === 'v') glyph = '<path d="M7.5 5.2 L15.2 9.5 L7.5 13.8 Z" fill="#fff"/>';
  else if (kind === 'i') glyph = '<rect x="5.6" y="4.6" width="9.8" height="9.8" fill="none" stroke="#fff" stroke-width="1.5"/><rect x="8.3" y="7.3" width="4.4" height="4.4" fill="#fff"/>';
  else {
    w = 36;
    'PDF'.split('').forEach((ch, ci) => PIX[ch].forEach((row, ry) => [...row].forEach((b, rx) => {
      if (b === '1') glyph += `<rect x="${(5 + ci * 9.2 + rx * u).toFixed(1)}" y="${(4 + ry * u).toFixed(1)}" width="${u}" height="${u}" fill="#fff"/>`;
    })));
  }
  return { w, h, svg: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="3" fill="#000" fill-opacity="0.66"/>${glyph}</svg>`) };
}
const BADGE = { v: badge('v'), i: badge('i'), d: badge('d') };

// urutan isi halaman: featured → video lain → dokumen → gambar bergiliran per channel (halaman 0 = dimuat pertama)
const vids = wall.filter((it) => it.k === 'v');
const byCh = new Map();
wall.filter((it) => it.k === 'i').forEach((it) => { if (!byCh.has(it.ch)) byCh.set(it.ch, []); byCh.get(it.ch).push(it); });
const queues = [...byCh.values()].map((l) => shuffle(l.slice()));
const rr = [];
while (queues.some((q) => q.length)) for (const q of queues) if (q.length) rr.push(q.shift());
const packOrder = [...vids.filter((it) => it.f), ...vids.filter((it) => !it.f), ...wall.filter((it) => it.k === 'd'), ...rr];

const pages = [{ comps: [] }];
let x = 0, y = 0;
for (const it of packOrder) {
  const n = spanOf(it.r);
  const tw = Math.round(TH * aspectOf(n));
  const tile = await sharp(it._src).resize(tw, TH, { fit: 'cover', position: 'centre' }).removeAlpha().toBuffer();
  const px = await sharp(tile).resize(1, 1, { fit: 'fill' }).raw().toBuffer();
  it.c = '#' + [...px.slice(0, 3)].map((v) => v.toString(16).padStart(2, '0')).join('');
  if (x + tw + PAD * 2 > AW) { x = 0; y += TH + PAD * 2; }
  if (y + TH + PAD * 2 > AH) { pages.push({ comps: [] }); x = 0; y = 0; }
  if (pages.length > MAX_PAGES) throw new Error('atlas full — kurangi TH/PAD atau naikkan MAX_PAGES (dan sampler di fisheye.js)');
  const b = BADGE[it.k];
  // edge-extend padding so mipmaps never bleed a neighbour into the tile
  const padded = await sharp(tile).composite([{ input: b.svg, left: 7, top: 7 }]).png().toBuffer()
    .then((buf) => sharp(buf).extend({ top: PAD, bottom: PAD, left: PAD, right: PAD, extendWith: 'copy' }).toBuffer());
  pages[pages.length - 1].comps.push({ input: padded, left: x, top: y });
  it.p = pages.length - 1;
  it.a = [x + PAD, y + PAD, tw, TH];
  x += tw + PAD * 2;
}
for (const f of ['atlas.webp', 'atlas-sm.webp']) rmSync(join(THUMB, f), { force: true }); // atlas lama (1 halaman)
let atlasBytes = 0;
const atlasHash = createHash('sha1');   // tile positions move whenever work is added: the URL must change with them
for (let p = 0; p < pages.length; p++) {
  const png = await sharp({ create: { width: AW, height: AH, channels: 3, background: '#0a0a0c' } })
    .composite(pages[p].comps).png().toBuffer();
  await sharp(png).webp({ quality: 72 }).toFile(join(THUMB, `atlas-${p}.webp`));
  await sharp(png).resize(AW / 2, AH / 2).webp({ quality: 74 }).toFile(join(THUMB, `atlas-${p}-sm.webp`));
  atlasBytes += statSync(join(THUMB, `atlas-${p}.webp`)).size;
  atlasHash.update(readFileSync(join(THUMB, `atlas-${p}.webp`)));
}
const ATLAS_V = atlasHash.digest('hex').slice(0, 8);

/* ---------- urutan tampil: aliran per channel digabung merata (seed tetap) ----------
   Tiap channel disebar rata sepanjang urutan (kunci = (i + offset) / n), jadi 147 feed
   tidak bergerombol dan video (±1 dari 7 tile) ikut tersebar. fisheye.js lalu menaruh
   item sesuai urutan ini sambil menghindari tetangga dari channel yang sama. */
const groups = new Map();
wall.forEach((it) => { if (!groups.has(it.ch)) groups.set(it.ch, []); groups.get(it.ch).push(it); });
for (const list of groups.values()) {
  shuffle(list);
  const off = rnd();
  list.forEach((it, i) => { it._key = (i + off) / list.length; });
}
wall.sort((a, b) => a._key - b._key);

/* ---------- js/tapes.js ---------- */
const CH = PROJECTS.map((p) => p.title);
const strip = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => k[0] !== '_'));
const line = (t) => '  ' + JSON.stringify(strip(t)).replace(/"(\w+)":/g, '$1:') + ',';
const js = `// GENERATED by scripts/build-tapes.mjs — jangan edit manual; ubah scripts/tapes-meta.json / js/data.js lalu jalankan ulang.
// TAPES = semua video (Viewer). s=slug, r=rasio, ch=nomor channel (1-based, urutan PROJECTS), d=durasi (detik), c=warna rata-rata.
// WALL  = isi Globe, sudah dalam urutan tampil. k: 'v' video | 'i' gambar | 'd' dokumen · r=rasio w/h (9:16…2:1)
//         p=halaman atlas · a=[x,y,w,h] di halaman itu · c=warna rata-rata · f=featured · n=jumlah halaman PDF · cv=slug sampul PDF.
const TAPE_CHANNELS = ${JSON.stringify(CH)};
const TAPES = [
${tapes.map(line).join('\n')}
];
const WALL_ATLAS = { w: ${AW}, h: ${AH}, pages: [${pages.map((_, p) => `'assets/video/thumb/atlas-${p}.webp?v=${ATLAS_V}'`).join(', ')}], pagesSm: [${pages.map((_, p) => `'assets/video/thumb/atlas-${p}-sm.webp?v=${ATLAS_V}'`).join(', ')}] };
const WALL = [
${wall.map(line).join('\n')}
];
`;
writeFileSync(join(ROOT, 'js/tapes.js'), js);

/* ---------- static fallback grid (no JS): 6 video + 6 gambar ---------- */
const thumbOf = (it) => it.k === 'v' ? `assets/video/thumb/${it.s}.webp` : `assets/img/${it.k === 'd' ? it.cv : it.s}.webp`;
const pick = [
  ...[...vids.filter((it) => it.f), ...vids.filter((it) => !it.f)].slice(0, 6),
  ...rr.slice(0, 6),
];
const block = (href) => '<!-- tapes:fallback:start -->\n' +
  pick.map((it) => `        <a class="wall-fb-item" href="${href}${it.s}"><img src="${thumbOf(it)}" alt="${it.label.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}" loading="lazy"></a>`).join('\n') +
  '\n        <!-- tapes:fallback:end -->';
for (const [file, href] of [['work.html', '#tape/'], ['index.html', 'work.html#tape/']]) {
  const p = join(ROOT, file);
  const html = readFileSync(p, 'utf8');
  const re = /<!-- tapes:fallback:start -->[\s\S]*?<!-- tapes:fallback:end -->/;
  if (re.test(html)) writeFileSync(p, html.replace(re, block(href)));
}

/* ---------- stiker jejak kursor (CTA footer): latar putih dibuang dari tepi ---------- */
const trail = (meta._trail || []).filter((s) => existsSync(join(IMG, `${s}.webp`)));
for (let i = 0; i < trail.length; i++) {
  const { data, info } = await sharp(join(IMG, `${trail[i]}.webp`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const white = (o) => data[o] > 236 && data[o + 1] > 236 && data[o + 2] > 236;
  const seen = new Uint8Array(W * H), stack = [];
  const push = (px, py) => { const k = py * W + px; if (!seen[k] && white(k * 4)) { seen[k] = 1; stack.push(k); } };
  for (let px = 0; px < W; px++) { push(px, 0); push(px, H - 1); }
  for (let py = 0; py < H; py++) { push(0, py); push(W - 1, py); }
  while (stack.length) {
    const k = stack.pop(); data[k * 4 + 3] = 0;
    const px = k % W, py = (k / W) | 0;
    if (px) push(px - 1, py); if (px < W - 1) push(px + 1, py);
    if (py) push(px, py - 1); if (py < H - 1) push(px, py + 1);
  }
  await sharp(data, { raw: { width: W, height: H, channels: 4 } }).trim()
    .resize(220, 220, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82, alphaQuality: 90 })
    .toFile(join(TRAIL, `t${i + 1}.webp`));
}

const count = (k) => wall.filter((it) => it.k === k).length;
console.log(`${tapes.length} tapes (${tapes.filter((t) => t.featured).length} featured) · WALL ${wall.length} = ${count('v')} video + ${count('i')} gambar + ${count('d')} dokumen`);
console.log(`atlas ${pages.length} halaman (${pages.map((p) => p.comps.length).join(' + ')} tile) ${(atlasBytes / 1024) | 0} KB · snippet ${snipNew} baru, total ${(snipBytes / 1048576).toFixed(1)} MB · stiker ${trail.length}`);
