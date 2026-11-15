import * as THREE from 'three';

/* Satu WebGLRenderer; DPR dibatasi profil, bayangan selektif (hanya objek yang ditandai). */
export function createRenderer(canvas, quality) {
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: quality.profile.msaa, alpha: false, stencil: false, powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;

  const cameras = new Set();
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.profile.dpr) * quality.scale);
    renderer.setSize(w, h, false);
    cameras.forEach((c) => { c.aspect = w / h; c.updateProjectionMatrix(); });
  }
  function applyProfile(p) {
    renderer.shadowMap.type = p.softShadows ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    renderer.shadowMap.needsUpdate = true;
    resize();
  }
  quality.onChange(applyProfile);
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  applyProfile(quality.profile);

  return { renderer, resize, track(camera) { cameras.add(camera); resize(); } };
}
