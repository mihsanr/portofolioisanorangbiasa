import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { loft, spline, part } from './build.js';

/* Kerangka bersama semua karakter. Karena tiap karakter memakai tulang, posisi ikat, dan bobot kulit yang
   sama, satu animator menggerakkan semuanya dengan gerakan yang identik. Pose ikat: berdiri, lengan lurus
   ke bawah, menghadap +Z, telapak kaki di y = 0; semua rotasi tulang nol. */
export const BONE = {
  hips: 0, chest: 1, head: 2,
  armL: 3, foreL: 4, handL: 5, armR: 6, foreR: 7, handR: 8,
  thighL: 9, shinL: 10, footL: 11, thighR: 12, shinR: 13, footR: 14,
};
const B = BONE;
/* [nama, induk, posisi dunia saat pose ikat] */
export const RIG = [
  ['hips', -1, [0, 0.70, 0]], ['chest', B.hips, [0, 0.86, 0]], ['head', B.chest, [0, 1.07, 0]],
  ['armL', B.chest, [0.205, 1.0, 0]], ['foreL', B.armL, [0.23, 0.78, 0]], ['handL', B.foreL, [0.246, 0.56, 0.006]],
  ['armR', B.chest, [-0.205, 1.0, 0]], ['foreR', B.armR, [-0.23, 0.78, 0]], ['handR', B.foreR, [-0.246, 0.56, 0.006]],
  ['thighL', B.hips, [0.094, 0.66, 0]], ['shinL', B.thighL, [0.10, 0.39, 0.006]], ['footL', B.shinL, [0.10, 0.12, -0.006]],
  ['thighR', B.hips, [-0.094, 0.66, 0]], ['shinR', B.thighR, [-0.10, 0.39, 0.006]], ['footR', B.shinR, [-0.10, 0.12, -0.006]],
];
/* indeks tulang kiri -> kanan (untuk mencerminkan bagian badan) */
export const L2R = { [B.armL]: B.armR, [B.foreL]: B.foreR, [B.handL]: B.handR, [B.thighL]: B.thighR, [B.shinL]: B.shinR, [B.footL]: B.footR };

export function createBones() {
  const bones = RIG.map(([name]) => { const b = new THREE.Bone(); b.name = name; return b; });
  RIG.forEach(([, parent, p], i) => {
    if (parent < 0) { bones[i].position.set(p[0], p[1], p[2]); return; }
    const q = RIG[parent][2];
    bones[i].position.set(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    bones[parent].add(bones[i]);
  });
  return bones;
}

/* ——— bagian badan yang dipakai lebih dari satu karakter ——— */
export const SHOE_TV = { sole: '#f4f1ea', outsole: '#3b3b40', shoe: '#e8e5df', tongue: '#242428', side: '#242428', accent: '#d63a2f', lace: '#fbfbfb' };

/* Sneakers kiri (dicerminkan pemanggil): sol + badan sepatu (loft) + tali. pal menentukan warna tiap panel. */
export function shoe(x, pal = SHOE_TV) {
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
  P.push(loft(sole, 16, { frame: 'z', skinFn: () => [[B.footL, 1]], colorFn: (r, a, px, py) => (py < 0.013 ? pal.outsole : pal.sole), aoFn: (px, py) => (py < 0.006 ? 0.6 : 1) }));

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
  P.push(loft(upper, 16, {
    frame: 'z', skinFn: () => [[B.footL, 1]],
    colorFn: (r, a, px, py, pz) => {
      if (pz > 0.118) return pal.sole;                     // toe cap karet
      if (pz < -0.058) return pal.accent;                  // panel tumit
      if (Math.sin(a) > 0.78 && pz > -0.03 && pz < 0.10) return pal.tongue;
      if (Math.sin(a) < 0.25 && Math.sin(a) > -0.35 && pz > -0.03 && pz < 0.07) return pal.side;
      return pal.shoe;
    },
    aoFn: (px, py) => (py < 0.05 ? 0.78 : 1),
  }));
  /* tali sepatu */
  [0.004, 0.034, 0.064, 0.094].forEach((z) => {
    const top = z < 0.045 ? 0.143 - (z / 0.045) * 0.025 : 0.118 - ((z - 0.045) / 0.045) * 0.018;
    P.push(part(new RoundedBoxGeometry(0.064, 0.008, 0.011, 1, 0.003), pal.lace, { p: [x, top + 0.0015, z], r: [0.48, 0, 0], bone: B.footL }));
  });
  const m = new THREE.Matrix4().makeTranslation(x, 0, -0.006)
    .multiply(new THREE.Matrix4().makeScale(1.15, 1.1, 1.14))
    .multiply(new THREE.Matrix4().makeTranslation(-x, 0, 0.006));
  P.forEach((g) => g.applyMatrix4(m));
  return P;
}

/* Tangan kiri berbentuk kepalan longgar. cuff = manset sarung tangan di pergelangan. */
export function hand(x, color = '#1c1c20', cuff = true) {
  const P = [], z = 0.008;
  const g = (geo, o) => part(geo, color, { bone: B.handL, ...o });
  if (cuff) P.push(g(new THREE.CylinderGeometry(0.049, 0.044, 0.032, 20), { p: [x, 0.548, z - 0.002], s: [0.88, 1, 1] }));
  P.push(g(new THREE.SphereGeometry(1, 14, 10), { p: [x - 0.002, 0.502, z], s: [0.034, 0.052, 0.05] }));
  for (let i = 0; i < 4; i++) {
    const fz = z - 0.0345 + i * 0.023, dy = (i === 0 || i === 3) ? 0.005 : 0;
    P.push(g(new THREE.CapsuleGeometry(0.0155, 0.022, 3, 7), { p: [x - 0.006, 0.462 + dy, fz], r: [0, 0, -0.3] }));
    P.push(g(new THREE.CapsuleGeometry(0.0145, 0.016, 3, 7), { p: [x - 0.024, 0.443 + dy, fz], r: [0, 0, -1.25] }));
  }
  P.push(g(new THREE.CapsuleGeometry(0.017, 0.026, 3, 8), { p: [x - 0.012, 0.49, z + 0.05], r: [-0.5, 0, -0.5] }));
  return P;
}
