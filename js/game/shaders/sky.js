import * as THREE from 'three';

/* Langit gradien + piringan matahari. Dipakai sebagai latar dan sumber environment map (PMREM). */
export const SKY = {
  zenith: new THREE.Color('#1a66d2'),
  mid: new THREE.Color('#4fa3ee'),
  horizon: new THREE.Color('#cfeafc'),
  ground: new THREE.Color('#8fc2f0'),
  sun: new THREE.Color('#fff3d8'),
};

export function createSky(sunDir) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false, toneMapped: false,
    uniforms: {
      uZenith: { value: SKY.zenith }, uMid: { value: SKY.mid }, uHorizon: { value: SKY.horizon },
      uGround: { value: SKY.ground }, uSun: { value: SKY.sun }, uSunDir: { value: sunDir.clone().normalize() },
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * mat4(mat3(modelViewMatrix)) * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uZenith, uMid, uHorizon, uGround, uSun, uSunDir;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 c = mix(uHorizon, uMid, smoothstep(0.0, 0.28, h));
        c = mix(c, uZenith, smoothstep(0.22, 0.95, h));
        c = mix(c, uGround, smoothstep(0.0, -0.45, h));
        float s = max(dot(d, uSunDir), 0.0);
        c += uSun * (pow(s, 900.0) * 6.0 + pow(s, 48.0) * 0.35 + pow(s, 6.0) * 0.12);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  return mesh;
}

/* Environment map sekali buat dari langit prosedural — refleksi & ambient PBR tanpa file HDR. */
export function createEnvironment(renderer, sunDir) {
  const scene = new THREE.Scene();
  const sky = createSky(sunDir);
  sky.scale.setScalar(50);
  scene.add(sky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(scene, 0.03, 0.1, 100);
  pmrem.dispose();
  sky.geometry.dispose(); sky.material.dispose();
  return rt.texture;
}
