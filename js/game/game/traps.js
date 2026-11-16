import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { merge } from '../gen/build.js';
import { piece, glowPiece } from '../gen/props.js';

/* Rintangan TETAP dan BERPOLA di dekat setiap kaset (hanya mode EDAN).
   Beda dengan edan.js yang acak: di sini semuanya deterministik — posisi, jenis, dan ritme selalu sama,
   jadi bisa dihafal. Ritme diatur supaya pemain yang datang di saat sembarang lolos ±70% (TRAP.target),
   sedangkan pemain yang membaca polanya bisa lolos terus.

   Tiga jenis, dipilih otomatis dari letak kaset:
   - DURI   : pelat berduri di bawah kaset. Duri bergetar sebentar (tanda), lalu mencuat beberapa saat.
   - PALANG : palang dua lengan berputar di bawah kaset (setinggi lutut — harus dilompati), atau
              di udara mengelilingi kaset yang melayang (di atas jump pad / pegas / troli).
   - SEMBURAN: kawah di bawah kaset. Mendesis (tanda), lalu menyembur dan melontarkan pemain tinggi.
   Kena = pemain terpental menjauh; di pulau kecil itu biasanya berarti jatuh. */
export const TRAP = {
  target: 0.7,
  spikes: { period: 2.6, warn: 0.45, up: 0.8, radius: 1.3, kick: 6, lift: 9 },
  sweep: { period: 3.4, arm: 2.25, armAir: 1.7, height: 0.55, kick: 9.5, lift: 5.5 },
  /* palang udara: porosnya digeser ke samping kaset dan sedikit di bawahnya, jadi lengannya menyapu jalur
     lontaran (pad / pegas / lompatan) hanya sebagian waktu */
  air: { period: 1.6, offset: 0.8, below: 1.45, gap: 1.2, cartPeriod: 2.6 },
  geyser: { period: 3.0, warn: 0.6, on: 0.5, radius: 0.95, lift: 17.5, kick: 5.5 },
};

const HALF = Math.PI / 2, TAU = Math.PI * 2;
const AIR_T = 1.8;            // palang udara lebih tebal (tampilan dan area kena sama-sama diskalakan)
const Q = { rho: 0, h: 0, d: 0, o: 0, nx: 0, nz: 0 };

/* ——— geometri (bahan atlas yang sama dengan pad/pegas → satu gaya, sedikit draw call) ——— */
function spikeBaseGeometry(R) {
  const P = [], G = [];
  P.push(piece(new THREE.CylinderGeometry(R, R + 0.08, 0.14, 40), '#2b2d35', 'matte', { p: [0, 0.07, 0], ao: (x, y) => 0.7 + 0.3 * Math.min(1, y / 0.1) }));
  P.push(piece(new THREE.CylinderGeometry(R - 0.12, R - 0.1, 0.03, 40), '#7c8189', 'steel', { p: [0, 0.155, 0] }));
  const ring = new THREE.TorusGeometry(R - 0.05, 0.035, 8, 48); ring.rotateX(HALF);
  P.push(piece(ring, '#ff3b2f', 'gloss', { p: [0, 0.16, 0] }));
  for (let k = 0; k < 13; k++) {                                   // lubang tempat duri keluar
    const a = k < 6 ? (k / 6) * TAU : ((k - 6) / 7) * TAU + 0.3, r = k < 6 ? 0.45 : 0.92;
    P.push(piece(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 14), '#14151a', 'matte', { p: [Math.cos(a) * r, 0.172, Math.sin(a) * r] }));
  }
  const glow = new THREE.TorusGeometry(R - 0.05, 0.02, 6, 48); glow.rotateX(HALF);
  G.push(glowPiece(glow, '#ff4a3d', 1, { p: [0, 0.2, 0] }));
  return { body: merge(P), glow: merge(G) };
}
function spikesGeometry() {
  const prof = [];
  for (let i = 0; i <= 6; i++) { const t = i / 6; prof.push(new THREE.Vector2(0.085 * Math.pow(1 - t, 0.85) + 0.004, t * 0.55)); }
  const P = [];
  for (let k = 0; k < 13; k++) {
    const a = k < 6 ? (k / 6) * TAU : ((k - 6) / 7) * TAU + 0.3, r = k < 6 ? 0.45 : 0.92;
    P.push(piece(new THREE.LatheGeometry(prof, 10), (x, y) => (y > 0.36 ? '#ff4a3d' : '#c9cdd5'), 'metal', { p: [Math.cos(a) * r, 0, Math.sin(a) * r] }));
  }
  return merge(P);
}
function barGeometry(arm) {
  const L = arm * 2, P = [], G = [];
  P.push(piece(new RoundedBoxGeometry(L, 0.2, 0.24, 2, 0.07), '#ffffff', { rect: 'hazard', map: (x, y) => [(x / L + 0.5) * L * 0.9, y / 0.2 + 0.5] }));
  for (const s of [-1, 1]) {
    P.push(piece(new THREE.SphereGeometry(0.17, 16, 10), '#ff3b2f', 'gloss', { p: [s * arm, 0, 0] }));
    G.push(glowPiece(new THREE.SphereGeometry(0.075, 12, 8), '#ff5a3d', 1, { p: [s * (arm + 0.12), 0, 0] }));
  }
  P.push(piece(new THREE.CylinderGeometry(0.27, 0.27, 0.3, 28), '#2b2d35', 'matte'));
  P.push(piece(new THREE.CylinderGeometry(0.2, 0.2, 0.32, 28), '#a3a8b0', 'steel'));
  G.push(glowPiece(new THREE.CylinderGeometry(0.13, 0.13, 0.34, 20), '#ff4a3d', 1));
  return { body: merge(P), glow: merge(G) };
}
function pillarGeometry() {
  return merge([
    piece(new THREE.CylinderGeometry(0.12, 0.15, 1, 18), '#7c8189', 'steel', { p: [0, 0.5, 0] }),
    piece(new THREE.CylinderGeometry(0.34, 0.42, 0.12, 28), '#2b2d35', 'matte', { p: [0, 0.06, 0] }),
  ]);
}
function ventGeometry(R) {
  const prof = [[R + 0.25, 0], [R + 0.18, 0.18], [R + 0.02, 0.26], [R - 0.12, 0.22], [R - 0.2, 0.04], [0.0, 0.02]].map(([x, y]) => new THREE.Vector2(x, y));
  const P = [piece(new THREE.LatheGeometry(prof, 36), (x, y) => (y > 0.2 ? '#4a4d57' : '#2a2c33'), 'matte', { ao: (x, y) => 0.6 + 0.4 * Math.min(1, y / 0.2) })];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU;
    P.push(piece(new RoundedBoxGeometry(0.16, 0.1, 0.3, 1, 0.03), '#8c909a', 'metal', { p: [Math.cos(a) * (R + 0.12), 0.24, Math.sin(a) * (R + 0.12)], r: [0, -a, 0] }));
  }
  const G = [glowPiece(new THREE.CircleGeometry(R - 0.18, 32).rotateX(-HALF), '#ff7a2f', 1, { p: [0, 0.05, 0] })];
  return { body: merge(P), glow: merge(G) };
}
/* kolom uap: dua tabung terbuka bersarang, terang di bawah dan memudar ke atas (dipakai dengan bahan aditif) */
function columnGeometry() {
  const parts = [[0.62, 0.36, 1], [0.4, 0.22, 0.75]].map(([r0, r1, k]) => {
    const g = new THREE.CylinderGeometry(r1, r0, 1, 20, 6, true); g.translate(0, 0.5, 0); g.deleteAttribute('uv');
    const n = g.attributes.position.count, c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const f = Math.pow(1 - g.attributes.position.getY(i), 1.6) * k; c.set([0.62 * f, 0.24 * f, 0.07 * f], i * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return g;
  });
  return merge(parts);
}

/* fase 0..1 dalam siklus, dengan geseran tetap per kaset supaya pulau yang sama tidak serempak */
const phase = (time, period, off) => { const t = (time / period + off) % 1; return t < 0 ? t + 1 : t; };

export function createTraps({ props, world, scene }) {
  const group = new THREE.Group(); group.visible = false; scene.add(group);
  const list = [], disposables = [];
  const groundUnder = (x, y, z) => {
    let best = null;
    for (const t of world.terrains) if (t.query(x, z, Q) && Q.rho <= 1 && Q.h <= y + 0.1 && (!best || Q.h > best)) best = Q.h;
    return best;
  };

  /* pilih jenis untuk tiap kaset: kaset melayang (> 2 m di atas tanah / tanpa tanah) = palang udara */
  let k = 0;
  props.tapes.forEach((t, i) => {
    const g = groundUnder(t.x, t.y, t.z), up = g == null ? Infinity : t.y - g;
    /* kaset di atas jalur troli: satu palang di sisi rel, setinggi dada pemain yang menumpang */
    const cart = props.carts.find((c) => Math.hypot((c.a[0] + c.b[0]) / 2 - t.x, (c.a[2] + c.b[2]) / 2 - t.z) < 1);
    if (cart) {
      const a = Math.atan2(cart.b[2] - cart.a[2], cart.b[0] - cart.a[0]) + Math.PI / 2, o = TRAP.sweep.armAir + 0.13;
      list.push({ kind: 'air', tape: t, x: t.x + Math.cos(a) * o, y: t.y - 0.35, z: t.z + Math.sin(a) * o, off: (i * 0.37) % 1, dir: 1, ang: a, period: TRAP.air.cartPeriod, thin: true });
      return;
    }
    if (up > 2.2) {
      const a = i * 2.39, o = TRAP.air.offset;
      list.push({ kind: 'air', tape: t, x: t.x + Math.cos(a) * o, y: t.y - TRAP.air.below, z: t.z + Math.sin(a) * o, off: (i * 0.37) % 1, dir: i % 2 ? 1 : -1, ang: a });
      /* palang kedua, lebih rendah, di sisi seberang dan berputar berlawanan: dua lapis yang harus dilewati */
      list.push({ kind: 'air', tape: t, x: t.x - Math.cos(a) * o, y: t.y - TRAP.air.below - TRAP.air.gap, z: t.z - Math.sin(a) * o, off: (i * 0.37 + 0.5) % 1, dir: i % 2 ? -1 : 1, ang: a + Math.PI });
      return;
    }
    const kind = ['spikes', 'sweep', 'geyser'][k++ % 3];
    list.push({ kind, tape: t, x: t.x, y: g, z: t.z, off: (i * 0.37) % 1, dir: i % 2 ? 1 : -1, ang: i * 2.39 });
  });

  const steam = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true });
  disposables.push(steam);
  const inst = (geo, mat, n) => { const m = new THREE.InstancedMesh(geo, mat, Math.max(1, n)); m.count = n; m.frustumCulled = false; group.add(m); disposables.push(geo); return m; };
  const of = (kind) => list.filter((h) => h.kind === kind);
  const S = of('spikes'), W = of('sweep').concat(of('air')), G = of('geyser');
  const sb = spikeBaseGeometry(TRAP.spikes.radius), bar = barGeometry(TRAP.sweep.arm), barAir = barGeometry(TRAP.sweep.armAir), vent = ventGeometry(TRAP.geyser.radius);
  const mesh = {
    spikeBase: inst(sb.body, props.material, S.length), spikeGlow: inst(sb.glow, props.glowMaterial, S.length), spikes: inst(spikesGeometry(), props.material, S.length),
    bar: inst(bar.body, props.material, of('sweep').length), barGlow: inst(bar.glow, props.glowMaterial, of('sweep').length),
    barAir: inst(barAir.body, props.material, of('air').length), barAirGlow: inst(barAir.glow, props.glowMaterial, of('air').length),
    pillar: inst(pillarGeometry(), props.material, of('sweep').length),
    vent: inst(vent.body, props.material, G.length), ventGlow: inst(vent.glow, props.glowMaterial, G.length), column: inst(columnGeometry(), steam, G.length),
  };
  for (const m of Object.values(mesh)) if (m.material === props.material) m.receiveShadow = true;   // varian shader = prop lain
  const moving = [mesh.spikes, mesh.column, mesh.bar, mesh.barGlow, mesh.barAir, mesh.barAirGlow];
  const ST = { danger: false, warn: false, angle: 0, h: 0 };      // dipakai ulang tiap langkah (tanpa sampah memori)

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
  const set = (m, i, x, y, z, ry = 0, sx = 1, sy = 1, sz = 1) => { q.setFromEuler(e.set(0, ry, 0)); m.setMatrixAt(i, m4.compose(v.set(x, y, z), q, s.set(sx, sy, sz))); };

  /* bagian diam dipasang sekali */
  S.forEach((h, i) => { set(mesh.spikeBase, i, h.x, h.y - 0.02, h.z, h.ang); set(mesh.spikeGlow, i, h.x, h.y - 0.02, h.z, h.ang); });
  of('sweep').forEach((h, i) => { set(mesh.pillar, i, h.x, h.y, h.z, 0, 1, TRAP.sweep.height, 1); });
  G.forEach((h, i) => { set(mesh.vent, i, h.x, h.y - 0.03, h.z, h.ang); set(mesh.ventGlow, i, h.x, h.y - 0.03, h.z, h.ang); });
  Object.values(mesh).forEach((m) => { m.instanceMatrix.needsUpdate = true; });

  let time = 0, enabled = false, cool = 0;
  const api = {
    group, list,
    get enabled() { return enabled; },
    set enabled(on) { enabled = !!on; group.visible = enabled; },
    reset() { time = 0; cool = 0; },
    get time() { return time; }, set time(v) { time = v; },     // untuk alat uji
    /* keadaan tiap rintangan pada waktu ini (dipakai juga oleh alat uji): { danger, warn, angle, h } */
    stateOf(h, at = time, out = { danger: false, warn: false, angle: 0, h: 0 }) {
      if (h.kind === 'spikes') {
        const c = TRAP.spikes, p = phase(at, c.period, h.off) * c.period;
        const warn = p < c.warn, up = p >= c.warn && p < c.warn + c.up;
        out.danger = up; out.warn = warn; out.angle = 0;
        out.h = up ? Math.min(1, (p - c.warn) / 0.08) * Math.min(1, (c.warn + c.up - p) / 0.12) : warn ? 0.18 * Math.abs(Math.sin(p * 60)) : 0;
        return out;
      }
      if (h.kind === 'geyser') {
        const c = TRAP.geyser, p = phase(at, c.period, h.off) * c.period;
        const warn = p < c.warn, on = p >= c.warn && p < c.warn + c.on;
        out.danger = on; out.warn = warn; out.angle = 0;
        out.h = on ? Math.min(1, (p - c.warn) / 0.12) * Math.min(1, (c.warn + c.on - p) / 0.25) : 0;
        return out;
      }
      out.danger = true; out.warn = false; out.h = 0;
      out.angle = h.dir * phase(at, h.period || (h.kind === 'air' ? TRAP.air.period : TRAP.sweep.period), h.off) * TAU;
      return out;
    },
    update(dt, player, hooks) {
      if (!enabled) return;
      time += dt; cool -= dt;
      const b = player.body, px = b.pos.x, py = b.pos.y, pz = b.pos.z;
      let si = 0, wi = 0, ai = 0, gi = 0, hit = null;
      for (const h of list) {
        const st = api.stateOf(h, time, ST);
        const dx = px - h.x, dz = pz - h.z;
        if (h.kind === 'spikes') {
          set(mesh.spikes, si++, h.x, h.y - 0.42 + st.h * 0.56, h.z, h.ang);
          if (st.danger && st.h > 0.4 && dx * dx + dz * dz < TRAP.spikes.radius ** 2 && py < h.y + 0.55) hit = hit || { h, ux: dx, uz: dz, lift: TRAP.spikes.lift, kick: TRAP.spikes.kick };
        } else if (h.kind === 'geyser') {
          if (st.danger && st.h > 0.5 && hooks && hooks.onSpray && (h.spray = (h.spray || 0) - dt) <= 0) { h.spray = 0.09; hooks.onSpray(h); }
          set(mesh.column, gi++, h.x, h.y + 0.05, h.z, time * 3, 1 + st.h * 0.2, st.warn ? 0.35 + 0.2 * Math.abs(Math.sin(time * 40)) : st.h * 6 + 0.0001, 1 + st.h * 0.2);
          if (st.danger && st.h > 0.3 && dx * dx + dz * dz < TRAP.geyser.radius ** 2 && py < h.y + 3) hit = hit || { h, ux: dx || Math.cos(h.ang), uz: dz || Math.sin(h.ang), lift: TRAP.geyser.lift, kick: TRAP.geyser.kick };
        } else {
          const air = h.kind === 'air', arm = air ? TRAP.sweep.armAir : TRAP.sweep.arm;
          const by = air ? h.y : h.y + TRAP.sweep.height;
          const tk = air && !h.thin ? AIR_T : 1;
          if (air) { set(mesh.barAir, ai, h.x, by, h.z, -st.angle, 1, tk, tk); set(mesh.barAirGlow, ai++, h.x, by, h.z, -st.angle, 1, tk, tk); }
          else { set(mesh.bar, wi, h.x, by, h.z, -st.angle); set(mesh.barGlow, wi++, h.x, by, h.z, -st.angle); }
          /* jarak mendatar pemain ke garis palang (dua lengan sepanjang arm) + cek tinggi badan */
          const cx = Math.cos(st.angle), cz = Math.sin(st.angle), along = dx * cx + dz * cz, across = -dx * cz + dz * cx;
          const half = 0.11 * tk;
          if (Math.abs(along) < arm + 0.17 && Math.abs(across) < half + b.radius && by + half > py && by - half < py + b.height) {
            /* dorong searah gerak palang di sisi pemain */
            const sgn = h.dir * Math.sign(along || 1);
            hit = hit || { h, ux: -cz * sgn, uz: cx * sgn, lift: TRAP.sweep.lift, kick: TRAP.sweep.kick };
          }
        }
      }
      for (let i = 0; i < moving.length; i++) moving[i].instanceMatrix.needsUpdate = true;
      if (hit && cool <= 0) {
        cool = 0.6;
        const l = Math.hypot(hit.ux, hit.uz) || 1;
        b.vel.x = hit.ux / l * hit.kick; b.vel.z = hit.uz / l * hit.kick; b.vel.y = hit.lift;
        b.grounded = false; b.ground = null;
        hooks && hooks.onHit && hooks.onHit(hit.h);
      }
      return hit;
    },
    dispose() { disposables.forEach((d) => d.dispose()); },
  };
  return api;
}
