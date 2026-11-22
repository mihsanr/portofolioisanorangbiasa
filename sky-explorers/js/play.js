// Gelembung huruf: huruf yang sudah dimiliki sesekali lewat lagi untuk diulang (pecah → bunyinya terdengar).
import * as THREE from 'three';
import { LETTERS, COLORS } from './config.js';
import { near, heightAt } from './world.js';
import { toon } from './toon.js';

const color = d => COLORS[d.i % COLORS.length];

export function createPlay({ scene, world, flight, fx, audio, quests, owned, say, showCard }) {
  const geoOf = Object.fromEntries(world.items.map(i => [i.data.ch, i.mesh.geometry])), st = flight.state;
  const glyph = () => { const m = new THREE.Mesh(geoOf.A, toon({ emissive: 0x222222, fog: false, transparent: true }, { spec: 1, shine: 40, rim: 0.4, hq: true })); m.renderOrder = 2; return m; };
  const paint = (m, d) => { m.geometry = geoOf[d.ch]; m.material.color.set(color(d)); m.material.emissive.set(color(d)).multiplyScalar(0.32); };
  const geo = new THREE.SphereGeometry(4, 20, 14), mat = new THREE.MeshPhongMaterial({ color: 0xbfe9ff, specular: 0xffffff, shininess: 90, emissive: 0x2a5a7a, transparent: true, opacity: 0.34, depthWrite: false, fog: false });
  const bubbles = [0, 1, 2].map(() => { const m = new THREE.Mesh(geo, mat), l = glyph(); l.scale.setScalar(0.52); m.add(l); m.visible = false; m.renderOrder = 3; scene.add(m); return { m, l, d: null, home: new THREE.Vector3(), t: 0 }; });
  let wait = 9, order = [], count = 0;
  function spawnBubble() {
    const b = bubbles.find(b => !b.m.visible), have = LETTERS.filter(d => owned(d.ch)); if (!b || !have.length) return;
    if (!order.length) order = have.sort(() => Math.random() - 0.5);      // semua huruf bergiliran diulang
    const a = st.yaw + (Math.random() - 0.5) * 0.5, D = 75 + Math.random() * 30;
    b.home.set(st.pos.x - Math.sin(a) * D, 0, st.pos.z - Math.cos(a) * D);
    b.home.y = Math.max(st.pos.y + (Math.random() - 0.5) * 14, heightAt(b.home.x, b.home.z) + 14, 10);
    if (world.hit(b.home, 7) || world.items.some(i => i.state === 'idle' && i.home.distanceTo(b.home) < 14)) return;
    b.d = order.pop(); paint(b.l, b.d); b.t = 0; b.m.visible = true;
  }
  return {
    bubbles, spawnBubble,
    reset() { bubbles.forEach(b => { b.m.visible = false; }); wait = 9; },
    update(dt, t, cam) {
      if ((wait -= dt * (quests.kind === 'bubble' ? 2.5 : 1)) <= 0) { wait = 12; spawnBubble(); }
      bubbles.forEach((b, i) => {
        if (!b.m.visible) return;
        b.t += dt; b.home.y += dt * 0.25;
        b.m.position.set(near(b.home.x, st.pos.x) + Math.sin(t * 0.8 + i * 2) * 1.2, b.home.y + Math.sin(t * 1.4 + i) * 0.6, near(b.home.z, st.pos.z));
        const d = b.m.position.distanceTo(st.pos), u = Math.min(1, b.t * 1.2, (30 - b.t) * 1.2), k = Math.max(0.001, u * u * (3 - 2 * u));
        b.m.scale.set(k * (1 + Math.sin(t * 2.4 + i) * 0.03), k * (1 - Math.sin(t * 2.4 + i) * 0.03), k);
        b.m.rotation.y = Math.atan2(cam.x - b.m.position.x, cam.z - b.m.position.z);
        if (d < 6.4) { b.m.visible = false; fx.collect(b.m.position, color(b.d)); audio.play('bubble'); quests.star(1); setTimeout(() => say(b.d), 200); showCard(b.d); quests.event('bubble', count++); }
        else if (b.t > 30 || d > 260) b.m.visible = false;
      });
    },
  };
}
