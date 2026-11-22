// Kehidupan dunia: gunung di cakrawala, kebun teh, hewan, burung, layang-layang, mobil & bus, lampu jalan,
// pesawat NPC, air terjun, lapisan awan. Hampir semuanya InstancedMesh (murah).
import * as THREE from 'three';
import * as M from './models.js';
import { toon } from './toon.js';
import { LITE } from './config.js';
import { SKY } from './sky.js';
import { inDistrict, onRoad } from './districts.js';

const { part, bake, sph, cyl, cone, rbox } = M;
const PI = Math.PI, TAU = PI * 2, WHITE = new THREE.Color(0xffffff);
const dummy = new THREE.Object3D(), V3 = new THREE.Vector3();

// ── Hewan (satu resep, beda proporsi) ──
function beast({ body, belly = body, len = 1.6, fat = 0.8, leg = 0.9, neck = 0.3, head = 0.5, snout = 0.3, ear = 0.2, color2, pattern, extra = [] }) {
  const skin = c => (pattern && pattern(c) ? color2 : c.y < leg + fat * 0.45 ? belly : body), y = leg + fat;
  const P = [part(sph(30, 22), skin, { p: [0, y, 0], s: [fat, fat, len], soft: true, crease: 180 })];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.push(part(cyl(0.2, 0.22, leg + 0.4, 8), body, { p: [sx * fat * 0.55, (leg + 0.4) / 2, sz * len * 0.6] }));
  const hy = y + fat * 0.35 + neck, hz = len * 0.85 + neck * 0.35;
  if (neck > 0.4) P.push(part(new THREE.CylinderGeometry(0.22, 0.34, neck + 0.7, 18, 14), skin, { soft: true, crease: 80, p: [0, y + fat * 0.3 + neck * 0.45, hz - 0.2], r: [0.22, 0, 0] }));
  P.push(part(sph(22, 16), pattern && neck < 1 ? skin : () => body, { p: [0, hy, hz], s: [head, head, head], soft: true, crease: 180 }), part(sph(10, 7), belly, { p: [0, hy - head * 0.2, hz + head * 0.75], s: [snout, snout * 0.8, snout] }));
  for (const sx of [-1, 1]) P.push(part(sph(8, 6), body, { p: [sx * head * 0.8, hy + head * 0.75, hz - 0.1], s: [ear, ear * 1.5, ear * 0.5] }), part(sph(6, 5), 0x15151c, { p: [sx * head * 0.45, hy + head * 0.25, hz + head * 0.82], s: [0.1, 0.12, 0.08] }));
  return bake([...P, ...extra]);
}
export const ANIMALS = {
  gajah: () => beast({ body: 0x9aa6b5, len: 1.9, fat: 1.35, leg: 1.2, neck: 0.1, head: 1.0, snout: 0.45, ear: 0.2, extra: [
    part(cyl(0.16, 0.3, 2.0, 10), 0x9aa6b5, { p: [0, 1.9, 3.1], r: [0.25, 0, 0] }), ...[-1, 1].flatMap(s => [part(sph(12, 8), 0x8794a5, { p: [s * 1.15, 3.1, 1.6], s: [0.2, 0.9, 0.75] }), part(cone(0.13, 0.9, 8), 0xfff6e2, { p: [s * 0.45, 2.1, 2.9], r: [PI * 0.62, 0, 0] })])] }),
  harimau: () => beast({ body: 0xff9a2e, belly: 0xfff1dc, color2: 0x2c2016, pattern: c => Math.sin(c.z * 7.5 + Math.abs(c.x)) > 0.72 && c.y > 1.1, len: 1.7, fat: 0.8, leg: 0.8, neck: 0.1, head: 0.75, snout: 0.35 }),
  zebra: () => beast({ body: 0xffffff, color2: 0x22222a, pattern: c => Math.sin(c.z * 8 + c.y * 3) > 0.25, len: 1.6, fat: 0.8, leg: 1.2, neck: 0.8, head: 0.5, snout: 0.35 }),
  jerapah: () => beast({ body: 0xffd25a, belly: 0xffe9a8, color2: 0xb8691f, pattern: c => Math.sin(c.x * 5) * Math.sin(c.y * 4.5) * Math.sin(c.z * 5) > 0.1, len: 1.5, fat: 0.85, leg: 2.0, neck: 2.8, head: 0.5, snout: 0.35 }),
  sapi: () => beast({ body: 0xffffff, color2: 0x2b2522, pattern: c => Math.sin(c.x * 2.6 + 1) + Math.sin(c.z * 2.9) > 0.75, len: 1.7, fat: 1.0, leg: 0.9, neck: 0.2, head: 0.65, snout: 0.4, extra: [part(sph(10, 7), 0xffb3bd, { p: [0, 1.85, 2.45], s: [0.42, 0.3, 0.3] })] }),
  kelinci: () => beast({ body: 0xf6eee6, belly: 0xffffff, len: 0.8, fat: 0.7, leg: 0.15, neck: 0.1, head: 0.6, snout: 0.22, ear: 0.2, extra: [-1, 1].map(s => part(sph(10, 8), 0xffc6d0, { p: [s * 0.25, 2.3, 0.75], s: [0.15, 0.6, 0.1] })) }),
};

// ── Objek kecil ──
const birdGeo = () => bake([
  part(sph(8, 6), 0xffffff, { s: [0.18, 0.16, 0.5] }), part(cone(0.07, 0.25, 6), 0xff9a2e, { p: [0, 0, 0.55], r: [PI / 2, 0, 0] }),
  ...[-1, 1].map(s => part(rbox(1.3, 0.05, 0.4, 0.02), 0xeaf2ff, { p: [s * 0.65, 0.42, 0], r: [0, 0, s * 0.6] }))], false);
const kiteGeo = () => bake([
  part(new THREE.CylinderGeometry(1.5, 1.5, 0.08, 4), c => (c.x * c.z > 0 ? 0xffffff : 0xffd23a), { r: [PI / 2, 0, 0], s: [1, 1, 1.3] }),
  ...[0, 1, 2, 3, 4].map(i => part(rbox(0.5, 0.28, 0.06, 0.02), i % 2 ? 0x2f7bff : 0xff4f9a, { p: [Math.sin(i) * 0.35, -2.3 - i * 0.9, 0], r: [0, 0, i % 2 ? 0.5 : -0.5] }))], false);
const carGeo = () => bake([
  part(rbox(1.5, 0.7, 3.0, 0.25), 0xffffff, { p: [0, 0.65, 0] }), part(rbox(1.3, 0.6, 1.5, 0.22), 0x8fc7e8, { p: [0, 1.2, -0.1] }), part(rbox(1.2, 0.16, 1.35, 0.06), 0xffffff, { p: [0, 1.52, -0.1] }),
  ...[-1, 1].flatMap(x => [-1, 1].map(z => part(cyl(0.34, 0.34, 0.25, 10), 0x22222a, { p: [x * 0.72, 0.34, z * 0.95], r: [0, 0, PI / 2] })))]);
const busGeo = () => bake([
  part(rbox(1.9, 2.0, 6.0, 0.25), c => (c.y < 1.0 ? 0xffffff : 0xffc21a), { p: [0, 1.4, 0] }), part(rbox(1.98, 0.7, 5.2, 0.1), 0x6fb2dc, { p: [0, 1.8, 0.1] }),
  ...[-1, 1].flatMap(x => [-2, 2].map(z => part(cyl(0.42, 0.42, 0.3, 10), 0x22222a, { p: [x * 0.85, 0.42, z], r: [0, 0, PI / 2] })))]);
const lampGeo = () => bake([part(cyl(0.1, 0.16, 4.2, 6), 0x4a5361, { p: [0, 2.1, 0] }), part(rbox(1.0, 0.12, 0.2, 0.05), 0x4a5361, { p: [0.45, 4.15, 0] }), part(sph(8, 6), 0xfff0b0, { p: [0.9, 4.0, 0], s: [0.28, 0.2, 0.28] })]);
const poleGeo = () => bake([part(cyl(0.13, 0.2, 6.4, 7), 0x7a5a42, { p: [0, 3.2, 0] }), part(rbox(0.18, 0.18, 2.2, 0.04), 0x6d4f39, { p: [0, 5.9, 0] }), ...[-0.9, 0, 0.9].map(z => part(cyl(0.09, 0.12, 0.3, 6), 0xdfe6ea, { p: [0, 6.12, z] }))]);
const fountainGeo = () => bake([
  part(M.lathe([[0, 0], [6.4, 0], [6.6, 0.9], [6.0, 1.0], [5.8, 0.5], [0.01, 0.45]], 36), 0xe2dccf), part(cyl(5.8, 5.8, 0.1, 36), 0x4fc3ea, { p: [0, 0.62, 0] }),
  part(M.lathe([[0.9, 0.4], [0.6, 1.6], [2.8, 2.1], [2.9, 2.4], [0.5, 2.2], [0.45, 3.2], [1.4, 3.5], [1.45, 3.7], [0.01, 3.6]], 28), 0xefe9dc)]);
const heliGeo = () => bake([
  part(sph(16, 12), 0xffc21a, { p: [0, 0, 0], s: [1.5, 1.45, 2.1] }), part(sph(14, 10), 0x9fdcff, { p: [0, 0.25, -0.75], s: [1.2, 1.1, 1.5] }), part(cyl(0.22, 0.5, 4, 10), 0xffc21a, { p: [0, 0.3, 3.4], r: [PI / 2, 0, 0] }),
  part(rbox(0.2, 1.6, 0.9, 0.1), 0xe8343a, { p: [0, 0.9, 5.2] }), part(cyl(0.14, 0.14, 1, 8), 0x4a5361, { p: [0, 1.7, 0] }), part(cyl(0.75, 0.75, 0.06, 12), 0xc9d2da, { p: [0.2, 0.9, 5.3], r: [0, 0, PI / 2] }),
  ...[-1, 1].flatMap(x => [part(cyl(0.1, 0.1, 3.6, 7), 0x4a5361, { p: [x * 1.1, -1.75, 0], r: [PI / 2, 0, 0] }), part(cyl(0.08, 0.08, 0.9, 6), 0x4a5361, { p: [x * 0.95, -1.35, -0.7] }), part(cyl(0.08, 0.08, 0.9, 6), 0x4a5361, { p: [x * 0.95, -1.35, 0.7] })])]);
const gliderGeo = () => bake([
  part(sph(14, 10), 0xffffff, { p: [0, 0, 0], s: [0.6, 0.6, 3] }), part(sph(10, 8), 0x7fd4ff, { p: [0, 0.35, -1.2], s: [0.42, 0.4, 0.8] }), part(rbox(15, 0.14, 1.1, 0.06), 0xffffff, { p: [0, 0.25, -0.2] }),
  ...[-1, 1].map(x => part(rbox(2.4, 0.16, 1.12, 0.06), 0xff4f9a, { p: [x * 6.4, 0.25, -0.2] })), part(rbox(0.14, 1.6, 0.9, 0.06), 0xff4f9a, { p: [0, 0.9, 2.7] }), part(rbox(3, 0.12, 0.7, 0.05), 0xffffff, { p: [0, 1.65, 2.8] })]);
const teaGeo = () => bake([part(sph(8, 5), c => (c.y > 0.55 ? 0x7bd24a : 0x3f9a35), { p: [0, 0.35, 0], s: [0.75, 0.75, 3.4] })]);

// ── Awan: tipis memanjang (tinggi) & gumpalan alas rata ──
const cirrusGeo = () => bake([[0, 0, 12, 2], [10, 0.4, 9, 1.6], [-11, -0.2, 8, 1.5], [4, 0.2, 7, 2.6]].map(([x, y, s, w]) => part(sph(22, 12), 0xffffff, { p: [x, y, w], s: [s, 0.7, w], crease: 180 })), false);
const puffGeo = () => bake([part(M.blob([[0, 0.4, 0, 4.4], [5, -0.5, 1, 3.2], [-5, -0.6, -0.5, 3.0], [2, 3.2, -1, 2.9], [-2.5, 2.6, 1, 2.7], [9, -1.5, 0, 2.1], [-8.9, -1.6, 0.6, 2], [0.5, 0.6, 3.2, 2.8], [-0.5, 0.4, -3.2, 2.8], [4.6, 1.6, -0.8, 2.1], [-5, 1.4, 1.2, 2.1]], 8, 0.34, 0.78), c => new THREE.Color(0xd5e3f3).lerp(WHITE, Math.min(1, Math.max(0, (c.y + 2.4) / 4))), { crease: 180, soft: true })], false);

export function buildLife({ scene, heightAt, near, wrapC, wrappedInstances, instanced, anim, rand, cast, city, spheres, single, hit, shadows }) {
  const C = k => new THREE.Color(k);
  const add = (w, shadow = false) => { w.meshes.forEach(m => cast(m, shadow)); instanced.push(w); return w; };

  // Cakrawala: 3 lapis pegunungan pucat (perspektif udara). Ikut kamera, tanpa kabut → selalu ada kedalaman.
  const ranges = new THREE.Group();
  [[1500, 420, 0.5, 3, 0.0], [1250, 270, 0.72, 5, 2.0], [1000, 150, 0.95, 8, 4.4]].forEach(([R, H, mix, f, ph], li) => {
    const N = LITE ? 260 : 420, p = [], c = [], lo = SKY.horizon.clone(), hi = SKY.horizon.clone().lerp(C('#6f9fc4'), mix);
    for (let i = 0; i < N; i++) {
      const seg = [i, i + 1].map(k => {
        const a = k / N * TAU, north = 0.4 + 0.6 * Math.pow(0.5 - 0.5 * Math.sin(a), 1.2);      // paling tinggi di utara
        let h = (0.45 + 0.28 * Math.sin(a * f + ph) + 0.17 * Math.sin(a * Math.round(f * 2.7) + ph * 2) + 0.1 * Math.sin(a * Math.round(f * 6.1)));
        if (li === 1) { const d = Math.abs(Math.atan2(Math.sin(a + PI / 2 - 0.35), Math.cos(a + PI / 2 - 0.35))); const q = Math.min(1, Math.max(0, (d - 0.1) / 0.36)); h = Math.max(h, h + (1.2 - h) * (1 - q * q * (3 - 2 * q))); } // siluet perahu terbalik
        return [Math.cos(a) * R, Math.max(6, h * H * north), Math.sin(a) * R];
      });
      const [A, B] = seg, quad = [[A[0], -40, A[2], lo], [B[0], -40, B[2], lo], [B[0], B[1], B[2], hi], [A[0], -40, A[2], lo], [B[0], B[1], B[2], hi], [A[0], A[1], A[2], hi]];
      for (const [x, y, z, k] of quad) { p.push(x, y, z); c.push(k.r, k.g, k.b); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
    m.renderOrder = 901 + li; m.frustumCulled = false; ranges.add(m);
  });
  scene.add(ranges);

  // Kebun teh di lereng gunung barat laut (baris mengikuti kontur)
  const tea = [];
  for (let r = 26; r < 84; r += 5.5) for (let k = 0, n = Math.floor(TAU * r / 8.2); k < n; k++) {
    const a = k / n * TAU, x = -280 + Math.cos(a) * r, z = -270 + Math.sin(a) * r, ya = heightAt(x - Math.sin(a) * 3, z + Math.cos(a) * 3), yb = heightAt(x + Math.sin(a) * 3, z - Math.cos(a) * 3), y = Math.min(ya, yb, heightAt(x, z));
    const yr = heightAt(x + Math.cos(a) * 4, z + Math.sin(a) * 4);
    if (y > 8 && Math.abs(ya - yb) < 1 && Math.abs(yr - heightAt(x, z)) < 1.7 && !inDistrict(x, z) && !onRoad(x, z) && Math.hypot(x, z) < 405 && Math.hypot(x, z) > 320) tea.push([x, y - 0.1, z, 1, -a]);
  }
  add(wrappedInstances(teaGeo(), M.worldMat, tea, { maxR: 260 }));

  // Hewan di padang (timur laut & selatan)
  const kinds = Object.keys(ANIMALS);
  kinds.forEach((kind, ki) => {
    const list = [];
    for (let tries = 0; list.length < 4 && tries < 400; tries++) {
      const a = -1.35 + ki * 0.28 + rand() * 0.5 + (list.length > 2 ? 2.9 : 0), r = 338 + rand() * 45, x = Math.cos(a) * r, z = Math.sin(a) * r, y = heightAt(x, z);
      if (y < 3 || y > 16 || Math.abs(heightAt(x + 5, z) - y) + Math.abs(heightAt(x, z + 5) - y) > 3 || inDistrict(x, z) || onRoad(x, z) || hit(new THREE.Vector3(x, y + 5, z), 3)) continue;
      list.push([x, y, z, 1.5 + rand() * 0.4, rand() * TAU]);
    }
    add(wrappedInstances(ANIMALS[kind](), M.worldMat, list, { maxR: 260 }), true);
  });

  // Burung: 4 kawanan; mengepak lewat skala-y (V naik-turun)
  const FL = 8, flocks = [[0, 46, 60, 90, 0.16], [-190, 40, -60, 70, -0.2], [250, 34, 120, 85, 0.18], [-40, 120, -300, 80, -0.14]];
  const birds = new THREE.InstancedMesh(birdGeo(), toon({ vertexColors: true, fog: true }, { rim: 0.2 }), flocks.length * FL);
  birds.frustumCulled = false; scene.add(birds);
  flocks.forEach(f => { f.pos = new THREE.Vector3(); });
  anim.push((t, dt, cam) => {
    flocks.forEach(([cx, y, cz, R, sp], k) => {
      const f = flocks[k], a = t * sp, dir = Math.sign(sp);
      f.pos.set(cx + Math.cos(a) * R, y + Math.sin(t * 0.5 + k) * 4, cz + Math.sin(a) * R);
      for (let i = 0; i < FL; i++) {
        const row = Math.ceil(i / 2), side = i % 2 ? 1 : -1, b = a - dir * row * 0.035, rr = R + side * row * 1.9;
        dummy.position.set(near(cx + Math.cos(b) * rr, cam.x), f.pos.y + Math.sin(t * 2 + i) * 0.3, near(cz + Math.sin(b) * rr, cam.z));
        dummy.rotation.set(0, -b + (dir > 0 ? 0 : PI), 0); dummy.scale.set(1.3, 1.3 * Math.sin(t * 9 + i * 1.7), 1.3); dummy.updateMatrix();
        birds.setMatrixAt(k * FL + i, dummy.matrix);
      }
    });
    birds.instanceMatrix.needsUpdate = true;
  });

  // Layang-layang di atas permukiman
  const kites = Array.from({ length: LITE ? 9 : 16 }, (_, i) => { const a = rand() * TAU, r = 60 + rand() * 220; return [Math.cos(a) * r, 24 + rand() * 12, Math.sin(a) * r, i]; });
  const kite = new THREE.InstancedMesh(kiteGeo(), toon({ vertexColors: true }, { rim: 0.2 }), kites.length);
  const KC = [0xff5a5a, 0x7fd4ff, 0xffffff, 0xb7f07a, 0xff9ad0].map(C);
  kites.forEach((k, i) => kite.setColorAt(i, KC[i % KC.length]));
  kite.frustumCulled = false; scene.add(kite);
  anim.push((t, dt, cam) => {
    kites.forEach(([x, y, z, i]) => {
      dummy.position.set(near(x, cam.x) + Math.sin(t * 0.7 + i) * 3, y + Math.sin(t * 1.1 + i * 2) * 1.6, near(z, cam.z) + Math.cos(t * 0.5 + i) * 2);
      dummy.rotation.set(-0.35, i * 0.7 + Math.sin(t * 0.4 + i) * 0.3, Math.sin(t * 1.6 + i) * 0.35); dummy.scale.setScalar(1.15 * Math.min(1, Math.max(0.001, (dummy.position.distanceTo(cam) - 9) / 14))); dummy.updateMatrix();
      kite.setMatrixAt(i, dummy.matrix);
    });
    kite.instanceMatrix.needsUpdate = true;
  });

  // Mobil & bus di jalan besar (lajur kiri), masuk/keluar mulus di ujung ruas
  const round = p => { for (let k = 0; k < 2; k++) { const q = [p[0]]; for (let i = 0; i + 1 < p.length; i++) { const [a, b] = [p[i], p[i + 1]]; q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); } q.push(p.at(-1)); q.lift = p.lift; p = q; } return p; };   // tikungan mulus untuk mobil
  const roads = city.mainRoads.map(round).map(p => { const L = [0]; for (let i = 1; i < p.length; i++) L.push(L[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1])); return { p, L, len: L.at(-1) }; }).filter(r => r.len > 45);
  const fleet = (geo, n, speed, colors) => {
    const m = cast(new THREE.InstancedMesh(geo, M.variant(M.worldMat, 'ic'), n), false);
    const cars = Array.from({ length: n }, (_, i) => ({ r: roads[Math.floor(rand() * roads.length)], d: rand() * 200, rev: i % 2, v: speed * (0.8 + rand() * 0.5) }));
    cars.forEach((c, i) => m.setColorAt(i, c.col = C(colors[i % colors.length])));
    m.frustumCulled = false; scene.add(m);
    anim.push((t, dt, cam) => {
      let i = 0;
      cars.forEach(c => {
        c.d = (c.d + c.v * dt) % c.r.len;
        const s = c.rev ? c.r.len - c.d : c.d; let k = 1; while (k < c.r.L.length - 1 && c.r.L[k] < s) k++;
        const [x1, z1] = c.r.p[k - 1], [x2, z2] = c.r.p[k], l = c.r.L[k] - c.r.L[k - 1] || 1, u = (s - c.r.L[k - 1]) / l;
        let dx = (x2 - x1) / l, dz = (z2 - z1) / l; if (c.rev) { dx = -dx; dz = -dz; }
        const x = x1 + (x2 - x1) * u + dz * 1.15, z = z1 + (z2 - z1) * u - dx * 1.15, nx = near(x, cam.x), nz = near(z, cam.z);
        const far = (nx - cam.x) ** 2 + (nz - cam.z) ** 2; if (far > 48000) return;   // jauh: tidak digambar (mengecil dulu, tidak hilang mendadak)
        const y = heightAt(x, z), h = Math.atan2(dx, dz);
        c.h = c.h === undefined ? h : c.h + Math.atan2(Math.sin(h - c.h), Math.cos(h - c.h)) * Math.min(1, dt * 5);
        c.y = c.y === undefined || Math.abs(c.y - y) > 3 ? y : c.y + (y - c.y) * Math.min(1, dt * 8);
        dummy.position.set(nx, c.y + (c.r.p.lift || 0.2), nz); dummy.rotation.set(Math.atan2(heightAt(x - dx * 2, z - dz * 2) - heightAt(x + dx * 2, z + dz * 2), 4), c.h, 0, 'YXZ');
        dummy.scale.setScalar(0.72 * Math.min(1, c.d / 6, (c.r.len - c.d) / 6, (48000 - far) / 12000) + 1e-3); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); m.setColorAt(i++, c.col);
      });
      m.count = i; m.visible = i > 0; m.instanceMatrix.needsUpdate = m.instanceColor.needsUpdate = true;
    });
  };
  if (roads.length) { fleet(carGeo(), LITE ? 34 : 64, 7, ['#e8343a', '#2f7bff', '#ffffff', '#ffc21a', '#2fbf4f', '#4a5361', '#ff7a1a']); fleet(busGeo(), 10, 5, ['#ffffff', '#bfe4ff', '#ffd9b0']); }

  // Lampu jalan di jalan besar
  const lamps = [];
  for (const r of roads) for (let s = 8; s < r.len && lamps.length < (LITE ? 120 : 220); s += LITE ? 34 : 22) {
    let k = 1; while (k < r.L.length - 1 && r.L[k] < s) k++;
    const [x1, z1] = r.p[k - 1], [x2, z2] = r.p[k], l = r.L[k] - r.L[k - 1] || 1, u = (s - r.L[k - 1]) / l, dx = (x2 - x1) / l, dz = (z2 - z1) / l, x = x1 + (x2 - x1) * u - dz * 3.3, z = z1 + (z2 - z1) * u + dx * 3.3;
    lamps.push([x, heightAt(x, z), z, 1, Math.atan2(-dx, dz) + PI]);
  }
  add(wrappedInstances(lampGeo(), M.worldMat, lamps, { maxR: 190 }));

  // Tiang listrik + kabel di seberang lampu
  const poles = [], wire = [];
  for (const r of roads) {
    let prev = null;
    for (let s = 4; s < r.len && poles.length < (LITE ? 90 : 190); s += 24) {
      let k = 1; while (k < r.L.length - 1 && r.L[k] < s) k++;
      const [x1, z1] = r.p[k - 1], [x2, z2] = r.p[k], l = r.L[k] - r.L[k - 1] || 1, u = (s - r.L[k - 1]) / l, dx = (x2 - x1) / l, dz = (z2 - z1) / l, x = x1 + (x2 - x1) * u + dz * 3.9, z = z1 + (z2 - z1) * u - dx * 3.9, y = heightAt(x, z);
      if (y < 1.5 || inDistrict(x, z) || hit(V3.set(x, y + 4, z), 0.4)) { prev = null; continue; }
      const ry = Math.atan2(-dz, dx);
      poles.push([x, y, z, 1, ry]);
      const tops = [-0.9, 0, 0.9].map(o => [x + Math.sin(ry) * o, y + 6.25, z + Math.cos(ry) * o]);
      if (prev) tops.forEach((b, i) => { const a = prev[i]; for (let q = 0; q < 5; q++) for (const w of [q / 5, (q + 1) / 5]) wire.push(a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w - Math.sin(w * PI) * 0.9, a[2] + (b[2] - a[2]) * w); });
      prev = tops;
    }
  }
  add(wrappedInstances(poleGeo(), M.worldMat, poles, { maxR: 170 }));
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
  const wires = new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x2b2f38, transparent: true, opacity: 0.55, depthWrite: false })); scene.add(wires);
  anim.push((t, dt, cam) => wires.position.set(near(0, cam.x), 0, near(0, cam.z)));

  // Air mancur di taman selatan Gedung Sate & Alun-Alun
  const FOUNT = [[0, 103]].filter(([x, z]) => !hit(V3.set(x, heightAt(x, z) + 8, z), 5));
  const drops = new THREE.InstancedMesh(sph(5, 4), new THREE.MeshBasicMaterial({ color: 0xd4f2ff, transparent: true, opacity: 0.85, depthWrite: false }), 60); drops.frustumCulled = false; scene.add(drops);
  const fy = FOUNT.map(([x, z]) => { const y = heightAt(x, z); single(fountainGeo(), x, z, { y, shadow: false }); return y; });
  anim.push((t, dt, cam) => {
    let n = 0;
    FOUNT.forEach(([x, z], k) => {
      const px = near(x, cam.x), pz = near(z, cam.z); if ((px - cam.x) ** 2 + (pz - cam.z) ** 2 > 26000) return;
      for (let i = 0; i < 60; i++) {
        const u = (t * 0.75 + i / 60 * 5) % 1, a = i / 60 * TAU * 7, top = i % 3 === 0, r = (top ? 0.8 : 3.6) * u;
        dummy.position.set(px + Math.cos(a) * r, fy[k] + (top ? 3.7 + 14 * u * (1 - u) : 2.4 + 6 * u * (1 - u) - 1.6 * u * u), pz + Math.sin(a) * r);
        dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(0.17); dummy.updateMatrix(); drops.setMatrixAt(n++, dummy.matrix);
      }
    });
    drops.count = n; drops.visible = n > 0; drops.instanceMatrix.needsUpdate = true;
  });

  // Helikopter kuning di atas Kota Lama, pesawat layang tinggi di utara
  const heli = cast(new THREE.Mesh(heliGeo(), M.toyMat), false), rotor = new THREE.Mesh(bake([part(rbox(9, 0.08, 0.5, 0.04), 0x3a4250, { p: [0, 0, 0] }), part(rbox(0.5, 0.08, 9, 0.04), 0x3a4250, { p: [0, 0, 0] })], false), M.worldMat);
  rotor.position.y = 2.25; heli.add(rotor); heli.scale.setScalar(1.25); scene.add(heli);
  const glider = cast(new THREE.Mesh(gliderGeo(), M.toyMat), false); glider.scale.setScalar(1.3); scene.add(glider);
  anim.push((t, dt, cam) => {
    let a = t * 0.11; heli.position.set(near(110 + Math.cos(a) * 95, cam.x), 46 + Math.sin(t * 0.5) * 4, near(285 + Math.sin(a) * 62, cam.z)); heli.rotation.y = Math.atan2(Math.sin(a) * 95, -Math.cos(a) * 62); rotor.rotation.y += dt * 24;
    a = -t * 0.06; glider.position.set(near(40 + Math.cos(a) * 150, cam.x), 118 + Math.sin(t * 0.3) * 8, near(-250 + Math.sin(a) * 110, cam.z)); glider.rotation.set(0, Math.atan2(-Math.sin(a) * 150, Math.cos(a) * 110), -0.25, 'YXZ');
    heli.visible = heli.position.distanceTo(cam) < 340; glider.visible = glider.position.distanceTo(cam) < 360;
  });

  // Balon udara tambahan bermotif lain
  [[-120, 58, 120, 0], [-230, 66, -120, 1], [230, 84, -120, 2], [60, 96, -250, 1], [-300, 60, 60, 2]].forEach(([x, y, z, pal], i) => {
    const b = single(M.balloonGeo([[0x9b4dff, 0xff9ad0, 0xffffff, 0x2fbfe0], [0x2fbf4f, 0xffffff, 0xffc21a, 0x12b5a5], [0xff4f9a, 0xffffff, 0xff7a1a, 0xffd93a]][pal]), x, z, { y });
    const col = { x, y: y + 9, z, r: 6.5 }; spheres.push(col);
    anim.push(t => { b.position.y = y + Math.sin(t * 0.5 + i * 1.7) * 2.4; col.y = b.position.y + 9; b.rotation.y = t * 0.08; });
  });

  // Pesawat NPC (karakter lain) terbang berputar
  [['police', 150, 70, 0.07, 0], ['dino', 250, 92, -0.05, 2], ['cat', 190, 54, 0.06, 4]].forEach(([k, R, y, sp, ph]) => {
    const p = M.makePlane(k); p.visual.traverse(o => { o.castShadow = false; }); p.visual.scale.setScalar(1.15); scene.add(p.root);
    anim.push((t, dt, cam) => {
      const a = t * sp + ph, dir = Math.sign(sp), x = Math.cos(a) * R, z = Math.sin(a) * R;
      p.root.position.set(near(x, cam.x), y + Math.sin(t * 0.4 + ph) * 5, near(z, cam.z));
      p.root.visible = p.root.position.distanceTo(cam) < 330;
      p.root.rotation.y = -a + (dir > 0 ? PI : 0); p.visual.rotation.z = dir * 0.3; p.prop.rotation.z += dt * 40;
    });
  });

  // Lapisan awan: gumpalan (sedang), tipis memanjang (tinggi), rendah di sekitar gunung
  const cloudMat = toon({ vertexColors: true, emissive: 0xb4c0d6 }, { rim: 0.5 });
  const mist = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0xc8d6e6, transparent: true, opacity: 0.5, depthWrite: false });
  const layer = (n, geo, mat, y0, y1, s0, s1, area) => Array.from({ length: n }, () => { const [x, z] = area ? area() : [(rand() - 0.5) * 1000, (rand() - 0.5) * 1000]; return [x, y0 + rand() * (y1 - y0), z, s0 + rand() * (s1 - s0), rand() * 6]; });
  const puffs = layer(18, 0, 0, 78, 150, 1.4, 2.8), wisps = layer(14, 0, 0, 175, 225, 2.2, 3.6), low = layer(60, 0, 0, 30, 60, 1.2, 1.9, () => { const k = rand() < 0.5, a = rand() * TAU, r = 70 + rand() * 45; return k ? [-280 + Math.cos(a) * r, -270 + Math.sin(a) * r] : [95 + (rand() < 0.5 ? -1 : 1) * (75 + rand() * 40), -382 - rand() * 40]; }).filter(([x, y, z, s]) => [[0, 0], [9, 0], [-9, 0], [0, 9], [0, -9]].every(([a, b]) => heightAt(x + a, z + b) < y - 14 * s)).slice(0, 12);   // awan tidak pernah menembus lereng
  
  add(wrappedInstances(puffGeo(), cloudMat, puffs)); add(wrappedInstances(cirrusGeo(), mist, wisps, { maxR: 520 })); add(wrappedInstances(puffGeo(), cloudMat, low));
  anim.push((t, dt) => { for (const c of puffs) c[0] = wrapC(c[0] + dt * 1.3); for (const c of wisps) c[0] = wrapC(c[0] + dt * 2.4); });

  // Air terjun dari pulau melayang (tekstur garis bergulir)
  const wt = document.createElement('canvas'); wt.width = 64; wt.height = 128;
  const g = wt.getContext('2d'); g.fillStyle = 'rgba(190,235,255,.75)'; g.fillRect(0, 0, 64, 128);
  for (let i = 0; i < 46; i++) { g.fillStyle = `rgba(255,255,255,${0.25 + rand() * 0.6})`; g.fillRect(rand() * 62, rand() * 128, 2 + rand() * 3, 12 + rand() * 40); }
  const tex = new THREE.CanvasTexture(wt); tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.repeat.set(1, 2);
  const fallMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
  [[-60, 92, -290, 1.3], [-150, 112, -235, 1], [-190, 84, -330, 1.1]].forEach(([x, y, z, s]) => {
    const f = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.3, 34, 8, 1, true, -0.9, 1.8).translate(0, -16.5, 0), fallMat);
    const ox = x + 1, oz = z + 9.2 * s; f.position.set(ox, y + 0.6, oz); f.scale.setScalar(s); scene.add(f);
    anim.push((t, dt, cam) => { f.position.x = near(ox, cam.x); f.position.z = near(oz, cam.z); f.visible = (f.position.x - cam.x) ** 2 + (f.position.z - cam.z) ** 2 < 52000; });
  });
  anim.push(t => { tex.offset.y = t * 0.9; });

  anim.push((t, dt, cam) => ranges.position.set(cam.x, 0, cam.z));
  return { clouds: [...puffs, ...low] };
}
