// Semua angka yang perlu di-tuning + konten edukasi ada di sini (PRD 4.4, 18).
const D = Math.PI / 180;
// HP & tablet (layar sentuh): profil ringan. Uji di desktop dengan ?lite.
export const LITE = typeof matchMedia !== 'undefined' && (matchMedia('(pointer: coarse)').matches || /[?&]lite/.test(location.search));

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
export const FOG = LITE ? { near: 125, far: 340 } : { near: 170, far: 440 };

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
export const CRASH_VO = 'crash_aduh';

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

// Posisi huruf & angka DIKUNCI (x, y, z) supaya sama persis di HP dan laptop (perlu untuk main bareng). Huruf tanpa entri dihitung dari SPOTS.
export const ITEM_POS = {
  "A": [0, 21.4, 120], "C": [25.6, 29.9, 49.9], "D": [-25.4, 35, 41], "E": [-34.4, 29.8, -3.4], "1": [2.7, 27.2, -36.3], "2": [46.8, 32.6, -2.3], "F": [-175.6, 24.1, -5.8], "G": [-191.4, 30, -43.6], "H": [-167.4, 34.1, -76.7], "3": [-122.8, 27.6, -60.9], "4": [-129.4, 35.4, -11.9], "I": [275.6, 39.7, -176.5], "J": [322.7, 38.1, -183.2], "K": [-362.9, 41.4, -86.5], "M": [-317.1, 33, -33.4], "N": [354, 20.3, 162.6], "O": [371.5, 27.1, 243.1], "6": [293.5, 34.2, 221.2], "Q": [-10, 93.9, -304.5], "R": [-25.3, 105, -256.8], "S": [-71.8, 100.3, -242], "T": [-109.3, 98.3, -275.7], "7": [-100.5, 96.8, -328.8], "8": [-49.6, 92.2, -332.3], "U": [178.8, 102.2, 195.1], "V": [123.6, 77.1, 200.3], "W": [120, 62, 143.9], "9": [175.4, 63.6, 140.9], "X": [-286.3, 72.9, -227], "Y": [-320.8, 63.8, -276], "Z": [-273.3, 62.1, -315.2], "0": [-232, 76.4, -262.9], "B": [184, 19, 331], "L": [-201.1, 38.8, -328.7], "5": [-169.6, 28, -308.3], "P": [-233, 60.1, 298], "a": [36.9, 25.1, 191.6], "b": [23.5, 28.8, 251.9], "c": [-42.3, 31.4, 241.9], "d": [-23.6, 23.1, 177.9], "e": [148, 33.3, 7.6], "f": [91.2, 38.6, 30.6], "g": [76.9, 35.9, -25.3], "h": [127.7, 25.2, -48.1], "i": [270.9, 36.9, 3], "j": [232.2, 32.1, -35.5], "k": [259.2, 45.3, -81.9], "l": [298.8, 34, -44.7], "m": [1.1, 38.2, -140.3], "n": [1.3, 33.9, -198.6], "o": [58.9, 39.1, -189.7], "p": [56.8, 44.7, -133.7], "q": [-239.4, 39.2, -181.8], "r": [-189.1, 33, -206.4], "s": [-154.9, 31.3, -156.4], "t": [-214, 38.3, -123.4], "u": [-203, 26, 84.6], "v": [-153.6, 30.2, 139.1], "w": [-219.9, 33.9, 160.9], "x": [92.9, 39.3, 184.9], "y": [65.5, 28.9, 150.6], "z": [132.5, 29.7, 107.4],
};

// Main bareng: Supabase Realtime milik situs (kunci publik, sama dengan js/supabase-config.js di situs).
export const RT_URL = 'https://hxghzjfthbxgcpxkysxa.supabase.co';
export const RT_KEY = 'sb_publishable_iuvvOWOkk4EXXmJQMdA5sQ_xA4Ea7Br';

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
