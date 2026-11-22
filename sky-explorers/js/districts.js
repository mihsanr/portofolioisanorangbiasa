// Distrik Bandung di sekeliling kota: Kota Lama (Asia Afrika, Alun-Alun, Braga, stasiun), sungai & Jembatan
// Pasupati, Dago (vila & menara pandang), Lembang (peternakan, kebun bunga, kawah). Dimodelkan dari foto.
// Letaknya bebas (dunia fantasi terinspirasi Bandung), bentuknya mengikuti aslinya.
import * as THREE from 'three';
import * as M from './models.js';
import { row, hipRoof, sign, arch, pyramid } from './landmarks.js';
import { toon } from './toon.js';
import { LITE } from './config.js';

const { part, bake, sph, cyl, cone, rbox, lathe, torus, slab } = M;
const PI = Math.PI, TAU = PI * 2;
const WHITE = 0xf8f5ee, TRIM = 0xfffdf8, SLATE = 0x4a5361, DARK = 0x2d3440, GLASS = 0x4b6480, GOLD = 0xe0a92e, TILE_R = 0xb4492f, STONE = 0xcfc9bd;
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ── Kerangka lokal: e = sepanjang distrik, o = ke arah luar pulau ──
const PHI = 20 * PI / 180, OT = { x: 120.4, z: 330.8, y: 5 };                    // Kota Lama
const E = [Math.cos(PHI), -Math.sin(PHI)], N = [Math.sin(PHI), Math.cos(PHI)];
export const oldTown = (e, o) => [OT.x + E[0] * e + N[0] * o, OT.z + E[1] * e + N[1] * o];
const RT = 128 * PI / 180, U = [Math.cos(RT), Math.sin(RT)], T = [U[1], -U[0]];   // sungai: menjauhi pusat searah U
export const BRIDGE = { x: U[0] * 378, z: U[1] * 378 };
export const bridgeAt = (e, s = 0) => [BRIDGE.x + T[0] * e + U[0] * s, BRIDGE.z + T[1] * e + U[1] * s];
export const LEMBANG = { x: -183, z: -317, y: 14 }, CRATER = { x: 95, z: -372, y: 40 }, DAGO = { x: 172, z: -322 };

// Bentuk lahan: pelataran Kota Lama & Lembang, tumpuan jembatan, alur sungai, kawah.
export function shapeLand(x, z, h) {
  const dx = x - OT.x, dz = z - OT.z, e = dx * E[0] + dz * E[1], o = dx * N[0] + dz * N[1];
  h += (OT.y - h) * (1 - ss(112, 136, Math.abs(e))) * (1 - ss(38, 58, Math.abs(o)));
  h += (LEMBANG.y - h) * (1 - ss(36, 62, Math.hypot(x - LEMBANG.x, z - LEMBANG.z)));
  h += (CRATER.y - h) * (1 - ss(24, 62, Math.hypot(x - CRATER.x, z - CRATER.z)));
  const bx = x - BRIDGE.x, bz = z - BRIDGE.z, be = bx * T[0] + bz * T[1], bo = bx * U[0] + bz * U[1];
  h += (5 - h) * (1 - ss(88, 108, Math.abs(be))) * (1 - ss(12, 30, Math.abs(bo)));
  const s = x * U[0] + z * U[1], d = Math.abs(x * T[0] + z * T[1]);
  return h + (-5 - h) * (1 - ss(10, 27, d)) * ss(322, 352, s);
}
export const inDistrict = (x, z) => {
  const dx = x - OT.x, dz = z - OT.z, e = Math.abs(dx * E[0] + dz * E[1]), o = Math.abs(dx * N[0] + dz * N[1]);
  const bx = x - BRIDGE.x, bz = z - BRIDGE.z, be = Math.abs(bx * T[0] + bz * T[1]), bo = Math.abs(bx * U[0] + bz * U[1]);
  return (e < 118 && o < 42) || (be < 92 && bo < 16) || Math.abs(x * T[0] + z * T[1]) < 22 && x * U[0] + z * U[1] > 310 || Math.hypot(x - LEMBANG.x, z - LEMBANG.z) < 44 || Math.hypot(x - CRATER.x, z - CRATER.z) < 32 || Math.hypot(x - DAGO.x, z - DAGO.z) < 12;
};

// ── Bangunan biasa (dikirim ke city.js supaya dapat fasad, atap, AO, tabrakan). kind 3 = ruko kolonial Braga ──
const quad = (f, e0, e1, o0, o1) => [...f(e0, o0), ...f(e1, o0), ...f(e1, o1), ...f(e0, o1)];
export const BUILDINGS_X = (() => {
  const L = []; let k = 3; const rnd = () => (k = (k * 16807) % 2147483647) / 2147483647;
  for (const [o0, o1] of [[8.5, 17], [27, 36]]) for (let e = 14; e < 104;) { const w = 6.5 + rnd() * 4; L.push([3, 2 + (rnd() < 0.35), ...quad(oldTown, e, Math.min(106, e + w), o0, o1)]); e += w + (rnd() < 0.2 ? 2.5 : 0.15); } // Braga dua sisi
  for (let e = -2; e < 58;) { const w = 9 + rnd() * 5; L.push([1, 2 + Math.floor(rnd() * 4), ...quad(oldTown, e, e + w, -21 - rnd() * 3, -10)]); e += w + 1.2; }        // kantor Asia Afrika
  for (let e = -104; e < -84; e += 9) L.push([3, 2, ...quad(oldTown, e, e + 8, 10, 20)]);
  const house = (x, z, w, d, a, lv = 1) => { const c = Math.cos(a), s = Math.sin(a); return [0, lv, ...[[-w, -d], [w, -d], [w, d], [-w, d]].flatMap(([u, v]) => [x + u * c - v * s, z + u * s + v * c])]; };
  for (const [x, z, a] of [[-206, -298, 0.4], [-212, -318, 0.1], [-204, -338, -0.3], [-160, -338, 0.6], [-150, -322, 0.9]]) L.push(house(x, z, 3.4, 2.8, a));            // rumah kayu Lembang
  for (const [x, z, a] of [[34, -318, 0.1], [52, -326, 0.4], [70, -322, -0.2], [86, -330, 0.2], [104, -324, 0.5], [120, -334, 0], [138, -328, -0.4], [60, -338, 0.3], [112, -343, 0.1], [150, -338, 0.7]]) L.push(house(x, z, 3.6, 2.8, a, 2)); // vila Dago
  return L;
})();

// ── Jalan ──
const way = (f, pts) => pts.map(([e, o]) => f(e, o));
export const ROADS_X = [
  { w: 4.6, main: true, pts: way(oldTown, [[-128, -2], [-60, -2], [0, -2], [60, -2], [124, -2]]) },                       // Asia Afrika
  { w: 3.4, brick: true, pts: way(oldTown, [[8, 22], [60, 22], [112, 22]]) }, { w: 2.4, pts: way(oldTown, [[112, 22], [116, 10], [114, -2]]) }, { w: 2.4, pts: way(oldTown, [[8, 22], [4, 10], [4, -2]]) }, // Braga
  { w: 3.6, main: true, pts: [oldTown(2, -2), oldTown(0, -30), [104, 292], [98, 268]] }, { w: 2.6, pts: [oldTown(112, -2), [208, 268], [196, 238]] },
  { w: 2.9, main: true, pts: [bridgeAt(-74), [-266, 238], [-236, 240], [-208, 243], [-184, 241.4]] }, { w: 3.6, main: true, pts: [bridgeAt(74), [-152, 330], [-112, 326], [-72, 338], [-34, 356], oldTown(-124, -2)] },
  { w: 2.4, pts: [[8, -296], [30, -310], [60, -315], [80, -313], [98, -318], [128, -318], [150, -316], [172, -313], [186, -300], [190, -282]] },       // Dago berkelok
  { w: 2.4, pts: [[-112, -290], [-130, -296], [-148, -304], [-164, -311]] },                                                   // Lembang
];
// dekat jalan distrik? (pohon & hewan menghindar)
export const onRoad = (x, z, r = 8) => ROADS_X.some(({ pts }) => pts.some((p, i) => {
  if (!i) return false;
  const q = pts[i - 1], dx = p[0] - q[0], dz = p[1] - q[1], t = Math.min(1, Math.max(0, ((x - q[0]) * dx + (z - q[1]) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - q[0] - dx * t, z - q[1] - dz * t) < r;
}));
// penyeberangan zebra (putih) di Asia Afrika: [x, z, arah e]
export const ZEBRA = [-8, 38, 100].flatMap(e0 => Array.from({ length: 7 }, (_, i) => way(oldTown, [[e0 - 2.6, -5.4 + i * 1.13], [e0 + 2.6, -5.4 + i * 1.13]])));
export const TREES_X = [...Array.from({ length: 22 }, (_, i) => [...oldTown(-106 + i * 10, i % 2 ? 5.6 : -8.4), i % 4 === 0 ? 'wide' : 'tree', 0.5]), ...Array.from({ length: 8 }, (_, i) => [...oldTown(20 + i * 11.5, 18.1), 'tree', 0.36]),
  ...Array.from({ length: 10 }, (_, i) => [...oldTown(-52 + i * 5.4, 37.2), 'flame', 0.45]),
  ...Array.from({ length: 13 }, (_, i) => [...oldTown(8 + i * 8, -28.6 + (i % 2) * 1.2), i % 3 ? 'tree' : 'wide', 0.5])];

// ── Gedung Merdeka: blok kiri beratap genteng, blok tengah Art Deco bertingkat + kanopi pilar emas, sayap lengkung kanan ──
function merdeka() {
  const P = [part(rbox(46, 0.5, 18, 0.15), STONE, { p: [0, 0.25, 0] })];
  P.push(part(rbox(17, 6.4, 13, 0.2), WHITE, { p: [13.5, 3.6, 0.5] }), part(hipRoof(18.4, 14.4, 3.2), TILE_R, { p: [13.5, 6.8, 0.5], crease: 20 }), part(rbox(18.2, 0.5, 14.2, 0.1), TRIM, { p: [13.5, 6.75, 0.5] }));
  row(P, { from: 6.8, to: 20.4, step: 2.25, y: 1.6, face: 'front', at: -6.08, w: 1.25, h: 3.9, shape: 'box', color: GLASS });
  P.push(part(rbox(16, 9.4, 13, 0.2), TRIM, { p: [-3.5, 4.9, 0] }), part(rbox(11, 2.0, 10, 0.15), WHITE, { p: [-3.5, 10.4, 0] }), part(rbox(7, 1.4, 7, 0.12), TRIM, { p: [-3.5, 12, 0] }));
  for (const y of [4.6, 7.2, 9.5]) P.push(part(rbox(16.5, 0.32, 13.5, 0.08), WHITE, { p: [-3.5, y, 0] }));
  for (const y of [5.2, 7.7]) row(P, { from: -9.5, to: 2.5, step: 2, y, face: 'front', at: -6.58, w: 1.1, h: 1.5, shape: 'box', color: GLASS });
  P.push(part(rbox(13, 0.7, 4.4, 0.15), TRIM, { p: [-3.5, 3.9, -8.2] }), part(rbox(12.4, 0.5, 0.3, 0.05), GOLD, { p: [-3.5, 3.9, -10.4] }));
  for (const x of [-9, -5.5, -1.5, 2]) P.push(part(cyl(0.42, 0.5, 3.4, 12), GOLD, { p: [x, 2, -9.6] }), part(torus(0.5, 0.12, 6, 14), TRIM, { p: [x, 3.5, -9.6], r: [PI / 2, 0, 0] }));
  for (const x of [-7.3, -3.5, 0.3]) P.push(part(rbox(2.2, 2.9, 0.2, 0.05), 0xc98f3c, { p: [x, 1.9, -6.6] }));
  P.push(part(new THREE.CylinderGeometry(8, 8, 6.6, 28, 1, false, PI * 0.5, PI), WHITE, { p: [-13.5, 3.7, 2], crease: 50 }), part(rbox(8, 6.6, 12, 0.1), WHITE, { p: [-12.6, 3.7, 2] }), part(new THREE.CylinderGeometry(8.3, 8.3, 0.5, 28), TRIM, { p: [-13.5, 7.1, 2] }));
  for (let i = 0; i < 5; i++) P.push(part(new THREE.CylinderGeometry(8.08, 8.08, 0.22, 28, 1, true), 0xd9d4c8, { p: [-13.5, 1.6 + i * 1.15, 2] }));
  const s = sign('GEDUNG MERDEKA', { w: 11, h: 1.1, bg: '#fffdf8', fg: '#a87416' }); s.position.set(-3.5, 4.75, -10.45);
  for (const x of [-7, -3.5, 0]) P.push(part(cyl(0.08, 0.1, 5, 6), 0x8a8f98, { p: [x, 14.6, 0] }));
  return { geo: bake(P), extras: [s], cols: [{ x: 13.5, z: 0.5, r: 9.5, top: 10 }, { x: -3.5, z: 0, r: 9, top: 13 }, { x: -14, z: 2, r: 8, top: 7.5 }] };
}
// ── Masjid Raya: aula putih, kubah perak bermotif, dua kubah emas, gerbang lengkung; menara kembar dipasang terpisah ──
function minaret(P, x, z) {
  P.push(part(cyl(1.7, 2.2, 40, 8), TRIM, { p: [x, 20, z], crease: 30 }));
  for (const y of [9, 20, 31]) P.push(part(cyl(2.35, 2.35, 0.7, 8), WHITE, { p: [x, y, z], crease: 30 }), part(cyl(2.1, 2.4, 0.5, 8), STONE, { p: [x, y - 0.6, z], crease: 30 }));
  P.push(part(cyl(3.1, 1.75, 3, 8), TRIM, { p: [x, 41.2, z], crease: 30 }), part(cyl(2.9, 2.9, 2.2, 8), GLASS, { p: [x, 43.6, z], crease: 30 }), part(cyl(3.2, 3.2, 0.4, 8), TRIM, { p: [x, 44.9, z], crease: 30 }));
  P.push(part(cone(3.3, 2, 8), SLATE, { p: [x, 46, z], crease: 30 }), part(cone(1.9, 2.2, 8), DARK, { p: [x, 47.6, z], crease: 30 }), part(cone(0.3, 2, 8), GOLD, { p: [x, 49.4, z] }));
}
function masjidraya() {
  const P = [part(rbox(34, 0.6, 30, 0.2), STONE, { p: [0, 0.3, 0] }), part(rbox(28, 8, 22, 0.25), TRIM, { p: [0, 4.4, 2] }), part(rbox(28.6, 0.7, 22.6, 0.15), WHITE, { p: [0, 8.5, 2] })];
  P.push(part(cyl(8.4, 8.4, 2, 32), WHITE, { p: [0, 9.6, 2] }), part(new THREE.SphereGeometry(8, 32, 16, 0, TAU, 0, PI / 2), c => (Math.floor(Math.atan2(c.z - 2, c.x) * 5) + Math.floor(c.y * 1.1)) % 2 ? 0xdfe7ee : 0xb9c7d4, { p: [0, 10.4, 2], crease: 60 }), part(cone(0.35, 2.4, 8), GOLD, { p: [0, 19.4, 2] }));
  for (const x of [-10.5, 10.5]) P.push(part(cyl(2.8, 2.8, 1, 20), WHITE, { p: [x, 9.2, -4] }), part(new THREE.SphereGeometry(2.6, 20, 10, 0, TAU, 0, PI / 2), GOLD, { p: [x, 9.6, -4], crease: 60 }));
  P.push(part(rbox(9, 9.4, 3, 0.2), TRIM, { p: [0, 5, -10.4] }), part(slab(arch(5, 7), 0.3, 0.05), 0x3f8f7a, { p: [0, 0.7, -11.9], crease: 40 }), part(new THREE.SphereGeometry(2.4, 18, 9, 0, TAU, 0, PI / 2), WHITE, { p: [0, 9.6, -10.4], crease: 60 }));
  row(P, { from: -12, to: 12, step: 2.6, y: 1.4, face: 'front', at: -9.1, w: 1.5, h: 4.6, color: 0x3f8f7a, skip: t => Math.abs(t) < 5 });
  minaret(P, -15, -20); minaret(P, 15, -20);
  return { geo: bake(P), cols: [{ x: 0, z: 2, r: 14, top: 14 }, { x: 0, z: 2, r: 7, top: 20 }, { x: -15, z: -20, r: 2.6, top: 51 }, { x: 15, z: -20, r: 2.6, top: 51 }] };
}
// ── Alun-Alun: rumput sintetis bergaris & kotak konsentris, gedung hitam panjang bertulisan BANDUNG ──
function alunalun() {
  const P = [part(rbox(48, 0.3, 34, 0.1), 0xded7c9, { p: [0, 0.12, 0] }), part(rbox(30, 4, 3.4, 0.15), 0x23262d, { p: [3, 2.2, 14.4] }), part(rbox(31, 0.4, 4, 0.1), TRIM, { p: [3, 4.4, 14.4] }), part(rbox(30, 0.5, 0.2, 0.05), 0xe0453a, { p: [3, 0.6, 12.6] })];
  for (let i = 0; i < 9; i++) P.push(part(rbox(3.2, 0.7, 1.6, 0.2), 0xb9b2a5, { p: [-20 + i * 5, 0.5, -15] }), part(sph(8, 6), [0xff7aa8, 0xffd23a, 0x5fbf4a][i % 3], { p: [-20 + i * 5, 1.0, -15], s: [1.4, 0.5, 0.6] }));
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  for (let i = 0; i < 12; i++) { g.fillStyle = i % 2 ? '#49a83e' : '#6cc653'; g.fillRect(i * 22, 0, 22, 256); }
  for (let i = 5; i > 0; i--) { g.fillStyle = i % 2 ? '#3f9a38' : '#7fd35f'; const s = i * 26; g.fillRect(128 - s / 2, 128 - s / 2, s, s); }
  g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 3; g.strokeRect(6, 6, 244, 244);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const f = new THREE.Mesh(new THREE.PlaneGeometry(42, 25).rotateX(-PI / 2), toon({ map: t })); f.position.set(0, 0.34, -1); f.receiveShadow = true;
  const s = sign('BANDUNG', { w: 16, h: 2.4, bg: '#23262d', fg: '#ffffff' }); s.position.set(3, 2.4, 12.68);
  return { geo: bake(P), extras: [f, s], cols: [{ x: -6, z: 14.4, r: 4, top: 5 }, { x: 3, z: 14.4, r: 4, top: 5 }, { x: 12, z: 14.4, r: 4, top: 5 }] };
}
// ── Stasiun: aula putih, blok tengah tinggi berjendela kisi, peron, lokomotif uap pajangan ──
function stasiun() {
  const P = [part(rbox(52, 0.4, 20, 0.1), STONE, { p: [0, 0.2, 0] }), part(rbox(44, 5.4, 9, 0.2), WHITE, { p: [0, 3, 0] }), part(rbox(44.8, 0.5, 9.8, 0.1), 0x7f93a6, { p: [0, 5.8, 0] })];
  P.push(part(rbox(15, 11, 10, 0.2), TRIM, { p: [0, 5.8, -0.3] }), part(rbox(16, 0.9, 11, 0.15), WHITE, { p: [0, 11.4, -0.3] }), part(rbox(12, 1, 8, 0.12), TRIM, { p: [0, 12.2, -0.3] }), part(rbox(8.4, 5.6, 0.2, 0.05), 0x2f4157, { p: [0, 7.4, -5.35] }));
  for (let i = 0; i < 6; i++) P.push(part(rbox(0.22, 5.6, 0.2, 0.05), TRIM, { p: [-3.5 + i * 1.4, 7.4, -5.5] }));
  for (const y of [6, 7.5, 9]) P.push(part(rbox(8.4, 0.2, 0.2, 0.05), TRIM, { p: [0, y, -5.5] }));
  row(P, { from: -20, to: 20, step: 2.8, y: 1.2, face: 'front', at: -4.58, w: 1.7, h: 2.8, shape: 'box', color: GLASS, skip: t => Math.abs(t) < 8 });
  P.push(part(rbox(42, 0.35, 5, 0.1), 0x8a98a6, { p: [0, 4, -7] }), part(rbox(50, 0.4, 5, 0.1), 0x8a98a6, { p: [0, 4.6, 8.4] }));
  for (let x = -20; x <= 20; x += 5) P.push(part(cyl(0.18, 0.18, 4, 8), 0x5b6672, { p: [x, 2, -9] }), part(cyl(0.18, 0.18, 4.6, 8), 0x5b6672, { p: [x, 2.3, 10.2] }));
  // lokomotif uap di meja putar
  const lx = 31; P.push(part(cyl(6, 6.2, 0.8, 28), 0x6d7077, { p: [lx, 0.4, -4] }), part(cyl(1.25, 1.25, 5, 16), 0x22252b, { p: [lx, 2.6, -4], r: [0, 0, PI / 2] }), part(rbox(2.6, 2.8, 2.8, 0.15), 0x22252b, { p: [lx + 3, 3, -4] }), part(rbox(3, 0.3, 3.2, 0.08), 0xb5402f, { p: [lx + 3, 4.5, -4] }), part(cyl(0.5, 0.35, 1.6, 10), 0x22252b, { p: [lx - 1.7, 4.4, -4] }), part(sph(10, 8), GOLD, { p: [lx, 3.9, -4], s: [0.45, 0.5, 0.45] }));
  for (const z of [-5.2, -2.8]) for (let i = 0; i < 4; i++) P.push(part(cyl(0.7, 0.7, 0.3, 14), 0xb5402f, { p: [lx - 2.2 + i * 1.7, 1.5, z], r: [PI / 2, 0, 0] }));
  const s = sign('STASIUN BANDUNG', { w: 12, h: 1.3, bg: '#ffffff', fg: '#1d4f9a' }); s.position.set(0, 5.0, -9.6);
  return { geo: bake(P), extras: [s], cols: [{ x: -14, z: 0, r: 8, top: 7 }, { x: 0, z: 0, r: 9, top: 13 }, { x: 14, z: 0, r: 8, top: 7 }, { x: lx, z: -4, r: 5, top: 6 }] };
}
// ── Papan & gerbang Jalan Braga ──
function braga() {
  const P = [];
  for (const x of [-4.6, 4.6]) P.push(part(cyl(0.28, 0.4, 7.4, 10), 0x1f2a2e, { p: [x, 3.7, 0] }), part(sph(10, 8), 0xfff0b0, { p: [x, 7.9, 0], s: [0.6, 0.75, 0.6] }), part(cone(0.5, 0.6, 8), 0x1f2a2e, { p: [x, 8.8, 0] }));
  P.push(part(rbox(9.6, 0.3, 0.3, 0.1), 0x1f2a2e, { p: [0, 6.9, 0] }), part(rbox(7.6, 2, 0.4, 0.3), 0x1f3b3a, { p: [0, 5.6, 0] }));
  for (const x of [-4.1, 4.1]) P.push(part(torus(0.7, 0.14, 6, 16), 0x1f2a2e, { p: [x * 0.98, 5.6, 0] }));
  const s = sign('JL. BRAGA', { w: 6.6, h: 1.4, bg: '#1f3b3a', fg: '#f4e7c0' }); s.position.set(0, 5.6, -0.24);
  return { geo: bake(P), extras: [s], cols: [] };
}
// ── Jembatan Pasupati: dek lengkung, satu tiang putih berpuncak jingga, kabel putih berujung jingga ──
export const deckY = e => 4.6 + 12 * (1 - ss(24, 76, Math.abs(e)));
function pasupati() {
  const P = [], base = 0;
  for (let e = -76; e < 76; e += 4) {
    const a = deckY(e), b = deckY(e + 4), ang = Math.atan2(b - a, 4), y = (a + b) / 2;
    P.push(part(rbox(4.3, 0.9, 10.5, 0.1), 0x8d929b, { p: [e + 2, y - 0.45, 0], r: [0, 0, ang] }), part(rbox(4.3, 0.12, 9, 0.04), 0x565c67, { p: [e + 2, y + 0.06, 0], r: [0, 0, ang] }));
    for (const z of [-5, 5]) P.push(part(rbox(4.3, 1.1, 0.4, 0.08), 0xe9e4da, { p: [e + 2, y + 0.5, z], r: [0, 0, ang] }));
    if ((e / 4) % 2 === 0) P.push(part(rbox(2, 0.05, 0.25, 0.02), 0xf6f2e6, { p: [e + 2, y + 0.15, 0], r: [0, 0, ang] }));
  }
  for (const e of [-60, -44, 44, 60]) P.push(part(rbox(2.2, deckY(e) + 6, 6, 0.3), 0xc9c4ba, { p: [e, (deckY(e) - 6) / 2, 0] }));
  const H = 50;
  for (const z of [-1, 1]) P.push(part(cyl(0.9, 1.3, 23, 8), TRIM, { p: [0, 11.2 - 6 + 6, z * 6.4], r: [z * -0.16, 0, 0] }));        // kaki bercabang ke sungai
  P.push(part(new THREE.CylinderGeometry(1.0, 1.9, H - 17, 4, 4).rotateY(PI / 4), c => (c.y > 41 ? 0xe8622c : TRIM), { p: [0, 17 + (H - 17) / 2, 0], crease: 25 }), part(rbox(2.2, 3, 2.2, 0.2), 0xe8622c, { p: [0, H + 0.6, 0] }));
  for (const s of [-1, 1]) for (let i = 0; i < 7; i++) {
    const e = s * (14 + i * 8), y0 = deckY(e) + 0.6, y1 = 30 + i * 3, len = Math.hypot(e, y1 - y0), ang = Math.atan2(y1 - y0, -e);
    P.push(part(cyl(0.3, 0.3, len, 6), 0xffffff, { p: [e / 2, (y0 + y1) / 2, 0], r: [0, 0, ang - PI / 2] }), part(cyl(0.48, 0.48, 4, 8), 0xe8622c, { p: [e - e / len * 2, y0 + (y1 - y0) / len * 2, 0], r: [0, 0, ang - PI / 2] }));
  }
  const cols = [{ x: 0, z: 0, r: 2, top: H + 2, bot: 16 }, ...[-60, -44, 44, 60].map(e => ({ x: e, z: 0, r: 3, top: deckY(e) + 1 })), { x: 0, z: -6.4, r: 1.6, top: 15 }, { x: 0, z: 6.4, r: 1.6, top: 15 }];
  for (let e = -74; e <= 74; e += 5) cols.push({ x: e, z: 0, r: 5.2, top: deckY(e) + 1, bot: deckY(e) - 1 });
  return { geo: bake(P), y: base, cols };
}
// ── Dago: menara pandang di tepi bukit ──
function dago() {
  const P = [part(cyl(5, 5.6, 1, 20), STONE, { p: [0, 0.2, 0] }), part(lathe([[0, 0], [2.6, 0], [1.7, 6], [1.5, 14], [2.4, 16.5], [0, 16.5]], 20), TRIM, { crease: 45 }), part(cyl(6.4, 4.6, 1.2, 28), WHITE, { p: [0, 17, 0] }), part(cyl(5.4, 5.4, 2.6, 28), 0x8fc7e8, { p: [0, 18.8, 0] }), part(cyl(6.8, 6.8, 0.4, 28), TRIM, { p: [0, 20.2, 0] }), part(cone(6.4, 3, 28), TILE_R, { p: [0, 21.8, 0] }), part(cyl(0.1, 0.1, 4, 6), DARK, { p: [0, 25, 0] }), part(rbox(1.8, 0.58, 0.08, 0.02), 0xe02a2f, { p: [0.95, 26.2, 0] }), part(rbox(1.8, 0.58, 0.08, 0.02), 0xffffff, { p: [0.95, 25.62, 0] })];
  for (let i = 0; i < 14; i++) { const a = i / 14 * TAU; P.push(part(cyl(0.12, 0.12, 2.6, 6), TRIM, { p: [Math.cos(a) * 5.45, 18.8, Math.sin(a) * 5.45] })); }
  return { geo: bake(P), cols: [{ x: 0, z: 0, r: 2.6, top: 16 }, { x: 0, z: 0, r: 6, top: 24, bot: 16 }] };
}
// ── Lembang: lumbung merah, silo, pagar, kebun bunga ──
function lembang() {
  const P = [part(rbox(12, 6, 9, 0.15), 0xb23a2e, { p: [0, 3, 0] }), part(slab(new THREE.Shape([[-5.4, 0], [-4.2, 2.4], [0, 4.6], [4.2, 2.4], [5.4, 0]].map(q => new THREE.Vector2(...q))), 13, 0.12), 0xece4d6, { p: [0, 5.9, 0], r: [0, PI / 2, 0], crease: 25 }), part(rbox(0.2, 4, 4, 0.05), TRIM, { p: [-6.05, 2, 0] }), part(rbox(3.2, 4, 0.2, 0.05), TRIM, { p: [0, 2, -4.55] }), part(rbox(0.25, 4.6, 0.1, 0.02), 0xb23a2e, { p: [0, 2, -4.68], r: [0, 0, 0.66] }), part(rbox(0.25, 4.6, 0.1, 0.02), 0xb23a2e, { p: [0, 2, -4.68], r: [0, 0, -0.66] })];
  P.push(part(cyl(2, 2, 9, 18), 0xd8dde2, { p: [9, 4.5, 1] }), part(new THREE.SphereGeometry(2, 18, 8, 0, TAU, 0, PI / 2), 0x9fb2c2, { p: [9, 9, 1], crease: 60 }));
  for (let i = 0; i < 26; i++) { const a = i / 26 * TAU, x = Math.cos(a) * 19, z = 4 + Math.sin(a) * 15; if (i % 13 === 6) continue; P.push(part(rbox(0.3, 1.5, 0.3, 0.05), 0x8a5f3c, { p: [x, 0.7, z] }), part(rbox(4.6, 0.2, 0.15, 0.04), 0xa87a4f, { p: [Math.cos(a + 0.12) * 19, 1.05, 4 + Math.sin(a + 0.12) * 15], r: [0, -a - 0.12 + PI / 2, 0] })); }
  const F = [0xff5a8a, 0xffd23a, 0xb06bff, 0xff8a3a, 0xffffff];
  for (let i = 0; i < 9; i++) P.push(part(rbox(14, 0.5, 1.1, 0.25), 0x3f9a35, { p: [22, 0.2, -16 + i * 2.1] }), ...[0, 1, 2, 3, 4, 5].map(k => part(sph(7, 5), F[i % 5], { p: [16.5 + k * 2.2, 0.75, -16 + i * 2.1], s: [0.95, 0.5, 0.55] })));
  return { geo: bake(P), cols: [{ x: 0, z: 0, r: 7, top: 11 }, { x: 9, z: 1, r: 2.4, top: 11 }] };
}
// ── Tangkuban Parahu: danau kawah & bebatuan (asapnya di buildDistricts) ──
function perahu() {
  const P = [part(lathe([[28, -2], [24, 1]], 40), 0x4f9238, { crease: 70 }), part(lathe([[24, 1], [20, 3.3], [17.4, 4], [16, 4]], 40), 0x9c9483, { crease: 70 }), part(lathe([[16, 4], [13.4, 1.8], [12, 0.6]], 40), 0xb9a888, { crease: 70 }), part(cyl(12, 12, 0.3, 36), 0xe9dcae, { p: [0, 0.55, 0] }), part(cyl(10, 10, 0.3, 32), 0x8fe0c4, { p: [0, 0.9, 0] }), part(cyl(6.5, 6.5, 0.3, 28), 0x63cdb4, { p: [0, 0.98, 0] })];
  for (let i = 0; i < 18; i++) { const a = i / 18 * TAU, r = 11 + (i % 3) * 2.8, k = 0.8 + (i * 7 % 5) * 0.28; P.push(part(new THREE.IcosahedronGeometry(1, 1), i % 2 ? 0x8d8578 : 0xa59b8a, { p: [Math.cos(a) * r, [1, 2.4, 4][i % 3], Math.sin(a) * r], s: [k * 1.3, k, k * 1.1] })); }
  return { geo: bake(P), cols: [{ x: 0, z: 0, r: 18, top: 4 }] };
}

// Daftar landmark distrik (format sama dengan landmarks())
export function districtLandmarks() {
  const put = (key, m, [x, z], ry, y) => { const c = Math.cos(ry), s = Math.sin(ry); return { key, geo: m.geo, extras: m.extras || [], x, z, ry, y, cols: m.cols.map(k => ({ ...k, x: x + k.x * c + k.z * s, z: z - k.x * s + k.z * c })) }; };
  const out = PHI + PI;
  return [
    put('merdeka', merdeka(), oldTown(84, -19), out), put('masjidraya', masjidraya(), oldTown(-72, 21), PHI - PI / 2), put('alunalun', alunalun(), oldTown(-26, 21), PHI),
    put('stasiun', stasiun(), oldTown(-62, -20), out), put('braga', braga(), oldTown(11, 22), PHI + PI / 2), put('pasupati', pasupati(), [BRIDGE.x, BRIDGE.z], Math.atan2(-T[1], T[0]), 0),
    put('dago', dago(), [DAGO.x, DAGO.z], 0), put('lembang', lembang(), [LEMBANG.x, LEMBANG.z], 0.5), put('perahu', perahu(), [CRATER.x, CRATER.z], 0),
  ];
}

// Benda kecil & gerak: kereta, orang, bendera, lampu antik, meja kafe, bola batu, halte, sapi, asap kawah, kapal, lampion warna
export function buildDistricts({ scene, groundAt, near, wrappedInstances, instanced, anim, rand, cast, ANIMALS }) {
  const add = (geo, list, o = {}, shadow = false, mat = M.worldMat) => { const w = wrappedInstances(geo, mat, list, o); w.meshes.forEach(m => cast(m, shadow)); instanced.push(w); return list; };
  const at = (e, o, s = 1, ry = 0) => { const [x, z] = oldTown(e, o); return [x, OT.y + 0.1, z, s, ry]; };
  const range = (n, f) => Array.from({ length: n }, (_, i) => f(i));
  // lampu antik + bola batu + meja kafe Braga
  add(bake([part(cyl(0.14, 0.22, 3.6, 8), 0x1f2a2e, { p: [0, 1.8, 0] }), ...[-0.5, 0.5].map(x => part(sph(8, 6), 0xfff0b0, { p: [x, 3.6, 0], s: [0.32, 0.4, 0.32] })), part(rbox(1.2, 0.12, 0.12, 0.04), 0x1f2a2e, { p: [0, 3.3, 0] })]), [...range(20, i => at(16 + Math.floor(i / 2) * 9.6, i % 2 ? 18.6 : 25.4, 1, PHI)), ...range(22, i => at(-104 + i * 10, i % 2 ? 4.6 : -8.2, 1.1, PHI))], { maxR: 200 });
  add(bake([part(sph(10, 8), 0x565b63, { p: [0, 0.5, 0], s: [0.55, 0.55, 0.55] })]), range(44, i => at(-106 + i * 5, i % 2 ? 3.2 : -7.2)), { maxR: 150 });
  add(bake([part(cyl(0.1, 0.1, 2.6, 6), TRIM, { p: [0, 1.3, 0] }), part(cone(1.5, 0.8, 8), c => (Math.floor(Math.atan2(c.z, c.x) * 1.273 + 8) % 2 ? 0xe8453a : 0xffffff), { p: [0, 2.6, 0], crease: 20 }), part(cyl(0.7, 0.7, 0.1, 12), 0x8a5f3c, { p: [0, 0.9, 0] }), ...[0, 2.1, 4.2].map(a => part(cyl(0.26, 0.26, 0.5, 8), 0x6d4a2c, { p: [Math.cos(a) * 1.15, 0.25, Math.sin(a) * 1.15] }))]), range(16, i => at(20 + Math.floor(i / 2) * 11, i % 2 ? 18.4 : 25.6, 0.85, i)), { maxR: 170 });
  // bendera merah putih di depan Gedung Merdeka
  add(bake([part(cyl(0.07, 0.1, 8, 6), 0x9aa0a8, { p: [0, 4, 0] }), part(rbox(2.2, 0.72, 0.06, 0.02), 0xe02a2f, { p: [1.15, 7.45, 0] }), part(rbox(2.2, 0.72, 0.06, 0.02), 0xffffff, { p: [1.15, 6.75, 0] })], false), range(12, i => at(64 + i * 3.6, -7.6, 1, PHI + 0.3)), { maxR: 240 }, false, M.treeMat);
  // halte bus
  add(bake([part(rbox(6, 0.25, 2.4, 0.1), 0x2f7bff, { p: [0, 3, 0] }), part(rbox(6, 2.2, 0.15, 0.05), 0x9fd2f0, { p: [0, 1.6, 1.0] }), ...[-2.8, 2.8].map(x => part(cyl(0.1, 0.1, 3, 6), 0x4a5361, { p: [x, 1.5, -0.8] })), part(rbox(4.4, 0.3, 0.8, 0.08), 0xffc21a, { p: [0, 0.8, 0.5] })]), [at(-38, -8.8, 1, PHI + PI), at(30, 4.6, 1, PHI + PI), at(112, -8.8, 1, PHI + PI)], { maxR: 220 });
  // orang (gaya mainan) berjalan-jalan kecil
  const PC = [0xe8453a, 0x2f7bff, 0xffc21a, 0x2fbf4f, 0x9b4dff, 0xff7aa8].map(c => new THREE.Color(c));
  const folk = range(LITE ? 34 : 64, i => { const alun = i < 30, e = alun ? -44 + rand() * 36 : 12 + rand() * 96, o = alun ? 9 + rand() * 22 : 19.6 + rand() * 4.6; return [...at(e, o, 0.75, rand() * TAU), e, o, rand() * TAU]; });
  add(bake([part(cyl(0.32, 0.5, 1.3, 10), 0xffffff, { p: [0, 0.95, 0] })]), folk, { maxR: 150, colors: folk.map((_, i) => PC[i % PC.length]) });
  add(bake([part(sph(10, 8), 0xf2c39a, { p: [0, 2.0, 0], s: [0.42, 0.44, 0.42] }), part(sph(10, 6), 0x2a211b, { p: [0, 2.2, -0.05], s: [0.44, 0.32, 0.44] }), ...[-0.2, 0.2].map(x => part(cyl(0.13, 0.13, 0.5, 6), 0x33404f, { p: [x, 0.22, 0] }))]), folk, { maxR: 150 });
  anim.push(t => { for (const f of folk) { const k = t * 0.35 + f[7], [x, z] = oldTown(f[5] + Math.cos(k) * 2.2, f[6] + Math.sin(k) * 0.9); f[0] = x; f[2] = z; f[1] = OT.y + 0.1 + Math.abs(Math.sin(t * 5 + f[7])) * 0.14; f[4] = -k + PHI; } });
  // rel & kereta bolak-balik di belakang stasiun
  const railG = []; for (let e = -126; e <= 106; e += 2) railG.push(part(rbox(0.4, 0.12, 3, 0.03), 0x7a5a3c, { p: [e, 0.1, -34] }));
  for (const z of [-34.8, -33.2]) railG.push(part(rbox(234, 0.2, 0.16, 0.03), 0x8d939c, { p: [-10, 0.25, z] }));
  for (const e of [-127, 107]) railG.push(part(rbox(0.5, 1.6, 3.2, 0.1), 0xe8453a, { p: [e, 0.9, -34] }), part(rbox(0.6, 0.4, 3.3, 0.06), 0xffffff, { p: [e, 1.1, -34] }));   // palang ujung rel
  const rails = cast(new THREE.Mesh(bake(railG, false), M.worldMat), false); rails.rotation.y = PHI; scene.add(rails);
  const car = i => [part(rbox(13, 3.4, 2.9, 0.35), c => (c.y > 2.9 ? 0xf6f4ef : c.y > 1.9 ? 0xff7a1a : 0x1d4f9a), { p: [i * 13.8, 2.4, 0] }), part(rbox(11.6, 1, 3.0, 0.1), 0x2b3a4c, { p: [i * 13.8, 2.9, 0] })];
  const train = cast(new THREE.Mesh(bake([...car(-1), ...car(0), ...car(1), part(sph(12, 8), 0xf6f4ef, { p: [20.6, 2.3, 0], s: [1.8, 1.6, 1.4] }), part(sph(12, 8), 0xf6f4ef, { p: [-20.6, 2.3, 0], s: [1.8, 1.6, 1.4] })]), M.worldMat)); train.rotation.y = PHI; scene.add(train);
  anim.push((t, dt, cam) => {
    const e = -12 + Math.sin(t * 0.09) * 88, [x, z] = oldTown(e, -34); train.position.set(near(x, cam.x), OT.y + 0.2, near(z, cam.z));
    rails.position.set(near(OT.x, cam.x), OT.y + 0.15, near(OT.z, cam.z));
  });
  // sapi Lembang
  add(ANIMALS.sapi(), range(6, i => { const a = i * 1.05, x = LEMBANG.x + Math.cos(a) * (9 + i % 3 * 2.5) - 2, z = LEMBANG.z + 9 + Math.sin(a) * 6; return [x, groundAt(x, z), z, 1.1, a * 2]; }), { maxR: 220 }, true);
  // asap kawah: gumpalan naik & memudar (mengecil)
  const smoke = range(9, i => [CRATER.x, 0, CRATER.z, 1, i]), y0 = groundAt(CRATER.x, CRATER.z);
  add(bake([[0, 0, 0, 2.2], [1.8, 0.4, 0.6, 1.5], [-1.6, 0.2, -0.5, 1.6]].map(([x, y, z, s]) => part(sph(9, 7), 0xffffff, { p: [x, y, z], s: [s, s * 0.85, s] })), false), smoke, { maxR: 480 }, false, new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0xb8c4d0, transparent: true, opacity: 0.55, depthWrite: false }));
  anim.push(t => smoke.forEach((s, i) => { const k = (t * 0.07 + i / 9) % 1; s[0] = CRATER.x + Math.sin(i * 2.3 + t * 0.3) * 2 + k * 9; s[1] = y0 + 3 + k * 30; s[2] = CRATER.z + Math.cos(i * 1.7) * 2; s[3] = Math.sin(k * PI) * (0.7 + k * 1.6) + 0.01; }));
  // perahu kecil di sungai
  const bl = range(5, i => { const [x, z] = bridgeAt((i % 2 ? 4 : -4), -34 + i * 17); return [x, 0.2, z, 0.55, RT + i]; });
  add(M.boatGeo(), bl, { maxR: 260 });
  anim.push(t => bl.forEach((b, i) => { b[1] = 0.15 + Math.sin(t * 1.4 + i) * 0.12; }));
  // pinus & semak bunga di Dago/Lembang ditangani world.js (TREES)
}
