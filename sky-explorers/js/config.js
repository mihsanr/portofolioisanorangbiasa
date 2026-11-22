// Semua angka yang perlu di-tuning + konten edukasi ada di sini (PRD 4.4, 18).
const D = Math.PI / 180;

export const FLIGHT = {
  speed: 12,          // unit/detik
  boost: 21,          // thrust (Spasi / tombol 🚀)
  accel: 2,           // seberapa cepat kecepatan menyusul target
  maxPitch: 25 * D,
  maxRoll: 35 * D,
  turnRate: 0.75,     // rad/detik saat belok penuh
  smoothing: 5,       // 4–6: penghalus input
  levelTime: 1.5,     // detik kembali ke datar
  minClear: 4,        // jarak minimum di atas tanah/laut
  maxAlt: 220,
  collectRadius: 6,
  camDist: 13.2,
  camHeight: 4.3,
  camLag: 4,
  spawn: [0, 26, 175],
};

// Dunia berulang: satu petak TILE×TILE, keluar di satu sisi = masuk dari sisi seberang.
// Kabut harus habis sebelum TILE/2 supaya pengulangannya tak terlihat.
export const TILE = 1000;
export const FOG = { near: 170, far: 440 };

// Thrust hanya terisi setelah mengambil objective (huruf/angka): tiap ambil +perItem detik.
export const THRUST = { perItem: 6, max: 12 };

// Kata contoh: sebagian besar nama tokoh Upin & Ipin (permintaan pemilik, supaya mudah dihafal anak).
// Hanya NAMA sebagai teks — ikonnya emoji umum, tidak ada gambar/model tokohnya.
// Upin & Ipin adalah merek Les' Copaque Production: cek izin sebelum game dipublikasikan.
const WORDS = [
  ['A', 'a', 'Ah Tong', '🧑‍🍳'], ['B', 'be', 'Bola', '⚽'], ['C', 'ce', 'Cikgu Jasmin', '👩‍🏫'],
  ['D', 'de', 'Durian', '🍈'], ['E', 'e', 'Ehsan', '👦'], ['F', 'ef', 'Fizi', '👦'],
  ['G', 'ge', 'Gajah', '🐘'], ['H', 'ha', 'Harimau', '🐯'], ['I', 'i', 'Ipin', '👦'],
  ['J', 'je', 'Jarjit', '👦'], ['K', 'ka', 'Kak Ros', '👧'], ['L', 'el', 'Lebah', '🐝'],
  ['M', 'em', 'Mail', '🐔'], ['N', 'en', 'Nanas', '🍍'], ['O', 'o', 'Opah', '👵'],
  ['P', 'pe', 'Pisang', '🍌'],
  ['Q', 'ki', 'Quran', '📖'],
  ['R', 'er', 'Rajoo', '👦'], ['S', 'es', 'Susanti', '👧'], ['T', 'te', 'Tok Dalang', '👴'],
  ['U', 'u', 'Upin', '👦'], ['V', 'fe', 'Vas', '🏺'], ['W', 'we', 'Wortel', '🥕'],
  ['X', 'eks', 'Xilofon', '🎼'], // perlu ditinjau tim edukasi
  ['Y', 'ye', 'Yoyo', '🪀'], ['Z', 'zet', 'Zebra', '🦓'],
];
// 52 objective huruf: 26 besar lalu 26 kecil. i = nomor warna (huruf besar & kecil satu warna).
export const LETTERS = [true, false].flatMap(big => WORDS.map(([up, say, word, icon], i) =>
  ({ ch: big ? up : up.toLowerCase(), up, lo: up.toLowerCase(), big, i, say, word, icon, kind: 'letter' })));

export const NUMBERS = ['Nol', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan']
  .map((word, n) => ({ ch: String(n), say: word, word, n, i: 3 + n, icon: '⭐', kind: 'number' }));

export const COLORS = [0xff4040, 0x2f7bff, 0xffbf1a, 0x2fbf4f, 0x9b4dff, 0xff7a1a, 0xff4f9a, 0x12b5a5];

// Versi web dapat mematikan gambar/suara tertentu (diisi tools/publish.mjs --tanpa-tokoh).
export const NO_PHOTO = [];
export const CRASH_VO = null;

// Titik sebaran collectible (PRD 6.6): dekat start, landmark, ketinggian berbeda, antar pulau.
export const SPOTS = [
  { at: [0, 26, 120], items: 'A', ring: 0 },          // tutorial: tepat di depan pesawat
  { at: [0, 32, 10], items: 'CDE12', ring: 50 },     // Gedung Sate – Gasibu
  { at: [-160, 30, -40], items: 'FGH34', ring: 45 },  // barat (Dago, Cikapayang)
  { at: [300, 36, -180], items: 'IJ', ring: 28 },     // kincir angin
  { at: [-340, 38, -60], items: 'KM', ring: 45 },   // hutan cemara
  { at: [340, 26, 210], items: 'NO6', ring: 50 },    // mercusuar & laut
  { at: [-60, 100, -290], items: 'QRST78', ring: 60 }, // pulau melayang
  { at: [150, 70, 170], items: 'UVW9', ring: 45 },    // balon udara
  { at: [-280, 70, -270], items: 'XYZ0', ring: 50 },  // gunung
  { at: [184, 26, 331], items: 'B', ring: 0 },        // B di Braga
  { at: [-183, 34, -317], items: 'L5', ring: 22 },    // L di Lembang
  { at: [-233, 34, 298], items: 'P', ring: 0 },       // P di Pasupati
  // huruf kecil: tempat berbeda dari pasangan besarnya
  { at: [0, 30, 215], items: 'abcd', ring: 55 },      // selatan titik awal (Riau)
  { at: [110, 32, -10], items: 'efgh', ring: 48 },    // Museum Geologi
  { at: [265, 40, -40], items: 'ijkl', ring: 45 },    // Pusdai
  { at: [30, 38, -165], items: 'mnop', ring: 50 },    // Graha Merah Putih
  { at: [-200, 32, -170], items: 'qrst', ring: 50 },  // Dago utara
  { at: [-190, 32, 130], items: 'uvw', ring: 48 },    // Wastukencana
  { at: [130, 34, 165], items: 'xyz', ring: 42 },     // Masjid Istiqomah
];

// Level puncak tiap SFX (dBFS). Wajib di rentang -50..-20 (dicek tools/check-audio.mjs).
// Diturunkan ±10 dB dari versi pertama (masukan pemilik: terlalu kencang).
export const SFX_DB = { pickup: -32, ring: -33, fanfare: -31, open: -40, click: -42, bump: -42, whoosh: -44, engine: -49, wind: -49, bubble: -36, horn: -38, moo: -38, birds: -43, waves: -45 };

// File BGM dinormalisasi ke -24 LUFS (puncak terburuk -8,5 dBFS). Gain 0,2 (-14 dB)
// → di dalam game ±-38 LUFS dan puncak ≤ -22 dBFS.
export const BGM_LEVEL = 0.2;
export const BGM = [
  'audio/bgm/fluffing-a-duck.mp3',
  'audio/bgm/meatball-parade.mp3',
  'audio/bgm/funny-quirky-comedy.mp3',
];
