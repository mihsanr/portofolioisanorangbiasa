import * as THREE from 'three';
import { worley3, value3 } from './noise.js';
import { prep, smooth } from './build.js';

/* "Pahat" batu: permukaan dibagi sel Worley. Tiap sel digeser keluar-masuk sendiri dan seluruh vertexnya
   memakai satu normal rata-rata, jadi terbaca sebagai bongkahan berbidang dengan tepi ter-bevel dan retakan
   gelap di antaranya — bukan faset segitiga. Semua dihitung sekali; saat render ini hanya mesh biasa. */
const _w = { f1: 0, f2: 0, r: 0, key: 0 };
const _n = new THREE.Vector3(), _p = new THREE.Vector3();

/* geo: berindeks, punya normal halus. dirFn(p, out) = arah geser (default: normal). maskFn(i, p) = 0..1.
   Mengembalikan { cell (acak per vertex), crack (0 di retakan .. 1 di tengah sel), cellNy (normal.y sel) }. */
export function chisel(geo, { freq = [0.5, 1.1, 0.5], amp = 0.3, seed = 1, flat = 0.8, crackWidth = 0.22, dirFn = null, maskFn = null } = {}) {
  const pos = geo.attributes.position, nor = geo.attributes.normal, n = pos.count;
  const cell = new Float32Array(n), crack = new Float32Array(n), cellNy = new Float32Array(n), keys = new Float64Array(n);
  const acc = new Map();
  for (let i = 0; i < n; i++) {
    worley3(pos.getX(i) * freq[0], pos.getY(i) * freq[1], pos.getZ(i) * freq[2], seed, _w);
    cell[i] = _w.r; crack[i] = smooth((_w.f2 - _w.f1) / crackWidth); keys[i] = _w.key;
    let a = acc.get(_w.key);
    if (!a) { a = [0, 0, 0]; acc.set(_w.key, a); }
    a[0] += nor.getX(i); a[1] += nor.getY(i); a[2] += nor.getZ(i);
  }
  acc.forEach((a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; a[0] /= l; a[1] /= l; a[2] /= l; });
  for (let i = 0; i < n; i++) {
    _p.fromBufferAttribute(pos, i);
    const m = maskFn ? maskFn(i, _p) : 1;
    const d = ((cell[i] - 0.38) * amp - (1 - crack[i]) * amp * 0.4) * m;
    if (dirFn) dirFn(_p, _n); else _n.fromBufferAttribute(nor, i);
    pos.setXYZ(i, _p.x + _n.x * d, _p.y + _n.y * d, _p.z + _n.z * d);
    const a = acc.get(keys[i]);
    _n.set(a[0] * flat + nor.getX(i) * (1 - flat), a[1] * flat + nor.getY(i) * (1 - flat), a[2] * flat + nor.getZ(i) * (1 - flat)).normalize();
    nor.setXYZ(i, _n.x, _n.y, _n.z);
    cellNy[i] = a[1];
  }
  return { cell, crack, cellNy };
}

export const ROCK = {
  warm: new THREE.Color('#b5a58c'), cool: new THREE.Color('#8f8d92'), deep: new THREE.Color('#5c5862'),
  soil: new THREE.Color('#7d5e40'), moss: new THREE.Color('#78a53f'),
};

/* Batu lepas (boulder) untuk instancing: bola terdeformasi + pahatan sel. */
export function createBoulderGeometry(seed = 3) {
  let g = prep(new THREE.IcosahedronGeometry(1, 2));
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    _p.fromBufferAttribute(pos, i);
    const k = 0.78 + 0.5 * value3(_p.x * 1.1 + seed, _p.y * 1.1, _p.z * 1.1, seed);
    pos.setXYZ(i, _p.x * k, _p.y * k * 0.72, _p.z * k * 0.9);
  }
  g.computeVertexNormals();
  const c = chisel(g, { freq: [1.35, 1.7, 1.35], amp: 0.3, seed: seed + 5, flat: 0.9, crackWidth: 0.18 });
  const col = new Float32Array(pos.count * 3), t = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    t.copy(ROCK.warm).lerp(ROCK.cool, c.cell[i]);
    const y = pos.getY(i);
    t.lerp(ROCK.moss, smooth((c.cellNy[i] - 0.55) / 0.3) * smooth((y - 0.15) / 0.3) * 0.75);
    const ao = (0.58 + 0.42 * c.crack[i]) * (0.8 + 0.34 * c.cell[i]) * (0.66 + 0.34 * smooth((y + 0.45) / 0.5));
    col[i * 3] = t.r * ao; col[i * 3 + 1] = t.g * ao; col[i * 3 + 2] = t.b * ao;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.translate(0, 0.42, 0);
  return g;
}
