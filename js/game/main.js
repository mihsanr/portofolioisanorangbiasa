import * as THREE from 'three';
import { createQuality } from './core/quality.js';
import { createRenderer } from './core/renderer.js';
import { createLoop } from './core/loop.js';
import { createDebug } from './core/debug.js';
import { installLeanShadows } from './core/shadows.js';
import { createEnvironment } from './shaders/sky.js';

/* Titik masuk Pemburu Kaset. Adegan dimuat sesuai kebutuhan: ?lab = studio karakter, ?arena = arena uji
   gerak, selain itu level. Level dibangun bertahap sambil menampilkan persentase, lalu loop dimulai.
   Kalau perangkat tidak sanggup (tanpa WebGL 2, atau gagal saat membangun), pemain mendapat pesan yang
   jelas di layar memuat, bukan layar kosong. */
const loading = document.getElementById('loading'), bar = document.getElementById('loading-bar'), pct = document.getElementById('loading-pct');
const progress = (p) => new Promise((done) => {
  if (bar) bar.style.transform = 'scaleX(' + p.toFixed(3) + ')';
  if (pct) pct.textContent = Math.round(p * 100) + '%';
  requestAnimationFrame(() => done());
});
function fail(text) {
  if (!loading) return;
  loading.classList.add('failed');
  const span = loading.querySelector('span');
  if (span) span.textContent = text;
}

try {
  installLeanShadows();
  const canvas = document.getElementById('game');
  const quality = createQuality();
  const { renderer, track } = createRenderer(canvas, quality);
  const debug = createDebug(renderer, quality);

  const sunDir = new THREE.Vector3(-0.46, 0.74, 0.5).normalize();
  const env = createEnvironment(renderer, sunDir);
  const ctx = { renderer, quality, env, sunDir, track };

  const query = new URLSearchParams(location.search);
  let stage, flow = null;
  if (query.has('lab') || query.has('arena')) {       // adegan uji: tanpa layar judul / HUD
    document.body.dataset.state = 'lab';
    const t = document.getElementById('title'); if (t) t.hidden = true;
  }
  if (query.has('lab')) stage = (await import('./scenes/lab.js')).createLab(ctx);
  else if (query.has('arena')) stage = (await import('./scenes/playground.js')).createPlayground(ctx);
  else {
    stage = await (await import('./scenes/level.js')).createLevel(ctx, progress);
    const [{ createHud }, { createBoard }, { createSfx }, { createFlow }] = await Promise.all([
      import('./game/hud.js'), import('./game/board.js'), import('./game/sfx.js'), import('./game/flow.js'),
    ]);
    const board = createBoard();
    flow = createFlow(stage, createHud(), board, createSfx(board.local.mute));
    if (query.has('mode')) flow.setMode(query.get('mode'));   // ?mode=edan
    if (query.has('autostart')) flow.start();        // untuk uji otomatis: lewati layar judul
  }
  if (loading) { loading.classList.add('done'); setTimeout(() => loading.remove(), 450); }

  const timing = { ready: Math.round(performance.now()), firstFrame: 0 };
  const loop = createLoop({
    update(dt) { stage.update(dt); if (flow) flow.update(dt); },
    render(dt, alpha) {
      quality.sample(dt); debug.begin(); stage.render(dt, alpha); debug.end(); debug.frame(dt);
      if (!timing.firstFrame) timing.firstFrame = Math.round(performance.now());
    },
  });
  loop.start();

  /* Konteks WebGL bisa hilang (HP mengambil memori GPU saat tab di latar). Isi render target seperti
     environment map tidak bisa dipulihkan, jadi cara yang pasti benar adalah memuat ulang halaman.
     Waktu terbaik aman karena tersimpan di perangkat. */
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); loop.stop(); });
  canvas.addEventListener('webglcontextrestored', () => location.reload());

  window.__game = { ready: true, stats: debug.stats, quality, renderer, stage, flow, timing, loop };
} catch (err) {
  console.error(err);
  fail(/webgl/i.test(String(err && err.message)) ? 'PERANGKAT INI TIDAK MENDUKUNG WEBGL 2' : 'GAGAL MEMUAT — COBA MUAT ULANG');
}
