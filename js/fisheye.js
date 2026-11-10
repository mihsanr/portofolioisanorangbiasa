/* IHSAN.TV Wall — globe fisheye tak berujung berisi semua karya (video, gambar, dokumen).
   Dipakai work.html (variant 'full') dan index.html (variant 'preview').

     const wall = Fisheye.mount(el, {
       tapes: WALL, atlas: WALL_ATLAS, variant: 'full',
       onOpen(item) {}, onHover(item | null) {},
     });
     wall.focus(slug) · wall.setFilter('all' | 'v' | 'x') · wall.setPaused(bool) · wall.destroy()

   Item: { s, k: 'v'|'i'|'d', ch, label, r (rasio w/h), p (halaman atlas), a: [x,y,w,h], c }.
   Render: WebGL satu pass — tiap piksel layar dipetakan balik ke "dunia datar"
   (L = R/k · atanh(L'/R)), lalu dicari sel/tile-nya, jadi tepi tile, thumbnail
   DAN video ikut melengkung per piksel. Thumbnail dibagi ke ≤ 3 atlas 2048² yang
   dimuat bertahap (versi kecil dulu); tile yang atlasnya belum datang memakai warna
   rata-ratanya. Fallback Canvas 2D, lalu grid statis. Tidak bergantung main.js. */
(() => {
  const GAP = 10;          // jarak antar tile di dunia datar (px)
  const K = 1.25;          // pembesaran di tengah
  const CAP = 0.985;       // batas tepi globe (L'/R)
  const RAD = 6;           // radius sudut tile (px datar)
  const FRICTION = 0.93;   // inertia per frame @60fps
  const DRIFT = [0.028, 0.014]; // px datar / ms
  const MINS = 3, MAXS = 10;    // lebar tile dalam sel (1 sel = sepertiga tile 9:16)
  const PAGES = 3;              // jumlah sampler atlas di shader
  const LOOK = 60;              // seberapa jauh layout boleh melompati urutan
  const LEGACY = { '9:16': 0.5625, '4:5': 0.8, '1:1': 1, '16:9': 1.7778 };
  const atanh = (x) => 0.5 * Math.log((1 + x) / (1 - x));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const fmt = (s) => { s = Math.max(0, s | 0); return `${String((s / 60) | 0).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
  const hexRGB = (h) => [1, 3, 5].map((i) => parseInt((h || '#202020').slice(i, i + 2), 16));
  const kindOf = (t) => t.k || 'v';
  const ratioOf = (t) => (typeof t.r === 'number' ? t.r : (LEGACY[t.r] || 0.5625));
  // sama dengan scripts/build-tapes.mjs (tinggi tile acuan 150px)
  const UNIT_REF = (150 * 9 / 16 + GAP) / 3;
  const spanOf = (t) => clamp(Math.round((ratioOf(t) * 150 + GAP) / UNIT_REF), MINS, MAXS);
  const thumbOf = (t) => (kindOf(t) === 'v' ? `assets/video/thumb/${t.s}.webp` : `assets/img/${kindOf(t) === 'd' ? (t.cv || t.s) : t.s}.webp`);

  /* ---------- layout: baris demi baris, item diambil sesuai urutan data ----------
     Tetangga kiri/atas (dan sambungan torus) tidak boleh dari channel yang sama bila
     masih ada pilihan; tiap item dipakai sekali sebelum ada yang diulang. */
  function buildLayout(tapes, order, cols, rows) {
    const N = cols * rows;
    const cell = new Int16Array(N).fill(-1); // index item
    const part = new Uint8Array(N);
    const span = new Uint8Array(N);
    const nat = tapes.map(spanOf);
    const at = (c, r) => cell[((r + rows) % rows) * cols + ((c + cols) % cols)];
    const placed = new Set();
    let bag = order.slice();
    const clash = (t, c, s, r, byCh) => {
      const same = (o) => o >= 0 && (byCh ? tapes[o].ch === tapes[t].ch : o === t);
      if (c > 0 && same(at(c - 1, r))) return true;
      if (c + s === cols && same(at(0, r))) return true;
      for (let k = 0; k < s; k++) {
        if (r > 0 && same(at(c + k, r - 1))) return true;
        if (r === rows - 1 && same(at(c + k, 0))) return true;
      }
      return false;
    };
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols;) {
        const free = cols - c;
        if (bag.length < LOOK) bag = bag.concat(order);
        const fits = (s) => s === free || s <= free - MINS; // sisa baris harus tetap bisa diisi
        let pick = -1;
        for (let pass = 0; pass < 3 && pick < 0; pass++) {
          const lim = pass < 2 ? Math.min(bag.length, LOOK) : bag.length;
          for (let i = 0; i < lim; i++) {
            const t = bag[i];
            if (!fits(nat[t])) continue;
            if (pass < 2 && clash(t, c, nat[t], r, pass === 0)) continue;
            pick = i; break;
          }
        }
        let s;
        if (pick < 0) { pick = 0; s = free < MINS * 2 ? free : Math.min(nat[bag[0]], free - MINS); } // tak ada yang pas: dipaskan (crop)
        else s = nat[bag[pick]];
        const t = bag.splice(pick, 1)[0];
        placed.add(t);
        for (let k = 0; k < s; k++) { const i = r * cols + c + k; cell[i] = t; part[i] = k; span[i] = s; }
        c += s;
      }
    }
    return { cols, rows, cell, part, span, missing: order.filter((t) => !placed.has(t)).length };
  }

  /* ================= SHADERS ================= */
  const VS1 = 'attribute vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }';
  const VS2 = '#version 300 es\nin vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }';
  const FS_BODY = `
uniform vec2 uRes; uniform float uDpr;
uniform vec2 uCam; uniform float uR; uniform float uK; uniform float uCap;
uniform vec2 uCell; uniform vec2 uGrid; uniform float uGap; uniform float uRad;
uniform sampler2D uAtlas0; uniform sampler2D uAtlas1; uniform sampler2D uAtlas2;
uniform sampler2D uLut; uniform sampler2D uVideo;
uniform vec2 uAtlasSize; uniform vec2 uLutSize; uniform vec3 uReady;
uniform vec4 uA; uniform vec4 uAI; uniform vec4 uB; uniform vec4 uBI;
uniform vec2 uVid; uniform float uCA;
const vec3 BG = vec3(0.035, 0.035, 0.047);
float dec(float v){ return floor(v * 255.0 + 0.5); }
vec4 lut(float x, float y){ return TEX(uLut, (vec2(x, y) + 0.5) / uLutSize); }
vec4 aRect(float t){ vec4 a = lut(t, uGrid.y); vec4 b = lut(t, uGrid.y + 1.0);
  return vec4(dec(a.r) * 256.0 + dec(a.g), dec(a.b) * 256.0 + dec(a.a), dec(b.r) * 256.0 + dec(b.g), dec(b.b) * 256.0 + dec(b.a)); }
float sdBox(vec2 q, vec2 h, float r){ vec2 d = abs(q) - h + r; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r; }
vec2 cover(vec2 l, float ta, float ia){
  if (ia > ta) l.x = 0.5 + (l.x - 0.5) * ta / ia; else l.y = 0.5 + (l.y - 0.5) * ia / ta;
  return clamp(l, 0.0, 1.0); }
vec3 tape(float t, vec2 l, float ta, float rn){
  vec4 a = aRect(t);
  vec4 ci = lut(t, uGrid.y + 2.0);
  float pg = dec(ci.a);
  vec2 uv = (a.xy + cover(l, ta, a.z / a.w) * a.zw) / uAtlasSize;
  vec3 img; float rd;
  if (pg < 0.5) { img = TEX(uAtlas0, uv).rgb; rd = uReady.x; }
  else if (pg < 1.5) { img = TEX(uAtlas1, uv).rgb; rd = uReady.y; }
  else { img = TEX(uAtlas2, uv).rgb; rd = uReady.z; }
  return mix(ci.rgb, img, clamp(rd * 2.0 - rn * 0.9, 0.0, 1.0)); }
vec3 lifted(vec3 col, vec2 p, vec4 R, vec4 I, float px, float rn){
  if (I.y < 0.5) return col;
  vec2 ws = uGrid * uCell;
  vec2 d = p - (R.xy + 0.5 * R.zw); d -= ws * floor(d / ws + 0.5);
  vec2 h = 0.5 * R.zw * I.y;
  float sd = sdBox(d, h, uRad * I.y);
  if (sd > 30.0) return col;
  float lift = clamp((I.y - 1.0) * 8.0, 0.0, 1.0);
  col *= 1.0 - (1.0 - smoothstep(0.0, 28.0, sd)) * 0.7 * lift;
  vec2 l = clamp((d + h) / (2.0 * h), 0.0, 1.0);
  vec3 img = tape(I.x, l, R.z / R.w, rn);
  if (I.z > 0.0) img = mix(img, TEX(uVideo, cover(l, R.z / R.w, uVid.x / uVid.y)).rgb, I.z);
  if (I.w >= 0.0) {
    float bar = step(1.0 - 4.0 * px / (2.0 * h.y), l.y) * lift;
    img = mix(img, mix(vec3(0.0), vec3(1.0), step(l.x, I.w)), bar * 0.9);
  }
  float ring = clamp(1.0 - abs(sd + 1.2 * px) / px, 0.0, 1.0) * lift;
  img = mix(img, vec3(1.0), ring * 0.85);
  return mix(col, img, clamp(0.5 - sd / px, 0.0, 1.0)); }
vec3 scene(vec2 s){
  float r = length(s);
  float rn = min(r / uR, uCap);
  float L = (uR / uK) * 0.5 * log((1.0 + rn) / (1.0 - rn));
  vec2 p = uCam + (r > 0.0001 ? s * (L / r) : vec2(0.0));
  vec2 fw = fwidth(p);
  float px = max(max(fw.x, fw.y), 0.0001);
  vec2 cu = floor(p / uCell);
  vec2 ci = mod(cu, uGrid);
  vec4 c = lut(ci.x, ci.y);
  float t = dec(c.r) * 256.0 + dec(c.g), part = dec(c.b), span = max(dec(c.a), 1.0);
  vec2 rmin = vec2((cu.x - part) * uCell.x, cu.y * uCell.y) + 0.5 * uGap;
  vec2 rsz = vec2(span * uCell.x, uCell.y) - uGap;
  float sd = sdBox(p - (rmin + 0.5 * rsz), 0.5 * rsz, uRad);
  vec3 col = mix(BG, tape(t, (p - rmin) / rsz, rsz.x / rsz.y, rn), clamp(0.5 - sd / px, 0.0, 1.0));
  col = lifted(col, p, uB, uBI, px, rn);
  col = lifted(col, p, uA, uAI, px, rn);
  return col; }
void main(){
  vec2 s = (gl_FragCoord.xy - 0.5 * uRes) / uDpr; s.y = -s.y;
  vec3 col = scene(s);
  float rn = length(s) / uR;
  if (uCA > 0.0) { float o = uCA * rn * rn; col.r = scene(s * (1.0 + o)).r; col.b = scene(s * (1.0 - o)).b; }
  col *= mix(1.0, 0.22, smoothstep(0.45, uCap, rn));
  float rim = clamp((uCap * uR - length(s)) * uDpr / 1.5, 0.0, 1.0);
  FRAG = vec4(mix(vec3(0.008), col, rim), 1.0);
}`;
  const FS1 = '#extension GL_OES_standard_derivatives : enable\nprecision highp float;\n#define TEX texture2D\n#define FRAG gl_FragColor\n' + FS_BODY;
  const FS2 = '#version 300 es\nprecision highp float;\n#define TEX texture\nout vec4 fragOut;\n#define FRAG fragOut\n' + FS_BODY;

  /* ================= WEBGL RENDERER ================= */
  function glRenderer(canvas, atlasInfo) {
    let gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: 'low-power' });
    const v2 = !!gl;
    if (!gl) gl = canvas.getContext('webgl', { antialias: false, alpha: false }) || canvas.getContext('experimental-webgl');
    if (!gl) return null;
    if (!v2 && !gl.getExtension('OES_standard_derivatives')) return null;
    const hp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
    if (!hp || hp.precision < 16) return null;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, v2 ? VS2 : VS1));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, v2 ? FS2 : FS1));
    gl.bindAttribLocation(prog, 0, 'aPos');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const U = {};
    ['uRes', 'uDpr', 'uCam', 'uR', 'uK', 'uCap', 'uCell', 'uGrid', 'uGap', 'uRad', 'uAtlas0', 'uAtlas1', 'uAtlas2', 'uLut', 'uVideo',
      'uAtlasSize', 'uLutSize', 'uReady', 'uA', 'uAI', 'uB', 'uBI', 'uVid', 'uCA']
      .forEach((n) => { U[n] = gl.getUniformLocation(prog, n); });
    const tex = (unit, filter) => { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter === gl.NEAREST ? gl.NEAREST : gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([10, 10, 12, 255]));
      return t; };
    // unit 0–2 = halaman atlas, 3 = LUT, 4 = video
    const tAtlas = [0, 1, 2].map((u) => tex(u, gl.LINEAR));
    const tLut = tex(PAGES, gl.NEAREST), tVid = tex(PAGES + 1, gl.LINEAR);
    gl.uniform1i(U.uAtlas0, 0); gl.uniform1i(U.uAtlas1, 1); gl.uniform1i(U.uAtlas2, 2);
    gl.uniform1i(U.uLut, PAGES); gl.uniform1i(U.uVideo, PAGES + 1);
    // koordinat tile selalu dalam ukuran logis atlas, berapa pun resolusi gambar yang dimuat
    gl.uniform2f(U.uAtlasSize, atlasInfo.w || 2048, atlasInfo.h || 2048);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    return {
      kind: 'webgl',
      setAtlas(page, img) {
        gl.activeTexture(gl.TEXTURE0 + page); gl.bindTexture(gl.TEXTURE_2D, tAtlas[page]);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      },
      setLut(data, w, h) {
        gl.activeTexture(gl.TEXTURE0 + PAGES); gl.bindTexture(gl.TEXTURE_2D, tLut);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
        gl.uniform2f(U.uLutSize, w, h);
      },
      uploadVideo(video) {
        gl.activeTexture(gl.TEXTURE0 + PAGES + 1); gl.bindTexture(gl.TEXTURE_2D, tVid);
        try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video); return true; } catch (e) { return false; }
      },
      draw(st) {
        const { W, H, dpr } = st;
        gl.viewport(0, 0, Math.round(W * dpr), Math.round(H * dpr));
        gl.uniform2f(U.uRes, Math.round(W * dpr), Math.round(H * dpr));
        gl.uniform1f(U.uDpr, dpr);
        gl.uniform2f(U.uCam, st.cam[0], st.cam[1]);
        gl.uniform1f(U.uR, st.R); gl.uniform1f(U.uK, K); gl.uniform1f(U.uCap, CAP);
        gl.uniform2f(U.uCell, st.UW, st.CH); gl.uniform2f(U.uGrid, st.cols, st.rows);
        gl.uniform1f(U.uGap, GAP); gl.uniform1f(U.uRad, RAD);
        gl.uniform3f(U.uReady, st.ready[0], st.ready[1], st.ready[2]);
        const lift = (s, Lu, Iu, useVid) => {
          if (!s) { gl.uniform4f(Lu, 0, 0, 1, 1); gl.uniform4f(Iu, 0, 0, 0, -1); return; }
          gl.uniform4f(Lu, s.rect[0], s.rect[1], s.rect[2], s.rect[3]);
          gl.uniform4f(Iu, s.t, s.scale, useVid ? s.mix : 0, s.prog);
        };
        lift(st.B, U.uB, U.uBI, true);
        lift(st.A, U.uA, U.uAI, true);
        gl.uniform2f(U.uVid, st.vidW || 9, st.vidH || 16);
        gl.uniform1f(U.uCA, st.ca);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
      lost: () => gl.isContextLost(),
    };
  }

  /* ================= CANVAS 2D FALLBACK ================= */
  /* Hanya posisi & ukuran kotak yang mengikuti lensa (seperti mockup). */
  function canvasRenderer(canvas, api, atlasInfo) {
    const g = canvas.getContext('2d');
    if (!g) return null;
    const atlases = [];
    return {
      kind: '2d',
      setAtlas(page, img) { atlases[page] = img; }, setLut() {}, uploadVideo() { return true; },
      draw(st) {
        const { W, H, dpr } = st;
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.fillStyle = '#020202'; g.fillRect(0, 0, W, H);
        g.save();
        g.beginPath(); g.arc(W / 2, H / 2, st.R * CAP, 0, Math.PI * 2); g.clip();
        g.fillStyle = '#09090c'; g.fillRect(0, 0, W, H);
        const ext = api.extent();
        const c0 = Math.floor((st.cam[0] - ext[0]) / st.UW) - MAXS, c1 = Math.ceil((st.cam[0] + ext[0]) / st.UW) + 1;
        const r0 = Math.floor((st.cam[1] - ext[1]) / st.CH) - 1, r1 = Math.ceil((st.cam[1] + ext[1]) / st.CH) + 1;
        const drawTile = (t, rect, scale, video, mix) => {
          const cx = rect[0] + rect[2] / 2, cy = rect[1] + rect[3] / 2;
          const c = api.toScreen(cx, cy); if (!c) return;
          // size from the mapped mid-edges, so the 10px gaps survive the lens
          const hw = rect[2] / 2 * scale, hh = rect[3] / 2 * scale;
          const l = api.toScreen(cx - hw, cy), r = api.toScreen(cx + hw, cy);
          const up = api.toScreen(cx, cy - hh), dn = api.toScreen(cx, cy + hh);
          if (!l || !r || !up || !dn) return;
          const w = r[0] - l[0], h = dn[1] - up[1];
          if (w < 1.5 || h < 1.5) return;
          const x = W / 2 + c[0] - w / 2, y = H / 2 + c[1] - h / 2;
          const tp = st.tapes[t];
          const atlas = atlases[tp.p || 0];
          const src = video && mix > 0.5 && video.readyState >= 2 ? video : atlas;
          if (src) {
            let sx, sy, sw, sh;
            if (src === video) { sx = 0; sy = 0; sw = video.videoWidth; sh = video.videoHeight; }
            else { const k = (atlas.naturalWidth || atlas.width) / (atlasInfo.w || 2048); [sx, sy, sw, sh] = tp.a.map((v) => v * k); }
            const ia = sw / sh, ta = w / h;
            if (ia > ta) { const nw = sh * ta; sx += (sw - nw) / 2; sw = nw; } else { const nh = sw / ta; sy += (sh - nh) / 2; sh = nh; }
            g.drawImage(src, sx, sy, sw, sh, x, y, w, h);
          } else { g.fillStyle = tp.c || '#222'; g.fillRect(x, y, w, h); }
          if (scale > 1.02) { g.strokeStyle = '#fff'; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, w - 2, h - 2); }
        };
        for (let r = r0; r <= r1; r++) {
          for (let c = c0; c <= c1; c++) {
            const i = api.cellAt(c, r);
            if (i.part !== 0) continue;
            drawTile(i.t, [c * st.UW + GAP / 2, r * st.CH + GAP / 2, i.span * st.UW - GAP, st.CH - GAP], 1);
          }
        }
        if (st.B) drawTile(st.B.t, api.near(st.B.rect), st.B.scale);
        if (st.A) drawTile(st.A.t, api.near(st.A.rect), st.A.scale, api.video, st.A.mix);
        g.restore();
        const grd = g.createRadialGradient(W / 2, H / 2, st.R * 0.45, W / 2, H / 2, st.R * CAP);
        grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(0,0,0,0.75)');
        g.fillStyle = grd; g.fillRect(0, 0, W, H);
      },
      lost: () => false,
    };
  }

  /* ================= STATIC FALLBACK ================= */
  function staticGrid(el, tapes, href) {
    el.classList.add('is-static');
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    el.innerHTML = `<p class="wall-nosignal">NO SIGNAL — showing list</p><div class="wall-fb">${
      tapes.slice(0, 24).map((t) => `<a class="wall-fb-item" href="${href(t)}"><img src="${thumbOf(t)}" alt="${esc(t.label)}" loading="lazy"></a>`).join('')}</div>`;
  }

  /* ================= MOUNT ================= */
  function mount(el, opts) {
    // (const di tapes.js bukan properti window → cek lewat typeof)
    const atlasInfo = opts.atlas || (typeof WALL_ATLAS !== 'undefined' ? WALL_ATLAS : { w: 2048, h: 2048, pages: [], pagesSm: [] });
    const variant = opts.variant || 'full';
    const preview = variant === 'preview';
    // link-in-bio preview: hanya item di halaman atlas pertama, supaya tetap ringan
    const tapes = (opts.tapes || (typeof WALL !== 'undefined' ? WALL : [])).filter((t) => !preview || !(t.p > 0));
    const channels = opts.channels || (typeof TAPE_CHANNELS !== 'undefined' ? TAPE_CHANNELS : []);
    const coarse = matchMedia('(pointer: coarse)').matches || !matchMedia('(hover: hover)').matches;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const saveData = !!(navigator.connection && navigator.connection.saveData);
    const autoplay = !reduce && !saveData;
    const onOpen = opts.onOpen || (() => {});
    const onHover = opts.onHover || (() => {});
    const hrefFor = opts.href || ((t) => `#tape/${t.s}`);
    if (!tapes.length) return null;

    const TH = preview ? (coarse ? 72 : 84) : (coarse ? 118 : 150);
    const CW = TH * 9 / 16 + GAP, CH = TH + GAP;
    const UW = CW / 3; // lebar satu sel
    const LIFT = preview ? 1.3 : coarse ? 1.35 : 1.18;
    const HAS_RVFC = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;

    /* DOM */
    el.classList.add('wall', preview ? 'wall--preview' : 'wall--full');
    el.setAttribute('data-keep-brand', '');
    if (!el.hasAttribute('role')) {
      el.setAttribute('role', 'application');
      el.tabIndex = 0;
      el.setAttribute('aria-label', preview
        ? 'Pratinjau dinding karya portofolio. Panah untuk menjelajah, Enter untuk membuka portofolio.'
        : 'Dinding karya portofolio: video, desain, dan dokumen. Gunakan panah untuk menjelajah, Enter untuk membuka');
    }
    el.style.touchAction = preview ? 'pan-y' : 'none';
    const fb = el.querySelector('.wall-fb');
    const canvas = document.createElement('canvas');
    canvas.className = 'wall-canvas';
    const hud = document.createElement('div'); hud.className = 'wall-hud'; hud.setAttribute('aria-hidden', 'true');
    const cap = document.createElement('div'); cap.className = 'wall-cap'; cap.setAttribute('aria-hidden', 'true');
    const live = document.createElement('div'); live.className = 'sr-only'; live.setAttribute('aria-live', 'polite');
    const tuning = document.createElement('div'); tuning.className = 'wall-tuning'; tuning.innerHTML = '<span>TUNING…</span>';
    const ring = document.createElement('div'); ring.className = 'wall-focus-ring'; ring.setAttribute('aria-hidden', 'true');
    const video = document.createElement('video');
    video.className = 'wall-video';
    video.muted = true; video.defaultMuted = true; video.loop = true; video.playsInline = true;
    video.setAttribute('muted', ''); video.setAttribute('playsinline', ''); video.setAttribute('aria-hidden', 'true');
    video.preload = 'auto'; video.disableRemotePlayback = true; video.dataset.noDuck = '';
    el.append(canvas, ring, hud, cap, live, tuning, video);
    if (coarse) el.classList.add('is-touch');

    /* renderer */
    let rd = null, surface = canvas;
    const api = {};
    try { rd = glRenderer(canvas, atlasInfo); } catch (e) { console.warn('[wall] webgl:', e.message); rd = null; }
    if (!rd) {
      // a canvas that tried webgl cannot give a 2d context — swap it
      const c2 = canvas.cloneNode(); canvas.replaceWith(c2);
      rd = canvasRenderer(c2, api, atlasInfo);
      if (!rd) { staticGrid(el, tapes, hrefFor); return null; }
      surface = c2;
    }
    if (fb) fb.remove();
    el.classList.add('is-' + rd.kind);

    /* state */
    const st = {
      W: 1, H: 1, dpr: 1, R: 1, UW, CH, cols: 0, rows: 0, cam: [0, 0], tapes,
      ready: [0, 0, 0], A: null, B: null, ca: 0, vidW: 9, vidH: 16,
    };
    let layout = null, ext = [0, 0], filter = 'all';
    const vel = [0, 0];
    let mode = 'idle'; // idle | drag | coast | snap
    let snapTo = null, hoverTimer = 0, leaveTimer = 0, playTimer = 0, holdTimer = 0;
    let pendingKey = null, hovered = null;
    let pointerIn = false, touched = false, paused = false, visible = true, dead = false;
    let ptr = null; // active pointer gesture
    let lastPtr = null; // last mouse position (for hover refresh)
    let dirty = true, raf = 0, last = 0, holding = null, snapped = null;
    // vidReady: 'playing' sudah datang · vidFrame: ada frame baru · vidShown: frame-nya sudah di tekstur
    let vidReady = false, vidFrame = false, vidShown = false, vidSlug = '', rvfcArmed = false;
    const loaded = [0, 0, 0]; // per halaman atlas: 0 belum, 1 kecil, 2 penuh

    const worldW = () => st.cols * UW, worldH = () => st.rows * CH;
    const wrap = (v, m) => ((v % m) + m) % m;

    api.cellAt = (c, r) => {
      const cc = wrap(c, st.cols), rr = wrap(r, st.rows), i = rr * st.cols + cc;
      return { t: layout.cell[i], part: layout.part[i], span: layout.span[i] };
    };
    api.extent = () => ext;
    api.video = video;
    // flat point → screen offset from the wall centre (null when outside the globe)
    api.toScreen = (x, y) => {
      let dx = x - st.cam[0], dy = y - st.cam[1];
      dx -= worldW() * Math.round(dx / worldW()); dy -= worldH() * Math.round(dy / worldH());
      const L = Math.hypot(dx, dy);
      if (L < 1e-4) return [0, 0];
      const Lp = st.R * Math.tanh(K * L / st.R);
      if (Lp > st.R * CAP) return null;
      return [dx / L * Lp, dy / L * Lp];
    };
    // screen offset → flat point (inverse lens)
    const toFlat = (sx, sy) => {
      const r = Math.hypot(sx, sy);
      if (r < 1e-4) return [st.cam[0], st.cam[1]];
      const rn = Math.min(r / st.R, CAP);
      const L = (st.R / K) * atanh(rn);
      return [st.cam[0] + sx * L / r, st.cam[1] + sy * L / r];
    };
    // bring a stored (wrapped) rect next to the camera for drawing
    api.near = (rect) => {
      let x = rect[0], y = rect[1];
      x += worldW() * Math.round((st.cam[0] - x - rect[2] / 2) / worldW());
      y += worldH() * Math.round((st.cam[1] - y - rect[3] / 2) / worldH());
      return [x, y, rect[2], rect[3]];
    };

    function tileAtFlat(x, y) {
      const c = Math.floor(x / UW), r = Math.floor(y / CH);
      const i = api.cellAt(c, r);
      const ox = (c - i.part) * UW;
      const rect = [wrap(ox + GAP / 2, worldW()), wrap(r * CH + GAP / 2, worldH()), i.span * UW - GAP, CH - GAP];
      const inside = x >= ox + GAP / 2 && x <= ox + i.span * UW - GAP / 2 && y >= r * CH + GAP / 2 && y <= (r + 1) * CH - GAP / 2;
      return { t: i.t, rect, inside, key: `${rect[0] | 0},${rect[1] | 0}` };
    }
    // hit-test at a screen offset (exact inverse mapping, enlarged tiles first)
    function hit(sx, sy) {
      if (Math.hypot(sx, sy) > st.R * CAP) return null;
      const p = toFlat(sx, sy);
      for (const s of [st.A, st.B]) {
        if (!s || s.scale < 1.01) continue;
        const r = api.near(s.rect);
        const cx = r[0] + r[2] / 2, cy = r[1] + r[3] / 2;
        let dx = p[0] - cx, dy = p[1] - cy;
        dx -= worldW() * Math.round(dx / worldW()); dy -= worldH() * Math.round(dy / worldH());
        if (Math.abs(dx) <= r[2] / 2 * s.scale && Math.abs(dy) <= r[3] / 2 * s.scale) return { t: s.t, rect: s.rect, key: s.key, inside: true };
      }
      const h = tileAtFlat(p[0], p[1]);
      return h.inside ? h : null;
    }
    function nearestToCenter(px, py) {
      const x0 = px == null ? st.cam[0] : px, y0 = py == null ? st.cam[1] : py;
      let best = null, bd = Infinity;
      const c0 = Math.floor(x0 / UW), r0 = Math.floor(y0 / CH);
      for (let r = r0 - 1; r <= r0 + 1; r++) for (let c = c0 - MAXS; c <= c0 + MAXS; c++) {
        const i = api.cellAt(c, r); if (i.part !== 0) continue;
        const cx = c * UW + i.span * UW / 2, cy = r * CH + CH / 2;
        const d = Math.hypot(cx - x0, cy - y0);
        if (d < bd) { bd = d; best = { cx, cy, h: tileAtFlat(cx, cy) }; }
      }
      return best;
    }

    /* ----- sizing / layout ----- */
    function measureExtent() {
      let ex = 0, ey = 0;
      const W2 = st.W / 2, H2 = st.H / 2, N = 48;
      const probe = (sx, sy) => {
        const r = Math.hypot(sx, sy); if (r < 1) return;
        const rn = Math.min(r / st.R, CAP), L = (st.R / K) * atanh(rn);
        ex = Math.max(ex, Math.abs(sx) * L / r); ey = Math.max(ey, Math.abs(sy) * L / r);
      };
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        probe(-W2 + t * st.W, -H2); probe(-W2 + t * st.W, H2); probe(-W2, -H2 + t * st.H); probe(W2, -H2 + t * st.H);
        // points on the globe rim that fall inside the wall
        const a = t * Math.PI * 2, rx = Math.cos(a) * st.R * CAP, ry = Math.sin(a) * st.R * CAP;
        if (Math.abs(rx) <= W2 && Math.abs(ry) <= H2) probe(rx, ry);
      }
      return [ex, ey];
    }
    const inFilter = (t) => filter === 'all' || (filter === 'v' ? kindOf(t) === 'v' : kindOf(t) !== 'v');
    // smallest world that covers the screen AND holds every item of the current filter once
    function worldSize() {
      const order = [];
      tapes.forEach((t, i) => { if (inFilter(t)) order.push(i); });
      const need = order.reduce((a, i) => a + spanOf(tapes[i]), 0) * 1.03;
      const minC = Math.max(MAXS * 2 + 4, Math.ceil((2 * ext[0] + 4 * CW) / UW));
      const minR = Math.max(5, Math.ceil((2 * ext[1] + 2 * CH) / CH));
      let cols = minC, rows = minR;
      if (need > cols * rows) {
        cols = Math.max(minC, Math.ceil(Math.sqrt(need * CH / UW)));
        rows = Math.max(minR, Math.ceil(need / cols));
      }
      return { order, cols, rows, minC, minR };
    }
    function rebuild(w) {
      let rows = w.rows;
      for (let i = 0; i < 8; i++) {
        layout = buildLayout(tapes, w.order, w.cols, rows);
        if (!layout.missing) break;
        rows++;
      }
      st.cols = layout.cols; st.rows = layout.rows;
      st.minC = w.minC; st.minR = w.minR;
      uploadLut();
    }
    function resize() {
      const b = el.getBoundingClientRect();
      if (b.width < 2 || b.height < 2) return;
      st.W = b.width; st.H = b.height;
      st.dpr = Math.min(devicePixelRatio || 1, coarse ? 1.75 : 2);
      st.R = 0.5 * Math.max(st.W, st.H);
      surface.width = Math.round(st.W * st.dpr); surface.height = Math.round(st.H * st.dpr);
      ext = measureExtent();
      const w = worldSize();
      if (!layout || w.minC > st.cols || w.minR > st.rows) {
        const keep = layout && st.A ? tapes[st.A.t].s : null;
        rebuild(w);
        st.A = st.B = null;
        if (keep) focus(keep, true); else centreFeatured();
      }
      st.ca = rd.kind === 'webgl' && !coarse && !preview && st.W > 700 ? 0.0016 : 0;
      dirty = true;
    }
    function uploadLut() {
      const w = Math.max(st.cols, tapes.length), h = st.rows + 3;
      const d = new Uint8Array(w * h * 4);
      for (let r = 0; r < st.rows; r++) for (let c = 0; c < st.cols; c++) {
        const i = r * st.cols + c, o = (r * w + c) * 4, t = layout.cell[i];
        d[o] = t >> 8; d[o + 1] = t & 255; d[o + 2] = layout.part[i]; d[o + 3] = layout.span[i];
      }
      tapes.forEach((t, i) => {
        const a = t.a || [0, 0, 1, 1];
        let o = (st.rows * w + i) * 4;
        d[o] = a[0] >> 8; d[o + 1] = a[0] & 255; d[o + 2] = a[1] >> 8; d[o + 3] = a[1] & 255;
        o = ((st.rows + 1) * w + i) * 4;
        d[o] = a[2] >> 8; d[o + 1] = a[2] & 255; d[o + 2] = a[3] >> 8; d[o + 3] = a[3] & 255;
        o = ((st.rows + 2) * w + i) * 4;
        const c = hexRGB(t.c); d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = Math.min(PAGES - 1, t.p || 0);
      });
      rd.setLut(d, w, h);
    }
    function centreOn(idx) {
      const r = (idx / st.cols) | 0, c = idx % st.cols;
      st.cam[0] = c * UW + layout.span[idx] * UW / 2;
      st.cam[1] = r * CH + CH / 2;
    }
    function centreFeatured() {
      const feat = tapes.map((t, i) => ((t.f || t.featured) && inFilter(t) ? i : -1)).filter((i) => i >= 0);
      const want = feat.length ? feat[(Math.random() * feat.length) | 0] : layout.cell[0];
      const idx = layout.cell.findIndex((t, i) => t === want && layout.part[i] === 0);
      if (idx >= 0) centreOn(idx);
    }

    /* ----- active tile (lifted, playing) ----- */
    const lifted = (h, target) => ({ t: h.t, rect: h.rect, key: h.key, scale: 1, target, mix: 0, prog: -1 });
    const chName = (t) => channels[(t.ch || 0) - 1] || '';
    const capText = (t) => {
      const k = kindOf(t);
      if (k === 'i') return t.label;
      return [t.label, t.client, chName(t)].filter(Boolean).join(' · ');
    };
    function setActive(h, { play = true, delay = 0 } = {}) {
      if (st.A && h && st.A.key === h.key) {
        st.A.target = LIFT;
        if (play) schedulePlay(delay);
        return;
      }
      if (st.A) { st.A.target = 1; st.A.prog = -1; st.B = st.A; }
      if (h && st.B && st.B.key === h.key) { st.A = st.B; st.A.target = LIFT; st.A.mix = 0; st.B = null; }
      else st.A = h ? lifted(h, LIFT) : null;
      stopVideo();
      if (st.A) {
        if (play) schedulePlay(delay);
        const t = tapes[st.A.t];
        clearTimeout(live._t);
        live._t = setTimeout(() => { live.textContent = capText(t); }, 350);
      }
      dirty = true; kick();
    }
    function clearActive() { setActive(null); }
    function stopVideo() {
      clearTimeout(playTimer); playTimer = 0;
      vidReady = false; vidShown = false; vidFrame = false;
      if (st.A) st.A.mix = 0;
      if (!video.paused) video.pause();
    }
    function schedulePlay(delay) {
      clearTimeout(playTimer); playTimer = 0;
      if (!autoplay || paused || !st.A || kindOf(tapes[st.A.t]) !== 'v') return;
      playTimer = setTimeout(startVideo, delay);
    }
    /* hover memutar CUPLIKAN (assets/video/snip, ≤ 350 KB), bukan file penuh */
    function startVideo() {
      playTimer = 0;
      if (!st.A || paused) return;
      const t = tapes[st.A.t];
      if (kindOf(t) !== 'v') return;
      if (vidSlug !== t.s) { vidReady = false; vidShown = false; vidFrame = false; vidSlug = t.s; video.src = `assets/video/snip/${t.s}.mp4`; }
      video.play().catch(() => {});
    }
    const armFrame = () => {
      if (!HAS_RVFC || rvfcArmed) return;
      rvfcArmed = true;
      video.requestVideoFrameCallback(() => { rvfcArmed = false; vidFrame = true; dirty = true; kick(); armFrame(); });
    };
    video.addEventListener('playing', () => {
      if (!st.A || vidSlug !== tapes[st.A.t].s) return;
      vidReady = true; st.vidW = video.videoWidth || 9; st.vidH = video.videoHeight || 16;
      armFrame(); kick();
    });
    armFrame();

    /* ----- input ----- */
    const tellHover = (t) => { if (t === hovered) return; hovered = t; onHover(t); };
    const local = (e) => { const b = el.getBoundingClientRect(); return [e.clientX - b.left - st.W / 2, e.clientY - b.top - st.H / 2]; };
    function onDown(e) {
      if (e.button > 0) return;
      const [x, y] = local(e);
      touched = true;
      ptr = { id: e.pointerId, type: e.pointerType, x0: x, y0: y, x, y, t0: performance.now(), moved: false, vx: 0, vy: 0, lt: performance.now() };
      if (mode === 'coast' || mode === 'snap') { mode = 'idle'; vel[0] = vel[1] = 0; ptr.caught = true; }
      if (e.pointerType !== 'mouse') {
        clearTimeout(holdTimer);
        holdTimer = setTimeout(() => {
          if (!ptr || ptr.moved) return;
          const h = hit(ptr.x, ptr.y);
          if (!h) return;
          holding = st.A ? { t: st.A.t, rect: st.A.rect, key: st.A.key } : null;
          ptr.hold = true;
          setActive(h, { play: true, delay: 0 });
          el.classList.add('is-holding');
        }, 380);
      }
    }
    function onMove(e) {
      const [x, y] = local(e);
      if (e.pointerType === 'mouse') { lastPtr = [x, y]; pointerIn = true; }
      if (ptr && e.pointerId === ptr.id) {
        const dx = x - ptr.x, dy = y - ptr.y;
        if (!ptr.moved && Math.hypot(x - ptr.x0, y - ptr.y0) > 6) {
          ptr.moved = true; clearTimeout(holdTimer);
          if (!ptr.hold) {
            try { el.setPointerCapture(e.pointerId); } catch (_) { /* gone */ }
            mode = 'drag'; el.classList.add('is-dragging'); tellHover(null);
          }
        }
        if (ptr.moved && !ptr.hold) {
          const a = toFlat(ptr.x, ptr.y), b = toFlat(x, y);
          let fx = b[0] - a[0], fy = b[1] - a[1];
          const lim = Math.hypot(dx, dy) * 2.5, len = Math.hypot(fx, fy);
          if (len > lim && len > 0) { fx *= lim / len; fy *= lim / len; }
          st.cam[0] -= fx; st.cam[1] -= fy;
          const now = performance.now(), dt = Math.max(1, now - ptr.lt);
          ptr.vx = ptr.vx * 0.6 + (-fx / dt) * 0.4; ptr.vy = ptr.vy * 0.6 + (-fy / dt) * 0.4; ptr.lt = now;
          if (!video.paused) video.pause();
          dirty = true; kick();
        }
        ptr.x = x; ptr.y = y;
        return;
      }
      if (e.pointerType === 'mouse' && !coarse) hover(x, y);
    }
    function onUp(e) {
      if (!ptr || e.pointerId !== ptr.id) return;
      const g = ptr; ptr = null;
      clearTimeout(holdTimer);
      el.classList.remove('is-dragging', 'is-holding');
      if (g.hold) { // end long-press preview → back to the tile that was centred
        if (holding) setActive(holding, { play: true, delay: 300 }); else clearActive();
        holding = null; return;
      }
      if (g.moved) {
        const idle = performance.now() - g.lt > 80;
        vel[0] = idle || reduce ? 0 : g.vx; vel[1] = idle || reduce ? 0 : g.vy;
        mode = 'coast'; kick();
        return;
      }
      if (g.caught) return;
      // tap / click
      const h = hit(g.x, g.y);
      if (!h) return;
      if (g.type === 'mouse' || preview) { open(h); return; }
      if (st.A && st.A.key === h.key && snapped === h.key) { open(h); return; }
      slideTo(h);
    }
    function onCancel(e) {
      if (!ptr || e.pointerId !== ptr.id) return;
      const g = ptr; ptr = null;
      clearTimeout(holdTimer);
      el.classList.remove('is-dragging', 'is-holding');
      if (g.hold && holding) setActive(holding, { delay: 300 });
      holding = null;
      if (g.moved) { mode = 'coast'; vel[0] = vel[1] = 0; kick(); }
    }
    function hover(x, y) {
      const h = hit(x, y);
      tellHover(h ? tapes[h.t] : null);
      const cur = st.A && st.A.target > 1 ? st.A.key : null;
      if (h && h.key === cur) { clearTimeout(leaveTimer); clearTimeout(hoverTimer); pendingKey = null; return; }
      if (h && h.key === pendingKey) { clearTimeout(leaveTimer); return; }
      clearTimeout(hoverTimer); pendingKey = null;
      if (!h) { clearTimeout(leaveTimer); leaveTimer = setTimeout(() => { if (st.A) clearActive(); }, 140); return; }
      clearTimeout(leaveTimer);
      pendingKey = h.key;
      hoverTimer = setTimeout(() => { pendingKey = null; setActive(h, { play: true, delay: 0 }); }, 200);
      dirty = true; kick();
    }
    function open(h) {
      const t = tapes[h.t];
      if (!t) return;
      stopVideo();
      onOpen(t);
    }
    function slideTo(h) {
      const r = api.near(h.rect);
      snapTo = { x: r[0] + r[2] / 2, y: r[1] + r[3] / 2, h };
      mode = 'snap'; snapped = null;
      setActive(h, { play: false });
      if (reduce) { st.cam[0] = snapTo.x; st.cam[1] = snapTo.y; }
      kick();
    }
    function settle() { // after a swipe stops: nearest tile glides to the centre
      const n = nearestToCenter();
      if (n) slideTo(n.h);
    }

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onCancel);
    el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') { pointerIn = true; kick(); } });
    el.addEventListener('pointerleave', (e) => {
      if (e.pointerType !== 'mouse') return;
      pointerIn = false; lastPtr = null;
      clearTimeout(hoverTimer); pendingKey = null;
      tellHover(null);
      if (!ptr && !coarse) clearActive();
      kick();
    });
    el.addEventListener('contextmenu', (e) => { if (coarse) e.preventDefault(); });
    el.addEventListener('dragstart', (e) => e.preventDefault());
    el.addEventListener('keydown', (e) => {
      const k = e.key;
      if (k === 'Escape') { el.blur(); return; }
      if (k === 'Enter' || k === ' ') {
        e.preventDefault();
        const h = st.A ? st.A : (nearestToCenter() || {}).h;
        if (h) open(h);
        return;
      }
      const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
      if (!dir) return;
      e.preventDefault(); touched = true;
      const base = st.A ? api.near(st.A.rect) : null;
      let px = st.cam[0], py = st.cam[1];
      if (base) {
        px = dir[0] < 0 ? base[0] - GAP - 2 : dir[0] > 0 ? base[0] + base[2] + GAP + 2 : base[0] + base[2] / 2;
        py = base[1] + base[3] / 2 + dir[1] * CH;
      } else { px += dir[0] * CW; py += dir[1] * CH; }
      const h = tileAtFlat(px, py);
      slideTo(h);
      snapped = null;
    });
    el.addEventListener('focus', () => { if (!st.A && el.matches(':focus-visible')) settle(); });

    /* ----- loop ----- */
    function kick() { if (!raf && visible && !paused && !dead) { last = performance.now(); raf = requestAnimationFrame(frame); } }
    function frame(now) {
      raf = 0;
      const dt = Math.min(64, now - last); last = now;
      const f = dt / 16.667;
      let moving = false;

      if (mode === 'coast') {
        const fr = Math.pow(FRICTION, f);
        vel[0] *= fr; vel[1] *= fr;
        st.cam[0] += vel[0] * dt; st.cam[1] += vel[1] * dt;
        const sp = Math.hypot(vel[0], vel[1]);
        moving = true;
        if (sp < 0.036) { // ~0.6 px/frame
          vel[0] = vel[1] = 0; mode = 'idle';
          if (coarse) settle();
          else if (lastPtr) hover(lastPtr[0], lastPtr[1]);
        }
      } else if (mode === 'snap' && snapTo) {
        const k = 1 - Math.pow(1 - 0.15, f);
        st.cam[0] += (snapTo.x - st.cam[0]) * k; st.cam[1] += (snapTo.y - st.cam[1]) * k;
        moving = true;
        if (Math.hypot(snapTo.x - st.cam[0], snapTo.y - st.cam[1]) < 0.5) {
          st.cam[0] = snapTo.x; st.cam[1] = snapTo.y;
          mode = 'idle'; snapped = snapTo.h.key;
          setActive(snapTo.h, { play: true, delay: 300 });
          snapTo = null;
        }
      } else if (mode === 'idle' && !reduce && !ptr && !(pointerIn && !coarse) && !(touched && coarse)) {
        // drift: desktop while the pointer is outside, touch until the first touch
        st.cam[0] += DRIFT[0] * dt; st.cam[1] += DRIFT[1] * dt;
        moving = true;
        if (coarse) {
          const n = nearestToCenter();
          if (n && (!st.A || st.A.key !== n.h.key)) setActive(n.h, { play: true, delay: 300 });
        }
      }
      // keep the camera inside one world period (shader & hit-test wrap distances)
      if (st.cols) { st.cam[0] = wrap(st.cam[0], worldW()); st.cam[1] = wrap(st.cam[1], worldH()); }

      // pause the tape while the wall flies
      const fast = mode === 'drag' || (mode === 'coast' && Math.hypot(vel[0], vel[1]) > 0.25);
      if (fast && !video.paused) video.pause();
      else if (!fast && st.A && st.A.target > 1 && vidReady && video.paused && autoplay && !paused && !playTimer) video.play().catch(() => {});

      // lift / settle animations
      let anim = false;
      const ease = reduce ? 1 : 1 - Math.pow(1 - 0.2, f);
      for (const s of [st.A, st.B]) {
        if (!s) continue;
        s.scale += (s.target - s.scale) * ease;
        if (Math.abs(s.target - s.scale) > 0.002) anim = true; else s.scale = s.target;
      }
      if (st.B && st.B.scale <= 1.001) st.B = null;
      if (st.A && st.A.target === 1 && st.A.scale <= 1.001) st.A = null;
      if (st.B) { st.B.mix = Math.max(0, st.B.mix - 0.12 * f); anim = true; }

      // new video frame → texture. The thumbnail stays until a frame of THIS tape
      // has really been decoded and uploaded (never a black or stale tile).
      const playing = vidReady && !video.paused && video.readyState >= 2;
      if (playing && !vidFrame && (!HAS_RVFC || !vidShown) && video.currentTime > 0.04) vidFrame = true;
      if (playing && vidFrame) {
        vidFrame = false;
        if (rd.uploadVideo(video)) vidShown = true; else { vidReady = false; vidShown = false; }
        dirty = true;
      }
      if (st.A) {
        const want = vidReady && vidShown ? 1 : 0;
        if (st.A.mix !== want) { st.A.mix = clamp(st.A.mix + (want ? 0.12 : -0.2) * f, 0, 1); anim = true; }
        st.A.prog = want && video.duration ? (video.currentTime / video.duration) : -1;
      }
      for (let p = 0; p < PAGES; p++) {
        if (loaded[p] && st.ready[p] < 1) { st.ready[p] = Math.min(1, st.ready[p] + dt / 700); anim = true; }
      }

      if (moving || anim || dirty || playing) { rd.draw(st); dirty = false; placeHud(); }
      if (!paused && (moving || anim || playing || mode !== 'idle' || ptr)) raf = requestAnimationFrame(frame);
    }

    /* HUD di tile aktif; tanpa tile aktif, tile paling tengah tetap diberi caption
       supaya karya tidak pernah anonim. */
    function placeHud() {
      const s = st.A && st.A.target > 1 && st.A.scale >= 1.03 ? st.A : null;
      const off = () => { hud.classList.remove('on'); };
      const capAt = (t, bl) => {
        cap.textContent = capText(t);
        cap.style.transform = `translate(${(st.W / 2 + bl[0]).toFixed(1)}px, ${(st.H / 2 + bl[1] + 8).toFixed(1)}px)`;
        cap.classList.add('on');
      };
      if (!s) {
        off();
        const n = !preview && layout && (mode === 'idle' || mode === 'snap') && !(st.A && st.A.target > 1) ? nearestToCenter() : null;
        const r = n && api.near(n.h.rect);
        const bl = r && api.toScreen(r[0], r[1] + r[3]);
        if (bl) capAt(tapes[n.h.t], bl); else cap.classList.remove('on');
        return;
      }
      const r = api.near(s.rect);
      const cx = r[0] + r[2] / 2, cy = r[1] + r[3] / 2;
      const hw = r[2] / 2 * s.scale, hh = r[3] / 2 * s.scale;
      const tl = api.toScreen(cx - hw, cy - hh), bl = api.toScreen(cx - hw, cy + hh);
      if (!tl || !bl) { off(); cap.classList.remove('on'); return; }
      const t = tapes[s.t], k = kindOf(t);
      const rec = k === 'v' && vidReady && vidShown && !video.paused;
      hud.textContent = k === 'i' ? '▣ LIHAT'
        : k === 'd' ? `PDF · ${t.n || '?'} HAL`
        : rec ? `● REC ${fmt(video.currentTime)}` : (autoplay ? '◌ TUNING' : '▶ PUTAR');
      hud.classList.toggle('rec', rec);
      hud.style.transform = `translate(${(st.W / 2 + tl[0] + 6).toFixed(1)}px, ${(st.H / 2 + tl[1] + 6).toFixed(1)}px)`;
      hud.classList.add('on');
      capAt(t, bl);
    }

    /* ----- atlas: halaman kecil dulu (cepat), lalu versi penuh ----- */
    const pageCount = preview ? 1 : Math.min(PAGES, (atlasInfo.pages || []).length);
    const loadImg = (src) => new Promise((res, rej) => {
      const im = new Image(); im.decoding = 'async';
      im.onload = () => res(im); im.onerror = rej; im.src = src;
    });
    const put = (p, im, lvl) => {
      if (dead || (rd.lost && rd.lost())) return;
      rd.setAtlas(p, im); loaded[p] = lvl;
      if (p === 0) { tuning.classList.add('off'); el.classList.add('is-ready'); }
      dirty = true; kick();
    };
    async function loadAtlases() {
      const sm = atlasInfo.pagesSm || [], full = atlasInfo.pages || [];
      const lite = saveData || (navigator.deviceMemory && navigator.deviceMemory <= 2);
      try { put(0, await loadImg(sm[0] || full[0]), sm[0] ? 1 : 2); } catch (e) { tuning.classList.add('off'); }
      if (preview) return;
      await Promise.all([1, 2].filter((p) => p < pageCount).map((p) =>
        loadImg(sm[p] || full[p]).then((im) => put(p, im, sm[p] ? 1 : 2), () => {})));
      if (lite) return;
      for (let p = 0; p < pageCount; p++) {
        if (loaded[p] === 2 || !full[p]) continue;
        try { put(p, await loadImg(full[p]), 2); } catch (e) { /* keep the small one */ }
      }
    }
    if (opts.lazyAtlas && document.readyState !== 'complete') addEventListener('load', loadAtlases, { once: true });
    else loadAtlases();

    /* ----- visibility ----- */
    const io = new IntersectionObserver(([en]) => {
      visible = en.isIntersecting;
      if (!visible) { cancelAnimationFrame(raf); raf = 0; if (!video.paused) video.pause(); }
      else { dirty = true; kick(); if (st.A && st.A.target > 1) schedulePlay(150); }
    }, { threshold: 0.05 });
    io.observe(el);
    const onVis = () => {
      if (document.hidden) { cancelAnimationFrame(raf); raf = 0; if (!video.paused) video.pause(); }
      else { dirty = true; kick(); }
    };
    document.addEventListener('visibilitychange', onVis);
    const ro = new ResizeObserver(() => { resize(); kick(); });
    ro.observe(el);
    resize();
    surface.addEventListener('webglcontextlost', (e) => { e.preventDefault(); dead = true; cancelAnimationFrame(raf); raf = 0; staticGrid(el, tapes, hrefFor); });

    function focus(slug, quiet) {
      const ti = tapes.findIndex((t) => t.s === slug);
      if (ti < 0 || !layout) return;
      if (!inFilter(tapes[ti])) setFilter('all');
      // the instance closest to the current camera
      let best = -1, bd = Infinity;
      layout.cell.forEach((t, i) => {
        if (t !== ti || layout.part[i] !== 0) return;
        const r = (i / st.cols) | 0, c = i % st.cols;
        let dx = c * UW - st.cam[0], dy = r * CH - st.cam[1];
        dx -= worldW() * Math.round(dx / worldW()); dy -= worldH() * Math.round(dy / worldH());
        const d = Math.hypot(dx, dy); if (d < bd) { bd = d; best = i; }
      });
      if (best < 0) return;
      centreOn(best);
      if (!quiet && coarse) { const h = tileAtFlat(st.cam[0], st.cam[1]); touched = true; snapped = h.key; setActive(h, { play: !paused, delay: 300 }); }
      dirty = true; kick();
    }
    // 'all' | 'v' (video) | 'x' (desain: gambar + dokumen) — layout ulang, atlas tetap
    function setFilter(f) {
      f = f === 'v' || f === 'x' ? f : 'all';
      if (f === filter || !layout) return;
      filter = f;
      clearTimeout(hoverTimer); pendingKey = null; snapTo = null; mode = 'idle'; vel[0] = vel[1] = 0;
      stopVideo(); st.A = st.B = null; snapped = null;
      rebuild(worldSize());
      centreFeatured();
      tellHover(null); // the tile under the cursor is a different one now
      el.dispatchEvent(new CustomEvent('wall:filter', { detail: { filter } }));
      dirty = true; kick();
      if (lastPtr && pointerIn && !coarse) hover(lastPtr[0], lastPtr[1]);
    }

    const inst = {
      el,
      renderer: rd.kind,
      focus,
      setFilter,
      get filter() { return filter; },
      setPaused(v) {
        paused = !!v;
        if (paused) { clearTimeout(playTimer); if (!video.paused) video.pause(); }
        else { dirty = true; kick(); if (st.A && st.A.target > 1) schedulePlay(200); }
      },
      destroy() {
        dead = true;
        cancelAnimationFrame(raf); io.disconnect(); ro.disconnect();
        document.removeEventListener('visibilitychange', onVis);
        video.pause(); video.removeAttribute('src'); video.load();
        el.replaceChildren();
      },
      _debug: () => ({ st, layout, mode, ext, snapped, touched, paused, raf, visible, loaded, filter, vidReady, vidShown, vidSlug, frame, hit, hover, nearestToCenter }),
    };
    el.fisheye = inst;
    return inst;
  }

  window.Fisheye = { mount, buildLayout, spanOf };
})();
