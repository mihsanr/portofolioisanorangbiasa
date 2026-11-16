import * as THREE from 'three';
import { glowPiece, piece } from '../gen/props.js';
import { merge } from '../gen/build.js';

/* 20 kejadian MENDADAK mode EDAN (lingkungan yang mengganggu). Tiga pemicu:
   DIAM  — muncul kalau pemain berdiri diam terlalu lama.
   AKSI  — dipicu oleh tindakan pemain (lompat, mendarat, memungut kaset, naik troli, memutar kamera, lari terus).
   ACAK  — datang sendiri dengan jeda acak.
   Gangguan berkala lama (angin, kontrol terbalik, gempa, gravitasi berat, gravitasi ringan) ada di edan.js.
   Semua angka di CHAOS. force(id) memicu satu kejadian seketika (untuk alat uji). */
export const CHAOS = {
  /* DIAM: detik diam sebelum muncul */
  idleFast: 2.5, idleCam: 3.5, idleTape: 4.5, idleBolt: 5.5, idleTilt: 7, boltEvery: 2.5, boltWarn: 1.0, boltR: 1.3,
  tiltMax: 2.2,
  /* AKSI: peluang */
  slip: 0.12, bounce: 0.15, boom: 0.25, magnetRho: 0.82, magnetPull: 1.6, camStick: 0.2, cartFlip: 0.4, crampAfter: 4.5, cramp: 0.3, crampTime: 0.9,
  /* ACAK: jeda [min, max] detik */
  tree: [9, 16], shove: [16, 28], tape: [13, 22], lag: [22, 38], fog: [30, 50], mirror: [35, 55], doom: [60, 90], doomFirst: [45, 70],
  flatTime: 10,            // kena meteor saat berpijak = gepeng selama ini (detik)
  lagTime: 0.55, fogTime: 5, mirrorTime: 4.5, doomTime: 7, meteorEvery: 0.35, meteorWarn: 0.9, meteorR: 1.6, tapeSpeed: 13,
};

export const FEATURES = [
  ['stopwatch-ngebut', 'diam'], ['pulau-miring', 'diam'], ['kamera-bosan', 'diam'], ['kaset-pindah', 'diam'], ['petir', 'diam'],
  ['kepeleset', 'aksi'], ['pantul', 'aksi'], ['kaset-meledak', 'aksi'], ['magnet-jurang', 'aksi'], ['kamera-nyangkut', 'aksi'], ['troli-kesurupan', 'aksi'], ['kram', 'aksi'],
  ['pohon-nongol', 'acak'], ['digeser', 'acak'], ['kaset-terbang', 'acak'], ['lag', 'acak'], ['kabut', 'acak'], ['cermin', 'acak'], ['kiamat', 'acak'], ['gravitasi-ringan', 'acak'],
];

const Q = { rho: 0, h: 0, d: 0, o: 0, nx: 0, nz: 0 };
const TAU = Math.PI * 2;

export function createChaos(stage, kit, { flash, cls, sfx, burst } = {}) {
  const { player, props, world, cam, input } = stage;
  const body = player.body;
  const fog = kit.scene.fog, fog0 = fog ? { near: fog.near, far: fog.far } : null;
  let rnd = Math.random, active = false;
  const range = (a) => a[0] + (a[1] - a[0]) * rnd();

  /* ——— visual: cincin peringatan, meteor, kaset terbang, pohon ——— */
  const group = new THREE.Group(); group.visible = false; kit.scene.add(group);
  const ringGeo = glowPiece(new THREE.TorusGeometry(1, 0.06, 8, 40).rotateX(Math.PI / 2), '#ff3b2f', 1);
  const discGeo = glowPiece(new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2), '#5a0d08', 1);
  /* meteor: batu gelap (bahan atlas, terkena cahaya) + inti dan ekor api menyala di atasnya */
  const meteorGeo = piece(new THREE.IcosahedronGeometry(0.5, 3), (x, y) => (y < -0.15 ? '#ff6a2a' : '#3b2a24'), 'matte', { s: [1, 0.85, 1] });
  const trailGeo = merge([
    glowPiece(new THREE.SphereGeometry(0.42, 16, 10), '#ff7a2f', 1, { p: [0, -0.12, 0] }),
    glowPiece(new THREE.CylinderGeometry(0.06, 0.45, 3.2, 16, 1, true), '#ffb35a', 1, { p: [0, 1.6, 0] }),
  ]);
  const pool = (geo, mat, n) => { const m = new THREE.InstancedMesh(geo, mat, n); m.count = 0; m.frustumCulled = false; group.add(m); return m; };
  const rings = pool(ringGeo, props.glowMaterial, 10), discs = pool(discGeo, props.glowMaterial, 10), meteors = pool(meteorGeo, props.material, 10), trails = pool(trailGeo, props.glowMaterial, 10);
  const vhs = pool(props.geo.vhs, props.material, 2);
  const trees = pool(kit.treeGeo, kit.treeMat, 3); trees.castShadow = true;
  /* receiveShadow disamakan dengan prop/pohon yang sudah ada → varian shader yang SAMA (sudah dikompilasi saat memuat).
     Tanpa ini, meteor/kaset terbang/pohon pertama memicu kompilasi shader di tengah permainan = tersendat. */
  meteors.receiveShadow = vhs.receiveShadow = trees.receiveShadow = true;
  const disposables = [ringGeo, discGeo, meteorGeo, trailGeo];
  const live = [rings, discs, meteors, trails, vhs, trees];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
  const put = (m, i, x, y, z, sc = 1, ry = 0, rx = 0, sy = sc) => { q.setFromEuler(e.set(rx, ry, 0)); m.setMatrixAt(i, m4.compose(v.set(x, y, z), q, s.set(sc, sy, sc))); };

  const ground = (x, z) => { let h = null; for (const t of world.terrains) if (!t.off && t.query(x, z, Q) && Q.rho <= 1 && (h == null || Q.h > h)) h = Q.h; return h; };
  const islandAt = (x, z) => world.terrains.find((t) => !t.off && t.query(x, z, Q) && Q.rho <= 1) || null;
  let cool = 0;
  const knock = (ux, uz, speed, lift) => {
    if (cool > 0) return false;
    const l = Math.hypot(ux, uz) || 1;
    body.vel.x = ux / l * speed; body.vel.z = uz / l * speed; body.vel.y = lift;
    body.grounded = false; body.ground = null; cool = 0.5;
    return true;
  };

  /* pohon: collider silinder yang "dimatikan" lewat owner.off saat tidak dipakai */
  const treeSlots = [0, 1, 2].map(() => { const owner = { off: true }, cyl = { x: 0, z: 0, r: 0.34, y0: 0, y1: 0, owner }; world.cyls.push(cyl); return { owner, cyl, t: -1, x: 0, y: 0, z: 0, ry: 0 }; });

  /* ——— keadaan ——— */
  let st;
  function fresh() {
    return {
      idle: 0, fired: {}, boltT: 0, tilt: 0, timeScale: 1, camSpin: 0, camTurn: 0, cramp: 0, run: 0, magnet: 0,
      lag: 0, latch: null, fog: 0, stickCool: 0, flat: null, mirror: 0, doom: 0, meteorT: 0, strikes: [], flying: [], wasDrag: false, onCart: null, flipIn: -1,
      timers: { tree: range(CHAOS.tree), shove: range(CHAOS.shove), tape: range(CHAOS.tape), lag: range(CHAOS.lag), fog: range(CHAOS.fog), mirror: range(CHAOS.mirror), doom: range(CHAOS.doomFirst) },
    };
  }
  st = fresh();

  function clear() {
    treeSlots.forEach((t) => { t.t = -1; t.owner.off = true; });
    if (fog) { fog.near = fog0.near; fog.far = fog0.far; }
    ['cermin', 'kiamat', 'fast', 'glitch'].forEach((c) => cls && cls(c, false));
    rings.count = discs.count = meteors.count = trails.count = vhs.count = trees.count = 0;
  }

  /* ——— gepeng: ditimpa meteor → pipih ke tanah, tertahan CHAOS.flatTime detik, lalu bangkit memantul ———
     Skala tidak ditulis ke karakter langsung (animator menimpanya tiap frame); animator membaca flatScale. */
  const flatScale = { x: 1, y: 1, on: false };
  function gepeng() {
    st.flat = { t: 0, pin: body.pos.clone(), last: -1 };
    body.vel.set(0, 0, 0);
    flash && flash('GEPENG!'); sfx && sfx.squash();
    burst && burst('#d9c7a8', body.pos.x, body.pos.y + 0.1, body.pos.z, 26, 4.5);
  }
  const elastic = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -9 * t) * Math.cos(t * 13));
  function updateFlat(dt) {
    const f = st.flat;
    if (!f) { flatScale.on = false; return; }
    f.t += dt;
    const T = CHAOS.flatTime, DOWN = 0.16, UP = 0.75;
    let y;
    if (f.t < DOWN) { const k = f.t / DOWN; y = 1 - 0.93 * k * k; }                        // jatuh pipih (dipercepat)
    else if (f.t < DOWN + 0.35) { const k = (f.t - DOWN) / 0.35; y = 0.07 + 0.05 * Math.sin(k * Math.PI * 3) * (1 - k); }   // memantul kecil
    else if (f.t < T) { y = 0.07 + 0.008 * Math.sin(f.t * 5); }                               // tergeletak, bernapas pelan
    else { const k = (f.t - T) / UP; y = 0.07 + 0.93 * elastic(k); }                       // bangkit memantul
    flatScale.on = true; flatScale.y = Math.max(0.05, y); flatScale.x = Math.min(1.9, 1 / Math.sqrt(flatScale.y)) ;
    if (f.t < T) {
      body.pos.copy(f.pin); body.vel.set(0, 0, 0);
      const left = Math.ceil(T - f.t);
      if (left !== f.last && f.t > 0.6) { f.last = left; flash && flash('GEPENG · ' + left); }
    } else if (f.last !== 0) { f.last = 0; body.vel.y = 5.5; body.grounded = false; body.ground = null; sfx && sfx.launch(); }
    if (f.t >= T + UP) { st.flat = null; flatScale.on = false; }
  }

  /* ——— kejadian (satu fungsi per fitur; dipanggil pemicu atau force) ——— */
  const MAX_STRIKES = 10;          // = kapasitas pool cincin/meteor; lebih dari ini dibuang (bukan melebihi buffer)
  const strike = (x, z, warn, r, kind) => { if (st.strikes.length >= MAX_STRIKES) return; const h = ground(x, z); if (h == null) return; st.strikes.push({ x, z, y: h, t: -warn, warn, r, kind }); };
  const yawFwd = () => [Math.sin(player.state.yaw), Math.cos(player.state.yaw)];
  const F = {
    'stopwatch-ngebut'() { st.timeScale = 2; cls && cls('fast', true); flash && flash('STOPWATCH NGEBUT'); },
    'pulau-miring'() { st.tilt = 0.001; flash && flash('PULAUNYA MIRING'); },
    'kamera-bosan'() { st.camTurn = Math.PI; },
    'kaset-pindah'() {
      let best = null, bd = 100;
      for (const t of props.tapes) if (t.alive) { const d = Math.hypot(t.x - body.pos.x, t.z - body.pos.z); if (d < bd) { bd = d; best = t; } }
      if (!best || bd > 10) return;
      const isl = islandAt(best.x, best.z); if (!isl) return;
      for (let k = 0; k < 12; k++) {
        const a = rnd() * TAU, r = isl.outline(a) * (0.35 + 0.4 * rnd()), x = isl.pos.x + Math.cos(a) * r, z = isl.pos.z + Math.sin(a) * r, h = ground(x, z);
        if (h != null) { burst && burst('#ffd77a', best.x, best.y, best.z, 12, 3); best.x = x; best.z = z; best.y = h + 1.15; flash && flash('KASETNYA PINDAH'); return; }
      }
    },
    petir() { strike(body.pos.x, body.pos.z, CHAOS.boltWarn, CHAOS.boltR, 'petir'); sfx && sfx.warn('petir'); },
    kepeleset() { const [fx, fz] = yawFwd(); body.vel.y = 2.4; body.vel.x = fx * 8.5; body.vel.z = fz * 8.5; flash && flash('KEPELESET'); },
    pantul() { const a = rnd() * TAU; body.vel.y = 9; body.vel.x += Math.cos(a) * 3; body.vel.z += Math.sin(a) * 3; body.grounded = false; body.ground = null; flash && flash('BOING'); },
    'kaset-meledak'(t) {
      const tx = t ? t.x : body.pos.x + 0.1, tz = t ? t.z : body.pos.z;
      cool = 0; knock(body.pos.x - tx || 1, body.pos.z - tz, 7, 7);
      burst && burst('#ffb03d', body.pos.x, body.pos.y + 0.8, body.pos.z, 26, 6); sfx && sfx.boom(); flash && flash('KASETNYA MELEDAK');
    },
    'magnet-jurang'() { st.magnet = 0.001; },
    'kamera-nyangkut'() { st.camSpin = 1.6; flash && flash('KAMERA NYANGKUT'); },
    'troli-kesurupan'() {
      const c = props.carts.find((c) => body.ground === c.box) || props.carts[0]; if (!c) return;
      const tm = props.time; c.phase = -2 * tm / c.period - c.phase; flash && flash('TROLI KESURUPAN'); sfx && sfx.warn('troli');
    },
    kram() { st.cramp = CHAOS.crampTime; flash && flash('KRAM'); },
    'pohon-nongol'() {
      const [fx, fz] = yawFwd(), x = body.pos.x + fx * 2.3, z = body.pos.z + fz * 2.3, h = ground(x, z);
      const slot = treeSlots.find((t) => t.t < 0) || treeSlots[0];
      if (h == null) return;
      Object.assign(slot, { t: 0, x, y: h, z, ry: rnd() * TAU });
      Object.assign(slot.cyl, { x, z, y0: h - 0.5, y1: h + 3.2 }); slot.owner.off = false;
      burst && burst('#7a5a3a', x, h + 0.2, z, 14, 3); sfx && sfx.crumble(false);
    },
    digeser() {
      const [fx, fz] = yawFwd(), sgn = rnd() < 0.5 ? -1 : 1;
      body.pos.x += fz * 1.7 * sgn; body.pos.z += -fx * 1.7 * sgn;
      cls && cls('glitch', true); setTimeout(() => cls && cls('glitch', false), 320); sfx && sfx.static();
    },
    'kaset-terbang'() {
      const a = rnd() * TAU, d = 18, sx = body.pos.x + Math.cos(a) * d, sz = body.pos.z + Math.sin(a) * d, sy = body.pos.y + 1 + rnd() * 1.5;
      const lead = d / CHAOS.tapeSpeed, tx = body.pos.x + body.vel.x * lead * 0.6, tz = body.pos.z + body.vel.z * lead * 0.6, ty = body.pos.y + 0.9;
      const l = Math.hypot(tx - sx, ty - sy, tz - sz);
      if (st.flying.length >= 2) st.flying.shift();
      st.flying.push({ x: sx, y: sy, z: sz, vx: (tx - sx) / l * CHAOS.tapeSpeed, vy: (ty - sy) / l * CHAOS.tapeSpeed, vz: (tz - sz) / l * CHAOS.tapeSpeed, t: 0 });
      sfx && sfx.whistle();
    },
    lag() { st.lag = CHAOS.lagTime; st.latch = { x: input.state.x, y: input.state.y, jump: input.state.jump }; },
    kabut() { st.fog = CHAOS.fogTime; flash && flash('KABUT'); },
    cermin() { st.mirror = CHAOS.mirrorTime; cls && cls('cermin', true); },
    gepeng() { gepeng(); },
    kiamat() { st.doom = CHAOS.doomTime; st.meteorT = 0; cls && cls('kiamat', true); flash && flash('KIAMAT'); sfx && sfx.boom(); },
    'gravitasi-ringan'() { kit.edan && kit.edan.forceEvent('ringan'); },
  };

  function updateIdle(dt) {
    const still = body.grounded && Math.hypot(body.vel.x, body.vel.z) < 0.3 && !input.state.x && !input.state.y && !input.state.jump;
    if (!still) {
      if (st.idle > 0) { st.idle = 0; st.fired = {}; st.tilt = 0; if (st.timeScale !== 1) { st.timeScale = 1; cls && cls('fast', false); } }
      return;
    }
    st.idle += dt;
    const once = (id, at) => { if (st.idle > at && !st.fired[id]) { st.fired[id] = 1; F[id](); } };
    once('pulau-miring', CHAOS.idleTilt); once('stopwatch-ngebut', CHAOS.idleFast); once('kamera-bosan', CHAOS.idleCam); once('kaset-pindah', CHAOS.idleTape);
    if (st.idle > CHAOS.idleBolt) { st.boltT -= dt; if (st.boltT <= 0) { st.boltT = CHAOS.boltEvery; F.petir(); } }
    /* pulau miring: meluncur pelan ke tepi terdekat (posisi langsung — kecepatan pemain diredam oleh kontrol) */
    if (st.tilt > 0) {
      const isl = islandAt(body.pos.x, body.pos.z);
      if (isl) {
        st.tilt = Math.min(CHAOS.tiltMax, st.tilt + dt * 1.6);
        let dx = body.pos.x - isl.pos.x, dz = body.pos.z - isl.pos.z; if (Math.hypot(dx, dz) < 0.3) { dx = 1; dz = 0; }
        const l = Math.hypot(dx, dz); body.pos.x += dx / l * st.tilt * dt; body.pos.z += dz / l * st.tilt * dt;
      }
    }
  }

  function updateAction(dt) {
    /* magnet jurang: berdiri di tepi pulau → ditarik keluar pelan */
    const isl = body.grounded && body.ground && body.ground.query ? body.ground : null;
    if (isl && isl.query(body.pos.x, body.pos.z, Q) && Q.rho > CHAOS.magnetRho) {
      st.magnet += dt;
      if (st.magnet > 0.4) {
        if (!st.fired.magnet) { st.fired.magnet = 1; flash && flash('MAGNET JURANG'); }
        const dx = body.pos.x - isl.pos.x, dz = body.pos.z - isl.pos.z, l = Math.hypot(dx, dz) || 1;
        body.pos.x += dx / l * CHAOS.magnetPull * dt; body.pos.z += dz / l * CHAOS.magnetPull * dt;
      }
    } else { st.magnet = 0; st.fired.magnet = 0; }
    /* kamera nyangkut: tepat saat pemain mulai memutar kamera */
    const drag = cam.state.idle < 0.05;
    st.stickCool -= dt;
    if (drag && !st.wasDrag && st.stickCool <= 0 && st.camSpin <= 0 && rnd() < CHAOS.camStick) { st.stickCool = 12; F['kamera-nyangkut'](); }
    st.wasDrag = drag;
    /* troli kesurupan: setelah naik troli, kadang berbalik arah di tengah jalan */
    const cart = props.carts.find((c) => body.ground === c.box) || null;
    if (cart && cart !== st.onCart && rnd() < CHAOS.cartFlip) st.flipIn = 0.5 + rnd() * 0.8;
    st.onCart = cart || (body.grounded ? null : st.onCart);
    if (st.flipIn > 0) { st.flipIn -= dt; if (st.flipIn <= 0) F['troli-kesurupan'](); }
    /* kram: lari terus tanpa henti */
    if (input.state.x || input.state.y) { st.run += dt; if (st.run > CHAOS.crampAfter) { st.run = 0; if (rnd() < CHAOS.cramp) F.kram(); } } else st.run = 0;
  }

  function updateRandom(dt) {
    const T = st.timers;
    const tick = (id, key, cond = true) => { T[key] -= dt; if (T[key] <= 0 && cond) { T[key] = range(CHAOS[key]); F[id](); } };
    tick('pohon-nongol', 'tree', body.grounded && Math.hypot(body.vel.x, body.vel.z) > 2.5);
    tick('digeser', 'shove'); tick('kaset-terbang', 'tape'); tick('lag', 'lag'); tick('kabut', 'fog'); tick('cermin', 'mirror');
    tick('kiamat', 'doom', st.doom <= 0);
  }

  function updateTimed(dt) {
    cool -= dt;
    if (st.cramp > 0) st.cramp -= dt;
    if (st.lag > 0) { st.lag -= dt; if (st.lag <= 0) st.latch = null; }
    if (st.camTurn > 0) { const k = Math.min(st.camTurn, dt * 5.2); cam.state.yaw += k; cam.state.idle = 0; st.camTurn -= k; }
    if (st.camSpin > 0) { st.camSpin -= dt; cam.state.yaw += dt * 5; cam.state.idle = 0; }
    if (st.mirror > 0) { st.mirror -= dt; if (st.mirror <= 0) cls && cls('cermin', false); }
    if (fog) {
      if (st.fog > 0) st.fog -= dt;
      const k = st.fog > 0 ? Math.min(1, (CHAOS.fogTime - st.fog) / 0.6, st.fog / 0.8) : 0;
      fog.near = fog0.near + (1 - fog0.near) * k; fog.far = fog0.far + (15 - fog0.far) * k;
    }
    /* kiamat: hujan meteor, sebagian mengincar posisi pemain */
    if (st.doom > 0) {
      st.doom -= dt; st.meteorT -= dt;
      if (st.meteorT <= 0) {
        st.meteorT = CHAOS.meteorEvery;
        const aim = rnd() < 0.35, a = rnd() * TAU, r = aim ? 0 : 1.5 + rnd() * 5;
        strike(body.pos.x + body.vel.x * CHAOS.meteorWarn * (aim ? 1 : 0) + Math.cos(a) * r, body.pos.z + body.vel.z * CHAOS.meteorWarn * (aim ? 1 : 0) + Math.sin(a) * r, CHAOS.meteorWarn, CHAOS.meteorR, 'meteor');
      }
      if (st.doom <= 0) cls && cls('kiamat', false);
    }
    /* sambaran (petir & meteor) */
    let ri = 0, mi = 0;
    if (st.strikes.length) st.strikes = st.strikes.filter((k) => {
      k.t += dt;
      if (k.t < 0) {
        const p = 1 + k.t / k.warn;
        put(rings, ri, k.x, k.y + 0.06, k.z, k.r * (1.15 - 0.15 * p)); put(discs, ri++, k.x, k.y + 0.04, k.z, k.r * p);
        if (k.kind === 'meteor') { const my = k.y + 0.5 + 24 * -k.t / k.warn; put(meteors, mi, k.x, my, k.z, 1, k.t * 7); put(trails, mi++, k.x, my, k.z, 1); }
        return true;
      }
      const dx = body.pos.x - k.x, dz = body.pos.z - k.z;
      if (dx * dx + dz * dz < k.r * k.r && body.pos.y < k.y + 2 && !st.flat) {
        if (k.kind === 'meteor' && body.grounded) gepeng(); else { cool = 0; knock(dx || 1, dz, 8, 8); }
      }
      burst && burst(k.kind === 'meteor' ? '#ff8a3d' : '#bfe3ff', k.x, k.y + 0.3, k.z, 22, 6);
      sfx && (k.kind === 'meteor' ? sfx.boom() : sfx.zap());
      return false;
    });
    rings.count = discs.count = ri; meteors.count = trails.count = mi;
    /* kaset terbang */
    let fi = 0;
    if (st.flying.length) st.flying = st.flying.filter((f) => {
      f.t += dt; f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
      const dx = body.pos.x - f.x, dy = body.pos.y + 0.8 - f.y, dz = body.pos.z - f.z;
      if (dx * dx + dy * dy + dz * dz < 0.75 * 0.75) { cool = 0; knock(f.vx, f.vz, 9, 5); burst && burst('#ffd77a', f.x, f.y, f.z, 16, 4); sfx && sfx.boom(); return false; }
      if (f.t > 3.2) return false;
      put(vhs, fi++, f.x, f.y, f.z, 1.45, f.t * 9, 0.3);
      return true;
    });
    vhs.count = fi;
    /* pohon nongol: tumbuh cepat, menahan pemain, lalu mengecil lagi */
    let ti = 0;
    for (const t of treeSlots) {
      if (t.t < 0) continue;
      t.t += dt;
      const grow = Math.min(1, t.t / 0.15), shrink = Math.min(1, Math.max(0, (6.3 - t.t) / 0.3)), sc = grow * shrink;
      if (t.t < 0.5) { const dx = body.pos.x - t.x, dz = body.pos.z - t.z; if (dx * dx + dz * dz < 0.75 * 0.75 && body.pos.y < t.y + 3) { if (knock(dx || 1, dz, 6, 3)) flash && flash('NABRAK POHON'); } }
      if (t.t > 6.3) { t.t = -1; t.owner.off = true; continue; }
      put(trees, ti++, t.x, t.y - 0.05, t.z, 0.9 * Math.max(0.01, sc), t.ry);
    }
    trees.count = ti;
    for (let i = 0; i < live.length; i++) live[i].instanceMatrix.needsUpdate = true;
  }

  return {
    get active() { return active; },
    get timeScale() { return active ? st.timeScale : 1; },
    get frozen() { return active && st.lag > 0; },
    /* gepeng: pemain dipaku & tanpa kendali; animator membaca flatScale */
    get pinned() { return active && !!st.flat && st.flat.t < CHAOS.flatTime; },
    flatScale,
    reset(on) { active = !!on; clear(); st = fresh(); flatScale.on = false; group.visible = active; },
    update(dt) {
      if (!active) return;
      updateFlat(dt);
      if (st.flat && st.flat.t < CHAOS.flatTime) { updateTimed(dt); return; }   // sedang gepeng: tidak ada pemicu baru
      updateTimed(dt); updateIdle(dt); updateAction(dt); updateRandom(dt);
    },
    filterInput(inp) {
      if (!active) return;
      if (st.cramp > 0) { inp.x = 0; inp.y = 0; inp.jump = false; inp.jumpPressed = false; }
      if (st.latch) { inp.x = st.latch.x; inp.y = st.latch.y; inp.jump = st.latch.jump; inp.jumpPressed = false; }
    },
    /* pemicu dari luar */
    onJump(double) { if (active && !double && body.vel.y > 0 && rnd() < CHAOS.slip) F.kepeleset(); },
    onLand(impact) { if (active && impact > 3 && rnd() < CHAOS.bounce) F.pantul(); },
    onCollect(t) { if (active && rnd() < CHAOS.boom) F['kaset-meledak'](t); },
    force(id, arg) { if (F[id]) F[id](arg); },
    state: () => st,
    dispose() { disposables.forEach((d) => d.dispose()); },
  };
}
