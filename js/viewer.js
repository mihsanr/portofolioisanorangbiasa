/* Viewer "Channel Zapping" — player bersuara + panel teletext, untuk tiga jenis karya:
     video    → file penuh bersuara. ↑/↓ (atau swipe vertikal) = tape lain di channel, ←/→ = ganti channel
     gambar   → assets/img/<slug>.webp dengan blur-up LQIP. ←/→ atau ↑/↓ = karya lain di channel yang sama
     dokumen  → sampul + tombol BUKA PDF (dipakai deep link & saat menjelajah channel)
   1–8 = lompat ke channel. Dibuka dari Wall, modal channel, PRIME TIME, atau link work.html#tape/<slug>.
   pushState saat dibuka, replaceState saat ganti karya, Back browser menutup.
   Butuh: TAPES + WALL (tapes.js), PROJECTS (data.js), MEDIA (media.js). */
(() => {
  const dlg = document.getElementById('viewer');
  if (!dlg || typeof TAPES === 'undefined') return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (id) => document.getElementById(id);
  const video = $('viewerVideo'), stat = $('viewerStatic'), osd = $('viewerOsd');
  const still = $('viewerStill'), img = $('viewerImg'), docBtn = $('viewerDoc');
  const ttCh = $('ttCh'), ttIdx = $('ttIdx'), ttTitle = $('ttTitle'), ttMeta = $('ttMeta'), ttKeys = $('ttKeys');
  const bPrev = $('vPrev'), bNext = $('vNext'), bChPrev = $('vChPrev'), bChNext = $('vChNext'), bCopy = $('vCopy');
  const media = typeof MEDIA !== 'undefined' ? MEDIA : {};

  // every viewable item by slug: all videos (incl. the ones kept off the Wall) + Wall images & documents
  const items = new Map(TAPES.map((t) => [t.s, Object.assign({ k: 'v' }, t)]));
  (typeof WALL !== 'undefined' ? WALL : []).forEach((w) => { if (w.k !== 'v' && !items.has(w.s)) items.set(w.s, w); });
  const fam = (t) => (t.k === 'v' ? 'v' : 'x'); // tapes zap among tapes, stills among stills

  const projects = typeof PROJECTS !== 'undefined' ? PROJECTS : [];
  const chName = (n) => (projects[n - 1] && projects[n - 1].title) || (window.TAPE_CHANNELS || [])[n - 1] || '';
  // per channel, in data.js order (fallback: data order)
  const lists = { v: {}, x: {} };
  projects.forEach((p, i) => {
    const ch = i + 1, v = [], x = [];
    for (const m of p.media) {
      const s = m.t === 'd' ? m.doc : m.s, it = items.get(s);
      if (!it || it.ch !== ch) continue;
      const l = it.k === 'v' ? v : x;
      if (!l.includes(s)) l.push(s);
    }
    lists.v[ch] = v; lists.x[ch] = x;
  });
  items.forEach((t) => { const l = (lists[fam(t)][t.ch] = lists[fam(t)][t.ch] || []); if (!l.includes(t.s)) l.push(t.s); });
  const listOf = (t) => lists[fam(t)][t.ch] || [t.s];
  const channels = [...new Set([...Object.keys(lists.v), ...Object.keys(lists.x)].map(Number))]
    .filter((n) => (lists.v[n] || []).length || (lists.x[n] || []).length).sort((a, b) => a - b);

  let cur = null, trigger = null, pushed = false;
  const pre = document.createElement('video'); // metadata of the next tape
  pre.preload = 'metadata'; pre.muted = true;
  const preImg = new Image(); // next still
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (s) => `${pad((s / 60) | 0)}:${pad(s % 60)}`;
  const url = (slug) => `${location.origin}${location.pathname}#tape/${slug}`;
  const imgSrc = (t) => `assets/img/${t.k === 'd' ? t.cv : t.s}.webp`;

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
    const list = listOf(t);
    const i = list.indexOf(t.s);
    ttCh.textContent = `CH ${pad(t.ch)} · ${chName(t.ch).toUpperCase()}`;
    ttIdx.textContent = `${pad(i + 1)}/${pad(list.length)}`;
    osd.textContent = `CH ${pad(t.ch)}`;
    ttTitle.textContent = t.label;
    const p = projects[t.ch - 1];
    const rows = (t.k === 'v' ? [
      ['Klien', t.client],
      ['Peran', (t.role || []).join(', ')],
      ['Kategori', p && p.cat],
      ['Tahun', t.year],
      ['Durasi', t.d ? fmt(t.d) : ''],
    ] : [
      ['Jenis', t.k === 'd' ? `Dokumen PDF · ${t.n} halaman` : 'Desain'],
      ['Kategori', p && p.cat],
      ['Tahun', p && p.year],
    ]).filter(([, v]) => v);
    ttMeta.innerHTML = rows.map(([k]) => `<dt>${k}</dt><dd></dd>`).join('');
    ttMeta.querySelectorAll('dd').forEach((dd, j) => { dd.textContent = rows[j][1]; });
    const stillMode = t.k !== 'v';
    bPrev.textContent = stillMode ? '◀ PREV' : '▲ PREV';
    bNext.textContent = stillMode ? 'NEXT ▶' : '▼ NEXT';
    bPrev.setAttribute('aria-label', stillMode ? 'Karya sebelumnya' : 'Tape sebelumnya');
    bNext.setAttribute('aria-label', stillMode ? 'Karya berikutnya' : 'Tape berikutnya');
    if (ttKeys) ttKeys.textContent = stillMode ? '←→ KARYA LAIN · 1–8 CHANNEL · ESC TUTUP' : '↑↓ TAPE · ←→ / 1–8 CHANNEL · ESC TUTUP';
    bPrev.disabled = bNext.disabled = list.length < 2;
    bChPrev.disabled = bChNext.disabled = channels.length < 2;
    bCopy.textContent = 'SALIN LINK';
    dlg.dataset.kind = t.k;
  }

  function stopVideo() {
    video.pause();
    if (video.hasAttribute('src')) { video.removeAttribute('src'); video.removeAttribute('poster'); video.load(); }
  }
  function showStill(t) {
    stopVideo();
    video.hidden = true; unmute.hidden = true;
    const d = media[t.k === 'd' ? t.cv : t.s];
    still.style.setProperty('--ar', d ? (d.w / d.h).toFixed(4) : '1');
    still.style.backgroundImage = d && d.lqip ? `url("${d.lqip}")` : 'none'; // blur-up placeholder
    const src = imgSrc(t);
    img.classList.remove('ready');
    img.alt = t.k === 'd' ? `${t.label} — sampul dokumen` : `${chName(t.ch)} — ${t.label}`;
    img.onload = () => { if (cur === t) img.classList.add('ready'); };
    img.src = src;
    if (img.complete && img.naturalWidth) img.classList.add('ready');
    still.hidden = false;
    docBtn.hidden = t.k !== 'd';
    if (t.k === 'd') { docBtn.href = `assets/docs/${t.s}.pdf`; docBtn.textContent = `BUKA PDF · ${t.n} HAL ↗︎`; }
    const list = listOf(t), nx = items.get(list[(list.indexOf(t.s) + 1) % list.length]);
    if (nx && nx !== t) preImg.src = imgSrc(nx);
  }
  function showVideo(t) {
    still.hidden = true; docBtn.hidden = true;
    img.removeAttribute('src'); img.classList.remove('ready');
    video.hidden = false;
    video.poster = `assets/video/${t.s}.webp`;
    video.src = `assets/video/${t.s}.mp4`;
    play();
    // preload the next tape's metadata
    const list = listOf(t);
    const nx = list[(list.indexOf(t.s) + 1) % list.length];
    if (nx && nx !== t.s) { pre.src = `assets/video/${nx}.mp4`; }
  }

  function load(slug, { history: mode = 'replace', silent = false } = {}) {
    const t = items.get(slug);
    if (!t) return false;
    cur = t;
    if (!silent) zap();
    render(t);
    if (t.k === 'v') showVideo(t); else showStill(t);
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
    const list = listOf(cur);
    if (!list || list.length < 2) return;
    load(list[(list.indexOf(cur.s) + d + list.length) % list.length]);
  }
  function channel(n) {
    if (cur && cur.ch === n) return;
    const f = cur ? fam(cur) : 'v', o = f === 'v' ? 'x' : 'v';
    const list = (lists[f][n] || []).length ? lists[f][n] : lists[o][n];
    if (list && list.length) load(list[0]);
  }
  function chStep(d) {
    if (!cur) return;
    const i = channels.indexOf(cur.ch);
    channel(channels[(i + d + channels.length) % channels.length]);
  }

  function open(slug, opts = {}) {
    if (!items.has(slug)) return false;
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
    stopVideo();
    img.removeAttribute('src'); img.classList.remove('ready');
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
    if (m && items.has(m[1])) { if (!isOpen) open(m[1], { history: 'none' }); else load(m[1], { history: 'none' }); return; }
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
    const k = e.key, stillMode = cur && cur.k !== 'v';
    if (k === 'ArrowDown') { e.preventDefault(); step(1); }
    else if (k === 'ArrowUp') { e.preventDefault(); step(-1); }
    else if (k === 'ArrowRight') { e.preventDefault(); stillMode ? step(1) : chStep(1); }
    else if (k === 'ArrowLeft') { e.preventDefault(); stillMode ? step(-1) : chStep(-1); }
    else if (/^[1-8]$/.test(k)) channel(+k);
  });
  // swipe on the screen: vertical = next / previous; horizontal = channel (tapes) or next / previous (stills)
  let sy = null, sx = null;
  const screen = dlg.querySelector('.viewer-screen');
  screen.addEventListener('touchstart', (e) => { sy = e.touches[0].clientY; sx = e.touches[0].clientX; }, { passive: true });
  screen.addEventListener('touchend', (e) => {
    if (sy == null) return;
    const dy = e.changedTouches[0].clientY - sy, dx = e.changedTouches[0].clientX - sx;
    sy = sx = null;
    if (Math.abs(dy) > 60 && Math.abs(dy) > Math.abs(dx) * 1.4) step(dy < 0 ? 1 : -1);
    else if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 1.4) (cur && cur.k !== 'v' ? step : chStep)(dx < 0 ? 1 : -1);
  }, { passive: true });

  window.Viewer = {
    open, close,
    get current() { return cur && cur.s; },
    has: (s) => items.has(s),
    kind: (s) => (items.has(s) ? items.get(s).k : null),
  };
})();
