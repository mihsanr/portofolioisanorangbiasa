/* Masukan terpadu: keyboard (WASD/panah + Spasi), joystick sentuh mengambang di paruh kiri layar,
   tombol LOMPAT, dan geser (mouse/jari) untuk memutar kamera. Satu objek state dibaca tiap langkah fisika. */
const KEYS = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', Space: 'jump',
};
const JOY_R = 56;

export function createInput(canvas) {
  const held = new Set();
  const ui = { wrap: document.getElementById('touch'), joy: document.getElementById('joy'), knob: document.getElementById('joy-knob'), jump: document.getElementById('btn-jump') };
  const joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
  const look = { id: null, lx: 0, ly: 0, dx: 0, dy: 0 };
  let btnJump = false, prevJump = false, latch = false;
  const state = { x: 0, y: 0, jump: false, jumpPressed: false, sim: null };

  const showTouch = () => { if (ui.wrap && ui.wrap.hidden) ui.wrap.hidden = false; };
  if (matchMedia('(pointer: coarse)').matches) showTouch();

  window.addEventListener('keydown', (e) => {
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;      // sedang mengetik nama
    const k = KEYS[e.code];
    if (!k) return;
    e.preventDefault();
    if (k === 'jump' && !e.repeat) latch = true;
    held.add(k);
  });
  window.addEventListener('keyup', (e) => { const k = KEYS[e.code]; if (k) held.delete(k); });
  window.addEventListener('blur', () => { held.clear(); btnJump = false; });

  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') showTouch();
    if (e.pointerType === 'touch' && e.clientX < window.innerWidth * 0.5 && joy.id === null) {
      joy.id = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY; joy.x = 0; joy.y = 0;
      if (ui.joy) { ui.joy.style.transform = 'translate(' + (joy.ox - JOY_R) + 'px,' + (joy.oy - JOY_R) + 'px)'; ui.joy.classList.add('on'); }
      if (ui.knob) ui.knob.style.transform = 'translate(0px,0px)';
    } else if (look.id === null && (e.pointerType !== 'mouse' || e.button === 0)) {
      look.id = e.pointerId; look.lx = e.clientX; look.ly = e.clientY;
    }
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* pointer sudah lepas */ }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId === joy.id) {
      let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy;
      const d = Math.hypot(dx, dy);
      if (d > JOY_R) { dx *= JOY_R / d; dy *= JOY_R / d; }
      joy.x = dx / JOY_R; joy.y = -dy / JOY_R;
      if (ui.knob) ui.knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    } else if (e.pointerId === look.id) {
      look.dx += e.clientX - look.lx; look.dy += e.clientY - look.ly;
      look.lx = e.clientX; look.ly = e.clientY;
    }
  });
  const release = (e) => {
    if (e.pointerId === joy.id) { joy.id = null; joy.x = 0; joy.y = 0; if (ui.joy) ui.joy.classList.remove('on'); }
    if (e.pointerId === look.id) look.id = null;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  if (ui.jump) {
    ui.jump.addEventListener('pointerdown', (e) => { e.preventDefault(); btnJump = true; latch = true; });
    const up = () => { btnJump = false; };
    ui.jump.addEventListener('pointerup', up); ui.jump.addEventListener('pointercancel', up); ui.jump.addEventListener('pointerleave', up);
  }

  return {
    state,
    /* dipanggil sekali per langkah fisika */
    poll() {
      let x, y, jump;
      if (state.sim) { x = state.sim.x || 0; y = state.sim.y || 0; jump = !!state.sim.jump; }
      else {
        x = joy.id !== null ? joy.x : (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0);
        y = joy.id !== null ? joy.y : (held.has('up') ? 1 : 0) - (held.has('down') ? 1 : 0);
        jump = held.has('jump') || btnJump;
      }
      const len = Math.hypot(x, y);
      if (len > 1) { x /= len; y /= len; }
      state.x = x; state.y = y; state.jump = jump;
      /* tekanan baru = tepi naik, ATAU tekanan yang terjadi (dan mungkin sudah dilepas) sejak pembacaan terakhir */
      state.jumpPressed = (jump && !prevJump) || (latch && !state.sim);
      latch = false;
      prevJump = jump;
      return state;
    },
    /* geseran kamera sejak pemanggilan terakhir (piksel) */
    takeLook(out) { out.dx = look.dx; out.dy = look.dy; out.active = look.id !== null; look.dx = 0; look.dy = 0; return out; },
  };
}
