// Efek visual ringan: satu sistem partikel (1 draw call) untuk bintang, konfeti, asap, debu, cipratan;
// gelombang cincin; jejak asap ujung sayap; garis kecepatan saat thrust; piringan blur baling-baling;
// bintang pusing saat nabrak; goyang kamera kecil. Plus pass outline hitam tipis dari depth buffer.
import * as THREE from 'three';

// ── Tekstur atlas partikel: kiri = bola lembut, kanan = bintang ──
function atlas() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.55, 'rgba(255,255,255,.7)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#fff'; g.strokeStyle = 'rgba(40,30,0,.55)'; g.lineWidth = 3; g.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, k = i % 2 ? 11 : 27; g.lineTo(96 + Math.cos(a) * k, 33 + Math.sin(a) * k); }
  g.closePath(); g.fill(); g.stroke();
  return new THREE.CanvasTexture(c);
}

export function createFx(scene, camera, renderer) {
  const MAX = 500;
  const pos = new Float32Array(MAX * 3), col = new Float32Array(MAX * 4), size = new Float32Array(MAX), shape = new Float32Array(MAX);
  const P = Array.from({ length: MAX }, () => ({ life: 0 }));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('shape', new THREE.BufferAttribute(shape, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    uniforms: { map: { value: atlas() }, scale: { value: 400 } },
    vertexShader: /* glsl */`
      attribute vec4 color; attribute float size; attribute float shape;
      uniform float scale; varying vec4 vColor; varying float vShape;
      void main() {
        vColor = color; vShape = shape;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = min(size * scale / -mv.z, scale * 0.13);   // partikel dekat kamera tidak memenuhi layar
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D map; varying vec4 vColor; varying float vShape;
      void main() {
        vec4 t = texture2D(map, vec2((gl_PointCoord.x + vShape) * 0.5, 1.0 - gl_PointCoord.y));
        gl_FragColor = vec4(vColor.rgb * mix(vec3(1.0), t.rgb, vShape), vColor.a * t.a);
        if (gl_FragColor.a < 0.01) discard;
        #include <colorspace_fragment>
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false; points.renderOrder = 5;
  scene.add(points);
  let next = 0;
  const tmpC = new THREE.Color();
  function emit(o) {  // {p, v, life, size, size1, color, alpha, star, grav, drag, spin}
    const q = P[next]; next = (next + 1) % MAX;
    q.p = o.p.clone(); q.v = o.v ? o.v.clone() : new THREE.Vector3();
    q.life = q.max = o.life ?? 1; q.s0 = o.size ?? 1; q.s1 = o.size1 ?? q.s0; q.a = o.alpha ?? 1;
    q.c = tmpC.set(o.color ?? 0xffffff).toArray(); q.star = o.star ? 1 : 0; q.g = o.grav ?? 0; q.drag = o.drag ?? 0;
  }
  const rv = (s = 1) => new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(s);
  const CONFETTI = [0xff4d4d, 0xffc21a, 0x2fbf4f, 0x2f7bff, 0xff4f9a, 0x9b4dff];

  // Gelombang cincin (ambil objective / tercebur)
  const rings = Array.from({ length: 3 }, () => {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    m.visible = false; m.renderOrder = 4; scene.add(m); return { m, t: 1, flat: false };
  });
  let ringNext = 0;
  function ring(p, color, { flat = false, size = 7 } = {}) {
    const r = rings[ringNext++ % rings.length];
    r.m.position.copy(p); r.m.material.color.set(color); r.t = 0; r.flat = flat; r.size = size; r.m.visible = true;
    if (flat) r.m.rotation.set(-Math.PI / 2, 0, 0);
  }

  // Jejak ujung sayap (2 pita). Selalu tipis saat terbang, tebal & terang saat thrust.
  const SEG = 36;
  const trails = [0, 1].map(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SEG * 2 * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(SEG * 2 * 4), 4));
    const idx = [];
    for (let i = 0; i < SEG - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    m.frustumCulled = false; m.renderOrder = 3; scene.add(m);
    return { m, hist: [] };
  });
  const tipL = new THREE.Vector3(), tipR = new THREE.Vector3(), upv = new THREE.Vector3();

  // Garis kecepatan (anak kamera) saat thrust
  const LINES = 46;
  const lpos = new Float32Array(LINES * 6), lines = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(lpos, 3)),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthTest: false, fog: false }));
  const L = Array.from({ length: LINES }, () => ({ a: 0, r: 0, z: 0 }));
  const respawnLine = (l, z = -30 - Math.random() * 30) => { l.a = Math.random() * Math.PI * 2; l.r = 3 + Math.random() * 5; l.z = z; };
  L.forEach(l => respawnLine(l, -Math.random() * 60));
  lines.frustumCulled = false; lines.renderOrder = 6;
  camera.add(lines); scene.add(camera);

  // Bintang pusing di atas pesawat saat nabrak
  const dizzy = new THREE.Group();
  const starTex = (() => { const t = atlas(); t.repeat.set(0.5, 1); t.offset.set(0.5, 0); return t; })();
  for (let i = 0; i < 3; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, color: 0xffd23a, depthTest: false })); s.scale.setScalar(0.9); dizzy.add(s); }
  dizzy.visible = false; dizzy.renderOrder = 7; scene.add(dizzy);

  let shake = 0, puffT = 0, fov = camera.fov;
  const BASE_FOV = camera.fov;

  return {
    // Ambil objective: cincin warna huruf, bintang memancar, konfeti jatuh.
    collect(p, color) {
      ring(p, color, { size: 9 });
      for (let i = 0; i < 26; i++) emit({ p, v: rv(7 + Math.random() * 5), life: 0.9, size: 1.6, size1: 0.3, color: i % 3 ? 0xfff1a0 : color, star: true, drag: 2.5 });
      for (let i = 0; i < 34; i++) emit({ p, v: rv(5).add({ x: 0, y: 4, z: 0 }), life: 1.6, size: 0.45, color: CONFETTI[i % CONFETTI.length], grav: 9, drag: 1.2 });
    },
    // Pesta: konfeti & bintang (misi selesai).
    party(p) {
      for (let i = 0; i < 70; i++) emit({ p: p.clone().add({ x: 0, y: 2, z: 0 }), v: rv(7).add({ x: 0, y: 6, z: 0 }), life: 2, size: i % 4 ? 0.5 : 1.3, color: CONFETTI[i % CONFETTI.length], star: i % 4 === 0, grav: 8, drag: 1 });
    },
    // Nabrak/jatuh: debu/asap tebal, bintang kartun berhamburan, goyang kamera kecil, bintang pusing.
    crash(p, water) {
      shake = 0.45;
      if (water) {
        ring(p.clone().setY(0.25), 0xffffff, { flat: true, size: 10 });
        for (let i = 0; i < 40; i++) emit({ p, v: rv(4).add({ x: 0, y: 7 + Math.random() * 5, z: 0 }), life: 1.2, size: 0.7, size1: 0.3, color: 0xd9f6ff, grav: 14 });
      } else {
        for (let i = 0; i < 22; i++) emit({ p, v: rv(4).add({ x: 0, y: 2, z: 0 }), life: 1.6, size: 2.2, size1: 4.5, color: 0xb9ab95, alpha: 0.8, drag: 1.5 });
        for (let i = 0; i < 12; i++) emit({ p, v: rv(8).add({ x: 0, y: 5, z: 0 }), life: 1.1, size: 1.2, color: 0xffd23a, star: true, grav: 12 });
      }
    },
    // dipanggil tiap frame. state: {plane, speed01, boosting, crashed, flying, dt}
    update(dt, s) {
      // partikel
      for (let i = 0; i < MAX; i++) {
        const q = P[i];
        if (q.life <= 0) { col[i * 4 + 3] = 0; size[i] = 0; continue; }
        q.life -= dt;
        const k = Math.max(0, q.life / q.max);
        q.v.y -= q.g * dt; q.v.multiplyScalar(Math.max(0, 1 - q.drag * dt));
        q.p.addScaledVector(q.v, dt);
        pos.set([q.p.x, q.p.y, q.p.z], i * 3);
        col.set([q.c[0], q.c[1], q.c[2], q.a * Math.min(1, k * 2.5)], i * 4);
        size[i] = q.s1 + (q.s0 - q.s1) * k; shape[i] = q.star;
      }
      geo.attributes.position.needsUpdate = geo.attributes.color.needsUpdate = geo.attributes.size.needsUpdate = geo.attributes.shape.needsUpdate = true;
      mat.uniforms.scale.value = renderer.domElement.height * 0.5 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));

      for (const r of rings) {
        if (!r.m.visible) continue;
        r.t += dt * 1.6;
        r.m.scale.setScalar(0.5 + r.t * r.size);
        r.m.material.opacity = Math.max(0, 1 - r.t) * 0.9;
        if (!r.flat) r.m.quaternion.copy(camera.quaternion);
        if (r.t >= 1) r.m.visible = false;
      }

      // jejak ujung sayap
      const v = s.plane.visual;
      v.updateWorldMatrix(true, false);
      tipL.set(-2.2, -0.3, 0.2).applyMatrix4(v.matrixWorld); tipR.set(2.2, -0.3, 0.2).applyMatrix4(v.matrixWorld);
      upv.set(0, 1, 0).applyQuaternion(v.getWorldQuaternion(new THREE.Quaternion()));
      const strong = s.boosting ? 1 : 0;
      [tipL, tipR].forEach((tip, k) => {
        const t = trails[k];
        if (!s.flying) t.hist.length = 0;
        else { t.hist.unshift({ p: tip.clone(), u: upv.clone(), w: 0.05 + strong * 0.12, a: 0.25 + strong * 0.55 }); if (t.hist.length > SEG) t.hist.pop(); }
        const pa = t.m.geometry.attributes.position, ca = t.m.geometry.attributes.color;
        for (let i = 0; i < SEG; i++) {
          const h = t.hist[Math.min(i, t.hist.length - 1)];
          const fade = h ? (1 - i / SEG) * h.a : 0;
          for (const sg of [0, 1]) {
            const j = i * 2 + sg;
            if (h) pa.setXYZ(j, h.p.x + h.u.x * h.w * (sg ? 1 : -1), h.p.y + h.u.y * h.w * (sg ? 1 : -1), h.p.z + h.u.z * h.w * (sg ? 1 : -1));
            ca.setXYZW(j, 1, 1, 1, i < t.hist.length ? fade : 0);
          }
        }
        pa.needsUpdate = ca.needsUpdate = true;
      });

      // asap putih kecil di belakang saat thrust; asap abu saat jatuh
      puffT -= dt;
      if (puffT <= 0 && (s.boosting || s.crashed)) {
        puffT = s.crashed ? 0.05 : 0.04;
        const back = new THREE.Vector3(0, -0.1, 1.9).applyMatrix4(v.matrixWorld);
        emit(s.crashed
          ? { p: back, v: rv(1).add({ x: 0, y: 1.5, z: 0 }), life: 1.4, size: 1.2, size1: 3.2, color: 0x8d8a86, alpha: 0.7 }
          : { p: back, v: rv(0.6), life: 0.6, size: 0.7, size1: 1.8, color: 0xffffff, alpha: 0.55 });
      }

      // menembus awan = kabut lembut; terbang rendah di atas laut = percikan
      if (s.mist) for (let i = 0; i < 2; i++) emit({ p: s.plane.root.position.clone().add(rv(4)), v: rv(1.5), life: 0.9, size: 2.4, size1: 5, color: 0xffffff, alpha: 0.4 });
      if (s.spray) emit({ p: s.plane.root.position.clone().setY(0.3).add({ x: (Math.random() - 0.5) * 3, y: 0, z: (Math.random() - 0.5) * 3 }), v: rv(2).add({ x: 0, y: 3.5, z: 0 }), life: 0.7, size: 0.5, size1: 1.1, color: 0xe6faff, alpha: 0.75, grav: 8 });

      // garis kecepatan + FOV melebar saat thrust
      const lo = lines.material.opacity += ((s.boosting ? 0.75 : 0) - lines.material.opacity) * Math.min(1, dt * 6);
      if (lo > 0.01) {
        L.forEach((l, i) => {
          l.z += dt * 90; if (l.z > -2) respawnLine(l);
          const x = Math.cos(l.a) * l.r, y = Math.sin(l.a) * l.r * 0.6;
          lpos.set([x, y, l.z, x, y, l.z - 5], i * 6);
        });
        lines.geometry.attributes.position.needsUpdate = true;
      }
      const targetFov = BASE_FOV + (s.boosting ? 10 : 0);
      if (Math.abs(fov - targetFov) > 0.05) { fov += (targetFov - fov) * Math.min(1, dt * 4); camera.fov = fov; camera.updateProjectionMatrix(); }

      // bintang pusing
      dizzy.visible = s.crashed;
      if (s.crashed) {
        dizzy.position.copy(s.plane.root.position).add({ x: 0, y: 1.8, z: 0 });
        dizzy.children.forEach((st, i) => { const a = performance.now() / 300 + i * 2.09; st.position.set(Math.cos(a) * 1.3, Math.sin(a * 2) * 0.15, Math.sin(a) * 1.3); });
      }

      // goyang kamera kecil (PRD: tidak berlebihan)
      if (shake > 0) { shake -= dt; const k = shake * 0.5; camera.position.add({ x: (Math.random() - 0.5) * k, y: (Math.random() - 0.5) * k, z: 0 }); }
    },
  };
}

// Piringan blur baling-baling: lingkaran transparan, makin terlihat saat cepat.
export function propBlur() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 4, 32, 32, 31);
  r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.55, 'rgba(255,240,200,.35)'); r.addColorStop(0.92, 'rgba(255,240,200,.5)'); r.addColorStop(1, 'rgba(255,240,200,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  const m = new THREE.Mesh(new THREE.CircleGeometry(0.78, 28), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  m.position.set(0, -0.08, -1.47);
  return m;
}

// ── Outline hitam tipis: render ke render target (MSAA) lalu satu pass layar penuh mendeteksi
// tepi dari depth (siluet = lompatan kedalaman, lipatan = perubahan kemiringan permukaan). ──
export function createOutline(renderer, scene, camera, fog) {
  const gl = renderer.getContext();
  const hdr = renderer.extensions.has('EXT_color_buffer_half_float') || renderer.extensions.has('EXT_color_buffer_float');
  const mobile = matchMedia('(pointer: coarse)').matches;
  const rt = new THREE.WebGLRenderTarget(1, 1, {
    type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType, samples: mobile ? 0 : 4,
    depthTexture: new THREE.DepthTexture(1, 1, THREE.FloatType),
  });
  const quadMat = new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false,
    uniforms: {
      tColor: { value: rt.texture }, tDepth: { value: rt.depthTexture }, texel: { value: new THREE.Vector2() },
      near: { value: camera.near }, far: { value: camera.far }, fadeNear: { value: fog.near * 0.55 }, fadeFar: { value: fog.far * 0.85 },
      lineColor: { value: new THREE.Color(0x1f140c) }, strength: { value: 1 },
      thick: { value: 1.5 },
    },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: /* glsl */`
      uniform sampler2D tColor, tDepth; uniform vec2 texel; uniform float near, far, fadeNear, fadeFar, strength, thick; uniform vec3 lineColor;
      varying vec2 vUv;
      float lin(vec2 uv) { float z = texture2D(tDepth, uv).x * 2.0 - 1.0; return 2.0 * near * far / (far + near - z * (far - near)); }
      void main() {
        vec4 col = texture2D(tColor, vUv);
        vec2 o = texel * thick;
        float c = lin(vUv), l = lin(vUv - vec2(o.x, 0.0)), r = lin(vUv + vec2(o.x, 0.0)), u = lin(vUv + vec2(0.0, o.y)), d = lin(vUv - vec2(0.0, o.y));
        // siluet: hanya piksel di sisi yang lebih dekat yang digaris → garis tipis 1 piksel
        vec2 q = o * 0.7;
        float sil = max(max(max(l - c, r - c), max(u - c, d - c)), max(max(lin(vUv + q) - c, lin(vUv - q) - c), max(lin(vUv + vec2(q.x, -q.y)) - c, lin(vUv + vec2(-q.x, q.y)) - c))) / c;
        float e = smoothstep(0.010, 0.040, sil);
        // lipatan: 1/z linear di layar untuk bidang datar → turunan kedua ≠ 0 di sudut/sambungan
        float ic = 1.0 / c, il = 1.0 / l, ir = 1.0 / r, iu = 1.0 / u, id = 1.0 / d;
        float lap = abs(il + ir - 2.0 * ic) + abs(iu + id - 2.0 * ic), grad = abs(ir - il) + abs(iu - id) + ic * 1e-4;
        float f = smoothstep(0.5, 0.95, lap / grad) * (1.0 - smoothstep(35.0, 120.0, c));   // lipatan: halus, hanya yang dekat
        float fade = 1.0 - smoothstep(fadeNear, fadeFar, c);   // memudar ke jauh (tak berisik di kabut)
        if (c > far * 0.95) fade = 0.0;                       // langit
        col.rgb = mix(col.rgb, col.rgb * 0.42, f * 0.55 * fade);                       // lipatan = warna bendanya sendiri, lebih gelap
        col.rgb = mix(col.rgb, mix(col.rgb * 0.2, lineColor, 0.75), e * strength * fade);
        gl_FragColor = col;
      }`,
  });
  // FXAA: menghaluskan garis & tepi (MSAA tidak menyentuh garis hasil pass ini; HP tidak memakai MSAA).
  const rt2 = new THREE.WebGLRenderTarget(1, 1, { type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType, depthBuffer: false });
  const aaMat = new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false, uniforms: { tColor: { value: rt2.texture }, texel: quadMat.uniforms.texel },
    vertexShader: quadMat.vertexShader,
    fragmentShader: /* glsl */`
      uniform sampler2D tColor; uniform vec2 texel; varying vec2 vUv;
      float lum(vec3 c) { float l = dot(max(c, 0.0), vec3(0.299, 0.587, 0.114)); return sqrt(l / (1.0 + l)); }
      void main() {
        vec3 M = texture2D(tColor, vUv).rgb;
        float m = lum(M), nw = lum(texture2D(tColor, vUv + vec2(-1.0, 1.0) * texel).rgb), ne = lum(texture2D(tColor, vUv + texel).rgb), sw = lum(texture2D(tColor, vUv - texel).rgb), se = lum(texture2D(tColor, vUv + vec2(1.0, -1.0) * texel).rgb);
        float lo = min(m, min(min(nw, ne), min(sw, se))), hi = max(m, max(max(nw, ne), max(sw, se)));
        vec3 outc = M;
        if (hi - lo > max(0.05, hi * 0.13)) {
          vec2 d = vec2((nw + ne) - (sw + se), (nw + sw) - (ne + se));   // sejajar tepi
          float red = max((nw + ne + sw + se) * 0.25 * 0.125, 1.0 / 128.0);
          d = clamp(d / (min(abs(d.x), abs(d.y)) + red), -4.0, 4.0) * texel;
          vec3 A = 0.5 * (texture2D(tColor, vUv + d * (1.0 / 3.0 - 0.5)).rgb + texture2D(tColor, vUv + d * (2.0 / 3.0 - 0.5)).rgb);
          vec3 B = A * 0.5 + 0.25 * (texture2D(tColor, vUv - d * 0.5).rgb + texture2D(tColor, vUv + d * 0.5).rgb);
          float b = lum(B);
          outc = b < lo || b > hi ? A : B;
        }
        gl_FragColor = vec4(outc, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), quadMat);
  const qScene = new THREE.Scene(), qCam = new THREE.Camera();
  qScene.add(quad);
  const size = new THREE.Vector2();
  void gl;
  return {
    render() {
      renderer.getDrawingBufferSize(size);
      if (rt.width !== size.x || rt.height !== size.y) {
        rt.setSize(size.x, size.y); rt2.setSize(size.x, size.y); quadMat.uniforms.texel.value.set(1 / size.x, 1 / size.y);
        quadMat.uniforms.thick.value = Math.max(1.3, renderer.getPixelRatio() * 1.05);   // garis ±1 px CSS: tipis, ramah anak
      }
      renderer.setRenderTarget(rt);
      renderer.render(scene, camera);
      renderer.setRenderTarget(rt2); quad.material = quadMat;
      renderer.render(qScene, qCam);
      renderer.setRenderTarget(null); quad.material = aaMat;
      renderer.render(qScene, qCam);
    },
  };
}
