// Landmark Bandung di area peta referensi, dimodelkan khusus (three.js prosedural) dari foto asli:
// Gedung Sate, Museum Geologi, Museum Pos Indonesia, Pusdai, Masjid Istiqomah, Graha Merah Putih,
// Monumen Perjuangan. Posisi/arah/ukuran dari jejak OpenStreetMap (LANDMARKS di bandung.js).
// Koordinat lokal tiap model: sumbu panjang = x, muka depan menghadap −z, dasar di y = 0.
import * as THREE from 'three';
import { LANDMARKS } from './bandung.js';
import { part, bake, sph, cyl, cone, rbox, lathe, torus, slab, roundRect, starShape } from './models.js';

const { PI } = Math;
const V2 = (x, y) => new THREE.Vector2(x, y);
const WHITE = 0xf6f3ec, CREAM = 0xf1e9d8, SLATE = 0x4a5361, DARK = 0x2d3440, GLASS = 0x3f5671, TRIM = 0xfdfbf6, GOLD = 0xd8a92b;

function arch(w, h) { // jendela/pintu lengkung: persegi + setengah lingkaran
  const s = new THREE.Shape(), r = w / 2;
  s.moveTo(-r, 0); s.lineTo(r, 0); s.lineTo(r, h - r); s.absarc(0, h - r, r, 0, PI, false); s.lineTo(-r, 0);
  return s;
}
// Deret bukaan di muka bangunan. side: 'front' (−z), 'back' (+z), 'left' (−x), 'right' (+x).
function row(parts, { from, to, step, y, face, at, w, h, color = GLASS, shape = 'arch', skip = () => false }) {
  for (let t = from; t <= to + 1e-6; t += step) {
    if (skip(t)) continue;
    const g = shape === 'arch' ? new THREE.ExtrudeGeometry(arch(w, h), { depth: 0.14, bevelEnabled: false, curveSegments: 6 }).translate(0, 0, -0.07) : shape === 'round' ? new THREE.CylinderGeometry(w / 2, w / 2, 0.14, 18).rotateX(PI / 2) : new THREE.BoxGeometry(w, h, 0.14).translate(0, h / 2, 0);
    const p = face === 'front' ? [t, y, at] : face === 'back' ? [t, y, at] : face === 'left' ? [at, y, t] : [at, y, t];
    const r = face === 'left' || face === 'right' ? [0, PI / 2, 0] : [0, 0, 0];
    parts.push(part(g, color, { p, r, crease: 40 }));
  }
}
function hipRoof(L, D, h) { // atap perisai, bubungan sejajar x
  const l = L / 2, d = D / 2, r = Math.max(0, l - d);
  const c = [[-l, 0, -d], [l, 0, -d], [l, 0, d], [-l, 0, d]], a = [-r, h, 0], b = [r, h, 0];
  const tris = [[c[0], c[1], b], [c[0], b, a], [c[2], c[3], a], [c[2], a, b], [c[1], c[2], b], [c[3], c[0], a]];
  const pos = [], p = [0, 1, 2].map(() => new THREE.Vector3()), u = new THREE.Vector3(), w = new THREE.Vector3(), m = new THREE.Vector3();
  for (const t of tris) {
    t.forEach((q, i) => p[i].set(...q));
    u.subVectors(p[1], p[0]).cross(w.subVectors(p[2], p[0]));
    m.copy(p[0]).add(p[1]).add(p[2]).divideScalar(3); m.y += 1;
    for (const i of u.dot(m) < 0 ? [0, 2, 1] : [0, 1, 2]) pos.push(p[i].x, p[i].y, p[i].z);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); return g;
}
const pyramid = (side, h) => cone(side / Math.SQRT2, h, 4).rotateY(PI / 4);

// Papan nama dari canvas (satu mesh kecil per landmark yang punya tulisan).
function sign(text, { w, h, bg, fg, font = 900 }) {
  const c = document.createElement('canvas'); c.width = 512; c.height = Math.round(512 * h / w);
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `${font} ${Math.round(c.height * 0.62)}px Arial, sans-serif`;
  g.fillText(text, c.width / 2, c.height / 2 + 2, c.width * 0.94);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h).rotateY(PI), new THREE.MeshBasicMaterial({ map: t }));
}

// ── Gedung Sate: blok tengah 3 lantai + atap tumpang 4 tingkat + tusuk sate; sayap 2 lantai berjendela
// lengkung; paviliun ujung; atap perisai gelap; serambi tengah bergevel. ──
function sate() {
  const P = [];
  P.push(part(rbox(50, 0.8, 18, 0.2), 0xd6d0c3, { p: [0, 0.4, 0] }));                          // undakan
  for (const sx of [-1, 1]) {
    P.push(part(rbox(17, 5.2, 10, 0.2), WHITE, { p: [sx * 11.5, 3.4, 0] }));                      // sayap
    P.push(part(hipRoof(18, 11.4, 2.6), SLATE, { p: [sx * 11.5, 6.0, 0], crease: 20 }));
    P.push(part(rbox(18.2, 0.3, 11.6, 0.08), TRIM, { p: [sx * 11.5, 6.05, 0] }));
    P.push(part(rbox(5.5, 6.4, 12, 0.2), WHITE, { p: [sx * 22, 4.0, -0.6] }));                    // paviliun ujung
    P.push(part(pyramid(7, 2.8), SLATE, { p: [sx * 22, 8.6, -0.6], crease: 20 }));
    P.push(part(rbox(6.2, 0.3, 12.6, 0.08), TRIM, { p: [sx * 22, 7.25, -0.6] }));
    for (const z of [-5.08, 5.08]) {                                                                // jendela lengkung 2 lantai
      row(P, { from: sx < 0 ? -18.9 : 4.4, to: sx < 0 ? -4.4 : 18.9, step: 1.6, y: 1.25, face: 'front', at: z, w: 0.9, h: 1.7 });
      row(P, { from: sx < 0 ? -18.9 : 4.4, to: sx < 0 ? -4.4 : 18.9, step: 1.6, y: 3.6, face: 'front', at: z, w: 0.75, h: 1.4 });
    }
    row(P, { from: -1.6, to: 1.6, step: 1.6, y: 1.4, face: 'front', at: sx < 0 ? -6.7 : 6.7, w: 0.9, h: 1.9, skip: () => false });
  }
  // blok tengah + serambi
  P.push(part(rbox(12, 9.4, 13.5, 0.25), 0xf8f5ef, { p: [0, 5.5, -0.8] }));
  P.push(part(rbox(8, 6.2, 3, 0.2), WHITE, { p: [0, 3.9, -8.4] }));
  P.push(part(slab(new THREE.Shape([V2(-4.4, 0), V2(4.4, 0), V2(0, 2.4)]), 3.3, 0.12), SLATE, { p: [0, 7.0, -8.4], crease: 20 }));  // gevel serambi
  row(P, { from: -2.6, to: 2.6, step: 2.6, y: 0.8, face: 'front', at: -9.96, w: 1.6, h: 3.0, color: DARK });                          // pintu lengkung serambi
  row(P, { from: -3.6, to: 3.6, step: 1.8, y: 7.2, face: 'front', at: -7.6, w: 0.8, h: 1.4 });
  row(P, { from: -4.2, to: 4.2, step: 2.1, y: 4.3, face: 'front', at: -7.6, w: 0.9, h: 1.6, skip: t => Math.abs(t) < 3 });
  // atap tumpang 4 tingkat + tusuk sate (6 bulatan)
  let y = 10.2;
  for (const [side, h] of [[13.5, 2.4], [9.5, 2.1], [6.6, 1.9], [4.2, 1.7]]) {
    P.push(part(rbox(side * 1.02, 0.3, side * 1.02, 0.08), TRIM, { p: [0, y + 0.15, -0.8] }));
    P.push(part(pyramid(side, h), DARK, { p: [0, y + h / 2 + 0.2, -0.8], crease: 20 }));
    y += h * 0.62;
    if (side > 5) { P.push(part(rbox(side * 0.5, 0.9, side * 0.5, 0.06), WHITE, { p: [0, y + 0.45, -0.8] })); y += 0.75; }
  }
  P.push(part(cyl(0.11, 0.13, 4.8, 8), 0x6b5a3a, { p: [0, y + 2.4, -0.8] }));
  for (let i = 0; i < 6; i++) P.push(part(sph(12, 8), GOLD, { p: [0, y + 0.9 + i * 0.62, -0.8], s: [0.3, 0.26, 0.3] }));
  P.push(part(cone(0.18, 0.8, 10), GOLD, { p: [0, y + 5.1, -0.8] }));
  return { geo: bake(P), cols: [...[-22, -11, 0, 11, 22].map(x => ({ x, z: 0, r: 6.5, top: 8 })), { x: 0, z: -0.8, r: 4, top: 19 }] };
}

// ── Museum Geologi: Art Deco putih memanjang 2 lantai, jendela persegi berbingkai gelap, list atap gelap,
// bagian tengah menonjol dengan papan "MUSEUM GEOLOGI". ──
function geologi() {
  const P = [], L = 50;
  P.push(part(rbox(L, 6.4, 11, 0.12), WHITE, { p: [0, 3.2, 0] }));
  P.push(part(rbox(L + 0.6, 0.7, 11.6, 0.1), DARK, { p: [0, 6.6, 0] }));                          // list atap gelap
  P.push(part(rbox(L - 1, 0.5, 10, 0.1), 0x8f8b84, { p: [0, 7.0, 0] }));
  P.push(part(rbox(L + 0.4, 0.35, 11.4, 0.05), 0xd9d4c8, { p: [0, 0.18, 0] }));
  P.push(part(rbox(10, 7.6, 2.6, 0.12), TRIM, { p: [0, 3.8, -6.2] }));                            // tengah menonjol
  P.push(part(rbox(10.6, 0.7, 3.2, 0.1), DARK, { p: [0, 7.8, -6.2] }));
  P.push(part(rbox(3.2, 2.8, 0.2, 0.05), DARK, { p: [0, 1.4, -7.55] }));                          // pintu
  for (const z of [-5.57, 5.57]) for (const y of [1.3, 4.0]) row(P, { from: -23, to: 23, step: 2.4, y, face: 'front', at: z, w: 1.3, h: 1.5, shape: 'box', color: 0x26303d, skip: t => z < 0 && Math.abs(t) < 5.5 });
  row(P, { from: -3, to: 3, step: 2, y: 4.6, face: 'front', at: -7.55, w: 1.2, h: 1.4, shape: 'box', color: 0x26303d });
  const s = sign('MUSEUM ⊕ GEOLOGI', { w: 8, h: 0.9, bg: '#f7f5f0', fg: '#1d2430' });
  s.position.set(0, 3.4, -7.56);
  return { geo: bake(P), extras: [s], cols: [-20, -10, 0, 10, 20].map(x => ({ x, z: 0, r: 6.5, top: 8 })) };
}

// ── Museum Pos Indonesia (Gedung Pos): Indo-Eropa putih, jendela lengkung tinggi, atap perisai gelap,
// menara sudut bundar beratap kerucut, papan merah. ──
function pos() {
  const P = [], L = 40;
  P.push(part(rbox(L, 6.0, 11, 0.2), WHITE, { p: [0, 3.0, 0] }));
  P.push(part(hipRoof(L + 1, 12.2, 3.2), SLATE, { p: [0, 6.0, 0], crease: 20 }));
  P.push(part(rbox(L + 1.2, 0.35, 12.4, 0.08), TRIM, { p: [0, 6.05, 0] }));
  P.push(part(rbox(11, 6.0, 26, 0.2), WHITE, { p: [-L / 2 + 5.5, 3.0, 7.5] }));                   // sayap belakang (bentuk L)
  P.push(part(hipRoof(27, 12.2, 3.2), SLATE, { p: [-L / 2 + 5.5, 6.0, 7.5], r: [0, PI / 2, 0], crease: 20 }));
  for (const z of [-5.57]) { row(P, { from: -17, to: 17, step: 2.3, y: 0.9, face: 'front', at: z, w: 1.3, h: 2.4 }); row(P, { from: -17, to: 17, step: 2.3, y: 3.8, face: 'front', at: z, w: 1.0, h: 1.5 }); }
  P.push(part(cyl(4, 4, 8.6, 28), TRIM, { p: [L / 2, 4.3, -1] }));                                 // menara sudut bundar
  P.push(part(cone(4.5, 4.2, 28), DARK, { p: [L / 2, 10.7, -1], crease: 30 }));
  P.push(part(cyl(4.3, 4.3, 0.4, 28), TRIM, { p: [L / 2, 8.6, -1] }));
  for (let i = 0; i < 7; i++) { const a = PI * (0.75 + i * 0.12); P.push(part(slab(arch(1.2, 2.6), 0.14, 0.03), GLASS, { p: [L / 2 + Math.cos(a) * 4.05, 1.0, -1 + Math.sin(a) * 4.05], r: [0, -a - PI / 2, 0] })); }
  P.push(part(slab(arch(3.0, 3.8), 0.2, 0.04), DARK, { p: [L / 2 - 1.5, 0.6, -5.1], crease: 40 }));
  const s = sign('MUSEUM POS INDONESIA', { w: 9, h: 1.1, bg: '#d8262f', fg: '#ffffff' });
  s.position.set(4, 5.15, -5.6);
  return { geo: bake(P), extras: [s], cols: [...[-15, -5, 5, 15].map(x => ({ x, z: 0, r: 6.2, top: 9 })), { x: L / 2, z: -1, r: 4.6, top: 13 }, { x: -L / 2 + 5.5, z: 12, r: 6.2, top: 9 }] };
}

// ── Pusdai: pelataran luas, aula putih beratap abu-biru, gerbang bingkai tinggi dengan lengkung kaca hijau,
// arkade lengkung putih di kedua sisi, menara silinder krem. ──
function pusdai() {
  const P = [];
  P.push(part(rbox(46, 0.6, 42, 0.2), 0xd9d6cf, { p: [0, 0.3, 4] }));                              // pelataran
  P.push(part(rbox(26, 7, 22, 0.2), WHITE, { p: [0, 3.6, 8] }));                                     // aula
  P.push(part(hipRoof(28, 24, 5.5), 0x5f7a96, { p: [0, 7.1, 8], crease: 20 }));
  P.push(part(rbox(28.2, 0.4, 24.2, 0.1), TRIM, { p: [0, 7.15, 8] }));
  for (const sx of [-1, 1]) {
    P.push(part(rbox(2.2, 15, 2.2, 0.2), WHITE, { p: [sx * 5, 7.5, -4] }));                         // tiang gerbang
    P.push(part(rbox(11, 1.6, 9, 0.2), WHITE, { p: [sx * 14, 3.2, -2] }));                          // atap arkade
    P.push(part(rbox(10.6, 3.2, 8.4, 0.2), 0xeeeae2, { p: [sx * 14, 1.6, -2] }));
    row(P, { from: sx * 14 - 4, to: sx * 14 + 4, step: 2, y: 0.6, face: 'front', at: -6.25, w: 1.5, h: 2.3, color: 0x2b3442 });
    P.push(part(hipRoof(11.6, 9.6, 2.2), 0x5f7a96, { p: [sx * 14, 4.0, -2], crease: 20 }));
  }
  P.push(part(rbox(12.4, 2.2, 2.4, 0.2), WHITE, { p: [0, 14.2, -4] }));                             // balok atas gerbang
  P.push(part(slab(arch(7.6, 12), 0.3, 0.05), 0x5fb39a, { p: [0, 0.6, -3.6], crease: 40 }));       // lengkung kaca hijau
  P.push(part(slab(arch(8.4, 12.6), 0.2, 0.05), TRIM, { p: [0, 0.4, -3.3], crease: 40 }));
  // menara: silinder krem, dua balkon, kubah kecil
  const mx = 20, mz = 16;
  P.push(part(cyl(1.3, 1.6, 30, 18), CREAM, { p: [mx, 15, mz] }));
  for (const y of [18, 25]) P.push(part(cyl(2.1, 2.1, 0.6, 18), TRIM, { p: [mx, y, mz] }));
  P.push(part(sph(16, 10), 0x5fb39a, { p: [mx, 30.6, mz], s: [1.5, 1.6, 1.5] }));
  P.push(part(cone(0.18, 2.2, 8), GOLD, { p: [mx, 33, mz] }));
  return { geo: bake(P), cols: [{ x: 0, z: 8, r: 13, top: 12 }, { x: 0, z: -4, r: 6, top: 15.5 }, { x: -14, z: -2, r: 6, top: 6 }, { x: 14, z: -2, r: 6, top: 6 }, { x: mx, z: mz, r: 2.4, top: 34 }] };
}

// ── Masjid Istiqomah: dinding putih berjendela bulat, atap miring besar abu tua bergaris, menara putih bulan sabit. ──
function istiqomah() {
  const P = [];
  P.push(part(rbox(18, 4.6, 14, 0.15), WHITE, { p: [0, 2.3, 0] }));
  const roof = new THREE.Shape([V2(-7.6, 0), V2(7.6, 0), V2(7.6, 2.2), V2(-1, 8.4), V2(-7.6, 3.4)]);   // atap miring khas
  P.push(part(slab(roof, 19, 0.15), c => (Math.floor((c.x + 20) * 1.2) % 2 ? 0x3c4452 : 0x2d3440), { p: [0, 4.6, 0], r: [0, PI / 2, 0], crease: 30 }));
  row(P, { from: -7, to: 7, step: 2.8, y: 2.6, face: 'front', at: -7.08, w: 1.4, h: 1.4, shape: 'round', color: 0x2b3442 });
  P.push(part(rbox(3.2, 2.8, 0.2, 0.05), 0x7a5233, { p: [0, 1.4, -7.1] }));
  const s = sign('MASJID ISTIQOMAH', { w: 7, h: 0.9, bg: '#1f7a52', fg: '#ffffff' });
  s.position.set(0, 3.95, -7.15);
  P.push(part(rbox(1.6, 18, 1.6, 0.1), WHITE, { p: [11, 9, -4] }));                                 // menara
  P.push(part(rbox(2.2, 0.5, 2.2, 0.08), TRIM, { p: [11, 14.5, -4] }));
  P.push(part(cone(0.5, 2.4, 4), WHITE, { p: [11, 19.2, -4] }));
  P.push(part(torus(0.55, 0.1, 6, 14, PI * 1.4), GOLD, { p: [11, 21.0, -4], r: [0, 0, PI * 0.8] }));  // bulan sabit
  return { geo: bake(P), extras: [s], cols: [{ x: 0, z: 0, r: 9, top: 13 }, { x: 11, z: -4, r: 1.6, top: 21 }] };
}

// ── Graha Merah Putih (Telkom): gedung kantor ±8 lantai, sirip vertikal merah-putih, kaca biru. ──
function telkom() {
  const P = [], L = 28, D = 22, H = 15;
  P.push(part(rbox(L, H, D, 0.2), 0x587393, { p: [0, H / 2, 0] }));                                 // kaca
  P.push(part(rbox(L + 0.6, 0.8, D + 0.6, 0.1), 0xf3f1ec, { p: [0, H + 0.3, 0] }));
  P.push(part(rbox(L + 0.8, 1.6, D + 0.8, 0.1), 0xf3f1ec, { p: [0, 0.8, 0] }));
  for (let i = 0; i <= 18; i++) {                                                                    // sirip depan & belakang
    const x = -L / 2 + i * (L / 18), col = i % 3 === 0 ? 0xe02a2f : 0xf6f4ef;
    for (const z of [-D / 2 - 0.3, D / 2 + 0.3]) P.push(part(rbox(0.35, H - 1.4, 0.7, 0.05), col, { p: [x, H / 2 + 0.6, z] }));
  }
  for (let i = 0; i <= 14; i++) {                                                                    // sirip samping
    const z = -D / 2 + i * (D / 14), col = i % 3 === 0 ? 0xe02a2f : 0xf6f4ef;
    for (const x of [-L / 2 - 0.3, L / 2 + 0.3]) P.push(part(rbox(0.7, H - 1.4, 0.35, 0.05), col, { p: [x, H / 2 + 0.6, z] }));
  }
  P.push(part(rbox(5, 3, 0.4, 0.1), 0xe02a2f, { p: [L / 2 - 4, H + 2.2, -D / 2 + 1] }));             // papan logo merah di atap
  return { geo: bake(P), cols: [-8, 0, 8].map(x => ({ x, z: 0, r: 12, top: H + 3 })) };
}

// ── Monumen Perjuangan Rakyat Jawa Barat: undakan bundar, bilah-bilah putih tinggi melengkung tersusun
// setengah lingkaran (bambu runcing / lembaran buku), lambang Garuda emas di tengah. ──
function monumen() {
  const P = [];
  for (const [r, y] of [[24, 0.5], [20, 1.4], [16.5, 2.3]]) P.push(part(cyl(r, r + 0.4, 0.9, 48), 0xd9d6cf, { p: [0, y, 0], crease: 30 }));
  P.push(part(cyl(26, 26, 0.3, 48), 0x9fd27a, { p: [0, 0.1, 0] }));
  const blade = (h, lean) => { const s = new THREE.Shape(); s.moveTo(-1.6, 0); s.lineTo(1.6, 0); s.lineTo(1.6, h - 2); s.quadraticCurveTo(1.6 * lean, h + 0.4, -1.6, h - 1.2); s.lineTo(-1.6, 0); return s; };
  const H = [10, 13, 16, 21, 16, 13, 10], R = 13;
  H.forEach((h, i) => {                                         // bilah terpisah (ada celah), tersusun setengah lingkaran
    const a = PI * (0.18 + i * 0.107), x = Math.cos(a) * R, z = Math.sin(a) * R;
    P.push(part(slab(blade(h, i < 3 ? -1 : 1), 1.1, 0.15), WHITE, { p: [x, 2.7, z], r: [0, PI / 2 - a, 0], crease: 35 }));
  });
  P.push(part(cyl(1.9, 1.9, 0.4, 24), GOLD, { p: [0, 14, R - 0.8], r: [PI / 2, 0, 0] }));           // lambang Garuda (disederhanakan)
  P.push(part(slab(starShape(1.3, 0.55), 0.2, 0.05), 0xffffff, { p: [0, 14, R - 1.05], crease: 30 }));
  return { geo: bake(P), cols: [{ x: 0, z: 10, r: 9, top: 24 }, { x: -9, z: 6, r: 6, top: 16 }, { x: 9, z: 6, r: 6, top: 16 }, { x: 0, z: 0, r: 17, top: 3 }] };
}

const BUILD = { sate, geologi, pos, pusdai, istiqomah, telkom, monumen };
// Arah muka depan yang diinginkan (dunia, x/z) — dari foto: Gedung Sate menghadap Gasibu (utara), dst.
const FACE = { sate: [0, -1], geologi: [0, 1], pos: [-1, 0], pusdai: [0, 1], istiqomah: [-1, 0], telkom: [-1, 0], monumen: [0, 1] };

export { row, hipRoof, sign, arch, pyramid };

// Kembalikan [{key, geo, extras, x, z, ry, cols (dunia)}]
export function landmarks() {
  return LANDMARKS.map(l => {
    let { a, w, d } = l;
    if (d > w) { a += PI / 2; [w, d] = [d, w]; }
    let ry = -a;
    const f = FACE[l.key], fx = Math.sin(-ry), fz = -Math.cos(-ry);   // muka depan lokal (−z) di dunia
    if (fx * f[0] + fz * f[1] < 0) ry += PI;
    const m = BUILD[l.key](), c = Math.cos(ry), s = Math.sin(ry);
    const cols = m.cols.map(k => ({ ...k, x: l.x + k.x * c + k.z * s, z: l.z - k.x * s + k.z * c }));
    return { key: l.key, geo: m.geo, extras: m.extras || [], x: l.x, z: l.z, ry, cols };
  });
}
