/* HUD dan layar mulai/hasil — semuanya elemen HTML di atas kanvas (teks tajam, nol biaya GPU).
   Modul ini hanya mengurus tampilan; aturan permainan ada di flow.js. */
const $ = (id) => document.getElementById(id);
const pad = (n) => (n < 10 ? '0' + n : '' + n);

export function fmt(ms) {
  if (ms == null || !(ms > 0)) return '--:--.--';
  const c = Math.floor(ms / 10);
  return pad(Math.floor(c / 6000)) + ':' + pad(Math.floor(c / 100) % 60) + '.' + pad(c % 100);
}

export function createHud() {
  const el = {
    time: $('hud-time'), best: $('hud-best'), count: $('hud-count'), total: $('hud-total'), penalty: $('hud-penalty'),
    restart: $('btn-restart'), mute: $('btn-mute'), start: $('btn-start'), again: $('btn-again'),
    title: $('title'), titleBest: $('title-best'), titleBoard: $('title-board'),
    result: $('result'), resultTime: $('result-time'), resultNote: $('result-note'), resultBoard: $('result-board'),
    form: $('result-form'), name: $('result-name'), msg: $('result-msg'),
    chars: [...document.querySelectorAll('.chars .char')],
  };
  const on = { start: null, restart: null, submit: null, mute: null, pick: null };
  let lastC = -1;

  el.start.addEventListener('click', () => on.start && on.start());
  el.again.addEventListener('click', () => on.start && on.start());
  el.restart.addEventListener('click', () => on.restart && on.restart());
  el.mute.addEventListener('click', () => on.mute && on.mute());
  el.chars.forEach((b) => b.addEventListener('click', () => on.pick && on.pick(b.dataset.char)));
  el.form.addEventListener('submit', (e) => { e.preventDefault(); on.submit && on.submit(el.name.value); });
  el.name.addEventListener('input', () => { el.name.value = el.name.value.toUpperCase().replace(/[^A-Z0-9 _.-]/g, ''); });
  window.addEventListener('keydown', (e) => {
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    const s = document.body.dataset.state;
    if (e.code === 'Enter' && (s === 'title' || s === 'done')) { e.preventDefault(); on.start && on.start(); }
    else if (e.code === 'KeyR' && s === 'play') on.restart && on.restart();
    else if (e.code === 'KeyM') on.mute && on.mute();
  });

  function board(ol, rows, mineMs) {
    ol.textContent = '';
    const note = (t) => { const li = document.createElement('li'); li.className = 'note'; li.textContent = t; ol.appendChild(li); };
    if (rows === undefined) return note('TUNING…');
    if (rows === null) return note('NO SIGNAL');
    if (!rows.length) return note('Belum ada skor. Jadilah yang pertama.');
    rows.forEach((r, i) => {
      const li = document.createElement('li');
      if (mineMs && r.time_ms === mineMs) li.className = 'mine';
      [['rk', i + 1], ['nm', r.name], ['tm', fmt(r.time_ms)]].forEach(([c, t]) => { const s = document.createElement('span'); s.className = c; s.textContent = t; li.appendChild(s); });
      ol.appendChild(li);
    });
  }

  return {
    on, el,
    state(s) { document.body.dataset.state = s; el.title.hidden = s !== 'title'; el.result.hidden = s !== 'done'; },
    setTime(ms) { const c = Math.floor(ms / 10); if (c !== lastC) { lastC = c; el.time.textContent = ms > 0 ? fmt(ms) : '00:00.00'; } },
    setBest(ms) { const t = fmt(ms); el.best.textContent = t; el.titleBest.textContent = t; },
    setTapes(n, total) { el.count.textContent = n; el.total.textContent = total; el.count.parentElement.classList.remove('pop'); void el.count.offsetWidth; if (n) el.count.parentElement.classList.add('pop'); },
    penalty() { el.penalty.classList.remove('show'); void el.penalty.offsetWidth; el.penalty.classList.add('show'); },
    /* pemilih karakter di layar judul */
    setChar(id) { el.chars.forEach((b) => b.setAttribute('aria-checked', b.dataset.char === id ? 'true' : 'false')); },
    setPortraits(map) { el.chars.forEach((b) => { const img = b.querySelector('img'); if (img && map[b.dataset.char]) img.src = map[b.dataset.char]; }); },
    setMute(m) { el.mute.textContent = m ? 'UNMUTE' : 'MUTE'; el.mute.setAttribute('aria-pressed', m ? 'true' : 'false'); },
    setBoard(rows, mineMs) { board(el.titleBoard, rows, mineMs); board(el.resultBoard, rows, mineMs); },
    showResult({ ms, record, name, online }) {
      el.resultTime.textContent = fmt(ms);
      el.resultNote.textContent = record ? 'Rekor baru di perangkat ini!' : 'Waktu terbaikmu: ' + el.best.textContent;
      el.name.value = name || '';
      el.msg.textContent = online ? '' : 'NO SIGNAL — skor hanya tersimpan di perangkat ini.';
      el.form.classList.toggle('off', !online);
    },
    resultOffline() { el.msg.textContent = 'NO SIGNAL — skor hanya tersimpan di perangkat ini.'; el.form.classList.add('off'); },
    resultMsg(t, done) { el.msg.textContent = t; if (done) el.form.classList.add('sent'); else el.form.classList.remove('sent'); },
  };
}
