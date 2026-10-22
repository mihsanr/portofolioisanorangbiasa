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

  document.addEventListener('click', () => {
    i = (i + 1) % COLORS.length;
    try { sessionStorage.setItem(KEY, COLORS[i]); } catch (e) { /* storage blocked */ }
    apply();
  });
})();
