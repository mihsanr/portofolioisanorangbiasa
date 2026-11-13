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
import { createProps } from '../game/propsys.js';

/* Tahap 4–5: satu pulau hero yang bisa dijelajahi + prop interaktif (kaset, jump pad, pegas, troli). Per pulau: 1 draw call medan, 1 rumput, 1 pohon,
   1 batu, 1 reruntuhan (semua instancing). Hanya pohon, batu, reruntuhan, dan karakter yang memancarkan bayangan. */
const GRASS_MAX = 3400;
const GOLD = new THREE.Color('#ffd77a');

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

  /* prop interaktif: didaftarkan dulu supaya rumput menghindarinya */
  const props = createProps({ renderer, env, world, uTime: wm.uTime });
  const gy = (x, z) => island.heightAt(x, z);
  const ox = island.outline(0);
  props.addPad(-1.6, gy(-1.6, 6.2) - 0.04, 6.2); avoid.push({ x: -1.6, z: 6.2, r: 1.35 });
  props.addSpring(4.3, gy(4.3, 6.3) - 0.04, 6.3); avoid.push({ x: 4.3, z: 6.3, r: 1.0 });
  props.addCart([ox + 1.75, -0.22, 0.3], [ox + 12, -0.22, 0.3], 8);
  [[2.6, 1.15, 1.2], [-4.6, 1.6, -3.4], [3.2, 3.7, -6.2], [-1.6, 5.0, 6.2], [4.3, 10.5, 6.3], [-7.5, 1.15, 2.0]]
    .forEach(([x, up, z]) => { props.addCassette(x, gy(x, z) + up, z); avoid.push({ x, z, r: 0.2 }); });
  props.addCassette(ox + 7, 1.0, 0.3); props.addCassette(ox + 13.2, 1.05, 0.3);
  props.build();
  scene.add(props.group);

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
    const s = i < 4 ? 0.9 + rnd() * 0.6 : 0.3 + rnd() * 0.35;
    for (let tries = 0; tries < 30; tries++) {
      island.sample(rnd, q, 0.93);
      if (Math.hypot(q.x - 0.6, q.z - 3.4) < 2.6) continue;
      if (!avoid.some((a) => Math.hypot(q.x - a.x, q.z - a.z) < a.r + 0.9 * s + 0.5)) break;
    }
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
  const sparks = createDust(quality, { color: '#ffd77a', additive: true, opacity: 0.95 });
  scene.add(dust.object, sparks.object);
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
  const propHooks = {
    onCollect(t) { sparks.setColor(GOLD); sparks.burst(t.x, t.y, t.z, 16, 3.4); animator.cheer(); },
    onLaunch(p, color) { sparks.setColor(color); sparks.burst(p.x, p.y + 0.5, p.z, 14, 4.2); },
  };
  const sx = 0.6, sz = 3.4, sy = island.heightAt(sx, sz);
  player.setSpawn(sx, sy, sz);
  player.teleport(sx, sy, sz, Math.PI);
  cam.snap(player.body.pos, 0);

  const anim = { speed: 0, maxSpeed: MOVE.maxSpeed, grounded: true, vy: 0, turn: 0 };
  let time = 0;
  const buildMs = Math.round(performance.now() - t0);
  return {
    scene, camera: cam.camera, player, input, cam, world, island, props, buildMs,
    update(dt) {
      time += dt;
      props.update(dt, player, propHooks);
      player.update(dt, input.poll(), cam.state.yaw, world);
      anim.speed = player.state.speed; anim.grounded = player.body.grounded; anim.vy = player.body.vel.y; anim.turn = player.state.turn;
      animator.update(dt, anim);
      dust.update(dt); sparks.update(dt);
    },
    render(dt, alpha) {
      wm.uTime.value = time;
      player.render(alpha);
      cam.update(dt, character.root.position, player.body.vel, input);
      lights.follow(character.root.position);
      dust.setViewport(renderer.domElement.height, cam.camera.fov);
      sparks.setViewport(renderer.domElement.height, cam.camera.fov);
      props.setViewport(renderer.domElement.height, cam.camera.fov);
      character.tick(time);
      renderer.render(scene, cam.camera);
    },
    dispose() { wm.dispose(); mats.dispose(); character.dispose(); dust.dispose(); sparks.dispose(); props.dispose(); island.dispose(); disposables.forEach((d) => d.dispose()); },
  };
}
