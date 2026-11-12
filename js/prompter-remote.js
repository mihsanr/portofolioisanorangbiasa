/* Teleprompter — Remote, prompter side (Pro).
   Fetched only when Remote is opened or was left on.
   A second phone or laptop opens tools/remote.html with a 6-character code and
   sends button presses over Supabase Realtime Broadcast. What travels back:
   progress, speed, size, time left, the script's first line and section names.
   The script itself never leaves this device. */
(() => {
  const TP = window.TP, RT = window.RT;
  if (!TP?.pro || !RT || TP.remote) return;
  const { h, row, note } = TP.pro;
  const S = () => TP.state;
  const ROOM_KEY = 'ihsan.prompter.room';
  const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // no look-alikes (0/O, 1/I/L)

  function newCode() {
    const pick = crypto.getRandomValues(new Uint8Array(6));
    return [...pick].map((n) => ALPHABET[n % ALPHABET.length]).join('');
  }
  let code = '';
  try { code = localStorage.getItem(ROOM_KEY) || ''; } catch (e) { /* storage blocked */ }
  if (!/^[A-Z2-9]{6}$/.test(code)) saveCode(newCode());
  function saveCode(c) {
    code = c;
    try { localStorage.setItem(ROOM_KEY, c); } catch (e) { /* storage blocked */ }
  }
  const link = () => { const u = new URL('remote.html', location.href); u.search = ''; u.hash = code; return u.href; };

  /* ================= CONNECTION ================= */
  let room = null, remotes = 0, status = 'off';   // off | connecting | online | offline
  function connect() {
    if (room || S().mode !== 'pro') return;
    room = RT.join('tp:' + code, { role: 'host' });
    status = room.status;
    room.on('status', (s) => { status = s; render(); });
    room.on('open', () => send(true));
    room.on('peers', (n) => {
      const before = remotes;
      remotes = n.remote;
      if (remotes > before) { send(true); if (!TP.playing) TP.flash('Remote connected', 1100); }
      render();
    });
    room.on('cmd', onCmd);
    render();
  }
  function disconnect() {
    room?.send('st', { bye: 1 });   // tell remotes now; presence would take a second or two
    room?.leave();
    room = null; remotes = 0; status = 'off';
    render();
  }
  function setOn(on) {
    TP.set('remote', on);
    if (on) connect(); else disconnect();
    render();
  }
  function changeCode() {
    const was = !!room;
    disconnect();          // everyone on the old code is left behind
    saveCode(newCode());
    if (was) connect();
    draw();
  }

  /* ================= COMMANDS IN ================= */
  function onCmd(m) {
    if (!m || typeof m.a !== 'string') return;
    const v = Number(m.v);
    switch (m.a) {
      case 'hello': return send(true);
      case 'toggle': TP.toggle(); break;
      case 'play': TP.play(); break;
      case 'pause': TP.stop(); break;
      case 'top': TP.toStart(); break;
      case 'nudge': if (Number.isFinite(v)) TP.nudgeLines(Math.max(-20, Math.min(20, Math.round(v)))); break;
      case 'speed': (v > 0 ? TP.commands.faster : TP.commands.slower)(); break;
      case 'size': (v > 0 ? TP.commands.bigger : TP.commands.smaller)(); break;
      case 'jump': if (Number.isFinite(v)) TP.jumpTo(Math.max(0, Math.min(1, v))); break;
      case 'section': TP.pro.jumpSection(v); break;
      default: return;
    }
    send();
  }

  /* ================= STATE OUT =================
     At once on a change, at most twice a second while the text is moving. */
  let lastSent = 0, sendTimer = 0, sentSec = '';
  function send(full) {
    if (!room || room.status !== 'online' || !remotes) return;
    if (full) sentSec = '';
    const wait = 120 - (performance.now() - lastSent);
    if (wait > 0) { if (!sendTimer) sendTimer = setTimeout(() => { sendTimer = 0; send(); }, wait); return; }
    lastSent = performance.now();
    const st = {
      p: Math.round(TP.progress() * 1000) / 1000,
      on: TP.playing,
      sp: S().speed, sz: S().size,
      left: Math.round(TP.secondsLeft()),
      t: TP.title(),
      cs: TP.pro.currentSection(),
    };
    const names = TP.pro.sections().map((s) => s.name);
    const key = JSON.stringify(names);
    if (key !== sentSec) { st.sec = names; sentSec = key; }   // section names only when they change
    room.send('st', st);
  }
  TP.on('tick', () => { if (performance.now() - lastSent >= 500) send(); });
  ['play', 'stop', 'change', 'script', 'sections', 'autopause'].forEach((ev) => TP.on(ev, () => send()));

  /* Pro switched off → hang up. Hidden for 10 minutes → hang up, reconnect when back. */
  TP.on('mode', (m) => { if (m !== 'pro') disconnect(); else if (S().remote) connect(); });
  let idle = 0;
  document.addEventListener('visibilitychange', () => {
    clearTimeout(idle);
    if (document.visibilityState === 'hidden') idle = setTimeout(disconnect, 10 * 60 * 1000);
    else if (S().remote && !room) connect();
  });
  addEventListener('online', render);
  addEventListener('offline', render);

  /* ================= UI ================= */
  const pill = h('span', { className: 'tp-pill tp-remote pro-only', hidden: true });
  document.getElementById('status').prepend(pill);

  const tbBtn = TP.pro.remoteBtn;

  function label() {
    if (!S().remote) return ['off', 'Off'];
    if (navigator.onLine === false) return ['bad', 'Needs internet'];
    if (status === 'online') return remotes ? ['ok', `${remotes} connected`] : ['wait', 'Waiting for a remote'];
    if (status === 'connecting') return ['wait', 'Reconnecting…'];
    return ['bad', 'Offline'];
  }
  let panelEls = null;
  function render() {
    const [tone, text] = label();
    pill.hidden = !S().remote;
    pill.dataset.tone = tone;
    pill.textContent = '● REMOTE';
    tbBtn.dataset.tone = tone;
    TP.pro.remoteRow?.sub(S().remote ? `${code} · ${text}` : 'Control from a second phone or laptop');
    if (panelEls) {
      panelEls.toggle.textContent = S().remote ? 'ON' : 'OFF';
      panelEls.toggle.setAttribute('aria-pressed', !!S().remote);
      panelEls.state.dataset.tone = tone;
      panelEls.state.textContent = '● ' + text;
    }
  }

  /* the code, big enough to type from across the desk, and the same thing as a QR */
  function draw() {
    if (!panelEls) return;
    panelEls.code.textContent = code;
    panelEls.url.textContent = link().replace(/^https?:\/\//, '').replace(/#.*/, '');
    const cv = panelEls.qr;
    TP.load('vendor/qrcode.min.js').then(() => {
      const qr = window.qrcode(0, 'M');
      qr.addData(link());
      qr.make();
      const n = qr.getModuleCount(), quiet = 4, cell = Math.max(4, Math.floor(480 / (n + quiet * 2)));
      cv.width = cv.height = cell * (n + quiet * 2);
      const g = cv.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
      g.fillStyle = '#000';
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) g.fillRect((c + quiet) * cell, (r + quiet) * cell, cell, cell);
      cv.hidden = false;
    }).catch(() => { cv.hidden = true; });
    render();
  }

  function open() {
    const toggle = h('button', { className: 'sh-toggle', onclick: () => setOn(!S().remote) });
    const state = h('span', { className: 'rm-state' });
    const qr = h('canvas', { className: 'rm-qr', hidden: true, ariaLabel: 'QR code that opens the remote' });
    const codeEl = h('output', { className: 'rm-code' });
    const url = h('span', { className: 'rm-url' });
    const copy = h('button', {
      className: 'sh-chip', textContent: 'Copy link',
      onclick: async () => {
        try { await navigator.clipboard.writeText(link()); copy.textContent = 'Copied'; } catch (e) { copy.textContent = 'Copy failed'; }
        setTimeout(() => { copy.textContent = 'Copy link'; }, 1400);
      },
    });
    panelEls = { toggle, state, qr, code: codeEl, url };
    const fresh = row('New code', changeCode);
    fresh.sub('Disconnects every remote that used the old one'); fresh.go.textContent = '↻';
    TP.panel('Remote', h('div', { className: 'sh-section' },
      h('div', { className: 'sh-line' }, h('span', { textContent: 'Remote' }), toggle),
      state,
      h('div', { className: 'rm-pair' }, qr,
        h('div', { className: 'rm-how' },
          note('On the other phone or laptop, scan this or open'),
          url,
          note('and type the code:'),
          codeEl, copy)),
      fresh.el,
      note('Only button presses travel through the internet. Your script stays on this device.')),
    () => { panelEls = null; });
    draw();
    if (!S().remote) setOn(true);   // opening the sheet is asking for it
  }

  TP.remote = { open, get code() { return code; }, get connected() { return remotes; } };
  render();
  if (S().remote) connect();
})();
