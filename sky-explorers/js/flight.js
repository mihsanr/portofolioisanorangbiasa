// Assisted arcade flight + chase camera (PRD 4.3–4.5) + fisika nabrak & jatuh.
// Menabrak tanah/air/bangunan/benda → pesawat terpental, berputar, jatuh karena gravitasi, lalu
// 'respawn' (main.js mengembalikan ke titik awal; koleksi tidak berkurang). Angka di config.js → FLIGHT.
import * as THREE from 'three';
import { FLIGHT as F, TILE } from './config.js';
import { heightAt } from './world.js';

const damp = (k, dt) => 1 - Math.exp(-k * dt);
const GRAVITY = 22, CRASH_TIME = 2.6, SAFE_TIME = 1.5;

// Pegas teredam kritis (tanpa hentakan): s[k] mendekati target, kecepatannya disimpan di s.v[k].
const spring = (s, k, target, time, dt) => {
  const w = 2 / time, x = w * dt, e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x), d = s[k] - target, q = ((s.v[k] || 0) + w * d) * dt;
  s.v[k] = ((s.v[k] || 0) - w * q) * e; s[k] = target + (d + q) * e;
};

export function createFlight(plane, camera, world) {
  const s = { pos: new THREE.Vector3(), yaw: 0, pitch: 0, roll: 0, speed: F.speed, steer: 0, climb: 0, crash: 0, safe: 0, push: 0, v: {} };
  const cam = { yaw: 0, pitch: 0, dist: F.camDist, lift: 0, v: {} };
  const fwd = new THREE.Vector3(), camGoal = new THREE.Vector3(), look = new THREE.Vector3();
  const vel = new THREE.Vector3(), spin = new THREE.Vector3();

  function placeCamera(k) {
    camGoal.set(s.pos.x + Math.sin(s.yaw) * F.camDist, s.pos.y + F.camHeight - Math.sin(s.pitch) * F.camDist * 0.4, s.pos.z + Math.cos(s.yaw) * F.camDist);
    camera.position.lerp(camGoal, k);
    camera.position.y = Math.max(camera.position.y, Math.max(heightAt(camera.position.x, camera.position.z), 0) + 2); // tidak menembus bukit
    camera.lookAt(look.copy(s.pos).addScaledVector(fwd, s.crash ? 0 : 8).add({ x: 0, y: 1.2, z: 0 }));
  }

  // Kamera pengejar: jarak tetap, arah & kemiringan menyusul lewat pegas → belok terasa melengkung, tidak tersendat.
  function chase(dt) {
    if (dt) { spring(cam, 'yaw', s.yaw, 0.42, dt); spring(cam, 'pitch', s.pitch, 0.55, dt); spring(cam, 'dist', F.camDist + (s.speed - F.speed) * 0.15, 0.7, dt); }
    const x = s.pos.x + Math.sin(cam.yaw) * cam.dist, z = s.pos.z + Math.cos(cam.yaw) * cam.dist, y = s.pos.y + F.camHeight - Math.sin(cam.pitch) * cam.dist * 0.45;
    const need = Math.max(0, Math.max(heightAt(x, z), 0) + 2 - y);             // tidak menembus bukit
    if (dt) spring(cam, 'lift', need, 0.4, dt);
    cam.lift = Math.max(cam.lift, need * 0.9);
    camera.position.set(x, y + cam.lift, z);
    const a = cam.yaw + (s.yaw - cam.yaw) * 0.5, r = -s.roll * 0.1;            // sedikit melihat ke dalam tikungan & ikut miring
    camera.up.set(Math.cos(cam.yaw) * Math.sin(r), Math.cos(r), -Math.sin(cam.yaw) * Math.sin(r));
    camera.lookAt(look.set(s.pos.x - Math.sin(a) * 8, s.pos.y + 1.2 + Math.sin(cam.pitch) * 6, s.pos.z - Math.cos(a) * 8));
  }

  function reset() {
    s.pos.set(F.spawn[0] + api.lane * 9, F.spawn[1], F.spawn[2]); s.yaw = s.pitch = s.roll = s.steer = s.climb = s.crash = 0; s.speed = F.speed;
    s.safe = SAFE_TIME; s.v = {}; Object.assign(cam, { yaw: 0, pitch: 0, dist: F.camDist, lift: 0, v: {} });
    fwd.set(0, 0, -1);
    plane.visual.rotation.set(0, 0, 0);
    chase(0);
  }

  function wrap() { // dunia berulang: lewat tepi petak → muncul di sisi seberang (kamera ikut digeser)
    for (const k of ['x', 'z']) if (Math.abs(s.pos[k]) > TILE / 2) {
      const shift = -TILE * Math.sign(s.pos[k]);
      s.pos[k] += shift; camera.position[k] += shift;
    }
  }

  // input: x -1..1 (kanan +), y -1..1 (naik +), boost.
  // Mengembalikan null | 'ground' | 'water' | 'object' (baru menabrak) | 'respawn' (jatuh selesai).
  function update(dt, input, t, invincible = false) {
    if (s.crash) {
      s.crash += dt;
      vel.y -= GRAVITY * dt;
      s.pos.addScaledVector(vel, dt);
      const g = Math.max(heightAt(s.pos.x, s.pos.z), 0) + 0.9;
      if (s.pos.y < g) { s.pos.y = g; vel.multiplyScalar(0.35); vel.y = Math.abs(vel.y) * 0.4; spin.multiplyScalar(0.5); }
      wrap();
      plane.visual.rotation.x += spin.x * dt; plane.visual.rotation.z += spin.z * dt; s.yaw += spin.y * dt * 0.3;
      plane.root.position.copy(s.pos);
      plane.root.rotation.y = s.yaw;
      plane.prop.rotation.z += dt * 4 * Math.max(0, 1 - s.crash);       // baling-baling melambat
      camera.up.set(0, 1, 0); placeCamera(damp(2, dt));
      return s.crash > CRASH_TIME ? 'respawn' : null;
    }

    spring(s, 'steer', input.x, 0.36, dt); spring(s, 'climb', input.y, 0.34, dt);
    s.yaw += -s.steer * F.turnRate * dt;

    // Pitch mengikuti input; tanpa input kembali datar = ketinggian tetap (tetap bisa menabrak kalau menukik).
    let target = s.climb * F.maxPitch;
    if (s.pos.y > F.maxAlt - 15) target = Math.min(target, 0);
    spring(s, 'pitch', target, 0.5, dt); spring(s, 'roll', -s.steer * F.maxRoll, 0.28, dt);
    s.push = Math.max(0, s.push - dt);                       // dorongan sesaat dari cincin
    spring(s, 'speed', input.boost || s.push > 0 ? F.boost : F.speed, 0.75, dt);

    fwd.set(-Math.sin(s.yaw) * Math.cos(s.pitch), Math.sin(s.pitch), -Math.cos(s.yaw) * Math.cos(s.pitch));
    s.pos.addScaledVector(fwd, s.speed * dt);
    s.pos.y = Math.min(s.pos.y, F.maxAlt);
    wrap();

    s.safe = Math.max(0, s.safe - dt);
    let hit = invincible || s.safe > 0 ? null : world.hit(s.pos, 1.1);
    if (hit) {
      s.crash = 1e-6;
      vel.copy(fwd).multiplyScalar(-s.speed * 0.25).setY(hit === 'water' ? 2 : 7);  // terpental ke belakang-atas
      spin.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 4, (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 4));
      s.speed = 0;
    } else if (invincible || s.safe > 0) {
      // saat kebal (menu / baru muncul) jangan pernah tenggelam ke tanah
      const floor = Math.max(heightAt(s.pos.x, s.pos.z), 0) + F.minClear;
      if (s.pos.y < floor) s.pos.y = floor;
    }

    plane.root.position.copy(s.pos);
    plane.root.rotation.y = s.yaw;
    plane.visual.rotation.set(s.pitch + Math.sin(t * 1.1) * 0.012, -s.steer * 0.14, s.roll + Math.sin(t * 0.8) * 0.02);   // hidung masuk ke tikungan + ayunan pelan
    plane.visual.position.y = Math.sin(t * 1.5) * 0.1;
    plane.visual.visible = s.safe <= 0 || Math.floor(t * 10) % 2 === 0;  // berkedip saat baru muncul
    plane.prop.rotation.z += dt * (25 + s.speed * 2);
    chase(dt);
    return hit;
  }

  const api = { state: s, reset, update, lane: 0, get crashed() { return s.crash > 0; } };   // lane = jalur mulai saat main bareng
  return api;
}
