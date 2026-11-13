/* Pengendali karakter kinematik sederhana (tanpa library fisika): kapsul tegak melawan kotak sejajar sumbu
   dan lantai opsional. Pijakan memakai radius kaki yang lebih kecil dari radius badan, jadi karakter tidak
   "melayang" di tepi platform. Dunia: { floorY: number|null, boxes: [{min:[x,y,z], max:[x,y,z]}] } */
const FOOT_R = 0.13, STEP_UP = 0.28, SNAP = 0.06;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function stepBody(b, dt, world) {
  const prevY = b.pos.y, wasGrounded = b.grounded;
  b.pos.x += b.vel.x * dt; b.pos.y += b.vel.y * dt; b.pos.z += b.vel.z * dt;
  b.grounded = false;
  const r = b.radius, h = b.height, boxes = world.boxes;
  for (let i = 0; i < boxes.length; i++) {
    const bx = boxes[i], top = bx.max[1], bot = bx.min[1];
    const cx = clamp(b.pos.x, bx.min[0], bx.max[0]), cz = clamp(b.pos.z, bx.min[2], bx.max[2]);
    const dx = b.pos.x - cx, dz = b.pos.z - cz, d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    if (b.pos.y >= top + SNAP || b.pos.y + h <= bot) continue;
    const onFoot = d2 < FOOT_R * FOOT_R;
    /* mendarat / tetap berdiri di atas */
    if (onFoot && b.vel.y <= 0 && (prevY >= top - 0.05 || (wasGrounded && top - b.pos.y <= STEP_UP))) {
      b.pos.y = top; b.vel.y = 0; b.grounded = true; b.ground = bx;
      continue;
    }
    if (b.pos.y >= top) continue;
    /* kepala membentur sisi bawah */
    if (b.vel.y > 0 && prevY + h <= bot + 0.05 && onFoot) { b.pos.y = bot - h; b.vel.y = 0; continue; }
    /* dorong keluar mendatar */
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2), push = (r - d) / d;
      b.pos.x += dx * push; b.pos.z += dz * push;
    } else {
      const px = Math.min(b.pos.x - bx.min[0], bx.max[0] - b.pos.x), pz = Math.min(b.pos.z - bx.min[2], bx.max[2] - b.pos.z);
      if (px < pz) b.pos.x = (b.pos.x - bx.min[0] < bx.max[0] - b.pos.x) ? bx.min[0] - r : bx.max[0] + r;
      else b.pos.z = (b.pos.z - bx.min[2] < bx.max[2] - b.pos.z) ? bx.min[2] - r : bx.max[2] + r;
    }
  }
  if (world.floorY != null && b.pos.y <= world.floorY) {
    b.pos.y = world.floorY;
    if (b.vel.y < 0) b.vel.y = 0;
    b.grounded = true; b.ground = null;
  }
}
