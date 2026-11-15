import * as THREE from 'three';
import { rng, value3, value2 } from './noise.js';
import { loft, spline, prep, merge, place, smooth } from './build.js';

/* Vegetasi untuk instancing: rumpun rumput (5 bilah melengkung) dan pohon bertajuk gumpalan.
   Satu geometri per jenis, digambar berkali-kali dengan InstancedMesh. */
const TAU = Math.PI * 2;

export function createTuftGeometry(seed = 5) {
  const rnd = rng(seed), P = [], N = [], C = [], I = [];
  const BL = 4;
  for (let k = 0; k < BL; k++) {
    const a = k / BL * TAU + rnd() * 0.8, h = 0.2 + rnd() * 0.18, lean = 0.3 + rnd() * 0.4, w = 0.024 + rnd() * 0.01;
    const dx = Math.cos(a), dz = Math.sin(a), px = -dz, pz = dx, cx = dx * 0.045, cz = dz * 0.045, b = P.length / 3;
    const add = (t, half, shade) => {
      const off = lean * h * t * t, y = h * t, x = cx + dx * off, z = cz + dz * off;
      if (half > 0) { P.push(x - px * half, y, z - pz * half, x + px * half, y, z + pz * half); C.push(shade, shade, shade, shade, shade, shade); }
      else { P.push(x, y, z); C.push(shade, shade, shade); }
      const n = half > 0 ? 2 : 1, nl = Math.hypot(dx * 0.22, 1, dz * 0.22);
      for (let q = 0; q < n; q++) N.push(dx * 0.22 / nl, 1 / nl, dz * 0.22 / nl);
    };
    add(0, w, 0.68); add(0.55, w * 0.68, 0.98); add(1, 0, 1.28);
    I.push(b, b + 1, b + 2, b + 1, b + 3, b + 2, b + 2, b + 3, b + 4);
  }
  const g = new THREE.BufferGeometry();
  g.setIndex(I);
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  return g;
}

const BARK = { a: new THREE.Color('#7a5a3c'), b: new THREE.Color('#4f3a29') };
const LEAF = { top: new THREE.Color('#9ccc45'), mid: new THREE.Color('#6aa836'), low: new THREE.Color('#3c7a2c') };

function paintTrunk(g, skew) {
  const pos = g.attributes.position, col = g.attributes.color, c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i), n = value3(pos.getX(i) * 4 + skew, y * 1.6, pos.getZ(i) * 4, 9);
    c.copy(BARK.b).lerp(BARK.a, 0.25 + 0.75 * n).multiplyScalar(0.6 + 0.4 * smooth(y / 0.7));
    col.setXYZ(i, c.r, c.g, c.b);
  }
  g.deleteAttribute('skinIndex'); g.deleteAttribute('skinWeight');
  return g;
}

/* Pohon: batang melengkung berakar lebar + 2 dahan (loft), tajuk = beberapa gumpalan bola terdeformasi. */
/* lod 0 = dekat (detail penuh), 1 = sedang (±1/4 segitiga), 2 = jauh (±1/12). Bentuk & warna sama. */
export function createTreeGeometry(seed = 1, lod = 0) {
  const rnd = rng(seed * 131 + 7), parts = [];
  const bend = (rnd() - 0.5) * 0.9, bz = (rnd() - 0.5) * 0.5, H = 2.9 + rnd() * 0.7;
  const trunk = spline([
    { c: [0, -0.25, 0], rx: 0.52, rz: 0.5 }, { c: [0, 0.05, 0], rx: 0.4, rz: 0.38 },
    { c: [bend * 0.12, 0.5, bz * 0.1], rx: 0.27, rz: 0.26 }, { c: [bend * 0.45, H * 0.45, bz * 0.4], rx: 0.21, rz: 0.2 },
    { c: [bend * 0.3, H * 0.75, bz * 0.7], rx: 0.17, rz: 0.16 }, { c: [bend * 0.55, H, bz], rx: 0.1, rz: 0.1 },
  ], lod ? 1 : 3);
  parts.push(paintTrunk(loft(trunk, lod === 2 ? 4 : lod ? 6 : 12, { bumpFn: (r, a) => 1 + 0.13 * Math.sin(a * 5 + r.c[1] * 3) * smooth((0.9 - r.c[1]) / 0.9) }), 0));
  /* tajuk = gugus: tiap gugus berisi beberapa gumpalan bola halus. Normal tiap gumpalan dicampur dengan arah
     keluar dari pusat gugus, jadi cahaya membacanya sebagai satu volume lembut dengan detail gumpalan. */
  const clusters = [[bend * 0.55, H + 0.3, bz, 1.25, 6]];
  for (let k = 0; k < 2; k++) {
    const a = rnd() * TAU, len = 1.05 + rnd() * 0.5, y0 = H * (0.5 + 0.18 * k), bx = bend * 0.4 + Math.cos(a) * len, bzz = bz * 0.5 + Math.sin(a) * len;
    const br = spline([
      { c: [bend * 0.38, y0, bz * 0.5], rx: 0.13, rz: 0.13 },
      { c: [bend * 0.4 + Math.cos(a) * len * 0.5, y0 + 0.35, bz * 0.5 + Math.sin(a) * len * 0.5], rx: 0.1, rz: 0.1 },
      { c: [bx, y0 + 0.85, bzz], rx: 0.06, rz: 0.06 },
    ], lod ? 1 : 3);
    parts.push(paintTrunk(loft(br, lod === 2 ? 3 : lod ? 5 : 8), 3 + k));
    clusters.push([bx, y0 + 1.0, bzz, 0.8 + rnd() * 0.15, 4]);
  }
  const c = new THREE.Color(), n = new THREE.Vector3(), o = new THREE.Vector3();
  const puffSrc = prep(new THREE.IcosahedronGeometry(1, lod === 2 ? 0 : lod ? 1 : 2));
  clusters.forEach(([cx, cy, cz, cr, count], ci) => {
    for (let k = 0; k < count; k++) {
      /* satu gumpalan besar di tengah-atas, sisanya mengelilingi sedikit lebih rendah */
      const first = k === 0, a = (k / (count - 1)) * TAU + ci, ring = first ? 0 : cr * (0.62 + rnd() * 0.2);
      const px = cx + Math.cos(a) * ring, pz = cz + Math.sin(a) * ring, py = cy + (first ? cr * 0.38 : (rnd() - 0.5) * cr * 0.35);
      const r = cr * (first ? 0.78 : 0.5 + rnd() * 0.2), tint = rnd();
      const g = puffSrc.clone();
      const pos = g.attributes.position, nor = g.attributes.normal, col = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const sx = pos.getX(i), sy = pos.getY(i), sz = pos.getZ(i);
        const k2 = 1 + 0.16 * (value3(sx * 1.6 + k * 7, sy * 1.6 + ci * 3, sz * 1.6, seed + k) - 0.5);
        const x = px + sx * r * k2 * 1.12, y = py + sy * r * k2 * (sy < 0 ? 0.62 : 0.86), z = pz + sz * r * k2 * 1.12;
        pos.setXYZ(i, x, y, z);
        o.set(x - cx, (y - cy) * 1.3 + cr * 0.25, z - cz).normalize();
        n.set(sx, sy, sz).lerp(o, 0.55).normalize();
        nor.setXYZ(i, n.x, n.y, n.z);
        const out = Math.min(1, Math.hypot(x - cx, (y - cy) * 1.2, z - cz) / (cr * 1.15));     // 0 di dalam gugus .. 1 di kulit luar
        c.copy(LEAF.low).lerp(LEAF.mid, smooth((n.y + 0.5) / 0.75)).lerp(LEAF.top, smooth((n.y - 0.15) / 0.6) * (0.55 + 0.45 * tint));
        c.multiplyScalar((0.55 + 0.45 * smooth((out - 0.35) / 0.5)) * (0.8 + 0.2 * smooth((n.y + 0.9) / 1.2)) * (0.94 + 0.12 * tint));
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      parts.push(g);
    }
  });
  puffSrc.dispose();
  const g = merge(parts);
  g.userData.trunkRadius = 0.3; g.userData.height = H;
  return g;
}

/* Sebar instance rumput mengikuti warna tanah; urutan acak, jadi mengurangi count = menipiskan merata. */
export function scatterGrass(island, geometry, material, max, seed, avoid = []) {
  const mesh = new THREE.InstancedMesh(geometry, material, max);
  const rnd = rng(seed), q = { x: 0, y: 0, z: 0, rho: 0 }, m = new THREE.Matrix4(), col = new THREE.Color();
  const quat = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3(), p = new THREE.Vector3();
  let n = 0, guard = 0;
  while (n < max && guard++ < max * 12) {
    island.sample(rnd, q, 0.985);
    const patch = value2(q.x * 0.35 + 3, q.z * 0.35, seed + 9);
    if (rnd() > 0.22 + 0.78 * smooth((patch - 0.35) / 0.3) + smooth((q.rho - 0.82) / 0.12) * 0.6) continue;
    let blocked = false;
    for (let i = 0; i < avoid.length; i++) { const a = avoid[i]; if ((q.x - a.x) * (q.x - a.x) + (q.z - a.z) * (q.z - a.z) < a.r * a.r) { blocked = true; break; } }
    if (blocked) continue;
    const s = 0.6 + rnd() * 0.65;
    quat.setFromAxisAngle(up, rnd() * TAU);
    m.compose(p.set(q.x, q.y - 0.02, q.z), quat, sc.set(s, s * (0.85 + rnd() * 0.5), s));
    mesh.setMatrixAt(n, m);
    island.topColor(q.x, q.z, q.rho, col).multiplyScalar(0.92 + rnd() * 0.28);
    mesh.setColorAt(n, col);
    n++;
  }
  mesh.count = n;
  mesh.userData.max = n;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.receiveShadow = true;
  return mesh;
}
