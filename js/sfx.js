/* SFX engine — one unique sound per interaction type, all clips < 6s.
   Audio stays muted until the first user gesture (browser autoplay policy). */
(() => {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // name -> volume
  const SOUNDS = {
    'hover-nav': 0.35, 'click-nav': 0.4,
    'hover-row': 0.3, 'click-row': 0.45,
    'close-modal': 0.4,
    'hover-card': 0.35, 'click-card': 0.5, 'close-profile': 0.45,
    'hover-journey': 0.3,
    'hover-cv': 0.4, 'click-cv': 0.4,
    'hover-contact': 0.35, 'click-contact': 0.5,
    'hover-skill': 0.4,
    'hover-footer': 0.3, 'click-footer': 0.4,
    'click-doc': 0.45,
    'hover-player': 0.3, 'click-player': 0.4,
  };

  const cache = {};
  let unlocked = false;
  const get = (n) => cache[n] || (cache[n] = Object.assign(new Audio(`assets/sfx/${n}.mp3`), { preload: 'auto' }));

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
    ['.face-card', 'hover-card', 'click-card'],
    ['.project-row-head', 'hover-row', 'click-row'],
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

  document.addEventListener('click', (e) => {
    const m = match(e.target);
    if (m && m.clk) play(m.clk);
  });

  // modal closes (✕ button, backdrop, or Esc) get their own sounds
  addEventListener('DOMContentLoaded', () => {
    const tv = document.getElementById('tvModal');
    const face = document.getElementById('faceModal');
    tv && tv.addEventListener('close', () => play('close-modal'));
    face && face.addEventListener('close', () => play('close-profile'));
  });
})();
