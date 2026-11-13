import * as THREE from 'three';
import { createQuality } from './core/quality.js';
import { createRenderer } from './core/renderer.js';
import { createLoop } from './core/loop.js';
import { createDebug } from './core/debug.js';
import { installLeanShadows } from './core/shadows.js';
import { createEnvironment } from './shaders/sky.js';
import { createLab } from './scenes/lab.js';
import { createPlayground } from './scenes/playground.js';

/* Titik masuk Pemburu Kaset. ?lab=character membuka studio aset; selain itu arena uji gerak (Tahap 3). */
installLeanShadows();
const canvas = document.getElementById('game');
const quality = createQuality();
const { renderer, track } = createRenderer(canvas, quality);
const debug = createDebug(renderer, quality);

const sunDir = new THREE.Vector3(-0.46, 0.74, 0.5).normalize();
const env = createEnvironment(renderer, sunDir);
const ctx = { renderer, quality, env, sunDir, track };

const stage = new URLSearchParams(location.search).has('lab') ? createLab(ctx) : createPlayground(ctx);

const loop = createLoop({
  update(dt) { stage.update(dt); },
  render(dt, alpha) { quality.sample(dt); debug.begin(); stage.render(dt, alpha); debug.end(); debug.frame(dt); },
});
loop.start();

canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); loop.stop(); });
canvas.addEventListener('webglcontextrestored', () => loop.start());

window.__game = { ready: true, stats: debug.stats, quality, renderer, stage };
