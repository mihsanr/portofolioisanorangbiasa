/* Shared TV chrome for subpages: CRT barrel frame, custom cursor, grain,
   nav scroll state. index.html keeps its own copy inside main.js —
   load this on subpages only so nothing runs twice. Everything null-safe. */
(() => {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ================= CRT BARREL FRAME ================= */
  const frame = document.getElementById('crtFrame');
  const bevel = document.getElementById('crtBevel');
  const strokeSvg = document.getElementById('crtStroke');
  function barrel() {
    const W = innerWidth, H = innerHeight, m = W <= 768;
    const MC = m ? 12 : 38;              // corner inset
    const MM = m ? 4 : 8;                // mid-edge inset (barrel bulge)
    const R = m ? Math.min(Math.max(18, W * 0.03), 28)
                : Math.min(Math.max(40, W * 0.042), 70); // corner radius
    const inner =
      `M ${MC + R},${MC} Q ${W / 2},${MM} ${W - MC - R},${MC}` +
      ` Q ${W - MC},${MC} ${W - MC},${MC + R} Q ${W - MM},${H / 2} ${W - MC},${H - MC - R}` +
      ` Q ${W - MC},${H - MC} ${W - MC - R},${H - MC} Q ${W / 2},${H - MM} ${MC + R},${H - MC}` +
      ` Q ${MC},${H - MC} ${MC},${H - MC - R} Q ${MM},${H / 2} ${MC},${MC + R}` +
      ` Q ${MC},${MC} ${MC + R},${MC} Z`;
    const outer = `M 0,0 L ${W},0 L ${W},${H} L 0,${H} Z`;
    frame.style.clipPath = `path(evenodd, '${outer} ${inner}')`;
    frame.style.visibility = 'visible';
    if (bevel) bevel.style.clipPath = `path('${inner}')`;
    if (strokeSvg) {
      strokeSvg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      strokeSvg.style.clipPath = `path('${inner}')`;
      strokeSvg.innerHTML = '';
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', inner);
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke', 'rgba(30,28,26,0.10)');
      p.setAttribute('stroke-width', '6');
      strokeSvg.appendChild(p);
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
