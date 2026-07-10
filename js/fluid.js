/* Liquid hover — compact WebGL2 stable-fluids sim.
   Pointer movement injects amber/ember dye + velocity; dye advects,
   diffuses out, and is drawn over the page with screen blending.
   Degrades to nothing if WebGL2/float buffers are unavailable. */
(() => {
  const canvas = document.getElementById('fluid');
  if (!canvas) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const gl = canvas.getContext('webgl2', { alpha: true, depth: false, stencil: false, antialias: false });
  if (!gl || !gl.getExtension('EXT_color_buffer_float')) return;

  const SIM = 128;          // velocity/pressure grid
  const DYE = 512;          // dye resolution
  const PRESSURE_ITERS = 18;
  const VEL_DISS = 0.990;
  const DYE_DISS = 0.955;
  const SPLAT_RADIUS = 0.0055;

  const VERT = `#version 300 es
  precision highp float;
  out vec2 uv;
  void main(){
    vec2 p = vec2((gl_VertexID<<1 & 2), (gl_VertexID & 2));
    uv = p; gl_Position = vec4(p*2.-1., 0., 1.);
  }`;

  const frag = (src) => `#version 300 es
  precision highp float; precision highp sampler2D;
  in vec2 uv; out vec4 o;
  uniform sampler2D uA, uB;
  uniform vec2 texel;
  ${src}`;

  const SHADERS = {
    splat: frag(`
      uniform vec2 point; uniform vec3 color; uniform float radius; uniform float aspect;
      void main(){
        vec2 d = uv - point; d.x *= aspect;
        vec3 base = texture(uA, uv).xyz;
        o = vec4(base + color * exp(-dot(d,d)/radius), 1.);
      }`),
    advect: frag(`
      uniform float dt; uniform float diss;
      void main(){
        vec2 vel = texture(uB, uv).xy;
        vec2 back = uv - dt * vel * texel;
        o = vec4(texture(uA, back).xyz * diss, 1.);
      }`),
    divergence: frag(`
      void main(){
        float l = texture(uA, uv - vec2(texel.x,0.)).x;
        float r = texture(uA, uv + vec2(texel.x,0.)).x;
        float b = texture(uA, uv - vec2(0.,texel.y)).y;
        float t = texture(uA, uv + vec2(0.,texel.y)).y;
        o = vec4(0.5*(r-l+t-b), 0., 0., 1.);
      }`),
    pressure: frag(`
      void main(){
        float l = texture(uA, uv - vec2(texel.x,0.)).x;
        float r = texture(uA, uv + vec2(texel.x,0.)).x;
        float b = texture(uA, uv - vec2(0.,texel.y)).x;
        float t = texture(uA, uv + vec2(0.,texel.y)).x;
        float div = texture(uB, uv).x;
        o = vec4((l+r+b+t-div)*0.25, 0., 0., 1.);
      }`),
    gradient: frag(`
      void main(){
        float l = texture(uA, uv - vec2(texel.x,0.)).x;
        float r = texture(uA, uv + vec2(texel.x,0.)).x;
        float b = texture(uA, uv - vec2(0.,texel.y)).x;
        float t = texture(uA, uv + vec2(0.,texel.y)).x;
        vec2 vel = texture(uB, uv).xy - 0.5*vec2(r-l, t-b);
        o = vec4(vel, 0., 1.);
      }`),
    display: frag(`
      void main(){
        vec3 c = texture(uA, uv).rgb;
        float a = clamp(max(c.r, max(c.g, c.b)) * 1.15, 0., 1.);
        o = vec4(c, a);
      }`),
  };

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw gl.getShaderInfoLog(s);
    return s;
  }
  const vs = compile(gl.VERTEX_SHADER, VERT);
  const progs = {};
  for (const [name, src] of Object.entries(SHADERS)) {
    const p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, src));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw gl.getProgramInfoLog(p);
    progs[name] = { p, u: {} };
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      progs[name].u[info.name] = gl.getUniformLocation(p, info.name);
    }
  }

  function fbo(w, h) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex, fb, w, h };
  }
  function pair(w, h) {
    let a = fbo(w, h), b = fbo(w, h);
    return { get read() { return a; }, get write() { return b; }, swap() { [a, b] = [b, a]; } };
  }

  const vel = pair(SIM, SIM);
  const dye = pair(DYE, DYE);
  const prs = pair(SIM, SIM);
  const div = fbo(SIM, SIM);

  function run(name, target, binds, set) {
    const { p, u } = progs[name];
    gl.useProgram(p);
    binds.forEach((tex, i) => {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, tex);
    });
    if (u.uA) gl.uniform1i(u.uA, 0);
    if (u.uB) gl.uniform1i(u.uB, 1);
    if (set) set(u);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
    gl.viewport(0, 0, target ? target.w : canvas.width, target ? target.h : canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // pointer -> splat queue (white smoke, like chalk over the red)
  const splats = [];
  let px = -1, py = -1;
  addEventListener('pointermove', (e) => {
    const x = e.clientX / innerWidth, y = 1 - e.clientY / innerHeight;
    if (px < 0) { px = x; py = y; }
    const dx = x - px, dy = y - py;
    if (Math.abs(dx) + Math.abs(dy) > 0.0005) {
      const speed = Math.min(Math.hypot(dx, dy) * 22, 1);
      const w = (0.62 + Math.random() * 0.2) * speed;
      splats.push({ x, y, dx: dx * 900, dy: dy * 900, c: [w, w * 0.98, w * 0.94] });
    }
    px = x; py = y;
  }, { passive: true });

  function resize() {
    const scale = Math.min(devicePixelRatio || 1, 2) * 0.75;
    canvas.width = Math.max(2, innerWidth * scale | 0);
    canvas.height = Math.max(2, innerHeight * scale | 0);
  }
  addEventListener('resize', resize, { passive: true });
  resize();

  let last = performance.now();
  let visible = true;
  document.addEventListener('visibilitychange', () => { visible = !document.hidden; });

  function frame(now) {
    requestAnimationFrame(frame);
    if (!visible) return;
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    const aspect = innerWidth / innerHeight;

    while (splats.length) {
      const s = splats.pop();
      run('splat', vel.write, [vel.read.tex], (u) => {
        gl.uniform2f(u.point, s.x, s.y);
        gl.uniform3f(u.color, s.dx, s.dy, 0);
        gl.uniform1f(u.radius, SPLAT_RADIUS * 4);
        gl.uniform1f(u.aspect, aspect);
      });
      vel.swap();
      run('splat', dye.write, [dye.read.tex], (u) => {
        gl.uniform2f(u.point, s.x, s.y);
        gl.uniform3f(u.color, ...s.c);
        gl.uniform1f(u.radius, SPLAT_RADIUS);
        gl.uniform1f(u.aspect, aspect);
      });
      dye.swap();
    }

    const simTexel = [1 / SIM, 1 / SIM];
    run('advect', vel.write, [vel.read.tex, vel.read.tex], (u) => {
      gl.uniform2f(u.texel, ...simTexel);
      gl.uniform1f(u.dt, dt * SIM);
      gl.uniform1f(u.diss, VEL_DISS);
    });
    vel.swap();

    run('divergence', div, [vel.read.tex], (u) => gl.uniform2f(u.texel, ...simTexel));
    for (let i = 0; i < PRESSURE_ITERS; i++) {
      run('pressure', prs.write, [prs.read.tex, div.tex], (u) => gl.uniform2f(u.texel, ...simTexel));
      prs.swap();
    }
    run('gradient', vel.write, [prs.read.tex, vel.read.tex], (u) => gl.uniform2f(u.texel, ...simTexel));
    vel.swap();

    run('advect', dye.write, [dye.read.tex, vel.read.tex], (u) => {
      gl.uniform2f(u.texel, 1 / DYE, 1 / DYE);
      gl.uniform1f(u.dt, dt * DYE);
      gl.uniform1f(u.diss, DYE_DISS);
    });
    dye.swap();

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    run('display', null, [dye.read.tex]);
  }
  requestAnimationFrame(frame);
})();
