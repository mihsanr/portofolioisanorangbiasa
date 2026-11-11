/* Click anywhere → the brand colour (--blue) steps blue → magenta → teal → blue.
   Remembered for this tab session so it carries across pages.
   Loaded in <head> so the saved colour applies before first paint. */
(() => {
  const COLORS = ['#0000FF', '#FA08F2', '#02A6AF'];
  const KEY = 'ihsan.brand';
  const root = document.documentElement;
  const rgb = (hex) => [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16));

  let i = 0;
  try { i = Math.max(0, COLORS.indexOf(sessionStorage.getItem(KEY))); } catch (e) { /* storage blocked */ }

  function apply() {
    root.style.setProperty('--blue', COLORS[i]);
    window.BRAND_RGB = rgb(COLORS[i]); // main.js blends this into the journey cream
    dispatchEvent(new Event('brandchange'));
  }
  apply();

  /* Arriving through a CRT page transition (style.css @view-transition). Registered
     here because this file loads in <head>: `pagereveal` can fire before the scripts
     at the end of <body> run. sfx.js plays the channel zap when it sees the flag.
     A skipped transition (hidden tab, slow load) rejects its promises — swallow
     that so it never shows up as an unhandled error in the console. */
  const quiet = (vt) => { if (vt) { vt.ready.catch(() => {}); vt.finished.catch(() => {}); } };
  addEventListener('pageswap', (e) => quiet(e.viewTransition)); // leaving
  addEventListener('pagereveal', (e) => {                       // arriving
    const vt = e.viewTransition;
    if (!vt) return;
    quiet(vt);
    window.VT_ARRIVED = true;
    dispatchEvent(new Event('vt:arrive'));
  });

  document.addEventListener('click', (e) => {
    // tool UIs take many clicks; keep the colour still there
    if (e.target.closest && e.target.closest('[data-keep-brand]')) return;
    i = (i + 1) % COLORS.length;
    try { sessionStorage.setItem(KEY, COLORS[i]); } catch (e) { /* storage blocked */ }
    apply();
  });
})();
