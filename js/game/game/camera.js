import * as THREE from 'three';

/* Kamera third-person: mengorbit di belakang pemain, bisa digeser (mouse/jari), dan pelan-pelan kembali
   ke belakang arah lari kalau tidak disentuh. Sumbu tegak diredam lebih lembut supaya lompatan terasa berbobot. */
const TAU = Math.PI * 2;
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

export function createFollowCamera(track) {
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 600);
  track(camera);
  const focus = new THREE.Vector3(), look = { dx: 0, dy: 0, active: false };
  const s = { yaw: Math.PI, pitch: 0.3, dist: 5.0, idle: 9, cur: 5.0 };
  let init = false;

  const api = {
    camera, state: s, ground: null, blocked: null,
    snap(target, yaw) { s.yaw = yaw; s.cur = s.dist; focus.set(target.x, target.y + 1.05, target.z); init = true; },
    update(dt, target, vel, input) {
      const portrait = camera.aspect < 1;
      const fov = portrait ? 72 : 55;
      if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }

      input.takeLook(look);
      if (look.dx || look.dy || look.active) s.idle = 0; else s.idle += dt;
      s.yaw -= look.dx * 0.0055;
      s.pitch = Math.min(1.15, Math.max(-0.12, s.pitch + look.dy * 0.004));

      /* kembali ke belakang arah lari (tidak saat pemain berlari ke arah kamera) */
      const sp = Math.hypot(vel.x, vel.z);
      if (s.idle > 1.1 && sp > 1.2) {
        const d = angDiff(s.yaw, Math.atan2(-vel.x, -vel.z));
        if (Math.abs(d) < 2.4) s.yaw += d * Math.min(1, dt * 1.5);
      }

      if (!init) { focus.set(target.x, target.y + 1.05, target.z); init = true; }
      focus.x = damp(focus.x, target.x, 14, dt);
      focus.z = damp(focus.z, target.z, 14, dt);
      focus.y = damp(focus.y, target.y + 1.05, 6, dt);

      /* kalau ada pulau di antara pemain dan kamera, kamera merapat (cepat) lalu menjauh lagi (pelan) */
      const cp = Math.cos(s.pitch), dx = Math.sin(s.yaw) * cp, dy = Math.sin(s.pitch), dz = Math.cos(s.yaw) * cp;
      let want = s.dist;
      if (api.blocked) for (let k = 1; k <= 6; k++) {
        const t = s.dist * k / 6;
        if (api.blocked(focus.x + dx * t, focus.y + dy * t, focus.z + dz * t)) { want = Math.max(1.3, t - s.dist / 6 - 0.2); break; }
      }
      s.cur = damp(s.cur, want, want < s.cur ? 20 : 3.5, dt);
      const dist = s.cur;
      const cx = focus.x + dx * dist, cz = focus.z + dz * dist;
      let cy = focus.y + dy * dist;
      if (api.ground) { const g = api.ground(cx, cz); if (g > -1e8 && cy < g + 0.45) cy = g + 0.45; }
      camera.position.set(cx, cy, cz);
      camera.lookAt(focus.x, focus.y + 0.15, focus.z);
    },
  };
  return api;
}
