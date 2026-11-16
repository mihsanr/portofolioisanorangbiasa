/* Pengendali karakter kinematik sederhana (tanpa library fisika): kapsul tegak melawan
   - pulau (heightfield + dinding tebing mengikuti garis tepi),
   - silinder (pilar, batang pohon, batu),
   - kotak sejajar sumbu, dan lantai opsional.
   Pijakan memakai radius kaki yang lebih kecil dari radius badan, jadi karakter tidak "melayang" di tepi.
   Dunia: { floorY, boxes: [{min,max}], cyls: [{x,z,r,y0,y1}], terrains: [island], killY } */
const FOOT_R = 0.13, STEP_UP = 0.32, SNAP = 0.06, SNAP_DOWN = 0.3;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const Q = { rho: 0, h: 0, d: 0, o: 0, nx: 0, nz: 0 };

export function stepBody(b, dt, world) {
  const prevY = b.pos.y, wasGrounded = b.grounded;
  b.pos.x += b.vel.x * dt; b.pos.y += b.vel.y * dt; b.pos.z += b.vel.z * dt;
  b.grounded = false; b.ground = null;
  const r = b.radius, h = b.height;

  const terrains = world.terrains;
  if (terrains) for (let i = 0; i < terrains.length; i++) {
    const t = terrains[i];
    if (t.off) continue;                 // pulau yang sedang runtuh (mode EDAN)
    if (!t.query(b.pos.x, b.pos.z, Q)) continue;
    const inRock = b.pos.y < Q.h - STEP_UP && b.pos.y + h > Q.h - t.wallDepth;
    if (Q.rho <= 1) {
      if (b.vel.y <= 0 && prevY >= Q.h - STEP_UP && b.pos.y <= Q.h + (wasGrounded ? SNAP_DOWN : 0)) {
        b.pos.y = Q.h; b.vel.y = 0; b.grounded = true; b.ground = t;
      } else if (inRock) {
        b.pos.x += Q.nx * (Q.o + r - Q.d); b.pos.z += Q.nz * (Q.o + r - Q.d);
      }
    } else if (Q.d < Q.o + r && inRock) {
      b.pos.x += Q.nx * (Q.o + r - Q.d); b.pos.z += Q.nz * (Q.o + r - Q.d);
    }
  }

  const cyls = world.cyls;
  if (cyls) for (let i = 0; i < cyls.length; i++) {
    const c = cyls[i];
    if (c.owner && c.owner.off) continue;
    const dx = b.pos.x - c.x, dz = b.pos.z - c.z, reach = c.r + r;
    const d2 = dx * dx + dz * dz;
    if (d2 >= reach * reach) continue;
    if (b.pos.y >= c.y1 + SNAP || b.pos.y + h <= c.y0) continue;
    const d = Math.sqrt(d2);
    if (d < c.r + FOOT_R * 0.5 && b.vel.y <= 0 && (prevY >= c.y1 - 0.05 || (wasGrounded && c.y1 - b.pos.y <= STEP_UP))) {
      b.pos.y = c.y1; b.vel.y = 0; b.grounded = true; b.ground = c;
      continue;
    }
    if (b.pos.y >= c.y1) continue;
    if (d > 1e-5) { b.pos.x += dx / d * (reach - d); b.pos.z += dz / d * (reach - d); } else b.pos.x += reach;
  }

  const boxes = world.boxes;
  if (boxes) for (let i = 0; i < boxes.length; i++) {
    const bx = boxes[i], top = bx.max[1], bot = bx.min[1];
    const cx = clamp(b.pos.x, bx.min[0], bx.max[0]), cz = clamp(b.pos.z, bx.min[2], bx.max[2]);
    const dx = b.pos.x - cx, dz = b.pos.z - cz, d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    if (b.pos.y >= top + SNAP || b.pos.y + h <= bot) continue;
    const onFoot = d2 < FOOT_R * FOOT_R;
    if (onFoot && b.vel.y <= 0 && (prevY >= top - 0.05 || (wasGrounded && top - b.pos.y <= STEP_UP))) {
      b.pos.y = top; b.vel.y = 0; b.grounded = true; b.ground = bx;
      continue;
    }
    if (b.pos.y >= top) continue;
    if (b.vel.y > 0 && prevY + h <= bot + 0.05 && onFoot) { b.pos.y = bot - h; b.vel.y = 0; continue; }
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
    b.grounded = true;
  }
}

/* tinggi tanah tertinggi di (x,z) — dipakai kamera supaya tidak masuk ke dalam tanah */
export function groundBelow(world, x, z) {
  let best = world.floorY != null ? world.floorY : -Infinity;
  const terrains = world.terrains;
  if (terrains) for (let i = 0; i < terrains.length; i++) { const y = terrains[i].heightAt(x, z); if (y !== null && y > best) best = y; }
  return best;
}
