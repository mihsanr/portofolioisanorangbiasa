import * as THREE from 'three';

/* Debu kaki: satu THREE.Points untuk semua partikel (1 draw call), pool berukuran tetap — tidak ada
   alokasi saat bermain. Jumlah yang dipancarkan mengikuti profil kualitas. */
const MAX = 96;

export function createDust(quality, { color = '#f1ece2', additive = false, opacity = 0.6 } = {}) {
  const pos = new Float32Array(MAX * 3), dat = new Float32Array(MAX * 2);   // dat: umur 0..1, ukuran
  const vel = new Float32Array(MAX * 3), life = new Float32Array(MAX), span = new Float32Array(MAX), size = new Float32Array(MAX);
  let next = 0;
  const geo = new THREE.BufferGeometry();
  const aPos = new THREE.BufferAttribute(pos, 3), aDat = new THREE.BufferAttribute(dat, 2);
  aPos.setUsage(THREE.DynamicDrawUsage); aDat.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', aPos); geo.setAttribute('aDat', aDat);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: { uScale: { value: 600 }, uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity } },
    vertexShader: /* glsl */`
      attribute vec2 aDat;
      uniform float uScale;
      varying float vAge;
      void main() {
        vAge = aDat.x;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aDat.y * (0.55 + 0.9 * vAge) * uScale / max(0.1, -mv.z);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vAge;
      void main() {
        if (vAge >= 1.0) discard;
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = smoothstep(1.0, 0.25, d) * (1.0 - vAge) * (1.0 - vAge) * uOpacity;
        gl_FragColor = vec4(uColor, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  for (let i = 0; i < MAX; i++) dat[i * 2] = 1;

  function spawn(x, y, z, vx, vy, vz, sz, sp) {
    const i = next; next = (next + 1) % MAX;
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
    life[i] = 0; span[i] = sp; size[i] = sz; dat[i * 2] = 0; dat[i * 2 + 1] = sz;
  }

  return {
    object: points,
    setViewport(heightPx, fovDeg) { mat.uniforms.uScale.value = heightPx / (2 * Math.tan(fovDeg * Math.PI / 360)); },
    /* kepulan kecil di belakang kaki */
    puff(x, y, z, dirX, dirZ, n = 2) {
      const count = Math.max(1, Math.round(n * quality.profile.particles));
      for (let k = 0; k < count; k++) {
        spawn(x + (Math.random() - 0.5) * 0.12, y + 0.04, z + (Math.random() - 0.5) * 0.12,
          -dirX * (0.5 + Math.random() * 0.6) + (Math.random() - 0.5) * 0.5, 0.35 + Math.random() * 0.5, -dirZ * (0.5 + Math.random() * 0.6) + (Math.random() - 0.5) * 0.5,
          0.2 + Math.random() * 0.14, 0.45 + Math.random() * 0.3);
      }
    },
    /* cincin debu saat mendarat / melompat */
    ring(x, y, z, strength = 1) {
      const count = Math.max(4, Math.round(12 * strength * quality.profile.particles));
      for (let k = 0; k < count; k++) {
        const a = (k / count) * Math.PI * 2 + Math.random() * 0.4, sp = (1.2 + Math.random() * 1.1) * strength;
        spawn(x + Math.cos(a) * 0.12, y + 0.05, z + Math.sin(a) * 0.12, Math.cos(a) * sp, 0.3 + Math.random() * 0.5, Math.sin(a) * sp,
          0.24 + Math.random() * 0.16, 0.5 + Math.random() * 0.3);
      }
    },
    /* semburan ke segala arah */
    burst(x, y, z, n = 12, speed = 3) {
      const count = Math.max(4, Math.round(n * quality.profile.particles));
      for (let k = 0; k < count; k++) {
        const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, r = Math.sqrt(1 - u * u), sp = speed * (0.5 + Math.random() * 0.7);
        spawn(x, y, z, Math.cos(a) * r * sp, u * sp + 1.2, Math.sin(a) * r * sp, 0.12 + Math.random() * 0.12, 0.4 + Math.random() * 0.35);
      }
    },
    setColor(c) { mat.uniforms.uColor.value.copy(c); },
    update(dt) {
      const drag = Math.exp(-3.2 * dt);
      for (let i = 0; i < MAX; i++) {
        if (dat[i * 2] >= 1) continue;
        life[i] += dt;
        const a = life[i] / span[i];
        if (a >= 1) { dat[i * 2] = 1; continue; }
        vel[i * 3] *= drag; vel[i * 3 + 2] *= drag; vel[i * 3 + 1] = vel[i * 3 + 1] * drag + 0.25 * dt;
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        dat[i * 2] = a;
      }
      aPos.needsUpdate = true; aDat.needsUpdate = true;
    },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}
