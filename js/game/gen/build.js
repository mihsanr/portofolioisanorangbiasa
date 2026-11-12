import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/* Alat bantu pemodelan prosedural: loft cincin (tabung organik berbobot tulang), warna vertex + AO,
   penempatan, cermin, dan penggabungan per material supaya satu aset = sedikit draw call. */

const _c = new THREE.Color();
const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();

const lerp = (a, b, t) => a + (b - a) * t;
export const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const smooth = (x) => { const t = clamp01(x); return t * t * (3 - 2 * t); };

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/* Perhalus daftar cincin kunci {c:[x,y,z], rx, rz, rzb?, e?, ao?, col?} dengan Catmull-Rom. */
export function spline(keys, sub = 3) {
  const K = keys.length, out = [];
  const at = (i) => keys[Math.max(0, Math.min(K - 1, i))];
  const F = [(k) => k.c[0], (k) => k.c[1], (k) => k.c[2], (k) => k.rx, (k) => k.rz, (k) => (k.rzb ?? k.rz)];
  for (let i = 0; i < K - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    for (let s = 0; s < sub; s++) {
      const t = s / sub;
      const v = F.map((f) => catmull(f(at(i - 1)), f(a), f(b), f(at(i + 2)), t));
      out.push({
        c: [v[0], v[1], v[2]], rx: Math.max(v[3], 1e-3), rz: Math.max(v[4], 1e-3), rzb: Math.max(v[5], 1e-3),
        e: lerp(a.e ?? 2, b.e ?? 2, t), ao: lerp(a.ao ?? 1, b.ao ?? 1, t), col: t < 0.5 ? a.col : b.col,
      });
    }
  }
  const l = keys[K - 1];
  out.push({ c: l.c.slice(), rx: l.rx, rz: l.rz, rzb: l.rzb ?? l.rz, e: l.e ?? 2, ao: l.ao ?? 1, col: l.col });
  return out;
}

/* Kulit tertutup dari tumpukan cincin superelips. frame 'y': cincin mendatar; 'z': cincin tegak sepanjang Z.
   opt: { frame, color, colorFn(ring,a,x,y,z), aoFn(x,y,z), skinFn(x,y,z) -> [[tulang,bobot],...],
          bumpFn(ring,a) -> faktor radius (lipatan kain) } */
export function loft(rings, n = 20, opt = {}) {
  const frame = opt.frame || 'y';
  const R = rings.length, vc = R * n + 2;
  const pos = new Float32Array(vc * 3), col = new Float32Array(vc * 3);
  const si = new Uint16Array(vc * 4), sw = new Float32Array(vc * 4);
  const put = (k, x, y, z, ring, a) => {
    pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
    let hex = ring.col ?? opt.color ?? '#ffffff';
    if (opt.colorFn) { const h = opt.colorFn(ring, a, x, y, z); if (h != null) hex = h; }
    _c.set(hex);
    let ao = ring.ao ?? 1;
    if (opt.aoFn) ao *= opt.aoFn(x, y, z);
    col[k * 3] = _c.r * ao; col[k * 3 + 1] = _c.g * ao; col[k * 3 + 2] = _c.b * ao;
    const w = opt.skinFn ? opt.skinFn(x, y, z) : (ring.w || [[0, 1]]);
    for (let q = 0; q < 4; q++) { si[k * 4 + q] = w[q] ? w[q][0] : 0; sw[k * 4 + q] = w[q] ? w[q][1] : 0; }
  };
  for (let i = 0; i < R; i++) {
    const r = rings[i], p = 2 / (r.e ?? 2);
    for (let j = 0; j < n; j++) {
      const a = (j / n) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      const k = opt.bumpFn ? opt.bumpFn(r, a) : 1;
      const u = Math.sign(ca) * Math.pow(Math.abs(ca), p) * r.rx * k;
      const w = Math.sign(sa) * Math.pow(Math.abs(sa), p) * (sa < 0 ? (r.rzb ?? r.rz) : r.rz) * k;
      if (frame === 'y') put(i * n + j, r.c[0] + u, r.c[1], r.c[2] + w, r, a);
      else put(i * n + j, r.c[0] + u, r.c[1] + w, r.c[2], r, a);
    }
  }
  const s = R * n, e = R * n + 1, first = rings[0], last = rings[R - 1];
  put(s, first.c[0], first.c[1], first.c[2], first, 0);
  put(e, last.c[0], last.c[1], last.c[2], last, 0);
  const idx = [];
  for (let i = 0; i < R - 1; i++) for (let j = 0; j < n; j++) {
    const a = i * n + j, b = i * n + (j + 1) % n, c = (i + 1) * n + j, d = (i + 1) * n + (j + 1) % n;
    idx.push(a, c, b, b, c, d);
  }
  for (let j = 0; j < n; j++) {
    idx.push(s, j, (j + 1) % n);
    idx.push(e, (R - 1) * n + (j + 1) % n, (R - 1) * n + j);
  }
  /* arah segitiga dipastikan keluar lewat volume bertanda */
  let vol = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    vol += pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1])
         - pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c])
         + pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c]);
  }
  if (vol < 0) for (let t = 0; t < idx.length; t += 3) { const x = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = x; }
  const g = new THREE.BufferGeometry();
  g.setIndex(idx);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  g.computeVertexNormals();
  return g;
}

/* Samakan atribut geometri bawaan three.js: tanpa uv, berindeks, punya normal. */
export function prep(geo) {
  for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
  if (!geo.index) geo = mergeVertices(geo, 1e-5);
  if (!geo.attributes.normal) geo.computeVertexNormals();
  return geo;
}

export function place(geo, p = [0, 0, 0], r = [0, 0, 0], s = 1) {
  const sc = typeof s === 'number' ? new THREE.Vector3(s, s, s) : new THREE.Vector3(s[0], s[1], s[2]);
  _m.compose(new THREE.Vector3(p[0], p[1], p[2]), new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2])), sc);
  geo.applyMatrix4(_m);
  return geo;
}

/* Warna vertex (linear) dikali AO buatan: aoFn(x,y,z) -> 0..1. hex boleh fungsi (x,y,z) -> hex. */
export function paint(geo, hex, aoFn) {
  const pos = geo.attributes.position, arr = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    _v.fromBufferAttribute(pos, i);
    _c.set(typeof hex === 'function' ? hex(_v.x, _v.y, _v.z) : hex);
    const k = aoFn ? aoFn(_v.x, _v.y, _v.z) : 1;
    arr[i * 3] = _c.r * k; arr[i * 3 + 1] = _c.g * k; arr[i * 3 + 2] = _c.b * k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/* Ikat seluruh geometri ke satu tulang. */
export function rigid(geo, bone) {
  const n = geo.attributes.position.count, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { si[i * 4] = bone; sw[i * 4] = 1; }
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  return geo;
}

/* Primitif bawaan -> bagian siap gabung: posisi, warna, (opsional) tulang. */
export function part(geo, hex, { p, r, s, bone, ao } = {}) {
  geo = prep(geo);
  if (p || r || s) place(geo, p, r, s);
  paint(geo, hex, ao);
  if (bone != null) rigid(geo, bone);
  return geo;
}

/* Cermin terhadap bidang YZ; boneMap memetakan indeks tulang kiri -> kanan. */
export function mirrorX(geo, boneMap) {
  const g = geo.clone();
  const pos = g.attributes.position, nor = g.attributes.normal;
  for (let i = 0; i < pos.count; i++) { pos.setX(i, -pos.getX(i)); nor.setX(i, -nor.getX(i)); }
  const idx = g.index.array;
  for (let t = 0; t < idx.length; t += 3) { const x = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = x; }
  if (boneMap && g.attributes.skinIndex) {
    const si = g.attributes.skinIndex.array;
    for (let i = 0; i < si.length; i++) if (boneMap[si[i]] != null) si[i] = boneMap[si[i]];
  }
  return g;
}

export function merge(list) {
  const g = mergeGeometries(list, false);
  if (!g) throw new Error('merge: atribut bagian tidak seragam');
  list.forEach((x) => x.dispose());
  return g;
}

/* Persegi panjang bersudut bulat pada Shape/Path (untuk Extrude). */
export function roundRect(path, w, h, r, cx = 0, cy = 0) {
  const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2;
  path.moveTo(x0 + r, y0);
  path.lineTo(x1 - r, y0); path.absarc(x1 - r, y0 + r, r, -Math.PI / 2, 0, false);
  path.lineTo(x1, y1 - r); path.absarc(x1 - r, y1 - r, r, 0, Math.PI / 2, false);
  path.lineTo(x0 + r, y1); path.absarc(x0 + r, y1 - r, r, Math.PI / 2, Math.PI, false);
  path.lineTo(x0, y0 + r); path.absarc(x0 + r, y0 + r, r, Math.PI, Math.PI * 1.5, false);
  return path;
}
