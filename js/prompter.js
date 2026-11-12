/* Teleprompter — free tool.
   One state object drives both the desktop toolbar and the phone dock;
   everything persists to localStorage (wrapped: storage can be blocked).
   The core exposes a small API (window.TP) so the optional Pro and Remote
   files can add features without living inside this closure. */
(() => {
  const V = '4';   // keep in step with the ?v= in teleprompter.html and tools/sw.js
  const HERE = document.currentScript ? new URL('.', document.currentScript.src) : new URL('../js/', location.href);
  const KEY = 'ihsan.prompter';
  const LIB_KEY = 'ihsan.prompter.scripts';   // recent scripts, newest first
  const MAX_RECENT = 30;
  const LIMITS = {
    size: { min: 20, max: 180, step: 4 },
    speed: { min: 1, max: 50, step: 1 },
    margin: { min: 0, max: 40, step: 2 },
    line: { min: 1.2, max: 1.8, step: 0.1 },
    lead: { min: 10, max: 70, step: 1 },
  };
  const DEFAULTS = {
    text: '', size: 58, margin: 5, speed: 10, align: 'left',
    flipx: false, flipy: false, bg: '#000000', fg: '#ffffff',
    guide: false, countdown: false,
    mode: 'simple',     // 'simple' | 'pro'
    lead: null,         // eye line, % of the stage height; null = the layout's own default
    dim: true,          // fade the lines already read
    line: 1.3, font: 'sans',
  };
  const FONTS = {
    sans: 'Arial, Helvetica, sans-serif',
    condensed: '"Arial Narrow", "Roboto Condensed", sans-serif-condensed, sans-serif',
    serif: 'Georgia, "Times New Roman", serif',
  };
  const LAYOUT_KEYS = ['size', 'margin', 'line', 'font', 'lead'];   // these reflow the text
  const PX_PER_SPEED = 4;   // speed 10 → 40px per second

  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;
  const body = document.body;
  const stage = $('stage');
  const scroller = $('scroller');
  const script = $('script');
  const hud = $('hud');
  const editor = $('editor');
  const editorText = $('editorText');
  const more = $('more');
  const recent = $('recent');
  const phone = matchMedia('(max-width: 820px), (max-height: 520px)');

  let state = { ...DEFAULTS };
  try { Object.assign(state, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* storage blocked */ }
  if (phone.matches && !hasSaved()) state.size = 40;   // phones start at a size that fits a few words per line

  function hasSaved() {
    try { return !!localStorage.getItem(KEY); } catch (e) { return false; }
  }

  /* ================= EVENTS =================
     'play' · 'stop' · 'tick' (≤4×/s) · 'change' (key, value) · 'script' · 'layout' · 'mode' · 'autopause' */
  const bus = new Map();
  function on(ev, fn) {
    if (!bus.has(ev)) bus.set(ev, new Set());
    bus.get(ev).add(fn);
    return () => bus.get(ev).delete(fn);
  }
  function emit(ev, ...args) {
    bus.get(ev)?.forEach((fn) => { try { fn(...args); } catch (e) { console.error(e); } });
  }

  /* ================= SCRIPT LIBRARY =================
     Each script: { id, text, progress (0–1 read position), updated }.
     Lives only in this browser — nothing leaves the device. */
  let lib = [];
  try { lib = JSON.parse(localStorage.getItem(LIB_KEY) || '[]'); } catch (e) { /* storage blocked */ }
  if (!Array.isArray(lib)) lib = [];
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  function addScript(text = '') {
    const s = { id: newId(), text, progress: 0, updated: Date.now() };
    lib.unshift(s);
    lib = lib.slice(0, MAX_RECENT);
    return s;
  }
  if (!lib.length) state.current = addScript(state.text || '').id;   // first visit, or upgrading from the single-script version
  delete state.text;
  const cur = () => lib.find((s) => s.id === state.current) || (state.current = lib[0].id, lib[0]);
  function touch(s) {   // move to the top of Recent
    s.updated = Date.now();
    lib = [s, ...lib.filter((x) => x !== s)];
  }
  // a script left blank isn't worth a Recent slot
  function dropIfEmpty(s) {
    if (!s.text.trim() && lib.length > 1) lib = lib.filter((x) => x !== s);
  }

  // throttled (not debounced) so a long read still gets saved every few hundred ms
  let saveTimer = 0;
  function persist() {
    clearTimeout(saveTimer); saveTimer = 0;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      localStorage.setItem(LIB_KEY, JSON.stringify(lib));
    } catch (e) { /* storage blocked or full */ }
  }
  function save() {
    if (!saveTimer) saveTimer = setTimeout(persist, 300);
  }
  function setText(text) {
    const s = cur();
    if (s.text === text) return;
    s.text = text;
    touch(s);
    save();
    emit('script');
  }

  const clamp = (k, v) => Math.min(LIMITS[k].max, Math.max(LIMITS[k].min, v));
  const maxScroll = () => Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  const startPos = () => (state.flipy ? maxScroll() : 0);
  const fmtSpeed = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  /* ================= RENDER ================= */
  function applyStyle() {
    root.style.setProperty('--size', state.size + 'px');
    root.style.setProperty('--margin', state.margin + '%');
    root.style.setProperty('--align', state.align);
    root.style.setProperty('--sx', state.flipx ? -1 : 1);
    root.style.setProperty('--sy', state.flipy ? -1 : 1);
    root.style.setProperty('--bg', state.bg);
    root.style.setProperty('--fg', state.fg);
    root.style.setProperty('--line', state.line);
    root.style.setProperty('--font', FONTS[state.font] || FONTS.sans);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', state.bg);
    body.classList.toggle('show-guide', state.guide);
    body.classList.toggle('flip-y', state.flipy);
    body.classList.toggle('dim-read', state.dim);
    body.classList.toggle('is-pro', state.mode === 'pro');
    applyLead();
    syncControls();
  }

  /* eye line: a % of the stage, so it can sit next to wherever the lens is */
  function applyLead() {
    if (state.lead == null) root.style.removeProperty('--lead');
    else root.style.setProperty('--lead', Math.round(stage.clientHeight * state.lead / 100) + 'px');
    measure();
  }
  const leadPct = () => (state.lead != null ? state.lead
    : Math.round(clamp('lead', stage.clientHeight ? metrics.lead / stage.clientHeight * 100 : 38)));

  /* lead = where the first line rests; textH = height of the words alone */
  const metrics = { lead: 0, textH: 0 };
  function measure() {
    const cs = getComputedStyle(script);
    metrics.lead = parseFloat(cs.paddingTop) || 0;
    metrics.textH = Math.max(0, script.offsetHeight - metrics.lead - (parseFloat(cs.paddingBottom) || 0));
  }

  function syncControls() {
    $('tbSize').value = state.size; $('tbSizeVal').textContent = state.size;
    $('tbMargin').value = state.margin; $('tbMarginVal').textContent = state.margin;
    $('tbSpeed').value = state.speed; $('tbSpeedVal').textContent = fmtSpeed(state.speed);
    $('tbBg').value = state.bg; $('tbFg').value = state.fg;
    $('mBg').value = state.bg; $('mFg').value = state.fg;
    $('dkSize').textContent = state.size;
    $('dkSpeed').textContent = fmtSpeed(state.speed);
    $('dkMargin').textContent = state.margin + '%';
    $('dkLine').textContent = state.line.toFixed(1);
    $('mLead').value = leadPct(); $('mLeadVal').textContent = leadPct() + '%';
    $('mDim').textContent = state.dim ? 'ON' : 'OFF';
    $('modeChip').textContent = state.mode === 'pro' ? 'PRO' : 'SIMPLE';
    const pressed = { align: state.align === 'center', flipx: state.flipx, flipy: state.flipy, guide: state.guide, countdown: state.countdown, dim: state.dim };
    document.querySelectorAll('[data-act][aria-pressed]').forEach((b) => {
      if (b.dataset.act in pressed) b.setAttribute('aria-pressed', pressed[b.dataset.act]);
    });
    document.querySelectorAll('.sh-theme').forEach((b) => {
      b.setAttribute('aria-pressed', b.dataset.bg === state.bg && b.dataset.fg === state.fg);
    });
    document.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.mode === state.mode));
    document.querySelectorAll('[data-font]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.font === state.font));
  }

  function renderText() {
    script.textContent = cur().text;
    script.dataset.placeholder = phone.matches ? 'Tap EDIT to add your script' : 'Paste your script here';
    measure();
    emit('script');
  }

  /* read position as 0–1 from the script's start, whichever way it's mirrored */
  function getProgress() {
    const max = maxScroll();
    if (!max) return 0;
    const p = scroller.scrollTop / max;
    return state.flipy ? 1 - p : p;
  }
  function restoreProgress(announce) {
    const p = cur().progress || 0;
    const max = maxScroll();
    scroller.scrollTop = pos = (state.flipy ? 1 - p : p) * max;
    if (announce && p > 0.01 && p < 0.98) flash(`Resumed · ${Math.round(p * 100)}%`, 1400);
    tick(true);
  }

  // changing size/margin/font reflows the text — keep the reader at the same spot
  function keepPlace(fn) {
    const ratio = scroller.scrollHeight ? scroller.scrollTop / scroller.scrollHeight : 0;
    fn();
    scroller.scrollTop = pos = ratio * scroller.scrollHeight;
  }

  function set(k, v, announce) {
    if (k in LIMITS && v != null) v = Math.round(clamp(k, v) * 10) / 10;
    if (state[k] === v) return;
    if (LAYOUT_KEYS.includes(k)) keepPlace(() => { state[k] = v; applyStyle(); });
    else state[k] = v;
    applyStyle();
    save();
    if (announce) flash(`${k.toUpperCase()} ${k === 'speed' ? fmtSpeed(v) : v}${k === 'margin' ? '%' : ''}`);
    emit('change', k, v);
    tick(true);
  }

  /* ================= HUD ================= */
  let hudTimer;
  function flash(msg, ms = 700, cls = '') {
    hud.textContent = msg;
    hud.className = 'tp-hud is-on ' + cls;
    clearTimeout(hudTimer);
    hudTimer = setTimeout(() => { hud.className = 'tp-hud ' + cls; }, ms);
  }

  /* ================= WHERE AM I =================
     dist = pixels travelled from the script's start (mirror-proof).
     The reading ends when the last line reaches the eye line (dist = textH),
     a little before the scroll itself runs out. */
  const dist = () => (state.flipy ? maxScroll() - scroller.scrollTop : scroller.scrollTop);
  const readProgress = () => (metrics.textH ? Math.min(1, Math.max(0, dist() / metrics.textH)) : 0);
  const secondsLeft = () => Math.max(0, metrics.textH - dist()) / (state.speed * PX_PER_SPEED);

  let lastTick = 0, tickTimer = 0;
  function tick(force) {
    const now = performance.now();
    if (!force && now - lastTick < 250) {
      if (!tickTimer) tickTimer = setTimeout(() => { tickTimer = 0; tick(true); }, 260);   // never miss the last position
      return;
    }
    lastTick = now;
    const has = !!script.textContent.trim();
    $('progress').style.setProperty('--p', has ? readProgress() : 0);
    $('timeLeft').textContent = has ? '−' + fmtTime(secondsLeft()) : '';
    emit('tick');
  }

  /* ================= SCROLL ENGINE ================= */
  let playing = false, raf = 0, last = 0, pos = 0, counting = 0;
  let stops = [], nextStop = -1;   // auto-pause points (Pro), as dist values

  function aimStop() {
    const d = dist();
    nextStop = stops.findIndex((s) => s > d + 1);
  }
  function setStops(list) {
    stops = (list || []).filter(Number.isFinite).sort((a, b) => a - b);
    aimStop();
  }

  function frame(now) {
    if (!playing) return;
    // the frame's timestamp can be a hair older than the moment play was pressed: never step backwards
    const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
    last = now;
    // user dragged/wheeled the text mid-read: continue from where they left it
    if (Math.abs(scroller.scrollTop - pos) > 3) { pos = scroller.scrollTop; aimStop(); }
    pos += (state.flipy ? -1 : 1) * state.speed * PX_PER_SPEED * dt;
    const max = maxScroll();
    if (nextStop >= 0) {
      const at = stops[nextStop];
      if ((state.flipy ? max - pos : pos) >= at) {
        scroller.scrollTop = pos = state.flipy ? max - at : at;
        stop();
        flash('PAUSE', 900);
        emit('autopause');
        return;
      }
    }
    if (state.flipy ? pos <= 0 : pos >= max) {   // ran out of script
      pos = Math.min(max, Math.max(0, pos));
      scroller.scrollTop = pos;
      return stop();
    }
    scroller.scrollTop = pos;
    tick();
    raf = requestAnimationFrame(frame);
  }

  function play() {
    if (playing || counting) return;
    if (!script.textContent.trim()) { flash(phone.matches ? 'Tap EDIT first' : 'Paste a script first', 1200); return; }
    // finished? rewind before starting again
    const max = maxScroll();
    if ((!state.flipy && scroller.scrollTop >= max - 1) || (state.flipy && scroller.scrollTop <= 1)) scroller.scrollTop = startPos();
    if (state.countdown) return countdown(3);
    begin();
  }
  function countdown(n) {
    setPlayingUI(true);
    if (n === 0) { counting = 0; hud.className = 'tp-hud'; return begin(); }
    flash(String(n), 900, 'is-count');
    counting = setTimeout(() => countdown(n - 1), 1000);
  }
  function begin() {
    playing = true;
    pos = scroller.scrollTop;
    last = performance.now();
    aimStop();
    script.contentEditable = 'false';
    script.blur();
    setPlayingUI(true);
    wake(true);
    raf = requestAnimationFrame(frame);
    emit('play');
  }
  function stop() {
    const was = playing || !!counting;
    if (counting) { clearTimeout(counting); counting = 0; hud.className = 'tp-hud'; }
    playing = false;
    cancelAnimationFrame(raf);
    setPlayingUI(false);
    makeEditable();
    wake(false);
    if (was) { tick(true); emit('stop'); }
  }
  const toggle = () => (playing || counting ? stop() : play());

  function setPlayingUI(on) {
    body.classList.toggle('is-playing', on);
    ['tbPlay', 'dkPlay'].forEach((id) => $(id).setAttribute('aria-label', on ? 'Pause' : 'Play'));
  }

  function toStart() {
    scroller.scrollTop = pos = startPos();
    aimStop();
    tick(true);
  }
  function jumpToOffset(d) {
    const max = maxScroll();
    d = Math.min(max, Math.max(0, d));
    scroller.scrollTop = pos = state.flipy ? max - d : d;
    aimStop();
    tick(true);
  }
  /* said it wrong? step back a couple of lines and say it again */
  function nudgeLines(n) {
    jumpToOffset(dist() + n * state.size * state.line);
    flash(`${n < 0 ? '↺' : '↻'} ${Math.abs(n)} lines`, 500);
  }

  /* keep the phone screen on while reading */
  let lock = null;
  async function wake(on) {
    try {
      if (on && 'wakeLock' in navigator && !lock) {
        lock = await navigator.wakeLock.request('screen');
        lock.addEventListener('release', () => { lock = null; });
      } else if (!on && lock) { await lock.release(); lock = null; }
    } catch (e) { /* not allowed — fine */ }
  }
  /* home button / app switcher / tab closed: write everything down right now,
     the browser may kill the page without another chance */
  function flushNow() {
    if (editor.open) cur().text = editorText.value;
    cur().progress = getProgress();
    persist();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushNow();
    else if (playing) wake(true);
  });
  addEventListener('pagehide', flushNow);

  scroller.addEventListener('scroll', () => {
    cur().progress = getProgress();
    save();
    tick();
  }, { passive: true });

  /* the text block or the stage changed size → eye line + offsets moved */
  let layoutTimer = 0;
  new ResizeObserver(() => {
    if (state.lead != null) applyLead(); else measure();
    clearTimeout(layoutTimer);
    layoutTimer = setTimeout(() => { measure(); aimStop(); tick(true); emit('layout'); }, 60);
  }).observe(script);
  new ResizeObserver(() => { if (state.lead != null) applyLead(); }).observe(stage);

  /* ================= INLINE EDITING (desktop) ================= */
  const plainOnly = (() => {
    script.contentEditable = 'plaintext-only';
    return script.contentEditable === 'plaintext-only';
  })();
  function makeEditable() {
    script.contentEditable = phone.matches ? 'false' : (plainOnly ? 'plaintext-only' : 'true');
  }
  if (!plainOnly) {
    script.addEventListener('paste', (e) => {
      e.preventDefault();
      document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
    });
  }
  script.addEventListener('input', () => {
    const text = script.innerText.replace(/\n$/, '');
    if (!text.trim()) script.textContent = '';
    setText(text);
  });
  // typing can leave the text split over several nodes; fold it back into one when done
  script.addEventListener('blur', () => {
    if (script.childNodes.length > 1) keepPlace(() => { script.textContent = cur().text; });
  });

  /* ================= EDITOR SHEET (phone) ================= */
  function countWords() {
    const n = (editorText.value.match(/\S+/g) || []).length;
    const secs = Math.round(n / 150 * 60);   // ~150 words per minute spoken
    $('wordCount').textContent = `${n} words · ~${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')} min`;
  }
  function openEditor() {
    stop();
    editorText.value = cur().text;
    countWords();
    editor.showModal();
    fitEditor();
    if (!cur().text) editorText.focus();
  }
  function closeEditor() {
    setText(editorText.value.replace(/\s+$/, ''));
    persist();
    editorText.blur();
    if (editor.open) editor.close();
    renderText();
    restoreProgress(false);   // small fix mid-script → stay where you were
  }
  // every keystroke is kept — no need to press Done before the app gets closed
  editorText.addEventListener('input', () => {
    countWords();
    setText(editorText.value);
  });
  editor.addEventListener('cancel', (e) => { e.preventDefault(); closeEditor(); });

  // the editor follows the visible viewport, so the keyboard never covers "Done"
  function fitEditor() {
    const vv = window.visualViewport;
    if (!vv) return;
    root.style.setProperty('--vvh', vv.height + 'px');
    if (phone.matches && editor.open) editor.style.top = vv.offsetTop + 'px';
  }
  window.visualViewport?.addEventListener('resize', fitEditor);
  window.visualViewport?.addEventListener('scroll', fitEditor);

  async function pasteClipboard() {
    try {
      const t = await navigator.clipboard.readText();
      if (!t) throw new Error('empty');
      const { selectionStart: a, selectionEnd: b, value } = editorText;
      editorText.value = value.slice(0, a) + t + value.slice(b);
      countWords();
      setText(editorText.value);
    } catch (e) {
      editorText.focus();
      flash('Long-press the box → Paste', 1600);
    }
  }

  /* ================= RECENT SCRIPTS ================= */
  const titleOf = (t) => (t.split('\n').find((l) => l.trim()) || '').replace(/^\s*#+\s*/, '').trim().slice(0, 70) || 'Untitled';
  function whenOf(ms) {
    const d = new Date(ms), now = new Date();
    const hm = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((day(now) - day(d)) / 864e5);
    if (diff === 0) return 'Today ' + hm;
    if (diff === 1) return 'Yesterday ' + hm;
    return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
  }
  function renderRecent() {
    const list = $('recentList');
    list.innerHTML = '';
    lib.forEach((s) => {
      const li = document.createElement('li');
      li.className = 'rc-item' + (s.id === state.current ? ' is-current' : '');
      const open = document.createElement('button');
      open.className = 'rc-open';
      open.dataset.open = s.id;
      const words = (s.text.match(/\S+/g) || []).length;
      const name = document.createElement('span');
      name.className = 'rc-title';
      name.textContent = titleOf(s.text);
      const meta = document.createElement('span');
      meta.className = 'rc-meta';
      meta.textContent = `${s.id === state.current ? 'Open now · ' : ''}${whenOf(s.updated)} · ${words} words · ${Math.round((s.progress || 0) * 100)}% read`;
      open.append(name, meta);
      const del = document.createElement('button');
      del.className = 'rc-del';
      del.dataset.del = s.id;
      del.setAttribute('aria-label', 'Delete ' + titleOf(s.text));
      del.textContent = '×';
      li.append(open, del);
      list.append(li);
    });
    $('recentNote').textContent = `Saved on this device only · up to ${MAX_RECENT} scripts`;
  }
  function openRecent() {
    stop();
    flushNow();
    if (more.open) more.close();
    renderRecent();
    recent.showModal();
  }
  function switchTo(s, announce) {
    const from = cur();
    from.progress = getProgress();
    if (from !== s) dropIfEmpty(from);
    state.current = s.id;
    touch(s);
    persist();
    renderText();
    restoreProgress(announce);   // same tick: the reflow's scroll event must not overwrite the saved spot
  }
  function newScript() {
    stop();
    if (recent.open) recent.close();
    const from = cur();
    if (!from.text.trim()) return phone.matches ? openEditor() : script.focus();   // already on a blank one
    from.progress = getProgress();
    const s = addScript('');
    switchTo(s, false);
    flash('New script', 900);
    if (phone.matches) openEditor();
    else script.focus();
  }
  $('recentList').addEventListener('click', (e) => {
    const o = e.target.closest('[data-open]');
    const d = e.target.closest('[data-del]');
    if (o) {
      const s = lib.find((x) => x.id === o.dataset.open);
      recent.close();
      if (s) switchTo(s, true);
    } else if (d) {
      const s = lib.find((x) => x.id === d.dataset.del);
      if (!s || (s.text.trim() && !confirm(`Delete "${titleOf(s.text)}"?`))) return;
      lib = lib.filter((x) => x !== s);
      if (!lib.length) addScript('');   // deleting the last one leaves a blank page
      if (s.id === state.current) { state.current = lib[0].id; renderText(); restoreProgress(false); }
      persist();
      renderRecent();
    }
  });
  recent.addEventListener('click', (e) => { if (e.target === recent) recent.close(); });   // tap backdrop

  /* ================= OPEN A .TXT FILE =================
     Scripts are usually written somewhere else; the file becomes a new script. */
  async function openFile(file) {
    if (!file) return;
    if (file.size > 1e6) return flash('File is too big', 1400);
    let text = '';
    try { text = await file.text(); } catch (e) { return flash('Could not read the file', 1400); }
    text = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').replace(/\s+$/, '');
    if (!text) return flash('That file is empty', 1400);
    stop();
    if (editor.open) closeEditor();
    if (recent.open) recent.close();
    if (more.open) more.close();
    switchTo(addScript(text), false);
    flash('Opened ' + file.name.slice(0, 28), 1300);
  }
  $('fileIn').addEventListener('change', (e) => { openFile(e.target.files[0]); e.target.value = ''; });
  const isText = (f) => f && (/^text\//.test(f.type) || /\.(txt|md|text)$/i.test(f.name));
  addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); });
  addEventListener('drop', (e) => {
    const f = e.dataTransfer?.files?.[0];
    if (!f) return;
    e.preventDefault();
    if (isText(f)) openFile(f); else flash('Drop a .txt file', 1400);
  });

  /* ================= FULLSCREEN ================= */
  function measureBar() {
    root.style.setProperty('--bar-h', $('tpBar').offsetHeight + 'px');
  }
  function expand() {
    const on = !body.classList.contains('is-expanded');
    measureBar();
    body.classList.toggle('is-expanded', on);
    const el = document.documentElement;
    try {
      if (on && !document.fullscreenElement) el.requestFullscreen?.({ navigationUI: 'hide' })?.catch(() => {});
      else if (!on && document.fullscreenElement) document.exitFullscreen?.();
    } catch (e) { /* iPhone Safari: no element fullscreen, the toggle still hides the bar */ }
  }
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) body.classList.remove('is-expanded');
  });

  /* ================= SETTINGS SHEET =================
     One dialog, two views: the main list, or a sub-panel with "‹ Back". */
  const moreMain = $('moreMain'), morePanel = $('morePanel');
  let panelClose = null;
  function openSettings(focusId) {
    stop();
    if (!more.open) more.showModal();
    if (focusId) $(focusId)?.scrollIntoView({ block: 'start' });
  }
  function panel(title, el, onClose) {
    panelBack();
    openSettings();
    panelClose = onClose || null;
    morePanel.replaceChildren(el);
    moreMain.hidden = true; morePanel.hidden = false;
    $('moreTitle').textContent = title;
    more.classList.add('has-panel');
    morePanel.scrollTop = 0;
  }
  function panelBack() {
    if (morePanel.hidden) return;
    morePanel.hidden = true; moreMain.hidden = false;
    morePanel.replaceChildren();
    $('moreTitle').textContent = 'Settings';
    more.classList.remove('has-panel');
    const fn = panelClose; panelClose = null;
    fn?.();
  }
  more.addEventListener('close', panelBack);

  /* SIMPLE | PRO — Pro only adds things, and its file is fetched only when switched on */
  function load(name) {
    load.cache ||= {};
    return load.cache[name] ||= new Promise((ok, fail) => {
      const s = document.createElement('script');
      s.src = new URL(`${name}?v=${V}`, HERE);
      s.onload = ok;
      s.onerror = () => { delete load.cache[name]; s.remove(); fail(new Error('could not load ' + name)); };
      document.head.append(s);
    });
  }
  function loadPro() {
    return load('prompter-pro.js').catch(() => flash('Pro needs internet the first time', 1800));
  }
  function setMode(m) {
    if (m !== 'simple' && m !== 'pro') return;
    if (state.mode === m) return;
    state.mode = m;
    applyStyle();
    persist();
    if (m === 'pro') loadPro();
    emit('mode', m);
    emit('change', 'mode', m);
  }
  document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
  document.querySelectorAll('[data-font]').forEach((b) => b.addEventListener('click', () => set('font', b.dataset.font)));

  /* eye line slider: the sheet turns see-through while dragging so the line stays visible */
  let peekTimer = 0;
  function peek() {
    body.classList.add('peek-guide');
    more.classList.add('is-peek');
    clearTimeout(peekTimer);
    peekTimer = setTimeout(() => { body.classList.remove('peek-guide'); more.classList.remove('is-peek'); }, 900);
  }
  $('mLead').addEventListener('input', (e) => { set('lead', +e.target.value); peek(); });
  document.querySelectorAll('[data-lead]').forEach((b) => b.addEventListener('click', () => { set('lead', +b.dataset.lead); peek(); }));

  /* ================= ACTIONS ================= */
  const actions = {
    play: toggle,
    top: toStart,
    align: () => set('align', state.align === 'center' ? 'left' : 'center'),
    flipx: () => set('flipx', !state.flipx),
    flipy: () => {
      const from = scroller.scrollTop;
      set('flipy', !state.flipy);
      scroller.scrollTop = pos = maxScroll() - from;   // stay on the same line, read from the other end
      aimStop(); tick(true); emit('layout');
    },
    guide: () => set('guide', !state.guide),
    countdown: () => set('countdown', !state.countdown),
    dim: () => set('dim', !state.dim),
    expand,
    edit: openEditor,
    done: closeEditor,
    paste: pasteClipboard,
    clear: () => { if (!editorText.value || confirm('Clear the whole script?')) { editorText.value = ''; countWords(); editorText.focus(); } },
    more: () => openSettings(),
    mode: () => openSettings(state.mode === 'pro' ? 'proSection' : null),
    close: () => more.close(),
    'panel-back': panelBack,
    recent: openRecent,
    'recent-close': () => recent.close(),
    new: newScript,
    file: () => $('fileIn').click(),
    install: () => install(),
  };
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    actions[b.dataset.act]?.();
    // a clicker's Enter must reach the prompter, not re-press the last button
    if (e.detail > 0 && !b.closest('dialog')) b.blur();
  });
  more.addEventListener('click', (e) => { if (e.target === more) more.close(); });   // tap backdrop

  /* steppers: tap = one step, hold = keeps going */
  document.querySelectorAll('[data-step]').forEach((b) => {
    const k = b.dataset.step, dir = +b.dataset.dir;
    const step = () => {
      // a fractional speed (set by a target duration) snaps to the next whole number
      const from = k === 'speed' ? (dir > 0 ? Math.floor(state.speed) : Math.ceil(state.speed)) : state[k];
      set(k, from + dir * LIMITS[k].step, true);
    };
    let t1, t2;
    const end = () => { clearTimeout(t1); clearInterval(t2); b.classList.remove('is-held'); };
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      b.classList.add('is-held');
      step();
      t1 = setTimeout(() => { t2 = setInterval(step, 90); }, 420);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => b.addEventListener(ev, end));
    b.addEventListener('click', (e) => { if (e.detail === 0) step(); });   // keyboard Enter/Space
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  /* desktop toolbar inputs */
  const bind = (id, k, cast = Number) => {
    $(id).addEventListener('input', (e) => set(k, cast(e.target.value)));
    $(id).addEventListener('change', (e) => { if (e.target.closest('.tp-bar')) e.target.blur(); });   // hand the arrow keys back
  };
  bind('tbSize', 'size'); bind('tbMargin', 'margin'); bind('tbSpeed', 'speed');
  bind('tbBg', 'bg', String); bind('tbFg', 'fg', String);
  bind('mBg', 'bg', String); bind('mFg', 'fg', String);
  document.querySelectorAll('.sh-theme').forEach((b) => b.addEventListener('click', () => {
    set('bg', b.dataset.bg); set('fg', b.dataset.fg);
  }));

  /* phone: a quick tap on the text = play / pause (drags still scroll);
     a second tap right after undoes that and steps back two lines instead,
     so a single tap never has to wait to find out whether it's a double. */
  let tap = null, lastTap = 0;
  scroller.addEventListener('pointerdown', (e) => { tap = { x: e.clientX, y: e.clientY, t: e.timeStamp }; });
  scroller.addEventListener('pointerup', (e) => {
    if (!tap || !phone.matches) return;
    const still = Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 10 && e.timeStamp - tap.t < 350;
    tap = null;
    if (!still) return;
    const twice = e.timeStamp - lastTap < 320;
    lastTap = twice ? 0 : e.timeStamp;
    toggle();
    if (twice) nudgeLines(-2);
  });
  scroller.addEventListener('pointercancel', () => { tap = null; });

  /* ================= KEYBOARD + BLUETOOTH CLICKERS =================
     Presentation clickers and shutter buttons send Enter / PageDown / arrows.
     Pro can remap any key through state.keys = { '<key>': '<command>' }. */
  const commands = {
    toggle,
    back: () => nudgeLines(-2),
    forward: () => nudgeLines(2),
    top: toStart,
    faster: () => set('speed', Math.floor(state.speed) + 1, true),
    slower: () => set('speed', Math.ceil(state.speed) - 1, true),
    bigger: () => set('size', state.size + LIMITS.size.step, true),
    smaller: () => set('size', state.size - LIMITS.size.step, true),
    expand,
  };
  const KEYS = {
    ' ': 'toggle', Enter: 'toggle', PageDown: 'toggle', ArrowRight: 'toggle',
    PageUp: 'back', ArrowLeft: 'back',
    '.': 'top', b: 'top', B: 'top', Home: 'top',
    ArrowUp: 'faster', ArrowDown: 'slower',
    '+': 'bigger', '=': 'bigger', '-': 'smaller',
    f: 'expand',
  };
  const keyName = (e) => (e.key && e.key !== 'Unidentified' ? e.key : e.code);
  let keyTrap = null;   // Pro's "Map clicker" borrows the next key press
  document.addEventListener('keydown', (e) => {
    if (keyTrap) { e.preventDefault(); const fn = keyTrap; keyTrap = null; fn(keyName(e)); return; }
    if (editor.open || more.open || recent.open) return;
    const typing = document.activeElement === script && !playing;
    if (e.key === 'Escape') {
      if (typing) script.blur();
      else if (body.classList.contains('is-expanded')) expand();
      return;
    }
    if (typing || e.target.matches?.('input, textarea, select')) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = keyName(e);
    if (k !== ' ' && e.target.closest?.('button, a')) return;   // let Enter press the focused button
    const name = (state.mode === 'pro' && state.keys?.[k]) || KEYS[k];
    const fn = commands[name];
    if (fn) { e.preventDefault(); fn(); }
  });

  phone.addEventListener('change', () => { renderText(); makeEditable(); });

  /* ================= BACKUP (used by Pro) ================= */
  function dump() {
    flushNow();
    return { state: { ...state }, scripts: lib.map((s) => ({ ...s })) };
  }
  // merges by id — never wipes what's already here; the newer copy of a script wins
  function restore(data) {
    let added = 0, updated = 0;
    (Array.isArray(data?.scripts) ? data.scripts : []).forEach((s) => {
      if (!s || typeof s.text !== 'string' || !s.id) return;
      const mine = lib.find((x) => x.id === String(s.id));
      const when = +s.updated || Date.now();
      if (!mine) { lib.push({ id: String(s.id), text: s.text, progress: Math.min(1, Math.max(0, +s.progress || 0)), updated: when }); added++; }
      else if (when > mine.updated && s.text !== mine.text) { mine.text = s.text; mine.updated = when; updated++; }
    });
    const blank = !cur().text.trim();
    lib.sort((a, b) => b.updated - a.updated);
    if (blank && added) { lib = lib.filter((x) => x.text.trim()); state.current = lib[0].id; }
    lib = lib.slice(0, MAX_RECENT);
    const st = data?.state;
    if (st && typeof st === 'object') {
      Object.keys(DEFAULTS).forEach((k) => {
        if (k === 'text' || k === 'mode' || !(k in st)) return;
        if (typeof st[k] === typeof DEFAULTS[k] || (k === 'lead' && (st[k] === null || typeof st[k] === 'number'))) state[k] = st[k];
      });
      if (st.keys && typeof st.keys === 'object') state.keys = { ...st.keys };
    }
    applyStyle();
    renderText();
    restoreProgress(false);
    persist();
    emit('change', 'restore');
    return { added, updated };
  }

  /* ================= INSTALL + OFFLINE (PWA) ================= */
  const toastEl = $('toast');
  let toastFn = null;
  function toast(msg, onTap) {
    toastEl.textContent = msg;
    toastEl.hidden = !msg;
    toastFn = onTap || null;
  }
  toastEl.addEventListener('click', () => { const fn = toastFn; toast(''); fn?.(); });

  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const installBtn = $('installBtn');
  let installEvt = null;
  const showInstall = () => { installBtn.hidden = standalone() || !(installEvt || isIOS); };
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; showInstall(); });
  addEventListener('appinstalled', () => { installEvt = null; showInstall(); flash('Installed', 1200); });
  async function install() {
    if (installEvt) {
      const evt = installEvt; installEvt = null;
      evt.prompt();
      await evt.userChoice.catch(() => {});
      return showInstall();
    }
    // iPhone has no install prompt — show where Apple hides the button
    const el = document.createElement('div');
    el.className = 'sh-steps';
    el.innerHTML = `
      <ol>
        <li><span>Tap <b>Share</b> in Safari's toolbar</span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3M8 7l4-4 4 4M6 11H5v10h14V11h-1"/></svg></li>
        <li><span>Scroll down and tap <b>Add to Home Screen</b></span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/></svg></li>
        <li><span>Tap <b>Add</b>. The prompter then opens full screen and works offline.</span></li>
      </ol>`;
    panel('Install on iPhone', el);
  }
  showInstall();

  // localhost stays uncached while developing; add ?sw=1 to try the offline behaviour there
  const dev = ['localhost', '127.0.0.1'].includes(location.hostname);
  if ('serviceWorker' in navigator && (!dev || /[?&]sw=1/.test(location.search))) {
    let wantReload = false;
    const offer = (reg) => {
      if (!reg.waiting || !navigator.serviceWorker.controller) return;
      toast('New version — tap to reload', () => { wantReload = true; reg.waiting?.postMessage('skip'); });
    };
    navigator.serviceWorker.register(new URL('../tools/sw.js', HERE)).then((reg) => {
      offer(reg);
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        sw?.addEventListener('statechange', () => { if (sw.state === 'installed') offer(reg); });
      });
    }).catch(() => { /* offline support is a bonus */ });
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (wantReload) location.reload(); });
  }

  /* ================= PUBLIC API ================= */
  window.TP = {
    get state() { return state; },
    get playing() { return playing || !!counting; },
    set, play, stop, toggle, toStart,
    nudgeLines, jumpToOffset,
    jumpTo: (p) => jumpToOffset(p * metrics.textH),
    progress: readProgress,
    offset: dist,
    secondsLeft,
    duration: () => metrics.textH / (state.speed * PX_PER_SPEED),   // seconds for the whole script at this speed
    speedFor: (secs) => metrics.textH / (secs * PX_PER_SPEED),      // speed that finishes in that many seconds
    text: () => script.textContent,   // stays on this device — never sent to a remote
    title: () => titleOf(cur().text),
    words: () => (cur().text.match(/\S+/g) || []).length,
    flash, toast, on, emit, load,
    commands, defaultKeys: KEYS,
    trapKey: (fn) => { keyTrap = fn; },
    setStops,
    /* pixels from the start at which each character index reaches the eye line */
    offsetsOf(indices) {
      measure();
      const box = script.getBoundingClientRect();
      const lineH = state.size * state.line;
      const nodes = [];
      const walker = document.createTreeWalker(script, NodeFilter.SHOW_TEXT);
      for (let n, at = 0; (n = walker.nextNode()); at += n.data.length) nodes.push({ n, at });
      const range = document.createRange();
      return indices.map((i) => {
        const hit = nodes.find((x) => i >= x.at && i < x.at + x.n.data.length);
        if (!hit) return null;
        range.setStart(hit.n, i - hit.at); range.setEnd(hit.n, i - hit.at + 1);
        const r = range.getClientRects()[0] || range.getBoundingClientRect();
        const y = (state.flipy ? box.bottom - r.bottom : r.top - box.top) - Math.max(0, (lineH - r.height) / 2);
        return Math.max(0, y - metrics.lead);
      });
    },
    dump, restore,
    setMode, openSettings, panel, panelBack,
    addSettingsSection: (el) => $('appSection').before(el),
    addToolbarGroup: (el) => $('modeChip').before(el),
    version: V,
  };

  /* ================= INIT ================= */
  applyStyle();
  renderText();
  makeEditable();
  measureBar();
  persist();   // stores the upgraded format right away
  restoreProgress(true);   // pick up where you left off
  if (state.mode === 'pro') loadPro();
})();
