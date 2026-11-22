// Model prosedural gaya "mainan plastik" (bukan low-poly kasar): normal creased (halus di lengkung,
// tegas di sudut), kotak membulat, lathe untuk badan. Tiap model dipanggang jadi satu geometri
// berwarna vertex → satu draw call, bisa di-instance. Tanpa file GLB.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/RoundedBoxGeometry.js';
import { Font } from 'three/addons/FontLoader.js';
import { TextGeometry } from 'three/addons/TextGeometry.js';
import fontData from './font.js';
import { toon } from './toon.js';
import { LITE } from './config.js';

const { PI } = Math;
const DEG = PI / 180;
const col = new THREE.Color();
const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
const V = (x, y) => new THREE.Vector2(x, y);

// Plastik mengilap (pesawat & huruf) memantulkan langit lewat envMap (diisi main.js).
// Gaya kartun: cahaya bertingkat + highlight putih tegas + rim (js/toon.js).
export const toyMat = toon({ vertexColors: true }, { spec: 0.9, shine: 50, rim: 0.35, hq: true });
export const glassMat = new THREE.MeshStandardMaterial({ color: 0x9fdcff, roughness: 0.06, metalness: 0, envMapIntensity: 1.4 });
// Dunia: Lambert (murah), sama seperti material dunia Pemburu Kaset.
export const worldMat = toon({ vertexColors: true }, { spec: 0.18, shine: 24, rim: 0.18 });

// Material yang dipakai bersama Mesh & InstancedMesh memaksa three.js mencocokkan ulang program tiap objek tiap frame.
// variant() memberi salinan khusus untuk instans (dan instans berwarna) → tidak ada pencocokan ulang.
const variants = new WeakMap();
export function variant(mat, kind) {
  const o = variants.get(mat) || variants.set(mat, {}).get(mat);
  if (!o[kind]) { const c = o[kind] = mat.clone(); c.onBeforeCompile = mat.onBeforeCompile; c.customProgramCacheKey = mat.customProgramCacheKey; }
  return o[kind];
}

// Normal creased versi cepat (array mentah; hasil sama dengan toCreasedNormals three.js tetapi ±10x lebih cepat).
function creased(geo, angle) {
  const g = geo.index ? geo.toNonIndexed() : geo, P = g.attributes.position.array, n = P.length / 3, F = new Float32Array(n), N = new Float32Array(n * 3), cos = Math.cos(angle) - 1e-4;
  for (let i = 0; i < P.length; i += 9) {
    const ax = P[i + 3] - P[i], ay = P[i + 4] - P[i + 1], az = P[i + 5] - P[i + 2], bx = P[i + 6] - P[i], by = P[i + 7] - P[i + 1], bz = P[i + 8] - P[i + 2];
    let x = ay * bz - az * by, y = az * bx - ax * bz, z = ax * by - ay * bx; const l = Math.hypot(x, y, z) || 1;
    F[i / 3] = x / l; F[i / 3 + 1] = y / l; F[i / 3 + 2] = z / l;
  }
  const head = new Map(), next = new Int32Array(n).fill(-1);
  const K = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const k = K[i] = ((Math.round(P[i * 3] * 250) + 65536) * 131072 + Math.round(P[i * 3 + 1] * 250) + 65536) * 131072 + Math.round(P[i * 3 + 2] * 250) + 65536;
    const h = head.get(k); if (h !== undefined) next[i] = h; head.set(k, i);
  }
  for (let i = 0; i < n; i++) {
    const f = i - i % 3, fx = F[f], fy = F[f + 1], fz = F[f + 2]; let x = 0, y = 0, z = 0;
    for (let j = head.get(K[i]); j >= 0; j = next[j]) { const q = j - j % 3; if (F[q] * fx + F[q + 1] * fy + F[q + 2] * fz >= cos) { x += F[q]; y += F[q + 1]; z += F[q + 2]; } }
    const l = Math.hypot(x, y, z); if (l > 1e-6) { N[i * 3] = x / l; N[i * 3 + 1] = y / l; N[i * 3 + 2] = z / l; } else { N[i * 3] = fx; N[i * 3 + 1] = fy; N[i * 3 + 2] = fz; }
  }
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  return g;
}
// Titik kembar disatukan (indeks) + normal 8-bit + warna 16-bit: kerja titik GPU & memori turun 2–4x.
export const i8 = a => { const o = new Int8Array(a.length); for (let i = 0; i < a.length; i++) o[i] = Math.round(a[i] * 127); return new THREE.BufferAttribute(o, 3, true); };
export const u16 = (a, n = 3) => { const o = new Uint16Array(a.length); for (let i = 0; i < a.length; i++) o[i] = Math.round(Math.min(1, Math.max(0, a[i])) * 65535); return new THREE.BufferAttribute(o, n, true); };
export function weld(g) {
  const P = g.attributes.position.array, N = g.attributes.normal.array, C = g.attributes.color?.array, n = P.length / 3;
  let size = 1; while (size < n * 2) size <<= 1;
  const table = new Int32Array(size).fill(-1), idx = n > 65535 ? new Uint32Array(n) : new Uint16Array(n), from = [];
  for (let i = 0; i < n; i++) {
    const a = i * 3;
    let h = Math.imul(Math.round(P[a] * 400), 73856093) ^ Math.imul(Math.round(P[a + 1] * 400), 19349663) ^ Math.imul(Math.round(P[a + 2] * 400), 83492791) ^ Math.imul(Math.round(N[a] * 30), 2654435) ^ Math.imul(Math.round(N[a + 1] * 30), 97531) ^ Math.imul(Math.round(N[a + 2] * 30), 1299721);
    if (C) h ^= Math.imul(Math.round(C[a] * 200), 15485863) ^ Math.imul(Math.round(C[a + 1] * 200), 32452843);
    h = (h ^ h >>> 15) & size - 1;
    for (;;) {
      const t = table[h];
      if (t < 0) { table[h] = idx[i] = from.length; from.push(i); break; }
      const b = from[t] * 3;
      if (Math.abs(P[a] - P[b]) < 2e-3 && Math.abs(P[a + 1] - P[b + 1]) < 2e-3 && Math.abs(P[a + 2] - P[b + 2]) < 2e-3 && Math.abs(N[a] - N[b]) + Math.abs(N[a + 1] - N[b + 1]) + Math.abs(N[a + 2] - N[b + 2]) < 0.04 && (!C || Math.abs(C[a] - C[b]) + Math.abs(C[a + 1] - C[b + 1]) + Math.abs(C[a + 2] - C[b + 2]) < 0.006)) { idx[i] = t; break; }
      h = h + 1 & size - 1;
    }
  }
  const m = from.length, o = new THREE.BufferGeometry(), pick = A => { const r = new Float32Array(m * 3); for (let i = 0; i < m; i++) { const b = from[i] * 3; r[i * 3] = A[b]; r[i * 3 + 1] = A[b + 1]; r[i * 3 + 2] = A[b + 2]; } return r; };
  o.setAttribute('position', new THREE.BufferAttribute(pick(P), 3)); o.setAttribute('normal', i8(pick(N))); if (C) o.setAttribute('color', u16(pick(C)));
  o.setIndex(new THREE.BufferAttribute(idx, 1));
  return o;
}

// geo → ditransformasi, normal creased, diberi warna per muka (color boleh fungsi pusat-muka → warna).
export function part(geo, color, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1], crease = 48, soft = false } = {}) {   // soft = warna per titik (pola tidak bergerigi segitiga)
  for (const k of Object.keys(geo.attributes)) if (k !== 'position') geo.deleteAttribute(k);
  geo.clearGroups();
  geo.applyMatrix4(m4.compose(new THREE.Vector3(...p), q.setFromEuler(e.set(...r)), new THREE.Vector3(...s)));
  const g = creased(geo, crease * DEG);
  const pos = g.attributes.position, c = new Float32Array(pos.count * 3), ctr = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    if (soft) {
      for (let j = 0; j < 3; j++) { ctr.fromBufferAttribute(pos, i + j); col.set(color(ctr)).toArray(c, (i + j) * 3); }
      continue;
    }
    if (typeof color === 'function') {
      ctr.set(0, 0, 0);
      for (let j = 0; j < 3; j++) ctr.x += pos.getX(i + j) / 3, ctr.y += pos.getY(i + j) / 3, ctr.z += pos.getZ(i + j) / 3;
      col.set(color(ctr));
    } else col.set(color);
    for (let j = 0; j < 3; j++) col.toArray(c, (i + j) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
// AO dipanggang ke warna vertex: sisi bawah & bagian dekat dasar model lebih gelap (gratis saat render).
export function bake(parts, ao = true) {
  const g = mergeGeometries(parts);
  if (!ao) return weld(g);
  g.computeBoundingBox();
  const { min, max } = g.boundingBox, h = Math.max(1e-3, max.y - min.y);
  const p = g.attributes.position, n = g.attributes.normal, c = g.attributes.color;
  for (let i = 0; i < p.count; i++) {
    const up = n.getY(i) * 0.5 + 0.5, t = Math.min(1, (p.getY(i) - min.y) / (h * 0.45));
    const f = (0.7 + 0.3 * up) * (0.8 + 0.2 * t * t * (3 - 2 * t));
    c.setXYZ(i, c.getX(i) * f, c.getY(i) * f, c.getZ(i) * f);
  }
  return weld(g);
}

// Tesselasi: HP memakai ±60% ruas (pesawat tetap penuh). Bentuk bersegi (≤ 8 ruas) tidak diubah.
let Q = LITE ? 0.6 : 1;
const q8 = n => (n <= 8 ? n : Math.max(8, Math.round(n * Q)));
const sph = (w = 20, h = 14) => new THREE.SphereGeometry(1, w <= 6 ? w : Math.max(6, Math.round(w * Q)), h <= 5 ? h : Math.max(5, Math.round(h * Q)));
const cyl = (rt, rb, h, n = 16) => new THREE.CylinderGeometry(rt, rb, h, q8(n));
const cone = (r, h, n = 16) => new THREE.ConeGeometry(r, h, q8(n));
const rbox = (x, y, z, rad = 0.12) => Q < 1 && rad < Math.min(x, y, z) * 0.22 ? new THREE.BoxGeometry(x, y, z) : new RoundedBoxGeometry(x, y, z, Q < 1 ? 1 : 2, Math.min(rad, x / 2.01, y / 2.01, z / 2.01));
const lathe = (pts, n = 24) => new THREE.LatheGeometry(pts.map(([x, y]) => V(x, y)), q8(n));
const torus = (R, t, rs = 10, ts = 24, arc = PI * 2) => new THREE.TorusGeometry(R, t, Q < 1 ? Math.min(rs, 6) : rs, q8(ts), arc);
// Bentuk 2D diekstrusi dengan tepi membulat (bevel) lalu ditengahkan pada tebalnya.
const slab = (shape, depth, bevel = 0.04) => new THREE.ExtrudeGeometry(shape, {
  depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: Q < 1 ? 1 : 3, curveSegments: Q < 1 ? 6 : 10,
}).translate(0, 0, -depth / 2);

// Gumpalan mulus dari beberapa bola (smooth union): satu permukaan tanpa garis sambung. balls: [x, y, z, r]
export function blob(balls, detail = 5, k = 0.9, sy = 1) {
  const g = new THREE.IcosahedronGeometry(1, LITE ? Math.max(2, detail - (detail > 5 ? 2 : 1)) : detail), p = g.attributes.position, d = new THREE.Vector3(), o = new THREE.Vector3();
  let W = 0; for (const [x, y, z, r] of balls) { o.add(d.set(x, y, z).multiplyScalar(r * r)); W += r * r; } o.multiplyScalar(1 / W);
  const seen = new Map(), far = Math.max(...balls.map(b => Math.hypot(b[0] - o.x, b[1] - o.y, b[2] - o.z) + b[3])) + k * 2;
  const sdf = (x, y, z) => { let s = 0; for (const b of balls) s += Math.exp(-(Math.hypot(x - b[0], y - b[1], z - b[2]) - b[3]) / k); return -k * Math.log(s); };
  for (let i = 0; i < p.count; i++) {
    d.fromBufferAttribute(p, i).normalize();
    const key = (d.x * 4096 | 0) + ',' + (d.y * 4096 | 0) + ',' + (d.z * 4096 | 0);
    let t = seen.get(key);
    if (t === undefined) {                                   // telusuri dari luar ke dalam sampai menyentuh permukaan
      t = far;
      for (let n = 0; n < 40; n++) { const q = sdf(o.x + d.x * t, o.y + d.y * t, o.z + d.z * t); if (q < 0.01) break; t -= q; }
      seen.set(key, t = Math.max(0, t));
    }
    p.setXYZ(i, o.x + d.x * t, (o.y + d.y * t) * sy, o.z + d.z * t);
  }
  return g;
}
const mixC = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), Math.min(1, Math.max(0, t)));
// Gumpalan daun tersebar merata di permukaan elips (berlekuk, tetap satu kulit mulus)
const puffs = (n, R, r, cx, cy, cz, sy = 1) => [[cx, cy, cz, R], ...Array.from({ length: n }, (_, i) => { const y = 1 - 2 * (i + 0.5) / n, q = Math.sqrt(1 - y * y), a = i * 2.39996; return [cx + Math.cos(a) * q * R, cy + y * R * sy, cz + Math.sin(a) * q * R, r * (0.88 + 0.24 * ((i * 7) % 5) / 4)]; })];
// Daun: terang di atas, gelap di bawah, peralihan halus
const leaf = (balls, lo, hi, y0, y1, detail, k, sy) => part(blob(balls, detail, k, sy), c => mixC(lo, hi, (c.y - y0) / (y1 - y0)), { crease: 180, soft: true });

function roundRect(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
function starShape(R, r) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = PI / 2 + i * PI / 5, k = i % 2 ? r : R;
    i ? s.lineTo(Math.cos(a) * k, Math.sin(a) * k) : s.moveTo(Math.cos(a) * k, Math.sin(a) * k);
  }
  return s;
}

// ── Pesawat: 4 karakter dari gambar referensi (Klasik, Polisi, Kucing, Dino) ──
const WHITE = 0xf7f3ea, YEL = 0xffc21a, DARK = 0x3a3a44, TIRE = 0x1c1c22, EYE = 0x10131c, BLUSH = 0xff8fa3;
export const SKINS = {
  classic: { name: 'Klasik', body: 0xe2262f, belly: WHITE, wing: 0xe2262f, tip: WHITE, emblem: YEL, prop: YEL },
  police: { name: 'Polisi', body: 0x2563d9, belly: WHITE, wing: WHITE, tip: 0x2563d9, emblem: YEL, prop: YEL },
  cat: { name: 'Kucing', body: 0xffb21a, belly: 0xfff3dc, wing: 0xffb21a, tip: 0xf0781e, emblem: 0xf0781e, prop: 0xffd34d },
  dino: { name: 'Dino', body: 0x35b04a, belly: 0xf2efc9, wing: 0x35b04a, tip: YEL, emblem: YEL, prop: 0xffd34d },
};
const PROFILE0 = [[0, -1.32], [0.38, -1.28], [0.64, -1.15], [0.8, -0.9], [0.88, -0.5], [0.89, 0], [0.82, 0.5], [0.64, 1.0], [0.42, 1.45], [0.24, 1.8], [0, 1.92]];
const PROFILE = new THREE.SplineCurve(PROFILE0.map(q => new THREE.Vector2(...q))).getPoints(44).map(q => [Math.max(0, q.x), q.y]);
const radiusAt = z => { // jari-jari badan di posisi z (untuk menaruh duri tepat di kulit)
  for (let i = 1; i < PROFILE.length; i++) { const [r0, z0] = PROFILE[i - 1], [r1, z1] = PROFILE[i]; if (z <= z1) return r0 + (r1 - r0) * (z - z0) / (z1 - z0); }
  return 0;
};

const tipShape = (w, h, r, x0, sx) => { // ujung sayap: lurus di dalam, membulat di luar
  const s = new THREE.Shape(), P = [[x0, -h / 2], [w - r, -h / 2]];
  s.moveTo(sx * P[0][0], P[0][1]); s.lineTo(sx * P[1][0], P[1][1]); s.quadraticCurveTo(sx * w, -h / 2, sx * w, -h / 2 + r); s.lineTo(sx * w, h / 2 - r); s.quadraticCurveTo(sx * w, h / 2, sx * (w - r), h / 2); s.lineTo(sx * x0, h / 2); s.closePath();
  return s;
};

function planeMeshes(key) {
  const K = SKINS[key] || SKINS.classic, keepQ = Q; Q = LITE ? 0.8 : 1;
  // pola badan per karakter (warna per muka): perut terang, belang kucing, totol dino
  const skin = c => {
    if (c.y < -0.3) return K.belly;
    if (key === 'cat' && c.y > 0.05 && Math.sin(c.z * 9) > 0.55) return 0xf0781e;
    if (key === 'dino' && Math.sin(c.x * 7 + c.z * 5) * Math.sin(c.z * 8 - c.y * 6) > 0.55) return 0x2a8f3b;
    return K.body;
  };
  const fin = new THREE.Shape();
  fin.moveTo(-0.55, 0); fin.lineTo(0.55, 0); fin.lineTo(0.5, 0.85); fin.quadraticCurveTo(0.45, 1.22, 0.12, 1.15); fin.quadraticCurveTo(-0.05, 1.1, -0.12, 0.85); fin.lineTo(-0.55, 0);

  const parts = [
    part(lathe(PROFILE, 48), skin, { r: [PI / 2, 0, 0], s: [1, 1, 0.94], soft: true, crease: 80 }),                // badan gemuk
    part(torus(0.36, 0.08, 10, 28), WHITE, { p: [0, -0.08, -1.27] }),                     // cincin hidung
    part(slab(roundRect(4.5, 1.05, 0.48), 0.13, 0.05), K.wing, { p: [0, -0.32, -0.05], r: [PI / 2, 0, 0] }),
    part(slab(roundRect(1.95, 0.56, 0.26), 0.1, 0.04), K.wing, { p: [0, 0.16, 1.62], r: [PI / 2, 0, 0] }),
    ...[-1, 1].flatMap(sx => [part(slab(tipShape(2.25, 1.05, 0.48, 1.72, sx), 0.15, 0.055), K.tip, { p: [0, -0.32, -0.05], r: [PI / 2, 0, 0] }), part(slab(tipShape(0.975, 0.56, 0.26, 0.66, sx), 0.12, 0.045), K.tip, { p: [0, 0.16, 1.62], r: [PI / 2, 0, 0] })]),
    part(slab(fin, 0.1, 0.05), K.body, { p: [0, 0.24, 1.45], r: [0, -PI / 2, 0] }),        // sirip tegak
  ];
  for (const sx of [-1, 1]) {
    parts.push(
      part(sph(18, 12), WHITE, { p: [sx * 0.24, 0.62, -1.15], s: [0.17, 0.22, 0.07] }),    // mata di kaca
      part(sph(14, 10), EYE, { p: [sx * 0.21, 0.6, -1.21], s: [0.1, 0.13, 0.04] }),
      part(sph(8, 6), WHITE, { p: [sx * 0.18, 0.66, -1.25], s: [0.035, 0.04, 0.02] }),
      part(sph(12, 8), BLUSH, { p: [sx * 0.79, 0.02, -0.82], r: [0, sx * 0.75, 0], s: [0.05, 0.11, 0.17] }), // pipi merona
      part(rbox(0.1, 0.55, 0.12, 0.04), DARK, { p: [sx * 0.5, -0.78, -0.45] }),             // kaki roda
      part(torus(0.17, 0.085, 10, 22), TIRE, { p: [sx * 0.57, -1.04, -0.45], r: [0, PI / 2, 0] }),
      part(sph(12, 8), K.prop, { p: [sx * 0.57, -1.04, -0.45], s: [0.06, 0.12, 0.12] }),
    );
    if (key === 'classic' || key === 'police') parts.push(part(slab(starShape(0.25, 0.11), 0.02, 0.015), K.emblem, { p: [sx * 0.08, 0.8, 1.55], r: [0, sx * PI / 2, 0], crease: 30 }));
    if (key === 'police') parts.push(                                                            // lencana + sirene
      part(sph(14, 10), YEL, { p: [sx * 0.87, 0.12, -0.1], s: [0.04, 0.22, 0.19] }),
      part(slab(starShape(0.12, 0.05), 0.02, 0.01), 0x2563d9, { p: [sx * 0.91, 0.12, -0.1], r: [0, sx * PI / 2, 0], crease: 30 }),
      part(sph(12, 8), sx < 0 ? 0xff3344 : 0x33aaff, { p: [sx * 0.13, 0.9, 0.42], s: [0.12, 0.1, 0.15] }));
    if (key === 'cat') parts.push(                                                               // telinga + kumis
      part(cone(0.26, 0.5, 16), K.body, { p: [sx * 0.42, 0.98, 0.12], r: [0, 0, -sx * 0.35] }),
      part(cone(0.15, 0.32, 12), 0xff9fb2, { p: [sx * 0.4, 0.95, 0.03], r: [0, 0, -sx * 0.35] }),
      ...[-0.12, 0.08].map(t => part(cyl(0.012, 0.012, 0.6, 5), 0x5a3a20, { p: [sx * 0.62, -0.12 + t * 0.6, -1.05], r: [0, 0, PI / 2 + sx * t] })));
  }
  if (key === 'police') parts.push(part(rbox(0.46, 0.08, 0.26, 0.03), DARK, { p: [0, 0.83, 0.42] }));
  if (key === 'dino') {                                                                          // duri punggung & sirip
    for (let z = 0.25; z <= 1.3; z += 0.26) parts.push(part(cone(0.13, 0.3, 10), 0xffa41a, { p: [0, radiusAt(z) * 0.94 + 0.08, z], r: [0.25, 0, 0] }));
    for (const [y, z] of [[1.42, 1.55], [1.2, 1.85], [0.92, 1.97]]) parts.push(part(cone(0.1, 0.26, 10), 0xffa41a, { p: [0, y, z], r: [0.6, 0, 0] }));
  }

  const body = new THREE.Mesh(bake(parts), toyMat);
  const glass = new THREE.Mesh(part(sph(28, 18), 0xffffff, { p: [0, 0.55, -0.5], s: [0.68, 0.56, 0.72] }), glassMat);
  const prop = new THREE.Mesh(bake([
    part(sph(16, 12), K.prop, { s: [0.24, 0.24, 0.36] }),                                       // spinner
    ...[0, 1, 2].map(i => part(sph(12, 8), K.prop, { p: [Math.sin(i * 2.094) * 0.34, Math.cos(i * 2.094) * 0.34, 0.05], r: [0, 0.4, -i * 2.094], s: [0.12, 0.34, 0.035] })),
  ]), toyMat);
  prop.position.set(0, -0.08, -1.42);  // diameter ±1,4 ≈ 30% panjang badan (PRD 7.2)
  Q = keepQ;
  for (const m of [body, glass, prop]) m.castShadow = true;
  return { body, glass, prop };
}

export function makePlane(key = 'classic') {
  const visual = new THREE.Group();     // dimiringkan (pitch/roll) terpisah dari root (posisi/yaw)
  const root = new THREE.Group();
  root.add(visual);
  const plane = { root, visual, prop: null };
  setPlaneSkin(plane, key);
  return plane;
}
export function setPlaneSkin(plane, key) {
  for (const m of plane.parts || []) { m.geometry.dispose(); plane.visual.remove(m); }
  const { body, glass, prop } = planeMeshes(key);
  plane.visual.add(body, glass, prop);
  plane.parts = [body, glass, prop];
  plane.prop = prop;
}

// ── Huruf & angka 3D tebal, tepi membulat ──
const font = new Font(fontData);
export function makeGlyph(ch, color) {
  let g = new TextGeometry(ch, { font, size: ch >= 'a' ? 9.2 : 7.6, depth: 1.7, curveSegments: LITE ? 5 : 9, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.32, bevelSegments: LITE ? 1 : 3 });
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  g = weld(creased(g, 35 * DEG));
  g.center();
  // fog: false + emissive → warna tetap penuh dari jauh (tidak pudar oleh kabut).
  return new THREE.Mesh(g, toon({ color, emissive: new THREE.Color(color).multiplyScalar(0.32), fog: false, transparent: true }, { spec: 1, shine: 40, rim: 0.4, hq: true }));
}

// Panah penunjuk: panah pipih rebah di bidang XZ, ujung ke -z (arah maju)
export function makeArrow() {
  const s = new THREE.Shape([[0, 1.35], [1.05, 0.1], [0.42, 0.1], [0.42, -1.05], [-0.42, -1.05], [-0.42, 0.1], [-1.05, 0.1]].map(q => V(...q)));
  return new THREE.Mesh(part(slab(s, 0.22, 0.1).rotateX(-PI / 2), 0xffffff, { crease: 40 }), toon({ vertexColors: true, fog: false }, { spec: 0.6, shine: 30, rim: 0.3, hq: true }));
}

// ── Objek dunia ──
// lite = pohon taman kota (lebih kecil & jauh lebih sedikit segitiga, karena jumlahnya banyak)
export function treeGeo(lite = false) {
  return bake([part(cyl(0.38, 0.6, 3.2, lite ? 7 : 12), 0x8a5a33, { p: [0, 1.6, 0] }),
    leaf(lite ? puffs(6, 1.55, 1.25, 0, 4.6, 0) : puffs(11, 1.6, 1.05, 0, 4.6, 0), 0x379330, 0x86da55, 2.3, 7, lite ? 2 : 5, 0.2)]);
}
// Trembesi (payung lebar), flamboyan (bunga merah), kelapa, cemara lilin — variasi siluet
export const treeMat = toon({ vertexColors: true }, { spec: 0.12, shine: 24, rim: 0.2, sway: true });
export function umbrellaGeo(flower = 0, lite = false) {
  const a = flower || 0x4c9f3a, b = flower ? 0xff8a4a : 0x66bb48;
  return bake([part(cyl(0.4, 0.75, 4.4, 9), 0x7a5233, { p: [0, 2.2, 0] }), part(cyl(0.2, 0.32, 2.6, 7), 0x7a5233, { p: [1.1, 4.4, 0.2], r: [0, 0, -0.75] }), part(cyl(0.2, 0.3, 2.4, 7), 0x7a5233, { p: [-1.0, 4.3, -0.2], r: [0, 0, 0.75] }),
    leaf([[0, 14, 0, 3.0], ...Array.from({ length: 6 }, (_, i) => [Math.cos(i * 1.047) * 2.9, 12.9 + (i % 2) * 0.7, Math.sin(i * 1.047) * 2.9, 1.75]), ...(lite ? [] : [0.5, 2.6, 4.7].map(q => [Math.cos(q) * 1.5, 16.3, Math.sin(q) * 1.5, 1.6]))], a, b, 4.8, 8, lite ? 2 : 5, 0.28, 0.42)]);
}
export function palmGeo(lite = false) {
  const P = [0, 1, 2, 3].map(i => part(cyl(0.3 - i * 0.03, 0.36 - i * 0.03, 2.1, 8), i % 2 ? 0xa9794a : 0x966a3f, { p: [0.12 * i * i, 1 + i * 1.95, 0], r: [0, 0, -0.1 * i] }));
  for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2; P.push(part(lite ? sph(6, 3) : sph(8, 6), i % 2 ? 0x46b544 : 0x2f9a3d, { p: [1.15 + Math.cos(a) * 1.7, 7.5 - 0.35, Math.sin(a) * 1.7], r: [0, -a, -0.38], s: [2.0, 0.16, 0.55] })); }
  if (!lite) for (const a of [0, 2.1, 4.2]) P.push(part(sph(8, 6), 0x7a4b2a, { p: [1.15 + Math.cos(a) * 0.4, 7.2, Math.sin(a) * 0.4], s: [0.34, 0.36, 0.34] }));
  return bake(P);
}
export const cypressGeo = (lite = false) => bake([part(cyl(0.25, 0.35, 1.4, lite ? 5 : 8), 0x7a4b2a, { p: [0, 0.7, 0] }), part(lite ? sph(8, 7) : sph(18, 16), c => mixC(0x24793b, 0x47b563, (c.y - 1) / 8), { p: [0, 5, 0], s: [1.3, 4.4, 1.3], crease: 180, soft: true })]);
export function pineGeo() {
  return bake([
    part(cyl(0.3, 0.42, 2, 10), 0x7a4b2a, { p: [0, 1, 0] }),
    part(lathe([[0.3, 1.75], [2.1, 1.5], [2.35, 1.75], [2.1, 2.15], [1.15, 3.65], [1.7, 3.7], [1.85, 3.95], [1.6, 4.35], [0.8, 5.6], [1.15, 5.65], [1.28, 5.9], [1.1, 6.2], [0.25, 7.6], [0, 7.75]], 20), c => mixC(0x27883f, 0x4cc068, (c.y - 1.6) / 6), { crease: 60, soft: true }),
  ]);
}
export function houseGeo() {
  const roof = new THREE.Shape([V(-3.2, 0), V(3.2, 0), V(0, 2.5)]);
  return bake([
    part(rbox(5, 3.6, 4.4, 0.18), 0xf6e3b8, { p: [0, 1.8, 0] }),
    part(slab(roof, 5.4, 0.15), 0xe4473c, { p: [0, 3.55, 0] }),                        // atap prisma membulat
    part(rbox(0.7, 1.6, 0.7, 0.1), 0xc9442f, { p: [1.4, 5.0, -0.8] }),                  // cerobong
    part(rbox(1.1, 1.9, 0.16, 0.06), 0x9a5b2e, { p: [0, 0.95, 2.22] }),                 // pintu
    ...[-1.6, 1.6].flatMap(x => [
      part(rbox(1.05, 1.05, 0.12, 0.05), 0xffffff, { p: [x, 2.2, 2.2] }),
      part(rbox(0.8, 0.8, 0.14, 0.04), 0x8fd8ff, { p: [x, 2.2, 2.23] }),
    ]),
  ]);
}
export function windmillGeo() {
  return bake([
    part(lathe([[0, 0], [3.4, 0], [3.0, 4], [2.5, 9], [2.2, 12], [0, 12]], 20), 0xe9cf9b, { crease: 60 }),
    part(cone(3.1, 3.4, 20), 0xd9573b, { p: [0, 13.7, 0] }),
    part(rbox(1.4, 2.2, 0.3, 0.1), 0x9a5b2e, { p: [0, 1.1, 3.25] }),
    part(cyl(0.5, 0.5, 1.4, 14), 0x7a4b2a, { p: [0, 11.2, 2.7], r: [PI / 2, 0, 0] }),
  ]);
}
export function bladesGeo() {
  return bake([0, 1, 2, 3].flatMap(i => {
    const a = -i * PI / 2, sx = Math.sin(i * PI / 2), cy = Math.cos(i * PI / 2);
    return [
      part(rbox(0.35, 7.4, 0.3, 0.1), 0x8a5a33, { p: [sx * 3.7, cy * 3.7, 0], r: [0, 0, a] }),          // tiang
      part(rbox(1.5, 5.6, 0.12, 0.05), 0xf2e2c0, { p: [sx * 4.2 + cy * 0.9, cy * 4.2 - sx * 0.9, -0.1], r: [0, 0, a] }), // layar
    ];
  }));
}
export function lighthouseGeo() {
  return bake([
    part(new THREE.IcosahedronGeometry(1, 3), 0x9aa3ad, { s: [6.5, 2.6, 6.5] }),
    part(new THREE.CylinderGeometry(2, 3, 16, 24, 5), c => (Math.floor((c.y - 0.5) / 3.2) % 2 ? 0xf7f4ee : 0xe23b3b), { p: [0, 8.5, 0] }),
    part(cyl(2.8, 2.8, 0.5, 24), 0x3a3a44, { p: [0, 16.7, 0] }),
    part(cyl(1.6, 1.6, 2.2, 20), 0xfff2a0, { p: [0, 18, 0] }),
    part(cone(2.2, 2.2, 20), 0xe23b3b, { p: [0, 20.2, 0] }),
    part(sph(10, 8), 0xe23b3b, { p: [0, 21.4, 0], s: [0.35, 0.35, 0.35] }),
  ]);
}
export function boatGeo() {
  const hull = new THREE.Shape(); hull.moveTo(-4, 1); hull.lineTo(4.4, 1); hull.quadraticCurveTo(3.6, -0.6, 2.6, -0.7); hull.lineTo(-3, -0.7); hull.quadraticCurveTo(-3.8, -0.2, -4, 1);
  return bake([
    part(slab(hull, 2.4, 0.2), c => (c.y > 0.55 ? 0xf7f4ee : 0x2f6fe0), {}),
    part(rbox(2.4, 1.6, 2, 0.2), 0xf7f4ee, { p: [-1, 1.9, 0] }),
    part(cyl(0.12, 0.12, 6, 8), 0x7a4b2a, { p: [1.5, 4, 0] }),
    part(slab(new THREE.Shape([V(0, 0), V(0, 5), V(3, 0)]), 0.06, 0.04), 0xffc21a, { p: [1.65, 1.6, 0] }),
  ]);
}
export function balloonGeo(STRIPES = [0xe8343a, 0xffc21a, 0x2f7bff, 0xff7a1a]) {
  const env = lathe([[0, -5.6], [1.4, -5.2], [3.2, -3.4], [4.8, -0.8], [5.2, 1.5], [4.7, 3.6], [3.3, 5.0], [1.5, 5.6], [0, 5.7]], 24);
  return bake([
    part(env, c => STRIPES[Math.floor(((Math.atan2(c.z, c.x) + PI) / (2 * PI)) * 12) % 4], { p: [0, 9, 0], crease: 70 }),
    part(rbox(1.9, 1.4, 1.9, 0.2), 0x9a5b2e, { p: [0, 0, 0] }),
    ...[[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([x, z]) => part(cyl(0.05, 0.05, 3, 4), 0x5a3a20, { p: [x * 0.8, 1.9, z * 0.8] })),
  ]);
}
export function airshipGeo() {
  return bake([
    part(sph(28, 16), c => (Math.abs(c.x) < 1.3 ? 0xffc21a : 0x2f7bff), { s: [9, 3.2, 3.2] }),
    part(rbox(2.6, 1.1, 1.5, 0.3), 0xf7f4ee, { p: [0.5, -3.5, 0] }),
    part(slab(roundRect(2.4, 2.6, 0.6), 0.2, 0.08), 0xe8343a, { p: [-8, 1.4, 0] }),
    part(slab(roundRect(2.4, 4.6, 0.6), 0.2, 0.08), 0xe8343a, { p: [-8, 0, 0], r: [PI / 2, 0, 0] }),
  ]);
}
export function floatIslandGeo() {
  return bake([
    part(lathe([[0, -14], [1.6, -12.4], [2.8, -10.4], [4.2, -8.2], [5.6, -6.2], [7, -4], [8.3, -2], [9.3, -0.2]], 36), c => mixC(0x7d5638, 0xb98656, (c.y + 13) / 13), { crease: 180, soft: true }),
    part(lathe([[9.0, -0.7], [9.75, -0.45], [10, 0.1], [9.8, 0.65], [9.1, 1.05], [6, 1.3], [0, 1.4]], 40), 0x63c447, { crease: 180 }),
    leaf(puffs(9, 1.6, 1.05, 3, 3.8, 1), 0x379330, 0x86da55, 1.6, 6.2, 6, 0.2),
    part(cyl(0.4, 0.5, 2.4, 8), 0x8a5a33, { p: [3, 1.8, 1] }),
    part(lathe([[0.2, 1.2], [1.5, 1.2], [1.65, 1.45], [1.4, 1.9], [0.3, 4.9], [0, 5.1]], 20), c => mixC(0x27883f, 0x4cc068, (c.y - 1) / 4), { p: [-3.5, 0, -2], crease: 60, soft: true }),
  ]);
}
export function cloudGeo() {
  return bake([part(blob([[0, 0, 0, 3.8], [3.8, -0.7, 0.6, 2.7], [-4, -0.8, -0.4, 2.5], [1.4, 1.9, -0.6, 2.3], [-1.7, 1.3, 1, 2.2], [6.4, -1.3, 0, 1.6], [-6.4, -1.4, 0.4, 1.5], [0.3, 0.4, 2.6, 2.2], [0, 0.2, -2.6, 2.2], [3, 0.9, 1.6, 1.7], [-3.6, 0.9, -1.4, 1.7]], 8, 0.3, 0.82), c => mixC(0xd9e6f5, 0xffffff, (c.y + 2) / 3.4), { crease: 180, soft: true })], false);
}
export function rainbowGeo() {
  const C = [0xff4b4b, 0xff9a2e, 0xffd93a, 0x4fd16a, 0x3d8bff, 0x9a5bff];
  return bake(C.map((c, i) => part(torus(70 - i * 3, 1.5, 12, 96, PI), c, { crease: 80 })));
}

// Helper geometri dipakai juga oleh js/landmarks.js
export { sph, cyl, cone, rbox, lathe, torus, slab, roundRect, starShape };
