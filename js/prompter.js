/* Teleprompter — free tool.
   One state object drives both the desktop toolbar and the phone dock;
   everything persists to localStorage (wrapped: storage can be blocked). */
(() => {
  const KEY = 'ihsan.prompter';
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
  const phone = matchMedia('(max-width: 820px), (max-height: 520px)');

  let state = { ...DEFAULTS };
  try { Object.assign(state, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* storage blocked */ }
  if (phone.matches && !hasSaved()) state.size = 40;   // phones start at a size that fits a few words per line

  function hasSaved() {
    try { return !!localStorage.getItem(KEY); } catch (e) { return false; }
  }
  let saveTimer;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage blocked */ }
    }, 250);
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
    script.textContent = state.text;
    script.dataset.placeholder = phone.matches ? 'Tap EDIT to add your script' : 'Paste your script here';
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
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && playing) wake(true);
  });

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
    state.text = script.innerText.replace(/\n$/, '');
    if (!state.text.trim()) script.textContent = '';
    save();
  });

  /* ================= EDITOR SHEET (phone) ================= */
  function countWords() {
    const n = (editorText.value.match(/\S+/g) || []).length;
    const secs = Math.round(n / 150 * 60);   // ~150 words per minute spoken
    $('wordCount').textContent = `${n} words · ~${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')} min`;
  }
  function openEditor() {
    stop();
    editorText.value = state.text;
    countWords();
    editor.showModal();
    fitEditor();
    if (!state.text) editorText.focus();
  }
  function closeEditor() {
    state.text = editorText.value.replace(/\s+$/, '');
    renderText();
    save();
    editorText.blur();
    if (editor.open) editor.close();
    toStart();
  }
  editorText.addEventListener('input', countWords);
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
    } catch (e) {
      editorText.focus();
      flash('Long-press the box → Paste', 1600);
    }
  }

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
    if (editor.open || more.open) return;
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
  requestAnimationFrame(toStart);
})();
