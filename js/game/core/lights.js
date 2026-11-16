import * as THREE from 'three';

/* Matahari (bayangan selektif, frustum sempit mengikuti target) + hemisphere + rim tanpa bayangan. */
export function createLights(scene, quality, sunDir) {
  const hemi = new THREE.HemisphereLight('#cfdcef', '#8f9672', 1.0);
  const sun = new THREE.DirectionalLight('#ffe9c8', 2.75);
  const rim = new THREE.DirectionalLight('#9fc6ff', 0.7);
  rim.position.set(-sunDir.x, 0.35, -sunDir.z).normalize().multiplyScalar(10);
  sun.castShadow = true;
  const sh = sun.shadow;
  sh.bias = -0.0004; sh.normalBias = 0.025;
  const R = 7;
  sh.camera.left = -R; sh.camera.right = R; sh.camera.top = R; sh.camera.bottom = -R;
  sh.camera.near = 1; sh.camera.far = 60;
  scene.add(hemi, sun, sun.target, rim);

  function applyProfile(p) {
    if (sh.mapSize.x === p.shadowSize && sh.map) return;
    sh.mapSize.set(p.shadowSize, p.shadowSize);
    if (sh.map) { sh.map.dispose(); sh.map = null; }
    sh.radius = p.softShadows ? 2.2 : 1;
  }
  quality.onChange(applyProfile);
  applyProfile(quality.profile);

  const DIST = 30;
  const tmp = new THREE.Vector3();
  return {
    sun, hemi, rim,
    setRange(r) { sh.camera.left = -r; sh.camera.right = r; sh.camera.top = r; sh.camera.bottom = -r; sh.camera.updateProjectionMatrix(); },
    /* target digeser per texel supaya tepi bayangan tidak berkedip saat bergerak */
    follow(target) {
      const texel = (sh.camera.right - sh.camera.left) / sh.mapSize.x;
      tmp.copy(target);
      tmp.x = Math.round(tmp.x / texel) * texel; tmp.y = Math.round(tmp.y / texel) * texel; tmp.z = Math.round(tmp.z / texel) * texel;
      sun.target.position.copy(tmp);
      sun.position.copy(tmp).addScaledVector(sunDir, DIST);
    },
  };
}
