#!/usr/bin/env node
/* Generator data IHSAN.TV Wall — dijalankan sekali (bukan saat deploy):

     node scripts/build-tapes.mjs

   Membaca assets/video/*.mp4 (ffprobe) + js/media.js + js/data.js + scripts/tapes-meta.json,
   lalu menulis:
     js/tapes.js                          daftar tape ringan (dipakai index.html & work.html)
     assets/video/thumb/<slug>.webp       thumbnail satuan (tinggi 240px) untuk fallback grid
     assets/video/thumb/atlas.webp        texture atlas 2048² (tile tinggi 240px)
     assets/video/thumb/atlas-sm.webp     atlas 1024² (setengah ukuran, untuk preview index)
     blok <!-- tapes:fallback --> di work.html & index.html (grid statis tanpa JS)

   Butuh: ffprobe di PATH, paket `sharp` (node_modules di folder induk). */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VID = join(ROOT, 'assets/video');
const THUMB = join(VID, 'thumb');
mkdirSync(THUMB, { recursive: true });

/* ---------- channel + label from data.js ---------- */
const ctx = vm.createContext({});
const PROJECTS = vm.runInContext(
  readFileSync(join(ROOT, 'js/media.js'), 'utf8') + '\n' +
  readFileSync(join(ROOT, 'js/data.js'), 'utf8') + '\n;PROJECTS', ctx);
const where = new Map();
PROJECTS.forEach((p, i) => p.media.forEach((m) => {
  if (m.t === 'v' && !where.has(m.s)) where.set(m.s, { ch: i + 1, label: m.label });
}));

const meta = JSON.parse(readFileSync(join(ROOT, 'scripts/tapes-meta.json'), 'utf8'));

/* ---------- probe ---------- */
const ratioOf = (w, h) => {
  const r = w / h;
  return r < 0.65 ? '9:16' : r < 0.9 ? '4:5' : r < 1.25 ? '1:1' : '16:9';
};
const slugs = readdirSync(VID).filter((f) => f.endsWith('.mp4')).map((f) => f.slice(0, -4)).sort();
const tapes = [];
for (const s of slugs) {
  const w = where.get(s);
  if (!w) { console.warn(`skip ${s}: not in any channel of data.js`); continue; }
  const out = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height:format=duration', '-of', 'json', join(VID, `${s}.mp4`)], { encoding: 'utf8' });
  const j = JSON.parse(out);
  const { width, height } = j.streams[0];
  const m = meta[s] || {};
  tapes.push({
    s, r: ratioOf(width, height), ch: w.ch, label: w.label,
    client: m.client || '', role: m.role || [], year: m.year || '',
    d: Math.round(+j.format.duration), featured: !!m.featured,
  });
}

/* ---------- thumbs + atlas (shelf pack, every tile 240px tall) ---------- */
const TH = 240, PAD = 4, AW = 2048, AH = 2048;
let x = 0, y = 0;
const comps = [];
/* poster = first frame, often a black/blank slate. A dark or flat poster is
   swapped for a frame grabbed from inside the clip so the wall never shows a void. */
async function frameFor(t) {
  const poster = join(VID, `${t.s}.webp`);
  const st = await sharp(poster).stats();
  const mean = st.channels.slice(0, 3).reduce((a, c) => a + c.mean, 0) / 3;
  const dev = st.channels.slice(0, 3).reduce((a, c) => a + c.stdev, 0) / 3;
  if (mean > 28 && dev > 18) return poster;
  for (const at of [0.35, 0.55, 0.2, 0.75]) {
    const png = execFileSync('ffmpeg', ['-v', 'error', '-ss', String(t.d * at), '-i', join(VID, `${t.s}.mp4`),
      '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', '-'], { maxBuffer: 64 << 20 });
    const s2 = await sharp(png).stats();
    const m2 = s2.channels.slice(0, 3).reduce((a, c) => a + c.mean, 0) / 3;
    const d2 = s2.channels.slice(0, 3).reduce((a, c) => a + c.stdev, 0) / 3;
    if (m2 > 28 && d2 > 18) return png;
  }
  return poster;
}

for (const t of tapes) {
  const buf = await sharp(await frameFor(t)).resize({ height: TH }).toBuffer({ resolveWithObject: true });
  const tw = buf.info.width;
  const st = await sharp(buf.data).resize(1, 1, { fit: 'fill' }).raw().toBuffer();
  t.c = '#' + [...st.slice(0, 3)].map((v) => v.toString(16).padStart(2, '0')).join('');
  await sharp(buf.data).webp({ quality: 74 }).toFile(join(THUMB, `${t.s}.webp`));
  if (x + tw + PAD * 2 > AW) { x = 0; y += TH + PAD * 2; }
  if (y + TH + PAD * 2 > AH) throw new Error('atlas full — raise AH');
  // edge-extend padding so mipmaps never bleed a neighbour into the tile
  const padded = await sharp(buf.data)
    .extend({ top: PAD, bottom: PAD, left: PAD, right: PAD, extendWith: 'copy' }).toBuffer();
  comps.push({ input: padded, left: x, top: y });
  t.a = [x + PAD, y + PAD, tw, TH];
  x += tw + PAD * 2;
}
const atlas = await sharp({ create: { width: AW, height: AH, channels: 3, background: '#0a0a0c' } })
  .composite(comps).png().toBuffer();
await sharp(atlas).webp({ quality: 72 }).toFile(join(THUMB, 'atlas.webp'));
await sharp(atlas).resize(AW / 2, AH / 2).webp({ quality: 74 }).toFile(join(THUMB, 'atlas-sm.webp'));

/* ---------- js/tapes.js ---------- */
const CH = PROJECTS.map((p) => p.title);
const line = (t) => '  ' + JSON.stringify(t).replace(/"(\w+)":/g, '$1:')+ ',';
const js = `// GENERATED by scripts/build-tapes.mjs — jangan edit manual; ubah scripts/tapes-meta.json lalu jalankan ulang.
// s=slug, r=rasio, ch=nomor channel (1-based, urutan PROJECTS), d=durasi (detik), a=[x,y,w,h] di atlas 2048², c=warna rata-rata.
const TAPE_CHANNELS = ${JSON.stringify(CH)};
const TAPE_ATLAS = { src: 'assets/video/thumb/atlas.webp', srcSm: 'assets/video/thumb/atlas-sm.webp', w: ${AW}, h: ${AH} };
const TAPES = [
${tapes.map(line).join('\n')}
];
`;
writeFileSync(join(ROOT, 'js/tapes.js'), js);

/* ---------- static fallback grid (no JS) ---------- */
const pick = [...tapes.filter((t) => t.featured), ...tapes.filter((t) => !t.featured)].slice(0, 12);
const block = (href) => '<!-- tapes:fallback:start -->\n' +
  pick.map((t) => `        <a class="wall-fb-item" href="${href}${t.s}"><img src="assets/video/thumb/${t.s}.webp" alt="${t.label.replace(/"/g, '&quot;')}" loading="lazy"></a>`).join('\n') +
  '\n        <!-- tapes:fallback:end -->';
for (const [file, href] of [['work.html', '#tape/'], ['index.html', 'work.html#tape/']]) {
  const p = join(ROOT, file);
  const html = readFileSync(p, 'utf8');
  const re = /<!-- tapes:fallback:start -->[\s\S]*?<!-- tapes:fallback:end -->/;
  if (re.test(html)) writeFileSync(p, html.replace(re, block(href)));
}

console.log(`${tapes.length} tapes · ${tapes.filter((t) => t.featured).length} featured · atlas rows used: ${(y / (TH + PAD * 2) + 1) | 0}`);
