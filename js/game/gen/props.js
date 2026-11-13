import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { prep, place, paint, merge, roundRect } from './build.js';
import { swatchUV, rectUV } from './atlas.js';

/* Prop interaktif — semuanya dimodelkan dari kode. Tiap prop = satu geometri gabungan ber-UV atlas
   (bahan dibedakan lewat swatch), ditambah geometri "glow" terpisah untuk bagian yang menyala. */
const HALF = Math.PI / 2;

/* satu bagian: bahan = nama swatch, atau { rect, map(x,y,z) -> [s,t] } untuk gambar di atlas */
function piece(geo, hex, mat, { p, r, s, ao } = {}) {
  geo = prep(geo);
  const pos = geo.attributes.position, uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const q = typeof mat === 'string' ? swatchUV(mat) : rectUV(mat.rect, ...mat.map(pos.getX(i), pos.getY(i), pos.getZ(i)));
    uv[i * 2] = q[0]; uv[i * 2 + 1] = q[1];
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (p || r || s) place(geo, p, r, s);
  return paint(geo, hex, ao);
}

function glowPiece(geo, hex, kind, { p, r, uv } = {}) {
  if (p || r) place(geo, p, r);
  const n = geo.attributes.position.count, k = new Float32Array(n).fill(kind);
  if (uv) { const a = geo.attributes.uv; for (let i = 0; i < n; i++) a.setXY(i, uv[0], uv[1]); }
  geo.setAttribute('aKind', new THREE.BufferAttribute(k, 1));
  return paint(geo, hex);
}

const cylZ = (r0, r1, h, seg) => { const g = new THREE.CylinderGeometry(r0, r1, h, seg); g.rotateX(HALF); return g; };

/* ——— kaset VHS: cangkang + pelat depan berjendela, dua reel dan gulungan pita di dalam, label, rusuk, sekrup ——— */
export function createVhsGeometry() {
  const P = [], BLK = '#1c1d21', BLK2 = '#25262b';
  P.push(piece(new RoundedBoxGeometry(0.56, 0.32, 0.048, 2, 0.012), BLK, 'matte', { p: [0, 0, -0.014] }));
  const sh = roundRect(new THREE.Shape(), 0.56, 0.32, 0.014);
  sh.holes.push(roundRect(new THREE.Path(), 0.31, 0.112, 0.02, 0, 0.04));
  P.push(piece(new THREE.ExtrudeGeometry(sh, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2, curveSegments: 6 }), BLK2, 'matte', { p: [0, 0, 0.012] }));
  P.push(piece(new RoundedBoxGeometry(0.5, 0.026, 0.07, 1, 0.006), BLK2, 'gloss', { p: [0, 0.158, -0.002] }));     // pintu pita
  [[-0.082, 0.07], [0.082, 0.046]].forEach(([x, roll]) => {
    P.push(piece(cylZ(roll, roll, 0.012, 22), '#2d2019', 'gloss', { p: [x, 0.04, 0.016] }));                       // gulungan pita
    P.push(piece(cylZ(0.034, 0.034, 0.018, 18), '#efeee9', 'gloss', { p: [x, 0.04, 0.019] }));                     // reel
    for (let k = 0; k < 3; k++) P.push(piece(new THREE.BoxGeometry(0.066, 0.011, 0.019), '#efeee9', 'gloss', { p: [x, 0.04, 0.0195], r: [0, 0, k * Math.PI / 3] }));
    P.push(piece(cylZ(0.012, 0.012, 0.021, 10), '#15161a', 'matte', { p: [x, 0.04, 0.02] }));
  });
  P.push(piece(new THREE.BoxGeometry(0.44, 0.1, 0.003), '#ffffff', { rect: 'label', map: (x, y) => [x / 0.44 + 0.5, y / 0.1 + 0.5] }, { p: [0, -0.087, 0.0372] }));
  P.push(piece(new THREE.BoxGeometry(0.34, 0.003, 0.034), '#efeae0', 'paper', { p: [0, -0.1605, -0.004] }));        // label punggung
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 5; i++) P.push(piece(new THREE.BoxGeometry(0.034, 0.007, 0.004), '#34353c', 'matte', { p: [sx * 0.232, 0.008 + i * 0.016, 0.0375] }));
    for (const sy of [-1, 1]) P.push(piece(cylZ(0.008, 0.008, 0.004, 8), '#a3a6ae', 'metal', { p: [sx * 0.258, sy * 0.138, 0.0365] }));
  }
  /* sisi belakang: dua lubang spindel bercincin, alur bawah, sekrup tengah */
  for (const sx of [-1, 1]) {
    P.push(piece(cylZ(0.046, 0.046, 0.004, 18), BLK2, 'matte', { p: [sx * 0.082, 0.04, -0.0385] }));
    P.push(piece(cylZ(0.03, 0.03, 0.006, 14), '#0c0c0f', 'matte', { p: [sx * 0.082, 0.04, -0.0388] }));
    for (const sy of [-1, 1]) P.push(piece(cylZ(0.008, 0.008, 0.004, 8), '#a3a6ae', 'metal', { p: [sx * 0.258, sy * 0.138, -0.0385] }));
  }
  P.push(piece(new THREE.BoxGeometry(0.5, 0.022, 0.004), BLK2, 'matte', { p: [0, -0.12, -0.0385] }));
  P.push(piece(new THREE.BoxGeometry(0.2, 0.06, 0.003), '#efeae0', 'paper', { p: [0, -0.06, -0.0388] }));
  return merge(P);
}

/* kaca jendela kaset (material transparan terpisah) */
export function createVhsGlassGeometry() {
  const g = new THREE.BoxGeometry(0.31, 0.112, 0.004);
  g.translate(0, 0.04, 0.0305);
  return g;
}

/* ——— jump pad: rangka logam, bingkai ber-bevel, sabuk hazard, blok sudut berbaut; panel chevron menyala ——— */
export function createPadGeometry() {
  const P = [], G = [];
  P.push(piece(new RoundedBoxGeometry(1.7, 0.3, 1.7, 2, 0.05), '#7c8189', 'metal', { p: [0, 0.15, 0], ao: (x, y) => 0.7 + 0.3 * Math.min(1, y / 0.12) }));
  const fr = roundRect(new THREE.Shape(), 1.56, 1.56, 0.08);
  fr.holes.push(roundRect(new THREE.Path(), 1.18, 1.18, 0.05));
  P.push(piece(new THREE.ExtrudeGeometry(fr, { depth: 0.045, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2, curveSegments: 5 }), '#a3a8b0', 'steel', { r: [-HALF, 0, 0], p: [0, 0.3, 0] }));
  for (let k = 0; k < 4; k++) {
    const hz = piece(new THREE.BoxGeometry(1.06, 0.16, 0.03), '#ffffff', { rect: 'hazard', map: (x, y) => [(x / 1.06 + 0.5) * 1.25, y / 0.16 + 0.5] }, { p: [0, 0.14, 0.856] });
    hz.rotateY(k * HALF); P.push(hz);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    P.push(piece(new RoundedBoxGeometry(0.34, 0.38, 0.34, 1, 0.045), '#34373e', 'matte', { p: [sx * 0.74, 0.19, sz * 0.74], ao: (x, y) => 0.72 + 0.28 * Math.min(1, y / 0.15) }));
    P.push(piece(new THREE.CylinderGeometry(0.055, 0.06, 0.03, 6), '#bcc0c8', 'metal', { p: [sx * 0.74, 0.39, sz * 0.74] }));
  }
  const panel = new THREE.PlaneGeometry(1.18, 1.18); panel.rotateX(-HALF);
  G.push(glowPiece(panel, '#3f8dff', 0, { p: [0, 0.318, 0] }));
  for (let k = 0; k < 4; k++) { const s = glowPiece(new THREE.BoxGeometry(1.16, 0.022, 0.03), '#55a2ff', 1, { p: [0, 0.332, 0.59] }); s.rotateY(k * HALF); G.push(s); }
  return { body: merge(P), glow: merge(G), size: [1.7, 0.33, 1.7] };
}

/* ——— pegas ring: alas segi delapan, pelat baja, inti menyala, tiga cincin neon yang naik ——— */
export function createSpringGeometry() {
  const P = [], G = [];
  P.push(piece(new THREE.CylinderGeometry(0.6, 0.72, 0.28, 8), '#2d2f38', 'matte', { p: [0, 0.14, 0], ao: (x, y) => 0.7 + 0.3 * Math.min(1, y / 0.14) }));
  P.push(piece(new THREE.CylinderGeometry(0.66, 0.66, 0.06, 8), '#7a7e88', 'steel', { p: [0, 0.31, 0] }));
  P.push(piece(new THREE.CylinderGeometry(0.42, 0.46, 0.05, 24), '#1a1b21', 'gloss', { p: [0, 0.355, 0] }));
  for (let k = 0; k < 4; k++) {
    const c = piece(new RoundedBoxGeometry(0.2, 0.16, 0.26, 1, 0.03), '#8c909a', 'metal', { p: [0, 0.3, 0.6] });
    c.rotateY(k * HALF + HALF / 2); P.push(c);
  }
  G.push(glowPiece(new THREE.CylinderGeometry(0.34, 0.34, 0.02, 24), '#b565ff', 1, { p: [0, 0.385, 0] }));
  for (let k = 0; k < 3; k++) {
    const t = new THREE.TorusGeometry(0.5, 0.042, 8, 30); t.rotateX(HALF);
    G.push(glowPiece(t, '#c27bff', 2, { p: [0, 0.48, 0], uv: [0.48, k / 3] }));
  }
  return { body: merge(P), glow: merge(G), radius: 0.66, top: 0.34 };
}

/* ——— troli: dek pelat anti-selip, balok samping hazard, bumper karet, rangka bawah, empat roda + as ——— */
export function createCartGeometry() {
  const P = [];
  P.push(piece(new RoundedBoxGeometry(2.6, 0.2, 1.7, 1, 0.035), '#ffffff', { rect: 'plate', map: (x, y, z) => [x / 2.6 + 0.5, z / 1.7 + 0.5] }, { p: [0, -0.1, 0] }));
  for (const sz of [-1, 1]) P.push(piece(new THREE.BoxGeometry(2.6, 0.22, 0.07), '#ffffff', { rect: 'hazard', map: (x, y) => [(x / 2.6 + 0.5) * 2.5, y / 0.22 + 0.5] }, { p: [0, -0.1, sz * 0.866] }));
  for (const sx of [-1, 1]) {
    P.push(piece(new RoundedBoxGeometry(0.14, 0.3, 1.86, 1, 0.03), '#3e4149', 'matte', { p: [sx * 1.33, -0.1, 0] }));
    for (const sz of [-1, 1]) P.push(piece(new RoundedBoxGeometry(0.07, 0.16, 0.4, 1, 0.025), '#18181b', 'rubber', { p: [sx * 1.42, -0.1, sz * 0.5] }));
    P.push(piece(cylZ(0.035, 0.035, 1.5, 8), '#8f939c', 'steel', { p: [sx * 0.85, -0.44, 0] }));
    for (const sz of [-1, 1]) {
      P.push(piece(cylZ(0.2, 0.2, 0.13, 20), '#1c1c1f', 'rubber', { p: [sx * 0.85, -0.44, sz * 0.7] }));
      P.push(piece(cylZ(0.095, 0.095, 0.15, 10), '#b3b7bf', 'metal', { p: [sx * 0.85, -0.44, sz * 0.7] }));
    }
  }
  P.push(piece(new THREE.BoxGeometry(2.2, 0.12, 1.2), '#2c2e34', 'matte', { p: [0, -0.26, 0], ao: () => 0.75 }));
  return { body: merge(P), size: [2.74, 0.2, 1.8], railY: -0.67, wheelZ: 0.7 };
}

/* balok satuan (rel, bantalan) untuk di-instance dengan skala berbeda */
export function createRailGeometry() {
  return piece(new THREE.BoxGeometry(1, 1, 1), '#ffffff', 'steel');
}
