import * as THREE from 'three';
import { rng, value2, fbm2, hash3 } from './noise.js';
import { chisel, ROCK } from './rock.js';
import { smooth } from './build.js';

/* Pulau melayang prosedural. Satu BufferGeometry (1 draw call) berisi:
   - permukaan atas: kisi polar mengikuti garis tepi tak beraturan + bukit noise,
   - rumput tepi: rok yang menjuntai menutupi sambungan,
   - tebing & sisi bawah: lapisan batu berpahat yang mengerucut ke stalaktit.
   Fungsi tinggi yang sama dipakai mesh dan fisika, jadi kaki karakter selalu pas di tanah.
   Kepadatan mesh mengikuti ukuran pulau, dan tiap pulau punya versi jauh (LOD) berkepadatan separuh. */
const TAU = Math.PI * 2;
const RHO_HI = [0, 0.14, 0.28, 0.42, 0.55, 0.66, 0.76, 0.84, 0.9, 0.945, 0.975, 1.0];
const RHO_LO = [0, 0.28, 0.55, 0.76, 0.9, 0.975, 1.0];
const GRASS = { base: new THREE.Color('#79ad3e'), light: new THREE.Color('#a2c252'), dark: new THREE.Color('#4c8731'), hang: new THREE.Color('#386d28') };

export function createIsland(def) {
  const R = def.radius, seed = def.seed ?? 1, relief = def.relief ?? 1.2;
  const D = def.depth ?? R * (R < 4 ? 1.35 : 0.95);
  const pos = new THREE.Vector3(def.pos?.[0] ?? 0, def.pos?.[1] ?? 0, def.pos?.[2] ?? 0);
  const rnd = rng(seed * 7919 + 13);
  const harm = [0.07, 0.12, 0.085, 0.05, 0.035, 0.02].map((a, i) => ({ a: a * (0.55 + 0.9 * rnd()), p: rnd() * TAU, k: i + 1 }));
  const outline = (th) => { let s = 1; for (let i = 0; i < harm.length; i++) s += harm[i].a * Math.cos(harm[i].k * th + harm[i].p); return R * s; };
  const hill = (x, z) => (fbm2(x * 0.105 + seed * 3.1, z * 0.105 - seed * 1.7, 3, seed) - 0.5) * relief;
  /* tinggi permukaan lokal: bukit mendatar ke arah tepi, lalu bahu tepi membulat turun */
  const topH = (x, z, rho) => hill(x, z) * (1 - 0.7 * smooth((rho - 0.7) / 0.3)) - 0.2 * Math.pow(smooth((rho - 0.86) / 0.14), 2);
  const tipX = (rnd() - 0.5) * R * 0.3, tipZ = (rnd() - 0.5) * R * 0.3;

  const c1 = new THREE.Color();
  function topColor(x, z, rho, out) {
    const t = fbm2(x * 0.21 + 9, z * 0.21 + seed, 3, seed + 3), t2 = fbm2(x * 0.62 + 40, z * 0.62, 2, seed + 5);
    out.copy(GRASS.dark).lerp(GRASS.base, smooth((t - 0.3) / 0.22)).lerp(GRASS.light, smooth((t2 - 0.5) / 0.22) * 0.75);
    /* petak kering kekuningan & petak subur gelap (skala beberapa meter), dipanggang per vertex */
    const dry = smooth((value2(x * 0.17 + 11, z * 0.17, seed + 7) - 0.55) / 0.3), lush = smooth((0.5 - value2(x * 0.3 + 3, z * 0.3, seed + 9)) / 0.3) * 0.8;
    out.r *= (1 + 0.24 * dry) * (1 - 0.34 * lush); out.g *= (1 + 0.1 * dry) * (1 - 0.18 * lush); out.b *= (1 - 0.32 * dry) * (1 - 0.3 * lush);
    return out.multiplyScalar(1 - 0.14 * smooth((rho - 0.84) / 0.16));
  }

  function build(NS, NR, RHO) {
    /* ——— permukaan atas ——— */
    const P = [], N = [], C = [], K = [], I = [];
    for (let i = 0; i < RHO.length; i++) for (let j = 0; j < NS; j++) {
      const th = j / NS * TAU, o = outline(th), x = RHO[i] * o * Math.cos(th), z = RHO[i] * o * Math.sin(th);
      topColor(x, z, RHO[i], c1);
      P.push(x, topH(x, z, RHO[i]), z); N.push(0, 1, 0); C.push(c1.r, c1.g, c1.b); K.push(0);
    }
    for (let i = 0; i < RHO.length - 1; i++) for (let j = 0; j < NS; j++) {
      const a = i * NS + j, b = i * NS + (j + 1) % NS, c = (i + 1) * NS + j, d = (i + 1) * NS + (j + 1) % NS;
      if (i > 0) I.push(a, b, c);
      I.push(b, d, c);
    }
    const topCount = P.length / 3, topIdx = I.length;

    /* ——— tebing + sisi bawah (dipahat) ——— */
    const cp = [], ci = [];
    for (let i = 0; i <= NR; i++) {
      const s = i / NR, t = Math.max(0, (s - 0.3) / 0.7);
      for (let j = 0; j < NS; j++) {
        const th = j / NS * TAU, o = outline(th), cs = Math.cos(th), sn = Math.sin(th);
        const lobe = 0.78 + 0.5 * value2(cs * 1.6 + seed, sn * 1.6 + 5, seed + 21);
        const rho = s < 0.3 ? 1 - 0.1 * (s / 0.3) : 0.9 * Math.pow(1 - t, 1.08) * (1 - (1 - lobe) * smooth(t / 0.4));
        const x = rho * o * cs + tipX * t * t, z = rho * o * sn + tipZ * t * t;
        const rimY = topH(o * cs, o * sn, 1);
        let depth = D * (s < 0.3 ? 0.36 * (s / 0.3) : 0.36 + 0.64 * Math.pow(t, 0.95));
        depth += D * 0.42 * Math.pow(value2(x * 0.3 + seed, z * 0.3, seed + 31), 2) * t * (1 - t) * 4;   // tonjolan stalaktit
        cp.push(x, rimY - depth, z);
      }
    }
    for (let i = 0; i < NR; i++) for (let j = 0; j < NS; j++) {
      const a = i * NS + j, b = i * NS + (j + 1) % NS, c = (i + 1) * NS + j, d = (i + 1) * NS + (j + 1) % NS;
      ci.push(a, b, c, b, d, c);
    }
    const cliff = new THREE.BufferGeometry();
    cliff.setIndex(ci);
    cliff.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3));
    cliff.computeVertexNormals();
    const ringS = (i) => Math.floor(i / NS) / NR;
    const fq = R < 4 ? 0.85 : 0.5;                               // sel batu lebih kecil di pulau kecil
    const ch = chisel(cliff, {
      freq: [fq, fq * 2.24, fq], amp: Math.min(0.72, 0.2 + R * 0.06), seed: seed + 100, flat: 0.9, crackWidth: 0.17,
      maskFn: (i) => { const s = ringS(i); return smooth(s / 0.07) * (1 - 0.65 * smooth((s - 0.8) / 0.2)); },
    });
    const cpos = cliff.attributes.position, cnor = cliff.attributes.normal, base = P.length / 3;
    for (let i = 0; i < cpos.count; i++) {
      const s = ringS(i);
      c1.copy(ROCK.warm).lerp(ROCK.cool, ch.cell[i] * 0.9 + s * 0.3).lerp(ROCK.deep, smooth((s - 0.15) / 0.85) * 0.62);
      c1.lerp(ROCK.soil, (1 - smooth(s / 0.075)) * 0.9);
      c1.lerp(ROCK.moss, smooth((ch.cellNy[i] - 0.3) / 0.3) * (1 - smooth((s - 0.25) / 0.3)) * 0.8);     // lumut di undakan
      c1.multiplyScalar((0.44 + 0.56 * ch.crack[i]) * (0.72 + 0.56 * ch.cell[i]) * (1 - 0.25 * (1 - smooth(s / 0.05))));
      /* lapisan sedimen hangat/dingin bergantian */
      const st = value2(cpos.getY(i) * 1.1 + ch.cell[i] * 0.8, (cpos.getX(i) + cpos.getZ(i)) * 0.08, seed + 61);
      c1.r *= 0.88 + 0.26 * st; c1.g *= 0.92 + 0.12 * st; c1.b *= 1.03 - 0.17 * st;
      P.push(cpos.getX(i), cpos.getY(i), cpos.getZ(i)); N.push(cnor.getX(i), cnor.getY(i), cnor.getZ(i));
      C.push(c1.r, c1.g, c1.b); K.push(1);
    }
    for (let i = 0; i < ci.length; i++) I.push(ci[i] + base);
    cliff.dispose();

    /* ——— rumput tepi yang menjuntai ——— */
    const NK = NS * 3, sk = P.length / 3;
    for (let j = 0; j < NK; j++) {
      const th = j / NK * TAU, o = outline(th), cs = Math.cos(th), sn = Math.sin(th);
      const x0 = 0.97 * o * cs, z0 = 0.97 * o * sn, x1 = (o + 0.16) * cs, z1 = (o + 0.16) * sn;
      /* panjang juntai: gelombang besar (rumpun) dikali acak per helai, jadi tidak membentuk gerigi teratur */
      const len = (0.1 + 0.78 * Math.pow(value2(th * 9.5, seed * 1.3, seed + 41), 1.4)) * (0.3 + 0.7 * hash3(j, 3, seed, 57)) * Math.min(1, 0.45 + R * 0.06);
      const yr = topH(o * cs, o * sn, 1);
      P.push(x0, topH(x0, z0, 0.97) + 0.015, z0, x1, yr - len, z1);
      const nx = cs * 0.55, nz = sn * 0.55, nl = Math.hypot(nx, 0.83, nz);
      N.push(nx / nl, 0.83 / nl, nz / nl, nx / nl, 0.83 / nl, nz / nl);
      topColor(x0, z0, 0.97, c1); C.push(c1.r, c1.g, c1.b);
      c1.lerp(GRASS.hang, 0.85); C.push(c1.r, c1.g, c1.b);
      K.push(0, 0);
    }
    for (let j = 0; j < NK; j++) {
      const a = sk + j * 2, c = a + 1, b = sk + ((j + 1) % NK) * 2, d = b + 1;
      I.push(a, b, c, b, d, c);
    }

    const g = new THREE.BufferGeometry();
    g.setIndex(I);
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    g.setAttribute('rock', new THREE.Float32BufferAttribute(K, 1));
    /* normal permukaan atas dihitung dari kisinya sendiri (tebing & rok sudah punya normal) */
    const tmp = new THREE.BufferGeometry();
    tmp.setIndex(I.slice(0, topIdx));
    tmp.setAttribute('position', new THREE.Float32BufferAttribute(P.slice(0, topCount * 3), 3));
    tmp.computeVertexNormals();
    g.attributes.normal.array.set(tmp.attributes.normal.array, 0);
    tmp.dispose();
    g.computeBoundingSphere();
    return g;
  }

  /* kepadatan mengikuti keliling pulau: pulau kecil tidak membayar segitiga pulau besar */
  const NS = Math.min(128, Math.max(40, Math.round(R * 11.6 / 4) * 4));
  const NR = Math.min(30, Math.max(12, Math.round(R * 2.7)));
  const geometry = build(NS, NR, RHO_HI);
  const lowGeometry = build(Math.max(24, NS / 2), Math.max(8, Math.round(NR / 2)), RHO_LO);

  const rMax = R * 1.45;
  return {
    def, pos, geometry, lowGeometry, radius: R, depth: D, wallDepth: D * 0.36, outline, topColor, rMax,
    /* q = { rho, h (tinggi dunia), d, o, nx, nz }; false kalau jauh di luar */
    query(wx, wz, q) {
      const x = wx - pos.x, z = wz - pos.z, d = Math.hypot(x, z);
      if (d > rMax) return false;
      const o = outline(Math.atan2(z, x));
      q.d = d; q.o = o; q.rho = d / o;
      q.nx = d > 1e-5 ? x / d : 1; q.nz = d > 1e-5 ? z / d : 0;
      const k = q.rho > 1 ? 1 / q.rho : 1;
      q.h = pos.y + topH(x * k, z * k, Math.min(q.rho, 1));
      return true;
    },
    heightAt(wx, wz) {
      const x = wx - pos.x, z = wz - pos.z, d = Math.hypot(x, z);
      if (d > rMax) return null;
      const rho = d / outline(Math.atan2(z, x));
      return rho > 1 ? null : pos.y + topH(x, z, rho);
    },
    /* titik acak merata di permukaan atas (koordinat lokal) */
    sample(rand, out, maxRho = 0.96) {
      const th = rand() * TAU, rho = Math.sqrt(rand()) * maxRho, o = outline(th);
      out.x = rho * o * Math.cos(th); out.z = rho * o * Math.sin(th); out.rho = rho; out.y = topH(out.x, out.z, rho);
      return out;
    },
    localHeight(x, z) { const d = Math.hypot(x, z), rho = d / outline(Math.atan2(z, x)); return topH(x, z, Math.min(rho, 1)); },
    dispose() { geometry.dispose(); lowGeometry.dispose(); },
  };
}
