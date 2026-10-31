/* BPM ↔ Frame — where every beat lands at a given frame rate.
   State persists per browser (localStorage `ihsan.tool.bpm`). The metronome
   runs on Web Audio time and hushes the site BGM while it plays. */
(() => {
  const FC = window.FrameCore;
  const STORE = 'ihsan.tool.bpm';
  const $ = (id) => document.getElementById(id);

  const state = { bpm: 120, fps: '24', bpb: 4, offset: 0, bars: 8 };
  try { Object.assign(state, JSON.parse(localStorage.getItem(STORE) || '{}')); } catch (e) { /* first visit */ }
  state.bpm = Math.min(400, Math.max(20, Number(state.bpm) || 120));
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* private mode */ } };

  const bpmIn = $('bpm'), offsetIn = $('offset'), revIn = $('rev');
  const BPM_MIN = 20, BPM_MAX = 400;

  /* ── chip groups ── */
  function chips(el, items, key, label = (v) => v) {
    el.innerHTML = '';
    for (const v of items) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'calc-chip';
      b.textContent = label(v);
      b.dataset.v = v;
      b.addEventListener('click', () => { state[key] = typeof state[key] === 'number' ? Number(v) : v; update(); });
      el.appendChild(b);
    }
  }
  const pressChips = (el, val) => el.querySelectorAll('.calc-chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(val))));

  chips($('fpsChips'), FC.RATES.map((r) => r.id), 'fps');
  chips($('bpbChips'), [2, 3, 4, 6, 7], 'bpb');
  chips($('barsChips'), [4, 8, 16, 32], 'bars');

  /* ── math ── */
  const rate = () => FC.rate(state.fps);
  const fpb = () => rate().fps * 60 / state.bpm;

  // after how many beats does a beat land on a whole frame again? (0 = not within 64)
  function realign(f) {
    for (let k = 1; k <= 64; k++) {
      const x = k * f;
      if (Math.abs(x - Math.round(x)) < 0.002) return k;
    }
    return 0;
  }

  /* ── render ── */
  function stat(num, label, hero) {
    return `<div class="calc-stat${hero ? ' calc-stat--hero' : ''}"><span class="calc-stat-num">${num}</span><span class="calc-stat-label">${label}</span></div>`;
  }

  let rowEls = [];
  function update(from) {
    const r = rate();
    const f = fpb();
    save();

    if (from !== 'bpm') bpmIn.value = FC.num(state.bpm);
    if (from !== 'offset') offsetIn.value = state.offset;
    bpmIn.removeAttribute('aria-invalid');
    pressChips($('fpsChips'), state.fps);
    pressChips($('bpbChips'), state.bpb);
    pressChips($('barsChips'), state.bars);

    $('stats').innerHTML =
      stat(FC.num(f, 3), 'Frames / beat', true) +
      stat(FC.num(f * state.bpb, 2), `Frames / bar (${state.bpb} beats)`) +
      stat(FC.num(f / 2, 2), 'Frames / ½ beat') +
      stat(FC.num(f / 4, 2), 'Frames / ¼ beat') +
      stat(FC.num(60000 / state.bpm, 1), 'ms / beat');

    // beat map
    const total = state.bars * state.bpb;
    let maxOff = 0;
    const html = [];
    for (let i = 0; i < total; i++) {
      const exact = state.offset + i * f;
      const fr = Math.round(exact);
      const off = fr - exact;
      maxOff = Math.max(maxOff, Math.abs(off));
      const zero = Math.abs(off) < 0.005;
      html.push(`<tr${i % state.bpb === 0 ? ' class="bar"' : ''}><td>${Math.floor(i / state.bpb) + 1}.${(i % state.bpb) + 1}</td><td class="f">${fr}</td><td class="opt">${FC.num(exact, 2)}</td><td class="off${zero ? ' zero' : ''}">${zero ? '0' : (off > 0 ? '+' : '') + FC.num(off, 2)}</td><td>${FC.toTC(fr, r, false)}</td></tr>`);
    }
    $('rows').innerHTML = html.join('');
    rowEls = [...$('rows').children];

    // sync verdict
    const k = realign(f);
    const sync = $('sync');
    sync.classList.toggle('calc-status--warn', k !== 1);
    if (k === 1) sync.textContent = '✓ Clean — every beat lands exactly on a frame.';
    else if (k) sync.textContent = `Beats fall between frames — they line up again every ${k} beats${k % state.bpb === 0 ? ` (${k / state.bpb} bar${k / state.bpb > 1 ? 's' : ''})` : ''}. Rounded below, max ±${FC.num(maxOff, 2)} frame.`;
    else sync.textContent = `Beats never land exactly on frames — rounded below, max ±${FC.num(maxOff, 2)} frame.`;

    // nearby BPMs whose beat is a whole number of frames
    const clean = $('clean');
    clean.innerHTML = '';
    const n0 = Math.round(f);
    const picks = [];
    for (let n = Math.max(2, n0 - 3); n <= n0 + 3; n++) {
      const b = r.fps * 60 / n;
      if (b >= BPM_MIN && b <= BPM_MAX) picks.push([n, b]);
    }
    picks.sort((a, b) => Math.abs(a[1] - state.bpm) - Math.abs(b[1] - state.bpm));
    for (const [n, b] of picks.slice(0, 6).sort((a, b) => a[1] - b[1])) {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'calc-chip';
      btn.innerHTML = `${FC.num(b, 2)}<small>${n}f</small>`;
      btn.setAttribute('aria-label', `${FC.num(b, 2)} BPM, ${n} frames per beat`);
      btn.setAttribute('aria-pressed', String(Math.abs(b - state.bpm) < 0.0005));
      btn.addEventListener('click', () => { state.bpm = b; update(); });
      clean.appendChild(btn);
    }
    $('cleanLabel').textContent = `Clean BPMs @ ${r.id}`;

    reverse();
    lamps();
    loopNote();
    if (playing) restartClock();
  }

  /* ── inputs ── */
  bpmIn.addEventListener('input', () => {
    const v = FC.parseNum(bpmIn.value);
    if (v === null || v < BPM_MIN || v > BPM_MAX) { bpmIn.setAttribute('aria-invalid', 'true'); return; }
    state.bpm = v;
    update('bpm');
  });
  bpmIn.addEventListener('blur', () => update());
  offsetIn.addEventListener('input', () => {
    const v = parseInt(offsetIn.value, 10);
    if (!Number.isFinite(v) || v < 0) { offsetIn.setAttribute('aria-invalid', 'true'); return; }
    offsetIn.removeAttribute('aria-invalid');
    state.offset = v;
    update('offset');
  });
  offsetIn.addEventListener('blur', () => { offsetIn.removeAttribute('aria-invalid'); update(); });

  const nudge = (fn) => { state.bpm = Math.min(BPM_MAX, Math.max(BPM_MIN, fn(state.bpm))); update(); };
  $('bpmDown').addEventListener('click', () => nudge((b) => Math.round(b) - 1));
  $('bpmUp').addEventListener('click', () => nudge((b) => Math.round(b) + 1));
  $('bpmHalf').addEventListener('click', () => nudge((b) => b / 2));
  $('bpmDouble').addEventListener('click', () => nudge((b) => b * 2));

  /* ── reverse: frames per beat → BPM ── */
  function reverse() {
    const n = FC.parseNum(revIn.value);
    const ok = n !== null && n > 0;
    const b = ok ? rate().fps * 60 / n : 0;
    if (ok) revIn.removeAttribute('aria-invalid'); else revIn.setAttribute('aria-invalid', 'true');
    $('revOut').textContent = ok ? `${FC.num(b, 2)} BPM` : '—';
    $('revUse').disabled = !ok || b < BPM_MIN || b > BPM_MAX;
    return b;
  }
  revIn.addEventListener('input', reverse);
  $('revUse').addEventListener('click', () => { state.bpm = reverse(); update(); });

  /* ── tap tempo ── */
  let taps = [];
  const tapBtn = $('tap');
  function tap() {
    const now = performance.now();
    if (taps.length && now - taps[taps.length - 1] > 2000) taps = [];
    taps.push(now);
    if (taps.length > 9) taps.shift();
    tapBtn.classList.add('is-hit');
    setTimeout(() => tapBtn.classList.remove('is-hit'), 90);
    if (taps.length < 2) { $('tapHint').textContent = 'Keep tapping…'; return; }
    const avg = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
    const b = Math.round(60000 / avg);
    if (b < BPM_MIN || b > BPM_MAX) return;
    state.bpm = b;
    update();
    $('tapHint').textContent = taps.length < 4 ? `${b} BPM — keep tapping…` : `${b} BPM from ${taps.length} taps. Stop for 2s to start over.`;
  }
  tapBtn.addEventListener('click', tap);

  /* ── metronome ── */
  let ctx = null, timer = 0, raf = 0, t0 = 0, next = 0, playing = false;
  const metroBtn = $('metro');

  function click(at, accent) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = accent ? 1760 : 1100;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(accent ? 0.5 : 0.28, at + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
    o.connect(g).connect(ctx.destination);
    o.start(at); o.stop(at + 0.06);
  }
  function schedule() {
    const spb = 60 / state.bpm;
    while (t0 + next * spb < ctx.currentTime + 0.12) {
      click(t0 + next * spb, next % state.bpb === 0);
      next++;
    }
  }
  function restartClock() { t0 = ctx.currentTime + 0.06; next = 0; }

  function lamps(beat = -1) {
    const el = $('lamps');
    if (el.children.length !== state.bpb) {
      el.innerHTML = '';
      for (let i = 0; i < state.bpb; i++) el.appendChild(document.createElement('i')).className = 'calc-lamp';
    }
    [...el.children].forEach((l, i) => {
      l.classList.toggle('on', i === beat);
      l.classList.toggle('down', i === 0);
    });
  }

  let lastBeat = -1;
  function frame() {
    raf = requestAnimationFrame(frame);
    const el = ctx.currentTime - t0;
    if (el < 0) return;
    const spb = 60 / state.bpm;
    const beat = Math.floor(el / spb);
    const fr = state.offset + Math.floor(el * rate().fps);
    $('readout').textContent = `Bar ${Math.floor(beat / state.bpb) + 1} · Beat ${(beat % state.bpb) + 1} · F ${String(fr).padStart(4, '0')}`;
    // lamp only for the first ~third of the beat so it reads as a flash
    lamps(el - beat * spb < spb * 0.35 ? beat % state.bpb : -1);
    if (beat !== lastBeat) {
      if (rowEls[lastBeat]) rowEls[lastBeat].classList.remove('now');
      if (rowEls[beat]) rowEls[beat].classList.add('now');
      lastBeat = beat;
    }
  }

  function setPlaying(on) {
    if (on === playing) return;
    playing = on;
    metroBtn.setAttribute('aria-pressed', String(on));
    metroBtn.innerHTML = `${on ? '■ Stop' : '▶&#xFE0E; Metronome'}<kbd aria-hidden="true">Space</kbd>`;
    dispatchEvent(new CustomEvent('bgm:hush', { detail: on }));
    if (on) {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      ctx.resume();
      restartClock();
      schedule();
      timer = setInterval(schedule, 25);
      lastBeat = -1;
      frame();
    } else {
      clearInterval(timer);
      cancelAnimationFrame(raf);
      rowEls.forEach((r) => r.classList.remove('now'));
      $('readout').textContent = 'Ready';
      lamps();
    }
  }
  metroBtn.addEventListener('click', () => setPlaying(!playing));
  document.addEventListener('visibilitychange', () => { if (document.hidden) setPlaying(false); });

  /* ── copy frame list ── */
  const copyBtn = $('copy');
  copyBtn.addEventListener('click', async () => {
    const frames = rowEls.map((r) => r.children[1].textContent).join(', ');
    let ok = true;
    try { await navigator.clipboard.writeText(frames); } catch (e) { ok = false; }
    copyBtn.textContent = ok ? 'Copied ✓' : 'Copy failed';
    setTimeout(() => { copyBtn.textContent = 'Copy frames'; }, 1400);
  });

  /* ── download loop: PCM WAV written by hand, since MP3 encoders pad the ends and break the loop ── */
  const LOOP_MAX = 10, LOOP_RATE = 48000; // seconds; 48 kHz is the video-editing norm
  const dlBtn = $('loopDl');

  // most whole bars within LOOP_MAX; if one bar is longer, whole beats without an accent
  function loopPlan() {
    const spb = 60 / state.bpm;
    const bars = Math.floor(LOOP_MAX / (spb * state.bpb) + 1e-9);
    const beats = bars ? bars * state.bpb : Math.floor(LOOP_MAX / spb + 1e-9);
    return { bars, beats, samples: Math.round(beats * spb * LOOP_RATE) };
  }

  function loopNote() {
    const { bars, beats, samples } = loopPlan();
    const secs = (samples / LOOP_RATE).toFixed(2);
    $('loopInfo').textContent = bars
      ? `Loop file: ${bars} bar${bars > 1 ? 's' : ''} (${beats} beats), ${secs} s WAV. Repeats with no gap.`
      : `Loop file: ${beats} beats, ${secs} s WAV. Repeats with no gap, but no accent: one ${state.bpb}-beat bar is over ${LOOP_MAX} s at this tempo.`;
  }

  // same click as the live metronome; it ends long before the next beat (50 ms vs 150 ms at 400 BPM)
  function renderLoop() {
    const { bars, beats, samples } = loopPlan();
    const pcm = new Int16Array(samples);
    const len = Math.round(0.05 * LOOP_RATE);
    for (let i = 0; i < beats; i++) {
      const accent = bars > 0 && i % state.bpb === 0;
      const at = Math.round(i * samples / beats);
      const peak = accent ? 0.5 : 0.28, hz = accent ? 1760 : 1100;
      for (let n = 0; n < len; n++) {
        const t = n / LOOP_RATE;
        const env = t < 0.002 ? 0.0001 * (peak / 0.0001) ** (t / 0.002) : peak * (0.0001 / peak) ** ((t - 0.002) / 0.048);
        pcm[at + n] = Math.round(32767 * env * Math.sin(2 * Math.PI * hz * t));
      }
    }
    return pcm;
  }

  function wavBlob(pcm) {
    const v = new DataView(new ArrayBuffer(44));
    const tag = (at, s) => { for (let i = 0; i < 4; i++) v.setUint8(at + i, s.charCodeAt(i)); };
    tag(0, 'RIFF'); v.setUint32(4, 36 + pcm.byteLength, true); tag(8, 'WAVE');
    tag(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); // PCM, mono
    v.setUint32(24, LOOP_RATE, true); v.setUint32(28, LOOP_RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    tag(36, 'data'); v.setUint32(40, pcm.byteLength, true);
    return new Blob([v.buffer, pcm], { type: 'audio/wav' });
  }

  dlBtn.addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(wavBlob(renderLoop()));
    a.download = `metronome-${FC.num(state.bpm, 2)}bpm.wav`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    dlBtn.textContent = 'Downloaded ✓';
    setTimeout(() => { dlBtn.textContent = 'Download loop'; }, 1400);
  });

  /* ── keys: T taps, Space plays (outside text fields) ── */
  addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 't' || e.key === 'T') { e.preventDefault(); tap(); }
    else if (e.code === 'Space' && !e.target.closest('button, a')) { e.preventDefault(); setPlaying(!playing); }
  });

  update();
})();
