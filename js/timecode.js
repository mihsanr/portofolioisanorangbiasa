/* Timecode / FPS converter. One frame count drives the three fields; on a
   rate change the field the user typed in last keeps its value and the
   others are recomputed from it. State persists in `ihsan.tool.tc`. */
(() => {
  const FC = window.FrameCore;
  const STORE = 'ihsan.tool.tc';
  const $ = (id) => document.getElementById(id);

  const state = { fps: '24', df: false, target: '30', src: 'tc', raw: '00:00:10:00', inTc: '00:00:00:00', outTc: '00:00:30:00' };
  try { Object.assign(state, JSON.parse(localStorage.getItem(STORE) || '{}')); } catch (e) { /* first visit */ }
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* private mode */ } };

  const tcIn = $('tc'), framesIn = $('frames'), secsIn = $('secs'), inTc = $('inTc'), outTc = $('outTc');
  const fields = { tc: tcIn, frames: framesIn, secs: secsIn };
  if (!fields[state.src]) state.src = 'tc';

  const rate = () => FC.rate(state.fps);
  const target = () => FC.rate(state.target);
  const df = (r = rate()) => state.df && r.canDrop;
  const invalid = (el, bad) => (bad ? el.setAttribute('aria-invalid', 'true') : el.removeAttribute('aria-invalid'));

  function chips(el, key) {
    for (const r of FC.RATES) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'calc-chip';
      b.textContent = r.id; b.dataset.v = r.id;
      b.addEventListener('click', () => { state[key] = r.id; render(); });
      el.appendChild(b);
    }
  }
  const press = (el, v) => el.querySelectorAll('.calc-chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
  chips($('fpsChips'), 'fps');
  chips($('tgtChips'), 'target');

  /* the field typed in last → frames (null if it doesn't parse) */
  function framesFrom(src, raw) {
    const r = rate();
    if (src === 'tc') return FC.fromTC(raw, r, df(r));
    const n = FC.parseNum(raw);
    if (n === null || n < 0) return null;
    return src === 'frames' ? Math.round(n) : FC.fromSeconds(n, r);
  }

  // hero = white lead cell; tc = long timecode/clock value sized to fit
  const stat = (num, label, hero, tc) =>
    `<div class="calc-stat${hero ? ' calc-stat--hero' : ''}${tc ? ' calc-stat--tc' : ''}"><span class="calc-stat-num">${num}</span><span class="calc-stat-label">${label}</span></div>`;

  function render() {
    const r = rate(), t = target();
    save();
    press($('fpsChips'), r.id);
    press($('tgtChips'), t.id);

    const dfBtn = $('df');
    dfBtn.disabled = !r.canDrop;
    dfBtn.setAttribute('aria-pressed', String(df(r)));
    $('dfNote').textContent = r.canDrop
      ? (df(r)
        ? `Drop-frame skips timecode labels ;00${r.base > 30 ? '–' : ' and '};0${r.base / 15 - 1} every minute (except each 10th) so the clock matches real time. No frames are lost.`
        : `${r.id} non-drop counts ${r.base} labels a second, so it runs 0.1% behind the real clock. Turn on drop-frame for broadcast timing.`)
      : (r.den === 1001 ? `${r.id} counts ${r.base} labels a second; real time runs 0.1% longer. There is no drop-frame for this rate.` : '');

    const f = framesFrom(state.src, state.raw);
    invalid(fields[state.src], f === null);
    if (f !== null) {
      const sec = FC.toSeconds(f, r);
      if (state.src !== 'tc') tcIn.value = FC.toTC(f, r, df(r));
      if (state.src !== 'frames') framesIn.value = f;
      if (state.src !== 'secs') secsIn.value = FC.num(sec, 3);
      $('real').textContent = `Real clock ${FC.clock(sec)}`;

      const same = FC.fromSeconds(sec, t);
      const exact = sec * t.fps;
      const conform = FC.toSeconds(f, t);
      $('retime').innerHTML =
        stat(FC.toTC(same, t, df(t)), `Same duration @ ${t.id}`, true, true) +
        stat(same, `Frames @ ${t.id}${Math.abs(exact - same) > 0.001 ? ` (from ${FC.num(exact, 2)})` : ''}`) +
        stat(FC.clock(conform), `Same frames played @ ${t.id}`, false, true) +
        stat(`${FC.num(t.fps / r.fps * 100, 1)}%`, 'Speed after conform');
    }

    // in / out duration
    const a = FC.fromTC(state.inTc, r, df(r)), b = FC.fromTC(state.outTc, r, df(r));
    invalid(inTc, a === null);
    invalid(outTc, b === null);
    if (a !== null && b !== null) {
      const d = b - a;
      $('dur').innerHTML =
        stat(FC.toTC(d, r, df(r)), d < 0 ? 'Duration (out is before in)' : 'Duration', true, true) +
        stat(d, 'Frames') +
        stat(FC.num(FC.toSeconds(d, r), 3), 'Seconds');
    }
  }

  /* typing: keep the raw text of the field being edited, refresh the rest */
  for (const [src, el] of Object.entries(fields)) {
    el.addEventListener('input', () => { state.src = src; state.raw = el.value; render(); });
    // tidy the typed field once the user leaves it
    el.addEventListener('blur', () => {
      const f = framesFrom(src, el.value);
      if (f === null || state.src !== src) return;
      const r = rate();
      if (src === 'tc') el.value = state.raw = FC.toTC(f, r, df(r));
      if (src === 'secs') el.value = state.raw = FC.num(FC.toSeconds(f, r), 3);
      save();
    });
  }
  for (const [key, el] of [['inTc', inTc], ['outTc', outTc]]) {
    el.value = state[key];
    el.addEventListener('input', () => { state[key] = el.value; render(); });
    el.addEventListener('blur', () => {
      const r = rate(), f = FC.fromTC(el.value, r, df(r));
      if (f !== null) el.value = state[key] = FC.toTC(f, r, df(r));
      save();
    });
  }

  $('df').addEventListener('click', () => {
    // re-label the same frame count, so the tc field follows the new counting
    const r = rate(), f = framesFrom(state.src, state.raw);
    const marks = ['inTc', 'outTc'].map((k) => FC.fromTC(state[k], r, df(r)));
    state.df = !state.df;
    if (f !== null && state.src === 'tc') state.raw = tcIn.value = FC.toTC(f, r, df(r));
    [inTc, outTc].forEach((el, i) => {
      if (marks[i] !== null) el.value = state[el.id] = FC.toTC(marks[i], r, df(r));
    });
    render();
  });

  fields[state.src].value = state.raw;
  render();
})();
