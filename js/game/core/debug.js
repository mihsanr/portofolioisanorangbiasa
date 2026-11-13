/* Overlay ?debug=1: FPS, waktu CPU (JS) & GPU sungguhan per frame, draw call, segitiga, memori GPU.
   Waktu GPU diukur dengan timer query (bila didukung) supaya tidak tertipu vsync / beban aplikasi lain.
   Tanpa ?debug tidak ada query yang dibuat. Dipakai juga oleh uji headless lewat window.__game.stats. */
export function createDebug(renderer, quality) {
  const el = document.getElementById('debug');
  const on = new URLSearchParams(location.search).has('debug');
  if (el) el.hidden = !on;
  const gl = renderer.getContext();
  const ext = on && gl.createQuery ? gl.getExtension('EXT_disjoint_timer_query_webgl2') : null;
  const s = { fps: 0, ms: 0, cpu: 0, gpu: -1, calls: 0, tris: 0, geos: 0, tex: 0, programs: 0, quality: '', dpr: 1 };
  let acc = 0, frames = 0, t = 0, t0 = 0, cpuAcc = 0, gpuAcc = 0, gpuN = 0, query = null;
  const waiting = [];
  return {
    stats: s,
    begin() {
      if (!on) return;
      t0 = performance.now();
      if (ext && waiting.length < 8) { query = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, query); }
    },
    end() {
      if (!on) return;
      if (query) { gl.endQuery(ext.TIME_ELAPSED_EXT); waiting.push(query); query = null; }
      cpuAcc += performance.now() - t0;
      while (waiting.length && gl.getQueryParameter(waiting[0], gl.QUERY_RESULT_AVAILABLE)) {
        const q = waiting.shift();
        if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) { gpuAcc += gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6; gpuN++; }
        gl.deleteQuery(q);
      }
    },
    frame(dt) {
      acc += dt; frames++; t += dt;
      const info = renderer.info;
      s.calls = info.render.calls; s.tris = info.render.triangles;
      if (t < 0.5) return;
      s.fps = Math.round(frames / acc); s.ms = +(1000 * acc / frames).toFixed(1);
      s.cpu = +(cpuAcc / frames).toFixed(2);
      if (gpuN) s.gpu = +(gpuAcc / gpuN).toFixed(2);
      s.geos = info.memory.geometries; s.tex = info.memory.textures;
      s.programs = info.programs ? info.programs.length : 0;
      s.quality = quality.profile.name; s.dpr = +renderer.getPixelRatio().toFixed(2);
      acc = 0; frames = 0; t = 0; cpuAcc = 0; gpuAcc = 0; gpuN = 0;
      if (on && el) {
        el.textContent = s.fps + ' fps  ' + s.ms + ' ms\ncpu ' + s.cpu + '  gpu ' + (s.gpu < 0 ? '-' : s.gpu) + ' ms\ncalls ' + s.calls + '  tris ' + s.tris
          + '\ngeo ' + s.geos + '  tex ' + s.tex + '  prog ' + s.programs + '\n' + s.quality + '  dpr ' + s.dpr;
      }
    },
  };
}
