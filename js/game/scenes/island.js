import * as THREE from 'three';
import { createLights } from '../core/lights.js';
import { createSky, SKY } from '../shaders/sky.js';
import { createWorldMaterials } from '../shaders/terrain.js';
import { createMaterials } from '../gen/materials.js';
import { createCharacter } from '../gen/character.js';
import { createIsland } from '../gen/island.js';
import { createBoulderGeometry } from '../gen/rock.js';
import { createTuftGeometry, createTreeGeometry, scatterGrass } from '../gen/flora.js';
import { createBlockGeometry, createRuinBuilder } from '../gen/ruins.js';
import { rng } from '../gen/noise.js';
import { createInput } from '../game/input.js';
import { createPlayer, MOVE } from '../game/player.js';
import { createAnimator } from '../game/animator.js';
import { createFollowCamera } from '../game/camera.js';
import { createDust } from '../game/fx.js';
import { groundBelow } from '../game/physics.js';

/* Tahap 4: satu pulau hero yang bisa dijelajahi. Per pulau: 1 draw call medan, 1 rumput, 1 pohon,
   1 batu, 1 reruntuhan (semua instancing). Hanya pohon, batu, reruntuhan, dan karakter yang memancarkan bayangan. */
const GRASS_MAX = 3400;

export function createIslandScene(ctx) {
  const { renderer, quality, env, sunDir, track } = ctx;
  const t0 = performance.now();

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(SKY.horizon, 60, 260);
  scene.add(createSky(sunDir));
  const lights = createLights(scene, quality, sunDir);
  lights.setRange(13);

  const wm = createWorldMaterials();
  const island = createIsland({ radius: 11, seed: 4, relief: 1.25, pos: [0, 0, 0] });
  const root = new THREE.Group();
  root.position.copy(island.pos);
  scene.add(root);

  const ground = new THREE.Mesh(island.geometry, wm.terrain);
  ground.receiveShadow = true;
  root.add(ground);

  const world = { floorY: null, killY: -30, boxes: [], cyls: [], terrains: [island] };
  const wcyl = (c) => world.cyls.push({ x: c.x + island.pos.x, z: c.z + island.pos.z, r: c.r, y0: c.y0 + island.pos.y, y1: c.y1 + island.pos.y });
  const local = (x, z) => island.localHeight(x, z);
  const disposables = [];
  const avoid = [];

  /* reruntuhan */
  const ruin = createRuinBuilder(local, 12);
  ruin.arch(-4.6, -3.4, 0.5);
  ruin.wall(3.2, -6.2, -0.35, 6, 4);
  ruin.rubble(-1.2, -5.6, 4, 1.5);
  ruin.path([[0.3, 2.2], [-0.5, 0.6], [-1.4, -0.9], [-2.7, -2.0], [-3.9, -3.0]]);
  const blockGeo = createBlockGeometry();
  root.add(ruin.build(blockGeo, wm.matte));
  ruin.cyls.forEach(wcyl);
  ruin.blocks.forEach((b) => avoid.push({ x: b.x, z: b.z, r: 0.75 }));
  disposables.push(blockGeo);

  /* pohon: dua varian, masing-masing satu InstancedMesh */
  const rnd = rng(77);
  const m4 = new THREE.Matrix4(), quat = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v3 = new THREE.Vector3(), sc = new THREE.Vector3();
  const TREES = [[[6.3, 3.4, 1.15], [-6.4, 4.6, 0.95], [1.4, -8.2, 0.85]], [[-7.9, -0.6, 1.05], [5.6, -2.4, 0.8]]];
  TREES.forEach((list, vi) => {
    const geo = createTreeGeometry(11 + vi * 6);
    const mesh = new THREE.InstancedMesh(geo, wm.matte, list.length);
    list.forEach(([x, z, s], i) => {
      quat.setFromAxisAngle(up, rnd() * 6.28);
      m4.compose(v3.set(x, local(x, z) - 0.05, z), quat, sc.set(s, s, s));
      mesh.setMatrixAt(i, m4);
      wcyl({ x, z, r: 0.34 * s, y0: -2, y1: local(x, z) + geo.userData.height * s });
      avoid.push({ x, z, r: 0.6 * s });
    });
    mesh.castShadow = true; mesh.receiveShadow = true;
    root.add(mesh); disposables.push(geo);
  });

  /* batu lepas */
  const boulderGeo = createBoulderGeometry(3);
  const BOULDERS = 16, q = { x: 0, y: 0, z: 0, rho: 0 };
  const boulders = new THREE.InstancedMesh(boulderGeo, wm.matte, BOULDERS);
  for (let i = 0; i < BOULDERS; i++) {
    island.sample(rnd, q, 0.93);
    if (Math.hypot(q.x, q.z) < 2.2) { q.x += 3; q.y = local(q.x, q.z); }
    const s = i < 4 ? 0.9 + rnd() * 0.6 : 0.3 + rnd() * 0.35;
    quat.setFromAxisAngle(up, rnd() * 6.28);
    m4.compose(v3.set(q.x, q.y - 0.12 * s, q.z), quat, sc.set(s, s * (0.8 + rnd() * 0.4), s));
    boulders.setMatrixAt(i, m4);
    if (s > 0.7) wcyl({ x: q.x, z: q.z, r: 0.72 * s, y0: q.y - 2, y1: q.y + 0.72 * s });
    avoid.push({ x: q.x, z: q.z, r: 0.8 * s });
  }
  boulders.castShadow = true; boulders.receiveShadow = true;
  root.add(boulders); disposables.push(boulderGeo);

  /* rumput: jumlah mengikuti profil kualitas tanpa membangun ulang */
  const tuftGeo = createTuftGeometry(5);
  const grass = scatterGrass(island, tuftGeo, wm.grass, GRASS_MAX, 31, avoid);
  root.add(grass); disposables.push(tuftGeo);
  const applyProfile = (p) => { grass.count = Math.floor(grass.userData.max * p.vegetation); };
  quality.onChange(applyProfile); applyProfile(quality.profile);

  /* pemain */
  const mats = createMaterials(env);
  const character = createCharacter(mats);
  scene.add(character.root);
  const dust = createDust(quality);
  scene.add(dust.object);
  const input = createInput(renderer.domElement);
  const cam = createFollowCamera(track);
  cam.ground = (x, z) => groundBelow(world, x, z);
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
  const sx = 0.6, sz = 3.4, sy = island.heightAt(sx, sz);
  player.setSpawn(sx, sy, sz);
  player.teleport(sx, sy, sz, Math.PI);
  cam.snap(player.body.pos, 0);

  const anim = { speed: 0, maxSpeed: MOVE.maxSpeed, grounded: true, vy: 0, turn: 0 };
  let time = 0;
  const buildMs = Math.round(performance.now() - t0);
  return {
    scene, camera: cam.camera, player, input, cam, world, island, buildMs,
    update(dt) {
      time += dt;
      player.update(dt, input.poll(), cam.state.yaw, world);
      anim.speed = player.state.speed; anim.grounded = player.body.grounded; anim.vy = player.body.vel.y; anim.turn = player.state.turn;
      animator.update(dt, anim);
      dust.update(dt);
    },
    render(dt, alpha) {
      wm.uTime.value = time;
      player.render(alpha);
      cam.update(dt, character.root.position, player.body.vel, input);
      lights.follow(character.root.position);
      dust.setViewport(renderer.domElement.height, cam.camera.fov);
      character.tick(time);
      renderer.render(scene, cam.camera);
    },
    dispose() { wm.dispose(); mats.dispose(); character.dispose(); dust.dispose(); island.dispose(); disposables.forEach((d) => d.dispose()); },
  };
}
