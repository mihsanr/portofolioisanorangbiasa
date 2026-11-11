/* SFX engine — one unique sound per interaction type, all clips < 6s.
   Audio stays muted until the first user gesture (browser autoplay policy). */
(() => {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // assets sit next to js/, so pages in subfolders (tools/) resolve them too
  const ROOT = new URL('../', document.currentScript.src).href;

  // the hover files are level-matched, so they all share this one volume
  // (file peak ≈ −6.5 dBFS × 0.02 → ≈ −40 dBFS effective)
  const HOVER_VOLUME = 0.02;

  /* Click / close sounds: the files were mastered at very different levels
     (0 dB … −14 dB peak), so one shared volume made some of them ~32 dB louder
     than a hover. Every click now lands on the same effective peak instead:
     volume = 10^((CLICK_PEAK_DB − filePeak) / 20). Tune the one constant
     (−22 … −30) to make all clicks louder / softer together.
     File peaks measured with `ffmpeg -af volumedetect` (max_volume). */
  const CLICK_PEAK_DB = -26;
  const FILE_PEAK_DB = {
    'click-player': 0.0, 'click-cv': 0.0, 'click-doc': -0.3,
    'close-profile': -1.4, 'close-modal': -1.2, 'click-row': -1.6,
    'click-footer': -2.8, 'click-card': -3.9,
    'click-contact': -14.0, 'click-nav': -12.5,
  };
  const clickVol = (n) => Math.min(1, Math.pow(10, (CLICK_PEAK_DB - FILE_PEAK_DB[n]) / 20));

  // name -> volume
  const SOUNDS = {
    'hover-nav': HOVER_VOLUME, 'hover-row': HOVER_VOLUME, 'hover-card': HOVER_VOLUME,
    'hover-journey': HOVER_VOLUME, 'hover-cv': HOVER_VOLUME, 'hover-contact': HOVER_VOLUME,
    'hover-skill': HOVER_VOLUME, 'hover-footer': HOVER_VOLUME, 'hover-player': HOVER_VOLUME,
    'channel-switch': 0.16, // file peak −18 dB → ≈ −34 dBFS, already gentle
  };
  Object.keys(FILE_PEAK_DB).forEach((n) => { SOUNDS[n] = clickVol(n); });

  // one master gain over every sound (0…1); the MUTE button silences all (SFX_MUTED)
  if (typeof window.SFX_MASTER !== 'number') window.SFX_MASTER = 1;

  const cache = {};
  let unlocked = false;
  // ?v= busts the browser cache when the sound files are replaced
  const get = (n) => cache[n] || (cache[n] = Object.assign(new Audio(`${ROOT}assets/sfx/${n}.mp3?v=2`), { preload: 'auto' }));

  const last = {};
  function play(n, force) {
    if ((!unlocked && !force) || reduceMotion || window.SFX_MUTED || !(n in SOUNDS)) return;
    const now = performance.now();
    if (last[n] && now - last[n] < 140) return;
    last[n] = now;
    const a = get(n);
    try {
      a.currentTime = 0;
      a.volume = Math.max(0, Math.min(1, SOUNDS[n] * window.SFX_MASTER));
      a.play().catch(() => {});
    } catch (e) { /* ignore */ }
  }
  window.SFX = play;
  window.SFX_LEVELS = SOUNDS; // read-only peek for QA

  /* arriving through a CRT page transition (theme.js sets the flag from `pagereveal`):
     try the channel-switch zap. Browsers that require a fresh gesture simply refuse it. */
  if (window.VT_ARRIVED) play('channel-switch', true);
  else addEventListener('vt:arrive', () => play('channel-switch', true), { once: true });

  function unlock() {
    if (unlocked) return;
    unlocked = true;
    Object.keys(SOUNDS).forEach(get); // warm the cache
  }
  addEventListener('pointerdown', unlock, { capture: true });
  addEventListener('keydown', unlock, { capture: true });

  // [selector, hoverSound, clickSound] — first match wins, most specific first
  const MAP = [
    ['.bgm-btn', 'hover-player', 'click-player'],
    ['.viewer-nav button, .viewer-copy', 'hover-player', 'click-player'],
    ['.tv-tape', null, 'click-row'],
    ['.showreel-list, .wall-down, .hero-btn', 'hover-nav', 'click-nav'],
    ['.calc-btn, .calc-chip', 'hover-player', 'click-player'],
    ['.face-card', 'hover-card', 'click-card'],
    ['.project-row-head', 'hover-row', 'click-row'],
    ['.waitlist-btn:not([aria-disabled="true"])', 'hover-row', 'click-row'],
    ['.next-up-link', 'hover-nav', 'click-nav'],
    ['.tv-doc', null, 'click-doc'],
    ['.cv-btn', 'hover-cv', 'click-cv'],
    ['.contact-btn', 'hover-contact', 'click-contact'],
    ['.skill-tag', 'hover-skill', null],
    ['.journey-entry', 'hover-journey', null],
    ['.site-nav a', 'hover-nav', 'click-nav'],
    ['.site-footer a', 'hover-footer', 'click-footer'],
  ];

  function match(target) {
    if (!target || !target.closest) return null;
    for (const [sel, hov, clk] of MAP) {
      const el = target.closest(sel);
      if (el) return { el, sel, hov, clk };
    }
    return null;
  }

  document.addEventListener('pointerover', (e) => {
    const m = match(e.target);
    if (!m || !m.hov) return;
    // only when actually entering the element (not moving within it)
    if (e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest(m.sel) === m.el) return;
    play(m.hov);
  }, { passive: true });

  // capture: match against the element's state before page handlers change it
  document.addEventListener('click', (e) => {
    const m = match(e.target);
    if (m && m.clk) play(m.clk);
  }, true);

  // modal closes (✕ button, backdrop, or Esc) get their own sounds
  addEventListener('DOMContentLoaded', () => {
    const tv = document.getElementById('tvModal');
    const viewer = document.getElementById('viewer');
    viewer && viewer.addEventListener('close', () => play('close-modal'));
    const face = document.getElementById('faceModal');
    tv && tv.addEventListener('close', () => play('close-modal'));
    face && face.addEventListener('close', () => play('close-profile'));
  });
})();
