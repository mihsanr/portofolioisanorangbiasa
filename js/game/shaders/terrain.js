import * as THREE from 'three';

/* Material dunia. Semuanya Lambert (bukan PBR): medan, rumput, daun, dan batu menutupi sebagian besar
   layar, jadi shading-nya harus murah. Detail datang dari warna vertex yang sudah dipanggang (AO, retakan,
   lumut) + beberapa value-noise ruang-objek per piksel; tanpa tekstur, tanpa env map.
   Tambahan "realistis" yang tetap murah (tanpa pass ekstra):
   - tanah berumput: petak warna besar (kering / subur) + serat rumput halus yang memudar di kejauhan,
   - batu & reruntuhan: lumut di permukaan yang menghadap ke atas,
   - daun & bilah rumput: cahaya tembus (translucency) saat membelakangi matahari + cahaya bungkus lembut. */
const NOISE = /* glsl */`
  varying vec3 vObjPos;
  float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
  float vnoise(vec3 p) {
    vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float hash12(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
  float vnoise2(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y);
  }
  float aaFade(float freq) { return smoothstep(0.3, 1.0, fwidth(vObjPos.x) * freq); }`;

const DETAIL = /* glsl */`
  float tn1 = vnoise(vObjPos * COARSE);
  float tn2 = vnoise(vObjPos * FINE);
  tn2 = mix(tn2, 0.5, aaFade(FINE));
  diffuseColor.rgb *= 1.0 + (tn1 - 0.5) * 0.24 + (tn2 - 0.5) * 0.18;
  #ifdef USE_ROCK
    float band = vObjPos.y * 1.3 + tn1 * 0.7;
    float line = (1.0 - smoothstep(0.0, 0.06, abs(fract(band) - 0.5))) * (1.0 - smoothstep(0.12, 0.45, fwidth(band)));
    diffuseColor.rgb *= 1.0 - vRock * line * 0.2;
    /* tanah berumput: petak kering/subur & lapisan tebing sudah dipanggang ke warna vertex (gratis saat render);
       di sini hanya serat rumput halus (noise 2D murah) yang memudar di kejauhan */
    float fib = mix(vnoise2(vObjPos.xz * 23.0), 0.5, aaFade(23.0));
    diffuseColor.rgb *= 1.0 + (fib - 0.5) * 0.3 * (1.0 - vRock);
  #endif
  #ifdef USE_MOSS
    /* lumut di permukaan menghadap atas, hanya pada warna keabu-abuan (batu), bukan kayu/daun */
    vec3 wN = inverseTransformDirection(normalize(vNormal), viewMatrix);
    float grey = 1.0 - smoothstep(0.04, 0.16, max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)) - min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b)));
    float mo = smoothstep(0.5, 0.9, wN.y) * smoothstep(0.5, 0.75, tn1 * 0.7 + tn2 * 0.5) * grey;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.30, 0.42, 0.16) * (0.8 + tn2 * 0.5), mo * 0.6);
  #endif
  #ifdef USE_LEAF
    /* daun: gumpalan halus dipecah jadi rumpun daun (celah gelap), hanya pada warna hijau (bukan batang) */
    /* cabang dinamis: piksel daun & batang berkelompok rapat, jadi GPU hanya menghitung satu sisi */
    float leaf = smoothstep(0.02, 0.1, diffuseColor.g - diffuseColor.r);
    if (leaf > 0.5) {
      float cl = vnoise(vObjPos * 3.4 + 5.0) * 0.72 + tn2 * 0.28;
      diffuseColor.rgb *= 0.72 + 0.46 * smoothstep(0.28, 0.72, cl);
    } else {
      /* batang: alur kulit kayu memanjang */
      float bark = mix(vnoise2(vec2(atan(vObjPos.z, vObjPos.x) * 9.0, vObjPos.y * 2.2)), 0.5, aaFade(26.0));
      diffuseColor.rgb *= 0.78 + 0.4 * smoothstep(0.2, 0.8, bark);
    }
  #endif`;

/* cahaya tembus + bungkus untuk daun & rumput. uSunView = arah ke matahari di ruang kamera. */
const SSS = /* glsl */`
  #ifdef USE_SSS
  {
    vec3 L = normalize(uSunView), V = normalize(vViewPosition);
    float back = pow(clamp(dot(-V, L), 0.0, 1.0), 3.0);
    float wrapL = clamp((dot(normal, L) + 0.6) / 1.6, 0.0, 1.0);
    /* kilau lembut daun hanya di bagian yang benar-benar kena matahari (bukan bayangan) */
    float lit = smoothstep(0.05, 0.6, dot(reflectedLight.directDiffuse, vec3(0.333)) / max(dot(diffuseColor.rgb, vec3(0.333)) * 2.75, 1e-3));
    float sp = pow(max(dot(normal, normalize(L + V)), 0.0), 18.0) * lit;
    reflectedLight.directDiffuse += (diffuseColor.rgb * vec3(1.0, 0.92, 0.62) * (back * SSS_K + wrapL * 0.12) + vec3(1.0, 0.95, 0.8) * sp * 0.07) * SSS_MASK;
  }
  #endif`;

function detail(mat, { rock = false, moss = false, leaf = false, sss = 0, coarse = 0.85, fine = 5.5, uSunView = null } = {}) {
  mat.onBeforeCompile = (sh) => {
    if (uSunView) sh.uniforms.uSunView = uSunView;
    const defs = (rock ? '#define USE_ROCK\nvarying float vRock;\n' : '') + (moss ? '#define USE_MOSS\n' : '') + (leaf ? '#define USE_LEAF\n' : '')
      + (sss ? '#define USE_SSS\n#define SSS_K ' + sss.toFixed(3) + '\n#define SSS_MASK ' + (leaf ? 'leaf' : '1.0') + '\nuniform vec3 uSunView;\n' : '');
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;\n' + (rock ? 'attribute float rock;\nvarying float vRock;\n' : ''))
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;\n' + (rock ? 'vRock = rock;\n' : ''));
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + defs + NOISE)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + DETAIL.replace(/COARSE/g, coarse.toFixed(3)).replace(/FINE/g, fine.toFixed(3)))
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\n' + SSS);
  };
  mat.customProgramCacheKey = () => ['world', rock, moss, leaf, sss, coarse, fine].join('_');
  return mat;
}

/* uTime dibagi semua material yang bergoyang; uSunView diperbarui tiap frame lewat update(camera) */
export function createWorldMaterials(sunDir) {
  const uTime = { value: 0 }, uSunView = { value: new THREE.Vector3(0, 1, 0) };
  const terrain = detail(new THREE.MeshLambertMaterial({ vertexColors: true }), { rock: true });
  const matte = detail(new THREE.MeshLambertMaterial({ vertexColors: true }), { coarse: 1.7, fine: 9.0, moss: true });
  const foliage = detail(new THREE.MeshLambertMaterial({ vertexColors: true }), { coarse: 1.7, fine: 9.0, leaf: true, sss: 0.55, uSunView });

  /* rumput: bilah dua sisi dengan normal menghadap atas (menyatu dengan tanah) + goyangan angin di vertex shader.
     Ujung bilah sedikit kekuningan, dan bilah menyala tembus cahaya saat kamera menghadap matahari. */
  const grass = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  grass.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime; sh.uniforms.uSunView = uSunView;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying float vTip;')
      .replace('#include <begin_vertex>', /* glsl */`#include <begin_vertex>
        vTip = clamp(position.y * 3.2, 0.0, 1.0);
        #ifdef USE_INSTANCING
          vec3 ip = instanceMatrix[3].xyz;
          float hg = position.y * 3.2;
          float wv = sin(uTime * 1.7 + ip.x * 0.55 + ip.z * 0.75) + 0.5 * sin(uTime * 3.3 + ip.x * 1.3 - ip.z * 0.4);
          transformed.x += wv * 0.05 * hg * hg;
          transformed.z += wv * 0.03 * hg * hg;
        #endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n#define USE_SSS\n#define SSS_K 0.7\n#define SSS_MASK vTip\nuniform vec3 uSunView;\nvarying float vTip;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(vec3(1.0), vec3(1.1, 1.06, 0.78), vTip * vTip * 0.8);')
      .replace('#include <normal_fragment_begin>', 'vec3 normal = normalize( vNormal );\nvec3 nonPerturbedNormal = normal;')
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\n' + SSS);
  };
  grass.customProgramCacheKey = () => 'world_grass2';

  const tmp = new THREE.Vector3();
  return {
    terrain, matte, foliage, grass, uTime,
    update(camera) { uSunView.value.copy(tmp.copy(sunDir).transformDirection(camera.matrixWorldInverse)); },
    dispose() { terrain.dispose(); matte.dispose(); foliage.dispose(); grass.dispose(); },
  };
}
