import * as THREE from 'three';

/* Material dunia. Semuanya Lambert (bukan PBR): medan, rumput, daun, dan batu menutupi sebagian besar
   layar, jadi shading-nya harus murah. Detail datang dari warna vertex yang sudah dipanggang (AO, retakan,
   lumut) + dua value-noise ruang-objek per piksel; tanpa tekstur, tanpa env map. */
const NOISE = /* glsl */`
  varying vec3 vObjPos;
  float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
  float vnoise(vec3 p) {
    vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }`;

const DETAIL = /* glsl */`
  float tn1 = vnoise(vObjPos * COARSE);
  float tn2 = vnoise(vObjPos * FINE);
  tn2 = mix(tn2, 0.5, smoothstep(0.3, 1.0, fwidth(vObjPos.x) * FINE));
  diffuseColor.rgb *= 1.0 + (tn1 - 0.5) * 0.24 + (tn2 - 0.5) * 0.18;
  #ifdef USE_ROCK
    float band = vObjPos.y * 1.3 + tn1 * 0.7;
    float line = (1.0 - smoothstep(0.0, 0.06, abs(fract(band) - 0.5))) * (1.0 - smoothstep(0.12, 0.45, fwidth(band)));
    diffuseColor.rgb *= 1.0 - vRock * line * 0.2;
  #endif`;

function detail(mat, { rock = false, coarse = 0.85, fine = 5.5, vertex = '' , pars = '' } = {}) {
  mat.onBeforeCompile = (sh) => {
    if (mat.userData.uniforms) Object.assign(sh.uniforms, mat.userData.uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;\n' + (rock ? 'attribute float rock;\nvarying float vRock;\n' : '') + pars)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;\n' + (rock ? 'vRock = rock;\n' : '') + vertex);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + (rock ? '#define USE_ROCK\nvarying float vRock;\n' : '') + NOISE)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + DETAIL.replace(/COARSE/g, coarse.toFixed(3)).replace(/FINE/g, fine.toFixed(3)));
  };
  mat.customProgramCacheKey = () => ['world', rock, coarse, fine, vertex.length].join('_');
  return mat;
}

/* uTime dibagi semua material yang bergoyang */
export function createWorldMaterials() {
  const uTime = { value: 0 };
  const terrain = detail(new THREE.MeshLambertMaterial({ vertexColors: true }), { rock: true });
  const matte = detail(new THREE.MeshLambertMaterial({ vertexColors: true }), { coarse: 1.7, fine: 9.0 });

  /* rumput: bilah dua sisi dengan normal menghadap atas (menyatu dengan tanah) + goyangan angin di vertex shader */
  const grass = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  grass.userData.uniforms = { uTime };
  grass.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', /* glsl */`#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = instanceMatrix[3].xyz;
          float hg = position.y * 3.2;
          float wv = sin(uTime * 1.7 + ip.x * 0.55 + ip.z * 0.75) + 0.5 * sin(uTime * 3.3 + ip.x * 1.3 - ip.z * 0.4);
          transformed.x += wv * 0.05 * hg * hg;
          transformed.z += wv * 0.03 * hg * hg;
        #endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <normal_fragment_begin>', 'vec3 normal = normalize( vNormal );\nvec3 nonPerturbedNormal = normal;');
  };
  grass.customProgramCacheKey = () => 'world_grass';

  return {
    terrain, matte, grass, uTime,
    dispose() { terrain.dispose(); matte.dispose(); grass.dispose(); },
  };
}
