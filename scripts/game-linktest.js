// Uji keterjangkauan tiap sambungan level dengan masukan simulasi (dijalankan di dalam halaman).
// Buka game.html?autostart supaya layar judul dilewati, lalu tempel skrip ini di console.
// Hasil ada di window.__links setelah window.__linksDone bernilai true (±70 detik).
(async () => {
  const s = __game.stage, I = s.islands, P = s.player, B = P.body, cam = s.cam.state, inp = s.input.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const gid = () => (B.grounded && B.ground && B.ground.id ? B.ground.id : (B.grounded ? 'prop' : null));
  const face = (ux, uz) => { cam.yaw = Math.atan2(-ux, -uz); cam.idle = -9999; };
  const res = {};
  window.__links = res; window.__linksDone = false;

  async function jumpLink(a, b) {
    const A = I[a], T = I[b];
    const th = Math.atan2(T.pos.z - A.pos.z, T.pos.x - A.pos.x), ux = Math.cos(th), uz = Math.sin(th);
    const o = A.outline(th), r0 = Math.max(0, o - 2.6), x = A.pos.x + ux * r0, z = A.pos.z + uz * r0;
    P.teleport(x, A.heightAt(x, z) + 0.02, z, Math.atan2(ux, uz));
    face(ux, uz);
    inp.sim = { x: 0, y: 0, jump: false };
    await sleep(300);
    inp.sim = { x: 0, y: 1, jump: false };
    let phase = 0, landed = 'WAKTU HABIS';
    const t0 = performance.now();
    while (performance.now() - t0 < 5000) {
      await sleep(8);
      const d = Math.hypot(B.pos.x - A.pos.x, B.pos.z - A.pos.z);
      if (phase === 0 && d > o - 0.6) { inp.sim = { x: 0, y: 1, jump: true }; phase = 1; }
      else if (phase === 1 && !B.grounded && B.vel.y < 1.5) { inp.sim = { x: 0, y: 1, jump: false }; phase = 2; }
      else if (phase === 2) { inp.sim = { x: 0, y: 1, jump: true }; phase = 3; }
      else if (phase >= 3 && B.grounded) { landed = gid(); break; }
      if (B.pos.y < Math.min(A.pos.y, T.pos.y) - 7) { landed = 'JATUH'; break; }
    }
    inp.sim = { x: 0, y: 0, jump: false };
    await sleep(200);
    return landed;
  }

  async function springLink(a, b) {
    const A = I[a], T = I[b];
    const sp = s.props.springs.reduce((best, q) => (Math.hypot(q.x - A.pos.x, q.z - A.pos.z) < Math.hypot(best.x - A.pos.x, best.z - A.pos.z) ? q : best));
    const th = Math.atan2(T.pos.z - sp.z, T.pos.x - sp.x), ux = Math.cos(th), uz = Math.sin(th);
    P.teleport(sp.x, sp.y + 1.0, sp.z, Math.atan2(ux, uz));
    face(ux, uz);
    inp.sim = { x: 0, y: 1, jump: false };
    let landed = 'WAKTU HABIS', air = false;
    const t0 = performance.now();
    while (performance.now() - t0 < 6000) {
      await sleep(8);
      if (!B.grounded && B.pos.y > sp.y + 3) air = true;
      if (air && B.grounded) { landed = gid(); break; }
      if (B.pos.y < A.pos.y - 7) { landed = 'JATUH'; break; }
    }
    inp.sim = { x: 0, y: 0, jump: false };
    await sleep(200);
    return landed;
  }

  async function cartLink(i, b) {
    const c = s.props.carts[i], T = I[b];
    const dx = c.b[0] - c.a[0], dz = c.b[2] - c.a[2], l = Math.hypot(dx, dz), ux = dx / l, uz = dz / l;
    P.teleport(c.pos.x, c.pos.y + 0.3, c.pos.z, Math.atan2(ux, uz));
    face(ux, uz);
    inp.sim = { x: 0, y: 0, jump: false };
    const t0 = performance.now();
    let rode = false;
    while (performance.now() - t0 < 12000) {
      await sleep(16);
      if (!B.grounded && B.pos.y < c.pos.y - 3) return 'JATUH DARI TROLI';
      if (Math.hypot(c.pos.x - c.b[0], c.pos.z - c.b[2]) < 0.35) { rode = true; break; }
    }
    if (!rode) return 'TROLI TIDAK SAMPAI';
    inp.sim = { x: 0, y: 1, jump: false };
    await sleep(1100);
    inp.sim = { x: 0, y: 0, jump: false };
    await sleep(200);
    return gid();
  }

  const jumps = [['A', 'B1'], ['B1', 'B2'], ['B2', 'B3'], ['B3', 'C'], ['D', 'S1'], ['S1', 'S2'], ['S2', 'E'], ['G', 'H'], ['H', 'T'], ['T', 'A']];
  for (const [a, b] of jumps) res[a + '>' + b] = await jumpLink(a, b);
  res['F>G (pegas)'] = await springLink('F', 'G');
  res['C>D (troli)'] = await cartLink(0, 'D');
  res['E>F (troli)'] = await cartLink(1, 'F');
  window.__linksDone = true;
})();
