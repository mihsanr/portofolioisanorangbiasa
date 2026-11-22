// Main bareng (maks. 4 perangkat) lewat kode room 4 gambar. Koleksi huruf dihitung bersama.
// Yang dikirim hanya: posisi & arah pesawat, karakter pesawat, dan huruf yang diambil. Tanpa nama, tanpa chat.
import { makePlane, SKINS } from './models.js';
import { near } from './world.js';
import { joinRoom } from './rt.js';

export const PICS = ['🐘', '🍌', '⭐', '🚗', '🌈', '🐟', '🍎', '🌙', '🎈', '🐱', '🌻', '⚽'];   // 12⁴ = 20.736 room
export const ALPHA = 'ABCDEFGHIJKL';
const MAX = 4;
export const validCode = c => /^[A-L]{4}$/.test(c || '');
export const codePics = c => [...c].map(ch => PICS[ALPHA.indexOf(ch)]);
export const randomCode = () => Array.from(crypto.getRandomValues(new Uint8Array(4)), v => ALPHA[v % 12]).join('');
const skinOf = k => (SKINS[k] ? k : 'classic'), num = v => (Number.isFinite(v) ? v : 0);

// cb: onStatus(s), onRoster(mates, masuk, keluar), onTake(ch, mate), onSync(), onRound(), onFull()
export function createCoop({ scene, flight, getSkin, validCh, cb }) {
  const st = flight.state, id = Array.from(crypto.getRandomValues(new Uint8Array(6)), v => v.toString(36).padStart(2, '0')).join('');
  let room = null, code = '', got = new Set(), round = 0, mates = new Map(), early = null, wait = 0, last = null, idle = 0;
  const left = new Set();      // sudah pamit (server kadang telat mencabutnya dari daftar)
  const avatars = new Map();   // id → {plane, x, y, z, yaw, pitch, roll, v, at}

  function drop(k) { const a = avatars.get(k); if (a) { scene.remove(a.plane.root); a.plane.parts.forEach(m => m.geometry.dispose()); avatars.delete(k); } }
  function peers(roster) {
    const list = [...roster].filter(([k]) => k !== id && !left.has(k)).sort((a, b) => (a[0] < b[0] ? -1 : 1));
    if (early && early.size >= MAX) { leave(); cb.onFull(); return; }   // room penuh saat kita datang
    const before = mates;
    mates = new Map(list.slice(0, MAX - 1).map(([k, m]) => [k, { id: k, skin: skinOf(m.k), old: !!early?.has(k) }]));
    for (const [k, a] of avatars) if (!mates.has(k) || a.skin !== mates.get(k).skin) drop(k);
    const join = [...mates.values()].filter(m => !before.has(m.id)), gone = [...before.values()].filter(m => !mates.has(m.id));
    if (join.length) hello();                                    // kirim koleksi bersama ke yang baru masuk
    cb.onRoster([...mates.values()], join, gone);
  }
  const hello = () => room?.send('h', { i: id, n: round, g: [...got] });
  function merge(m) {
    const n = num(m.n), g = (Array.isArray(m.g) ? m.g : []).filter(validCh);
    if (n < round) return hello();                               // dia tertinggal babak: beri tahu
    let more = n > round;
    if (more) { round = n; got = new Set(); }
    for (const c of g) if (!got.has(c)) { got.add(c); more = true; }
    if (more) cb.onSync();
  }
  function join(c) {
    leave(); left.clear(); code = c; got = new Set(); round = 0; early = null; mates = new Map(); last = null;
    room = joinRoom('sky:' + c, id, { k: getSkin() });
    room.on('state', r => { early ||= new Set([...r.keys()].filter(k => k !== id)); })   // siapa yang sudah ada saat pertama masuk
      .on('status', s => cb.onStatus(s)).on('peers', peers)
      .on('h', m => m.i !== id && merge(m))
      .on('x', m => { if (!mates.has(m.i)) return; left.add(m.i); const gone = mates.get(m.i); mates.delete(m.i); drop(m.i); cb.onRoster([...mates.values()], [], [gone]); })
      .on('g', m => { if (!mates.has(m.i) || !validCh(m.c) || num(m.n) !== round || got.has(m.c)) return; got.add(m.c); cb.onTake(m.c, mates.get(m.i)); })
      .on('n', m => { if (mates.has(m.i) && num(m.n) > round) { round = num(m.n); got = new Set(); cb.onRound(); } })
      .on('p', m => {
        if (!mates.has(m.i) || !Array.isArray(m.d) || m.d.length < 8) return;
        const [x, y, z, yaw, pitch, roll, v, c] = m.d.map(num);
        let a = avatars.get(m.i);
        if (!a) {
          const skin = mates.get(m.i).skin, plane = makePlane(skin);
          plane.visual.traverse(o => { o.castShadow = false; }); plane.root.visible = false; scene.add(plane.root);
          avatars.set(m.i, a = { plane, skin, fresh: true });
        }
        Object.assign(a, { x, y, z, yaw, pitch, roll, v, crashed: !!c, at: performance.now() });
      });
  }
  function leave() {
    if (!room) return;
    const r = room; r.send('x', { i: id }); room = null; r.leave(); [...avatars.keys()].forEach(drop); mates = new Map(); code = ''; got = new Set();
    cb.onRoster([], [], []);
  }

  return {
    id, join, leave, avatars,
    get on() { return !!room; }, get code() { return code; }, get got() { return got; }, get status() { return room?.status || 'offline'; }, get mates() { return [...mates.values()]; },
    get slot() { const all = [id, ...mates.keys()].sort(); return all.indexOf(id) - (all.length - 1) / 2; },   // tempat mulai berjajar, tidak bertumpuk
    get lead() { return [id, ...mates.keys()].sort()[0] === id; },
    skin() { room?.meta({ k: getSkin() }); },
    take(ch) { if (room && !got.has(ch)) { got.add(ch); room.send('g', { i: id, n: round, c: ch }); } },
    nextRound() { if (!room) return; round++; got = new Set(); room.send('n', { i: id, n: round }); cb.onRound(); },
    update(dt, playing) {
      if (!room) return;
      // Kirim hanya saat ada teman: lurus ±2x/detik, bermanuver ±6x/detik (hemat kuota).
      if (playing && mates.size && (wait -= dt) <= 0) {
        const R = v => Math.round(v * 100) / 100;
        const d = [R(st.pos.x), R(st.pos.y), R(st.pos.z), R(Math.atan2(Math.sin(st.yaw), Math.cos(st.yaw))), R(st.pitch), R(st.roll), R(st.speed), flight.crashed ? 1 : 0];
        const turn = !last || Math.abs(d[3] - last[3]) > 0.03 || Math.abs(d[4] - last[4]) > 0.03 || Math.abs(d[6] - last[6]) > 0.5 || d[7] !== last[7];
        idle += 0.16; wait = 0.16;
        if (turn || idle >= 0.48) { room.send('p', { i: id, d }); last = d; idle = 0; }
      }
      const now = performance.now(), k = 1 - Math.exp(-7 * dt);
      for (const a of avatars.values()) {
        const age = Math.min(0.8, (now - a.at) / 1000 + 0.04), r = a.plane.root, vis = a.plane.visual, c = a.crashed ? 0 : a.v * Math.cos(a.pitch) * age;
        const yaw = a.yaw + Math.sin(a.roll) * 0.9 * Math.min(age, 0.4);   // jalur melengkung selama miring
        const tx = near(a.x - Math.sin(yaw) * c, st.pos.x), ty = a.y + (a.crashed ? 0 : a.v * Math.sin(a.pitch) * age), tz = near(a.z - Math.cos(yaw) * c, st.pos.z);
        if (a.fresh || Math.abs(tx - r.position.x) + Math.abs(tz - r.position.z) > 60) { r.position.set(tx, ty, tz); r.rotation.y = yaw; a.fresh = false; }
        r.position.x += (tx - r.position.x) * k; r.position.y += (ty - r.position.y) * k; r.position.z += (tz - r.position.z) * k;
        r.rotation.y += Math.atan2(Math.sin(yaw - r.rotation.y), Math.cos(yaw - r.rotation.y)) * k;
        vis.rotation.x += (a.pitch - vis.rotation.x) * k;
        if (a.crashed) vis.rotation.z += dt * 5; else vis.rotation.z += Math.atan2(Math.sin(a.roll - vis.rotation.z), Math.cos(a.roll - vis.rotation.z)) * k;
        a.plane.prop.rotation.z += dt * (a.crashed ? 4 : 45);
        a.stale = now - a.at > 6000;                               // diam lama (jeda / sinyal putus)
        r.visible = !a.stale && Math.hypot(r.position.x - st.pos.x, r.position.z - st.pos.z) < 420;
      }
    },
  };
}
