/* IHSAN.TV Wall — dinding video fisheye tak berujung.
   Dipakai work.html (variant 'full') dan index.html (variant 'preview').

     const wall = Fisheye.mount(el, { tapes: TAPES, atlas: TAPE_ATLAS, variant: 'full', onOpen(tape) {} });
     wall.focus(slug) · wall.setPaused(bool) · wall.destroy()

   Render: WebGL satu pass — tiap piksel layar dipetakan balik ke "dunia datar"
   (L = R/k · atanh(L'/R)), lalu dicari sel/tile-nya, jadi tepi tile, thumbnail
   DAN video ikut melengkung per piksel. Fallback Canvas 2D (kotak saja yang
   dipindah/diskalakan), lalu grid statis. Tidak bergantung main.js. */
(() => {
  const GAP = 10;          // jarak antar video di dunia datar (px)
  const K = 1.25;          // pembesaran di tengah
  const CAP = 0.985;       // batas tepi globe (L'/R)
  const RAD = 6;           // radius sudut tile (px datar)
  const FRICTION = 0.93;   // inertia per frame @60fps
  const DRIFT = [0.028, 0.014]; // px datar / ms
  const SPAN = { '9:16': 1, '4:5': 2, '1:1': 2, '16:9': 3 };
  const atanh = (x) => 0.5 * Math.log((1 + x) / (1 - x));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const fmt = (s) => { s = Math.max(0, s | 0); return `${String((s / 60) | 0).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
  const hexRGB = (h) => [1, 3, 5].map((i) => parseInt((h || '#202020').slice(i, i + 2), 16));

  function mulberry(a) {
    return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  /* ---------- layout: COLS×ROWS sel, tile horizontal memakai 2–3 sel ---------- */
  function buildLayout(tapes, cols, rows, seed) {
    const rnd = mulberry(seed);
    const shuffled = () => { const a = tapes.map((_, i) => i);
      for (let i = a.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const cell = new Int16Array(cols * rows).fill(-1); // tape index
    const part = new Uint8Array(cols * rows);
    const span = new Uint8Array(cols * rows);
    const at = (c, r) => cell[((r + rows) % rows) * cols + ((c + cols) % cols)];
    let bag = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (cell[r * cols + c] !== -1) continue;
        let free = 0; while (c + free < cols && cell[r * cols + c + free] === -1 && free < 3) free++;
        if (bag.length < tapes.length) bag = bag.concat(shuffled());
        let pick = -1;
        for (let pass = 0; pass < 2 && pick < 0; pass++) {
          for (let i = 0; i < bag.length; i++) {
            const t = bag[i], s = SPAN[tapes[t].r] || 1;
            if (s > free) continue;
            if (pass === 0) {
              let bad = at(c - 1, r) === t || (c + s === cols && at(0, r) === t);
              for (let k = 0; k < s && !bad; k++) bad = at(c + k, r - 1) === t || (r === rows - 1 && at(c + k, 0) === t);
              if (bad) continue;
            }
            pick = i; break;
          }
        }
        if (pick < 0) continue; // only spans left and 1 free cell: leave the cell for a later single
        const t = bag.splice(pick, 1)[0], s = SPAN[tapes[t].r] || 1;
        for (let k = 0; k < s; k++) { const i = r * cols + c + k; cell[i] = t; part[i] = k; span[i] = s; }
      }
      // any hole left (rare): fill with the next single
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        if (cell[i] !== -1) continue;
        const t = tapes.findIndex((x, j) => (SPAN[x.r] || 1) === 1 && at(c - 1, r) !== j && at(c, r - 1) !== j);
        cell[i] = t < 0 ? 0 : t; part[i] = 0; span[i] = 1;
      }
    }
    return { cols, rows, cell, part, span };
  }

  /* ================= SHADERS ================= */
  const VS1 = 'attribute vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }';
  const VS2 = '#version 300 es\nin vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }';
  const FS_BODY = `
uniform vec2 uRes; uniform float uDpr;
uniform vec2 uCam; uniform float uR; uniform float uK; uniform float uCap;
uniform vec2 uCell; uniform vec2 uGrid; uniform float uGap; uniform float uRad;
uniform sampler2D uAtlas; uniform sampler2D uLut; uniform sampler2D uVideo;
uniform vec2 uAtlasSize; uniform vec2 uLutSize; uniform float uReady;
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
vec3 tape(float t, vec2 l, float ta, float rev){
  vec4 a = aRect(t);
  vec3 img = TEX(uAtlas, (a.xy + cover(l, ta, a.z / a.w) * a.zw) / uAtlasSize).rgb;
  return mix(lut(t, uGrid.y + 2.0).rgb, img, rev); }
vec3 lifted(vec3 col, vec2 p, vec4 R, vec4 I, float px, float rev){
  if (I.y < 0.5) return col;
  vec2 ws = uGrid * uCell;
  vec2 d = p - (R.xy + 0.5 * R.zw); d -= ws * floor(d / ws + 0.5);
  vec2 h = 0.5 * R.zw * I.y;
  float sd = sdBox(d, h, uRad * I.y);
  if (sd > 30.0) return col;
  float lift = clamp((I.y - 1.0) * 8.0, 0.0, 1.0);
  col *= 1.0 - (1.0 - smoothstep(0.0, 28.0, sd)) * 0.7 * lift;
  vec2 l = clamp((d + h) / (2.0 * h), 0.0, 1.0);
  vec3 img = tape(I.x, l, R.z / R.w, rev);
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
  float rev = clamp(uReady * 1.8 - r / uR * 0.8, 0.0, 1.0);
  vec2 cu = floor(p / uCell);
  vec2 ci = mod(cu, uGrid);
  vec4 c = lut(ci.x, ci.y);
  float t = dec(c.r), part = dec(c.g), span = max(dec(c.b), 1.0);
  vec2 rmin = vec2((cu.x - part) * uCell.x, cu.y * uCell.y) + 0.5 * uGap;
  vec2 rsz = vec2(span * uCell.x, uCell.y) - uGap;
  float sd = sdBox(p - (rmin + 0.5 * rsz), 0.5 * rsz, uRad);
  vec3 col = mix(BG, tape(t, (p - rmin) / rsz, rsz.x / rsz.y, rev), clamp(0.5 - sd / px, 0.0, 1.0));
  col = lifted(col, p, uB, uBI, px, rev);
  col = lifted(col, p, uA, uAI, px, rev);
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
  function glRenderer(canvas) {
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
    ['uRes', 'uDpr', 'uCam', 'uR', 'uK', 'uCap', 'uCell', 'uGrid', 'uGap', 'uRad', 'uAtlas', 'uLut', 'uVideo',
      'uAtlasSize', 'uLutSize', 'uReady', 'uA', 'uAI', 'uB', 'uBI', 'uVid', 'uCA']
      .forEach((n) => { U[n] = gl.getUniformLocation(prog, n); });
    const tex = (unit, filter) => { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter === gl.NEAREST ? gl.NEAREST : gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([10, 10, 12, 255]));
      return t; };
    const tAtlas = tex(0, gl.LINEAR), tLut = tex(1, gl.NEAREST), tVid = tex(2, gl.LINEAR);
    gl.uniform1i(U.uAtlas, 0); gl.uniform1i(U.uLut, 1); gl.uniform1i(U.uVideo, 2);
    gl.uniform2f(U.uAtlasSize, 1, 1);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    return {
      kind: 'webgl',
      setAtlas(img) {
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tAtlas);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.uniform2f(U.uAtlasSize, img.naturalWidth || img.width, img.naturalHeight || img.height);
      },
      setLut(data, w, h) {
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tLut);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
        gl.uniform2f(U.uLutSize, w, h);
      },
      uploadVideo(video) {
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, tVid);
        try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video); return true; } catch (e) { return false; }
      },
      draw(st) {
        const { W, H, dpr } = st;
        gl.viewport(0, 0, Math.round(W * dpr), Math.round(H * dpr));
        gl.uniform2f(U.uRes, Math.round(W * dpr), Math.round(H * dpr));
        gl.uniform1f(U.uDpr, dpr);
        gl.uniform2f(U.uCam, st.cam[0], st.cam[1]);
        gl.uniform1f(U.uR, st.R); gl.uniform1f(U.uK, K); gl.uniform1f(U.uCap, CAP);
        gl.uniform2f(U.uCell, st.CW, st.CH); gl.uniform2f(U.uGrid, st.cols, st.rows);
        gl.uniform1f(U.uGap, GAP); gl.uniform1f(U.uRad, RAD);
        gl.uniform1f(U.uReady, st.ready);
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
  function canvasRenderer(canvas, api) {
    const g = canvas.getContext('2d');
    if (!g) return null;
    let atlas = null;
    return {
      kind: '2d',
      setAtlas(img) { atlas = img; }, setLut() {}, uploadVideo() { return true; },
      draw(st) {
        const { W, H, dpr } = st;
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.fillStyle = '#020202'; g.fillRect(0, 0, W, H);
        g.save();
        g.beginPath(); g.arc(W / 2, H / 2, st.R * CAP, 0, Math.PI * 2); g.clip();
        g.fillStyle = '#09090c'; g.fillRect(0, 0, W, H);
        const ext = api.extent();
        const c0 = Math.floor((st.cam[0] - ext[0]) / st.CW) - 3, c1 = Math.ceil((st.cam[0] + ext[0]) / st.CW) + 1;
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
          const src = video && mix > 0.5 && video.readyState >= 2 ? video : atlas;
          if (src) {
            let sx, sy, sw, sh;
            if (src === video) { sx = 0; sy = 0; sw = video.videoWidth; sh = video.videoHeight; }
            else { [sx, sy, sw, sh] = tp.a; }
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
            drawTile(i.t, [c * st.CW + GAP / 2, r * st.CH + GAP / 2, i.span * st.CW - GAP, st.CH - GAP], 1);
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
    el.innerHTML = `<p class="wall-nosignal">NO SIGNAL — showing list</p><div class="wall-fb">${
      tapes.slice(0, 24).map((t) => `<a class="wall-fb-item" href="${href(t)}"><img src="assets/video/thumb/${t.s}.webp" alt="${t.label}" loading="lazy"></a>`).join('')}</div>`;
  }

  /* ================= MOUNT ================= */
  function mount(el, opts) {
    const tapes = opts.tapes || window.TAPES || [];
    const atlasInfo = opts.atlas || window.TAPE_ATLAS;
    const variant = opts.variant || 'full';
    const preview = variant === 'preview';
    const coarse = matchMedia('(pointer: coarse)').matches || !matchMedia('(hover: hover)').matches;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const saveData = !!(navigator.connection && navigator.connection.saveData);
    const autoplay = !reduce && !saveData;
    const onOpen = opts.onOpen || (() => {});
    const hrefFor = opts.href || ((t) => `#tape/${t.s}`);
    if (!tapes.length) return null;

    const TH = preview ? (coarse ? 72 : 84) : (coarse ? 118 : 150);
    const CW = TH * 9 / 16 + GAP, CH = TH + GAP;
    const LIFT = preview ? 1.3 : coarse ? 1.35 : 1.18;

    /* DOM */
    el.classList.add('wall', preview ? 'wall--preview' : 'wall--full');
    el.setAttribute('data-keep-brand', '');
    if (!el.hasAttribute('role')) {
      el.setAttribute('role', 'application');
      el.tabIndex = 0;
      el.setAttribute('aria-label', preview
        ? 'Pratinjau dinding video portofolio. Panah untuk menjelajah, Enter untuk membuka portofolio.'
        : 'Dinding video portofolio, gunakan panah untuk menjelajah, Enter untuk membuka');
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
    video.preload = 'metadata'; video.disableRemotePlayback = true; video.dataset.noDuck = '';
    el.append(canvas, ring, hud, cap, live, tuning, video);
    if (coarse) el.classList.add('is-touch');

    /* renderer */
    let rd = null, surface = canvas;
    const api = {};
    try { rd = glRenderer(canvas); } catch (e) { console.warn('[wall] webgl:', e.message); rd = null; }
    if (!rd) {
      // a canvas that tried webgl cannot give a 2d context — swap it
      const c2 = canvas.cloneNode(); canvas.replaceWith(c2);
      rd = canvasRenderer(c2, api);
      if (!rd) { staticGrid(el, tapes, hrefFor); return null; }
      surface = c2;
    }
    if (fb) fb.remove();
    el.classList.add('is-' + rd.kind);

    /* state */
    const st = {
      W: 1, H: 1, dpr: 1, R: 1, CW, CH, cols: 0, rows: 0, cam: [0, 0], tapes,
      ready: 0, A: null, B: null, ca: 0, vidW: 9, vidH: 16,
    };
    let layout = null, ext = [0, 0];
    const vel = [0, 0];
    let mode = 'idle'; // idle | drag | coast | snap
    let snapTo = null, hoverTimer = 0, leaveTimer = 0, playTimer = 0, holdTimer = 0;
    let pendingKey = null;
    let pointerIn = false, touched = false, paused = false, visible = true;
    let ptr = null; // active pointer gesture
    let lastPtr = null; // last mouse position (for hover refresh)
    let dirty = true, raf = 0, last = 0, vidReady = false, vidFrame = false, holding = null, snapped = null;

    const worldW = () => st.cols * CW, worldH = () => st.rows * CH;
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
      const c = Math.floor(x / CW), r = Math.floor(y / CH);
      const i = api.cellAt(c, r);
      const ox = (c - i.part) * CW;
      const rect = [wrap(ox + GAP / 2, worldW()), wrap(r * CH + GAP / 2, worldH()), i.span * CW - GAP, CH - GAP];
      const inside = x >= ox + GAP / 2 && x <= ox + i.span * CW - GAP / 2 && y >= r * CH + GAP / 2 && y <= (r + 1) * CH - GAP / 2;
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
      const c0 = Math.floor(x0 / CW), r0 = Math.floor(y0 / CH);
      for (let r = r0 - 1; r <= r0 + 1; r++) for (let c = c0 - 3; c <= c0 + 3; c++) {
        const i = api.cellAt(c, r); if (i.part !== 0) continue;
        const cx = c * CW + i.span * CW / 2, cy = r * CH + CH / 2;
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
    function resize() {
      const b = el.getBoundingClientRect();
      if (b.width < 2 || b.height < 2) return;
      st.W = b.width; st.H = b.height;
      st.dpr = Math.min(devicePixelRatio || 1, coarse ? 1.75 : 2);
      st.R = 0.5 * Math.max(st.W, st.H);
      surface.width = Math.round(st.W * st.dpr); surface.height = Math.round(st.H * st.dpr);
      ext = measureExtent();
      const cols = Math.max(8, Math.ceil((2 * ext[0] + 4 * CW) / CW));
      const rows = Math.max(5, Math.ceil((2 * ext[1] + 2 * CH) / CH));
      if (!layout || cols > st.cols || rows > st.rows) {
        const keep = layout && st.A ? tapes[st.A.t].s : null;
        layout = buildLayout(tapes, Math.max(cols, st.cols), Math.max(rows, st.rows), 0x1415A7);
        st.cols = layout.cols; st.rows = layout.rows;
        uploadLut();
        if (keep) focus(keep, true); else if (!st.A) centreFeatured();
      }
      st.ca = rd.kind === 'webgl' && !coarse && !preview && st.W > 700 ? 0.0016 : 0;
      dirty = true;
    }
    function uploadLut() {
      const w = Math.max(st.cols, tapes.length), h = st.rows + 3;
      const d = new Uint8Array(w * h * 4);
      for (let r = 0; r < st.rows; r++) for (let c = 0; c < st.cols; c++) {
        const i = r * st.cols + c, o = (r * w + c) * 4;
        d[o] = layout.cell[i]; d[o + 1] = layout.part[i]; d[o + 2] = layout.span[i]; d[o + 3] = 255;
      }
      tapes.forEach((t, i) => {
        const a = t.a || [0, 0, 1, 1];
        let o = (st.rows * w + i) * 4;
        d[o] = a[0] >> 8; d[o + 1] = a[0] & 255; d[o + 2] = a[1] >> 8; d[o + 3] = a[1] & 255;
        o = ((st.rows + 1) * w + i) * 4;
        d[o] = a[2] >> 8; d[o + 1] = a[2] & 255; d[o + 2] = a[3] >> 8; d[o + 3] = a[3] & 255;
        o = ((st.rows + 2) * w + i) * 4;
        const c = hexRGB(t.c); d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
      });
      rd.setLut(d, w, h);
    }
    function centreFeatured() {
      const feat = tapes.map((t, i) => (t.featured ? i : -1)).filter((i) => i >= 0);
      const want = feat.length ? feat[(Math.random() * feat.length) | 0] : 0;
      const idx = layout.cell.findIndex((t, i) => t === want && layout.part[i] === 0);
      if (idx < 0) return;
      const r = (idx / st.cols) | 0, c = idx % st.cols;
      st.cam[0] = c * CW + layout.span[idx] * CW / 2;
      st.cam[1] = r * CH + CH / 2;
    }

    /* ----- active tile (lifted, playing) ----- */
    const lifted = (h, target) => ({ t: h.t, rect: h.rect, key: h.key, scale: 1, target, mix: 0, prog: -1 });
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
        live._t = setTimeout(() => { live.textContent = t.label + (t.client ? ` — ${t.client}` : ''); }, 350);
      }
      dirty = true; kick();
    }
    function clearActive() { setActive(null); }
    function stopVideo() {
      clearTimeout(playTimer); playTimer = 0;
      vidReady = false;
      if (st.A) st.A.mix = 0;
      if (!video.paused) video.pause();
    }
    function schedulePlay(delay) {
      clearTimeout(playTimer); playTimer = 0;
      if (!autoplay || paused) return;
      playTimer = setTimeout(startVideo, delay);
    }
    function startVideo() {
      playTimer = 0;
      if (!st.A || paused) return;
      const src = `assets/video/${tapes[st.A.t].s}.mp4`;
      if (!video.src.endsWith(src)) { vidReady = false; video.src = src; }
      video.play().catch(() => {});
    }
    video.addEventListener('playing', () => {
      if (!st.A || !video.src.endsWith(`/${tapes[st.A.t].s}.mp4`)) return;
      vidReady = true; st.vidW = video.videoWidth || 9; st.vidH = video.videoHeight || 16;
      vidFrame = true; kick();
    });
    if ('requestVideoFrameCallback' in video) {
      const onFrame = () => { vidFrame = true; dirty = true; video.requestVideoFrameCallback(onFrame); };
      video.requestVideoFrameCallback(onFrame);
    }

    /* ----- input ----- */
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
          if (!ptr.hold) { try { el.setPointerCapture(e.pointerId); } catch (_) { /* gone */ } mode = 'drag'; el.classList.add('is-dragging'); }
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
    function kick() { if (!raf && visible && !paused) { last = performance.now(); raf = requestAnimationFrame(frame); } }
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
      if (st.A) {
        const want = vidReady ? 1 : 0;
        if (st.A.mix !== want) { st.A.mix = clamp(st.A.mix + (want ? 0.12 : -0.2) * f, 0, 1); anim = true; }
        st.A.prog = vidReady && video.duration ? (video.currentTime / video.duration) : -1;
      }
      if (st.ready < 1 && atlasLoaded) { st.ready = Math.min(1, st.ready + dt / 700); anim = true; }

      // new video frame → texture
      const playing = vidReady && !video.paused && video.readyState >= 2;
      if (playing && (vidFrame || !('requestVideoFrameCallback' in video))) {
        vidFrame = false;
        if (!rd.uploadVideo(video)) vidReady = false;
        dirty = true;
      }
      if (moving || anim || dirty || playing) { rd.draw(st); dirty = false; placeHud(); }
      if (!paused && (moving || anim || playing || mode !== 'idle' || ptr)) raf = requestAnimationFrame(frame);
    }

    function placeHud() {
      const s = st.A && st.A.target > 1 ? st.A : null;
      if (!s || s.scale < 1.03) { hud.classList.remove('on'); cap.classList.remove('on'); return; }
      const r = api.near(s.rect);
      const cx = r[0] + r[2] / 2, cy = r[1] + r[3] / 2;
      const hw = r[2] / 2 * s.scale, hh = r[3] / 2 * s.scale;
      const tl = api.toScreen(cx - hw, cy - hh), bl = api.toScreen(cx - hw, cy + hh);
      if (!tl || !bl) { hud.classList.remove('on'); cap.classList.remove('on'); return; }
      const t = tapes[s.t];
      const rec = vidReady && !video.paused;
      hud.textContent = rec ? `● REC ${fmt(video.currentTime)}` : (autoplay ? '◌ TUNING' : '▶ PLAY');
      hud.classList.toggle('rec', rec);
      hud.style.transform = `translate(${(st.W / 2 + tl[0] + 6).toFixed(1)}px, ${(st.H / 2 + tl[1] + 6).toFixed(1)}px)`;
      cap.textContent = t.label + (t.client ? ` · ${t.client}` : '');
      cap.style.transform = `translate(${(st.W / 2 + bl[0]).toFixed(1)}px, ${(st.H / 2 + bl[1] + 8).toFixed(1)}px)`;
      hud.classList.add('on'); cap.classList.add('on');
    }

    /* ----- atlas ----- */
    let atlasLoaded = false;
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      rd.setAtlas(img); atlasLoaded = true;
      tuning.classList.add('off');
      el.classList.add('is-ready');
      dirty = true; kick();
    };
    img.onerror = () => { tuning.classList.add('off'); };
    const loadAtlas = () => { img.src = (preview ? atlasInfo.srcSm : atlasInfo.src); };
    if (opts.lazyAtlas && document.readyState !== 'complete') addEventListener('load', loadAtlas, { once: true });
    else loadAtlas();

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
    surface.addEventListener('webglcontextlost', (e) => { e.preventDefault(); cancelAnimationFrame(raf); raf = 0; staticGrid(el, tapes, hrefFor); });

    function focus(slug, quiet) {
      const ti = tapes.findIndex((t) => t.s === slug);
      if (ti < 0 || !layout) return;
      // the instance closest to the current camera
      let best = -1, bd = Infinity;
      layout.cell.forEach((t, i) => {
        if (t !== ti || layout.part[i] !== 0) return;
        const r = (i / st.cols) | 0, c = i % st.cols;
        let dx = c * CW - st.cam[0], dy = r * CH - st.cam[1];
        dx -= worldW() * Math.round(dx / worldW()); dy -= worldH() * Math.round(dy / worldH());
        const d = Math.hypot(dx, dy); if (d < bd) { bd = d; best = i; }
      });
      if (best < 0) return;
      const r = (best / st.cols) | 0, c = best % st.cols;
      st.cam[0] = c * CW + layout.span[best] * CW / 2; st.cam[1] = r * CH + CH / 2;
      if (!quiet && coarse) { const h = tileAtFlat(st.cam[0], st.cam[1]); touched = true; snapped = h.key; setActive(h, { play: !paused, delay: 300 }); }
      dirty = true; kick();
    }

    const inst = {
      el,
      renderer: rd.kind,
      focus,
      setPaused(v) {
        paused = !!v;
        if (paused) { clearTimeout(playTimer); if (!video.paused) video.pause(); }
        else { dirty = true; kick(); if (st.A && st.A.target > 1) schedulePlay(200); }
      },
      destroy() {
        cancelAnimationFrame(raf); io.disconnect(); ro.disconnect();
        document.removeEventListener('visibilitychange', onVis);
        video.pause(); video.removeAttribute('src'); video.load();
        el.replaceChildren();
      },
      _debug: () => ({ st, layout, mode, ext, snapped, touched, paused, raf, visible }),
    };
    el.fisheye = inst;
    return inst;
  }

  window.Fisheye = { mount };
})();
