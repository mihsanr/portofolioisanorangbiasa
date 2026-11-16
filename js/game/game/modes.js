/* Tingkat kesulitan. NORMAL = game seperti semula (checkpoint, +2 dtk, papan skor global).
   EDAN = versi ragebait yang tetap adil (lihat konsep-ragebait-game.md di folder induk):
   - tanpa checkpoint: jatuh = pulang ke Rumah (loss aversion ala Getting Over It / Jump King),
     tapi kaset yang sudah dipungut tetap tersimpan supaya progres tidak nol sama sekali;
   - penalti jatuh +5 dtk;
   - coyote time dan jump buffer dipersempit: tepi terasa lebih "licin", tapi fisika tetap deterministik
     dan jangkauan lompat sama persis, jadi setiap sambungan tetap bisa dilewati;
   - penghitung jatuh di HUD (ala I Wanna Be the Guy) dan narator nyinyir setiap kali jatuh.
   Rekor EDAN hanya tersimpan di perangkat (papan skor server memvalidasi penalti 2 dtk). */
export const MODES = {
  normal: { id: 'normal', label: 'NORMAL', penalty: 2, checkpoints: true, coyote: 0.11, buffer: 0.13, online: true, taunts: false },
  edan: { id: 'edan', label: 'EDAN', penalty: 5, checkpoints: false, coyote: 0.055, buffer: 0.07, online: false, taunts: true },
};

export const modeOf = (id) => MODES[id] || MODES.normal;

/* Narator. Kalimat dipilih berdasarkan konteks jatuhnya, bukan acak murni:
   kehilangan jauh, tinggal sedikit lagi, jatuh berulang di tempat yang sama, dan angka jatuh bulat. */
const GENERAL = [
  'Gravitasi 1, kamu 0.',
  'Tenang. Rumah selalu menunggumu.',
  'Itu tadi lompatan, atau permintaan maaf?',
  'Pulaunya tidak ke mana-mana. Kamu yang ke mana-mana.',
  'Sinyal hilang. Harga diri juga.',
  'Coba lagi. Kasetnya sabar kok.',
  'Tombol lompatnya bisa ditekan dua kali, lho.',
  'Awannya empuk, tapi tidak menolong.',
  'Tadi hampir. "Hampir" tidak tercatat di stopwatch.',
  'Adegan barusan akan terputar ulang di kepalamu malam ini.',
  'Tepi pulau itu nyata. Pijakanmu yang tidak.',
  'Jangan salahkan kontrolnya. Kontrolnya baik-baik saja.',
];
const FAR = [
  '{m} meter melayang. Lumayan, hitung-hitung olahraga.',
  'Semua jalan kembali ke Rumah. Secara harfiah.',
  '{m} meter hilang dalam dua detik. Efisien.',
  'Perjalanan pulang {m} meter. Nikmati pemandangannya.',
];
const NEAR = [
  'Tinggal {left} kaset. Sakitnya pas di situ, kan?',
  '{left} kaset lagi. Antara kamu dan garis finis cuma ada jurang.',
  'Sedekat itu. Sejauh ini.',
];
const AGAIN = [
  'Di sini lagi? Kamu dan jurang ini sudah kenalan.',
  'Tempat yang sama, cara jatuh yang sama. Konsisten.',
  'Jurang ini mulai hafal namamu.',
];
const MILESTONE = {
  5: 'Lima kali. Pemanasan sudah selesai.',
  10: 'Sepuluh kali jatuh. Awan mulai hafal wajah TV-mu.',
  25: 'Dua puluh lima. Ini sudah bukan main, ini hubungan.',
  50: 'Lima puluh. Berhenti itu pilihan. Tapi kamu bukan tipe itu.',
  100: 'Seratus. Kami bangga, dan sedikit khawatir.',
};

const fill = (s, v) => s.replace('{m}', v.m).replace('{left}', v.left);
const pick = (list, n) => list[n % list.length];

export function taunt({ falls, lostM, left, sameSpot }) {
  const v = { m: Math.round(lostM), left };
  if (MILESTONE[falls]) return MILESTONE[falls];
  if (left > 0 && left <= 4) return fill(pick(NEAR, falls), v);
  if (sameSpot >= 3) return pick(AGAIN, falls);
  if (lostM >= 45) return fill(pick(FAR, falls), v);
  return pick(GENERAL, falls * 7 + Math.round(lostM));
}
