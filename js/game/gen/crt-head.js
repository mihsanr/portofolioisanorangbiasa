import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { part, merge, roundRect, prep } from './build.js';

/* Kepala TV CRT. Ruang lokal: titik asal = sendi leher, +Z = depan (layar), +Y = atas.
   Hasil: plastic (casing, bezel, punuk tabung, kisi, tombol — satu mesh berwarna vertex),
          metal (antena), screen (kaca cembung ber-UV untuk shader wajah). */
const C = {
  case: '#40444b', hump: '#373a40', bezel: '#2a2c31', rib: '#2e3136', neck: '#222427',
  knob: '#d2ccbf', knobDark: '#1f2023', red: '#d63a2f', plate: '#9a9da3',
};
export const HEAD = { w: 0.54, h: 0.44, d: 0.40, cy: 0.25, holeW: 0.40, holeH: 0.285, holeY: 0.27 };

let cache = null;
export function getHeadGeometry() {
  if (cache) return cache;
  const { w, h, d, cy, holeW, holeH, holeY } = HEAD;
  const P = [];
  const rb = (bw, bh, bd, seg, rad) => new RoundedBoxGeometry(bw, bh, bd, seg, rad);

  /* casing utama: sisi bawah sedikit digelapkan (AO terhadap kerah hoodie) */
  P.push(part(rb(w, h, d, 6, 0.05), C.case, { p: [0, cy, 0], ao: (x, y) => 0.72 + 0.28 * Math.min(1, Math.max(0, (y - 0.03) / 0.09)) }));
  /* punuk tabung di belakang */
  P.push(part(rb(0.40, 0.32, 0.18, 5, 0.06), C.hump, { p: [0, cy, -0.26], ao: (x, y, z) => (z > -0.215 ? 0.7 : 1) }));
  for (let i = 0; i < 5; i++) P.push(part(rb(0.24, 0.014, 0.016, 1, 0.006), C.rib, { p: [0, cy - 0.08 + i * 0.04, -0.351] }));

  /* bezel: bingkai ber-bevel dengan lubang layar */
  const shape = roundRect(new THREE.Shape(), 0.50, 0.40, 0.045, 0, 0);
  shape.holes.push(roundRect(new THREE.Path(), holeW, holeH, 0.042, 0, holeY - cy));
  const bezel = new THREE.ExtrudeGeometry(shape, { depth: 0.018, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 3, curveSegments: 10 });
  P.push(part(bezel, C.bezel, { p: [0, cy, 0.196] }));

  /* dagu: pelat nama + tiga tombol */
  P.push(part(rb(0.075, 0.016, 0.008, 2, 0.003), C.plate, { p: [-0.135, 0.078, 0.224] }));
  [[0.105, C.red], [0.142, C.knob], [0.179, C.knob]].forEach(([x, col]) => {
    P.push(part(new THREE.CylinderGeometry(0.011, 0.012, 0.014, 16), col, { p: [x, 0.078, 0.224], r: [Math.PI / 2, 0, 0] }));
  });

  /* sisi kiri karakter (+X): kisi ventilasi */
  for (let i = 0; i < 6; i++) P.push(part(rb(0.016, 0.014, 0.22, 1, 0.006), C.rib, { p: [0.2705, cy - 0.09 + i * 0.036, -0.01] }));
  /* sisi kanan karakter (−X): dua kenop + kisi speaker */
  [0.345, 0.235].forEach((y, i) => {
    P.push(part(new THREE.CylinderGeometry(0.052, 0.052, 0.008, 28), C.knobDark, { p: [-0.272, y, 0.06], r: [0, 0, Math.PI / 2] }));
    P.push(part(new THREE.CylinderGeometry(0.038, 0.043, 0.032, 28), C.knob, { p: [-0.289, y, 0.06], r: [0, 0, Math.PI / 2] }));
    P.push(part(rb(0.006, 0.034, 0.008, 1, 0.002), C.knobDark, { p: [-0.3065, y + 0.016, 0.06], r: [i ? 0.7 : -0.4, 0, 0] }));
  });
  for (let i = 0; i < 4; i++) P.push(part(rb(0.016, 0.012, 0.15, 1, 0.005), C.rib, { p: [-0.2705, 0.085 + i * 0.03, 0.02] }));

  /* leher + dudukan antena */
  P.push(part(new THREE.CylinderGeometry(0.078, 0.09, 0.08, 24), C.neck, { p: [0, 0.0, 0] }));
  P.push(part(new THREE.SphereGeometry(0.042, 20, 12), C.neck, { p: [0, cy + h / 2 - 0.004, -0.03], s: [1, 0.55, 1] }));

  const plastic = merge(P);

  /* antena: dua batang krom membentuk V + bola ujung */
  const M = [];
  const base = [0, cy + h / 2 + 0.012, -0.03];
  [-1, 1].forEach((sgn) => {
    const ang = sgn * 0.5, len = 0.2;
    const rod = prep(new THREE.CylinderGeometry(0.0045, 0.006, len, 10));
    rod.translate(0, len / 2, 0); rod.rotateZ(ang); rod.translate(base[0], base[1], base[2]);
    M.push(rod);
    const tip = prep(new THREE.SphereGeometry(0.013, 14, 10));
    tip.translate(base[0] - Math.sin(ang) * len, base[1] + Math.cos(ang) * len, base[2]);
    M.push(tip);
  });
  const metal = merge(M);

  /* layar: kisi persegi yang menggembung (kaca cembung), tepinya tertutup bezel */
  const sw = holeW + 0.016, sh = holeH + 0.016, nx = 18, ny = 14, bulge = 0.017;
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    const a = i / nx * 2 - 1, b = j / ny * 2 - 1;
    const x = a * sw / 2, y = b * sh / 2;
    pos.push(x, holeY + y, 0.2015 + bulge * (1 - a * a) * (1 - b * b));
    uv.push(x / holeW + 0.5, y / holeH + 0.5);
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, e = c + 1;
    idx.push(a, b, c, b, e, c);
  }
  const screen = new THREE.BufferGeometry();
  screen.setIndex(idx);
  screen.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  screen.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  screen.computeVertexNormals();

  cache = { plastic, metal, screen };
  return cache;
}
