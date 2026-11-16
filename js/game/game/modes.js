/* Tingkat kesulitan. NORMAL = game seperti semula (checkpoint, +2 dtk, papan skor global).
   EDAN = versi ragebait (lihat konsep-ragebait-game.md di folder induk). Angka di sini, jebakannya di edan.js.
   Rekor EDAN hanya tersimpan di perangkat (papan skor server memvalidasi penalti 2 dtk). */
export const MODES = {
  normal: { id: 'normal', label: 'NORMAL', penalty: 2, checkpoints: true, coyote: 0.11, buffer: 0.13, online: true, hazards: false },
  edan: { id: 'edan', label: 'EDAN', penalty: 5, checkpoints: false, coyote: 0.055, buffer: 0.07, online: false, hazards: true },
};

export const modeOf = (id) => MODES[id] || MODES.normal;

/* Angka jebakan EDAN. WIN_CHANCE dirahasiakan dari pemain (permintaan pemilik). */
export const EDAN = {
  WIN_CHANCE: 0.15,       // peluang sebuah run BISA dimenangkan; selebihnya kaset terakhir selalu kabur
  LOSE_ON_FALL: 3,        // kaset terakhir yang kembali ke tempatnya setiap kali jatuh
  CRUMBLE_CHANCE: 0.5,    // peluang tiap pulau kecil menjadi rapuh di sebuah run
  CRUMBLE_WAIT: 0.45,     // detik berdiri sebelum mulai bergetar
  CRUMBLE_SHAKE: 0.5,     // detik bergetar sebelum runtuh
  CRUMBLE_GONE: 3.5,      // detik hilang sebelum muncul lagi
  EVENT_EVERY: [7, 13],   // jeda antar-gangguan berkala (detik, acak)
  EVENT_WARN: 0.8,        // tanda gangguan muncul sekian detik sebelum berlaku
  EVENT_TIME: { angin: 1.4, terbalik: 3, gempa: 2.5, berat: 3.5 },
  GUST_FORCE: 11,         // angin: percepatan mendatar saat di udara (m/dtk²)
  HEAVY: 1.4,             // gravitasi berat: pengali gravitasi (lompat ganda ±6 m jadi ±4,5 m)
  QUAKE_HOP: 4.2,         // gempa: kecepatan terpental ke atas saat berpijak
  JAM_CHANCE: 0.2,        // peluang lompat ganda macet
  BLACKOUT: 1.4,          // detik kontrol mati setelah jatuh (stopwatch tetap jalan)
  STRAY_CHANCE: 0.4,      // peluang jump pad / pegas melempar melenceng
  STRAY_KICK: [4, 7],     // kecepatan mendatar tambahan saat melenceng
  TRAP_TAPES: 2,          // kaset jebakan per run: sentuhan pertama melontarkan pemain
  FLEE_R: 2.6,            // jarak kaset terakhir mulai kabur (run yang kalah undian)
};
