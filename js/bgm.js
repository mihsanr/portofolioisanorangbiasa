/* Background music player — text-only transport in the top bar.
   gain per track compensates the source loudness spread (-7.9 .. -17.8 LUFS),
   so switching tracks does not jump in volume. Order follows the file names. */
(() => {
  const TRACKS = [
    { name: 'BUKAN SANGKAKALA',       file: 'bukan-sangkakala',       gain: 0.63 },
    { name: 'DUNG DUNG TAK JRENG',    file: 'dung-dung-tak-jreng',    gain: 0.34 },
    { name: 'KAYA YOUTUBER LAMA',     file: 'kaya-youtuber-lama',     gain: 0.93 },
    { name: 'LAGU ANJAY',             file: 'lagu-anjay',             gain: 0.77 },
    { name: 'MAAP NGAGETIN LAGI',     file: 'maap-ngagetin-lagi',     gain: 0.32 },
    { name: 'MAAP NGAGETIN',          file: 'maap-ngagetin',          gain: 0.36 },
    { name: 'TET TET TET TET TET',    file: 'tet-tet-tet-tet-tet',    gain: 0.56 },
    { name: 'TUTITUT NING NING NING', file: 'tutitut-ning-ning-ning', gain: 1.00 },
    { name: 'UIA UIA UIA ASLI',       file: 'uia-uia-uia-asli',       gain: 0.62 },
    { name: 'WARKOPKAH',              file: 'warkopkah',              gain: 0.38 },
  ];
  const STEPS = 10;
  const ROOT = new URL('../', document.currentScript.src).href; // works from tools/ too
  const STORE = 'ihsan.bgm';

  const bar = document.getElementById('bgmBar');
  if (!bar) return;
  const titleEl = document.getElementById('bgmTitle');
  const muteBtn = document.getElementById('bgmMute');
  const meterEl = document.getElementById('bgmMeter');

  let idx = 0, level = 3, muted = false, started = false, ducked = false, hushed = false;

  try {
    const s = JSON.parse(localStorage.getItem(STORE) || '{}');
    if (Number.isInteger(s.idx) && TRACKS[s.idx]) idx = s.idx;
    if (Number.isInteger(s.level)) level = Math.max(0, Math.min(STEPS, s.level));
    muted = !!s.muted;
  } catch (e) { /* first visit */ }

  const save = () => {
    try { localStorage.setItem(STORE, JSON.stringify({ idx, level, muted })); } catch (e) { /* private mode */ }
  };

  const audio = new Audio();
  audio.preload = 'none';
  audio.id = 'bgmAudio';
  audio.hidden = true;
  document.body.appendChild(audio);
  audio.addEventListener('ended', () => go(1));

  // meter segments
  for (let i = 0; i < STEPS; i++) meterEl.appendChild(document.createElement('i'));
  const segs = [...meterEl.children];

  function applyVolume() {
    const t = TRACKS[idx];
    audio.volume = muted || hushed ? 0 : (level / STEPS) * t.gain * (ducked ? 0.25 : 1);
    segs.forEach((s, i) => s.classList.toggle('on', !muted && i < level));
    meterEl.setAttribute('aria-label', `Volume ${level * (100 / STEPS)}%`);
  }

  function load(play) {
    const t = TRACKS[idx];
    titleEl.textContent = t.name;
    audio.src = `${ROOT}assets/bgm/${t.file}.mp3`;
    applyVolume();
    if (play) audio.play().catch(() => {});
    save();
  }

  function go(dir) {
    idx = (idx + dir + TRACKS.length) % TRACKS.length;
    load(started);
  }

  function setMuted(v) {
    muted = v;
    muteBtn.textContent = muted ? 'UNMUTE' : 'MUTE';
    muteBtn.setAttribute('aria-pressed', String(muted));
    bar.classList.toggle('is-muted', muted);
    window.SFX_MUTED = muted;
    applyVolume();
    save();
  }

  function step(d) {
    level = Math.max(0, Math.min(STEPS, level + d));
    if (level > 0 && muted) setMuted(false);
    applyVolume();
    save();
  }

  document.getElementById('bgmPrev').addEventListener('click', () => go(-1));
  document.getElementById('bgmNext').addEventListener('click', () => go(1));
  document.getElementById('bgmUp').addEventListener('click', () => step(1));
  document.getElementById('bgmDown').addEventListener('click', () => step(-1));
  muteBtn.addEventListener('click', () => setMuted(!muted));

  /* duck under project videos so tapes stay audible */
  document.addEventListener('play', (e) => {
    if (e.target.tagName !== 'VIDEO') return;
    ducked = true; applyVolume();
  }, true);
  const undock = (e) => {
    if (e.target.tagName !== 'VIDEO') return;
    if ([...document.querySelectorAll('video')].some((v) => !v.paused && !v.ended)) return;
    ducked = false; applyVolume();
  };
  document.addEventListener('pause', undock, true);
  document.addEventListener('ended', undock, true);

  /* tools (metronome) silence the bed fully: dispatch 'bgm:hush' with detail true/false */
  addEventListener('bgm:hush', (e) => { hushed = !!e.detail; applyVolume(); });

  /* autoplay policy: first gesture starts the bed */
  function start() {
    if (started) return;
    started = true;
    audio.preload = 'auto';
    load(true);
  }
  addEventListener('pointerdown', start, { capture: true, once: true });
  addEventListener('keydown', start, { capture: true, once: true });

  setMuted(muted);
  titleEl.textContent = TRACKS[idx].name;
})();
