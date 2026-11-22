// Kota mini Bandung dari data OpenStreetMap (js/bandung.js), semua prosedural three.js:
// fasad bertekstur (plester, kusen, kaca, pintu, roster), atap perisai bergenteng dengan teritis,
// atap dak berparapet + toren air, masjid berkubah, AO dipanggang di warna vertex, bayangan kontak
// di tanah, jalan bermarka, taman. Total 6 draw call.
import * as THREE from 'three';
import { BUILDINGS, ROADS, PARKS, SATE } from './bandung.js';
import { toon } from './toon.js';

const FLOOR = 1.6;      // tinggi satu lantai (unit); sedikit dilebih-lebihkan supaya terbaca dari udara
const FACADE_W = 6;     // satu petak tekstur fasad = 6 unit lebar × 1 lantai
const CELL = 16;        // sel grid tabrakan
const PLAIN = [0.015, 0.985];  // UV pojok kiri-atas tekstur fasad = plester polos (parapet)
const hash = n => { n = Math.imul(n ^ n >>> 16, 0x45d9f3b); n = Math.imul(n ^ n >>> 16, 0x45d9f3b); return (n ^ n >>> 16) >>> 0; };

// ── Tekstur canvas ──
function tex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function plaster(g, w, h, seed) { // plester putih bernoda halus (diwarnai oleh warna vertex)
  g.fillStyle = '#f4f2ee'; g.fillRect(0, 0, w, h);
  let s = seed;
  for (let i = 0; i < w * h / 18; i++) {
    s = (s * 16807) % 2147483647;
    const x = s % w, y = (s >> 8) % h, a = ((s >> 4) % 10) / 160;
    g.fillStyle = `rgba(90,80,60,${a})`; g.fillRect(x, y, 2, 2);
  }
  const grime = g.createLinearGradient(0, h * 0.5, 0, h); // noda air hujan menurun
  grime.addColorStop(0, 'rgba(80,70,50,0)'); grime.addColorStop(1, 'rgba(80,70,50,.10)');
  g.fillStyle = grime; g.fillRect(0, 0, w, h);
}
function windowAt(g, x, y, w, h, frame = '#6e4a2c') { // jendela dua daun: kusen kayu, kaca + pantulan, ambang
  g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x + 3, y + 3, w, h);            // bayangan ke dalam
  g.fillStyle = frame; g.fillRect(x - 3, y - 3, w + 6, h + 6);
  const gl = g.createLinearGradient(x, y, x + w * 0.6, y + h);
  gl.addColorStop(0, '#9bb7cf'); gl.addColorStop(0.45, '#56708c'); gl.addColorStop(1, '#2f4157');
  g.fillStyle = gl; g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(255,255,255,.22)'; g.beginPath(); g.moveTo(x, y + h * 0.55); g.lineTo(x + w * 0.45, y); g.lineTo(x + w * 0.6, y); g.lineTo(x, y + h * 0.75); g.fill();
  g.fillStyle = frame; g.fillRect(x + w / 2 - 2, y, 4, h); g.fillRect(x, y + h * 0.3, w, 3);
  g.fillStyle = '#d8d2c6'; g.fillRect(x - 6, y + h + 3, w + 12, 5);           // ambang jendela
}
function roster(g, x, y, w) { // lubang ventilasi khas rumah Indonesia
  for (let i = 0; i < w / 10; i++) { g.fillStyle = '#9b9488'; g.fillRect(x + i * 10, y, 7, 7); g.fillStyle = '#4d473f'; g.fillRect(x + i * 10 + 2, y + 2, 4, 4); }
}
// Rumah: bawah = lantai dasar (pintu + 2 jendela), atas = lantai atas (2 jendela). 256 px = 6 unit.
const houseTex = () => tex(256, 256, (g, w) => {
  plaster(g, w, 256, 7);
  // lantai atas (y 0..128)
  windowAt(g, 30, 30, 60, 62); windowAt(g, 166, 30, 60, 62); roster(g, 40, 10, 40); roster(g, 176, 10, 40);
  // lantai dasar (y 128..256)
  windowAt(g, 22, 158, 56, 60); roster(g, 30, 140, 40);
  g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(112, 150, 50, 106);
  g.fillStyle = '#7b5233'; g.fillRect(108, 146, 48, 110);                     // pintu kayu
  g.fillStyle = '#6a4529'; g.fillRect(114, 154, 36, 40); g.fillRect(114, 200, 36, 48);
  g.fillStyle = '#e0c068'; g.fillRect(146, 200, 5, 5);                        // gagang
  windowAt(g, 186, 158, 50, 60);
  g.fillStyle = '#b9b1a3'; g.fillRect(0, 244, w, 12);                         // plint
});
// Gedung/ruko: bawah = etalase kaca + pintu lipat, atas = jendela pita.
const officeTex = () => tex(256, 256, (g, w) => {
  plaster(g, w, 256, 13);
  g.fillStyle = '#d9d4ca'; g.fillRect(0, 0, w, 10); g.fillRect(0, 118, w, 10);   // list lantai
  for (let x = 12; x < w; x += 82) windowAt(g, x, 34, 70, 62, '#8c949c');      // jendela pita
  const gl = g.createLinearGradient(0, 150, 0, 250);                            // etalase
  gl.addColorStop(0, '#7f9bb5'); gl.addColorStop(1, '#2c3c50');
  g.fillStyle = '#5e6670'; g.fillRect(8, 146, 150, 104);
  g.fillStyle = gl; g.fillRect(14, 152, 138, 92);
  g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(30, 152, 20, 92);
  g.fillStyle = '#8b9198'; g.fillRect(172, 146, 76, 104);                      // pintu lipat (rolling door)
  for (let y = 150; y < 248; y += 7) { g.fillStyle = '#6f757c'; g.fillRect(174, y, 72, 2); }
  g.fillStyle = '#b9b1a3'; g.fillRect(0, 248, w, 8);
});
// Braga: ruko kolonial — bawah etalase berkanopi warna, atas jendela krepyak lengkung & lis.
const bragaTex = () => tex(256, 256, (g, w) => {
  plaster(g, w, 256, 23);
  g.fillStyle = '#fff'; g.fillRect(0, 0, w, 12); g.fillRect(0, 116, w, 12); g.fillStyle = 'rgba(90,70,50,.25)'; g.fillRect(0, 12, w, 4); g.fillRect(0, 128, w, 4);
  for (let x = 20; x < w; x += 80) {
    g.fillStyle = '#fff'; g.fillRect(x - 6, 30, 52, 82); g.beginPath(); g.arc(x + 20, 40, 26, Math.PI, 0); g.fill();
    g.fillStyle = '#3f6b63'; g.fillRect(x, 40, 40, 66); g.beginPath(); g.arc(x + 20, 42, 20, Math.PI, 0); g.fill();
    g.fillStyle = 'rgba(255,255,255,.25)'; for (let y = 46; y < 104; y += 6) g.fillRect(x + 2, y, 36, 2);
    g.fillStyle = '#fff'; g.fillRect(x + 18, 34, 4, 72);
  }
  const gl = g.createLinearGradient(0, 160, 0, 250); gl.addColorStop(0, '#86a6bf'); gl.addColorStop(1, '#2b3b4f');
  for (const [x, a, b] of [[8, '#d8413a', '#fff'], [136, '#2f7a63', '#fff']]) {
    g.fillStyle = '#5a4632'; g.fillRect(x, 168, 112, 84); g.fillStyle = gl; g.fillRect(x + 6, 176, 66, 70); g.fillStyle = '#7b5233'; g.fillRect(x + 78, 176, 28, 76);
    g.fillStyle = '#ffe9b0'; g.fillRect(x + 4, 140, 104, 14);
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect(x + i * 14, 156, 14, 18); g.beginPath(); g.arc(x + i * 14 + 7, 174, 7, 0, Math.PI); g.fill(); }
  }
});
// Genteng: abu-abu (diwarnai warna vertex), 4 kolom × 4 baris, tiap genteng melengkung + bayangan bawah.
const tileTex = () => tex(128, 128, (g) => {
  g.fillStyle = '#5a5a5a'; g.fillRect(0, 0, 128, 128);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    const x = c * 32 + (r % 2) * 16, y = r * 32;
    for (const ox of [0, -128, 128]) {
      const gr = g.createLinearGradient(x + ox, 0, x + ox + 32, 0);
      gr.addColorStop(0, '#c8c8c8'); gr.addColorStop(0.35, '#ffffff'); gr.addColorStop(0.8, '#bdbdbd'); gr.addColorStop(1, '#8a8a8a');
      g.fillStyle = gr; g.fillRect(x + ox + 1, y + 1, 30, 27);
      g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x + ox + 1, y + 24, 30, 4);
    }
  }
});

const WALLS = ['#f6f1e7', '#efe3cf', '#f1dcb7', '#e5e1d8', '#dfe8ec', '#f3e4d4', '#e7dcc7', '#dbe5d3', '#ffffff', '#ece9e2'];
const RUKO = ['#f7c9a0', '#bfe0e8', '#f6e1a6', '#e7c3c0', '#cfe3bd', '#f3efe6', '#d8cbe6', '#fbe9d0'];   // ruko/gedung kota: lebih berwarna
const ROOFS = ['#c4532f', '#b8462a', '#cf6a3d', '#a9442b', '#c25a3a', '#9a9aa2', '#5f7fa8', '#b04a2e'];

export function buildCity(scene, heightAt, { extraBuildings = [], extraRoads = [], zebra = [], skip = () => false, onRoad = () => false } = {}) {
  // Tiga "kuas": dinding rumah, dinding gedung, atap (+ toren, kubah, dak). Tiap kuas = satu geometri.
  const brush = () => ({ pos: [], uv: [], col: [] });
  const chunks = new Map();
  let B;   // kuas petak bangunan yang sedang dibuat
  const pickChunk = (x, z) => { const k = Math.floor((x + 300) / 200) + ',' + Math.floor((z + 300) / 200); if (!chunks.has(k)) chunks.set(k, { house: brush(), office: brush(), braga: brush(), roof: brush() }); B = chunks.get(k); };
  const a = new THREE.Vector3(), b = new THREE.Vector3(), n = new THREE.Vector3();
  const V = (x, y, z) => new THREE.Vector3(x, y, z), UP = V(0, 1, 0), DOWN = V(0, -1, 0);
  // Segitiga dengan normal dijamin searah `want`; warna per vertex (k0..k2) untuk AO.
  function tri(br, p, uv, k, want) {
    a.subVectors(p[1], p[0]); b.subVectors(p[2], p[0]); n.crossVectors(a, b);
    const o = want && n.dot(want) < 0 ? [0, 2, 1] : [0, 1, 2];
    for (const i of o) { br.pos.push(p[i].x, p[i].y, p[i].z); br.uv.push(uv[i][0], uv[i][1]); br.col.push(k[i].r, k[i].g, k[i].b); }
  }
  const quad = (br, p, uv, k, want) => { tri(br, [p[0], p[1], p[2]], [uv[0], uv[1], uv[2]], [k[0], k[1], k[2]], want); tri(br, [p[0], p[2], p[3]], [uv[0], uv[2], uv[3]], [k[0], k[2], k[3]], want); };
  const shade = (c, f) => c.clone().multiplyScalar(f);
  // Atap: UV mengikuti arah teritis (u) dan kemiringan (v) supaya baris genteng sejajar tepi atap.
  const roofTri = (p, k, eaveDir) => {
    a.subVectors(p[1], p[0]); b.subVectors(p[2], p[0]); n.crossVectors(a, b).normalize(); if (n.y < 0) n.negate();
    const up = V(0, 0, 0).crossVectors(n, eaveDir).normalize(); if (up.y < 0) up.negate();
    tri(B.roof, p, p.map(q => [q.dot(eaveDir) / 1.5, q.dot(up) / 1.5]), [k, k, k], UP);
  };
  const flatUV = [[0.3, 0.45], [0.3, 0.45], [0.3, 0.45]];  // titik terang genteng → warna polos

  const grid = new Map(), ao = [];  // ao: [ [x,y,z] dalam, [x,y,z] luar ] per tepi
  const addCollider = col => { const k = `${Math.floor(col.x / CELL)},${Math.floor(col.z / CELL)}`; (grid.get(k) || grid.set(k, []).get(k)).push(col); };

  [...BUILDINGS, ...extraBuildings].forEach((d, bi) => {
    const kind = d[0], lv = d[1], pts = [];
    for (let i = 2; i < d.length; i += 2) pts.push([d[i], d[i + 1]]);
    const h0 = hash(bi + 1);
    let cx = 0, cz = 0, area = 0, gmin = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % pts.length];
      cx += x1 / pts.length; cz += z1 / pts.length; area += (x1 * z2 - x2 * z1) / 2;
      gmin = Math.min(gmin, heightAt(x1, z1));
    }
    if (bi < BUILDINGS.length && (skip(cx, cz) || Math.hypot(cx, cz) > 285 && onRoad(cx, cz, 9))) return;   // rumah OSM memberi tempat bagi distrik
    pickChunk(cx, cz);
    area = Math.abs(area);
    const big = kind !== 3 && (kind === 1 || area > 140);
    const floors = Math.max(1, Math.round(lv || (big ? 2 + h0 % 3 : kind === 2 ? 2 : 1 + (h0 % 3 === 0))));
    const base = gmin - 0.6, top = gmin + floors * FLOOR;
    const pitched = kind === 3 || !big && kind === 0 && area < 120;
    const br = kind === 3 ? B.braga : big ? B.office : B.house;
    const wall = new THREE.Color(kind === 2 ? '#f5f3ee' : kind === 3 || big && kind === 1 ? RUKO[h0 % RUKO.length] : WALLS[h0 % WALLS.length]);

    // Dinding per lantai: lantai dasar memakai separuh bawah tekstur (ada pintu), lantai atas separuh atas.
    // AO: kaki dinding 0,62 → naik ke 1,0 di atas lantai dasar.
    let run = (h0 % 7) * 0.9;
    for (let i = 0; i < pts.length; i++) {
      const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % pts.length], len = Math.hypot(x2 - x1, z2 - z1);
      const out = V(z2 - z1, 0, -(x2 - x1));
      if (out.dot(V((x1 + x2) / 2 - cx, 0, (z1 + z2) / 2 - cz)) < 0) out.negate(); // ponytail: arah keluar ditebak dari centroid; cukup untuk denah OSM yang kebanyakan cembung
      const u1 = run / FACADE_W, u2 = (run + len) / FACADE_W;
      for (let f = 0; f < floors; f++) {
        const y0 = f ? gmin + f * FLOOR : base, y1 = gmin + (f + 1) * FLOOR;
        const v0 = f ? 0.5 : -(gmin - base) / FLOOR * 0.5,
          v1 = f ? 1 : 0.5;
        const k0 = shade(wall, f ? 0.97 : 0.62), k1 = shade(wall, f ? 1 : 0.95);
        quad(br, [V(x1, y0, z1), V(x2, y0, z2), V(x2, y1, z2), V(x1, y1, z1)], [[u1, v0], [u2, v0], [u2, v1], [u1, v1]], [k0, k0, k1, k1], out);
      }
      if (!pitched) { // parapet atap dak
        const k = shade(wall, 0.9);
        quad(br, [V(x1, top, z1), V(x2, top, z2), V(x2, top + 0.45, z2), V(x1, top + 0.45, z1)], [PLAIN, PLAIN, PLAIN, PLAIN], [k, k, k, k], out);
      }
      ao.push([x1, z1, x2, z2, out.normalize()]);
      run += len;
    }

    // Atap
    const roofCol = new THREE.Color(kind === 3 ? ROOFS[h0 % 5] : ROOFS[h0 % ROOFS.length]);
    if (pitched) {
      const OH = 0.28;                                                     // teritis
      const e = pts.map(([x, z]) => { const dx = x - cx, dz = z - cz, l = Math.hypot(dx, dz) || 1; return V(x + dx / l * OH * 1.3, top - 0.12, z + dz / l * OH * 1.3); });
      const soffit = shade(wall, 0.55);
      for (let i = 0; i < e.length; i++) { // sisi bawah teritis (terlihat dari bawah) + lis kayu
        const j = (i + 1) % e.length, w0 = V(pts[i][0], top, pts[i][1]), w1 = V(pts[j][0], top, pts[j][1]);
        tri(B.roof, [w0, w1, e[j]], flatUV, [soffit, soffit, soffit], DOWN); tri(B.roof, [w0, e[j], e[i]], flatUV, [soffit, soffit, soffit], DOWN);
      }
      if (e.length === 4) { // atap perisai sungguhan: bubungan sejajar sisi panjang
        let [p0, p1, p2, p3] = e;
        if (p0.distanceTo(p1) < p1.distanceTo(p2)) [p0, p1, p2, p3] = [p1, p2, p3, p0];
        const ma = p3.clone().add(p0).multiplyScalar(0.5), mb = p1.clone().add(p2).multiplyScalar(0.5);
        const w = p1.distanceTo(p2), L = ma.distanceTo(mb), dir = mb.clone().sub(ma).normalize();
        const hgt = Math.min(2.6, w * 0.32), inset = Math.min(w / 2, L / 2 - 0.01);
        const ra = ma.clone().addScaledVector(dir, inset).setY(top + hgt), rb = mb.clone().addScaledVector(dir, -inset).setY(top + hgt);
        const long = p1.clone().sub(p0).normalize(), short = p2.clone().sub(p1).normalize();
        const kL = roofCol, kE = shade(roofCol, 0.92);
        roofTri([p0, p1, rb], kL, long); roofTri([p0, rb, ra], kL, long);
        roofTri([p2, p3, ra], kL, long); roofTri([p2, ra, rb], kL, long);
        roofTri([p1, p2, rb], kE, short); roofTri([p3, p0, ra], kE, short);
      } else {              // limas
        const apex = V(cx, top + Math.min(2.4, 0.42 * Math.sqrt(area)), cz);
        for (let i = 0; i < e.length; i++) { const j = (i + 1) % e.length; roofTri([e[i], e[j], apex], roofCol, e[j].clone().sub(e[i]).normalize()); }
      }
    } else {                // dak beton + toren air
      const slab = new THREE.Color(kind === 1 ? '#c7c2b8' : '#b7b1a6');
      const shape = pts.map(([x, z]) => new THREE.Vector2(x, z));
      for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(shape, []))
        tri(B.roof, [V(pts[i][0], top + 0.05, pts[i][1]), V(pts[j][0], top + 0.05, pts[j][1]), V(pts[k][0], top + 0.05, pts[k][1])], flatUV, [slab, slab, slab], UP);
      if (h0 % 3 === 0 && area > 20) addPrim(new THREE.CylinderGeometry(0.42, 0.42, 0.9, 10), cx, top + 0.5, cz, h0 % 2 ? '#2f6fd0' : '#ef7d22');
    }
    let r = 0; for (const [x, z] of pts) r = Math.max(r, Math.hypot(x - cx, z - cz));
    addCollider({ x: cx, z: cz, r: r * 0.8, top: top + (pitched ? 1 : 0.5) });
    if (kind === 2) { // masjid: kubah hijau + puncak emas
      const R = Math.min(4, 0.3 * Math.sqrt(area));
      addPrim(new THREE.SphereGeometry(R, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), cx, top, cz, '#2f9e6a', true);
      addPrim(new THREE.ConeGeometry(R * 0.12, R * 0.8, 8), cx, top + R + R * 0.35, cz, '#e0b43a');
      addCollider({ x: cx, z: cz, r: R, top: top + R * 1.8 });
    }
  });
  // Primitif kecil ke kuas atap (normal halus dihitung ulang nanti per-segitiga → pakai flat).
  function addPrim(geo, x, y, z, color, darkBase = false) {
    const g = geo.translate(x, y, z).toNonIndexed(), p = g.attributes.position, c = new THREE.Color(color);
    for (let i = 0; i < p.count; i += 3) {
      const q = [0, 1, 2].map(j => V(p.getX(i + j), p.getY(i + j), p.getZ(i + j)));
      const k = q.map(v => shade(c, darkBase ? 0.75 + 0.25 * Math.min(1, (v.y - y) / 2) : 1));
      tri(B.roof, q, flatUV, k);
    }
  }

  const mk = (br, mat) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(br.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(br.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(br.col, 3));
    g.computeVertexNormals();
    return new THREE.Mesh(g, mat);
  };
  const tiles = tileTex();
  const buildings = new THREE.Group();
  const mats = { braga: toon({ vertexColors: true, map: bragaTex() }, { rim: 0.12, clouds: true }), house: toon({ vertexColors: true, map: houseTex() }, { rim: 0.12, clouds: true }), office: toon({ vertexColors: true, map: officeTex() }, { spec: 0.15, shine: 30, rim: 0.12, clouds: true }), roof: toon({ vertexColors: true, map: tiles }, { spec: 0.2, shine: 20, rim: 0.1, clouds: true }) };
  for (const c of chunks.values()) for (const k of Object.keys(mats)) if (c[k].pos.length) buildings.add(mk(c[k], mats[k]));

  // Bayangan kontak (AO) di tanah sekeliling bangunan: pita hitam transparan, memudar ke luar.
  const ap = [], ac = [];
  for (const [x1, z1, x2, z2, o] of ao) {
    const W = 1.9, q = [[x1, z1, 0.34], [x2, z2, 0.34], [x2 + o.x * W, z2 + o.z * W, 0], [x1 + o.x * W, z1 + o.z * W, 0]]
      .map(([x, z, al]) => [x, heightAt(x, z) + 0.22, z, al]);
    for (const i of [0, 2, 1, 0, 3, 2]) { ap.push(q[i][0], q[i][1], q[i][2]); ac.push(0.05, 0.06, 0.04, q[i][3]); }
  }
  const split = (pos, col, n, mat) => {
    const cells = new Map(), group = new THREE.Group();
    for (let t = 0; t < pos.length / 9; t++) {
      const k = Math.floor((pos[t * 9] + 300) / 200) + ',' + Math.floor((pos[t * 9 + 2] + 300) / 200), c = cells.get(k) || cells.set(k, [[], []]).get(k);
      for (let i = 0; i < 9; i++) c[0].push(pos[t * 9 + i]);
      for (let i = 0; i < n * 3; i++) c[1].push(col[t * n * 3 + i]);
    }
    for (const [p, q] of cells.values()) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(q, n)); g.computeVertexNormals(); group.add(new THREE.Mesh(g, mat)); }
    return group;
  };
  const aoMesh = split(ap, ac, 4, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  aoMesh.children.forEach(m => { m.renderOrder = 1; });

  // Jalan (pita mengikuti tanah) + marka putus-putus di jalan besar + taman (poligon).
  const gp = [], gc = [];
  const push = (x, y, z, k) => { gp.push(x, y, z); gc.push(k.r, k.g, k.b); };
  const asphalt = new THREE.Color('#545a66'), lane = new THREE.Color('#6f7580'), mark = new THREE.Color('#e9e6dc'), curb = new THREE.Color('#a9a59c');
  const far = { n: 1 };   // 1 = potong jalan OSM di luar kota
  const disc = (p, r, lift, k, n = 10) => {   // ujung & sambungan jalan membulat
    const y = heightAt(p[0], p[1]) + lift, v = q => { const x = p[0] + Math.cos(q / n * Math.PI * 2) * r, z = p[1] + Math.sin(q / n * Math.PI * 2) * r; return [x, heightAt(x, z) + lift, z]; };
    for (let a = 0; a < n; a++) { push(p[0], y, p[1], k); push(...v(a + 1), k); push(...v(a), k); }
  };
  const ribbon = (pts, w, lift, k, caps = false, strips = 1) => {
    const kept = i => !far.n || !(Math.hypot(...pts[i]) > 322 || Math.hypot(...pts[i + 1]) > 322 || skip(...pts[i]) && skip(...pts[i + 1]));
    const side = pts.map((p, i) => {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[Math.min(pts.length - 1, i + 1)];
      const dx = p1[0] - p0[0], dz = p1[1] - p0[1], l = Math.hypot(dx, dz) || 1;
      let m = 1; if (i && i + 1 < pts.length) { const ex = p[0] - p0[0], ez = p[1] - p0[1], el = Math.hypot(ex, ez) || 1; m = Math.min(1.5, 1 / Math.max(0.5, (ex * dx + ez * dz) / (el * l))); }   // lebar tetap di tikungan
      return [-dz / l * w * m, dx / l * w * m];
    });
    if (caps) pts.forEach((p, i) => {
      const a = i > 0 && kept(i - 1), b = i + 1 < pts.length && kept(i); if (!a && !b) return;
      if (a && b) { const [x0, z0] = pts[i - 1], [x1, z1] = pts[i + 1], u = Math.hypot(p[0] - x0, p[1] - z0) || 1, v = Math.hypot(x1 - p[0], z1 - p[1]) || 1; if (((p[0] - x0) * (x1 - p[0]) + (p[1] - z0) * (z1 - p[1])) / u / v > 0.9) return; }
      disc(p, w, lift, k, w > 2 ? 14 : 9);
    });
    for (let i = 0; i < pts.length - 1; i++) {
      if (!kept(i)) continue;   // jangan memanjat gunung di luar kota
      for (let n = 0; n < strips; n++) {
        const A = 1 - 2 * n / strips, B = 1 - 2 * (n + 1) / strips;
        const q = [[pts[i], side[i], A], [pts[i], side[i], B], [pts[i + 1], side[i + 1], A], [pts[i + 1], side[i + 1], B]]
          .map(([p, s, sg]) => { const x = p[0] + s[0] * sg, z = p[1] + s[1] * sg; return [x, heightAt(x, z) + lift, z]; });
        for (const idx of [0, 2, 1, 1, 2, 3]) push(...q[idx], k);
      }
    }
  };
  // ruas tambahan (distrik) dipecah tiap 5 unit supaya menempel pada lereng
  const fine = pts => pts.flatMap((p, i) => { if (!i) return [p]; const q = pts[i - 1], n = Math.ceil(Math.hypot(p[0] - q[0], p[1] - q[1]) / 5); return Array.from({ length: n }, (_, k) => [q[0] + (p[0] - q[0]) * (k + 1) / n, q[1] + (p[1] - q[1]) * (k + 1) / n]); });
  const smooth = pts => pts.length < 3 ? pts : new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z))).getPoints(pts.length * 8).map(p => [p.x, p.z]);
  const brick = new THREE.Color('#a9705a');
  for (const r of extraRoads) {
    const pts = fine(smooth(r.pts)); far.n = 0;
    ribbon(pts, r.w + (r.main || r.brick ? 1.3 : 0.4), 0.18, curb, !r.brick, 4); ribbon(pts, r.w, 0.34, r.brick ? brick : r.main ? asphalt : lane, !r.brick, 3);
    r.line = pts; pts.lift = 0.36;
    if (r.main) for (let i = 0; i + 1 < pts.length; i += 2) if (!zebra.some(z => Math.hypot(z[0][0] - pts[i][0], z[0][1] - pts[i][1]) < 8)) ribbon([pts[i], pts[i + 1]].map((p, k, a) => k ? [a[0][0] + (p[0] - a[0][0]) * 0.55, a[0][1] + (p[1] - a[0][1]) * 0.55] : p), 0.11, 0.42, mark);
    far.n = 1;
  }
  far.n = 0; for (const z of zebra) ribbon(z, 0.3, 0.43, mark); far.n = 1;
  const PARK = [new THREE.Color('#62c24a'), new THREE.Color('#4fb23f'), new THREE.Color('#c8643c')];
  const parkTrees = [];
  for (const d of ROADS) {
    const w = d[0] / 2, pts = [];
    for (let i = 1; i < d.length; i += 2) pts.push([d[i], d[i + 1]]);
    const main = w >= 2;
    if (pts.some(p => Math.hypot(...p) > 280)) pts.splice(0, pts.length, ...fine(pts));   // di tepi kota tanah melengkung: pecah supaya menempel
    if (main) {
      ribbon(pts, w + 0.45, 0.14, curb, true, 2);                       // trotoar/kerb di tepi jalan besar
      pts.forEach((p, i) => {                                  // jalan besar yang terpotong di tepi kota berakhir di bundaran bertaman
        const inC = Math.hypot(...p) <= 322 && !skip(...p), cut = [pts[i - 1], pts[i + 1]].some(q => q && Math.hypot(...q) > 322);
        if (!inC || !cut) return;
        for (const [r, lift, k] of [[w * 2.5 + 0.5, 0.22, curb], [w * 2.5, 0.3, asphalt], [w * 1.05, 0.42, PARK[0]]]) disc(p, r, lift, k, 28);
        parkTrees.push(p);
      });
    }
    ribbon(pts, w, main ? 0.24 : 0.17, main ? asphalt : lane, true, main ? 2 : 1);
    if (!main) continue;
    for (let i = 0; i < pts.length - 1; i++) {                           // marka tengah putus-putus
      const [x1, z1] = pts[i], [x2, z2] = pts[i + 1], L = Math.hypot(x2 - x1, z2 - z1);
      for (let s = 0; s + 1.6 < L; s += 4) ribbon([[x1 + (x2 - x1) * s / L, z1 + (z2 - z1) * s / L], [x1 + (x2 - x1) * (s + 1.6) / L, z1 + (z2 - z1) * (s + 1.6) / L]], 0.09, 0.3, mark);
    }
  }
  let seed = 9; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const d of PARKS) {
    const kind = d[0], pts = [];
    for (let i = 1; i < d.length; i += 2) pts.push(new THREE.Vector2(d[i], d[i + 1]));
    if (pts.some(p => p.length() > 318 || skip(p.x, p.y))) continue;   // taman yang terpotong batas kota tidak digambar
    const lift = 0.06 + kind * 0.02;
    for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(pts, [])) {
      for (const p of [pts[i], pts[k], pts[j]]) push(p.x, heightAt(p.x, p.y) + lift, p.y, PARK[kind]);
      if (kind === 0) { // pohon taman: satu per ±150 unit²
        const A = Math.abs((pts[j].x - pts[i].x) * (pts[k].y - pts[i].y) - (pts[k].x - pts[i].x) * (pts[j].y - pts[i].y)) / 2;
        for (let t = 0; t < A / 150; t++) {
          let u = rnd(), v = rnd(); if (u + v > 1) { u = 1 - u; v = 1 - v; }
          parkTrees.push([pts[i].x + (pts[j].x - pts[i].x) * u + (pts[k].x - pts[i].x) * v, pts[i].y + (pts[j].y - pts[i].y) * u + (pts[k].y - pts[i].y) * v]);
        }
      }
    }
  }
  const ground = split(gp, gc, 3, toon({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }, { clouds: true }));

  scene.add(buildings, ground, aoMesh);

  return {
    sate: SATE,
    mainRoads: ROADS.filter(d => d[0] >= 3.5).map(d => { const p = []; for (let i = 1; i < d.length; i += 2) p.push([d[i], d[i + 1]]); return p.filter(([x, z]) => Math.hypot(x, z) < 300); }).filter(p => p.length > 1).concat(extraRoads.filter(r => r.main).map(r => r.line)),
    addCollider,
    buildings, ground, ao: aoMesh,
    parkTrees,
    // Apakah titik (x,y,z) masuk ke bangunan? (koordinat petak; grid 3×3 sel di sekitar)
    hit(x, y, z, pad = 1) {
      const gx = Math.floor(x / CELL), gz = Math.floor(z / CELL);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        const list = grid.get(`${gx + i},${gz + j}`); if (!list) continue;
        for (const k of list) if (y < k.top + pad && y > (k.bot ?? -99) - pad && (x - k.x) ** 2 + (z - k.z) ** 2 < (k.r + pad) ** 2) return true;
      }
      return false;
    },
  };
}
