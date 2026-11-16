import * as THREE from 'three';
import { createAtlas } from '../gen/atlas.js';
import { createVhsGeometry, createVhsLiteGeometry, createVhsGlassGeometry, createPadGeometry, createSpringGeometry, createCartGeometry, createRailGeometry } from '../gen/props.js';
import { createGlowMaterial, createHaloMaterial } from '../shaders/glow.js';
import { withSurfaceNoise } from '../shaders/surface.js';

/* Sistem prop interaktif. Tiap jenis = satu InstancedMesh (semua salinan dalam 1 draw call):
   kaset (+kaca), jump pad (+glow), pegas (+glow), troli, rel, dan satu Points halo untuk semuanya.
   Daftarkan dulu dengan add*(), lalu build(). update() dipanggil tiap langkah fisika sebelum pemain. */
const LAUNCH = { pad: 16.5, spring: 24.5 };
const PICK_R2 = 1.05 * 1.05;
const TAPE_SCALE = 1.45;
const TAPE_RANGE2 = 60 * 60;      // kaset lebih jauh dari ini tidak digambar (masih punya halo sebagai penanda)
const TAPE_NEAR2 = 15 * 15;       // di dalam jarak ini: versi detail penuh + kaca; di luar: versi ringan
const GOLD = new THREE.Color('#ffc233'), BLUE = new THREE.Color('#3f8dff'), VIOLET = new THREE.Color('#b565ff');

export function createProps({ renderer, env, world, uTime, quality }) {
  const group = new THREE.Group();
  const atlas = createAtlas(renderer);
  const prop = withSurfaceNoise(new THREE.MeshStandardMaterial({
    map: atlas.map, roughnessMap: atlas.orm, metalnessMap: atlas.orm, roughness: 1, metalness: 1,
    vertexColors: true, envMap: env, envMapIntensity: 0.7,
  }), { fine: 170, coarse: 6, albedoFine: 0.04, albedoCoarse: 0.07, rough: 0.16 });
  const glass = new THREE.MeshStandardMaterial({ color: '#9db6cc', roughness: 0.06, metalness: 0, envMap: env, envMapIntensity: 1.3, transparent: true, opacity: 0.34, depthWrite: false });
  const glow = createGlowMaterial(uTime);
  const halo = createHaloMaterial(uTime);

  const tapes = [], pads = [], springs = [], carts = [], rails = [], extraHalos = [];
  const disposables = [atlas, prop, glass, glow, halo];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
  let vhs, vhsLite, vhsGlass, padMesh, padGlow, springMesh, springGlow, cartMesh, haloPts, haloPos, haloSize;
  let time = 0;
  const state = { collected: 0, total: 0 };

  const inst = (geo, mat, n, shadow) => {
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    mesh.castShadow = !!shadow; mesh.receiveShadow = mat === prop;
    mesh.frustumCulled = false;                    // instance bergerak; jumlahnya sedikit
    group.add(mesh); disposables.push(geo);
    return mesh;
  };
  const setAt = (mesh, i, x, y, z, ry = 0, sc = 1, rx = 0, sy = sc) => {
    q.setFromEuler(e.set(rx, ry, 0, 'YXZ'));
    mesh.setMatrixAt(i, m4.compose(v.set(x, y, z), q, s.set(sc, sy, sc)));
  };

  const api = {
    group, state, tapes, pads, springs, carts, material: prop, glassMaterial: glass, glowMaterial: glow, geo: {},
    /* sumber cahaya tambahan (mis. lampu menara) ikut dalam Points halo yang sama */
    addHalo(x, y, z, color, size = 2, k = 0.3) { extraHalos.push({ x, y, z, color: new THREE.Color(color), size, k }); },
    addCassette(x, y, z) { tapes.push({ x, y, z, phase: tapes.length * 1.7, alive: true, pop: -1, trap: false, cool: 0 }); },
    addPad(x, y, z, ry = 0) { pads.push({ x, y, z, ry, kick: 0, cool: 0, box: null }); },
    addSpring(x, y, z) { springs.push({ x, y, z, kick: 0, cool: 0, cyl: null }); },
    /* troli bolak-balik a -> b (sumbu X atau Z); period = detik satu putaran penuh */
    addCart(a, b, period = 7, phase = 0) { carts.push({ a, b, period, phase, box: null, pos: new THREE.Vector3(), ry: Math.abs(b[2] - a[2]) > Math.abs(b[0] - a[0]) ? Math.PI / 2 : 0 }); },

    build() {
      state.total = tapes.length;
      if (tapes.length) {
        api.geo.vhs = createVhsGeometry(); api.geo.glass = createVhsGlassGeometry();
        vhs = inst(api.geo.vhs, prop, tapes.length, true);
        vhsGlass = inst(api.geo.glass, glass, tapes.length, false);
        vhsLite = inst(createVhsLiteGeometry(), prop, tapes.length, false);
        vhsGlass.renderOrder = 2;
      }
      if (pads.length) {
        const g = createPadGeometry();
        padMesh = inst(g.body, prop, pads.length, false);
        padGlow = inst(g.glow, glow, pads.length, false);
        pads.forEach((p, i) => {
          const [w, h, d] = g.size;
          p.box = { min: [p.x - w / 2, p.y - 1, p.z - d / 2], max: [p.x + w / 2, p.y + h, p.z + d / 2] };
          world.boxes.push(p.box);
          setAt(padMesh, i, p.x, p.y, p.z, p.ry); setAt(padGlow, i, p.x, p.y, p.z, p.ry);
        });
      }
      if (springs.length) {
        const g = createSpringGeometry();
        springMesh = inst(g.body, prop, springs.length, false);
        springGlow = inst(g.glow, glow, springs.length, false);
        springs.forEach((p, i) => {
          p.cyl = { x: p.x, z: p.z, r: g.radius, y0: p.y - 1, y1: p.y + g.top };
          world.cyls.push(p.cyl);
          setAt(springMesh, i, p.x, p.y, p.z); setAt(springGlow, i, p.x, p.y, p.z);
        });
      }
      if (carts.length) {
        const g = createCartGeometry();
        cartMesh = inst(g.body, prop, carts.length, true);
        carts.forEach((c) => {
          const along = c.ry ? 2 : 0, hx = (c.ry ? g.size[2] : g.size[0]) / 2, hz = (c.ry ? g.size[0] : g.size[2]) / 2;
          c.half = [hx, hz]; c.thick = g.size[1];
          c.box = { min: [0, 0, 0], max: [0, 0, 0], delta: new THREE.Vector3() };
          world.boxes.push(c.box);
          /* rel kembar + bantalan sepanjang lintasan */
          const len = Math.abs(c.b[along] - c.a[along]) + g.size[0], mid = [(c.a[0] + c.b[0]) / 2, c.a[1] + g.railY, (c.a[2] + c.b[2]) / 2];
          for (const sz of [-1, 1]) rails.push({ p: [mid[0] + (c.ry ? sz * g.wheelZ : 0), mid[1], mid[2] + (c.ry ? 0 : sz * g.wheelZ)], s: c.ry ? [0.07, 0.09, len] : [len, 0.09, 0.07], tint: '#70747d' });
          const n = Math.max(2, Math.round(len / 1.3));
          for (let k = 0; k <= n; k++) {
            const t = k / n - 0.5;
            rails.push({ p: [mid[0] + (c.ry ? 0 : t * len), mid[1] - 0.09, mid[2] + (c.ry ? t * len : 0)], s: c.ry ? [1.8, 0.09, 0.2] : [0.2, 0.09, 1.8], tint: '#5a4a3a' });
          }
        });
        const railMesh = inst(createRailGeometry(), prop, rails.length, false);
        const col = new THREE.Color();
        rails.forEach((r, i) => { railMesh.setMatrixAt(i, m4.compose(v.set(r.p[0], r.p[1], r.p[2]), q.identity(), s.set(r.s[0], r.s[1], r.s[2]))); railMesh.setColorAt(i, col.set(r.tint)); });
        s.set(1, 1, 1);
      }
      /* halo: kaset (bergerak), lalu pad & pegas (diam) */
      const n = tapes.length + pads.length + springs.length + extraHalos.length;
      haloPos = new Float32Array(n * 3); haloSize = new Float32Array(n);
      const hc = new Float32Array(n * 3);
      const put = (i, c, k) => { hc[i * 3] = c.r * k; hc[i * 3 + 1] = c.g * k; hc[i * 3 + 2] = c.b * k; };
      tapes.forEach((t, i) => { put(i, GOLD, 0.26); haloSize[i] = 1.9; });
      pads.forEach((p, j) => { const i = tapes.length + j; put(i, BLUE, 0.2); haloSize[i] = 2.6; haloPos.set([p.x, p.y + 0.5, p.z], i * 3); });
      springs.forEach((p, j) => { const i = tapes.length + pads.length + j; put(i, VIOLET, 0.22); haloSize[i] = 2.8; haloPos.set([p.x, p.y + 0.9, p.z], i * 3); });
      extraHalos.forEach((h, j) => { const i = tapes.length + pads.length + springs.length + j; put(i, h.color, h.k); haloSize[i] = h.size; haloPos.set([h.x, h.y, h.z], i * 3); });
      const hg = new THREE.BufferGeometry();
      hg.setAttribute('position', new THREE.BufferAttribute(haloPos, 3).setUsage(THREE.DynamicDrawUsage));
      hg.setAttribute('color', new THREE.BufferAttribute(hc, 3));
      hg.setAttribute('aSize', new THREE.BufferAttribute(haloSize, 1).setUsage(THREE.DynamicDrawUsage));
      haloPts = new THREE.Points(hg, halo); haloPts.frustumCulled = false; haloPts.renderOrder = 3;
      group.add(haloPts); disposables.push(hg);
      const shadows = (p) => { const on = p.name === 'high'; if (vhs) vhs.castShadow = on; if (cartMesh) cartMesh.castShadow = on; };
      if (quality) { quality.onChange(shadows); shadows(quality.profile); }
      api.update(0, null, {});
      return api;
    },

    /* dipanggil tiap langkah fisika, SEBELUM pemain bergerak */
    update(dt, player, hooks) {
      time += dt;
      const body = player ? player.body : null;

      for (let i = 0; i < carts.length; i++) {
        const c = carts[i], k = 0.5 - 0.5 * Math.cos(((time / c.period) + c.phase) * Math.PI * 2);
        v.set(c.a[0] + (c.b[0] - c.a[0]) * k, c.a[1] + (c.b[1] - c.a[1]) * k, c.a[2] + (c.b[2] - c.a[2]) * k);
        c.box.delta.subVectors(v, c.pos); if (dt === 0) c.box.delta.set(0, 0, 0);
        c.pos.copy(v);
        c.box.min[0] = v.x - c.half[0]; c.box.max[0] = v.x + c.half[0];
        c.box.min[2] = v.z - c.half[1]; c.box.max[2] = v.z + c.half[1];
        c.box.min[1] = v.y - c.thick; c.box.max[1] = v.y;
        setAt(cartMesh, i, v.x, v.y, v.z, c.ry);
      }
      if (cartMesh) cartMesh.instanceMatrix.needsUpdate = true;

      for (let i = 0; i < pads.length; i++) {
        const p = pads[i];
        p.cool -= dt; p.kick = Math.max(0, p.kick - dt * 3.2);
        if (body && p.cool <= 0 && body.grounded && body.ground === p.box) {
          player.launch(LAUNCH.pad); p.cool = 0.25; p.kick = 1;
          hooks.onLaunch && hooks.onLaunch(p, BLUE);
        }
        const kk = p.kick * p.kick;
        setAt(padMesh, i, p.x, p.y, p.z, p.ry, 1 + 0.06 * kk, 0, 1 - 0.22 * Math.sin(p.kick * Math.PI) * p.kick);
        setAt(padGlow, i, p.x, p.y - 0.07 * Math.sin(p.kick * Math.PI) * p.kick, p.z, p.ry, 1 + 0.06 * kk, 0, 1);
      }
      if (padMesh) { padMesh.instanceMatrix.needsUpdate = true; padGlow.instanceMatrix.needsUpdate = true; }

      for (let i = 0; i < springs.length; i++) {
        const p = springs[i];
        p.cool -= dt; p.kick = Math.max(0, p.kick - dt * 2.6);
        if (body && p.cool <= 0 && body.grounded && body.ground === p.cyl) {
          player.launch(LAUNCH.spring); p.cool = 0.25; p.kick = 1;
          hooks.onLaunch && hooks.onLaunch(p, VIOLET);
        }
        setAt(springGlow, i, p.x, p.y, p.z, 0, 1 + 0.25 * p.kick, 0, 1 + 0.9 * p.kick);
      }
      if (springGlow) springGlow.instanceMatrix.needsUpdate = true;

      let drawn = 0, lite = 0;
      for (let i = 0; i < tapes.length; i++) {
        const t = tapes[i];
        let sc = TAPE_SCALE;
        const y = t.y + Math.sin(time * 2.1 + t.phase) * 0.12;
        if (t.alive && body) {
          const dx = body.pos.x - t.x, dy = body.pos.y + 0.8 - y, dz = body.pos.z - t.z;
          if (t.cool > 0) t.cool -= dt;
          else if (dx * dx + dy * dy * 0.6 + dz * dz < PICK_R2 && t.trap && hooks.onTrap) {
            t.trap = false; t.cool = 0.8; hooks.onTrap(t);            // kaset jebakan (mode EDAN)
          } else if (dx * dx + dy * dy * 0.6 + dz * dz < PICK_R2) {
            t.alive = false; t.pop = 0; state.collected++;
            hooks.onCollect && hooks.onCollect(t, state.collected, state.total);
          }
        }
        if (!t.alive) {
          if (t.pop < 0) sc = 0;
          else { t.pop += dt / 0.22; sc = t.pop >= 1 ? 0 : TAPE_SCALE * (1 + 0.6 * Math.sin(t.pop * Math.PI)) * (1 - t.pop * t.pop); if (t.pop >= 1) t.pop = -1; }
        }
        haloPos[i * 3] = t.x; haloPos[i * 3 + 1] = y; haloPos[i * 3 + 2] = t.z;
        haloSize[i] = t.alive ? 1.9 : 2.2 * sc;
        /* hanya kaset yang masih ada dan cukup dekat yang masuk daftar gambar (instance dipadatkan) */
        if (sc <= 0) continue;
        let e2 = 0;
        if (body) { const ex = body.pos.x - t.x, ey = body.pos.y - t.y, ez = body.pos.z - t.z; e2 = ex * ex + ey * ey + ez * ez; if (e2 > TAPE_RANGE2) continue; }
        const spin = time * 1.9 + t.phase + (t.alive ? 0 : 9 * Math.max(0, t.pop));
        if (e2 > TAPE_NEAR2) { setAt(vhsLite, lite++, t.x, y, t.z, spin, sc, 0.22); continue; }
        setAt(vhs, drawn, t.x, y, t.z, spin, sc, 0.22); setAt(vhsGlass, drawn, t.x, y, t.z, spin, sc, 0.22);
        drawn++;
      }
      if (vhs) {
        vhs.count = drawn; vhsGlass.count = drawn; vhsLite.count = lite;
        vhs.instanceMatrix.needsUpdate = true; vhsGlass.instanceMatrix.needsUpdate = true; vhsLite.instanceMatrix.needsUpdate = true;
      }
      if (haloPts) { haloPts.geometry.attributes.position.needsUpdate = true; haloPts.geometry.attributes.aSize.needsUpdate = true; }
    },
    setViewport(heightPx, fovDeg) { halo.uniforms.uScale.value = heightPx / (2 * Math.tan(fovDeg * Math.PI / 360)); },
    reset() { tapes.forEach((t) => { t.alive = true; t.pop = -1; t.cool = 0; }); state.collected = 0; },
    dispose() { disposables.forEach((d) => d.dispose()); },
  };
  return api;
}
