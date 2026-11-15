import * as THREE from 'three';
import { createLights } from '../core/lights.js';
import { createMaterials } from '../gen/materials.js';
import { createCharacter } from '../gen/character.js';
import { FACE } from '../shaders/crt-screen.js';

/* Studio validasi aset (?lab=character): lembar karakter depan / samping / belakang / pose lari.
   Kamera bisa diatur lewat URL untuk uji headless: cx,cy,cz (posisi) tx,ty,tz (target) fov. */
export function createLab(ctx) {
  const { renderer, quality, env, sunDir, track } = ctx;
  const params = new URLSearchParams(location.search);
  const num = (k, d) => (params.has(k) ? parseFloat(params.get(k)) : d);

  const scene = new THREE.Scene();
  const bg = new THREE.Color('#2c2f3d');
  scene.background = bg;
  scene.fog = new THREE.Fog(bg, 9, 20);

  const camera = new THREE.PerspectiveCamera(num('fov', 28), 1, 0.1, 100);
  camera.position.set(num('cx', 0), num('cy', 1.15), num('cz', 7.4));
  camera.lookAt(num('tx', 0), num('ty', 0.78), num('tz', 0));
  track(camera);

  const lights = createLights(scene, quality, sunDir);
  lights.setRange(4);
  lights.follow(new THREE.Vector3(0, 0.6, 0));

  const floor = new THREE.Mesh(new THREE.CircleGeometry(22, 48), new THREE.MeshStandardMaterial({ color: '#3a3e4f', roughness: 0.92, metalness: 0 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const mats = createMaterials(env);
  const single = params.has('solo');
  const setups = single
    ? [{ x: 0, yaw: num('yaw', 0), pose: params.get('pose') || 'idle' }]
    : [{ x: -1.95, yaw: 0, pose: 'idle' }, { x: -0.65, yaw: Math.PI / 2, pose: 'idle' }, { x: 0.65, yaw: Math.PI, pose: 'idle' }, { x: 1.95, yaw: -0.75, pose: 'run' }];
  const chars = setups.map((s) => {
    const c = createCharacter(mats, params.get('char') || 'tv');
    c.root.position.x = s.x; c.root.rotation.y = s.yaw;
    pose(c, s.pose);
    scene.add(c.root);
    return c;
  });
  if (params.has('face')) chars.forEach((c) => c.setFace(FACE[params.get('face')] ?? 0));

  let time = 0;
  return {
    scene, camera, chars,
    update(dt) { time += dt; },
    render() {
      chars.forEach((c, i) => {
        c.tick(time);
        if (!params.has('face') && i === 0) c.setFace((time % 3.2) > 3.05 ? FACE.blink : FACE.happy);
      });
      renderer.render(scene, camera);
    },
    dispose() { mats.dispose(); chars.forEach((c) => c.dispose()); floor.geometry.dispose(); floor.material.dispose(); },
  };
}

/* Pose statis untuk memeriksa siluet & lipatan sendi; animasi sungguhan ada di Tahap 3. */
function pose(c, name) {
  const b = c.bones;
  if (name === 'run') {
    b.hips.rotation.x = 0.26; b.hips.position.y -= 0.03;
    b.chest.rotation.set(0.1, -0.25, 0); b.head.rotation.set(-0.2, 0.15, 0);
    b.thighL.rotation.x = -1.05; b.shinL.rotation.x = 1.0; b.footL.rotation.x = 0.1;
    b.thighR.rotation.x = 0.55; b.shinR.rotation.x = 1.25; b.footR.rotation.x = 0.55;
    b.armR.rotation.set(-0.95, 0, -0.18); b.foreR.rotation.x = -1.25;
    b.armL.rotation.set(0.85, 0, 0.2); b.foreL.rotation.x = -0.75;
    return;
  }
  b.armL.rotation.z = 0.13; b.armR.rotation.z = -0.13;
  b.foreL.rotation.set(-0.16, 0, -0.05); b.foreR.rotation.set(-0.16, 0, 0.05);
  b.thighL.rotation.z = 0.035; b.thighR.rotation.z = -0.035;
  b.footL.rotation.y = 0.14; b.footR.rotation.y = -0.14;
}
