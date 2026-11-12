/* Variasi permukaan prosedural untuk MeshStandardMaterial: noise ruang-objek menggeser albedo dan
   roughness sedikit, supaya kain/plastik tidak tampak rata. Posisi diambil sebelum skinning, jadi
   polanya menempel di model saat beranimasi. Biaya: dua value-noise per fragmen pada material ini saja. */
const NOISE = /* glsl */`
  varying vec3 vObjPos;
  float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
  float vnoise(vec3 p) {
    vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }`;

const f = (x) => x.toFixed(4);

export function withSurfaceNoise(mat, { fine = 220, coarse = 11, albedoFine = 0.05, albedoCoarse = 0.07, rough = 0.14 } = {}) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + NOISE)
      .replace('#include <color_fragment>', '#include <color_fragment>\n'
        + 'float snA = vnoise(vObjPos * ' + f(fine) + ');\n'
        + 'snA = mix(snA, 0.5, smoothstep(0.35, 1.1, fwidth(vObjPos.x) * ' + f(fine) + '));\n'
        + 'float snB = vnoise(vObjPos * ' + f(coarse) + ');\n'
        + 'diffuseColor.rgb *= 1.0 + (snA - 0.5) * ' + f(albedoFine) + ' + (snB - 0.5) * ' + f(albedoCoarse) + ';')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n'
        + 'roughnessFactor = clamp(roughnessFactor + (snB - 0.5) * ' + f(rough) + ' + (snA - 0.5) * ' + f(rough * 0.5) + ', 0.05, 1.0);');
  };
  mat.customProgramCacheKey = () => ['sn', fine, coarse, albedoFine, albedoCoarse, rough].join('_');
  return mat;
}
