/* Alur permainan: judul → siap → berjalan → selesai.
   - Stopwatch baru berjalan saat pemain pertama kali bergerak, dan dihitung dari langkah fisika
     (bukan jam dinding), jadi tab yang dijeda tidak menambah waktu.
   - Jatuh ke lautan awan = muncul lagi di checkpoint terakhir + penalti 2 detik (NORMAL).
     Mode EDAN: tanpa checkpoint, +5 detik, jebakan acak (edan.js), rekor hanya di perangkat.
   - Saat stopwatch mulai, server membuka "run"; saat kaset terakhir terpungut, server mencatat selesainya.
     Skor yang dikirim harus cocok dengan selisih waktu yang dicatat server (lihat supabase/game.sql). */
import { MOVE } from './player.js';
import { modeOf } from './modes.js';
import { createEdan } from './edan.js';

const MESSAGES = {
  'rate-limited': 'Terlalu banyak kiriman dari jaringan ini. Coba lagi nanti.',
  implausible: 'Waktu tidak cocok dengan catatan server (tab sempat dijeda lama?). Skor tidak dikirim.',
  'unknown-run': 'Sesi permainan tidak dikenali server. Main lagi untuk mengirim skor.',
  incomplete: 'Kaset belum lengkap.',
};

export function createFlow(stage, hud, board, sfx) {
  const local = board.local, total = stage.props.state.total;
  let state = 'title', t = 0, ms = 0, falls = 0, runId = null, runPromise = null, donePromise = null, sending = false, sent = false;
  let mode = modeOf(local.mode), lostTotal = 0;
  /* ?debug&nasib=menang|kalah memaksa hasil undian (hanya untuk menguji) */
  const q = new URLSearchParams(location.search), forced = q.has('debug') ? q.get('nasib') : null;
  const edan = createEdan(stage, {
    onEvent: (ev) => { hud.event(ev, stage.cam.state.yaw); if (ev) sfx.warn(ev.kind); },
    onQuake: () => { hud.shake(); sfx.crumble(false); },
    onJam: () => { hud.jam(); sfx.jam(); },
    onBlackout: (on) => { hud.blackout(on); if (on) sfx.static(); },
    onCrumble: (gone) => sfx.crumble(gone),
    onTrap: () => sfx.trap(),
    onLost: (n) => { hud.setTapes(stage.props.state.collected, total); hud.lost(n); },
  });
  stage.hazards = edan;
  const bestOf = (m) => (m.id === 'edan' ? local.bestEdan : local.best) || 0;

  function setMode(id) {
    if (state !== 'title' && state !== 'done') return;
    mode = modeOf(id); local.mode = mode.id; board.save();
    hud.setMode(mode); hud.setBest(bestOf(mode));
  }

  const refresh = (mine) => board.top().then((rows) => hud.setBoard(rows, mine));

  function start() {
    sfx.unlock();
    MOVE.coyote = mode.coyote; MOVE.buffer = mode.buffer; stage.checkpoints = mode.checkpoints;
    stage.traps.enabled = mode.hazards;
    stage.reset(); edan.reset(mode.hazards, forced); stage.controls = true;
    state = 'ready'; t = 0; ms = 0; falls = 0; runId = null; runPromise = null; donePromise = null; sending = false; sent = false;
    lostTotal = 0;
    hud.setMode(mode); hud.setFalls(0); hud.event(null); hud.blackout(false);
    hud.setTime(0); hud.setTapes(0, total); hud.resultMsg('', false); hud.state('play');
  }

  function finish() {
    state = 'done'; stage.controls = false;
    ms = Math.round(t * 1000);
    donePromise = runPromise ? runPromise.then(() => (runId ? board.finish(runId) : false)) : null;
    const key = mode.id === 'edan' ? 'bestEdan' : 'best';
    const record = !local[key] || ms < local[key];
    if (record) { local[key] = ms; board.save(); }
    edan.reset(false); hud.event(null); hud.blackout(false);
    hud.setBest(local[key]); hud.setTime(ms);
    sfx.finish();
    hud.showResult({ ms, record, name: local.name, online: board.online && mode.online, mode, falls, lostM: Math.round(lostTotal) });
    hud.state('done');
    refresh();
    if (!mode.online) return;
    const mine = donePromise;
    Promise.resolve(mine).then((ok) => { if (!ok && state === 'done' && donePromise === mine) hud.resultOffline(); });
  }

  async function submit(raw) {
    if (sending || sent || state !== 'done' || !mode.online) return;
    const name = String(raw || '').toUpperCase().replace(/[^A-Z0-9 _.-]/g, '').trim().slice(0, 12);
    if (!name) return hud.resultMsg('Isi nama dulu (huruf dan angka, maksimal 12).');
    sending = true; hud.resultMsg('Mengirim…');
    const ok = donePromise ? await donePromise : false;
    if (!runId || !ok) { sending = false; return hud.resultMsg('NO SIGNAL — skor hanya tersimpan di perangkat ini.'); }
    local.name = name; board.save();
    const r = await board.submit(runId, name, ms, total, falls);
    sending = false;
    if (r.rank) { sent = true; hud.resultMsg('Masuk papan skor — peringkat #' + r.rank + '.', true); refresh(ms); }
    else hud.resultMsg(MESSAGES[r.error] || 'NO SIGNAL — coba kirim lagi sebentar lagi.');
  }

  stage.events.onCollect = (n, tot, tape) => { edan.collected(tape); hud.setTapes(n, total); sfx.collect(n); if (n >= total && state === 'run') finish(); };
  stage.events.onRespawn = () => {
    sfx.fall();
    if (state !== 'run') return;
    t += mode.penalty; falls++; hud.penalty(mode.penalty); hud.setFalls(falls);
    if (!mode.hazards) return;
    /* seberapa jauh pemain terlempar: dari pijakan aman terakhir ke titik muncul (Rumah) */
    const a = stage.lastSafe, b = stage.player.body.pos;
    lostTotal += Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    edan.fell();
  };
  stage.events.onJump = (double) => sfx.jump(double);
  stage.events.onLand = (impact) => sfx.land(impact);
  stage.events.onTrapHit = () => sfx.trap();
  stage.events.onLaunch = () => { edan.launched(); sfx.launch(); };

  hud.on.start = start;
  hud.on.mode = setMode;
  hud.on.restart = () => { if (state === 'ready' || state === 'run') start(); };
  hud.on.submit = submit;
  hud.on.mute = () => { local.mute = !local.mute; board.save(); sfx.setMuted(local.mute); hud.setMute(local.mute); };

  stage.controls = false;
  hud.setMode(mode); hud.setBest(bestOf(mode)); hud.setTapes(0, total); hud.setMute(local.mute); hud.setBoard(undefined);
  hud.state('title');
  refresh();

  return {
    start, setMode,
    get state() { return state; },
    get mode() { return mode.id; },
    get falls() { return falls; },
    edan,
    get timeMs() { return Math.round(t * 1000); },
    update(dt) {
      if (state === 'title' || state === 'done') { stage.cam.state.yaw += dt * (state === 'title' ? 0.1 : 0.22); return; }
      if (state === 'ready') {
        const i = stage.input.state;
        if (i.x || i.y || i.jump) { state = 'run'; if (mode.online) runPromise = board.start().then((id) => { runId = id; }); }
      }
      if (state === 'run') { t += dt; hud.setTime(t * 1000); }
    },
  };
}
