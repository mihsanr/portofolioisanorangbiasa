/* Efek suara yang disintesis langsung dengan WebAudio — tidak ada file audio yang diunduh.
   AudioContext baru dibuat setelah gestur pertama pemain (aturan autoplay browser). */
export function createSfx(muted = false) {
  let ctx = null, master = null, noise = null;

  function unlock() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.22; master.connect(ctx.destination);
    const len = Math.floor(ctx.sampleRate * 0.3), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    noise = buf;
    /* kalau browser masih menahan audio, coba lagi pada gestur berikutnya */
    const again = () => { if (ctx.state === 'suspended') ctx.resume(); };
    window.addEventListener('pointerdown', again); window.addEventListener('keydown', again);
  }

  /* nada: frekuensi f0 → f1 selama dur, bentuk gelombang type, mulai setelah delay */
  function tone(f0, f1, dur, type = 'sine', vol = 1, delay = 0) {
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  function thump(vol = 1, cutoff = 420) {
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise; f.type = 'lowpass'; f.frequency.value = cutoff;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + 0.2);
  }

  return {
    unlock,
    get muted() { return muted; },
    setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.22; },
    jump(double) { double ? tone(520, 980, 0.13, 'triangle', 0.5) : tone(300, 600, 0.12, 'triangle', 0.5); },
    land(impact) { if (impact > 6) thump(Math.min(1, impact / 22), 300 + impact * 12); },
    collect(n) { const k = Math.pow(1.0293, Math.min(n, 20)); tone(880 * k, 880 * k, 0.09, 'square', 0.28); tone(1320 * k, 1320 * k, 0.16, 'square', 0.28, 0.07); },
    launch() { tone(180, 1250, 0.32, 'sawtooth', 0.3); thump(0.6, 900); },
    fall() { tone(420, 110, 0.4, 'sine', 0.5); },
    finish() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, f, 0.22, 'square', 0.3, i * 0.11)); },
  };
}
