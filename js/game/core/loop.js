/* Fisika langkah tetap 60 Hz + render per rAF. Berhenti total saat tab tersembunyi. */
export function createLoop({ update, render }) {
  const STEP = 1 / 60;
  let last = 0, acc = 0, raf = 0, running = false;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    let dt = (now - last) / 1000; last = now;
    if (dt > 0.25) dt = 0.25;
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 5) { update(STEP); acc -= STEP; n++; }
    if (n === 5) acc = 0;
    render(dt, acc / STEP);
  }
  function start() { if (running) return; running = true; last = performance.now(); acc = 0; raf = requestAnimationFrame(frame); }
  function stop() { running = false; cancelAnimationFrame(raf); }
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  return { start, stop, get running() { return running; } };
}
