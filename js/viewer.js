/* Viewer "Channel Zapping" — player bersuara + panel teletext.
   Dibuka dari Wall, modal channel, atau link work.html#tape/<slug>.
   ↑/↓ (atau swipe vertikal) = tape lain di channel yang sama,
   ←/→ atau 1–8 = ganti channel. pushState saat dibuka, replaceState saat ganti tape,
   Back browser menutup. Butuh: TAPES (tapes.js), PROJECTS (data.js). */
(() => {
  const dlg = document.getElementById('viewer');
  if (!dlg || typeof TAPES === 'undefined') return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (id) => document.getElementById(id);
  const video = $('viewerVideo'), stat = $('viewerStatic'), osd = $('viewerOsd');
  const ttCh = $('ttCh'), ttIdx = $('ttIdx'), ttTitle = $('ttTitle'), ttMeta = $('ttMeta');
  const bPrev = $('vPrev'), bNext = $('vNext'), bChPrev = $('vChPrev'), bChNext = $('vChNext'), bCopy = $('vCopy');

  const bySlug = new Map(TAPES.map((t) => [t.s, t]));
  const projects = typeof PROJECTS !== 'undefined' ? PROJECTS : [];
  const chName = (n) => (projects[n - 1] && projects[n - 1].title) || (window.TAPE_CHANNELS || [])[n - 1] || '';
  // tapes per channel, in data.js order (fallback: TAPES order)
  const lists = {};
  projects.forEach((p, i) => {
    lists[i + 1] = p.media.filter((m) => m.t === 'v' && bySlug.has(m.s) && bySlug.get(m.s).ch === i + 1).map((m) => m.s);
  });
  TAPES.forEach((t) => { (lists[t.ch] = lists[t.ch] || []); if (!lists[t.ch].includes(t.s)) lists[t.ch].push(t.s); });
  const channels = Object.keys(lists).map(Number).filter((n) => lists[n].length).sort((a, b) => a - b);

  let cur = null, trigger = null, pushed = false;
  const pre = document.createElement('video'); // metadata of the next tape
  pre.preload = 'metadata'; pre.muted = true;
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (s) => `${pad((s / 60) | 0)}:${pad(s % 60)}`;
  const url = (slug) => `${location.origin}${location.pathname}#tape/${slug}`;

  /* static noise between tapes (reuses the page's grain idea) */
  const g = stat.getContext('2d');
  let staticUntil = 0;
  function noise(now) {
    if (now > staticUntil) { stat.classList.remove('on'); return; }
    const d = g.createImageData(stat.width, stat.height);
    for (let i = 0; i < d.data.length; i += 4) { const v = (Math.random() * 255) | 0; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
    g.putImageData(d, 0, 0);
    requestAnimationFrame(noise);
  }
  function zap() {
    if (window.SFX) window.SFX('channel-switch');
    if (reduce) return;
    staticUntil = performance.now() + 150;
    stat.classList.add('on');
    requestAnimationFrame(noise);
  }

  function render(t) {
    const list = lists[t.ch] || [t.s];
    const i = list.indexOf(t.s);
    ttCh.textContent = `CH ${pad(t.ch)} · ${chName(t.ch).toUpperCase()}`;
    ttIdx.textContent = `${pad(i + 1)}/${pad(list.length)}`;
    osd.textContent = `CH ${pad(t.ch)}`;
    ttTitle.textContent = t.label;
    const p = projects[t.ch - 1];
    const rows = [
      ['Klien', t.client],
      ['Peran', (t.role || []).join(', ')],
      ['Kategori', p && p.cat],
      ['Tahun', t.year],
      ['Durasi', t.d ? fmt(t.d) : ''],
    ].filter(([, v]) => v);
    ttMeta.innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd></dd>`).join('');
    ttMeta.querySelectorAll('dd').forEach((dd, j) => { dd.textContent = rows[j][1]; });
    bPrev.disabled = bNext.disabled = list.length < 2;
    bChPrev.disabled = bChNext.disabled = channels.length < 2;
    bCopy.textContent = 'SALIN LINK';
  }

  function load(slug, { history: mode = 'replace', silent = false } = {}) {
    const t = bySlug.get(slug);
    if (!t) return false;
    cur = t;
    if (!silent) zap();
    render(t);
    video.poster = `assets/video/${t.s}.webp`;
    video.src = `assets/video/${t.s}.mp4`;
    play();
    // preload the next tape's metadata
    const list = lists[t.ch] || [];
    const nx = list[(list.indexOf(t.s) + 1) % list.length];
    if (nx && nx !== t.s) { pre.src = `assets/video/${nx}.mp4`; }
    const h = `#tape/${t.s}`;
    if (mode === 'push' && location.hash !== h) { history.pushState({ tape: t.s }, '', h); pushed = true; }
    else if (mode === 'replace' && location.hash !== h) history.replaceState({ tape: t.s }, '', h);
    return true;
  }

  // autoplay with sound can be refused (e.g. right after arriving from the link-in-bio):
  // fall back to a muted start and offer a one-tap unmute
  const unmute = $('viewerUnmute');
  function play() {
    video.muted = false;
    unmute.hidden = true;
    video.play().catch(() => {
      video.muted = true;
      video.play().then(() => { unmute.hidden = false; }, () => {});
    });
  }
  unmute.addEventListener('click', () => {
    unmute.hidden = true;
    video.muted = false;
    video.pause(); video.play().catch(() => {}); // fresh 'play' so the BGM ducks
  });

  function step(d) {
    if (!cur) return;
    const list = lists[cur.ch];
    if (!list || list.length < 2) return;
    load(list[(list.indexOf(cur.s) + d + list.length) % list.length]);
  }
  function channel(n) {
    if (!lists[n] || !lists[n].length) return;
    if (cur && cur.ch === n) return;
    load(lists[n][0]);
  }
  function chStep(d) {
    if (!cur) return;
    const i = channels.indexOf(cur.ch);
    channel(channels[(i + d + channels.length) % channels.length]);
  }

  function open(slug, opts = {}) {
    if (!bySlug.has(slug)) return false;
    trigger = opts.trigger || document.activeElement;
    if (!isOpen) {
      isOpen = true;
      if (!dlg.open) dlg.showModal();
      dispatchEvent(new CustomEvent('viewer:open', { detail: { slug } }));
    }
    load(slug, { history: opts.history || 'push', silent: opts.silent });
    return true;
  }
  function close() { if (dlg.open) dlg.close(); finish(); }

  // idempotent teardown: runs from close() and from the dialog's own close event (Esc)
  let isOpen = false;
  function finish() {
    if (!isOpen) return;
    isOpen = false;
    video.pause();
    video.removeAttribute('src'); video.load();
    const slug = cur && cur.s; cur = null;
    const strip = () => { if (!isOpen && /^#tape\//.test(location.hash)) history.replaceState(null, '', location.pathname + location.search); };
    if (/^#tape\//.test(location.hash)) {
      if (pushed) { history.back(); setTimeout(strip, 350); } // back() can be ignored without a user gesture
      else strip();
    }
    pushed = false;
    dispatchEvent(new CustomEvent('viewer:close', { detail: { slug } }));
    if (trigger && trigger.focus && document.contains(trigger)) trigger.focus({ preventScroll: true });
    trigger = null;
  }
  dlg.addEventListener('close', finish);
  addEventListener('popstate', () => {
    const m = location.hash.match(/^#tape\/([\w-]+)/);
    if (m && bySlug.has(m[1])) { if (!isOpen) open(m[1], { history: 'none' }); else load(m[1], { history: 'none' }); return; }
    if (isOpen) { pushed = false; close(); }
  });

  $('viewerClose').addEventListener('click', close);
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
  bPrev.addEventListener('click', () => step(-1));
  bNext.addEventListener('click', () => step(1));
  bChPrev.addEventListener('click', () => chStep(-1));
  bChNext.addEventListener('click', () => chStep(1));
  bCopy.addEventListener('click', () => {
    if (!cur) return;
    const u = url(cur.s);
    const done = () => { bCopy.textContent = 'LINK DISALIN ✓'; };
    if (navigator.clipboard) navigator.clipboard.writeText(u).then(done, () => { bCopy.textContent = u; });
    else bCopy.textContent = u;
  });
  dlg.addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input, textarea')) return;
    const k = e.key;
    if (k === 'ArrowDown') { e.preventDefault(); step(1); }
    else if (k === 'ArrowUp') { e.preventDefault(); step(-1); }
    else if (k === 'ArrowRight') { e.preventDefault(); chStep(1); }
    else if (k === 'ArrowLeft') { e.preventDefault(); chStep(-1); }
    else if (/^[1-8]$/.test(k)) channel(+k);
  });
  // vertical swipe on the screen = next / previous tape
  let sy = null, sx = null;
  const screen = dlg.querySelector('.viewer-screen');
  screen.addEventListener('touchstart', (e) => { sy = e.touches[0].clientY; sx = e.touches[0].clientX; }, { passive: true });
  screen.addEventListener('touchend', (e) => {
    if (sy == null) return;
    const dy = e.changedTouches[0].clientY - sy, dx = e.changedTouches[0].clientX - sx;
    sy = sx = null;
    if (Math.abs(dy) > 60 && Math.abs(dy) > Math.abs(dx) * 1.4) step(dy < 0 ? 1 : -1);
    else if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 1.4) chStep(dx < 0 ? 1 : -1);
  }, { passive: true });

  window.Viewer = { open, close, get current() { return cur && cur.s; }, has: (s) => bySlug.has(s) };
})();
