/* Noise deterministik untuk pembangkitan dunia (dijalankan sekali saat memuat, bukan per frame).
   Semua berbasis hash integer, jadi hasilnya sama di setiap perangkat. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash3(x, y, z, s = 0) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1274126177) + Math.imul(s, 1013904223)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const fade = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

export function value2(x, z, s = 0) {
  const xi = Math.floor(x), zi = Math.floor(z), u = fade(x - xi), v = fade(z - zi);
  return lerp(lerp(hash3(xi, 0, zi, s), hash3(xi + 1, 0, zi, s), u), lerp(hash3(xi, 0, zi + 1, s), hash3(xi + 1, 0, zi + 1, s), u), v);
}

export function value3(x, y, z, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), u = fade(x - xi), v = fade(y - yi), w = fade(z - zi);
  const a = lerp(lerp(hash3(xi, yi, zi, s), hash3(xi + 1, yi, zi, s), u), lerp(hash3(xi, yi + 1, zi, s), hash3(xi + 1, yi + 1, zi, s), u), v);
  const b = lerp(lerp(hash3(xi, yi, zi + 1, s), hash3(xi + 1, yi, zi + 1, s), u), lerp(hash3(xi, yi + 1, zi + 1, s), hash3(xi + 1, yi + 1, zi + 1, s), u), v);
  return lerp(a, b, w);
}

export function fbm2(x, z, oct = 3, s = 0) {
  let sum = 0, amp = 0.5, norm = 0;
  for (let i = 0; i < oct; i++) { sum += value2(x, z, s + i * 17) * amp; norm += amp; x *= 2.03; z *= 2.03; amp *= 0.5; }
  return sum / norm;
}

/* Worley 3D: jarak ke titik sel terdekat (f1) & kedua (f2), plus identitas sel terdekat.
   out = { f1, f2, r (acak 0..1 milik sel), key (angka unik sel) } */
export function worley3(x, y, z, s, out) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let f1 = 1e9, f2 = 1e9, bx = 0, by = 0, bz = 0;
  for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const cx = xi + dx, cy = yi + dy, cz = zi + dz;
    const px = cx + hash3(cx, cy, cz, s + 1) - x, py = cy + hash3(cx, cy, cz, s + 2) - y, pz = cz + hash3(cx, cy, cz, s + 3) - z;
    const d = px * px + py * py + pz * pz;
    if (d < f1) { f2 = f1; f1 = d; bx = cx; by = cy; bz = cz; } else if (d < f2) f2 = d;
  }
  out.f1 = Math.sqrt(f1); out.f2 = Math.sqrt(f2);
  out.r = hash3(bx, by, bz, s + 11);
  out.key = (bx + 512) * 1048576 + (by + 512) * 1024 + (bz + 512);
  return out;
}
