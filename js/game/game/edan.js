import { EDAN } from './modes.js';
import { MOVE } from './player.js';

/* Jebakan mode EDAN. Semuanya diundi ulang setiap run dimulai (reset), lalu dijalankan tiap langkah fisika
   SEBELUM prop dan pemain (update). Tidak ada yang menyentuh server.
   - Nasib: hanya EDAN.WIN_CHANCE run yang bisa dimenangkan. Di run yang kalah undian, kaset terakhir selalu
     kabur menjauh saat didekati, lalu pulang lagi ke tempatnya — terus begitu. Pemain tidak diberi tahu.
   - Pulau rapuh: tiap pulau kecil punya peluang runtuh beberapa saat setelah diinjak, lalu muncul lagi.
   - Gangguan berkala (satu per satu, ada tanda singkat di HUD sebelum mulai):
       angin (dorongan mendatar saat di udara), kontrol terbalik, gempa (pemain terpental kecil saat berpijak),
       gravitasi berat (lompatan lebih pendek).
   - Jump pad / pegas melenceng: kadang lontaran diberi dorongan mendatar ke arah acak.
   - Lompat ganda macet: kadang lompatan kedua tidak keluar.
   - Kaset jebakan: sentuhan pertama melontarkan pemain, baru sentuhan berikutnya terpungut.
   - Jatuh: beberapa kaset yang terakhir dipungut kembali ke tempatnya, lalu layar "hilang sinyal" sesaat
     (kontrol mati, stopwatch tetap jalan). */
const KINDS = ['angin', 'terbalik', 'gempa', 'berat'];

export function createEdan(stage, { onEvent, onCrumble, onTrap, onLost, onJam, onQuake, onBlackout } = {}) {
  const { player, props } = stage;
  const tapes = props.tapes, body = player.body;
  const small = Object.values(stage.islands).filter((i) => i.radius < 4 && i.root);
  const base = { gravityUp: MOVE.gravityUp, gravityDown: MOVE.gravityDown };
  let rnd = Math.random, active = false, winnable = true;
  let crumbles = [], ev = null, evIn = 0, lastKind = null, flee = null, taken = [], quakeIn = 0, blackout = 0;

  const range = (a, b) => a + (b - a) * rnd();
  const kick = (speed) => { const a = rnd() * Math.PI * 2; body.vel.x += Math.cos(a) * speed; body.vel.z += Math.sin(a) * speed; };

  function restoreIsland(c) { c.isl.off = false; c.isl.root.position.copy(c.isl.pos); c.state = 'idle'; c.t = 0; }
  function endEvent() {
    MOVE.gravityUp = base.gravityUp; MOVE.gravityDown = base.gravityDown;
    ev = null; evIn = range(EDAN.EVENT_EVERY[0], EDAN.EVENT_EVERY[1]);
    onEvent && onEvent(null);
  }

  function reset(on, forced) {
    if (ev) endEvent();
    active = on;
    crumbles.forEach(restoreIsland);
    tapes.forEach((t) => { if (t.home) { t.x = t.home.x; t.y = t.home.y; t.z = t.home.z; } else t.home = { x: t.x, y: t.y, z: t.z }; t.trap = false; });
    crumbles = []; flee = null; taken = []; blackout = 0; lastKind = null;
    if (!on) return;
    winnable = forced ? forced === 'menang' : rnd() < EDAN.WIN_CHANCE;
    crumbles = small.filter(() => rnd() < EDAN.CRUMBLE_CHANCE).map((isl) => ({ isl, state: 'idle', t: 0 }));
    evIn = range(EDAN.EVENT_EVERY[0], EDAN.EVENT_EVERY[1]);
    const pool = tapes.map((t, i) => i);
    for (let k = 0; k < EDAN.TRAP_TAPES && pool.length; k++) tapes[pool.splice(Math.floor(rnd() * pool.length), 1)[0]].trap = true;
  }

  function updateCrumbles(dt) {
    for (const c of crumbles) {
      const root = c.isl.root;
      if (c.state === 'idle') {
        if (body.grounded && body.ground === c.isl) { c.t += dt; if (c.t > EDAN.CRUMBLE_WAIT) { c.state = 'shake'; c.t = 0; onCrumble && onCrumble(false); } }
        else c.t = 0;
      } else if (c.state === 'shake') {
        c.t += dt;
        const k = c.t / EDAN.CRUMBLE_SHAKE;
        root.position.set(c.isl.pos.x + (rnd() - 0.5) * 0.18 * k, c.isl.pos.y - 0.05 * k, c.isl.pos.z + (rnd() - 0.5) * 0.18 * k);
        if (c.t > EDAN.CRUMBLE_SHAKE) { c.state = 'gone'; c.t = 0; c.isl.off = true; onCrumble && onCrumble(true); }
      } else if (c.state === 'gone') {
        c.t += dt;
        root.position.set(c.isl.pos.x, c.isl.pos.y - 4.9 * c.t * c.t, c.isl.pos.z);
        if (c.t > EDAN.CRUMBLE_GONE) restoreIsland(c);
      }
    }
  }

  /* gangguan berkala: diumumkan dulu (t < 0), lalu berlaku selama durasinya; jenis yang sama tidak dua kali berturut-turut */
  function updateEvent(dt) {
    if (!ev) {
      evIn -= dt;
      if (evIn > 0) return;
      const kinds = KINDS.filter((k) => k !== lastKind), kind = kinds[Math.floor(rnd() * kinds.length)], a = rnd() * Math.PI * 2;
      ev = { kind, dx: Math.cos(a), dz: Math.sin(a), angle: a, t: -EDAN.EVENT_WARN, dur: EDAN.EVENT_TIME[kind] };
      lastKind = kind; quakeIn = 0;
      onEvent && onEvent(ev);
      return;
    }
    const was = ev.t;
    ev.t += dt;
    if (ev.t <= 0) return;
    if (ev.kind === 'angin' && !body.grounded) { body.vel.x += ev.dx * EDAN.GUST_FORCE * dt; body.vel.z += ev.dz * EDAN.GUST_FORCE * dt; }
    if (ev.kind === 'berat' && was <= 0) { MOVE.gravityUp = base.gravityUp * EDAN.HEAVY; MOVE.gravityDown = base.gravityDown * EDAN.HEAVY; }
    if (ev.kind === 'gempa') {
      quakeIn -= dt;
      if (quakeIn <= 0) {
        quakeIn = range(0.45, 0.8);
        if (body.grounded) { body.vel.y = EDAN.QUAKE_HOP; body.grounded = false; body.ground = null; kick(range(1.5, 3)); }
        onQuake && onQuake();
      }
    }
    if (ev.t > ev.dur) endEvent();
  }

  /* nasib: kaset terakhir kabur. Naik dan menjauh ke luar jangkauan, menunggu, lalu pulang ke tempatnya.
     Selama kabur kaset tidak bisa dipungut (cool), jadi menyentuhnya tepat saat mulai kabur pun tidak cukup. */
  function updateFlee(dt) {
    if (winnable) return;
    const left = tapes.filter((t) => t.alive);
    if (left.length !== 1) { if (flee) { flee.tape.cool = 0; flee = null; } return; }
    const t = left[0], h = t.home;
    if (!flee) {
      const dx = t.x - body.pos.x, dz = t.z - body.pos.z, dy = t.y - (body.pos.y + 0.8);
      if (dx * dx + dz * dz + dy * dy < EDAN.FLEE_R * EDAN.FLEE_R) {
        const a = Math.atan2(dz, dx) + range(-0.5, 0.5);
        flee = { tape: t, t: 0, to: { x: h.x + Math.cos(a) * 11, y: h.y + 7, z: h.z + Math.sin(a) * 11 } };
        t.cool = 1e9;
      }
      return;
    }
    flee.t += dt;
    const ease = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
    const out = ease(flee.t / 0.45), back = ease((flee.t - 4.5) / 1.6), k = out * (1 - back);
    t.x = h.x + (flee.to.x - h.x) * k; t.y = h.y + (flee.to.y - h.y) * k; t.z = h.z + (flee.to.z - h.z) * k;
    if (flee.t > 6.1) { t.x = h.x; t.y = h.y; t.z = h.z; t.cool = 0.4; flee = null; }
  }

  return {
    reset,
    get active() { return active; },
    get winnable() { return winnable; },
    get event() { return ev; },
    get blackout() { return blackout > 0; },
    crumbles: () => crumbles,
    update(dt) {
      if (!active) return;
      if (blackout > 0) { blackout -= dt; if (blackout <= 0) onBlackout && onBlackout(false); }
      updateCrumbles(dt); updateEvent(dt); updateFlee(dt);
    },
    /* dipanggil level setelah membaca input: kontrol terbalik */
    filterInput(inp) { if (active && ev && ev.kind === 'terbalik' && ev.t > 0) { inp.x = -inp.x; inp.y = -inp.y; } },
    /* dipanggil pemain sebelum lompat ganda: false = macet */
    canDouble() { if (active && rnd() < EDAN.JAM_CHANCE) { onJam && onJam(); return false; } return true; },
    /* dipanggil prop saat menyentuh kaset jebakan (kaset belum terpungut) */
    trap(t) { body.vel.y = 13.5; body.grounded = false; body.ground = null; kick(range(7, 9)); onTrap && onTrap(t); },
    collected(t) { if (active) taken.push(t); },
    launched() { if (active && rnd() < EDAN.STRAY_CHANCE) kick(range(EDAN.STRAY_KICK[0], EDAN.STRAY_KICK[1])); },
    /* jatuh: kaset yang terakhir dipungut kembali ke tempatnya, lalu hilang sinyal sesaat */
    fell() {
      if (!active) return 0;
      let n = 0;
      while (n < EDAN.LOSE_ON_FALL && taken.length) { const t = taken.pop(); t.alive = true; t.pop = -1; t.x = t.home.x; t.y = t.home.y; t.z = t.home.z; n++; }
      props.state.collected -= n;
      if (flee) { flee.tape.cool = 0; flee = null; }
      if (n) onLost && onLost(n);
      blackout = EDAN.BLACKOUT; onBlackout && onBlackout(true);
      return n;
    },
  };
}
