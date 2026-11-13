import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { loft, spline, part, merge, mirrorX, smooth, clamp01 } from './build.js';
import { getHeadGeometry } from './crt-head.js';
import { createScreenMaterial } from '../shaders/crt-screen.js';

/* Karakter: badan = satu SkinnedMesh (kulit menyatu, lutut/siku melengkung halus, 1 draw call),
   kepala CRT = 3 mesh kaku yang menempel di tulang kepala. Pose ikat: berdiri, lengan lurus ke bawah,
   menghadap +Z, telapak kaki di y = 0. Semua rotasi tulang nol saat pose ikat. */

export const BONE = {
  hips: 0, chest: 1, head: 2,
  armL: 3, foreL: 4, handL: 5, armR: 6, foreR: 7, handR: 8,
  thighL: 9, shinL: 10, footL: 11, thighR: 12, shinR: 13, footR: 14,
};
const B = BONE;
/* [nama, induk, posisi dunia saat pose ikat] */
const RIG = [
  ['hips', -1, [0, 0.70, 0]], ['chest', B.hips, [0, 0.86, 0]], ['head', B.chest, [0, 1.07, 0]],
  ['armL', B.chest, [0.205, 1.0, 0]], ['foreL', B.armL, [0.23, 0.78, 0]], ['handL', B.foreL, [0.246, 0.56, 0.006]],
  ['armR', B.chest, [-0.205, 1.0, 0]], ['foreR', B.armR, [-0.23, 0.78, 0]], ['handR', B.foreR, [-0.246, 0.56, 0.006]],
  ['thighL', B.hips, [0.094, 0.66, 0]], ['shinL', B.thighL, [0.10, 0.39, 0.006]], ['footL', B.shinL, [0.10, 0.12, -0.006]],
  ['thighR', B.hips, [-0.094, 0.66, 0]], ['shinR', B.thighR, [-0.10, 0.39, 0.006]], ['footR', B.shinR, [-0.10, 0.12, -0.006]],
];
const L2R = { [B.armL]: B.armR, [B.foreL]: B.foreR, [B.handL]: B.handR, [B.thighL]: B.thighR, [B.shinL]: B.shinR, [B.footL]: B.footR };

const C = {
  hoodie: '#e9e2d4', band: '#ddd5c6', string: '#c6bdac', aglet: '#a89f8e', hemShade: '#4c483f', pants: '#383840', glove: '#1c1c20',
  sole: '#f4f1ea', outsole: '#3b3b40', shoe: '#e8e5df', shoeDark: '#242428', accent: '#d63a2f', lace: '#fbfbfb',
};

/* ——— profil badan ——— */
const TORSO = [
  { c: [0, 0.572, 0], rx: 0.150, rz: 0.120, ao: 0.55, col: C.hemShade },
  { c: [0, 0.590, 0], rx: 0.178, rz: 0.146, ao: 0.85, col: C.band },
  { c: [0, 0.625, 0], rx: 0.182, rz: 0.150, col: C.band },
  { c: [0, 0.645, 0], rx: 0.180, rz: 0.149, ao: 0.8, col: C.band },
  { c: [0, 0.672, 0.002], rx: 0.194, rz: 0.161 },
  { c: [0, 0.750, 0.004], rx: 0.197, rz: 0.165 },
  { c: [0, 0.850, 0.004], rx: 0.198, rz: 0.162 },
  { c: [0, 0.930, 0], rx: 0.192, rz: 0.152 },
  { c: [0, 0.985, 0], rx: 0.166, rz: 0.136 },
  { c: [0, 1.025, 0], rx: 0.116, rz: 0.106, ao: 0.8 },
  { c: [0, 1.062, 0], rx: 0.07, rz: 0.07, ao: 0.55 },
].map((k) => ({ e: 2.35, col: C.hoodie, ...k }));

const PELVIS = [
  { c: [0, 0.73, 0], rx: 0.10, rz: 0.09 },
  { c: [0, 0.70, 0], rx: 0.165, rz: 0.135 },
  { c: [0, 0.64, 0], rx: 0.172, rz: 0.142, ao: 0.75 },
  { c: [0, 0.60, 0], rx: 0.166, rz: 0.138, ao: 0.7 },
  { c: [0, 0.572, 0], rx: 0.12, rz: 0.105, ao: 0.6 },
  { c: [0, 0.555, 0], rx: 0.04, rz: 0.04, ao: 0.55 },
];

const LEG = [
  { c: [0.092, 0.715, 0], rx: 0.055, rz: 0.065, ao: 0.6 },
  { c: [0.094, 0.66, 0], rx: 0.088, rz: 0.098, ao: 0.65 },
  { c: [0.096, 0.58, 0], rx: 0.090, rz: 0.098, ao: 0.8 },
  { c: [0.098, 0.48, 0.004], rx: 0.084, rz: 0.090 },
  { c: [0.100, 0.40, 0.008], rx: 0.078, rz: 0.083 },
  { c: [0.100, 0.32, -0.003], rx: 0.077, rz: 0.084 },
  { c: [0.100, 0.24, -0.006], rx: 0.073, rz: 0.077 },
  { c: [0.100, 0.200, -0.006], rx: 0.075, rz: 0.079 },
  { c: [0.100, 0.178, -0.006], rx: 0.065, rz: 0.069, ao: 0.82 },
  { c: [0.100, 0.150, -0.006], rx: 0.063, rz: 0.067 },
  { c: [0.100, 0.132, -0.006], rx: 0.048, rz: 0.052, ao: 0.6 },
];

const ARM = [
  { c: [0.186, 1.036, 0], rx: 0.030, rz: 0.035, ao: 0.8 },
  { c: [0.200, 1.016, 0], rx: 0.066, rz: 0.070 },
  { c: [0.212, 0.970, 0], rx: 0.080, rz: 0.084 },
  { c: [0.222, 0.880, 0], rx: 0.080, rz: 0.083 },
  { c: [0.230, 0.780, 0], rx: 0.075, rz: 0.078 },
  { c: [0.238, 0.680, 0.004], rx: 0.073, rz: 0.075 },
  { c: [0.243, 0.618, 0.006], rx: 0.073, rz: 0.075 },
  { c: [0.245, 0.592, 0.006], rx: 0.058, rz: 0.060, ao: 0.82, col: C.band },
  { c: [0.246, 0.562, 0.006], rx: 0.055, rz: 0.057, col: C.band },
  { c: [0.246, 0.548, 0.006], rx: 0.038, rz: 0.040, ao: 0.6, col: C.band },
];

/* jari-jari badan pada ketinggian y (untuk menempelkan kantong & tali) */
function torsoAt(rings, y) {
  for (let i = 0; i < rings.length - 1; i++) {
    const a = rings[i], b = rings[i + 1];
    if (y >= a.c[1] && y <= b.c[1]) {
      const t = (y - a.c[1]) / (b.c[1] - a.c[1] || 1);
      return { rx: a.rx + (b.rx - a.rx) * t, rz: a.rz + (b.rz - a.rz) * t, cz: a.c[2] + (b.c[2] - a.c[2]) * t, e: a.e };
    }
  }
  return rings[rings.length - 1];
}

/* kantong kanguru: lembar kain yang mengikuti lengkung badan, tepinya menyatu ke permukaan */
function pocket(rings) {
  const nx = 22, ny = 9, y0 = 0.664, y1 = 0.812, pos = [], col = [], idx = [];
  const base = new THREE.Color(C.hoodie);
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    const s = i / nx * 2 - 1, t = j / ny;
    const y = y0 + (y1 - y0) * t;
    const half = 0.92 - 0.36 * Math.pow(t, 1.5);
    const th = s * half;
    const edge = Math.min(1 - Math.abs(s), Math.min(t, 1 - t) * 1.6);
    const lift = -0.004 + 0.021 * smooth(edge / 0.26);
    const r = torsoAt(rings, y), p = 2 / r.e;
    const sx = Math.sin(th), cz = Math.cos(th);
    pos.push(Math.sign(sx) * Math.pow(Math.abs(sx), p) * (r.rx + lift), y, r.cz + Math.pow(Math.abs(cz), p) * (r.rz + lift));
    const k = 0.74 + 0.26 * smooth(edge / 0.2);
    col.push(base.r * k, base.g * k, base.b * k);
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setIndex(idx);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const n = pos.length / 3, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const w = smooth((pos[i * 3 + 1] - 0.76) / 0.18);
    si[i * 4] = B.hips; sw[i * 4] = 1 - w; si[i * 4 + 1] = B.chest; sw[i * 4 + 1] = w;
  }
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  return g;
}

function shoe(x) {
  const P = [];
  const sole = spline([
    { c: [x, 0.030, -0.116], rx: 0.020, rz: 0.010 },
    { c: [x, 0.024, -0.108], rx: 0.052, rz: 0.021 },
    { c: [x, 0.024, -0.060], rx: 0.063, rz: 0.022 },
    { c: [x, 0.024, 0.040], rx: 0.067, rz: 0.022 },
    { c: [x, 0.025, 0.120], rx: 0.065, rz: 0.022 },
    { c: [x, 0.030, 0.168], rx: 0.050, rz: 0.020 },
    { c: [x, 0.036, 0.188], rx: 0.018, rz: 0.010 },
  ].map((k) => ({ e: 3.6, ...k })), 3);
  P.push(loft(sole, 22, { frame: 'z', skinFn: () => [[B.footL, 1]], colorFn: (r, a, px, py) => (py < 0.013 ? C.outsole : C.sole), aoFn: (px, py) => (py < 0.006 ? 0.6 : 1) }));

  const upper = spline([
    { c: [x, 0.075, -0.104], rx: 0.020, rz: 0.030, rzb: 0.030 },
    { c: [x, 0.075, -0.092], rx: 0.050, rz: 0.068, rzb: 0.046 },
    { c: [x, 0.075, -0.050], rx: 0.057, rz: 0.080, rzb: 0.046 },
    { c: [x, 0.075, 0.000], rx: 0.059, rz: 0.068, rzb: 0.046 },
    { c: [x, 0.070, 0.045], rx: 0.060, rz: 0.048, rzb: 0.041 },
    { c: [x, 0.065, 0.090], rx: 0.060, rz: 0.035, rzb: 0.036 },
    { c: [x, 0.060, 0.135], rx: 0.055, rz: 0.029, rzb: 0.031 },
    { c: [x, 0.055, 0.166], rx: 0.040, rz: 0.022, rzb: 0.026 },
    { c: [x, 0.052, 0.180], rx: 0.014, rz: 0.010, rzb: 0.012 },
  ].map((k) => ({ e: 2.5, ...k })), 3);
  P.push(loft(upper, 22, {
    frame: 'z', skinFn: () => [[B.footL, 1]],
    colorFn: (r, a, px, py, pz) => {
      if (pz > 0.118) return C.sole;                       // toe cap karet
      if (pz < -0.058) return C.accent;                    // panel tumit
      if (Math.sin(a) > 0.78 && pz > -0.03 && pz < 0.10) return C.shoeDark;  // lidah
      if (Math.sin(a) < 0.25 && Math.sin(a) > -0.35 && pz > -0.03 && pz < 0.07) return C.shoeDark; // panel samping
      return C.shoe;
    },
    aoFn: (px, py) => (py < 0.05 ? 0.78 : 1),
  }));
  /* tali sepatu */
  [0.004, 0.034, 0.064, 0.094].forEach((z) => {
    const top = z < 0.045 ? 0.143 - (z / 0.045) * 0.025 : 0.118 - ((z - 0.045) / 0.045) * 0.018;
    P.push(part(new RoundedBoxGeometry(0.064, 0.008, 0.011, 1, 0.003), C.lace, { p: [x, top + 0.0015, z], r: [0.48, 0, 0], bone: B.footL }));
  });
  const m = new THREE.Matrix4().makeTranslation(x, 0, -0.006)
    .multiply(new THREE.Matrix4().makeScale(1.15, 1.1, 1.14))
    .multiply(new THREE.Matrix4().makeTranslation(-x, 0, 0.006));
  P.forEach((g) => g.applyMatrix4(m));
  return P;
}

function hand(x) {
  const P = [], z = 0.008;
  const g = (geo, o) => part(geo, C.glove, { bone: B.handL, ...o });
  P.push(g(new THREE.CylinderGeometry(0.049, 0.044, 0.032, 20), { p: [x, 0.548, z - 0.002], s: [0.88, 1, 1] }));
  P.push(g(new THREE.SphereGeometry(1, 20, 14), { p: [x - 0.002, 0.502, z], s: [0.034, 0.052, 0.05] }));
  for (let i = 0; i < 4; i++) {
    const fz = z - 0.0345 + i * 0.023, dy = (i === 0 || i === 3) ? 0.005 : 0;
    P.push(g(new THREE.CapsuleGeometry(0.0155, 0.022, 4, 10), { p: [x - 0.006, 0.462 + dy, fz], r: [0, 0, -0.3] }));
    P.push(g(new THREE.CapsuleGeometry(0.0145, 0.016, 4, 10), { p: [x - 0.024, 0.443 + dy, fz], r: [0, 0, -1.25] }));
  }
  P.push(g(new THREE.CapsuleGeometry(0.017, 0.026, 4, 10), { p: [x - 0.012, 0.49, z + 0.05], r: [-0.5, 0, -0.5] }));
  return P;
}

/* lipatan kain: riak radius halus, lebih kuat di sekitar siku / lutut */
const foldTorso = (r, a) => 1 + 0.02 * Math.sin(r.c[1] * 31 + 2.1 * Math.sin(a * 2 + 0.4)) * smooth((r.c[1] - 0.66) / 0.05) * smooth((0.99 - r.c[1]) / 0.07);
const foldArm = (r, a) => 1 + 0.05 * Math.sin(r.c[1] * 47 + 1.4 * Math.sin(a * 2 + 1.0)) * smooth((0.95 - r.c[1]) / 0.1) * smooth((r.c[1] - 0.6) / 0.03);
const foldLeg = (r, a) => 1 + 0.035 * Math.sin(r.c[1] * 41 + 1.5 * Math.sin(a * 2 + 2.0)) * smooth((0.6 - r.c[1]) / 0.08) * smooth((r.c[1] - 0.2) / 0.03);

let bodyCache = null;
function getBodyGeometry() {
  if (bodyCache) return bodyCache;
  const P = [];

  const torso = spline(TORSO, 3);
  P.push(loft(torso, 30, { bumpFn: foldTorso, skinFn: (x, y) => { const w = smooth((y - 0.76) / 0.18); return [[B.hips, 1 - w], [B.chest, w]]; } }));
  P.push(loft(spline(PELVIS, 3), 22, { color: C.pants, skinFn: () => [[B.hips, 1]] }));
  P.push(pocket(torso));

  /* tudung: kerah tebal mengelilingi leher + gumpalan tudung di punggung */
  const inner = (x, y, z) => 0.62 + 0.38 * smooth((Math.hypot(x, z + 0.015) - 0.075) / 0.07);
  P.push(part(new THREE.TorusGeometry(0.105, 0.043, 14, 32), C.hoodie, { p: [0, 1.046, -0.012], r: [Math.PI / 2 + 0.16, 0, 0], s: [1.27, 1, 1], bone: B.chest, ao: inner }));
  P.push(part(new THREE.SphereGeometry(1, 24, 16), C.hoodie, { p: [0, 0.992, -0.135], r: [-0.32, 0, 0], s: [0.172, 0.105, 0.085], bone: B.chest, ao: (x, y) => 0.82 + 0.18 * smooth((y - 0.93) / 0.08) }));
  /* tali tudung */
  [-1, 1].forEach((sg) => {
    const yc = 0.94, tilt = -0.27, r = torsoAt(torso, yc), zc = r.cz + r.rz * 0.99 + 0.005;
    P.push(part(new THREE.CapsuleGeometry(0.0075, 0.10, 4, 10), C.string, { p: [sg * 0.038, yc, zc], r: [tilt, 0, sg * 0.04], bone: B.chest }));
    P.push(part(new THREE.CapsuleGeometry(0.0095, 0.016, 4, 10), C.aglet, { p: [sg * 0.0405, yc - 0.06 * Math.cos(tilt), zc - 0.06 * Math.sin(tilt)], r: [tilt, 0, sg * 0.04], bone: B.chest }));
  });

  /* sisi kiri: lengan, tangan, kaki, sepatu — lalu dicerminkan */
  const left = [];
  left.push(loft(spline(ARM, 3), 20, {
    color: C.hoodie, bumpFn: foldArm,
    skinFn: (x, y) => {
      if (y < 0.585) { const h = clamp01((0.585 - y) / 0.03); return [[B.foreL, 1 - h], [B.handL, h]]; }
      const w = smooth((0.84 - y) / 0.12); return [[B.armL, 1 - w], [B.foreL, w]];
    },
  }));
  left.push(...hand(0.247));
  left.push(loft(spline(LEG, 3), 20, {
    color: C.pants, bumpFn: foldLeg,
    skinFn: (x, y) => { const w = smooth((0.46 - y) / 0.14); return [[B.thighL, 1 - w], [B.shinL, w]]; },
  }));
  left.push(...shoe(0.10));
  const right = left.map((g) => mirrorX(g, L2R));
  P.push(...left, ...right);

  bodyCache = merge(P);
  bodyCache.computeBoundingSphere();
  return bodyCache;
}

export function createCharacter(mats) {
  const root = new THREE.Group();
  const bones = RIG.map(([name]) => { const b = new THREE.Bone(); b.name = name; return b; });
  RIG.forEach(([, parent, p], i) => {
    if (parent < 0) { bones[i].position.set(p[0], p[1], p[2]); return; }
    const q = RIG[parent][2];
    bones[i].position.set(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    bones[parent].add(bones[i]);
  });

  const body = new THREE.SkinnedMesh(getBodyGeometry(), mats.cloth);
  body.castShadow = true; body.receiveShadow = true; body.frustumCulled = false;
  body.add(bones[0]);
  body.updateMatrixWorld(true);
  body.bind(new THREE.Skeleton(bones));
  /* pivot di tengah badan (untuk salto); kaki tetap di titik asal root */
  const pivot = new THREE.Group(); pivot.position.y = 0.8;
  const inner = new THREE.Group(); inner.position.y = -0.8;
  pivot.add(inner); inner.add(body); root.add(pivot);

  const hg = getHeadGeometry();
  const head = new THREE.Group();
  const casing = new THREE.Mesh(hg.plastic, mats.plastic);
  casing.castShadow = true; casing.receiveShadow = true;
  const antenna = new THREE.Mesh(hg.metal, mats.metal);
  const screenMat = createScreenMaterial(mats.env);
  const screen = new THREE.Mesh(hg.screen, screenMat);
  head.add(casing, antenna, screen);
  bones[B.head].add(head);

  const byName = {};
  bones.forEach((b) => { byName[b.name] = b; });
  const u = screenMat.userData.uniforms;
  return {
    root, pivot, body, head, bones: byName,
    setFace(i) { u.uFrame.value = i; },
    tick(time) { u.uTime.value = time; },
    dispose() { screenMat.dispose(); body.skeleton.dispose(); },
  };
}
