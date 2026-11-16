import * as THREE from 'three';
import { stepBody } from './physics.js';

/* Kontrol platformer: akselerasi/rem, lompat dengan tinggi variabel, double jump, coyote time dan
   jump buffer supaya lompat terasa adil di tepi platform. Semua angka dalam meter & detik. */
export const MOVE = {
  maxSpeed: 5.4, accel: 42, decel: 48, airAccel: 20, turnRate: 13,
  jump: 9.4, jump2: 8.6, gravityUp: 25, gravityDown: 38, cutGravity: 2.3, terminal: 30,
  coyote: 0.11, buffer: 0.13,
};

const TAU = Math.PI * 2;
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

export function createPlayer(character, hooks = {}) {
  const body = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), radius: 0.28, height: 1.5, grounded: true, ground: null };
  const prev = new THREE.Vector3();
  const spawn = new THREE.Vector3();
  const s = { yaw: 0, turn: 0, coyote: 0, buffer: 0, airJumps: 0, speed: 0, held: false, boost: false };

  function teleport(x, y, z, yaw = s.yaw) {
    body.pos.set(x, y, z); prev.copy(body.pos); body.vel.set(0, 0, 0); s.yaw = yaw;
  }

  return {
    body, state: s, character, spawn, teleport,
    setSpawn(x, y, z) { spawn.set(x, y, z); },
    /* dilontarkan jump pad / pegas: tinggi penuh tanpa perlu menahan tombol, double jump tersedia lagi */
    launch(vy) {
      body.vel.y = vy; body.grounded = false; body.ground = null;
      s.coyote = 0; s.buffer = 0; s.held = true; s.boost = true; s.airJumps = 0;
      hooks.onJump && hooks.onJump(false);
    },
    update(dt, input, camYaw, world) {
      /* berdiri di platform bergerak: ikut terbawa */
      if (body.grounded && body.ground && body.ground.delta) body.pos.add(body.ground.delta);
      prev.copy(body.pos);
      /* arah gerak relatif kamera: maju = menjauhi kamera */
      const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
      const wx = fx * input.y - fz * input.x, wz = fz * input.y + fx * input.x;
      const mag = Math.min(1, Math.hypot(input.x, input.y));
      const tx = wx * MOVE.maxSpeed, tz = wz * MOVE.maxSpeed;
      const rate = (body.grounded ? (mag > 0.01 ? MOVE.accel : MOVE.decel) : MOVE.airAccel) * dt;
      const dvx = tx - body.vel.x, dvz = tz - body.vel.z, dv = Math.hypot(dvx, dvz);
      if (dv <= rate) { body.vel.x = tx; body.vel.z = tz; } else { body.vel.x += dvx / dv * rate; body.vel.z += dvz / dv * rate; }
      s.speed = Math.hypot(body.vel.x, body.vel.z);

      /* badan berputar ke arah gerak */
      if (mag > 0.05) {
        const d = angDiff(s.yaw, Math.atan2(wx, wz));
        const step = Math.sign(d) * Math.min(Math.abs(d), MOVE.turnRate * dt);
        s.yaw += step; s.turn = step / dt;
      } else s.turn = 0;

      /* lompat */
      s.buffer = input.jumpPressed ? MOVE.buffer : s.buffer - dt;
      s.coyote = body.grounded ? MOVE.coyote : s.coyote - dt;
      if (s.buffer > 0) {
        if (s.coyote > 0) {
          body.vel.y = MOVE.jump; s.coyote = 0; s.buffer = 0; body.grounded = false; s.held = true;
          hooks.onJump && hooks.onJump(false);
        } else if (s.airJumps < 1) {
          s.airJumps++; s.buffer = 0;
          if (!hooks.canDouble || hooks.canDouble()) {        // mode EDAN: kadang macet
            body.vel.y = MOVE.jump2; s.held = true;
            hooks.onJump && hooks.onJump(true);
          }
        }
      }
      if (body.vel.y <= 0) s.boost = false;
      if (!input.jump && !s.boost) s.held = false;
      let g = body.vel.y > 0 ? MOVE.gravityUp : MOVE.gravityDown;
      if (body.vel.y > 0 && !s.held) g *= MOVE.cutGravity;      // lepas tombol = lompatan pendek
      body.vel.y = Math.max(body.vel.y - g * dt, -MOVE.terminal);

      const wasGrounded = body.grounded, impact = -body.vel.y;
      stepBody(body, dt, world);
      if (body.grounded) {
        if (!wasGrounded && impact > 1.5) hooks.onLand && hooks.onLand(impact);
        s.airJumps = 0;
      }
      if (body.pos.y < (world.killY ?? -25)) { teleport(spawn.x, spawn.y, spawn.z); hooks.onRespawn && hooks.onRespawn(); }
    },
    /* posisi dirender di antara dua langkah fisika supaya mulus di layar 90/120 Hz */
    render(alpha) {
      const r = character.root;
      r.position.lerpVectors(prev, body.pos, alpha);
      r.rotation.y = s.yaw;
    },
  };
}
