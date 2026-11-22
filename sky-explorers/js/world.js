// Dunia BERULANG: satu petak TILE×TILE (pulau di tengah laut, kota mini Bandung di tengahnya) yang
// menyambung di keempat sisi. Hanya salinan terdekat kamera yang digambar → biayanya = satu petak.
// Kabut (FOG.far < TILE/2) menyembunyikan titik sambungnya.
import * as THREE from 'three';
import * as M from './models.js';
import { SPOTS, LETTERS, NUMBERS, COLORS, TILE, FOG, LITE } from './config.js';
import { createSky, SKY, SUN_DIR } from './sky.js';
import { buildCity } from './city.js';
import { landmarks } from './landmarks.js';
import { buildLife, ANIMALS } from './life.js';
import { shapeLand, inDistrict, districtLandmarks, buildDistricts, BUILDINGS_X, ROADS_X, ZEBRA, onRoad, TREES_X } from './districts.js';
import { toon, TIME } from './toon.js';

const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const ISLAND = 440;
const CITY_R = 300;
export const wrapC = v => v - TILE * Math.round(v / TILE);          // ke [-TILE/2, TILE/2]
export const near = (home, ref) => home + TILE * Math.round((ref - home) / TILE); // salinan terdekat

export function heightAt(x, z) {
  x = wrapC(x); z = wrapC(z);
  const r = Math.hypot(x, z);
  const land = 1 - ss(ISLAND * 0.85, ISLAND * 1.08, r);              // 0 di tepi petak → sambungan mulus
  const hills = 9 * Math.sin(x * 0.011 + 1) * Math.cos(z * 0.009) + 6 * Math.sin((x - z) * 0.021) + 3 * Math.cos(x * 0.037 + z * 0.029);
  const peak = 46 * Math.exp(-((x + 280) ** 2 + (z + 270) ** 2) / 4200);
  const city = 1 - ss(CITY_R, CITY_R + 45, r);                       // Bandung: naik ke utara (Dago)
  const boat = 46 * Math.exp(-(((z + 372) / 27) ** 2)) * (1 - ss(52, 112, Math.abs(x - 95)));   // gunung berbentuk perahu terbalik di utara
  const east = 26 * Math.exp(-((x - 372) ** 2 + (z - 60) ** 2) / 2300), west = 40 * Math.exp(-((x + 368) ** 2 + (z - 95) ** 2) / 2800), south = 15 * Math.exp(-((x + 112) ** 2 + (z - 392) ** 2) / 1500);
  const rural = 3 + Math.max(0, hills + 4) + peak + boat + east + west + south;
  return shapeLand(x, z, land * (rural + (10 - z * 0.022 - rural) * city) - (1 - land) * 9);
}
// Tinggi permukaan yang benar-benar tergambar (segitiga petak 10 unit) → jalan & benda menempel di lereng.
const GN = LITE ? 100 : 128, GS = TILE / GN, gh = [];   // petak ±7,8 unit (HP 10) → bukit & tepi sungai lebih halus
const gv = (i, j) => { const k = j * (GN + 1) + i; return gh[k] ??= heightAt(i * GS - TILE / 2, j * GS - TILE / 2); };
export function groundAt(x, z) {
  const u = (wrapC(x) + TILE / 2) / GS, v = (wrapC(z) + TILE / 2) / GS, i = Math.min(GN - 1, Math.floor(u)), j = Math.min(GN - 1, Math.floor(v)), fx = u - i, fz = v - j;
  const a = gv(i, j), b = gv(i, j + 1), c = gv(i + 1, j + 1), d = gv(i + 1, j);
  return fx + fz < 1 ? a + (d - a) * fx + (b - a) * fz : c + (b - c) * (1 - fx) + (d - c) * (1 - fz);
}

function rng(seed) { // mulberry32 → dunia selalu sama
  return () => { seed |= 0; seed = seed + 0x6d2b79f5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// Noise yang menyambung di tepi (untuk tekstur berulang): beberapa oktaf value noise.
function tileNoise(size, octaves, seed) {
  const out = new Float32Array(size * size), r = rng(seed);
  for (const [cells, amp] of octaves) {
    const g = Array.from({ length: cells * cells }, r);
    const at = (i, j) => g[(j % cells) * cells + (i % cells)];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const fx = x / size * cells, fy = y / size * cells, x0 = Math.floor(fx), y0 = Math.floor(fy);
      const sx = (fx - x0) ** 2 * (3 - 2 * (fx - x0)), sy = (fy - y0) ** 2 * (3 - 2 * (fy - y0));
      out[y * size + x] += amp * ((at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx) * (1 - sy) + (at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx) * sy);
    }
  }
  return out;
}
function canvasTex(size, fill) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), img = g.createImageData(size, size);
  fill(img.data);
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = LITE ? 1 : 4;
  return t;
}
// Detail rumput/tanah: dikalikan ke warna vertex medan (±0,8..1).
function detailTexture() {
  const S = 256, n = tileNoise(S, [[16, 0.45], [64, 0.35], [256, 0.2]], 11);
  return canvasTex(S, d => { for (let i = 0; i < n.length; i++) { d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = 205 + n[i] * 50; d[i * 4 + 3] = 255; } });
}
// Normal map riak air dari noise (digeser pelan → kilau matahari bergerak).
function waterNormals() {
  const S = 128, h = tileNoise(S, [[8, 0.6], [16, 0.3], [32, 0.1]], 5), k = 2.2;
  return canvasTex(S, d => {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = (h[y * S + (x + 1) % S] - h[y * S + (x + S - 1) % S]) * k, dy = (h[((y + 1) % S) * S + x] - h[((y + S - 1) % S) * S + x]) * k;
      const l = Math.hypot(dx, dy, 1), i = (y * S + x) * 4;
      d[i] = (-dx / l * 0.5 + 0.5) * 255; d[i + 1] = (-dy / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
  });
}

// Tekstur bulat lembut untuk bayangan kontak (pohon, pesawat).
export const blobTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
export const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, color: 0x1f4a22, transparent: true, opacity: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
const blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

const dummy = new THREE.Object3D();
// InstancedMesh yang tiap frame hanya berisi instans dekat & di depan kamera (salinan terdekat).
// far = geometri sederhana untuk jarak > nearR; hanya yang dekat menjatuhkan bayangan.
function wrappedInstances(geo, mat, list, { far = null, nearR = 120, maxR = 400, colors = null } = {}) {
  maxR = Math.min(maxR * (LITE ? 0.72 : 1), FOG.far + 30); if (LITE) nearR *= 0.55;
  mat = M.variant(mat, colors ? 'ic' : 'i');
  const meshes = (far ? [geo, far] : [geo]).map(g => { const m = new THREE.InstancedMesh(g, mat, list.length); m.frustumCulled = false; if (colors && list.length) m.setColorAt(0, colors[0]); m.count = 0; return m; });
  return {
    mesh: meshes[0], meshes,
    update(cx, cz, fx = 0, fz = 0) {
      const n = [0, 0];
      for (let i = 0; i < list.length; i++) {
        const [x, y, z, s = 1, ry = 0] = list[i], px = near(x, cx), pz = near(z, cz), dx = px - cx, dz = pz - cz, d2 = dx * dx + dz * dz;
        if (d2 > maxR * maxR || (d2 > 6400 && dx * fx + dz * fz < Math.sqrt(d2) * (LITE ? 0.1 : 0.25))) continue;   // jauh / di luar pandangan
        const q = d2 > maxR * maxR * 0.74 ? Math.max(0.001, (1 - Math.sqrt(d2) / maxR) / 0.14) : 1, S = s * q * q * (3 - 2 * q);   // muncul/hilang membesar-mengecil, tidak mendadak
        const k = far && d2 > nearR * nearR ? 1 : 0, e = meshes[k].instanceMatrix.array, o = n[k]++ * 16, co = Math.cos(ry) * S, si = Math.sin(ry) * S;
        e[o] = co; e[o + 1] = 0; e[o + 2] = -si; e[o + 3] = 0; e[o + 4] = 0; e[o + 5] = S; e[o + 6] = 0; e[o + 7] = 0;
        e[o + 8] = si; e[o + 9] = 0; e[o + 10] = co; e[o + 11] = 0; e[o + 12] = px; e[o + 13] = y; e[o + 14] = pz; e[o + 15] = 1;
        if (colors) meshes[k].setColorAt(n[k] - 1, colors[i]);
      }
      meshes.forEach((m, k) => { m.count = n[k]; m.visible = n[k] > 0; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; });
    },
  };
}

export function buildWorld(scene, { shadows = false } = {}) {
  const rand = rng(7);
  const spheres = [];     // bola tabrakan {x,y,z,r} di koordinat petak
  const anim = [];        // (t, dt) → animasi lingkungan
  const instanced = [];   // wrappedInstances
  const movers = [];      // {obj, x, z}: mesh tunggal yang dipindah ke salinan terdekat
  const cast = (o, c = true) => { o.castShadow = shadows && c; o.receiveShadow = shadows; return o; };

  // Langit, kabut, cahaya (resep Pemburu Kaset) + bayangan matahari selektif mengikuti pesawat.
  scene.add(createSky());
  scene.fog = new THREE.Fog(SKY.horizon, FOG.near, FOG.far);
  const sun = new THREE.DirectionalLight('#ffe9c8', 2.75);
  sun.position.copy(SUN_DIR).multiplyScalar(200);
  const rim = new THREE.DirectionalLight('#9fc6ff', 0.7);
  rim.position.set(-SUN_DIR.x, 0.35, -SUN_DIR.z).normalize().multiplyScalar(100);
  scene.add(new THREE.HemisphereLight('#cfdcef', '#8f9672', LITE ? 1.05 : 0.9), sun, sun.target); if (!LITE) scene.add(rim);   // HP: satu cahaya arah saja
  const SH_R = 70, SH_MAP = 2048;
  if (shadows) {
    sun.castShadow = true;
    const sh = sun.shadow;
    sh.mapSize.set(SH_MAP, SH_MAP); sh.bias = -0.0009; sh.normalBias = 0.16;   // tanpa garis-garis bayangan sendiri
    Object.assign(sh.camera, { left: -SH_R, right: SH_R, top: SH_R, bottom: -SH_R, near: 1, far: 400 });
    sh.camera.updateProjectionMatrix();
  }

  // Daratan: satu geometri petak, normal halus, warna per vertex + tekstur detail berulang.
  const tg = new THREE.PlaneGeometry(TILE, TILE, GN, GN).rotateX(-Math.PI / 2);
  const tp = tg.attributes.position, tc = new Float32Array(tp.count * 3);
  const C = k => new THREE.Color(k);
  const deep = C(0x2bb6d0), shallow = C(0x52d8c6), sand = C(0xf2da98), grassA = C(0x45ac22), grassB = C(0x74c932), top = C(0x9ad35a), urban = C(0xbdb79f), forest = C(0x2f8a3c), paddy = C(0xb9cf45), bloom = C(0xe58ac0), rock = C(0x9c9483);
  const c = new THREE.Color(), g2 = new THREE.Color();
  for (let i = 0; i < tp.count; i++) {
    const x = tp.getX(i), z = tp.getZ(i), y = heightAt(x, z), r = Math.hypot(x, z);
    tp.setY(i, y);
    const n = 0.5 + 0.5 * Math.sin(x * 0.045 + Math.sin(z * 0.03) * 2) * Math.cos(z * 0.05 - x * 0.012);
    const n2 = 0.5 + 0.5 * Math.sin(x * 0.021 + 2) * Math.sin(z * 0.026 - 1), slope = Math.hypot(heightAt(x + 4, z) - y, heightAt(x, z + 4) - y) / 4;
    g2.lerpColors(grassA, grassB, n).lerp(paddy, 0.75 * ss(0.72, 0.9, n2) * (1 - ss(14, 22, y))).lerp(bloom, 0.7 * ss(0.8, 0.95, 1 - n2) * (1 - ss(10, 16, y)))
      .lerp(forest, 0.85 * ss(16, 34, y)).lerp(top, ss(44, 56, y)).lerp(rock, 0.8 * ss(0.75, 1.25, slope)).lerp(urban, 0.75 * (1 - ss(CITY_R - 20, CITY_R + 10, r)));
    if (y < 1.6) c.lerpColors(deep, shallow, ss(-8, -1.5, y)).lerp(sand, ss(-1.5, 1.2, y));
    else c.lerpColors(sand, g2, ss(1.6, 3.4, y));
    c.toArray(tc, i * 3);
  }
  tg.setAttribute('color', new THREE.BufferAttribute(tc, 3));
  tg.computeVertexNormals();
  const detail = detailTexture(); detail.repeat.set(160, 160);
  const terrainMat = toon({ vertexColors: true, map: detail }, { clouds: true });
  const tiles = [0, 1, 2, 3].map(() => { const m = cast(new THREE.Mesh(tg, terrainMat), false); scene.add(m); return m; });

  const wn = waterNormals(); wn.repeat.set(36, 36);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400).rotateX(-Math.PI / 2),
    new THREE.MeshPhongMaterial({ color: 0x23aee0, specular: 0xcff4ff, shininess: 120, normalMap: wn, normalScale: new THREE.Vector2(0.45, 0.45), transparent: !LITE, opacity: 0.86 }));
  scene.add(water);
  anim.push(t => { wn.offset.set(t * 0.004, t * 0.0025); });

  const single = (geo, x, z, { s = 1, ry = 0, y = heightAt(x, z), shadow = true } = {}) => {
    const m = cast(new THREE.Mesh(geo, M.worldMat), shadow); m.position.set(x, y, z); m.scale.setScalar(s); m.rotation.y = ry;
    scene.add(m); movers.push({ obj: m, x, z }); return m;
  };

  // Kota mini Bandung (OpenStreetMap) + Gedung Sate
  const city = buildCity(scene, groundAt, { extraBuildings: BUILDINGS_X, extraRoads: ROADS_X, zebra: ZEBRA, skip: inDistrict, onRoad });
  city.buildings.children.forEach(m => cast(m)); city.ground.children.forEach(m => cast(m, false));
  movers.push({ obj: city.buildings, x: 0, z: 0 }, { obj: city.ground, x: 0, z: 0 }, { obj: city.ao, x: 0, z: 0 });
  // Landmark Bandung (Gedung Sate, Museum Geologi, Museum Pos, Pusdai, Istiqomah, Graha Merah Putih, Monumen)
  const lms = [...landmarks(), ...districtLandmarks()];
  for (const lm of lms) {
    const m = single(lm.geo, lm.x, lm.z, { ry: lm.ry, y: lm.y ?? groundAt(lm.x, lm.z) });
    for (const e of lm.extras) m.add(e);
    for (const c of lm.cols) city.addCollider({ ...c, top: m.position.y + c.top, bot: c.bot === undefined ? undefined : m.position.y + c.bot });
  }

  // Landmark pedesaan di cincin luar kota
  const wm = single(M.windmillGeo(), 300, -180, { s: 1.2, ry: 0.8 });
  const blades = cast(new THREE.Mesh(M.bladesGeo(), M.worldMat));
  blades.position.set(0, 11.2, 3.5); wm.add(blades);
  anim.push((t, dt) => { blades.rotation.z -= dt * 0.8; });
  spheres.push({ x: 300, y: wm.position.y + 7, z: -180, r: 5 }, { x: 300, y: wm.position.y + 14, z: -180, r: 9 });

  const lh = single(M.lighthouseGeo(), 345, 215, { s: 1.3 });
  spheres.push({ x: 345, y: lh.position.y + 8, z: 215, r: 5 }, { x: 345, y: lh.position.y + 22, z: 215, r: 4.5 });

  const boat = single(M.boatGeo(), 455, 120, { s: 1.4, ry: 1.2, y: 0.3 });
  anim.push(t => { boat.position.y = 0.3 + Math.sin(t * 1.3) * 0.25; boat.rotation.z = Math.sin(t * 0.9) * 0.05; });

  // Pohon: cemara di barat laut, pohon bulat di pedesaan, pohon taman kota dari OSM
  const outside = (x, z) => !inDistrict(x, z) && !onRoad(x, z) && heightAt(x, z) > 2.5 && Math.hypot(x, z) > CITY_R + 25 && Math.hypot(x - 300, z + 180) > 18 && Math.hypot(x - 345, z - 215) > 14;
  const blobs = [], lite = M.treeGeo(true);
  const ring = (n, r0, r1, ok = () => true) => { const L = []; for (let k = 0; L.length < n && k < n * 60; k++) { const a = rand() * Math.PI * 2, r = r0 + rand() * (r1 - r0), x = Math.cos(a) * r, z = Math.sin(a) * r; if (outside(x, z) && ok(x, z, groundAt(x, z))) L.push([x, groundAt(x, z) - 0.3, z, 0.9 + rand() * 0.8, rand() * 6]); } return L; };
  const pines = []; while (pines.length < 80) { const x = -340 + (rand() - 0.5) * 160, z = -60 + (rand() - 0.5) * 200; if (outside(x, z)) pines.push([x, groundAt(x, z) - 0.3, z, 1 + rand() * 0.8, rand() * 6]); }
  pines.push(...ring(90, 330, 405, (x, z, y) => y > 15 && y < 46));                    // hutan di lereng gunung
  const trees = ring(60, 325, 420), wide = ring(34, 325, 405, (x, z, y) => y < 18), flame = ring(22, 325, 400, (x, z, y) => y < 16), cypress = ring(26, 325, 400);
  const palms = []; for (let k = 0; palms.length < 46 && k < 4000; k++) { const a = rand() * Math.PI * 2, r = 385 + rand() * 60, x = Math.cos(a) * r, z = Math.sin(a) * r, y = groundAt(x, z); if (y > 0.9 && y < 3.2) palms.push([x, y - 0.2, z, 0.9 + rand() * 0.5, rand() * 6]); }
  // pohon taman kota: campuran jenis
  city.parkTrees.slice(0, 170).forEach(([x, z], i) => (i % 5 === 0 ? wide : i % 7 === 0 ? flame : trees).push([x, groundAt(x, z) - 0.2, z, 0.5 + rand() * 0.28, rand() * 6]));
  for (const [x, z, k, s] of TREES_X) (k === 'wide' ? wide : k === 'flame' ? flame : trees).push([x, groundAt(x, z) - 0.1, z, s, rand() * 6]);
  const tint = list => list.map(() => new THREE.Color().setHSL(0.27 + (rand() - 0.5) * 0.1, 0.25, 0.86 + rand() * 0.12));   // warna daun sedikit berbeda tiap pohon
  for (const [geo, list, far, rr, bl] of [[M.pineGeo(), pines, null, 2.6, 5.5], [M.treeGeo(), trees, lite, 2.9, 6.5], [M.umbrellaGeo(), wide, M.umbrellaGeo(0, true), 3.6, 8.5], [M.umbrellaGeo(0xe8402c), flame, M.umbrellaGeo(0xe8402c, true), 3.6, 8.5], [M.palmGeo(), palms, M.palmGeo(true), 2.2, 5], [M.cypressGeo(), cypress, M.cypressGeo(true), 1.6, 4]]) {
    const w = wrappedInstances(geo, M.treeMat, list, { far, colors: tint(list), nearR: 95 });
    cast(w.meshes[0]); if (w.meshes[1]) cast(w.meshes[1], false); instanced.push(w);
    for (const [x, y, z, k] of list) { spheres.push({ x, y: y + 4.6 * k, z, r: rr * k }); blobs.push([x, y + 0.35, z, bl * k]); }
  }
  instanced.push(wrappedInstances(blobGeo, blobMat, blobs, { maxR: 260 }));

  // Cloud Kingdom mini: pulau melayang + pelangi
  const isl = [[-60, 92, -290, 1.3], [-150, 112, -235, 1], [30, 76, -335, 0.9], [-5, 122, -205, 0.75], [-190, 84, -330, 1.1]];
  const islInst = wrappedInstances(M.floatIslandGeo(), M.worldMat, isl.map(([x, y, z, s], i) => [x, y, z, s, i]));
  cast(islInst.mesh); instanced.push(islInst);
  for (const [x, y, z, s] of isl) spheres.push({ x, y: y - 3 * s, z, r: 9.5 * s });
  single(M.rainbowGeo(), -70, -400, { y: 0, shadow: false });

  // Balon udara & kapal udara
  [[130, 62, 150], [178, 78, 192], [160, 52, 122]].forEach(([x, y, z], i) => {
    const b = single(M.balloonGeo(), x, z, { y });
    const col = { x, y: y + 9, z, r: 6.5 }; spheres.push(col);
    anim.push(t => { b.position.y = y + Math.sin(t * 0.6 + i * 2) * 2; col.y = b.position.y + 9; });
  });
  const airship = single(M.airshipGeo(), 0, 0, { y: 105 });
  const airMover = movers.at(-1);
  anim.push(t => { const a = t * 0.03; airMover.x = Math.cos(a) * 240; airMover.z = Math.sin(a) * 240; airship.rotation.y = -a - Math.PI; });

  // Awan bergeser pelan
  const clouds = [];
  for (let i = 0; i < 18; i++) clouds.push([(rand() - 0.5) * TILE, 70 + rand() * 80, (rand() - 0.5) * TILE, 1.6 + rand() * 1.8, rand() * 6]);
  const cloudInst = wrappedInstances(M.cloudGeo(), toon({ vertexColors: true, emissive: 0xb4c0d6 }, { rim: 0.5 }), clouds);
  instanced.push(cloudInst);
  anim.push((t, dt) => { for (const cl of clouds) cl[0] = wrapC(cl[0] + dt * 1.5); });


  // Tabrakan: tanah/air/benda/bangunan → null kalau aman. (pos boleh di salinan mana pun)
  function hit(p, pad = 1) {
    const x = wrapC(p.x), z = wrapC(p.z), g = heightAt(x, z);
    if (p.y - pad < Math.max(g, 0)) return g < 0 ? 'water' : 'ground';
    for (const s of spheres) {
      const dx = wrapC(x - s.x), dy = p.y - s.y, dz = wrapC(z - s.z), rr = s.r + pad;
      if (dx * dx + dy * dy + dz * dz < rr * rr) return 'object';
    }
    return city.hit(x, p.y, z, pad) ? 'object' : null;
  }

  const life = buildLife({ scene, heightAt: groundAt, near, wrapC, wrappedInstances, instanced, anim, rand, cast, city, spheres, single, hit, shadows });
  buildDistricts({ scene, groundAt, near, wrappedInstances, instanced, anim, rand, cast, ANIMALS });
  life.clouds.push(...clouds);
  for (const w of instanced) scene.add(...w.meshes);

  // Collectible
  const byCh = Object.fromEntries([...LETTERS, ...NUMBERS].map(d => [d.ch, d]));
  const items = [];
  SPOTS.forEach((spot, si) => {
    [...spot.items].forEach((ch, i, arr) => {
      const a = (i / arr.length) * Math.PI * 2 + si;
      const rr = spot.ring * (0.7 + 0.3 * rand());
      let x = spot.at[0] + Math.cos(a) * rr, z = spot.at[2] + Math.sin(a) * rr;
      for (let k = 1; k < 30 && spot.ring && items.some(o => Math.hypot(wrapC(o.home.x - x), wrapC(o.home.z - z)) < 34); k++) { const q = a + k * 0.7, R = rr + k * 2.2; x = spot.at[0] + Math.cos(q) * R; z = spot.at[2] + Math.sin(q) * R; }   // jarak mendatar ≥ 34: tidak saling menutupi
      const y = Math.max(spot.at[1] + (rand() - 0.5) * 16, heightAt(x, z) + 14);
      const data = byCh[ch];
      const color = COLORS[data.i % COLORS.length], mesh = M.makeGlyph(data.ch, color);
      const home = new THREE.Vector3(x, y, z);
      for (let k = 0; k < 20 && (hit(home, 7) || items.some(o => o.home.distanceTo(home) < 14)); k++) home.y += 4;  // selalu bisa diambil: jauh dari bangunan & huruf lain
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: blobTex, color: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.55), opacity: 0.75, depthWrite: false, fog: false }));
      halo.scale.setScalar(15); halo.position.z = -4.5;   // selalu di belakang huruf, jangan memudarkan mukanya
      halo.renderOrder = 1; mesh.renderOrder = 2;   // semua cahaya dulu, baru huruf: cahaya huruf lain tidak memucatkan
      halo.updateMatrix(); halo.matrixAutoUpdate = false; mesh.add(halo); scene.add(mesh);
      items.push({ data, mesh, halo, home, phase: rand() * 6, state: 'idle', t: 0 });
    });
  });

  const tmp = new THREE.Vector3();
  let beat = 0;
  return {
    items, hit, life, lms,
    update(t, dt, cam, focus, dir = { x: 0, z: 0 }) {
      TIME.value = t;
      anim.forEach(f => f(t, dt, cam));
      const sx = cam.x > 0 ? TILE : -TILE, sz = cam.z > 0 ? TILE : -TILE; // 4 petak terdekat
      tiles[1].position.x = sx; tiles[2].position.z = sz; tiles[3].position.set(sx, 0, sz);
      water.position.set(cam.x, 0, cam.z);
      for (const mv of movers) {
        const p = mv.obj.position; p.x = near(mv.x, cam.x); p.z = near(mv.z, cam.z);
        if (mv.x || mv.z) mv.obj.visible = (p.x - cam.x) ** 2 + (p.z - cam.z) ** 2 < (FOG.far + 40) ** 2;   // di balik kabut: lewati
      }
      for (const grp of [city.buildings, city.ground, city.ao]) for (const m of grp.children) { const b = m.geometry.boundingSphere; if (b) m.visible = Math.hypot(b.center.x + grp.position.x - cam.x, b.center.z + grp.position.z - cam.z) - b.radius < FOG.far; }
      const dl = Math.hypot(dir.x, dir.z) || 1;
      beat++;
      for (let i = 0; i < instanced.length; i++) if (!LITE || beat < 3 || (beat + i) % 2 === 0) instanced[i].update(cam.x, cam.z, dir.x / dl, dir.z / dl);   // HP: bergantian tiap 2 frame
      if (!shadows) return;
      // Kotak bayangan 140×140 di antara pesawat dan jatuhnya bayangan, digeser per texel (tidak berkedip).
      const g = Math.max(heightAt(focus.x, focus.z), 0), k = (focus.y - g) / SUN_DIR.y * 0.5, texel = SH_R * 2 / SH_MAP;
      tmp.copy(focus).addScaledVector(SUN_DIR, -k);
      tmp.set(Math.round(tmp.x / texel) * texel, Math.round(tmp.y / texel) * texel, Math.round(tmp.z / texel) * texel);
      sun.target.position.copy(tmp);
      sun.position.copy(tmp).addScaledVector(SUN_DIR, 200);
    },
  };
}
