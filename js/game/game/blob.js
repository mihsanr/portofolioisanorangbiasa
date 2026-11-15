import * as THREE from 'three';

/* Bayangan bulat tepat di bawah karakter. Bayangan matahari jatuhnya miring, jadi saat melompat pemain
   butuh penanda "saya akan mendarat di sini". Satu quad transparan kecil: mengikuti kemiringan tanah,
   mengecil dan memudar makin tinggi karakter dari pijakan. */
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* permukaan tertinggi di (x,z) yang tidak lebih tinggi dari y */
export function surfaceUnder(world, x, y, z) {
  let best = world.floorY != null ? world.floorY : -Infinity;
  const lim = y + 0.25;
  const t = world.terrains;
  if (t) for (let i = 0; i < t.length; i++) { const h = t[i].heightAt(x, z); if (h !== null && h <= lim && h > best) best = h; }
  const c = world.cyls;
  if (c) for (let i = 0; i < c.length; i++) {
    const k = c[i], dx = x - k.x, dz = z - k.z;
    if (k.y1 <= lim && k.y1 > best && dx * dx + dz * dz < k.r * k.r) best = k.y1;
  }
  const b = world.boxes;
  if (b) for (let i = 0; i < b.length; i++) {
    const k = b[i];
    if (k.max[1] <= lim && k.max[1] > best && x > k.min[0] && x < k.max[0] && z > k.min[2] && z < k.max[2]) best = k.max[1];
  }
  return best;
}

export function createBlobShadow(world) {
  const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    uniforms: { uOpacity: { value: 0.4 } },
    vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform float uOpacity; varying vec2 vUv;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float a = smoothstep(1.0, 0.15, d);
        gl_FragColor = vec4(0.02, 0.05, 0.03, a * a * uOpacity);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 4; mesh.frustumCulled = false;
  const n = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  let lastX = 1e9, lastZ = 1e9;
  return {
    object: mesh,
    update(pos) {
      const g = surfaceUnder(world, pos.x, pos.y, pos.z);
      if (g < -1e8) { mesh.visible = false; return; }
      const h = Math.max(0, pos.y - g), k = clamp(h / 11, 0, 1);
      mesh.visible = k < 1;
      const s = 0.95 + h * 0.07;
      mesh.position.set(pos.x, g + 0.04, pos.z);
      mesh.scale.set(s, 1, s);
      mat.uniforms.uOpacity.value = 0.42 * (1 - k * k);
      /* ikuti kemiringan tanah (beda hingga) supaya tepinya tidak menembus bukit */
      /* kemiringan hanya dihitung ulang kalau sudah bergeser cukup jauh (hemat 4 kueri tinggi per frame) */
      if (Math.abs(pos.x - lastX) + Math.abs(pos.z - lastZ) > 0.12) {
        lastX = pos.x; lastZ = pos.z;
        const e = 0.35;
        const hx = surfaceUnder(world, pos.x + e, g + 0.5, pos.z) - surfaceUnder(world, pos.x - e, g + 0.5, pos.z);
        const hz = surfaceUnder(world, pos.x, g + 0.5, pos.z + e) - surfaceUnder(world, pos.x, g + 0.5, pos.z - e);
        if (Math.abs(hx) < 0.5 && Math.abs(hz) < 0.5) mesh.quaternion.setFromUnitVectors(up, n.set(-hx, 2 * e, -hz).normalize());
        else mesh.quaternion.identity();
      }
    },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}
