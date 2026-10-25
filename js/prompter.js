/* Teleprompter — free tool.
   One state object drives both the desktop toolbar and the phone dock;
   everything persists to localStorage (wrapped: storage can be blocked). */
(() => {
  const KEY = 'ihsan.prompter';
  const LIB_KEY = 'ihsan.prompter.scripts';   // recent scripts, newest first
  const MAX_RECENT = 10;
  const LIMITS = {
    size: { min: 20, max: 180, step: 4 },
    speed: { min: 1, max: 50, step: 1 },
    margin: { min: 0, max: 40, step: 2 },
  };
  const DEFAULTS = {
    text: '', size: 58, margin: 5, speed: 10, align: 'left',
    flipx: false, flipy: false, bg: '#000000', fg: '#ffffff',
    guide: false, countdown: false,
  };
  const PX_PER_SPEED = 4;   // speed 10 → 40px per second

  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;
  const body = document.body;
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
  }

  const clamp = (k, v) => Math.min(LIMITS[k].max, Math.max(LIMITS[k].min, v));
  const maxScroll = () => Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  const startPos = () => (state.flipy ? maxScroll() : 0);

  /* ================= RENDER ================= */
  function applyStyle() {
    root.style.setProperty('--size', state.size + 'px');
    root.style.setProperty('--margin', state.margin + '%');
    root.style.setProperty('--align', state.align);
    root.style.setProperty('--sx', state.flipx ? -1 : 1);
    root.style.setProperty('--sy', state.flipy ? -1 : 1);
    root.style.setProperty('--bg', state.bg);
    root.style.setProperty('--fg', state.fg);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', state.bg);
    body.classList.toggle('show-guide', state.guide);
    body.classList.toggle('flip-y', state.flipy);
    syncControls();
  }

  function syncControls() {
    $('tbSize').value = state.size; $('tbSizeVal').textContent = state.size;
    $('tbMargin').value = state.margin; $('tbMarginVal').textContent = state.margin;
    $('tbSpeed').value = state.speed; $('tbSpeedVal').textContent = state.speed;
    $('tbBg').value = state.bg; $('tbFg').value = state.fg;
    $('mBg').value = state.bg; $('mFg').value = state.fg;
    $('dkSize').textContent = state.size;
    $('dkSpeed').textContent = state.speed;
    $('dkMargin').textContent = state.margin + '%';
    const pressed = { align: state.align === 'center', flipx: state.flipx, flipy: state.flipy, guide: state.guide, countdown: state.countdown };
    document.querySelectorAll('[data-act][aria-pressed]').forEach((b) => {
      if (b.dataset.act in pressed) b.setAttribute('aria-pressed', pressed[b.dataset.act]);
    });
    document.querySelectorAll('.sh-theme').forEach((b) => {
      b.setAttribute('aria-pressed', b.dataset.bg === state.bg && b.dataset.fg === state.fg);
    });
  }

  function renderText() {
    script.textContent = cur().text;
    script.dataset.placeholder = phone.matches ? 'Tap EDIT to add your script' : 'Paste your script here';
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
  }

  // changing size/margin reflows the text — keep the reader at the same spot
  function keepPlace(fn) {
    const ratio = scroller.scrollHeight ? scroller.scrollTop / scroller.scrollHeight : 0;
    fn();
    scroller.scrollTop = pos = ratio * scroller.scrollHeight;
  }

  function set(k, v, announce) {
    if (k in LIMITS) v = clamp(k, v);
    if (state[k] === v) return;
    if (k === 'size' || k === 'margin') keepPlace(() => { state[k] = v; applyStyle(); });
    else state[k] = v;
    applyStyle();
    save();
    if (announce) flash(`${k.toUpperCase()} ${v}${k === 'margin' ? '%' : ''}`);
  }

  /* ================= HUD ================= */
  let hudTimer;
  function flash(msg, ms = 700, cls = '') {
    hud.textContent = msg;
    hud.className = 'tp-hud is-on ' + cls;
    clearTimeout(hudTimer);
    hudTimer = setTimeout(() => { hud.className = 'tp-hud ' + cls; }, ms);
  }

  /* ================= SCROLL ENGINE ================= */
  let playing = false, raf = 0, last = 0, pos = 0, counting = 0;

  function frame(now) {
    if (!playing) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    // user dragged/wheeled the text mid-read: continue from where they left it
    if (Math.abs(scroller.scrollTop - pos) > 3) pos = scroller.scrollTop;
    pos += (state.flipy ? -1 : 1) * state.speed * PX_PER_SPEED * dt;
    const max = maxScroll();
    if (pos >= max || pos <= 0) {
      pos = Math.min(max, Math.max(0, pos));
      scroller.scrollTop = pos;
      return stop();
    }
    scroller.scrollTop = pos;
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
    script.contentEditable = 'false';
    script.blur();
    setPlayingUI(true);
    wake(true);
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    if (counting) { clearTimeout(counting); counting = 0; hud.className = 'tp-hud'; }
    playing = false;
    cancelAnimationFrame(raf);
    setPlayingUI(false);
    makeEditable();
    wake(false);
  }
  const toggle = () => (playing || counting ? stop() : play());

  function setPlayingUI(on) {
    body.classList.toggle('is-playing', on);
    ['tbPlay', 'dkPlay'].forEach((id) => $(id).setAttribute('aria-label', on ? 'Pause' : 'Play'));
  }

  function toStart() {
    scroller.scrollTop = pos = startPos();
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
  }, { passive: true });

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
  const titleOf = (t) => (t.split('\n').find((l) => l.trim()) || '').trim().slice(0, 70) || 'Untitled';
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
    },
    guide: () => set('guide', !state.guide),
    countdown: () => set('countdown', !state.countdown),
    expand,
    edit: openEditor,
    done: closeEditor,
    paste: pasteClipboard,
    clear: () => { if (!editorText.value || confirm('Clear the whole script?')) { editorText.value = ''; countWords(); editorText.focus(); } },
    more: () => { stop(); more.showModal(); },
    close: () => more.close(),
    recent: openRecent,
    'recent-close': () => recent.close(),
    new: newScript,
  };
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    actions[b.dataset.act]?.();
    if (b.dataset.act === 'play' || b.dataset.act === 'top') b.blur();
  });
  more.addEventListener('click', (e) => { if (e.target === more) more.close(); });   // tap backdrop

  /* steppers: tap = one step, hold = keeps going */
  document.querySelectorAll('[data-step]').forEach((b) => {
    const k = b.dataset.step, dir = +b.dataset.dir;
    const step = () => set(k, state[k] + dir * LIMITS[k].step, true);
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
  const bind = (id, k, cast = Number) => $(id).addEventListener('input', (e) => set(k, cast(e.target.value)));
  bind('tbSize', 'size'); bind('tbMargin', 'margin'); bind('tbSpeed', 'speed');
  bind('tbBg', 'bg', String); bind('tbFg', 'fg', String);
  bind('mBg', 'bg', String); bind('mFg', 'fg', String);
  document.querySelectorAll('.sh-theme').forEach((b) => b.addEventListener('click', () => {
    set('bg', b.dataset.bg); set('fg', b.dataset.fg);
  }));

  /* phone: a quick tap on the text = play / pause (drags still scroll) */
  let tap = null;
  scroller.addEventListener('pointerdown', (e) => { tap = { x: e.clientX, y: e.clientY, t: e.timeStamp }; });
  scroller.addEventListener('pointerup', (e) => {
    if (!tap || !phone.matches) return;
    const still = Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 10 && e.timeStamp - tap.t < 350;
    tap = null;
    if (still) toggle();
  });
  scroller.addEventListener('pointercancel', () => { tap = null; });

  /* keyboard */
  document.addEventListener('keydown', (e) => {
    if (editor.open || more.open || recent.open) return;
    const typing = document.activeElement === script && !playing;
    if (e.key === 'Escape') {
      if (typing) script.blur();
      else if (body.classList.contains('is-expanded')) expand();
      return;
    }
    if (typing || e.target.matches?.('input, textarea')) return;
    const keys = {
      ' ': toggle,
      ArrowUp: () => set('speed', state.speed + 1, true),
      ArrowDown: () => set('speed', state.speed - 1, true),
      '+': () => set('size', state.size + LIMITS.size.step, true),
      '=': () => set('size', state.size + LIMITS.size.step, true),
      '-': () => set('size', state.size - LIMITS.size.step, true),
      Home: toStart,
      f: expand,
    };
    const fn = keys[e.key];
    if (fn) { e.preventDefault(); fn(); }
  });

  phone.addEventListener('change', () => { renderText(); makeEditable(); });

  /* ================= INIT ================= */
  applyStyle();
  renderText();
  makeEditable();
  measureBar();
  persist();   // stores the upgraded format right away
  restoreProgress(true);   // pick up where you left off
})();
