import * as THREE from 'three';
import { withSurfaceNoise } from '../shaders/surface.js';

/* Material bersama: sedikit material = sedikit program shader & pergantian state. */
export function createMaterials() {
  const cloth = withSurfaceNoise(new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.9, metalness: 0, envMapIntensity: 0.6,
  }), { fine: 260, coarse: 9, albedoFine: 0.06, albedoCoarse: 0.06, rough: 0.12 });

  const plastic = withSurfaceNoise(new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.46, metalness: 0.0, envMapIntensity: 0.9,
  }), { fine: 150, coarse: 7, albedoFine: 0.04, albedoCoarse: 0.08, rough: 0.22 });

  const metal = new THREE.MeshStandardMaterial({ color: '#cdd0d6', roughness: 0.24, metalness: 1.0, envMapIntensity: 1.2 });

  const all = { cloth, plastic, metal };
  all.dispose = () => { cloth.dispose(); plastic.dispose(); metal.dispose(); };
  return all;
}
