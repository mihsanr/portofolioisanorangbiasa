import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { rng, value3 } from './noise.js';
import { prep, smooth } from './build.js';

/* Reruntuhan dari satu geometri balok batu yang di-instance: gapura (dua pilar + lengkung),
   dinding runtuh bertingkat, dan balok berserakan. Tiap susunan juga mengembalikan collider silinder. */
const STONE = [new THREE.Color('#b1a996'), new THREE.Color('#9c9588'), new THREE.Color('#8d8a86'), new THREE.Color('#a39a85')];

export function createBlockGeometry() {
  const g = prep(new RoundedBoxGeometry(1, 1, 1, 1, 0.09));
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = value3(x * 3.1 + 7, y * 3.1, z * 3.1, 77);
    /* tepi sedikit terkikis + bawah lebih gelap (AO terhadap balok di bawahnya) */
    const k = 1 - 0.035 * n;
    pos.setXYZ(i, x * k, y * k, z * k);
    const ao = (0.78 + 0.22 * smooth((y + 0.5) / 0.35)) * (0.9 + 0.2 * n);
    col[i * 3] = ao; col[i * 3 + 1] = ao; col[i * 3 + 2] = ao;
  }
  g.computeVertexNormals();
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/* Kumpulkan balok dalam koordinat lokal pulau. ground(x,z) -> tinggi tanah lokal. */
export function createRuinBuilder(ground, seed = 1) {
  const rnd = rng(seed), blocks = [], cyls = [];
  const add = (x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) => blocks.push({ x, y, z, sx, sy, sz, rx, ry, rz, tint: Math.floor(rnd() * STONE.length), shade: 0.86 + rnd() * 0.24 });
  const jit = (a) => (rnd() - 0.5) * a;

  return {
    blocks, cyls,
    /* gapura: bukaan selebar 2w, menghadap sudut yaw */
    arch(cx, cz, yaw, w = 1.45) {
      const ux = Math.cos(yaw), uz = -Math.sin(yaw), course = 0.66, rows = 4;
      for (const side of [-1, 1]) {
        const px = cx + ux * w * side, pz = cz + uz * w * side, y0 = ground(px, pz) - 0.18;
        for (let r = 0; r < rows; r++) add(px + jit(0.05), y0 + course * (r + 0.5), pz + jit(0.05), 0.98 - r * 0.02, course + 0.02, 0.98 - r * 0.02, 0, yaw + jit(0.09), 0);
        cyls.push({ x: px, z: pz, r: 0.55, y0: y0 - 1, y1: y0 + course * rows });
      }
      const top = ground(cx, cz) - 0.18 + course * rows, n = 7;
      for (let i = 0; i < n; i++) {
        const a = Math.PI * (i + 0.5) / n, ox = Math.cos(a) * w, oy = Math.sin(a) * w * 0.92;
        add(cx + ux * ox, top + oy + 0.2, cz + uz * ox, 0.74, 0.66, 0.92, 0, yaw, a - Math.PI / 2);
      }
    },
    /* dinding runtuh: tinggi kolom menurun sepanjang dinding */
    wall(cx, cz, yaw, cols = 6, maxRows = 4) {
      const ux = Math.cos(yaw), uz = -Math.sin(yaw), bw = 1.05, bh = 0.6;
      for (let c = 0; c < cols; c++) {
        const rows = Math.max(1, Math.round(maxRows - c * (maxRows - 0.6) / cols + jit(0.9)));
        const px = cx + ux * bw * c, pz = cz + uz * bw * c, y0 = ground(px, pz) - 0.15;
        for (let r = 0; r < rows; r++) {
          const sh = (r % 2) * 0.22;
          add(px + ux * sh + jit(0.04), y0 + bh * (r + 0.5), pz + uz * sh + jit(0.04), bw - 0.03, bh + 0.02, 0.82, 0, yaw + jit(0.06), jit(0.03));
        }
        cyls.push({ x: px, z: pz, r: 0.5, y0: y0 - 1, y1: y0 + bh * rows });
      }
    },
    /* balok lepas yang tergeletak miring */
    rubble(cx, cz, count = 4, spread = 1.6) {
      for (let i = 0; i < count; i++) {
        const x = cx + jit(spread * 2), z = cz + jit(spread * 2), s = 0.55 + rnd() * 0.45;
        add(x, ground(x, z) + s * 0.22, z, s * 1.2, s * 0.75, s, jit(0.5), rnd() * 6.28, jit(0.5));
        cyls.push({ x, z, r: s * 0.5, y0: ground(x, z) - 1, y1: ground(x, z) + s * 0.5 });
      }
    },
    /* batu pijakan pipih (jalan setapak) */
    path(points) {
      points.forEach(([x, z]) => { const s = 0.7 + rnd() * 0.35; add(x, ground(x, z) + 0.01, z, s * 1.25, 0.16, s, jit(0.06), rnd() * 6.28, jit(0.06)); });
    },
    build(geometry, material) {
      const mesh = new THREE.InstancedMesh(geometry, material, blocks.length);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
      blocks.forEach((b, i) => {
        q.setFromEuler(e.set(b.rx, b.ry, b.rz, 'YXZ'));
        m.compose(p.set(b.x, b.y, b.z), q, s.set(b.sx, b.sy, b.sz));
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, c.copy(STONE[b.tint]).multiplyScalar(b.shade));
      });
      mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = true; mesh.receiveShadow = true;
      return mesh;
    },
  };
}
