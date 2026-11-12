/* Overlay ?debug=1: FPS, draw call, segitiga, memori GPU. Juga dipakai uji headless lewat window.__game. */
export function createDebug(renderer, quality) {
  const el = document.getElementById('debug');
  const on = new URLSearchParams(location.search).has('debug');
  if (el) el.hidden = !on;
  const s = { fps: 0, ms: 0, calls: 0, tris: 0, geos: 0, tex: 0, programs: 0, quality: '', dpr: 1 };
  let acc = 0, frames = 0, t = 0;
  return {
    stats: s,
    frame(dt) {
      acc += dt; frames++; t += dt;
      const info = renderer.info;
      s.calls = info.render.calls; s.tris = info.render.triangles;
      if (t < 0.5) return;
      s.fps = Math.round(frames / acc); s.ms = +(1000 * acc / frames).toFixed(1);
      s.geos = info.memory.geometries; s.tex = info.memory.textures;
      s.programs = info.programs ? info.programs.length : 0;
      s.quality = quality.profile.name; s.dpr = +renderer.getPixelRatio().toFixed(2);
      acc = 0; frames = 0; t = 0;
      if (on && el) {
        el.textContent = s.fps + ' fps  ' + s.ms + ' ms\ncalls ' + s.calls + '  tris ' + s.tris
          + '\ngeo ' + s.geos + '  tex ' + s.tex + '  prog ' + s.programs + '\n' + s.quality + '  dpr ' + s.dpr;
      }
    },
  };
}
