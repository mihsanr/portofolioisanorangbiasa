import * as THREE from 'three';

/* Bagian menyala (panel chevron jump pad, strip lampu, cincin pegas) — satu ShaderMaterial tanpa cahaya,
   dibedakan lewat atribut aKind: 0 = chevron mengalir, 1 = pijar berdenyut, 2 = cincin yang naik & mengecil.
   Nilai warna > 1 supaya tetap terang setelah tone mapping; tidak ada pass bloom. */
export function createGlowMaterial(uTime) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime },
    vertexColors: true,
    vertexShader: /* glsl */`
      attribute float aKind;
      uniform float uTime;
      varying vec2 vUv; varying vec3 vCol; varying float vKind; varying float vFade;
      void main() {
        vUv = uv; vKind = aKind; vCol = color; vFade = 1.0;
        vec3 p = position;
        #ifdef USE_INSTANCING
          float seed = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.61;
        #else
          float seed = 0.0;
        #endif
        if (aKind > 1.5) {
          float f = fract(uTime * 0.5 + uv.y + seed);
          float s = sqrt(sin(f * 3.14159));
          p.xz *= mix(1.0, 0.55, f) * s;
          p.y = (p.y - uv.x) * s + uv.x + f * 1.35;
          vFade = s;
        }
        #ifdef USE_INSTANCING
          vec4 mv = modelViewMatrix * instanceMatrix * vec4(p, 1.0);
        #else
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
        #endif
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime;
      varying vec2 vUv; varying vec3 vCol; varying float vKind; varying float vFade;
      void main() {
        vec3 c;
        if (vKind < 0.5) {
          float x = abs(vUv.x - 0.5);
          float band = fract((vUv.y - x * 0.85) * 2.6 - uTime * 1.1);
          float chev = smoothstep(0.0, 0.06, band) * smoothstep(0.42, 0.34, band) * smoothstep(0.37, 0.33, x);
          vec2 q = abs(vUv - 0.5);
          float edge = smoothstep(0.5, 0.42, max(q.x, q.y));
          float grid = 0.5 + 0.5 * step(0.5, fract(vUv.x * 14.0)) * step(0.5, fract(vUv.y * 14.0));
          c = vec3(0.012, 0.02, 0.045) * grid + vCol * (chev * 1.9 + 0.10 + 0.06 * sin(uTime * 3.0)) * edge;
        } else if (vKind < 1.5) {
          c = vCol * (1.25 + 0.35 * sin(uTime * 4.0 + vUv.x * 6.0));
        } else {
          c = vCol * (1.45 * vFade + 0.25);
        }
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

/* Halo lembut (pengganti bloom): satu THREE.Points aditif untuk semua sumber cahaya di level. */
export function createHaloMaterial(uTime) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime, uScale: { value: 600 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
    vertexShader: /* glsl */`
      attribute float aSize;
      uniform float uTime, uScale;
      varying vec3 vCol;
      void main() {
        vCol = color;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize * (1.0 + 0.08 * sin(uTime * 2.6 + position.x * 1.7 + position.z)) * uScale / max(0.1, -mv.z);
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vCol;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = pow(max(0.0, 1.0 - d), 2.3);
        gl_FragColor = vec4(vCol * a, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}
