/* Level 1 — "Kepulauan Sinyal". Rute melingkar: A → B1·B2·B3 → C → (troli) → D → S1·S2 → E → (troli naik) → F
   → (pegas) → G → (turun) → H → T → A. 20 kaset.

   Pulau ditempatkan RELATIF ke pulau lain, diukur dari tepi ke tepi:
     from + dir (derajat; 0 = +X/timur, 90 = +Z/selatan, 180 = barat, 270 = utara) + gap (meter antar-tepi) + dy.
   Dengan begitu celah lompatan tetap sesuai rancangan walau garis tepi tiap pulau tak beraturan.
   Jangkauan karakter: lompat ±3,6 m / naik 1,7 m; double jump ±6 m / naik 3,1 m; jump pad 5,6 m; pegas 12 m.
   Koordinat isi pulau (pohon, kaset, reruntuhan) = lokal terhadap pusat pulau: [x, z] atau [x, z, tinggi di atas tanah]. */
export const LEVEL = {
  start: 'A',
  islands: [
    { id: 'A', name: 'Rumah', pos: [0, 0, 0], radius: 11, seed: 4, relief: 1.25, spawn: [0.6, 3.4, Math.PI], trees: 5, boulders: 14,
      ruins: [['arch', -4.6, -3.4, 0.5], ['wall', 3.2, -6.2, -0.35, 6, 4], ['rubble', -1.2, -5.6, 4, 1.5],
        ['path', [[0.3, 2.2], [-0.5, 0.6], [-1.4, -0.9], [-2.7, -2.0], [-3.9, -3.0]]]],
      pads: [[-1.6, 6.2]],
      tapes: [[2.6, 1.2, 1.15], [-4.6, -3.4, 1.6], [3.2, -6.2, 3.7], [-1.6, 6.2, 5.0]] },

    { id: 'B1', from: 'A', dir: 0, gap: 3.0, dy: 0.4, radius: 2.3, seed: 21, relief: 0.35, boulders: 1 },
    { id: 'B2', from: 'B1', dir: -22, gap: 3.3, dy: 0.9, radius: 2.2, seed: 22, relief: 0.35, tapes: [[0, 0, 1.2]] },
    { id: 'B3', from: 'B2', dir: 24, gap: 3.5, dy: 0.9, radius: 2.4, seed: 23, relief: 0.35, trees: 1 },

    { id: 'C', name: 'Menara', from: 'B3', dir: 0, gap: 3.6, dy: 0.5, radius: 8.5, seed: 9, relief: 1.0, spawn: [-4.6, 0.4, -Math.PI / 2], trees: 3, boulders: 9,
      tower: [1.6, -0.8], springs: [[3.4, 3.0]],
      tapes: [[-2.8, 2.6, 1.15], [3.4, 3.0, 10.4]] },

    { id: 'D', name: 'Siaran', from: 'C', dir: 270, gap: 12.5, dy: 0, radius: 9, seed: 14, relief: 0.9, spawn: [0, 5.2, 0], trees: 3, boulders: 8,
      billboard: [0.4, -2.4], pads: [[3.4, 2.2]], ruins: [['rubble', -4.6, 1.6, 3, 1.2]],
      tapes: [[3.4, 2.2, 5.1], [1.2, -6.2, 1.15]] },

    { id: 'S1', from: 'D', dir: 180, gap: 3.4, dy: -0.8, radius: 2.4, seed: 31, relief: 0.35, tapes: [[0, 0, 1.2]] },
    { id: 'S2', from: 'S1', dir: 194, gap: 3.6, dy: -0.9, radius: 2.2, seed: 32, relief: 0.35, boulders: 1 },

    { id: 'E', name: 'Hutan', from: 'S2', dir: 180, gap: 3.4, dy: -0.6, radius: 10, seed: 17, relief: 1.5, spawn: [5.2, 0.3, Math.PI / 2], trees: 9, boulders: 16,
      ruins: [['wall', -2.5, 4.6, 1.2, 4, 3]],
      tapes: [[1.5, -4.6, 1.15], [-3.6, -1.0, 1.15], [-1.0, 6.2, 1.15]] },

    { id: 'F', name: 'Kaset Raksasa', from: 'E', dir: 180, gap: 11.5, dy: 4.0, radius: 8, seed: 26, relief: 0.9, spawn: [4.2, 0.3, Math.PI / 2], trees: 2, boulders: 7,
      ruins: [['arch', 0.4, -3.2, 1.2]], giant: [0, 0, 13.5], springToward: ['G', 0.74],
      tapes: [[0.4, -3.2, 1.6], [-3.4, 1.4, 1.15]] },

    { id: 'T', from: 'A', dir: 180, gap: 3.0, dy: 0.5, radius: 2.3, seed: 41, relief: 0.35 },
    { id: 'H', name: 'Reruntuhan', from: 'T', dir: 180, gap: 3.3, dy: 0.8, radius: 9, seed: 37, relief: 1.1, spawn: [3.6, 0.4, -Math.PI / 2], trees: 4, boulders: 10,
      ruins: [['arch', -1.6, -1.2, -0.5], ['wall', -4.4, 3.4, 0.3, 5, 4], ['rubble', 1.4, 3.6, 4, 1.4], ['path', [[2.6, 0.2], [1.2, -0.4], [-0.2, -0.9]]]],
      tapes: [[-1.6, -1.2, 1.6]] },

    /* pulau kecil tinggi di antara F dan H: dicapai lewat pegas di F, lalu terjun ke H */
    { id: 'G', name: 'Puncak', between: ['F', 'H'], dy: 5.0, radius: 4, seed: 44, relief: 0.6, trees: 1, boulders: 2, tapes: [[0, 0, 1.2]] },
  ],
  /* troli: [dari, ke] — kedua pulau harus segaris pada sumbu X atau Z (dir 0/90/180/270) */
  carts: [{ from: 'C', to: 'D', period: 8, tape: 1.1 }, { from: 'E', to: 'F', period: 9, tape: 1.1 }],
  /* kaset di udara antara dua pulau: [dari, ke, posisi 0..1, tinggi di atas pulau tujuan] */
  airTapes: [['G', 'H', 0.55, 4.6]],
};
