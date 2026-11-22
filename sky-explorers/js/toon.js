// Shading kartun: MeshToonMaterial (cahaya bertingkat) + highlight spekular tegas + rim light.
// Highlight/rim ditambahkan dengan menambal chunk shader toon three.js sekali (uniform default 0 =
// material toon lain tidak berubah). Murah: tidak ada pass tambahan, hanya beberapa baris di shader.
import * as THREE from 'three';

let patched = false;
function patch() {
  if (patched) return;
  patched = true;
  const C = THREE.ShaderChunk;
  const line = 'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );';
  if (!C.lights_toon_pars_fragment.includes(line)) return;  // versi three berubah: biarkan toon polos
  C.lights_toon_pars_fragment = 'uniform float toonSpec;\nuniform float toonShine;\nuniform float toonRim;\n' +
    C.lights_toon_pars_fragment.replace(line, `${line}
	vec3 toonHalf = normalize( directLight.direction + geometryViewDir );
	float toonS = pow( max( dot( geometryNormal, toonHalf ), 0.0 ), max( toonShine, 1.0 ) );
	reflectedLight.directSpecular += directLight.color * smoothstep( 0.44, 0.62, toonS ) * toonSpec;
	float toonR = 1.0 - max( dot( geometryNormal, geometryViewDir ), 0.0 );
	reflectedLight.directSpecular += directLight.color * smoothstep( 0.54, 0.74, toonR ) * max( dot( geometryNormal, directLight.direction ), 0.0 ) * toonRim;`);
}

// Tangga cahaya (dot(N,L) dari -1..1): 4 tingkat dengan peralihan lembut (tidak bergerigi). Sisi gelap tetap diterangi hemisphere light.
export const GRADIENT = (() => {
  const N = 256, STEPS = [[0.36, 0.28], [0.5, 0.42], [0.62, 0.66], [0.76, 0.86], [0.9, 1.0]];   // [posisi, terang sesudahnya]
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const t = new THREE.DataTexture(Uint8Array.from({ length: N }, (_, i) => { let v = 0.23; for (const [x, to] of STEPS) v += (to - v) * ss(x - 0.035, x + 0.035, i / (N - 1)); return Math.round(v * 255); }), N, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true;
  return t;
})();

// spec = kuat highlight, shine = kecil-besarnya titik highlight, rim = cahaya tepi.
// sway = daun bergoyang tertiup angin (InstancedMesh, dihitung di GPU).
export const TIME = { value: 0 };
export function toon(params = {}, { spec = 0, shine = 40, rim = 0, sway = false, clouds = false } = {}) {
  patch();
  const m = new THREE.MeshToonMaterial({ gradientMap: GRADIENT, ...params });
  m.onBeforeCompile = sh => {
    sh.uniforms.toonSpec = { value: spec }; sh.uniforms.toonShine = { value: shine }; sh.uniforms.toonRim = { value: rim };
    if (clouds) {   // bayangan awan bergerak di daratan (gelombang sinus, berulang tiap 1000 unit = satu petak dunia)
      sh.uniforms.uTime = TIME;
      sh.vertexShader = 'varying vec2 vCl;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vCl = (modelMatrix * vec4(transformed, 1.0)).xz * 0.00628318;');
      sh.fragmentShader = 'varying vec2 vCl; uniform float uTime;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
  float clN = sin(vCl.x * 4.0 - uTime * 0.05 + 1.6 * sin(vCl.y * 3.0)) * cos(vCl.y * 5.0 + uTime * 0.03 + 1.3 * sin(vCl.x * 2.0)) + 0.35 * sin(vCl.x * 11.0 + 2.0 * sin(vCl.y * 7.0) - uTime * 0.07);
  diffuseColor.rgb *= 1.0 - 0.32 * smoothstep(0.3, 0.5, clN);`);
    }
    if (sway) {
      sh.uniforms.uTime = TIME;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  #ifdef USE_INSTANCING
    float swPh = instanceMatrix[3].x * 0.13 + instanceMatrix[3].z * 0.17;
    transformed.xz += vec2(sin(uTime * 1.4 + swPh), cos(uTime * 1.1 + swPh * 1.3)) * 0.045 * max(position.y - 1.2, 0.0);
  #endif`);
    }
  };
  m.customProgramCacheKey = () => 'toon-hl' + (sway ? '-sway' : '') + (clouds ? '-cl' : '');
  return m;
}
