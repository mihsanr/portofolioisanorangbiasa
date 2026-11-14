/* Alur permainan: judul → siap → berjalan → selesai.
   - Stopwatch baru berjalan saat pemain pertama kali bergerak, dan dihitung dari langkah fisika
     (bukan jam dinding), jadi tab yang dijeda tidak menambah waktu.
   - Jatuh ke lautan awan = muncul lagi di checkpoint terakhir + penalti 2 detik.
   - Saat stopwatch mulai, server membuka "run"; saat kaset terakhir terpungut, server mencatat selesainya.
     Skor yang dikirim harus cocok dengan selisih waktu yang dicatat server (lihat supabase/game.sql). */
const PENALTY = 2;
const MESSAGES = {
  'rate-limited': 'Terlalu banyak kiriman dari jaringan ini. Coba lagi nanti.',
  implausible: 'Waktu tidak cocok dengan catatan server (tab sempat dijeda lama?). Skor tidak dikirim.',
  'unknown-run': 'Sesi permainan tidak dikenali server. Main lagi untuk mengirim skor.',
  incomplete: 'Kaset belum lengkap.',
};

export function createFlow(stage, hud, board, sfx) {
  const local = board.local, total = stage.props.state.total;
  let state = 'title', t = 0, ms = 0, falls = 0, runId = null, runPromise = null, donePromise = null, sending = false, sent = false;

  const refresh = (mine) => board.top().then((rows) => hud.setBoard(rows, mine));

  function start() {
    sfx.unlock();
    stage.reset(); stage.controls = true;
    state = 'ready'; t = 0; ms = 0; falls = 0; runId = null; runPromise = null; donePromise = null; sending = false; sent = false;
    hud.setTime(0); hud.setTapes(0, total); hud.resultMsg('', false); hud.state('play');
  }

  function finish() {
    state = 'done'; stage.controls = false;
    ms = Math.round(t * 1000);
    donePromise = runPromise ? runPromise.then(() => (runId ? board.finish(runId) : false)) : null;
    const record = !local.best || ms < local.best;
    if (record) { local.best = ms; board.save(); }
    hud.setBest(local.best); hud.setTime(ms);
    sfx.finish();
    hud.showResult({ ms, record, name: local.name, online: board.online });
    hud.state('done');
    refresh();
    const mine = donePromise;
    Promise.resolve(mine).then((ok) => { if (!ok && state === 'done' && donePromise === mine) hud.resultOffline(); });
  }

  async function submit(raw) {
    if (sending || sent || state !== 'done') return;
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

  stage.events.onCollect = (n) => { hud.setTapes(n, total); sfx.collect(n); if (n >= total && state === 'run') finish(); };
  stage.events.onRespawn = () => { sfx.fall(); if (state === 'run') { t += PENALTY; falls++; hud.penalty(); } };
  stage.events.onJump = (double) => sfx.jump(double);
  stage.events.onLand = (impact) => sfx.land(impact);
  stage.events.onLaunch = () => sfx.launch();

  hud.on.start = start;
  hud.on.restart = () => { if (state === 'ready' || state === 'run') start(); };
  hud.on.submit = submit;
  hud.on.mute = () => { local.mute = !local.mute; board.save(); sfx.setMuted(local.mute); hud.setMute(local.mute); };

  stage.controls = false;
  hud.setBest(local.best); hud.setTapes(0, total); hud.setMute(local.mute); hud.setBoard(undefined);
  hud.state('title');
  refresh();

  return {
    start,
    get state() { return state; },
    get timeMs() { return Math.round(t * 1000); },
    update(dt) {
      if (state === 'title' || state === 'done') { stage.cam.state.yaw += dt * (state === 'title' ? 0.1 : 0.22); return; }
      if (state === 'ready') {
        const i = stage.input.state;
        if (i.x || i.y || i.jump) { state = 'run'; runPromise = board.start().then((id) => { runId = id; }); }
      }
      if (state === 'run') { t += dt; hud.setTime(t * 1000); }
    },
  };
}
