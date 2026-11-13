import { FACE } from '../shaders/crt-screen.js';

/* Animasi prosedural: tidak ada klip — tiap frame sudut tulang dihitung dari fase lari (maju sesuai
   jarak tempuh, jadi kaki tidak meluncur), kecepatan vertikal, dan pegas squash-stretch.
   Pose tanah (diam↔lari) dicampur dengan pose udara (naik↔jatuh). */
const TAU = Math.PI * 2;
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const mix = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const STRIDE = 2.55;           // radian fase per meter

export function createAnimator(c, hooks = {}) {
  const b = c.bones, hipY = b.hips.position.y;
  let phase = 0, run = 0, air = 0, t = 0, sq = 0, sqv = 0, flip = -1, roll = 0;
  let face = FACE.happy, faceT = 0, blink = 2.5;

  return {
    onJump(double) {
      sqv += 2.6;
      if (double) { flip = 0; face = FACE.wow; faceT = 0.5; }
    },
    onLand(impact) {
      sqv -= Math.min(impact, 24) * 0.2;
      if (impact > 19) { face = FACE.dizzy; faceT = 0.7; }
    },
    update(dt, s) {
      t += dt;
      run = damp(run, clamp(s.speed / s.maxSpeed, 0, 1), 12, dt);
      air = damp(air, s.grounded ? 0 : 1, s.grounded ? 20 : 13, dt);
      const prev = phase;
      phase += s.speed * STRIDE * dt * (s.grounded ? 1 : 0.3);
      if (s.grounded && run > 0.45 && hooks.onStep) {
        const k0 = Math.floor((prev - Math.PI / 2) / Math.PI), k1 = Math.floor((phase - Math.PI / 2) / Math.PI);
        if (k1 > k0) hooks.onStep(k1 % 2 === 0 ? 1 : -1);
      }

      const sn = Math.sin(phase), cs = Math.cos(phase), A = run, I = 1 - run, br = Math.sin(t * 1.7);
      /* pose tanah */
      let thL = (-0.98 * sn - 0.14) * A, thR = (0.98 * sn - 0.14) * A;
      let shL = (0.26 + 1.3 * Math.pow(Math.max(0, cs), 1.25)) * A, shR = (0.26 + 1.3 * Math.pow(Math.max(0, -cs), 1.25)) * A;
      let ftL = (0.08 - 0.38 * sn) * A, ftR = (0.08 + 0.38 * sn) * A;
      let arLx = 0.9 * sn * A, arRx = -0.9 * sn * A;
      let foL = (-1.25 + 0.32 * sn) * A - 0.16 * I, foR = (-1.25 - 0.32 * sn) * A - 0.16 * I;
      let arZ = (0.13 + 0.012 * br) * I + 0.2 * A;
      let hipsY = (-0.04 + 0.032 * Math.cos(2 * phase)) * A - 0.004 * br * I;
      let hipsX = 0.25 * A, chX = 0.07 * A + 0.02 * br * I, hdX = -0.2 * A;
      const hipsYaw = -0.17 * sn * A, chYaw = 0.36 * sn * A;
      const hdYaw = -0.19 * sn * A + 0.07 * Math.sin(t * 0.6) * I;

      /* pose udara: u = 1 saat naik, 0 saat jatuh */
      if (air > 0.001) {
        const u = clamp(s.vy / 7, -1, 1) * 0.5 + 0.5, fl = Math.sin(t * 17) * 0.13 * (1 - u);
        thL = mix(thL, mix(-0.35, -1.1, u), air); shL = mix(shL, mix(0.6, 1.5, u), air);
        thR = mix(thR, mix(0.3, -0.1, u), air); shR = mix(shR, mix(0.5, 1.05, u), air);
        ftL = mix(ftL, 0.4, air); ftR = mix(ftR, 0.45, air);
        arLx = mix(arLx, mix(-0.15, -0.65, u) + fl, air); arRx = mix(arRx, mix(-0.15, -0.65, u) - fl, air);
        foL = mix(foL, mix(-0.3, -0.95, u), air); foR = mix(foR, mix(-0.3, -0.95, u), air);
        arZ = mix(arZ, mix(1.3, 0.7, u), air);
        hipsY = mix(hipsY, 0, air); hipsX = mix(hipsX, mix(-0.1, 0.14, u), air);
        chX = mix(chX, mix(-0.08, 0.05, u), air); hdX = mix(hdX, mix(0.18, -0.15, u), air);
      }

      roll = damp(roll, clamp(-s.turn * 0.035, -0.28, 0.28) * run, 9, dt);
      b.hips.position.y = hipY + hipsY;
      b.hips.rotation.set(hipsX, hipsYaw * (1 - air), 0.05 * sn * A * (1 - air) + roll);
      b.chest.rotation.set(chX, chYaw * (1 - air), -roll * 0.4);
      b.head.rotation.set(hdX, hdYaw * (1 - air), -roll * 0.5);
      b.thighL.rotation.set(thL, 0, 0.035 * I); b.thighR.rotation.set(thR, 0, -0.035 * I);
      b.shinL.rotation.x = shL; b.shinR.rotation.x = shR;
      b.footL.rotation.set(ftL, 0.14 * I, 0); b.footR.rotation.set(ftR, -0.14 * I, 0);
      b.armL.rotation.set(arLx, 0, arZ); b.armR.rotation.set(arRx, 0, -arZ);
      b.foreL.rotation.set(foL, 0, -0.05 * I); b.foreR.rotation.set(foR, 0, 0.05 * I);

      /* squash & stretch (pegas teredam), pivot di telapak kaki */
      sqv += (-250 * sq - 17 * sqv) * dt; sq = clamp(sq + sqv * dt, -0.34, 0.26);
      c.root.scale.set(1 - sq * 0.5, 1 + sq, 1 - sq * 0.5);

      /* salto depan saat double jump */
      if (flip >= 0) {
        flip += dt / 0.52;
        const e = 1 - Math.pow(1 - Math.min(flip, 1), 2.1);
        c.pivot.rotation.x = e * TAU;
        if (flip >= 1 || (s.grounded && flip > 0.15)) { flip = -1; c.pivot.rotation.x = 0; }
      }

      /* wajah */
      if (faceT > 0) { faceT -= dt; c.setFace(face); }
      else if (!s.grounded && s.vy < -14) c.setFace(FACE.wow);
      else { blink -= dt; if (blink < -0.13) blink = 2.2 + Math.random() * 2.6; c.setFace(blink < 0 ? FACE.blink : FACE.happy); }
    },
  };
}
