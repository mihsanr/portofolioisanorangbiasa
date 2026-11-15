import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createLights } from '../core/lights.js';
import { createSky, SKY } from '../shaders/sky.js';
import { createMaterials } from '../gen/materials.js';
import { createCharacter } from '../gen/character.js';
import { createInput } from '../game/input.js';
import { createPlayer, MOVE } from '../game/player.js';
import { createAnimator } from '../game/animator.js';
import { createFollowCamera } from '../game/camera.js';
import { createDust } from '../game/fx.js';

/* Arena uji Tahap 3: lantai berpetak + beberapa balok untuk menguji lari, lompat, double jump, dan kamera.
   Balok-balok ini HANYA alat uji — dunia sungguhan (pulau prosedural) dibangun di Tahap 4–7. */
const BLOCKS = [
  // [cx, cz, lebar, dalam, tinggi]
  [0, 6, 3, 3, 0.7], [4.5, 8.5, 3, 3, 1.7], [9, 6, 3, 3, 3.0], [13.5, 8.5, 2.4, 2.4, 4.6],
  [-5, 7, 2, 6, 1.2], [-9, 2, 4, 2, 2.4], [0, -7, 10, 1, 1.6],
];

export function createPlayground(ctx) {
  const { renderer, quality, env, sunDir, track } = ctx;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(SKY.horizon, 45, 160);
  scene.add(createSky(sunDir));

  const lights = createLights(scene, quality, sunDir);
  lights.setRange(9);

  /* lantai berpetak (tekstur canvas kecil yang diulang) supaya gerak terbaca */
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  g.fillStyle = '#7fae5a'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#76a552'; g.fillRect(0, 0, 32, 32); g.fillRect(32, 32, 32, 32);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(70, 70); tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const floorMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(140, 48), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  scene.add(floor);

  const world = { floorY: 0, killY: -25, boxes: [] };
  const blockMat = new THREE.MeshStandardMaterial({ color: '#b9b2a6', roughness: 0.85, metalness: 0 });
  const disposables = [floor.geometry, floorMat, tex, blockMat];
  BLOCKS.forEach(([cx, cz, w, d, h]) => {
    const geo = new RoundedBoxGeometry(w, h, d, 3, 0.08);
    const m = new THREE.Mesh(geo, blockMat);
    m.position.set(cx, h / 2, cz); m.castShadow = true; m.receiveShadow = true;
    scene.add(m); disposables.push(geo);
    world.boxes.push({ min: [cx - w / 2, 0, cz - d / 2], max: [cx + w / 2, h, cz + d / 2] });
  });

  const mats = createMaterials(env);
  const character = createCharacter(mats);
  scene.add(character.root);
  const dust = createDust(quality);
  scene.add(dust.object);

  const input = createInput(renderer.domElement);
  const cam = createFollowCamera(track);
  const fwd = new THREE.Vector3();
  const animator = createAnimator(character, {
    onStep(side) {
      const p = player.body.pos, y = player.state.yaw;
      fwd.set(Math.sin(y), 0, Math.cos(y));
      dust.puff(p.x + Math.cos(y) * 0.1 * side - fwd.x * 0.15, p.y, p.z - Math.sin(y) * 0.1 * side - fwd.z * 0.15, fwd.x, fwd.z, 2);
    },
  });
  const player = createPlayer(character, {
    onJump(double) { animator.onJump(double); if (!double) dust.ring(player.body.pos.x, player.body.pos.y, player.body.pos.z, 0.55); },
    onLand(impact) { animator.onLand(impact); dust.ring(player.body.pos.x, player.body.pos.y, player.body.pos.z, Math.min(1.3, 0.35 + impact / 18)); },
  });
  player.setSpawn(0, 0, 0);
  player.teleport(0, 0, 0, 0);
  cam.snap(player.body.pos, Math.PI);

  const anim = { speed: 0, maxSpeed: MOVE.maxSpeed, grounded: true, vy: 0, turn: 0 };
  let time = 0;
  return {
    scene, camera: cam.camera, player, input, cam, world,
    update(dt) {
      time += dt;
      player.update(dt, input.poll(), cam.state.yaw, world);
      anim.speed = player.state.speed; anim.grounded = player.body.grounded; anim.vy = player.body.vel.y; anim.turn = player.state.turn;
      animator.update(dt, anim);
      dust.update(dt);
    },
    render(dt, alpha) {
      player.render(alpha);
      cam.update(dt, character.root.position, player.body.vel, input);
      lights.follow(character.root.position);
      dust.setViewport(renderer.domElement.height, cam.camera.fov);
      character.tick(time);
      renderer.render(scene, cam.camera);
    },
    dispose() { mats.dispose(); character.dispose(); dust.dispose(); disposables.forEach((d) => d.dispose()); },
  };
}
