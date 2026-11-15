import * as THREE from 'three';
import { rng } from './noise.js';

/* Atlas bahan untuk semua prop (digambar di canvas saat dimuat — nol unduhan).
   Satu tekstur warna + satu tekstur ORM (G = roughness, B = metalness). Bagian berwarna polos menunjuk ke
   "swatch" (titik UV tunggal) yang menentukan jenis bahannya; warnanya sendiri datang dari warna vertex.
   Hasilnya: plastik doff, plastik kilap, logam, karet, kertas, garis hazard, dan label bisa berada dalam
   satu mesh dan satu draw call. */
const S = 256;
export const SWATCH = { matte: [16, 16], gloss: [48, 16], metal: [80, 16], rubber: [112, 16], paper: [144, 16], steel: [176, 16] };
export const RECT = { hazard: [0, 40, 256, 64], label: [0, 112, 160, 80], plate: [160, 112, 96, 96] };
const PBR = { matte: [0.58, 0], gloss: [0.2, 0], metal: [0.34, 0.9], rubber: [0.92, 0], paper: [0.86, 0], steel: [0.5, 0.75] };

export function createAtlas(renderer) {
  const rnd = rng(2024);
  const a = document.createElement('canvas'); a.width = a.height = S;
  const o = document.createElement('canvas'); o.width = o.height = S;
  const g = a.getContext('2d'), m = o.getContext('2d');
  const orm = (r, mt) => 'rgb(255,' + Math.round(r * 255) + ',' + Math.round(mt * 255) + ')';

  g.fillStyle = '#fff'; g.fillRect(0, 0, S, S);
  m.fillStyle = orm(0.6, 0); m.fillRect(0, 0, S, S);
  Object.keys(SWATCH).forEach((k) => { m.fillStyle = orm(PBR[k][0], PBR[k][1]); m.fillRect(SWATCH[k][0] - 16, 0, 32, 36); });

  /* garis hazard: periode 64 px membagi habis 256, jadi bisa diulang mendatar tanpa sambungan */
  { const [x, y, w, h] = RECT.hazard;
    g.fillStyle = '#f0b21a'; g.fillRect(x, y, w, h);
    g.fillStyle = '#17171a';
    for (let i = -2; i < 6; i++) { g.beginPath(); g.moveTo(i * 64, y + h); g.lineTo(i * 64 + 32, y + h); g.lineTo(i * 64 + 32 + h, y); g.lineTo(i * 64 + h, y); g.closePath(); g.fill(); }
    const gr = g.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, 'rgba(40,25,5,.38)'); gr.addColorStop(0.2, 'rgba(40,25,5,0)'); gr.addColorStop(0.8, 'rgba(40,25,5,0)'); gr.addColorStop(1, 'rgba(40,25,5,.45)');
    g.fillStyle = gr; g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(255,255,255,.16)'; g.lineWidth = 1;
    for (let i = 0; i < 26; i++) { const sx = rnd() * w, sy = y + rnd() * h; g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + 4 + rnd() * 14, sy + (rnd() - 0.5) * 3); g.stroke(); }
    m.fillStyle = orm(0.5, 0.2); m.fillRect(x, y, w, h);
    for (let i = 0; i < 40; i++) { m.fillStyle = orm(0.3 + rnd() * 0.5, 0.2); m.fillRect(rnd() * w, y + rnd() * h, 6 + rnd() * 20, 2 + rnd() * 3); }
  }

  /* label kaset */
  { const [x, y, w, h] = RECT.label;
    g.fillStyle = '#f3efe4'; g.fillRect(x, y, w, h);
    g.fillStyle = '#1326ff'; g.fillRect(x, y, w, 15);
    g.fillStyle = '#e23a2e'; g.fillRect(x, y + 15, w, 5);
    g.fillStyle = '#f0b21a'; g.fillRect(x, y + 20, w, 3);
    g.fillStyle = '#16171b'; g.textBaseline = 'middle';
    g.font = '900 17px "Arial Black", Impact, sans-serif'; g.fillText('PEMBURU KASET', x + 7, y + 39);
    g.font = '700 9px Arial, sans-serif'; g.fillText('VHS  ·  T-120  ·  IHSAN.TV', x + 8, y + 54);
    g.fillStyle = 'rgba(22,23,27,.5)';
    for (let i = 0; i < 3; i++) g.fillRect(x + 8, y + 62 + i * 5, w - 46, 1);
    g.fillStyle = '#e23a2e'; g.beginPath(); g.arc(x + w - 17, y + 64, 7, 0, 6.3); g.fill();
    m.fillStyle = orm(0.86, 0); m.fillRect(x, y, w, h);
    m.fillStyle = orm(0.55, 0); m.fillRect(x, y, w, 23);
  }

  /* pelat dek troli: baja gelap dengan tonjolan anti-selip */
  { const [x, y, w, h] = RECT.plate;
    g.fillStyle = '#4a4e57'; g.fillRect(x, y, w, h);
    m.fillStyle = orm(0.52, 0.8); m.fillRect(x, y, w, h);
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
      const cx = x + 6 + i * 12, cy = y + 6 + j * 12, flip = (i + j) % 2;
      g.save(); g.translate(cx, cy); g.rotate(flip ? 0.785 : -0.785);
      g.fillStyle = '#676c77'; g.fillRect(-4, -1.2, 8, 2.4); g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(-4, 1.2, 8, 1);
      g.restore();
      m.save(); m.translate(cx, cy); m.rotate(flip ? 0.785 : -0.785); m.fillStyle = orm(0.3, 0.9); m.fillRect(-4, -1.2, 8, 2.4); m.restore();
    }
    for (let i = 0; i < 30; i++) { g.fillStyle = 'rgba(20,18,16,' + (0.05 + rnd() * 0.12) + ')'; g.fillRect(x + rnd() * w, y + rnd() * h, 4 + rnd() * 22, 1 + rnd() * 2); }
  }

  const map = new THREE.CanvasTexture(a);
  map.colorSpace = THREE.SRGBColorSpace; map.wrapS = THREE.RepeatWrapping;
  map.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  const ormTex = new THREE.CanvasTexture(o);
  ormTex.wrapS = THREE.RepeatWrapping; ormTex.generateMipmaps = false; ormTex.minFilter = THREE.LinearFilter;
  return { map, orm: ormTex, dispose() { map.dispose(); ormTex.dispose(); } };
}

/* UV untuk swatch (titik tunggal) */
export const swatchUV = (name) => [SWATCH[name][0] / S, 1 - SWATCH[name][1] / S];
/* UV di dalam persegi atlas dari koordinat 0..1 (s boleh > 1 untuk hazard yang berulang) */
export const rectUV = (name, s, t) => { const r = RECT[name]; return [(r[0] + s * r[2]) / S, 1 - (r[1] + (1 - t) * r[3]) / S]; };
