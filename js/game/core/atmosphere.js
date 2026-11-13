import * as THREE from 'three';
import { createSky, SKY } from '../shaders/sky.js';
import { createCloudTexture, createClouds, createCloudSea } from '../shaders/clouds.js';

/* Atmosfer satu paket: langit, kabut jarak, awan kumulus, dan lautan awan di bawah pulau.
   Total 3 draw call. Jumlah awan mengikuti profil kualitas (instanceCount), tanpa membangun ulang. */
export function createAtmosphere({ renderer, quality, sunDir }, scene, { seaY = -46, fogNear = 70, fogFar = 330 } = {}) {
  scene.fog = new THREE.Fog(SKY.horizon, fogNear, fogFar);
  const sky = createSky(sunDir);
  scene.add(sky);

  const tex = createCloudTexture(renderer);
  const clouds = createClouds(tex, SKY.horizon, {
    far: 300, seed: 21,
    layers: [
      { count: 26, y: [-30, -12], size: [46, 92] },       // gumpalan besar di bawah garis pulau
      { count: 20, y: [-6, 26], size: [30, 64] },         // sejajar pulau
      { count: 14, y: [38, 80], size: [44, 96] },         // tinggi
    ],
  });
  const sea = createCloudSea(SKY.horizon, { y: seaY });
  scene.add(sea.object, clouds.object);

  const total = clouds.object.geometry.instanceCount;
  const applyProfile = (p) => { clouds.object.geometry.instanceCount = Math.max(18, Math.round(total * (0.45 + 0.55 * p.vegetation))); };
  quality.onChange(applyProfile); applyProfile(quality.profile);

  return {
    sky, seaY,
    update(camera, time) {
      clouds.material.uniforms.uTime.value = time;
      sea.material.uniforms.uTime.value = time;
      sea.object.position.x = camera.position.x; sea.object.position.z = camera.position.z;
    },
    dispose() { clouds.dispose(); sea.dispose(); tex.dispose(); sky.geometry.dispose(); sky.material.dispose(); },
  };
}
