import * as THREE from 'three';
import { merge } from './build.js';
import { piece, glowPiece } from './props.js';

/* Landmark level. Menara antena = rangka balok (ringan, ±800 segitiga). TV billboard dan kaset raksasa
   memakai ULANG geometri kepala karakter dan kaset yang sudah ada, hanya diperbesar — nol geometri baru. */
const _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();

/* balok dari titik a ke b */
function beam(a, b, t, hex, mat = 'steel') {
  _d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = _d.length();
  _q.setFromUnitVectors(_up, _d.normalize());
  _e.setFromQuaternion(_q);
  return piece(new THREE.BoxGeometry(t, len, t), hex, mat, { p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], r: [_e.x, _e.y, _e.z] });
}

/* Menara antena rangka merah-putih + dek + tiang puncak. Mengembalikan { body, glow, height, base } */
export function createTowerGeometry(H = 15, base = 1.55, top = 0.42, sections = 6) {
  const P = [], RED = '#d23a2e', WHT = '#ecebe5';
  const half = (y) => base + (top - base) * (y / H);
  const corner = (y, k) => { const h = half(y), sx = k & 1 ? 1 : -1, sz = k & 2 ? 1 : -1; return [sx * h, y, sz * h]; };
  for (let s = 0; s < sections; s++) {
    const y0 = H * s / sections, y1 = H * (s + 1) / sections, col = s % 2 ? WHT : RED;
    for (let k = 0; k < 4; k++) P.push(beam(corner(y0, k), corner(y1, k), 0.13, col));
    const ring = [0, 1, 3, 2];
    for (let k = 0; k < 4; k++) {
      const a = ring[k], b = ring[(k + 1) % 4];
      P.push(beam(corner(y1, a), corner(y1, b), 0.09, col));
      P.push(beam((s + k) % 2 ? corner(y0, a) : corner(y0, b), (s + k) % 2 ? corner(y1, b) : corner(y1, a), 0.07, col));
    }
  }
  /* dek servis + pagar */
  const dy = H * 4 / sections, dh = half(dy) + 0.5;
  P.push(piece(new THREE.BoxGeometry(dh * 2, 0.08, dh * 2), '#5b5f68', 'steel', { p: [0, dy, 0] }));
  for (let k = 0; k < 4; k++) {
    const r = piece(new THREE.BoxGeometry(dh * 2, 0.05, 0.05), '#8b8f98', 'metal', { p: [0, dy + 0.55, dh] });
    r.rotateY(k * Math.PI / 2); P.push(r);
  }
  /* tiang puncak + dua antena piring kecil */
  P.push(piece(new THREE.CylinderGeometry(0.05, 0.08, 3.2, 8), '#c9ccd3', 'metal', { p: [0, H + 1.6, 0] }));
  for (const sx of [-1, 1]) P.push(piece(new THREE.SphereGeometry(0.42, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.42), '#e4e3de', 'matte', { p: [sx * 0.55, H - 2.3, 0.2], r: [Math.PI / 2 - 0.25, 0, sx * 0.5] }));
  const G = [glowPiece(new THREE.SphereGeometry(0.16, 12, 8), '#ff3b30', 1, { p: [0, H + 3.3, 0] })];
  return { body: merge(P), glow: merge(G), height: H, base, beacon: H + 3.3 };
}

/* Perancah di bawah TV billboard: empat kaki + palang silang + lantai dudukan */
export function createScaffoldGeometry(w = 4.4, d = 3.0, h = 3.1) {
  const P = [], WOOD = '#6b5137', DARK = '#4a3826';
  const hx = w / 2, hz = d / 2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.push(beam([sx * hx, -0.6, sz * hz], [sx * hx * 0.94, h, sz * hz * 0.94], 0.24, WOOD, 'matte'));
  for (const sz of [-1, 1]) { P.push(beam([-hx, 0.4, sz * hz], [hx, h - 0.4, sz * hz], 0.12, DARK, 'matte')); P.push(beam([hx, 0.4, sz * hz], [-hx, h - 0.4, sz * hz], 0.12, DARK, 'matte')); }
  for (const sx of [-1, 1]) P.push(beam([sx * hx, 0.4, -hz], [sx * hx, h - 0.4, hz], 0.12, DARK, 'matte'));
  P.push(piece(new THREE.BoxGeometry(w + 0.7, 0.2, d + 0.7), WOOD, 'matte', { p: [0, h + 0.1, 0] }));
  for (let i = -2; i <= 2; i++) P.push(piece(new THREE.BoxGeometry(0.05, 0.22, d + 0.72), DARK, 'matte', { p: [i * (w + 0.7) / 5, h + 0.1, 0] }));
  return { body: merge(P), height: h + 0.2, legs: [[-hx, -hz], [hx, -hz], [-hx, hz], [hx, hz]] };
}
