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
  const s = { yaw: Math.PI, pitch: 0.3, dist: 5.0, idle: 9 };
  let init = false;

  const api = {
    camera, state: s, ground: null,
    snap(target, yaw) { s.yaw = yaw; focus.set(target.x, target.y + 1.05, target.z); init = true; },
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

      const dist = s.dist, cp = Math.cos(s.pitch);
      const cx = focus.x + Math.sin(s.yaw) * cp * dist, cz = focus.z + Math.cos(s.yaw) * cp * dist;
      let cy = focus.y + Math.sin(s.pitch) * dist;
      if (api.ground) { const g = api.ground(cx, cz); if (g > -1e8 && cy < g + 0.45) cy = g + 0.45; }
      camera.position.set(cx, cy, cz);
      camera.lookAt(focus.x, focus.y + 0.15, focus.z);
    },
  };
  return api;
}
