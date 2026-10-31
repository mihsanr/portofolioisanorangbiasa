/* SFX engine — one unique sound per interaction type, all clips < 6s.
   Audio stays muted until the first user gesture (browser autoplay policy). */
(() => {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // assets sit next to js/, so pages in subfolders (tools/) resolve them too
  const ROOT = new URL('../', document.currentScript.src).href;

  // the hover files are level-matched, so they all share this one volume
  const HOVER_VOLUME = 0.02;

  // name -> volume
  const SOUNDS = {
    'hover-nav': HOVER_VOLUME, 'click-nav': 0.4,
    'hover-row': HOVER_VOLUME, 'click-row': 0.45,
    'close-modal': 0.4,
    'hover-card': HOVER_VOLUME, 'click-card': 0.5, 'close-profile': 0.45,
    'hover-journey': HOVER_VOLUME,
    'hover-cv': HOVER_VOLUME, 'click-cv': 0.4,
    'hover-contact': HOVER_VOLUME, 'click-contact': 0.5,
    'hover-skill': HOVER_VOLUME,
    'hover-footer': HOVER_VOLUME, 'click-footer': 0.4,
    'click-doc': 0.45,
    'hover-player': HOVER_VOLUME, 'click-player': 0.4,
  };

  const cache = {};
  let unlocked = false;
  // ?v= busts the browser cache when the sound files are replaced
  const get = (n) => cache[n] || (cache[n] = Object.assign(new Audio(`${ROOT}assets/sfx/${n}.mp3?v=2`), { preload: 'auto' }));

  const last = {};
  function play(n) {
    if (!unlocked || reduceMotion || window.SFX_MUTED || !(n in SOUNDS)) return;
    const now = performance.now();
    if (last[n] && now - last[n] < 140) return;
    last[n] = now;
    const a = get(n);
    try {
      a.currentTime = 0;
      a.volume = SOUNDS[n];
      a.play().catch(() => {});
    } catch (e) { /* ignore */ }
  }
  window.SFX = play;

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
    const face = document.getElementById('faceModal');
    tv && tv.addEventListener('close', () => play('close-modal'));
    face && face.addEventListener('close', () => play('close-profile'));
  });
})();
