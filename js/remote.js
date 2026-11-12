/* Teleprompter Remote — the page on the second phone / laptop.
   Sends button presses ('cmd'), shows what the prompter reports back ('st').
   It never receives the script: only a title, section names and numbers. */
(() => {
  const $ = (id) => document.getElementById(id);
  const KEY = 'ihsan.prompter.remote';   // last code used, so a refresh reconnects by itself
  const valid = (c) => /^[A-HJKMNP-Z2-9]{6}$/.test(c);
  const clean = (c) => (c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  const body = document.body;
  const statusEl = $('status');
  let room = null, code = '', hosts = 0, link = 'offline';
  let st = { p: 0, on: false, sp: null, sz: null, left: 0, t: '', cs: -1 };
  let sections = [];

  /* ================= CONNECTION ================= */
  function showStatus() {
    const [tone, text] = !room ? ['wait', 'Not connected']
      : navigator.onLine === false ? ['bad', 'No internet']
      : link !== 'online' ? ['wait', 'Connecting…']
      : hosts ? ['ok', 'Connected'] : ['wait', 'Waiting for prompter'];
    statusEl.dataset.tone = tone;
    statusEl.textContent = text;
    body.classList.toggle('is-away', !(room && link === 'online' && hosts));
  }
  function connect(c) {
    code = c;
    try { localStorage.setItem(KEY, c); } catch (e) { /* storage blocked */ }
    if (location.hash.slice(1) !== c) history.replaceState(null, '', '#' + c);
    $('join').hidden = true; $('pad').hidden = false; $('foot').hidden = false;
    $('code').textContent = c;
    room = window.RT.join('tp:' + c, { role: 'remote' });
    room.on('status', (s) => { link = s; showStatus(); });
    room.on('open', () => room.send('cmd', { a: 'hello' }));
    room.on('peers', (n) => {
      if (n.host && !hosts) room.send('cmd', { a: 'hello' });   // prompter just came (back) online
      hosts = n.host;
      showStatus();
    });
    room.on('st', onState);
    link = room.status;
    showStatus();
    wake();
  }
  function leave() {
    room?.leave();
    room = null; hosts = 0; code = '';
    try { localStorage.removeItem(KEY); } catch (e) { /* storage blocked */ }
    history.replaceState(null, '', location.pathname);
    $('pad').hidden = true; $('foot').hidden = true; $('join').hidden = false;
    $('codeIn').value = ''; $('go').disabled = true;
    showStatus();
  }
  const cmd = (a, v) => {
    if (navigator.vibrate) navigator.vibrate(10);
    return room?.send('cmd', v === undefined ? { a } : { a, v });
  };

  /* ================= STATE FROM THE PROMPTER ================= */
  function onState(m) {
    if (!m || typeof m !== 'object') return;
    if (m.bye) { hosts = 0; st.on = false; render(); return showStatus(); }   // prompter hung up or changed its code
    const p = st.p;
    Object.assign(st, m);
    if (seeking) st.p = p;   // the thumb is on the bar: don't fight it
    if (Array.isArray(m.sec)) { sections = m.sec.map(String).slice(0, 40); drawSections(); }
    render();
  }
  function render() {
    body.classList.toggle('is-on', !!st.on);
    $('play').setAttribute('aria-label', st.on ? 'Pause' : 'Play');
    $('title').textContent = st.t || 'Untitled';
    const pct = Math.round((+st.p || 0) * 100);
    $('pct').textContent = pct + '%';
    $('bar').style.setProperty('--p', +st.p || 0);
    $('bar').setAttribute('aria-valuenow', pct);
    $('left').textContent = '−' + fmtTime(+st.left || 0);
    $('speed').textContent = st.sp == null ? '–' : (Number.isInteger(st.sp) ? st.sp : (+st.sp).toFixed(1));
    $('size').textContent = st.sz == null ? '–' : st.sz;
    [...$('secs').children].forEach((b, k) => b.setAttribute('aria-current', k === st.cs));
  }
  function drawSections() {
    const box = $('secs');
    box.replaceChildren(...sections.map((name, k) => {
      const b = document.createElement('button');
      b.className = 'rm-sec';
      b.textContent = name;
      b.addEventListener('click', () => { st.cs = k; render(); cmd('section', k); });
      return b;
    }));
    box.hidden = !sections.length;
  }

  /* ================= BUTTONS ================= */
  $('play').addEventListener('click', () => {
    st.on = !st.on; render();   // answer the thumb at once; the prompter's next report settles it
    cmd('toggle');
  });
  document.querySelectorAll('[data-cmd]').forEach((b) => {
    const fire = () => cmd(b.dataset.cmd, b.dataset.v === undefined ? undefined : +b.dataset.v);
    if (!('hold' in b.dataset)) return b.addEventListener('click', fire);
    // held: repeats, at most 8 a second
    let t1, t2;
    const end = () => { clearTimeout(t1); clearInterval(t2); b.classList.remove('is-held'); };
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      b.classList.add('is-held');
      fire();
      t1 = setTimeout(() => { t2 = setInterval(fire, 125); }, 420);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => b.addEventListener(ev, end));
    b.addEventListener('click', (e) => { if (e.detail === 0) fire(); });
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  /* drag or tap the bar to move through the script; sent once, on release */
  const bar = $('bar');
  let seeking = false;
  const at = (e) => { const r = bar.getBoundingClientRect(); return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); };
  bar.addEventListener('pointerdown', (e) => { seeking = true; bar.setPointerCapture(e.pointerId); st.p = at(e); render(); });
  bar.addEventListener('pointermove', (e) => { if (seeking) { st.p = at(e); render(); } });
  bar.addEventListener('pointerup', (e) => { if (!seeking) return; seeking = false; cmd('jump', Math.round(at(e) * 1000) / 1000); });
  bar.addEventListener('pointercancel', () => { seeking = false; });

  $('leave').addEventListener('click', leave);

  /* laptop as a remote */
  document.addEventListener('keydown', (e) => {
    if (!room || e.target.matches('input') || e.ctrlKey || e.metaKey || e.altKey) return;
    const keys = {
      ' ': () => $('play').click(), Enter: () => $('play').click(),
      ArrowLeft: () => cmd('nudge', -2), ArrowRight: () => cmd('nudge', 2),
      ArrowUp: () => cmd('speed', 1), ArrowDown: () => cmd('speed', -1),
      Home: () => cmd('top'),
    };
    const fn = keys[e.key];
    if (fn) { e.preventDefault(); if (!e.repeat || e.key.startsWith('Arrow')) fn(); }
  });

  /* ================= PAIRING FORM ================= */
  const codeIn = $('codeIn');
  codeIn.addEventListener('input', () => {
    codeIn.value = clean(codeIn.value);
    $('go').disabled = !valid(codeIn.value);
  });
  $('join').addEventListener('submit', (e) => {
    e.preventDefault();
    if (valid(codeIn.value)) connect(codeIn.value);
  });
  addEventListener('hashchange', () => {
    const c = clean(location.hash.slice(1));
    if (valid(c) && c !== code) { room?.leave(); room = null; connect(c); }
  });
  addEventListener('online', showStatus);
  addEventListener('offline', showStatus);

  /* keep this screen awake too — a remote that locks itself is no remote */
  let lock = null;
  async function wake() {
    try {
      if (room && !lock && 'wakeLock' in navigator && document.visibilityState === 'visible') {
        lock = await navigator.wakeLock.request('screen');
        lock.addEventListener('release', () => { lock = null; });
      }
    } catch (e) { /* not allowed — fine */ }
  }
  document.addEventListener('visibilitychange', wake);

  /* ================= START ================= */
  let saved = '';
  try { saved = localStorage.getItem(KEY) || ''; } catch (e) { /* storage blocked */ }
  const first = clean(location.hash.slice(1));
  if (!window.RT?.ready()) {
    statusEl.dataset.tone = 'bad'; statusEl.textContent = 'Remote is not available';
    $('join').hidden = false;
  } else if (valid(first)) connect(first);
  else if (valid(saved)) connect(saved);
  else { $('join').hidden = false; showStatus(); }

  // same service worker as the prompter (installable, opens offline — the remote itself still needs internet)
  const dev = ['localhost', '127.0.0.1'].includes(location.hostname);
  if ('serviceWorker' in navigator && (!dev || /[?&]sw=1/.test(location.search))) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
