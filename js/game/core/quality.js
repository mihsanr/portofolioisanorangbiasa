/* Profil kualitas grafis. Low hanya menurunkan biaya render — art direction tetap sama. */
export const PROFILES = {
  high:   { name: 'high',   dpr: 2.0,  msaa: true,  shadowSize: 2048, softShadows: true,  particles: 1.0,  vegetation: 1.0,  lod: 1.0 },
  medium: { name: 'medium', dpr: 1.5,  msaa: true,  shadowSize: 1024, softShadows: false, particles: 0.6,  vegetation: 0.65, lod: 0.75 },
  low:    { name: 'low',    dpr: 1.15, msaa: false, shadowSize: 512,  softShadows: false, particles: 0.35, vegetation: 0.4,  lod: 0.55 },
};
const ORDER = ['high', 'medium', 'low'];
const KEY = 'ihsan.game.q';

function detect() {
  const q = new URLSearchParams(location.search).get('q');
  if (PROFILES[q]) return { name: q, locked: true };
  try { const s = sessionStorage.getItem(KEY); if (PROFILES[s]) return { name: s, locked: false }; } catch (e) { /* storage diblokir */ }
  const coarse = matchMedia('(pointer: coarse)').matches;
  const mem = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  if (coarse) return { name: (mem <= 3 || cores <= 4) ? 'low' : 'medium', locked: false };
  return { name: (mem <= 4 || cores <= 4) ? 'medium' : 'high', locked: false };
}

export function createQuality() {
  const start = detect();
  const listeners = [];
  let warm = 0, acc = 0, frames = 0, slow = 0;
  const q = {
    profile: PROFILES[start.name],
    locked: start.locked,
    fps: 60,
    onChange(fn) { listeners.push(fn); },
    set(name) {
      if (!PROFILES[name] || name === q.profile.name) return;
      q.profile = PROFILES[name];
      try { sessionStorage.setItem(KEY, name); } catch (e) { /* abaikan */ }
      listeners.forEach((fn) => fn(q.profile));
    },
    /* dipanggil tiap frame; turun satu tingkat kalau FPS rata-rata rendah dua jendela berturut-turut */
    sample(dt) {
      if (dt > 0.1) return;              // sendatan sesaat bukan alasan menurunkan kualitas
      warm += dt;
      if (warm < 3) return;              // lewati kompilasi shader di awal
      acc += dt; frames++;
      if (acc < 2) return;
      q.fps = frames / acc; acc = 0; frames = 0;
      if (q.locked) return;
      slow = q.fps < 42 ? slow + 1 : 0;
      if (slow >= 2) {
        slow = 0; warm = 1;
        const i = ORDER.indexOf(q.profile.name);
        if (i < ORDER.length - 1) q.set(ORDER[i + 1]);
      }
    },
  };
  return q;
}
