import * as THREE from 'three';

/* Layar CRT: kaca PBR gelap (pantulan langit dari env map) + emisi kisi piksel berisi wajah.
   Wajah = atlas DataTexture 1-kanal (4 ekspresi × 20×14 sel), dipilih lewat uniform uFrame. */
export const FACE = { happy: 0, blink: 1, wow: 2, dizzy: 3 };

const ART = [
  [ // happy
    '....................', '....................', '.....##......##.....', '.....##......##.....',
    '.....##......##.....', '.....##......##.....', '....................', '....................',
    '..##............##..', '..###..........###..', '...####......####...', '....############....',
    '......########......', '....................',
  ],
  [ // blink
    '....................', '....................', '....................', '....................',
    '....####....####....', '....................', '....................', '....................',
    '..##............##..', '..###..........###..', '...####......####...', '....############....',
    '......########......', '....................',
  ],
  [ // wow
    '....................', '....................', '.....##......##.....', '.....##......##.....',
    '.....##......##.....', '.....##......##.....', '....................', '....................',
    '........####........', '.......##..##.......', '.......##..##.......', '........####........',
    '....................', '....................',
  ],
  [ // dizzy
    '....................', '....................', '....#..#....#..#....', '.....##......##.....',
    '.....##......##.....', '....#..#....#..#....', '....................', '....................',
    '....................', '....................', '...#..##..##..##....', '....##..##..##..#...',
    '....................', '....................',
  ],
];
const FW = 20, FH = 14;

let facesTex = null;
function getFaces() {
  if (facesTex) return facesTex;
  const data = new Uint8Array(FW * ART.length * FH);
  ART.forEach((rows, f) => rows.forEach((row, r) => {
    for (let x = 0; x < FW; x++) if (row[x] === '#') data[(FH - 1 - r) * FW * ART.length + f * FW + x] = 255;
  }));
  facesTex = new THREE.DataTexture(data, FW * ART.length, FH, THREE.RedFormat);
  facesTex.magFilter = facesTex.minFilter = THREE.NearestFilter;
  facesTex.needsUpdate = true;
  return facesTex;
}

const EMIT = /* glsl */`
{
  vec2 g = vUv * vec2(28.0, 20.0);
  vec2 cell = floor(g), f = fract(g) - 0.5;
  vec2 fc = cell - vec2(4.0, 3.0);
  float inside = step(0.0, fc.x) * step(fc.x, 19.5) * step(0.0, fc.y) * step(fc.y, 13.5);
  float lit = inside * texture2D(uFaces, vec2((fc.x + 0.5 + uFrame * 20.0) / 80.0, (fc.y + 0.5) / 14.0)).r;
  float dotMask = 1.0 - smoothstep(0.33, 0.47, max(abs(f.x), abs(f.y)));
  dotMask = mix(dotMask, 0.6, smoothstep(0.35, 0.9, fwidth(g.x)));
  float scan = 0.93 + 0.07 * sin(vUv.y * 251.3 - uTime * 5.0);
  vec2 q = vUv - 0.5;
  float vig = 1.0 - dot(q, q) * 1.2;
  vec3 on = vec3(0.90, 0.97, 1.0) * 2.4;
  vec3 off = vec3(0.030, 0.045, 0.060);
  totalEmissiveRadiance = (mix(off, on, lit) * dotMask + on * lit * 0.10) * scan * vig;
}`;

export function createScreenMaterial(env) {
  const uniforms = { uFaces: { value: getFaces() }, uFrame: { value: 0 }, uTime: { value: 0 } };
  const mat = new THREE.MeshStandardMaterial({ color: '#06080b', roughness: 0.1, metalness: 0.0, envMap: env, envMapIntensity: 0.75 });
  mat.defines = Object.assign({}, mat.defines, { USE_UV: '' });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uFaces;\nuniform float uFrame;\nuniform float uTime;')
      .replace('#include <emissivemap_fragment>', EMIT);
  };
  mat.customProgramCacheKey = () => 'crt-screen';
  mat.userData.uniforms = uniforms;
  return mat;
}
