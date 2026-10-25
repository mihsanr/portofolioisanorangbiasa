/* Shared TV chrome for subpages: CRT barrel frame, custom cursor, grain,
   nav scroll state. index.html keeps its own copy inside main.js —
   load this on subpages only so nothing runs twice. Everything null-safe. */
(() => {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ================= CRT BARREL FRAME ================= */
  /* Clip paths use objectBoundingBox units so they stretch together with the
     fixed layers when a mobile URL bar hides/shows mid-scroll. A pixel path()
     stays at the old height until `resize` fires, leaving a bare strip. */
  const frame = document.getElementById('crtFrame');
  const bevel = document.getElementById('crtBevel');
  const strokeSvg = document.getElementById('crtStroke');
  const SVGNS = 'http://www.w3.org/2000/svg';
  const clipDefs = document.createElementNS(SVGNS, 'svg');
  clipDefs.setAttribute('width', '0');
  clipDefs.setAttribute('height', '0');
  clipDefs.setAttribute('aria-hidden', 'true');
  clipDefs.style.position = 'absolute';
  clipDefs.innerHTML =
    '<clipPath id="crtClipFrame" clipPathUnits="objectBoundingBox"><path clip-rule="evenodd"/></clipPath>' +
    '<clipPath id="crtClipInner" clipPathUnits="objectBoundingBox"><path/></clipPath>';
  if (frame) document.body.appendChild(clipDefs);
  const [clipFrame, clipInner] = clipDefs.querySelectorAll('path');
  const strokePath = document.createElementNS(SVGNS, 'path');
  strokePath.setAttribute('fill', 'none');
  strokePath.setAttribute('stroke', 'rgba(30,28,26,0.10)');
  strokePath.setAttribute('stroke-width', '6');
  strokePath.setAttribute('vector-effect', 'non-scaling-stroke');
  function barrel() {
    const W = innerWidth, H = innerHeight, m = W <= 768 || H <= 500;
    const MC = m ? 12 : 38;              // corner inset
    const MM = m ? 4 : 8;                // mid-edge inset (barrel bulge)
    const R = m ? Math.min(Math.max(18, W * 0.03), 28)
                : Math.min(Math.max(40, W * 0.042), 70); // corner radius
    const p = (x, y) => `${(x / W).toFixed(5)},${(y / H).toFixed(5)}`;
    const inner =
      `M ${p(MC + R, MC)} Q ${p(W / 2, MM)} ${p(W - MC - R, MC)}` +
      ` Q ${p(W - MC, MC)} ${p(W - MC, MC + R)} Q ${p(W - MM, H / 2)} ${p(W - MC, H - MC - R)}` +
      ` Q ${p(W - MC, H - MC)} ${p(W - MC - R, H - MC)} Q ${p(W / 2, H - MM)} ${p(MC + R, H - MC)}` +
      ` Q ${p(MC, H - MC)} ${p(MC, H - MC - R)} Q ${p(MM, H / 2)} ${p(MC, MC + R)}` +
      ` Q ${p(MC, MC)} ${p(MC + R, MC)} Z`;
    clipFrame.setAttribute('d', `M 0,0 L 1,0 L 1,1 L 0,1 Z ${inner}`);
    clipInner.setAttribute('d', inner);
    frame.style.clipPath = 'url(#crtClipFrame)';
    frame.style.visibility = 'visible';
    if (bevel) bevel.style.clipPath = 'url(#crtClipInner)';
    if (strokeSvg) {
      strokeSvg.setAttribute('viewBox', '0 0 1 1');
      strokeSvg.setAttribute('preserveAspectRatio', 'none');
      strokeSvg.style.clipPath = 'url(#crtClipInner)';
      strokePath.setAttribute('d', inner);
      if (!strokePath.parentNode) strokeSvg.appendChild(strokePath);
    }
  }
  if (frame) {
    barrel();
    addEventListener('resize', barrel, { passive: true });
  }

  /* ================= NAV SCROLL STATE ================= */
  const nav = document.getElementById('siteNav');
  const bgmBar = document.getElementById('bgmBar');
  function onScroll() {
    if (nav) nav.classList.toggle('is-scrolled', scrollY > 8);
    if (bgmBar) bgmBar.classList.toggle('is-scrolled', scrollY > 8);
  }
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ================= CURSOR ================= */
  const dot = document.getElementById('cursorDot');
  const ring = document.getElementById('cursorRing');
  if (finePointer && dot && ring) {
    const cur = dot.closest('.cursor');
    let mx = -200, my = -200, rx = -200, ry = -200;
    addEventListener('pointermove', (e) => {
      mx = e.clientX; my = e.clientY;
      dot.style.left = mx + 'px';
      dot.style.top = my + 'px';
      const t = e.target;
      if (cur) cur.classList.toggle('grow', !!(t.closest && t.closest('a, button, video')));
    }, { passive: true });
    (function follow() {
      rx += (mx - rx) * 0.16; ry += (my - ry) * 0.16;
      ring.style.left = rx + 'px';
      ring.style.top = ry + 'px';
      requestAnimationFrame(follow);
    })();
  } else {
    document.body.style.cursor = 'auto';
  }

  /* ================= GRAIN ================= */
  const grain = document.getElementById('grain');
  if (!reduceMotion && grain) {
    const g = grain.getContext('2d', { alpha: true });
    let buf;
    function sizeGrain() {
      grain.width = Math.max(2, innerWidth / 3 | 0);
      grain.height = Math.max(2, innerHeight / 3 | 0);
      buf = g.createImageData(grain.width, grain.height);
    }
    sizeGrain();
    addEventListener('resize', sizeGrain, { passive: true });
    let then = 0;
    (function noise(now) {
      requestAnimationFrame(noise);
      if (now - then < 80) return;
      then = now;
      const d = buf.data;
      for (let i = 0; i < d.length; i += 4) {
        d[i] = d[i + 1] = d[i + 2] = (Math.random() * 255) | 0;
        d[i + 3] = 255;
      }
      g.putImageData(buf, 0, 0);
    })(0);
  }
})();
