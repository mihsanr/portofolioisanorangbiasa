import * as THREE from 'three';
import { rng, hash3 } from '../gen/noise.js';

/* Awan = impostor. Empat gumpalan kumulus digambar SEKALI ke canvas saat dimuat (gradien radial bertumpuk +
   bayangan sisi bawah), lalu puluhan awan ditampilkan sebagai billboard instanced: 1 draw call, dan tiap
   piksel hanya 1 pengambilan tekstur — tidak ada noise per piksel. Awan dibungkus (wrap) di sekitar kamera,
   jadi langit selalu terisi ke mana pun pemain pergi, dan memudar ke warna kabut di kejauhan. */
const CELL_W = 256, CELL_H = 128;

function drawCloud(g, ox, oy, rnd) {
  const puffs = [], n = 13 + Math.floor(rnd() * 5);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), x = 44 + t * 168 + (rnd() - 0.5) * 22;
    const heap = Math.sin(t * Math.PI);                       // menumpuk di tengah
    const r = 15 + heap * 20 + rnd() * 9;
    const y = 92 - r * 0.72 - heap * rnd() * 30;
    puffs.push([x, y, r]);
  }
  for (let i = 0; i < 4; i++) puffs.push([92 + rnd() * 72, 50 + rnd() * 16, 22 + rnd() * 12]);   // puncak
  g.save(); g.translate(ox, oy);
  g.beginPath(); g.rect(0, 0, CELL_W, CELL_H); g.clip();
  /* badan: gabungan lingkaran lembut */
  puffs.forEach(([x, y, r]) => {
    const gr = g.createRadialGradient(x, y, r * 0.35, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.72, 'rgba(255,255,255,0.96)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill();
  });
  /* volume: bayangan kebiruan di kanan-bawah tiap gumpalan, lalu sorotan di kiri-atas */
  g.globalCompositeOperation = 'source-atop';
  puffs.forEach(([x, y, r]) => {
    const gr = g.createRadialGradient(x + r * 0.34, y + r * 0.42, r * 0.2, x + r * 0.34, y + r * 0.42, r * 1.05);
    gr.addColorStop(0, 'rgba(126,156,204,0.34)'); gr.addColorStop(1, 'rgba(126,156,204,0)');
    g.fillStyle = gr; g.fillRect(x - r * 1.5, y - r * 1.5, r * 3, r * 3);
  });
  puffs.forEach(([x, y, r]) => {
    const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.36, 0, x - r * 0.3, y - r * 0.36, r * 0.85);
    gr.addColorStop(0, 'rgba(255,255,252,0.85)'); gr.addColorStop(1, 'rgba(255,255,252,0)');
    g.fillStyle = gr; g.fillRect(x - r * 1.5, y - r * 1.5, r * 3, r * 3);
  });
  const sh = g.createLinearGradient(0, 40, 0, 104);
  sh.addColorStop(0, 'rgba(120,150,200,0)'); sh.addColorStop(1, 'rgba(120,150,200,0.5)');
  g.fillStyle = sh; g.fillRect(0, 0, CELL_W, CELL_H);
  /* dasar rata yang memudar */
  g.globalCompositeOperation = 'destination-out';
  const cut = g.createLinearGradient(0, 86, 0, 106);
  cut.addColorStop(0, 'rgba(0,0,0,0)'); cut.addColorStop(1, 'rgba(0,0,0,1)');
  g.fillStyle = cut; g.fillRect(0, 86, CELL_W, CELL_H - 86);
  g.restore();
}

export function createCloudTexture(renderer) {
  const cv = document.createElement('canvas'); cv.width = CELL_W * 2; cv.height = CELL_H * 2;
  const g = cv.getContext('2d'), rnd = rng(909);
  for (let i = 0; i < 4; i++) drawCloud(g, (i % 2) * CELL_W, Math.floor(i / 2) * CELL_H, rnd);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  return tex;
}

/* Lapisan awan billboard. layers: [{ count, y:[min,max], size:[min,max], span }] */
export function createClouds(tex, fogColor, { layers, seed = 5, far = 300 }) {
  const total = layers.reduce((s, l) => s + l.count, 0);
  const base = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index; geo.setAttribute('position', base.attributes.position); geo.setAttribute('uv', base.attributes.uv);
  const a = new Float32Array(total * 4), b = new Float32Array(total * 4), rnd = rng(seed);
  let i = 0;
  layers.forEach((l) => {
    for (let k = 0; k < l.count; k++, i++) {
      const w = l.size[0] + rnd() * (l.size[1] - l.size[0]);
      a[i * 4] = (rnd() - 0.5) * 2 * far; a[i * 4 + 1] = l.y[0] + rnd() * (l.y[1] - l.y[0]); a[i * 4 + 2] = (rnd() - 0.5) * 2 * far; a[i * 4 + 3] = w;
      b[i * 4] = Math.floor(rnd() * 4); b[i * 4 + 1] = rnd() < 0.5 ? -1 : 1; b[i * 4 + 2] = 0.42 + rnd() * 0.16; b[i * 4 + 3] = 0.6 + rnd() * 0.8;
    }
  });
  geo.setAttribute('aCloud', new THREE.InstancedBufferAttribute(a, 4));
  geo.setAttribute('aParam', new THREE.InstancedBufferAttribute(b, 4));
  geo.instanceCount = total;
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uMap: { value: tex }, uTime: { value: 0 }, uFar: { value: far }, uFog: { value: fogColor }, uSun: { value: new THREE.Color('#fff4de') } },
    vertexShader: /* glsl */`
      attribute vec4 aCloud; attribute vec4 aParam;
      uniform float uTime, uFar;
      varying vec2 vUv; varying float vFade; varying float vY;
      void main() {
        vec3 c = aCloud.xyz;
        c.x += uTime * aParam.w;                                 // hanyut pelan
        c.xz = mod(c.xz - cameraPosition.xz + uFar, 2.0 * uFar) - uFar + cameraPosition.xz;
        float d = distance(c.xz, cameraPosition.xz);
        vFade = (1.0 - smoothstep(uFar * 0.72, uFar * 0.97, d)) * smoothstep(40.0, 85.0, distance(c, cameraPosition));   // awan hanya latar: tidak pernah menutupi area main
        vec4 mv = viewMatrix * vec4(c, 1.0);
        mv.xy += position.xy * vec2(aCloud.w * aParam.y, aCloud.w * aParam.z);
        gl_Position = projectionMatrix * mv;
        vec2 cell = vec2(mod(aParam.x, 2.0), floor(aParam.x / 2.0));
        vUv = (cell + vec2(uv.x, uv.y)) * 0.5;
        vUv.y = 1.0 - (cell.y + 1.0 - uv.y) * 0.5;
        vY = uv.y;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap; uniform vec3 uFog, uSun;
      varying vec2 vUv; varying float vFade; varying float vY;
      void main() {
        vec4 t = texture2D(uMap, vUv);
        float a = t.a * vFade;
        if (a < 0.01) discard;
        vec3 col = t.rgb * mix(vec3(0.86, 0.91, 1.0), uSun, smoothstep(0.25, 0.8, vY));
        col = mix(col, uFog, 0.55 * (1.0 - vFade));
        gl_FragColor = vec4(col, a);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 1;
  return { object: mesh, material: mat, dispose() { geo.dispose(); base.dispose(); mat.dispose(); } };
}

/* Lautan awan di bawah pulau: satu cakram mendatar mengikuti kamera. Pola dari tekstur noise 64×64 yang bisa
   diulang (dibuat sekali), dua pengambilan per piksel yang bergeser pelan. */
export function createCloudSea(fogColor, { y = -46, radius = 460 } = {}) {
  const N = 64, data = new Uint8Array(N * N);
  const per = (x, z, f, s) => {                                   // value noise periodik
    const fx = x * f, fz = z * f, xi = Math.floor(fx), zi = Math.floor(fz), u = fx - xi, v = fz - zi;
    const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v), h = (i, j) => hash3(((i % f) + f) % f, s, ((j % f) + f) % f, 3);
    return (h(xi, zi) * (1 - su) + h(xi + 1, zi) * su) * (1 - sv) + (h(xi, zi + 1) * (1 - su) + h(xi + 1, zi + 1) * su) * sv;
  };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = i / N, z = j / N;
    data[j * N + i] = Math.round(255 * (per(x, z, 4, 1) * 0.5 + per(x, z, 8, 2) * 0.3 + per(x, z, 16, 3) * 0.2));
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RedFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true; tex.needsUpdate = true;
  const geo = new THREE.CircleGeometry(radius, 40); geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uMap: { value: tex }, uTime: { value: 0 }, uFog: { value: fogColor }, uRadius: { value: radius } },
    vertexShader: /* glsl */`
      varying vec3 vW;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap; uniform float uTime, uRadius; uniform vec3 uFog;
      varying vec3 vW;
      void main() {
        vec2 p = vW.xz;
        float n = texture2D(uMap, p * 0.0052 + vec2(uTime * 0.0016, 0.0)).r * 0.62 + texture2D(uMap, p * 0.017 - vec2(0.0, uTime * 0.0031)).r * 0.38;
        float dens = smoothstep(0.38, 0.66, n);
        float d = distance(p, cameraPosition.xz) / uRadius;
        vec3 col = mix(vec3(0.72, 0.83, 0.97), vec3(1.0, 0.995, 0.98), smoothstep(0.45, 0.8, n));
        col = mix(col, uFog, smoothstep(0.25, 0.9, d));
        float a = mix(0.16, 0.94, dens) * (1.0 - smoothstep(0.82, 1.0, d));
        gl_FragColor = vec4(col, a);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = y; mesh.frustumCulled = false; mesh.renderOrder = 0;
  return { object: mesh, material: mat, dispose() { geo.dispose(); mat.dispose(); tex.dispose(); } };
}
