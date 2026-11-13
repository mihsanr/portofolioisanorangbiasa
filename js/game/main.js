import * as THREE from 'three';
import { createQuality } from './core/quality.js';
import { createRenderer } from './core/renderer.js';
import { createLoop } from './core/loop.js';
import { createDebug } from './core/debug.js';
import { installLeanShadows } from './core/shadows.js';
import { createEnvironment } from './shaders/sky.js';

/* Titik masuk Pemburu Kaset. Adegan dimuat sesuai kebutuhan: ?lab = studio karakter, ?arena = arena uji
   gerak, selain itu level. Level dibangun bertahap sambil menampilkan persentase, lalu loop dimulai. */
installLeanShadows();
const canvas = document.getElementById('game');
const quality = createQuality();
const { renderer, track } = createRenderer(canvas, quality);
const debug = createDebug(renderer, quality);

const sunDir = new THREE.Vector3(-0.46, 0.74, 0.5).normalize();
const env = createEnvironment(renderer, sunDir);
const ctx = { renderer, quality, env, sunDir, track };

const loading = document.getElementById('loading'), bar = document.getElementById('loading-bar'), pct = document.getElementById('loading-pct');
const progress = (p) => new Promise((done) => {
  if (bar) bar.style.transform = 'scaleX(' + p.toFixed(3) + ')';
  if (pct) pct.textContent = Math.round(p * 100) + '%';
  requestAnimationFrame(() => done());
});

const query = new URLSearchParams(location.search);
let stage;
if (query.has('lab')) stage = (await import('./scenes/lab.js')).createLab(ctx);
else if (query.has('arena')) stage = (await import('./scenes/playground.js')).createPlayground(ctx);
else stage = await (await import('./scenes/level.js')).createLevel(ctx, progress);
if (loading) { loading.classList.add('done'); setTimeout(() => loading.remove(), 450); }

const timing = { ready: Math.round(performance.now()), firstFrame: 0 };
const loop = createLoop({
  update(dt) { stage.update(dt); },
  render(dt, alpha) {
    quality.sample(dt); debug.begin(); stage.render(dt, alpha); debug.end(); debug.frame(dt);
    if (!timing.firstFrame) timing.firstFrame = Math.round(performance.now());
  },
});
loop.start();

canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); loop.stop(); });
canvas.addEventListener('webglcontextrestored', () => loop.start());

window.__game = { ready: true, stats: debug.stats, quality, renderer, stage, timing };
