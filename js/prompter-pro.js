/* Teleprompter — Pro features. Fetched only when Pro mode is switched on.
   Sections (## Title), auto-pause ([jeda] or //), target duration,
   clicker key mapping, backup. Everything stays on this device. */
(() => {
  const TP = window.TP;
  if (!TP || TP.pro) return;
  const S = () => TP.state;
  const isPro = () => S().mode === 'pro';

  /* tiny DOM helper: h('button', { className, textContent, onclick }, ...children) */
  const h = (tag, props, ...kids) => {
    const el = Object.assign(document.createElement(tag), props || {});
    el.append(...kids.filter((k) => k != null));
    return el;
  };
  const note = (text) => h('p', { className: 'sh-note', textContent: text });
  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  function row(title, onclick) {
    const sub = h('small');
    const go = h('span', { className: 'sh-row-go', textContent: '›' });
    const el = h('button', { className: 'sh-row', onclick }, h('span', null, title, sub), go);
    return { el, sub: (t) => { sub.textContent = t; }, go };
  }
  /* tap = once, hold = keeps going (same feel as the dock steppers) */
  function hold(btn, fn) {
    let t1, t2;
    const end = () => { clearTimeout(t1); clearInterval(t2); btn.classList.remove('is-held'); };
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      btn.classList.add('is-held');
      fn();
      t1 = setTimeout(() => { t2 = setInterval(fn, 110); }, 420);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => btn.addEventListener(ev, end));
    btn.addEventListener('click', (e) => { if (e.detail === 0) fn(); });
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /* ================= SCAN THE SCRIPT =================
     The script stays plain text. Markers are found by character index and
     turned into scroll offsets, re-measured whenever the layout changes. */
  let sections = [];   // { name, off }
  let pauses = 0;
  function scan() {
    sections = []; pauses = 0;
    if (!isPro()) { TP.setStops([]); return render(); }
    const secAt = [], pauseAt = [];
    let i = 0;
    for (const line of TP.text().split('\n')) {
      const m = /^\s*##+\s*(\S.*?)\s*$/.exec(line);
      if (m) secAt.push({ name: m[1].slice(0, 40), at: i + line.indexOf('#') });
      const re = /\[(?:jeda|pause)\]|(?:^|\s)\/\/(?=\s|$)/gi;
      for (let p; (p = re.exec(line));) pauseAt.push(i + p.index + p[0].search(/[[/]/));
      i += line.length + 1;
    }
    const offs = TP.offsetsOf([...secAt.map((s) => s.at), ...pauseAt]);
    sections = secAt.map((s, k) => ({ name: s.name, off: offs[k] ?? 0 }));
    const stops = offs.slice(secAt.length).filter((v) => v != null);
    pauses = stops.length;
    TP.setStops(S().autopause === false ? [] : stops);
    applyTarget();
    render();
    TP.emit('sections');
  }
  let scanTimer = 0;
  const rescan = () => { clearTimeout(scanTimer); scanTimer = setTimeout(scan, 150); };
  TP.on('layout', rescan);
  TP.on('script', rescan);
  TP.on('mode', rescan);

  function currentSection() {
    const d = TP.offset() + S().size * S().line * 0.5;
    let idx = -1;
    sections.forEach((s, k) => { if (s.off <= d) idx = k; });
    return idx;
  }
  function jumpSection(k) {
    const s = sections[k];
    if (!s) return;
    TP.jumpToOffset(s.off);
    TP.flash(s.name, 900);
  }

  /* ================= TARGET DURATION =================
     "This has to fit in 60 seconds" → the speed is worked out for you. */
  let applying = false, targetMsg = '';
  function applyTarget() {
    const t = S().target || 0;
    const words = TP.words();
    if (!isPro() || !t) {
      targetMsg = words ? `Off · takes ${fmtTime(TP.duration())} at speed ${S().speed}` : 'Off';
      return;
    }
    if (!words) { targetMsg = 'Add a script first'; return; }
    const raw = TP.speedFor(t);
    const speed = Math.round(Math.min(50, Math.max(1, raw)) * 10) / 10;
    applying = true; TP.set('speed', speed); applying = false;
    targetMsg = raw > 50 ? `Too long for ${t} s at max speed`
      : raw < 1 ? `Too short for ${t} s — slowest speed is 1`
      : `→ speed ${speed} · ≈ ${Math.round(words / (t / 60))} words/min`;
  }
  function setTarget(secs) {
    TP.set('target', Math.max(0, Math.min(3600, Math.round(secs))));
    applyTarget();
    render();
  }
  function stepTarget(dir) {
    const t = S().target || 0;
    // from OFF, start at how long the script takes right now, so nothing jumps
    setTarget(t ? Math.max(5, t + dir * 5) : Math.max(5, Math.round(TP.duration() / 5) * 5));
  }
  TP.on('change', (k) => {
    if (k === 'speed' && !applying && S().target) { TP.set('target', 0); TP.flash('Target off', 900); }
    if (k === 'speed' || k === 'restore') { applyTarget(); render(); }
    if (k === 'restore') rescan();
  });

  /* ================= SETTINGS SECTION ================= */
  const secRow = row('Sections', () => openSections());
  const keysRow = row('Map clicker', () => openKeys());
  const backupRow = row('Backup', () => openBackup());
  backupRow.sub('Export or import every script and setting');

  const tgtVal = h('output', { className: 'dk-val pro-tgt' });
  const tgtMinus = h('button', { className: 'dk-btn', textContent: '−', ariaLabel: 'Shorter' });
  const tgtPlus = h('button', { className: 'dk-btn', textContent: '+', ariaLabel: 'Longer' });
  hold(tgtMinus, () => stepTarget(-1));
  hold(tgtPlus, () => stepTarget(1));
  const tgtChips = h('div', { className: 'pro-chips' },
    ...[30, 60, 90].map((n) => h('button', { className: 'sh-chip', textContent: n + ' s', onclick: () => setTarget(n) })),
    h('button', { className: 'sh-chip', textContent: 'Off', onclick: () => setTarget(0) }));
  const tgtNote = note('');

  const pauseBtn = h('button', { className: 'sh-toggle', onclick: () => { TP.set('autopause', S().autopause === false); scan(); } });
  const pauseNote = note('');

  const section = h('div', { className: 'sh-section pro-only', id: 'proSection' },
    h('h3', { className: 'sh-sub', textContent: 'Pro' }),
    secRow.el,
    h('div', { className: 'sh-line' }, h('span', { textContent: 'Target duration' }), h('div', { className: 'dk-row' }, tgtMinus, tgtVal, tgtPlus)),
    tgtChips, tgtNote,
    h('div', { className: 'sh-line' }, h('span', { textContent: 'Auto-pause' }), pauseBtn),
    pauseNote,
    keysRow.el, backupRow.el);
  TP.addSettingsSection(section);

  /* desktop toolbar: icons only, set apart from the Simple controls */
  const tbSections = h('button', { className: 'tp-icon', title: 'Sections', ariaLabel: 'Sections', onclick: () => openSections() });
  tbSections.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 6h3M10 6h10M4 12h3M10 12h10M4 18h3M10 18h10"/></svg>';
  const group = h('div', { className: 'tp-group pro-only' }, tbSections);
  TP.addToolbarGroup(group);

  function render() {
    secRow.sub(sections.length ? `${sections.length} found` : 'Start a line with ## to add one');
    const t = S().target || 0;
    tgtVal.textContent = t ? t + ' s' : 'OFF';
    tgtNote.textContent = targetMsg;
    const on = S().autopause !== false;
    pauseBtn.textContent = on ? 'ON' : 'OFF';
    pauseBtn.setAttribute('aria-pressed', on);
    pauseNote.textContent = `Write [jeda] or // in the script — the scroll stops there, play to go on${pauses ? ` · ${pauses} found` : ''}`;
    const n = Object.keys(S().keys || {}).length;
    keysRow.sub(n ? `${n} custom ${n === 1 ? 'key' : 'keys'}` : 'Teach it the buttons on your clicker');
  }

  /* ================= SECTIONS PANEL ================= */
  function openSections() {
    scan();
    const now = currentSection();
    const list = h('div', { className: 'sh-section' });
    if (!sections.length) {
      list.append(note('No sections yet. Start a line with ## and it becomes one you can jump to:'),
        h('pre', { className: 'pro-sample', textContent: '## HOOK\nYour opening line…\n\n## CTA\nFollow for more.' }));
    }
    sections.forEach((s, k) => {
      const r = row(s.name, () => { document.getElementById('more').close(); jumpSection(k); });
      r.go.textContent = fmtTime(s.off / (S().speed * 4));
      if (k === now) r.el.classList.add('is-current');
      list.append(r.el);
    });
    TP.panel('Sections', list);
  }

  /* ================= MAP CLICKER ================= */
  const CMDS = [
    ['toggle', 'Play / Pause'], ['back', 'Back 2 lines'], ['forward', 'Forward 2 lines'],
    ['top', 'To start'], ['faster', 'Faster'], ['slower', 'Slower'],
  ];
  const NICE = { ' ': 'Space', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', PageDown: 'PgDn', PageUp: 'PgUp' };
  const nice = (k) => NICE[k] || (k.length === 1 ? k.toUpperCase() : k);
  function openKeys() {
    let listening = null;
    const wrap = h('div', { className: 'sh-section' });
    const draw = () => {
      const custom = S().keys || {};
      wrap.replaceChildren(
        note('Tap Add, then press a button on your clicker. Anything that sends a key works: presentation clickers, keyboards, shutter remotes in keyboard mode.'),
        ...CMDS.map(([cmd, label]) => {
          const builtin = [...new Set(Object.entries(TP.defaultKeys).filter(([k, c]) => c === cmd && !custom[k]).map(([k]) => nice(k)))];
          const mine = Object.keys(custom).filter((k) => custom[k] === cmd);
          const add = h('button', {
            className: 'sh-chip' + (listening === cmd ? ' is-live' : ''),
            textContent: listening === cmd ? 'Press a key…' : '+ Add',
            onclick: () => {
              listening = cmd; draw();
              TP.trapKey((k) => {
                listening = null;
                if (k !== 'Escape') { TP.set('keys', { ...(S().keys || {}), [k]: cmd }); TP.flash(`${nice(k)} → ${label}`, 1000); }
                draw(); render();
              });
            },
          });
          return h('div', { className: 'key-row' },
            h('span', { className: 'key-name', textContent: label }),
            h('span', { className: 'key-list' },
              ...builtin.map((k) => h('span', { className: 'key-chip', textContent: k })),
              ...mine.map((k) => h('button', {
                className: 'key-chip key-chip--mine', textContent: nice(k) + ' ×', ariaLabel: 'Remove ' + nice(k),
                onclick: () => { const next = { ...S().keys }; delete next[k]; TP.set('keys', next); draw(); render(); },
              }))),
            add);
        }),
        h('button', { className: 'sh-row', onclick: () => { TP.set('keys', {}); draw(); render(); } }, h('span', null, 'Reset to built-in keys')),
        note('iPhone shutter remotes that only send Volume cannot be read by a browser — pick a clicker that sends Enter, Page Down or arrow keys.'));
    };
    draw();
    TP.panel('Map clicker', wrap, () => TP.trapKey(null));
  }

  /* ================= BACKUP ================= */
  function exportAll() {
    const data = { v: 1, app: 'ihsan.prompter', exported: new Date().toISOString(), ...TP.dump() };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
    const d = new Date();
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const a = h('a', { href: url, download: `teleprompter-backup-${day}.json` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return data.scripts.length;
  }
  async function importAll(file) {
    const data = JSON.parse(await file.text());
    if (!data || data.v !== 1 || !Array.isArray(data.scripts)) throw new Error('not a backup');
    return TP.restore(data);
  }
  function openBackup() {
    const status = note('');
    const pick = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
    pick.addEventListener('change', async () => {
      const f = pick.files[0]; pick.value = '';
      if (!f) return;
      try {
        const r = await importAll(f);
        status.textContent = `Imported ${r.added} ${r.added === 1 ? 'script' : 'scripts'}${r.updated ? ` · ${r.updated} updated` : ''}${!r.added && !r.updated ? ' — everything was already here' : ''}`;
      } catch (e) { status.textContent = 'That file is not a teleprompter backup'; }
    });
    const exp = row('Export', () => { const n = exportAll(); status.textContent = `Saved ${n} ${n === 1 ? 'script' : 'scripts'} to your downloads`; });
    exp.sub('One .json file with every script and setting'); exp.go.textContent = '⬇';
    const imp = row('Import', () => pick.click());
    imp.sub('Adds what is missing — never deletes what is here'); imp.go.textContent = '⬆';
    TP.panel('Backup', h('div', { className: 'sh-section' },
      note('Scripts live in this browser only. Export before you change phones or clear browser data.'),
      exp.el, imp.el, pick, status));
  }

  /* ================= FIRST TIME ================= */
  function welcome() {
    if (S().proSeen || !document.getElementById('more').open) return;
    TP.panel('Pro mode', h('div', { className: 'sh-section' },
      h('p', { className: 'pro-card', textContent: 'Pro adds remote control, sections, auto-pause, target duration and backup. Nothing is sent anywhere except remote commands.' }),
      h('button', { className: 'sh-btn sh-btn--primary', textContent: 'Got it', onclick: () => TP.panelBack() })),
    () => { TP.set('proSeen', true); document.getElementById('proSection').scrollIntoView({ block: 'start' }); });
  }
  TP.on('mode', (m) => { if (m === 'pro') welcome(); });

  TP.pro = {
    section,
    toolbar: group,
    sections: () => sections,
    currentSection, jumpSection, rescan: scan,
    h, row, note,
  };

  scan();
  welcome();
})();
