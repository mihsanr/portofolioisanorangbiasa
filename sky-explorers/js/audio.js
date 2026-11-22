// SFX disintesis dari kode (tanpa file), dinormalisasi ke puncak SFX_DB (-50..-20 dBFS).
// BGM = file mp3 yang di-stream <audio>. Narator = rekaman ElevenLabs per huruf/angka (audio/vo).
import { SFX_DB, BGM, BGM_LEVEL } from './config.js';

export const SR = 44100;
const TAU = Math.PI * 2;
const env = (t, a, d) => (t < a ? t / a : Math.exp(-(t - a) / d));
let seed = 1;
const noise = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x3fffffff) - 1;
const buf = sec => new Float32Array(Math.round(sec * SR));

function notes(list, len, decay) { // [frekuensi, mulai detik]
  const x = buf(len);
  for (const [f, at] of list)
    for (let i = Math.round(at * SR); i < x.length; i++) {
      const t = i / SR - at, e = env(t, 0.006, decay);
      x[i] += (Math.sin(TAU * f * t) + 0.25 * Math.sin(TAU * 2 * f * t)) * e;
    }
  return x;
}
function sweep(len, f, a) { // f(t), a(t)
  const x = buf(len); let ph = 0;
  for (let i = 0; i < x.length; i++) { const t = i / SR; ph += TAU * f(t) / SR; x[i] = Math.sin(ph) * a(t); }
  return x;
}
function loopNoise(len, cutoff) { // noise low-pass yang menyambung mulus saat di-loop
  const n = Math.round(len * SR), fade = Math.round(0.25 * SR), raw = new Float32Array(n + fade);
  let y = 0;
  for (let i = 0; i < raw.length; i++) raw[i] = y += (noise() - y) * cutoff;
  const x = raw.slice(0, n);
  for (let i = 0; i < fade; i++) x[i] = x[i] * (i / fade) + raw[n + i] * (1 - i / fade);
  return x;
}

export const SYNTH = {
  pickup: () => notes([[1047, 0], [1319, 0.08], [1568, 0.16], [2093, 0.24]], 0.8, 0.16),
  ring: () => notes([[880, 0], [1320, 0.06]], 0.45, 0.12),
  fanfare: () => notes([[784, 0], [988, 0.11], [1175, 0.22], [1568, 0.33], [1976, 0.46]], 1.3, 0.22),
  open: () => notes([[660, 0], [990, 0.07]], 0.4, 0.1),
  click: () => sweep(0.08, t => 900 - 3000 * t, t => env(t, 0.004, 0.02)),
  bump: () => sweep(0.35, t => 190 + 55 * Math.sin(TAU * 14 * t), t => env(t, 0.01, 0.09)),
  whoosh: () => { const x = loopNoise(0.6, 0.08); for (let i = 0; i < x.length; i++) x[i] *= Math.sin(Math.PI * i / x.length) ** 2; return x; },
  engine: () => { // 2 dtk, semua frekuensi bulat → loop tanpa klik
    const x = buf(2);
    for (let i = 0; i < x.length; i++) {
      const t = i / SR;
      x[i] = (Math.sin(TAU * 55 * t) + 0.5 * Math.sin(TAU * 110 * t) + 0.25 * Math.sin(TAU * 165 * t)) * (0.7 + 0.3 * Math.sin(TAU * 24 * t));
    }
    return x;
  },
  wind: () => loopNoise(2, 0.03),
  bubble: () => sweep(0.16, t => 420 + 5200 * t, t => env(t, 0.008, 0.06)),
  horn: () => { const x = buf(1.5); for (let i = 0; i < x.length; i++) { const t = i / SR, a = t < 0.55 ? env(t, 0.04, 0.5) : env(t - 0.62, 0.04, 0.6) * (t > 0.62); for (const f of [370, 466, 554]) x[i] += (Math.sin(TAU * f * t) + 0.3 * Math.sin(TAU * 2 * f * t)) * a; } return x; },
  moo: () => { const x = buf(1.1); let ph = 0; for (let i = 0; i < x.length; i++) { const t = i / SR, f = 165 + 25 * Math.sin(Math.min(1, t * 2.2) * Math.PI) - 35 * t; ph += TAU * f / SR; x[i] = (Math.sin(ph) + 0.6 * Math.sin(2 * ph) + 0.35 * Math.sin(3 * ph)) * Math.min(1, t * 9) * Math.max(0, 1 - t / 1.1); } return x; },
  birds: () => { // 8 dtk: kicau pendek bertalu-talu, sunyi di ujung → loop mulus
    const x = buf(8);
    for (const [at, f0, n, d] of [[0.4, 3100, 3, 0.11], [1.7, 4200, 5, 0.07], [2.9, 2600, 2, 0.16], [4.1, 3600, 4, 0.09], [5.3, 2900, 3, 0.12], [6.4, 4500, 4, 0.06]])
      for (let k = 0; k < n; k++) { let ph = 0; const s = Math.round((at + k * d * 1.5) * SR), L = Math.round(d * SR); for (let i = 0; i < L; i++) { const u = i / L; ph += TAU * (f0 + 700 * Math.sin(u * Math.PI) - 260 * k) / SR; x[s + i] += Math.sin(ph) * Math.sin(Math.PI * u) ** 2 * (1 - k * 0.15); } }
    return x;
  },
  waves: () => { const x = loopNoise(8, 0.06); for (let i = 0; i < x.length; i++) { const u = i / x.length; x[i] *= 0.35 + 0.65 * Math.sin(Math.PI * u * 2) ** 2; } return x; },
};

export const dbPeak = x => 20 * Math.log10(x.reduce((m, v) => Math.max(m, Math.abs(v)), 0));
export function render(name) {
  const x = SYNTH[name](), g = 10 ** (SFX_DB[name] / 20) / 10 ** (dbPeak(x) / 20);
  for (let i = 0; i < x.length; i++) x[i] *= g;
  return x;
}

export function createAudio(settings) {
  let ctx, master, bgmGain, engine, engineGain, windGain, birdGain, waveGain, wantBgm = false;
  const buffers = {}, voices = new Map();
  let voSrc = null;
  const bgm = new Audio();
  bgm.preload = 'none';
  let track = Math.floor(Math.random() * BGM.length);
  bgm.addEventListener('ended', () => { track = (track + 1) % BGM.length; startBgm(); });

  function apply() {
    const v = settings.muted ? 0 : settings.volume;
    if (!master) return;
    master.gain.value = v;
    bgmGain.gain.value = BGM_LEVEL;
  }
  function startBgm() { bgm.src = BGM[track]; bgm.play().catch(() => {}); }
  function loop(name) {
    const src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = buffers[name]; src.loop = true; g.gain.value = 0;
    src.connect(g).connect(master); src.start();
    return [src, g];
  }

  function sound(name) {
    if (!buffers[name]) { const x = render(name); buffers[name] = ctx.createBuffer(1, x.length, SR); buffers[name].copyToChannel(x, 0); }
    return buffers[name];
  }
  // Dipanggil dari gesture pertama (kebijakan autoplay browser).
  function unlock() {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain(); master.connect(ctx.destination);
      // BGM lewat WebAudio: iOS mengabaikan audio.volume, gain node tetap bekerja.
      bgmGain = ctx.createGain(); bgmGain.connect(master);
      ctx.createMediaElementSource(bgm).connect(bgmGain);
      apply();
      // SFX disintesis satu per satu di sela frame, bukan sekaligus (dulu membekukan HP ±1 detik).
      const queue = Object.keys(SYNTH);
      const step = () => {
        const name = queue.shift(); if (!name) return;
        sound(name);
        if (name === 'engine') [engine, engineGain] = loop('engine');
        if (name === 'wind') windGain = loop('wind')[1]; if (name === 'birds') birdGain = loop('birds')[1]; if (name === 'waves') waveGain = loop('waves')[1];
        setTimeout(step, 70);
      };
      setTimeout(step, 30);
    }
    ctx.resume();
    if (wantBgm && bgm.paused) bgm.src ? bgm.play().catch(() => {}) : startBgm();
  }

  return {
    unlock,
    apply,
    play(name, rate = 1) {
      if (!ctx) return;
      const s = ctx.createBufferSource(); s.buffer = sound(name); s.playbackRate.value = rate; s.connect(master); s.start();
    },
    // speed01: 0 = normal, 1 = boost. on=false saat menu/pause.
    flight(on, speed01 = 0) {
      if (!engine || !windGain) return;
      const now = ctx.currentTime;
      engineGain.gain.setTargetAtTime(on ? 1 : 0, now, 0.25);
      engine.playbackRate.setTargetAtTime(0.9 + speed01 * 0.35, now, 0.3);
      windGain.gain.setTargetAtTime(on ? 0.45 + 0.55 * speed01 : 0, now, 0.4);
    },
    ambient(birds, waves) { // 0..1
      if (!birdGain || !waveGain) return;
      birdGain.gain.setTargetAtTime(birds, ctx.currentTime, 0.8); waveGain.gain.setTargetAtTime(waves, ctx.currentTime, 0.8);
    },
    music(on) {
      wantBgm = on;
      if (!on) bgm.pause();
      else if (ctx && bgm.paused) bgm.src ? bgm.play().catch(() => {}) : startBgm();
    },
    suspend() { ctx?.suspend(); bgm.pause(); },
    // Narator rekaman (audio/vo/<nama>.mp3, puncak ≤ -20 dBFS). BGM diredam selama narator bicara.
    voice(name) {
      if (!ctx) return;
      loadVoice(name).then(buf => {
        if (!buf) return;
        voSrc?.stop();
        const s = ctx.createBufferSource(); s.buffer = buf; s.connect(master); s.start();
        voSrc = s; duck(true);
        s.onended = () => { if (voSrc === s) { voSrc = null; duck(false); } };
      });
    },
    preloadVoices(names) { const q = [...names], next = () => { const n = q.shift(); if (n && ctx) loadVoice(n).then(() => setTimeout(next, 350)); }; setTimeout(next, 2500); },   // satu per satu
  };
  function loadVoice(name) {
    if (!voices.has(name)) voices.set(name, fetch(`audio/vo/${name}.mp3`).then(r => (r.ok ? r.arrayBuffer() : Promise.reject())).then(b => ctx.decodeAudioData(b)).catch(() => null));
    return voices.get(name);
  }
  function duck(on) { bgmGain?.gain.setTargetAtTime(BGM_LEVEL * (on ? 0.35 : 1), ctx.currentTime, 0.12); }
}
