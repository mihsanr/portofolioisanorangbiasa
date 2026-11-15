import * as THREE from 'three';
import { withSurfaceNoise } from '../shaders/surface.js';

/* Material bersama: sedikit material = sedikit program shader & pergantian state.
   Env map (PMREM) hanya dipasang di material yang memantul; kain & medan cukup cahaya hemisphere,
   jadi piksel layar yang paling banyak (tanah, kain) tidak membayar sampling env map. */
export function createMaterials(env) {
  const cloth = withSurfaceNoise(new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.9, metalness: 0,
  }), { fine: 260, coarse: 9, albedoFine: 0.06, albedoCoarse: 0.06, rough: 0.12 });

  const plastic = withSurfaceNoise(new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.46, metalness: 0.0, envMap: env, envMapIntensity: 0.5,
  }), { fine: 150, coarse: 7, albedoFine: 0.04, albedoCoarse: 0.08, rough: 0.22 });

  const metal = new THREE.MeshStandardMaterial({ color: '#cdd0d6', roughness: 0.24, metalness: 1.0, envMap: env, envMapIntensity: 1.0 });

  /* tidak menulis warna maupun kedalaman: objeknya hanya ada untuk pass bayangan */
  const shadowOnly = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });

  const all = { cloth, plastic, metal, shadowOnly, env };
  all.dispose = () => { cloth.dispose(); plastic.dispose(); metal.dispose(); shadowOnly.dispose(); };
  return all;
}
