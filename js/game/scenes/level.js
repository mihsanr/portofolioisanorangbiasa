import * as THREE from 'three';
import { createLights } from '../core/lights.js';
import { createAtmosphere } from '../core/atmosphere.js';
import { createWorldMaterials } from '../shaders/terrain.js';
import { createScreenMaterial, FACE } from '../shaders/crt-screen.js';
import { createMaterials } from '../gen/materials.js';
import { createCharacter } from '../gen/character.js';
import { getHeadGeometry } from '../gen/crt-head.js';
import { createIsland } from '../gen/island.js';
import { createBoulderGeometry } from '../gen/rock.js';
import { createTuftGeometry, createTreeGeometry, scatterGrass } from '../gen/flora.js';
import { createBlockGeometry, createRuinBuilder } from '../gen/ruins.js';
import { createTowerGeometry, createScaffoldGeometry } from '../gen/landmarks.js';
import { rng } from '../gen/noise.js';
import { createInput } from '../game/input.js';
import { createPlayer, MOVE } from '../game/player.js';
import { createAnimator } from '../game/animator.js';
import { createFollowCamera } from '../game/camera.js';
import { createDust } from '../game/fx.js';
import { groundBelow } from '../game/physics.js';
import { createProps } from '../game/propsys.js';
import { createBlobShadow } from '../game/blob.js';
import { LEVEL } from '../game/leveldata.js';
import { createTraps } from '../game/traps.js';

/* Pembangun level dari data (game/leveldata.js). Dibangun bertahap (satu pulau per frame) supaya halaman
   tidak membeku saat memuat. Per pulau: 1 draw call medan + rumput + pohon + batu + reruntuhan, semuanya
   instancing dengan geometri yang dipakai bersama seluruh level. LOD per pulau: mesh jauh berkepadatan
   separuh, pohon versi ringan, rumput & batu kecil disembunyikan. */
const D2R = Math.PI / 180;
const GRASS_PER_M2 = 8;
const GOLD = new THREE.Color('#ffd77a');
const RED = new THREE.Color('#ff3b2f');
const TV_SCALE = 9, GIANT_SCALE = 13;

export async function createLevel(ctx, progress = async () => {}) {
  const { renderer, quality, env, sunDir, track } = ctx;
  const t0 = performance.now();

  const scene = new THREE.Scene();
  const atmo = createAtmosphere(ctx, scene);
  const lights = createLights(scene, quality, sunDir);
  lights.setRange(17);
  const wm = createWorldMaterials(sunDir);
  const mats = createMaterials(env);
  const world = { floorY: null, killY: atmo.seaY - 6, boxes: [], cyls: [], terrains: [] };
  const props = createProps({ renderer, env, world, uTime: wm.uTime, quality });
  const disposables = [];
  const keep = (g) => { disposables.push(g); return g; };
  const shared = {
    tuft: keep(createTuftGeometry(5)), block: keep(createBlockGeometry()), boulder: keep(createBoulderGeometry(3)),
    trees: [0, 1].map((v) => [0, 1, 2].map((l) => keep(createTreeGeometry(11 + v * 6, l)))),
  };
  await progress(0.06);

  /* ——— 1. pulau + posisi (relatif, tepi ke tepi) ——— */
  const byId = {}, order = [], avoid = {}, links = [];
  const rimPoint = (isl, th, inset) => { const r = isl.outline(th) - inset; return { x: r * Math.cos(th), z: r * Math.sin(th) }; };
  for (let i = 0; i < LEVEL.islands.length; i++) {
    const def = LEVEL.islands[i];
    const isl = createIsland({ radius: def.radius, seed: def.seed, relief: def.relief });
    if (def.pos) isl.pos.set(def.pos[0], def.pos[1], def.pos[2]);
    else if (def.from) {
      const f = byId[def.from], th = def.dir * D2R, d = f.outline(th) + def.gap + isl.outline(th + Math.PI);
      isl.pos.set(f.pos.x + Math.cos(th) * d, f.pos.y + def.dy, f.pos.z + Math.sin(th) * d);
      links.push([f, th], [isl, th + Math.PI]);
    } else if (def.between) {
      const a = byId[def.between[0]], b = byId[def.between[1]];
      const th = Math.atan2(b.pos.z - a.pos.z, b.pos.x - a.pos.x), dist = Math.hypot(b.pos.x - a.pos.x, b.pos.z - a.pos.z);
      const free = dist - a.outline(th) - b.outline(th + Math.PI) - isl.outline(th) - isl.outline(th + Math.PI);
      const d = a.outline(th) + free / 2 + isl.outline(th + Math.PI);
      isl.pos.set(a.pos.x + Math.cos(th) * d, Math.max(a.pos.y, b.pos.y) + def.dy, a.pos.z + Math.sin(th) * d);
      isl.gap = free / 2;
      links.push([a, th], [isl, th + Math.PI], [isl, th], [b, th + Math.PI]);
    }
    isl.id = def.id; isl.data = def;
    byId[def.id] = isl; order.push(isl); avoid[def.id] = [];
    world.terrains.push(isl);
    await progress(0.06 + 0.34 * (i + 1) / LEVEL.islands.length);
  }
  /* tepi yang menghadap pulau tetangga dibiarkan kosong (tempat mendarat / naik troli) */
  links.forEach(([isl, th]) => { const p = rimPoint(isl, th, 1.6); avoid[isl.id].push({ x: p.x, z: p.z, r: 2.4 }); });

  /* ——— 2. prop: didaftarkan dulu supaya vegetasi menghindarinya ——— */
  const W = (isl, x, z, up = 0) => [isl.pos.x + x, isl.pos.y + isl.localHeight(x, z) + up, isl.pos.z + z];
  order.forEach((isl) => {
    const d = isl.data, av = avoid[isl.id];
    if (d.spawn) {
      const yaw = d.spawn[2] ?? 0;
      av.push({ x: d.spawn[0], z: d.spawn[1], r: 2.6 }, { x: d.spawn[0] - Math.sin(yaw) * 4.2, z: d.spawn[1] - Math.cos(yaw) * 4.2, r: 3.0 }); isl.spawnPoint = new THREE.Vector3(...W(isl, d.spawn[0], d.spawn[1])); isl.spawnYaw = yaw;
    }
    (d.pads || []).forEach(([x, z]) => { const p = W(isl, x, z, -0.04); props.addPad(p[0], p[1], p[2]); av.push({ x, z, r: 1.4 }); });
    (d.springs || []).forEach(([x, z]) => { const p = W(isl, x, z, -0.04); props.addSpring(p[0], p[1], p[2]); av.push({ x, z, r: 1.1 }); });
    if (d.springToward) {
      const t = byId[d.springToward[0]], th = Math.atan2(t.pos.z - isl.pos.z, t.pos.x - isl.pos.x), r = isl.outline(th) * d.springToward[1];
      const x = r * Math.cos(th), z = r * Math.sin(th), p = W(isl, x, z, -0.04);
      props.addSpring(p[0], p[1], p[2]); av.push({ x, z, r: 1.3 });
    }
    (d.tapes || []).forEach(([x, z, up]) => { const p = W(isl, x, z, up); props.addCassette(p[0], p[1], p[2]); av.push({ x, z, r: 0.5 }); });
    if (d.tower) av.push({ x: d.tower[0], z: d.tower[1], r: 2.6 });
    if (d.billboard) av.push({ x: d.billboard[0], z: d.billboard[1], r: 3.6 });
  });
  LEVEL.carts.forEach((c) => {
    const a = byId[c.from], b = byId[c.to];
    const th = Math.round(Math.atan2(b.pos.z - a.pos.z, b.pos.x - a.pos.x) / (Math.PI / 2)) * (Math.PI / 2), ux = Math.cos(th), uz = Math.sin(th);
    const ra = a.outline(th) + 1.55, rb = b.outline(th + Math.PI) + 1.55;
    const pa = [a.pos.x + ux * ra, a.pos.y - 0.24, a.pos.z + uz * ra], pb = [b.pos.x - ux * rb, b.pos.y - 0.24, b.pos.z - uz * rb];
    props.addCart(pa, pb, c.period);
    if (c.tape) props.addCassette((pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2 + c.tape, (pa[2] + pb[2]) / 2);
  });
  LEVEL.airTapes.forEach(([ia, ib, t, up]) => {
    const a = byId[ia], b = byId[ib];
    props.addCassette(a.pos.x + (b.pos.x - a.pos.x) * t, b.pos.y + up, a.pos.z + (b.pos.z - a.pos.z) * t);
  });
  order.forEach((isl) => { if (isl.data.tower) { const p = W(isl, isl.data.tower[0], isl.data.tower[1]); props.addHalo(p[0], p[1] + 18.3, p[2], '#ff4a3d', 3.4, 0.5); } });
  props.build();
  scene.add(props.group);
  const traps = createTraps({ props, world, scene });      // rintangan berpola mode EDAN (tersembunyi di NORMAL)
  await progress(0.46);

  /* ——— 3. isi tiap pulau ——— */
  const m4 = new THREE.Matrix4(), quat = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v3 = new THREE.Vector3(), sc = new THREE.Vector3();
  const lod = [], tickers = [], canopies = [];
  let towerGeo = null, scaffoldGeo = null;
  for (let i = 0; i < order.length; i++) {
    const isl = order[i], d = isl.data, av = avoid[isl.id], rnd = rng(d.seed * 31 + 7), small = isl.radius < 4;
    const root = new THREE.Group();
    root.position.copy(isl.pos);
    scene.add(root);
    isl.root = root;                  // mode EDAN menggoyang / menjatuhkan pulau kecil lewat root ini
    const local = (x, z) => isl.localHeight(x, z);
    const wcyl = (c) => world.cyls.push({ x: c.x + isl.pos.x, z: c.z + isl.pos.z, r: c.r, y0: c.y0 + isl.pos.y, y1: c.y1 + isl.pos.y, owner: isl });
    const free = (x, z, r) => !av.some((a) => Math.hypot(x - a.x, z - a.z) < a.r + r);
    const entry = { isl, far: false, treeLod: 0, ground: null, grass: null, trees: null, treeGeo: null, boulders: null };

    entry.ground = new THREE.Mesh(isl.geometry, wm.terrain);
    entry.ground.receiveShadow = true;
    root.add(entry.ground);

    if (d.ruins) {
      const ruin = createRuinBuilder(local, d.seed + 3);
      d.ruins.forEach(([kind, ...a]) => ruin[kind](...a));
      root.add(ruin.build(shared.block, wm.matte));
      ruin.cyls.forEach(wcyl);
      ruin.blocks.forEach((b) => av.push({ x: b.x, z: b.z, r: 0.75 }));
    }

    if (d.tower) {
      towerGeo = towerGeo || createTowerGeometry();
      const [x, z] = d.tower, y = local(x, z) - 0.25;
      const body = new THREE.Mesh(towerGeo.body, props.material), glow = new THREE.Mesh(towerGeo.glow, props.glowMaterial);
      body.position.set(x, y, z); glow.position.copy(body.position);
      body.castShadow = true;
      root.add(body, glow);
      wcyl({ x, z, r: towerGeo.base * 1.05, y0: y - 1, y1: y + towerGeo.height });
    }

    if (d.billboard) {
      scaffoldGeo = scaffoldGeo || createScaffoldGeometry();
      const [x, z] = d.billboard, y = local(x, z) - 0.2, head = getHeadGeometry(), S = TV_SCALE;
      const g = new THREE.Group();
      g.position.set(x, y, z);
      const sf = new THREE.Mesh(scaffoldGeo.body, props.material); sf.castShadow = true;
      const tv = new THREE.Group(); tv.position.y = scaffoldGeo.height + 0.25; tv.scale.setScalar(S);
      const casing = new THREE.Mesh(head.plastic, mats.plastic); casing.castShadow = true;
      const screenMat = createScreenMaterial(env);
      tv.add(casing, new THREE.Mesh(head.metal, mats.metal), new THREE.Mesh(head.screen, screenMat));
      g.add(sf, tv); root.add(g);
      disposables.push(screenMat);
      const u = screenMat.userData.uniforms;
      tickers.push((t) => { u.uTime.value = t; u.uFrame.value = (t % 4.6) > 4.42 ? FACE.blink : FACE.happy; });
      scaffoldGeo.legs.forEach(([lx, lz]) => wcyl({ x: x + lx, z: z + lz, r: 0.3, y0: y - 1, y1: y + scaffoldGeo.height }));
      const by = isl.pos.y + y + scaffoldGeo.height;
      world.boxes.push({ min: [isl.pos.x + x - S * 0.28, by - 0.3, isl.pos.z + z - S * 0.36], max: [isl.pos.x + x + S * 0.28, by + 0.25 + S * 0.47, isl.pos.z + z + S * 0.22] });
    }

    if (d.giant && props.geo.vhs) {
      const [x, z, h] = d.giant, g = new THREE.Group();
      g.add(new THREE.Mesh(props.geo.vhs, props.material));
      const glass = new THREE.Mesh(props.geo.glass, props.glassMaterial); glass.renderOrder = 2; g.add(glass);
      g.position.set(x, local(x, z) + h, z); g.scale.setScalar(GIANT_SCALE); g.rotation.set(-0.35, 0.6, 0.22);
      root.add(g);
      const y0 = g.position.y;
      tickers.push((t) => { g.rotation.y = 0.6 + t * 0.12; g.position.y = y0 + Math.sin(t * 0.5) * 0.6; });
    }

    /* pohon: penempatan otomatis, menghindari prop / reruntuhan / tepi sambungan */
    const nTrees = d.trees || 0;
    if (nTrees) {
      const tg = shared.trees[i % 2], treeH = tg[0].userData.height, mesh = new THREE.InstancedMesh(tg[0], wm.foliage, nTrees), q = { x: 0, y: 0, z: 0, rho: 0 };
      let n = 0;
      for (let tries = 0; n < nTrees && tries < nTrees * 40; tries++) {
        isl.sample(rnd, q, small ? 0.45 : 0.82);
        const s = small ? 0.5 + rnd() * 0.15 : 0.78 + rnd() * 0.42;
        if (!small && q.rho < 0.22) continue;
        if (!free(q.x, q.z, 1.3 * s)) continue;
        quat.setFromAxisAngle(up, rnd() * 6.28);
        mesh.setMatrixAt(n++, m4.compose(v3.set(q.x, q.y - 0.05, q.z), quat, sc.set(s, s, s)));
        wcyl({ x: q.x, z: q.z, r: 0.34 * s, y0: -2, y1: q.y + treeH * s });
        canopies.push({ x: isl.pos.x + q.x, y: isl.pos.y + q.y + treeH * s * 1.1, z: isl.pos.z + q.z, r2: (1.5 * s) * (1.5 * s) });
        av.push({ x: q.x, z: q.z, r: 0.7 * s });
      }
      mesh.count = n; mesh.castShadow = true; mesh.receiveShadow = true;
      root.add(mesh); entry.trees = mesh; entry.treeGeo = tg;
    }

    /* batu lepas */
    const nB = d.boulders || 0;
    if (nB) {
      const mesh = new THREE.InstancedMesh(shared.boulder, wm.matte, nB), q = { x: 0, y: 0, z: 0, rho: 0 };
      let n = 0;
      for (let k = 0; k < nB; k++) {
        const s = small ? 0.28 + rnd() * 0.2 : (k < nB / 4 ? 0.9 + rnd() * 0.6 : 0.3 + rnd() * 0.35);
        let ok = false;
        for (let tries = 0; tries < 30 && !ok; tries++) { isl.sample(rnd, q, 0.92); ok = free(q.x, q.z, 0.9 * s + 0.4); }
        if (!ok) continue;
        quat.setFromAxisAngle(up, rnd() * 6.28);
        mesh.setMatrixAt(n++, m4.compose(v3.set(q.x, q.y - 0.12 * s, q.z), quat, sc.set(s, s * (0.8 + rnd() * 0.4), s)));
        if (s > 0.7) wcyl({ x: q.x, z: q.z, r: 0.72 * s, y0: q.y - 2, y1: q.y + 0.72 * s });
        av.push({ x: q.x, z: q.z, r: 0.8 * s });
      }
      mesh.count = n; mesh.castShadow = true; mesh.receiveShadow = true;
      root.add(mesh); entry.boulders = mesh;
    }

    /* rumput */
    const nG = Math.round(Math.PI * isl.radius * isl.radius * GRASS_PER_M2);
    entry.grass = scatterGrass(isl, shared.tuft, wm.grass, nG, d.seed + 31, av);
    root.add(entry.grass);

    lod.push(entry);
    await progress(0.46 + 0.5 * (i + 1) / order.length);
  }
  if (towerGeo) { disposables.push(towerGeo.body, towerGeo.glow); }
  if (scaffoldGeo) disposables.push(scaffoldGeo.body);

  /* ——— LOD ———
     Jarak dihitung dari kamera ke tepi pulau. Tiga hal diatur terpisah karena biayanya berbeda:
     rumput (paling banyak segitiga) hanya dekat pemain, pohon detail penuh sampai jarak sedang,
     mesh medan baru disederhanakan di kejauhan. Semua ambang dikali faktor profil kualitas. */
  function updateLOD(cam) {
    const k = quality.profile.lod, veg = quality.profile.vegetation;
    for (let i = 0; i < lod.length; i++) {
      const e = lod[i], isl = e.isl;
      const dist = Math.hypot(cam.x - isl.pos.x, cam.y - isl.pos.y, cam.z - isl.pos.z) - isl.radius;
      const far = e.far ? dist > 38 * k : dist > 44 * k;
      if (far !== e.far) {
        e.far = far;
        e.ground.geometry = far ? isl.lowGeometry : isl.geometry;
        if (e.boulders) e.boulders.visible = !far;
      }
      if (e.trees) {
        /* histeresis: naik tingkat pada ambang, turun lagi sedikit lebih dekat, supaya tidak berkedip */
        let l = e.treeLod;
        if (l === 0) { if (dist > 26 * k) l = 1; } else if (l === 1) { if (dist > 48 * k) l = 2; else if (dist < 20 * k) l = 0; } else if (dist < 42 * k) l = 1;
        if (l !== e.treeLod) { e.treeLod = l; e.trees.geometry = e.treeGeo[l]; }
      }
      const near = dist < 26 * k;
      e.grass.visible = near;
      if (near) e.grass.count = Math.floor(e.grass.userData.max * veg * (dist < 9 * k ? 1 : 0.5));
    }
  }

  /* ——— pemain ——— */
  const character = createCharacter(mats);
  scene.add(character.root);
  const dust = createDust(quality);
  const sparks = createDust(quality, { color: '#ffd77a', additive: true, opacity: 0.95 });
  const blob = createBlobShadow(world);
  scene.add(dust.object, sparks.object, blob.object);
  const input = createInput(renderer.domElement);
  const cam = createFollowCamera(track);
  cam.ground = (x, z) => groundBelow(world, x, z);
  const Q = { rho: 0, h: 0, d: 0, o: 0, nx: 0, nz: 0 };
  cam.blocked = (x, y, z) => {
    for (let i = 0; i < world.terrains.length; i++) {
      const t = world.terrains[i];
      if (t.query(x, z, Q) && Q.rho <= 1 && y < Q.h + 0.25 && y > Q.h - t.depth * 0.6) return true;
    }
    for (let i = 0; i < canopies.length; i++) {
      const c = canopies[i], dx = x - c.x, dy = (y - c.y) * 1.25, dz = z - c.z;
      if (dx * dx + dy * dy + dz * dz < c.r2) return true;
    }
    return false;
  };
  const fwd = new THREE.Vector3();
  const animator = createAnimator(character, {
    onStep(side) {
      const p = player.body.pos, y = player.state.yaw;
      fwd.set(Math.sin(y), 0, Math.cos(y));
      dust.puff(p.x + Math.cos(y) * 0.1 * side - fwd.x * 0.15, p.y, p.z - Math.sin(y) * 0.1 * side - fwd.z * 0.15, fwd.x, fwd.z, 2);
    },
  });
  const events = { onCollect: null, onRespawn: null, onJump: null, onLand: null, onLaunch: null, onTrap: null };
  let hazards = null;                 // jebakan mode EDAN (game/edan.js), dipasang oleh flow
  const ORANGE = new THREE.Color('#ff8a3d');
  const trapHooks = { onSpray(h) { sparks.setColor(ORANGE); sparks.burst(h.x, h.y + 0.4, h.z, 4, 6.5); }, onHit(h) { sparks.setColor(RED); sparks.burst(player.body.pos.x, player.body.pos.y + 0.8, player.body.pos.z, 18, 5); events.onTrapHit && events.onTrapHit(h); } };
  const IDLE = { x: 0, y: 0, jump: false, jumpPressed: false };
  let controls = true;
  const player = createPlayer(character, {
    onJump(double) { animator.onJump(double); if (!double) dust.ring(player.body.pos.x, player.body.pos.y, player.body.pos.z, 0.55); events.onJump && events.onJump(double); },
    onLand(impact) { animator.onLand(impact); dust.ring(player.body.pos.x, player.body.pos.y, player.body.pos.z, Math.min(1.3, 0.35 + impact / 18)); events.onLand && events.onLand(impact); },
    onRespawn() { cam.snap(player.body.pos, cam.state.yaw); events.onRespawn && events.onRespawn(); },
    canDouble: () => !hazards || hazards.canDouble(),
  });
  const propHooks = {
    onCollect(t, n, total) { sparks.setColor(GOLD); sparks.burst(t.x, t.y, t.z, 16, 3.4); animator.cheer(); events.onCollect && events.onCollect(n, total, t); },
    onTrap(t) { sparks.setColor(RED); sparks.burst(t.x, t.y, t.z, 22, 5.5); hazards && hazards.trap(t); events.onTrap && events.onTrap(t); },
    onLaunch(p, color) { sparks.setColor(color); sparks.burst(p.x, p.y + 0.5, p.z, 14, 4.2); events.onLaunch && events.onLaunch(); },
  };
  const goTo = (isl) => { const s = isl.spawnPoint; player.setSpawn(s.x, s.y, s.z); player.teleport(s.x, s.y, s.z, isl.spawnYaw); cam.snap(player.body.pos, isl.spawnYaw + Math.PI); };
  const start = byId[LEVEL.start];
  goTo(start);
  let checkpoint = start, checkpoints = true;
  /* pijakan aman terakhir: dipakai mode EDAN untuk menghitung seberapa jauh pemain "terlempar pulang" */
  const lastSafe = new THREE.Vector3().copy(player.body.pos);
  let lastIsland = start;

  /* ?debug: tombol 1–9 melompat ke titik awal pulau besar (untuk menguji level) */
  const stops = order.filter((o) => o.spawnPoint);
  if (new URLSearchParams(location.search).has('debug')) {
    window.addEventListener('keydown', (e) => { const m = /^Digit(\d)$/.exec(e.code); if (m && stops[+m[1] - 1]) goTo(stops[+m[1] - 1]); });
  }

  const anim = { speed: 0, maxSpeed: MOVE.maxSpeed, grounded: true, vy: 0, turn: 0 };
  let time = 0, lodT = 1;
  /* pemanasan: gambar seluruh level sekali per tingkat LOD di balik layar memuat. Semua geometri dan shader
     terunggah ke GPU sekarang, jadi tidak ada sendatan saat LOD berganti di tengah permainan. */
  {
    const warm = new THREE.PerspectiveCamera(60, 1.6, 1, 900);
    warm.position.set(8, 150, 60); warm.lookAt(8, 0, -14); warm.updateMatrixWorld();
    const setAll = (far, tl = far ? 2 : 0) => lod.forEach((e) => {
      e.ground.geometry = far ? e.isl.lowGeometry : e.isl.geometry;
      if (e.trees) e.trees.geometry = e.treeGeo[tl];
      if (e.boulders) e.boulders.visible = true;
      e.grass.visible = !far; e.far = far; e.treeLod = tl;
    });
    setAll(false);
    if (renderer.compileAsync) { try { await renderer.compileAsync(scene, warm); } catch (e) { /* lanjut dengan kompilasi biasa */ } }
    await progress(0.97);
    renderer.render(scene, warm);
    setAll(true); renderer.render(scene, warm);
    setAll(true, 1); renderer.render(scene, warm); await progress(0.99);
    setAll(false);
  }
  updateLOD(cam.camera.position);
  await progress(1);
  const buildMs = Math.round(performance.now() - t0);

  return {
    scene, camera: cam.camera, player, input, cam, world, props, islands: byId, stops, events, goTo, buildMs, lod,
    get checkpoint() { return checkpoint; },
    /* false (mode EDAN) = tidak ada checkpoint: jatuh selalu kembali ke pulau awal */
    traps,
    /* bahan untuk chaos.js (pohon nongol dll.) */
    kit: { scene, treeGeo: shared.trees[0][1], treeMat: wm.foliage },
    burst(color, x, y, z, n, speed) { sparks.setColor(new THREE.Color(color)); sparks.burst(x, y, z, n, speed); },
    get hazards() { return hazards; }, set hazards(h) { hazards = h; },
    get checkpoints() { return checkpoints; }, set checkpoints(v) { checkpoints = !!v; },
    lastSafe, get lastIsland() { return lastIsland; }, startPoint: start.spawnPoint,
    /* false = pemain tidak bisa digerakkan (layar judul / hasil); dunia tetap hidup */
    get controls() { return controls; }, set controls(v) { controls = !!v; },
    /* mulai ulang: semua kaset kembali, pemain ke titik awal */
    reset() { props.reset(); traps.reset(); checkpoint = start; goTo(start); lastSafe.copy(player.body.pos); lastIsland = start; },
    update(dt) {
      time += dt;
      if (hazards) hazards.update(dt);
      traps.update(dt, player, trapHooks);
      props.update(dt, player, propHooks);
      const inp = input.poll();
      if (hazards) hazards.filterInput(inp);
      player.update(dt, controls && !(hazards && hazards.blackout) ? inp : IDLE, cam.state.yaw, world);
      const g = player.body.ground;
      if (player.body.grounded && g) {
        lastSafe.copy(player.body.pos);
        if (g.outline) lastIsland = g;
        if (checkpoints && g.spawnPoint && g !== checkpoint) { checkpoint = g; player.setSpawn(g.spawnPoint.x, g.spawnPoint.y, g.spawnPoint.z); }
      }
      anim.speed = player.state.speed; anim.grounded = player.body.grounded; anim.vy = player.body.vel.y; anim.turn = player.state.turn;
      animator.update(dt, anim);
      dust.update(dt); sparks.update(dt);
    },
    render(dt, alpha) {
      if (hazards && hazards.frozen) return;          // "lag" palsu mode EDAN: layar membeku sesaat
      wm.uTime.value = time;
      player.render(alpha);
      cam.update(dt, character.root.position, player.body.vel, input);
      lights.follow(character.root.position);
      cam.camera.updateMatrixWorld(); wm.update(cam.camera);
      blob.update(character.root.position);
      atmo.update(cam.camera, time);
      lodT += dt; if (lodT > 0.2) { lodT = 0; updateLOD(cam.camera.position); }
      for (let i = 0; i < tickers.length; i++) tickers[i](time);
      const h = renderer.domElement.height, fov = cam.camera.fov;
      dust.setViewport(h, fov); sparks.setViewport(h, fov); props.setViewport(h, fov);
      character.tick(time);
      renderer.render(scene, cam.camera);
    },
    dispose() {
      wm.dispose(); mats.dispose(); traps.dispose(); character.dispose(); dust.dispose(); sparks.dispose(); blob.dispose(); props.dispose(); atmo.dispose();
      order.forEach((o) => o.dispose()); disposables.forEach((d) => d.dispose());
    },
  };
}
