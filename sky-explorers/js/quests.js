// Misi bergambar tanpa teks & tanpa timer. Semua misi tentang huruf.
import { near } from './world.js';

// find = dengar lalu cari huruf ini · letter = kumpulkan · pair = pasangan Aa · bubble = gelembung huruf
export const MISSIONS = [
  { k: 'letter', n: 3, icon: '🔤' }, { k: 'find', n: 1 }, { k: 'find', n: 1 }, { k: 'pair', n: 1, icon: '<b class="p">Aa</b>' },
  { k: 'bubble', n: 3, icon: '🔮' }, { k: 'find', n: 1 }, { k: 'letter', n: 5, icon: '🔤' }, { k: 'pair', n: 2, icon: '<b class="p">Aa</b>' },
];

export function createQuests({ world, save, persist, flight, fx, audio, owned, onStar, onMission }) {
  const dist = (p, x, y, z) => Math.hypot(near(x, p.x) - p.x, y - p.y, near(z, p.z) - p.z);
  let seen = new Set();
  const mission = () => MISSIONS[(save.mission || 0) % MISSIONS.length];
  const star = (n = 1) => { save.stars = (save.stars || 0) + n; persist(); onStar(save.stars); };
  // Huruf yang dicari: salah satu yang terdekat & belum dimiliki (kalau sudah lengkap: huruf mana pun, untuk diulang).
  let target = null;
  function aim() {
    if (mission().k !== 'find') { target = null; return; }
    const p = flight.state.pos, letters = world.items.filter(i => i.data.kind === 'letter'), idle = letters.filter(i => i.state === 'idle'), todo = idle.filter(i => !owned(i.data.ch));
    const far = (todo.length ? todo : idle).map(i => [dist(p, i.home.x, i.home.y, i.home.z), i]).filter(q => q[0] > 45).sort((a, b) => a[0] - b[0]).slice(0, 5);
    target = far.length ? far[Math.floor(Math.random() * far.length)][1].data : letters[0].data;
  }
  const show = (n, done) => onMission({ ...mission(), target }, n, done);
  function event(kind, id) {                                      // kejadian → kemajuan misi
    const m = mission();
    if (m.k === 'find' && kind === 'letter' && id === target?.ch) kind = 'find';
    if (m.k !== kind || seen.has(id)) return;
    seen.add(id);
    show(seen.size, false);
    if (seen.size >= m.n) {
      star(5); audio.play('fanfare'); fx.party(flight.state.pos);
      show(m.n, true);
      save.mission = (save.mission || 0) + 1; persist(); seen = new Set(); target = null;
      setTimeout(() => { aim(); show(0, false); }, 2600);
    }
  }

  return {
    event, star, get target() { return target; }, get kind() { return mission().k; },
    refresh() { if (mission().k === 'find' && !target) aim(); show(seen.size, false); },
  };
}
