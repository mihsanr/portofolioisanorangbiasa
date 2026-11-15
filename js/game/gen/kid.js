import * as THREE from 'three';
import { loft, spline, part, merge, mirrorX, smooth, clamp01 } from './build.js';
import { BONE, L2R, shoe, hand } from './rig.js';
import { withSurfaceNoise } from '../shaders/surface.js';

/* Karakter kedua: bocah botak bersinglet merah berhuruf G, celana pendek putih bergaris merah, sneakers.
   Rancangan wajah dan kepala orisinal. Memakai kerangka yang sama dengan si kepala TV, jadi animasinya identik.
   Seluruh karakter = SATU SkinnedMesh dan satu material: warna datang dari warna vertex, sedangkan wajah dan
   singlet (garis leher, lubang lengan, huruf G) datang dari atlas kecil yang digambar di canvas, supaya
   tepinya halus. Ekspresi diganti dengan menggeser UV wajah lewat
   satu uniform — tidak ada tekstur yang diunggah ulang saat berkedip. */
const B = BONE;
const SKIN = '#e7aa7b', RED = '#c61f2c', WHITE = '#f3f1ec', SHADE = '#5a3526';
const KID_SHOE = { sole: '#f6f5f2', outsole: '#55565c', shoe: '#f4f3f0', tongue: '#c9ccd3', side: RED, accent: RED, lace: '#ffffff' };

/* atlas: 4 petak wajah (256 px) + 1 petak putih polos (untuk bagian berwarna vertex) + 1 petak singlet
   (badan dibentangkan: u = keliling mulai dari tengah punggung, v = tinggi) */
const TILE = 256, TILES = 6, AW = TILE * TILES;
const TY0 = 0.585, TY1 = 1.085;                           // rentang tinggi badan pada petak singlet
const UV_WHITE = [(TILE * 4 + TILE / 2) / AW, 1 - 60 / TILE];
const HEAD = { c: [0, 1.285, 0.012], r: [0.212, 0.222, 0.208], cap: 64 * Math.PI / 180 };

/* ——— wajah (canvas) ——— */
const K = (TILE / 2) / Math.sin(HEAD.cap);               // piksel per satuan sin(sudut)
const fx = (deg) => TILE / 2 + K * Math.sin(deg * Math.PI / 180);
const fy = (deg) => TILE / 2 - K * Math.sin(deg * Math.PI / 180);

function drawEye(g, cx, cy, mode) {
  g.save(); g.translate(cx, cy);
  if (mode === 'closed') {
    g.strokeStyle = '#2b1a12'; g.lineWidth = 5.5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-26, 7); g.quadraticCurveTo(0, -19, 26, 7); g.stroke();
  } else if (mode === 'dizzy') {
    g.strokeStyle = '#2b1a12'; g.lineWidth = 4; g.lineCap = 'round';
    g.beginPath();
    for (let i = 0; i <= 60; i++) { const t = i / 60, a = t * Math.PI * 4.6, r = 2 + t * 23; const x = Math.cos(a) * r, y = Math.sin(a) * r; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.stroke();
  } else {
    const wide = mode === 'wow', rx = wide ? 30 : 28, ry = wide ? 38 : 35;
    g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, 6.2832); g.fill();
    g.save(); g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, 6.2832); g.clip();
    g.fillStyle = '#4b2b17'; g.beginPath(); g.arc(0, 3, wide ? 14 : 20, 0, 6.2832); g.fill();
    g.fillStyle = '#0c0705'; g.beginPath(); g.arc(0, 3, wide ? 8 : 12, 0, 6.2832); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(-7, -6, wide ? 4.5 : 6, 0, 6.2832); g.fill();
    g.restore();
    g.strokeStyle = '#2b1a12'; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.ellipse(0, 0, rx, ry, 0, Math.PI * 1.08, Math.PI * 1.92); g.stroke();
  }
  g.restore();
}

function drawFace(g, ox, kind) {
  g.save(); g.translate(ox, 0);
  g.fillStyle = SKIN; g.fillRect(0, 0, TILE, TILE);
  /* pipi merona */
  for (const s of [-1, 1]) {
    const x = fx(s * 37), y = fy(-17), gr = g.createRadialGradient(x, y, 2, x, y, 27);
    gr.addColorStop(0, 'rgba(232,104,84,0.38)'); gr.addColorStop(1, 'rgba(232,104,84,0)');
    g.fillStyle = gr; g.fillRect(x - 28, y - 28, 56, 56);
  }
  /* alis */
  g.strokeStyle = '#2b1a12'; g.lineWidth = 6; g.lineCap = 'round';
  for (const s of [-1, 1]) {
    const x = fx(s * 24), y = fy(kind === 'wow' ? 33 : 29);
    g.beginPath(); g.moveTo(x - s * 22, y + 6); g.quadraticCurveTo(x, y - 8, x + s * 20, y + 2); g.stroke();
  }
  const eye = kind === 'blink' ? 'closed' : kind === 'dizzy' ? 'dizzy' : kind === 'wow' ? 'wow' : 'open';
  drawEye(g, fx(-24), fy(5), eye); drawEye(g, fx(24), fy(5), eye);
  /* bayangan kecil di bawah hidung (hidungnya sendiri geometri 3D) */
  g.strokeStyle = 'rgba(150,88,52,0.5)'; g.lineWidth = 3;
  g.beginPath(); g.arc(fx(0), fy(-11), 8, 0.25 * Math.PI, 0.75 * Math.PI); g.stroke();
  /* mulut */
  const mx = fx(0), my = fy(-27);
  if (kind === 'wow') {
    g.fillStyle = '#6d1a1c'; g.strokeStyle = '#3a1410'; g.lineWidth = 3;
    g.beginPath(); g.ellipse(mx, my + 10, 18, 24, 0, 0, 6.2832); g.fill(); g.stroke();
    g.fillStyle = '#e6737b'; g.beginPath(); g.ellipse(mx, my + 24, 11, 8, 0, 0, 6.2832); g.fill();
  } else if (kind === 'dizzy') {
    g.strokeStyle = '#3a1410'; g.lineWidth = 4.5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(mx - 26, my + 6);
    for (let i = 1; i <= 6; i++) g.lineTo(mx - 26 + i * 8.7, my + 6 + (i % 2 ? -6 : 6));
    g.stroke();
  } else {
    const path = () => { g.beginPath(); g.moveTo(mx - 46, my - 3); g.quadraticCurveTo(mx, my + 8, mx + 46, my - 3); g.quadraticCurveTo(mx + 36, my + 42, mx, my + 43); g.quadraticCurveTo(mx - 36, my + 42, mx - 46, my - 3); g.closePath(); };
    path(); g.fillStyle = '#6d1a1c'; g.fill();
    g.save(); path(); g.clip();
    g.fillStyle = '#e6737b'; g.beginPath(); g.ellipse(mx, my + 41, 24, 14, 0, 0, 6.2832); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(mx - 50, my - 7); g.quadraticCurveTo(mx, my + 6, mx + 50, my - 7); g.lineTo(mx + 50, my + 8); g.quadraticCurveTo(mx, my + 20, mx - 50, my + 8); g.closePath(); g.fill();
    g.restore();
    path(); g.strokeStyle = '#3a1410'; g.lineWidth = 3; g.lineJoin = 'round'; g.stroke();
  }
  g.restore();
}

/* Petak singlet. x: 0 dan 256 = tengah punggung, 64 dan 192 = sisi badan, 128 = tengah dada.
   Satu piksel mendatar ±1,78x lebih lebar daripada tegak di permukaan badan. */
function drawTorso(g, ox) {
  const py = (y) => (TY1 - y) / (TY1 - TY0) * TILE, DARK = '#9b1521';
  g.save(); g.translate(ox, 0);
  g.beginPath(); g.rect(-8, 0, TILE + 8, TILE); g.clip();
  g.fillStyle = SKIN; g.fillRect(-8, 0, TILE + 8, TILE);
  g.fillStyle = RED; g.fillRect(-8, py(1.03), TILE + 8, TILE);
  const holes = [
    [64, py(0.95), 22, py(0.905) - py(0.95)], [192, py(0.95), 22, py(0.905) - py(0.95)],     // lubang lengan
    [128, py(1.06), 28, py(0.945) - py(1.06)],                                                // garis leher depan
    [0, py(1.06), 26, py(0.972) - py(1.06)], [256, py(1.06), 26, py(0.972) - py(1.06)],       // garis leher belakang
  ];
  g.fillStyle = SKIN;
  holes.forEach(([x, y, rx, ry]) => { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 6.2832); g.fill(); });
  g.fillRect(-8, 0, TILE + 8, py(1.03));
  g.strokeStyle = DARK; g.lineWidth = 3;                    // bisban di tepi leher & lengan
  holes.forEach(([x, y, rx, ry]) => { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 6.2832); g.stroke(); });
  g.fillStyle = SKIN; g.fillRect(-8, 0, TILE + 8, py(1.03) - 1.5);
  g.fillStyle = DARK; g.fillRect(-8, py(0.612), TILE + 8, 3);                                 // kelim bawah
  g.fillStyle = '#571317'; g.fillRect(-8, py(0.598), TILE + 8, TILE);
  g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '900 64px "Arial Black", "Barlow Condensed", Impact, sans-serif';
  g.save(); g.translate(128, py(0.852)); g.scale(1 / 1.78, 1); g.fillText('G', 0, 0); g.restore();
  g.restore();
}

let atlas = null;
function getAtlas() {
  if (atlas) return atlas;
  const cv = document.createElement('canvas'); cv.width = AW; cv.height = TILE;
  const g = cv.getContext('2d');
  ['happy', 'blink', 'wow', 'dizzy'].forEach((k, i) => drawFace(g, i * TILE, k));     // urutan = FACE di crt-screen.js
  g.fillStyle = '#ffffff'; g.fillRect(TILE * 4, 0, TILE, TILE);
  drawTorso(g, TILE * 5);
  atlas = new THREE.CanvasTexture(cv);
  atlas.colorSpace = THREE.SRGBColorSpace; atlas.anisotropy = 4;
  return atlas;
}

/* ——— geometri ——— */
const setUV = (geo, u, v) => { const n = geo.attributes.position.count, a = new Float32Array(n * 2); for (let i = 0; i < n; i++) { a[i * 2] = u; a[i * 2 + 1] = v; } geo.setAttribute('uv', new THREE.BufferAttribute(a, 2)); return geo; };
const plain = (geo) => setUV(geo, UV_WHITE[0], UV_WHITE[1]);

const TORSO = [
  { c: [0, 0.585, 0], rx: 0.118, rz: 0.098, ao: 0.55, col: SHADE },
  { c: [0, 0.600, 0], rx: 0.150, rz: 0.124, ao: 0.9 },
  { c: [0, 0.680, 0.004], rx: 0.154, rz: 0.131 },
  { c: [0, 0.780, 0.004], rx: 0.150, rz: 0.124 },
  { c: [0, 0.880, 0.002], rx: 0.150, rz: 0.116 },
  { c: [0, 0.950, 0], rx: 0.148, rz: 0.106 },
  { c: [0, 0.995, 0], rx: 0.132, rz: 0.094 },
  { c: [0, 1.030, 0], rx: 0.074, rz: 0.070, ao: 0.85 },
  { c: [0, 1.085, 0], rx: 0.056, rz: 0.056, ao: 0.7 },
].map((k) => ({ e: 2.3, ...k }));
const PELVIS = [
  { c: [0, 0.73, 0], rx: 0.09, rz: 0.08 }, { c: [0, 0.70, 0], rx: 0.140, rz: 0.112 }, { c: [0, 0.64, 0], rx: 0.144, rz: 0.116, ao: 0.85 },
  { c: [0, 0.60, 0], rx: 0.146, rz: 0.118, ao: 0.8 }, { c: [0, 0.572, 0], rx: 0.115, rz: 0.10, ao: 0.7 }, { c: [0, 0.555, 0], rx: 0.04, rz: 0.04, ao: 0.6 },
];
const ARM = [
  { c: [0.158, 1.030, 0], rx: 0.028, rz: 0.030, ao: 0.85 },
  { c: [0.172, 1.008, 0], rx: 0.048, rz: 0.050 },
  { c: [0.188, 0.960, 0], rx: 0.054, rz: 0.056 },
  { c: [0.206, 0.870, 0], rx: 0.048, rz: 0.050 },
  { c: [0.224, 0.780, 0], rx: 0.043, rz: 0.044 },
  { c: [0.236, 0.690, 0.004], rx: 0.043, rz: 0.044 },
  { c: [0.243, 0.610, 0.006], rx: 0.037, rz: 0.038 },
  { c: [0.246, 0.565, 0.006], rx: 0.032, rz: 0.033 },
  { c: [0.246, 0.545, 0.006], rx: 0.026, rz: 0.027, ao: 0.8 },
];
const SHORT = [
  { c: [0.090, 0.715, 0], rx: 0.055, rz: 0.065, ao: 0.6 },
  { c: [0.093, 0.660, 0], rx: 0.092, rz: 0.100 },
  { c: [0.096, 0.580, 0], rx: 0.094, rz: 0.100 },
  { c: [0.099, 0.500, 0.003], rx: 0.092, rz: 0.096 },
  { c: [0.101, 0.452, 0.004], rx: 0.093, rz: 0.097, col: RED },
  { c: [0.101, 0.438, 0.004], rx: 0.089, rz: 0.093, col: RED },
  { c: [0.101, 0.446, 0.004], rx: 0.060, rz: 0.064, ao: 0.4, col: SHADE },
];
const LEG = [
  { c: [0.098, 0.500, 0.003], rx: 0.050, rz: 0.054, ao: 0.5 },
  { c: [0.100, 0.450, 0.004], rx: 0.058, rz: 0.062, ao: 0.62 },
  { c: [0.100, 0.400, 0.008], rx: 0.055, rz: 0.058 },
  { c: [0.100, 0.320, -0.004], rx: 0.055, rz: 0.062 },
  { c: [0.100, 0.240, -0.006], rx: 0.047, rz: 0.050 },
  { c: [0.100, 0.180, -0.006], rx: 0.040, rz: 0.042 },
  { c: [0.100, 0.130, -0.006], rx: 0.036, rz: 0.038, ao: 0.7 },
];
const SOCK = [
  { c: [0.100, 0.196, -0.006], rx: 0.040, rz: 0.042, ao: 0.85 }, { c: [0.100, 0.186, -0.006], rx: 0.047, rz: 0.049 },
  { c: [0.100, 0.150, -0.006], rx: 0.047, rz: 0.049 }, { c: [0.100, 0.128, -0.006], rx: 0.040, rz: 0.042, ao: 0.7 },
];

const torsoAt = (rings, y) => {
  for (let i = 0; i < rings.length - 1; i++) {
    const a = rings[i], b = rings[i + 1];
    if (y >= a.c[1] && y <= b.c[1]) { const t = (y - a.c[1]) / (b.c[1] - a.c[1] || 1); return { rx: a.rx + (b.rx - a.rx) * t, rz: a.rz + (b.rz - a.rz) * t, cz: a.c[2] + (b.c[2] - a.c[2]) * t, e: a.e }; }
  }
  return rings[rings.length - 1];
};

/* arah satuan -> titik di permukaan kepala (dagu sedikit menyempit) */
function headPoint(dx, dy, dz, lift, out) {
  const chin = smooth((-dy - 0.12) / 0.88);
  out[0] = HEAD.c[0] + dx * HEAD.r[0] * lift * (1 - 0.17 * chin);
  out[1] = HEAD.c[1] + dy * HEAD.r[1] * lift;
  out[2] = HEAD.c[2] + dz * HEAD.r[2] * lift * (1 - 0.05 * chin);
  return out;
}

/* bola/tudung bola dengan sumbu Z (kutub depan = tengah wajah). face = true -> hanya tudung depan ber-UV wajah */
function headShell(face) {
  const nt = face ? 9 : 18, np = 28, tMax = face ? HEAD.cap : Math.PI, lift = face ? 1.009 : 1;
  const pos = [], col = [], uv = [], idx = [], p = [0, 0, 0], c = new THREE.Color(face ? '#ffffff' : SKIN);
  for (let i = 0; i <= nt; i++) for (let j = 0; j < np; j++) {
    const th = tMax * i / nt, ph = j / np * Math.PI * 2, st = Math.sin(th);
    const dx = st * Math.cos(ph), dy = st * Math.sin(ph), dz = Math.cos(th);
    headPoint(dx, dy, dz, lift, p);
    pos.push(p[0], p[1], p[2]);
    const ao = face ? 1 : 0.8 + 0.2 * smooth((dy + 0.95) / 0.55);
    col.push(c.r * ao, c.g * ao, c.b * ao);
    /* UV wajah: proyeksi tegak lurus dari depan */
    if (face) uv.push((0.5 + dx / Math.sin(HEAD.cap) * 0.5) / TILES, 0.5 + dy / Math.sin(HEAD.cap) * 0.5);
    else uv.push(UV_WHITE[0], UV_WHITE[1]);
  }
  for (let i = 0; i < nt; i++) for (let j = 0; j < np; j++) {
    const a = i * np + j, b = i * np + (j + 1) % np, d = (i + 1) * np + j, e = (i + 1) * np + (j + 1) % np;
    if (i > 0) idx.push(a, b, d);
    idx.push(b, e, d);
  }
  const g = new THREE.BufferGeometry();
  g.setIndex(idx);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  /* pastikan menghadap keluar */
  const n = g.attributes.normal;
  if ((n.getX(np) * (pos[np * 3] - HEAD.c[0]) + n.getY(np) * (pos[np * 3 + 1] - HEAD.c[1]) + n.getZ(np) * (pos[np * 3 + 2] - HEAD.c[2])) < 0) {
    for (let t = 0; t < idx.length; t += 3) { const x = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = x; }
    g.setIndex(idx); g.computeVertexNormals();
  }
  const cnt = pos.length / 3, si = new Uint16Array(cnt * 4), sw = new Float32Array(cnt * 4);
  for (let i = 0; i < cnt; i++) { si[i * 4] = B.head; sw[i * 4] = 1; }
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  return g;
}

/* Badan: kulit tabung dari cincin profil, dengan UV ke petak singlet. Kolom sambungan (tengah punggung)
   diduplikasi supaya tekstur tidak tertarik melintang. */
function torsoShell(rings) {
  const n = 40, R = rings.length, pos = [], col = [], uv = [], idx = [];
  for (let i = 0; i < R; i++) {
    const r = rings[i], p = 2 / (r.e ?? 2), ao = r.ao ?? 1;
    for (let j = 0; j <= n; j++) {
      const a = -Math.PI / 2 + j / n * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      pos.push(r.c[0] + Math.sign(ca) * Math.pow(Math.abs(ca), p) * r.rx, r.c[1], r.c[2] + Math.sign(sa) * Math.pow(Math.abs(sa), p) * r.rz);
      col.push(ao, ao, ao);
      uv.push((TILE * 5 + 0.75 + (1 - j / n) * (TILE - 1.5)) / AW, clamp01((r.c[1] - TY0) / (TY1 - TY0)));
    }
  }
  for (let i = 0; i < R - 1; i++) for (let j = 0; j < n; j++) { const a = i * (n + 1) + j, b = a + 1, c = a + n + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setIndex(idx);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  /* normal di kedua sisi sambungan disamakan supaya tidak ada garis bayangan di punggung */
  const nr = g.attributes.normal;
  for (let i = 0; i < R; i++) {
    const a = i * (n + 1), b = a + n;
    const x = nr.getX(a) + nr.getX(b), y = nr.getY(a) + nr.getY(b), z = nr.getZ(a) + nr.getZ(b), l = Math.hypot(x, y, z) || 1;
    nr.setXYZ(a, x / l, y / l, z / l); nr.setXYZ(b, x / l, y / l, z / l);
  }
  const cnt = pos.length / 3, si = new Uint16Array(cnt * 4), sw = new Float32Array(cnt * 4);
  for (let i = 0; i < cnt; i++) { const w = smooth((pos[i * 3 + 1] - 0.76) / 0.18); si[i * 4] = B.hips; sw[i * 4] = 1 - w; si[i * 4 + 1] = B.chest; sw[i * 4 + 1] = w; }
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  return g;
}

let cache = null;
export function getKidGeometry() {
  if (cache) return cache;
  const P = [];
  const torso = spline(TORSO, 4);
  P.push(torsoShell(torso));
  P.push(plain(loft(spline(PELVIS, 3), 22, { color: WHITE, skinFn: () => [[B.hips, 1]] })));
  P.push(headShell(false), headShell(true));
  /* telinga + hidung */
  const earAO = (x) => 0.78 + 0.22 * smooth((Math.abs(x) - 0.2) / 0.03);
  for (const s of [-1, 1]) P.push(plain(part(new THREE.SphereGeometry(1, 12, 8), SKIN, { p: [s * 0.213, 1.27, -0.004], r: [0, s * 0.35, 0], s: [0.027, 0.056, 0.04], bone: B.head, ao: earAO })));
  P.push(plain(part(new THREE.SphereGeometry(1, 12, 8), SKIN, { p: [0, 1.262, 0.222], s: [0.024, 0.019, 0.021], bone: B.head, ao: (x, y) => 0.9 + 0.1 * smooth((y - 1.25) / 0.02) })));

  const left = [];
  left.push(plain(loft(spline(ARM, 3), 18, {
    color: SKIN,
    skinFn: (x, y) => {
      if (y < 0.585) { const h = clamp01((0.585 - y) / 0.03); return [[B.foreL, 1 - h], [B.handL, h]]; }
      const w = smooth((0.84 - y) / 0.12); return [[B.armL, 1 - w], [B.foreL, w]];
    },
  })));
  left.push(...hand(0.247, SKIN, false).map(plain));
  const legSkin = (x, y) => { const w = smooth((0.46 - y) / 0.14); return [[B.thighL, 1 - w], [B.shinL, w]]; };
  /* celana pendek putih: garis merah di sisi luar + tepi bawah merah */
  left.push(plain(loft(spline(SHORT, 2), 40, {
    color: WHITE, skinFn: legSkin,
    colorFn: (ring, a, x, y) => (ring.col ? ring.col : (Math.cos(a) > 0.972 && y > 0.455 && y < 0.7 ? RED : null)),
  })));
  left.push(plain(loft(spline(LEG, 3), 18, { color: SKIN, skinFn: legSkin })));
  left.push(plain(loft(spline(SOCK, 2), 16, { color: '#fbfaf7', skinFn: () => [[B.shinL, 1]] })));
  left.push(...shoe(0.10, KID_SHOE).map(plain));
  P.push(...left, ...left.map((g) => mirrorX(g, L2R)));

  cache = merge(P);
  cache.computeBoundingSphere();
  return cache;
}

/* satu material untuk seluruh karakter; uFace memilih petak wajah (0 senang, 1 kedip, 2 kaget, 3 pusing) */
export function createKidMaterial() {
  const uFace = { value: 0 };
  const mat = withSurfaceNoise(new THREE.MeshStandardMaterial({ map: getAtlas(), vertexColors: true, roughness: 0.8, metalness: 0 }),
    { fine: 240, coarse: 8, albedoFine: 0.035, albedoCoarse: 0.04, rough: 0.1 });
  const base = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh) => {
    base(sh);
    sh.uniforms.uFace = uFace;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uFace;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n  if ( uv.x < ' + (1 / TILES + 0.01).toFixed(4) + ' ) vMapUv.x += uFace * ' + (1 / TILES).toFixed(4) + ';\n#endif');
  };
  mat.customProgramCacheKey = () => 'kid';
  return { material: mat, uFace };
}
