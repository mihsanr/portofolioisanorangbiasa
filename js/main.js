/* Rows + scramble hover, magnetic floating preview, journey render,
   scroll background transition, CRT barrel frame, TV preloader,
   custom cursor, grain, project modal. */
(() => {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const BLUE = [0, 0, 255], PAPER = [244, 242, 238]; // BLUE = fallback if theme.js is missing

  /* ================= PRELOADER ================= */
  const pre = document.getElementById('preloader');
  const fill = document.getElementById('tvFill');
  function endPre() {
    if (!pre || pre.classList.contains('loaded')) return;
    pre.classList.add('loaded');
    setTimeout(() => pre.remove(), 700);
  }
  // once per tab session, never in front of a deep-linked tape, max ~1.2s
  const deepTape = /^#tape\/[\w-]+/.test(location.hash);
  let seen = false;
  try { seen = sessionStorage.getItem('ihsan.pre') === '1'; sessionStorage.setItem('ihsan.pre', '1'); } catch (e) { /* storage blocked */ }
  if (reduceMotion || !pre || seen || deepTape) { pre && pre.remove(); }
  else {
    let p = 0;
    const iv = setInterval(() => {
      p = Math.min(100, p + 8 + Math.random() * 16);
      fill.style.width = p.toFixed(0) + '%';
      if (p >= 100) { clearInterval(iv); setTimeout(endPre, 180); }
    }, 70);
    pre.addEventListener('click', endPre);
    addEventListener('keydown', endPre, { once: true });
    setTimeout(endPre, 1200); // hard cap
  }

  /* ================= CRT BARREL FRAME ================= */
  /* Clip paths use objectBoundingBox units so they stretch together with the
     fixed layers when a mobile URL bar hides/shows mid-scroll. A pixel path()
     stays at the old height until `resize` fires, leaving a bare strip. */
  const frame = document.getElementById('crtFrame');
  const bevel = document.getElementById('crtBevel');
  const strokeSvg = document.getElementById('crtStroke');
  const SVGNS = 'http://www.w3.org/2000/svg';
  const clipDefs = document.createElementNS(SVGNS, 'svg');
  clipDefs.setAttribute('width', '0');
  clipDefs.setAttribute('height', '0');
  clipDefs.setAttribute('aria-hidden', 'true');
  clipDefs.style.position = 'absolute';
  clipDefs.innerHTML =
    '<clipPath id="crtClipFrame" clipPathUnits="objectBoundingBox"><path clip-rule="evenodd"/></clipPath>' +
    '<clipPath id="crtClipInner" clipPathUnits="objectBoundingBox"><path/></clipPath>';
  document.body.appendChild(clipDefs);
  const [clipFrame, clipInner] = clipDefs.querySelectorAll('path');
  const strokePath = document.createElementNS(SVGNS, 'path');
  strokePath.setAttribute('fill', 'none');
  strokePath.setAttribute('stroke', 'rgba(30,28,26,0.10)');
  strokePath.setAttribute('stroke-width', '6');
  strokePath.setAttribute('vector-effect', 'non-scaling-stroke');
  function barrel() {
    const W = innerWidth, H = innerHeight, m = W <= 768 || H <= 500;
    if (!W || !H) return; // hidden tab / not laid out yet
    const MC = m ? 12 : 38;              // corner inset
    const MM = m ? 4 : 8;                // mid-edge inset (barrel bulge)
    const R = m ? Math.min(Math.max(18, W * 0.03), 28)
                : Math.min(Math.max(40, W * 0.042), 70); // corner radius
    const p = (x, y) => `${(x / W).toFixed(5)},${(y / H).toFixed(5)}`;
    const inner =
      `M ${p(MC + R, MC)} Q ${p(W / 2, MM)} ${p(W - MC - R, MC)}` +
      ` Q ${p(W - MC, MC)} ${p(W - MC, MC + R)} Q ${p(W - MM, H / 2)} ${p(W - MC, H - MC - R)}` +
      ` Q ${p(W - MC, H - MC)} ${p(W - MC - R, H - MC)} Q ${p(W / 2, H - MM)} ${p(MC + R, H - MC)}` +
      ` Q ${p(MC, H - MC)} ${p(MC, H - MC - R)} Q ${p(MM, H / 2)} ${p(MC, MC + R)}` +
      ` Q ${p(MC, MC)} ${p(MC + R, MC)} Z`;
    clipFrame.setAttribute('d', `M 0,0 L 1,0 L 1,1 L 0,1 Z ${inner}`);
    clipInner.setAttribute('d', inner);
    frame.style.clipPath = 'url(#crtClipFrame)';
    frame.style.visibility = 'visible';
    bevel.style.clipPath = 'url(#crtClipInner)';
    strokeSvg.setAttribute('viewBox', '0 0 1 1');
    strokeSvg.setAttribute('preserveAspectRatio', 'none');
    strokeSvg.style.clipPath = 'url(#crtClipInner)';
    strokePath.setAttribute('d', inner);
    if (!strokePath.parentNode) strokeSvg.appendChild(strokePath);
  }
  barrel();
  addEventListener('resize', barrel, { passive: true });

  /* ================= SCRAMBLE ================= */
  const POOL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#/\\<>*0123456789';
  function scramble(el) {
    if (el.dataset.scrambling) return;
    const orig = el.dataset.orig || (el.dataset.orig = el.textContent);
    el.dataset.scrambling = '1';
    const steps = 12;
    let n = 0;
    const iv = setInterval(() => {
      n++;
      const reveal = Math.floor((n / steps) * orig.length);
      let out = '';
      for (let i = 0; i < orig.length; i++) {
        const c = orig[i];
        out += (i < reveal || c === ' ') ? c : POOL[(Math.random() * POOL.length) | 0];
      }
      el.textContent = out;
      if (n >= steps) { clearInterval(iv); el.textContent = orig; delete el.dataset.scrambling; }
    }, 34);
  }

  /* ================= PROJECT ROWS ================= */
  const list = document.getElementById('projectsList');
  const coverSrc = (p) => p.cover.startsWith('video:')
    ? `assets/video/${p.cover.slice(6)}.webp`
    : `assets/img/${p.cover}.webp`;
  // 4 small thumbs per channel row (tapes first, then images) — visible on phones too
  const hasThumb = (s) => typeof TAPES !== 'undefined' && TAPES.some((t) => t.s === s);
  const stripOf = (p) => {
    const out = [];
    for (const m of p.media) {
      if (out.length >= 4) break;
      if (m.t === 'v') out.push(hasThumb(m.s) ? `assets/video/thumb/${m.s}.webp` : `assets/video/${m.s}.webp`);
    }
    for (const m of p.media) {
      if (out.length >= 4) break;
      if (m.t === 'i' && MEDIA[m.s]) out.push(`assets/img/${m.s}.webp`);
    }
    return out;
  };

  PROJECTS.forEach((p, i) => {
    const li = document.createElement('li');
    li.className = 'project-row';
    li.innerHTML = `
      <button class="project-row-head" data-idx="${i}" aria-haspopup="dialog">
        <span class="project-row-nr">${String(i + 1).padStart(2, '0')}</span>
        <span class="project-row-title">${p.title}</span>
        <span class="project-row-strip" aria-hidden="true">${stripOf(p).map((src) => `<img src="${src}" alt="" loading="lazy" decoding="async">`).join('')}</span>
        <span class="project-row-cat">${p.cat}</span>
        <span class="project-row-year">${p.year}</span>
      </button>
      <div class="project-row-body"><div class="project-row-body-inner">
        <div class="project-tags">${p.tags.map((t) => `<span class="project-tag">${t}</span>`).join('')}</div>
      </div></div>`;
    list.appendChild(li);
  });

  /* ================= MAGNETIC IMAGE ================= */
  const mag = document.getElementById('magneticImg');
  const magEl = document.getElementById('magneticEl');
  const magGlare = document.getElementById('magneticGlare');
  let mx = -300, my = -300, vx = 0, vy = 0, lastX = -300, lastY = -300;
  let imgX = -500, imgY = -500, rot = 0;
  let magOn = false;

  // capture: element handlers (Wall hover → cursor chip) already see the fresh position
  addEventListener('pointermove', (e) => { mx = e.clientX; my = e.clientY; }, { passive: true, capture: true });

  function magLoop() {
    requestAnimationFrame(magLoop);
    vx = mx - lastX; vy = my - lastY; lastX = mx; lastY = my;
    if (!magOn && Math.abs(imgX + 500) < 1) return;
    const w = mag.offsetWidth, h = mag.offsetHeight;
    const tx = mx - w * 0.5, ty = my - h * 0.55;
    imgX += (tx - imgX) * 0.12;
    imgY += (ty - imgY) * 0.12;
    const targetRot = Math.max(-12, Math.min(12, vx * 0.55));
    rot += (targetRot - rot) * 0.10;
    const tiltX = Math.max(-8, Math.min(8, -vy * 0.35));
    const tiltY = Math.max(-8, Math.min(8, vx * 0.35));
    mag.style.transform =
      `translate(${imgX.toFixed(1)}px, ${imgY.toFixed(1)}px) rotate(${rot.toFixed(2)}deg)` +
      ` perspective(600px) rotateX(${tiltX.toFixed(2)}deg) rotateY(${tiltY.toFixed(2)}deg)`;
    const gx = 50 + tiltY * 4, gy = 50 - tiltX * 4;
    magGlare.style.background =
      `radial-gradient(circle at ${gx.toFixed(0)}% ${gy.toFixed(0)}%, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.06) 45%, transparent 70%)`;
  }
  if (finePointer && !reduceMotion) magLoop();

  function magShow(src) {
    magOn = true;
    mag.classList.add('is-visible');
    if (magEl.getAttribute('src') !== src) {
      magEl.classList.add('is-changing');
      setTimeout(() => {
        magEl.src = src;
        magEl.onload = () => magEl.classList.remove('is-changing');
        magEl.onerror = () => magEl.classList.remove('is-changing');
      }, 120);
    }
  }
  function magHide() { magOn = false; mag.classList.remove('is-visible'); stopCycle(); }

  /* hover preview flips through every item of the channel, one every 0.5s.
     Videos show their poster frame; a frame only swaps in once it has loaded. */
  const CYCLE_MS = 500;
  const previews = PROJECTS.map((p) => {
    const out = [coverSrc(p)];
    for (const m of p.media) {
      const src = m.t === 'i' ? (MEDIA[m.s] && `assets/img/${m.s}.webp`)
        : m.t === 'v' ? `assets/video/${m.s}.webp`
        : m.t === 'd' ? (MEDIA[m.cover] && `assets/img/${m.cover}.webp`)
        : null;
      if (src && !out.includes(src)) out.push(src);
    }
    return out;
  });
  const preCache = new Map();
  function preload(src) {
    let im = preCache.get(src);
    if (!im) { im = new Image(); im.decoding = 'async'; im.src = src; preCache.set(src, im); }
    return im;
  }
  let cycleTimer = 0;
  function stopCycle() { clearInterval(cycleTimer); cycleTimer = 0; }
  function startCycle(i) {
    stopCycle();
    const srcs = previews[i];
    if (srcs.length < 2) return;
    let at = 0;
    preload(srcs[1]);
    cycleTimer = setInterval(() => {
      const next = (at + 1) % srcs.length;
      const im = preload(srcs[next]);
      if (!im.complete) return;       // still loading — hold the current frame
      at = next;
      preload(srcs[(next + 1) % srcs.length]);
      if (!im.naturalWidth) return;   // broken file — skip it
      magEl.classList.remove('is-changing');
      magEl.src = srcs[next];         // hard cut, like flipping channels
    }, CYCLE_MS);
  }

  /* row hover: activate + magnetic + scramble */
  let activeRow = null;
  list.addEventListener('pointerover', (e) => {
    const head = e.target.closest('.project-row-head');
    if (!head) return;
    const row = head.parentElement;
    if (row === activeRow) return;
    if (activeRow) activeRow.classList.remove('is-active');
    activeRow = row;
    row.classList.add('is-active');
    if (finePointer && !reduceMotion) {
      magShow(coverSrc(PROJECTS[head.dataset.idx]));
      startCycle(+head.dataset.idx);
      scramble(head.querySelector('.project-row-title'));
    }
  });
  list.addEventListener('pointerleave', () => {
    if (activeRow) activeRow.classList.remove('is-active');
    activeRow = null;
    magHide();
  });

  /* ================= CURSOR CHIP ================= */
  /* Small VT323 box trailing the cursor with a running label ("▶ PUTAR · Tokamak").
     Desktop only; shown over clickable work, hidden while dragging the Wall. */
  const chip = (() => {
    if (!finePointer || reduceMotion) return { show() {}, hide() {} };
    const el = document.createElement('div');
    el.className = 'cursor-chip';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<span class="cursor-chip-track"><span></span><span></span></span>';
    document.body.appendChild(el);
    const parts = el.querySelectorAll('.cursor-chip-track span');
    let x = -400, y = -400, on = false, text = '', raf = 0, offAt = 0;
    function follow(now) {
      x += (mx - x) * 0.14; y += (my - y) * 0.14;
      el.style.transform = `translate(${(x + 20).toFixed(1)}px, ${(y + 24).toFixed(1)}px)`;
      raf = on || now < offAt ? requestAnimationFrame(follow) : 0;
    }
    return {
      show(t) {
        if (t !== text) { text = t; parts.forEach((p) => { p.textContent = `${t}  ·  `; }); }
        if (!on) {
          on = true;
          if (!raf) { x = mx; y = my; raf = requestAnimationFrame(follow); }
          el.classList.add('on');
        }
      },
      hide() { if (!on) return; on = false; offAt = performance.now() + 250; el.classList.remove('on'); },
    };
  })();
  list.addEventListener('pointerover', (e) => { if (e.target.closest('.project-row-head')) chip.show('BUKA CHANNEL →'); });
  list.addEventListener('pointerleave', () => chip.hide());

  /* ================= CLIENTS MARQUEE ================= */
  /* Endless strip that follows the scroll: scrolling down runs it left, up runs it
     right, and a fast scroll gives it a short push. Reduced motion: static row. */
  const track = document.getElementById('clientsTrack');
  const names = CLIENTS.map((c) => `<span class="client-name">${c}</span>`).join('');
  track.innerHTML = names + names;
  if (!reduceMotion) {
    track.classList.add('is-js'); // the CSS keyframes step aside
    const BASE = 0.07; // px per ms
    let x = 0, dir = -1, boost = 0, half = 0, seen = false, held = false, lastY = scrollY, then = 0;
    const measure = () => { half = track.scrollWidth / 2; };
    measure();
    addEventListener('resize', measure, { passive: true });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
    new IntersectionObserver(([en]) => { seen = en.isIntersecting; }).observe(track.parentElement);
    track.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') held = true; });
    track.addEventListener('pointerleave', () => { held = false; });
    addEventListener('scroll', () => {
      const dy = scrollY - lastY; lastY = scrollY;
      if (!dy) return;
      dir = dy > 0 ? -1 : 1;
      boost = Math.min(7, boost + Math.abs(dy) * 0.05);
    }, { passive: true });
    (function run(now) {
      requestAnimationFrame(run);
      const dt = Math.min(64, now - then); then = now;
      boost *= Math.pow(0.92, dt / 16.667);
      if (!seen || !half || held) return;
      x += dir * BASE * (1 + boost) * dt;
      x = ((x % half) - half) % half; // keep inside (-half, 0]
      track.style.transform = `translate3d(${x.toFixed(1)}px, 0, 0)`;
    })(0);
  }

  /* ================= JOURNEY ================= */
  const jList = document.getElementById('journeyList');
  JOURNEY.forEach((j, i) => {
    const li = document.createElement('li');
    li.className = 'journey-entry';
    li.innerHTML = `
      <div class="journey-entry-head">
        <span class="journey-nr">${String(i + 1).padStart(2, '0')}</span>
        <h3 class="journey-company">${j.company}</h3>
        <span class="journey-cat">${j.cat}</span>
        <span class="journey-period">${j.period}</span>
      </div>
      <div class="journey-entry-body">
        <span class="journey-role">${j.role}</span>
        <p class="journey-desc">${j.desc}</p>
      </div>`;
    jList.appendChild(li);
  });
  jList.addEventListener('pointerover', (e) => {
    const c = e.target.closest('.journey-company');
    if (c && finePointer && !reduceMotion) scramble(c);
  });

  /* skills */
  const tags = document.getElementById('skillsTags');
  SKILLS.forEach((s, i) => {
    const el = document.createElement('span');
    el.className = 'skill-tag';
    el.style.setProperty('--del', `${i * 0.05}s`);
    el.textContent = s;
    tags.appendChild(el);
  });

  /* reveal on scroll */
  const io = new IntersectionObserver((ens) => {
    ens.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add('is-visible'); io.unobserve(en.target); }
    });
  }, { rootMargin: '0px 0px -10% 0px' });
  document.querySelectorAll('.journey-entry, .journey-skills').forEach((el) => io.observe(el));
  setTimeout(() => document.querySelectorAll('.journey-entry, .journey-skills')
    .forEach((el) => el.classList.add('is-visible')), 3000); // failsafe

  /* ================= SCROLL: nav + bg transition ================= */
  const nav = document.getElementById('siteNav');
  const bgmBar = document.getElementById('bgmBar');
  const journey = document.getElementById('journey');
  const lerp3 = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  function onScroll() {
    nav.classList.toggle('is-scrolled', scrollY > 8);
    if (bgmBar) bgmBar.classList.toggle('is-scrolled', scrollY > 8);
    const r = journey.getBoundingClientRect();
    const vh = innerHeight;
    // 0 while journey below viewport → 1 once its top passes 25% of screen
    const t = Math.min(1, Math.max(0, (vh * 0.85 - r.top) / (vh * 0.60)));
    const c = lerp3(window.BRAND_RGB || BLUE, PAPER, t);
    document.body.style.backgroundColor = `rgb(${c[0]},${c[1]},${c[2]})`;
    document.body.classList.toggle('on-light', t > 0.5);
  }
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll, { passive: true });
  addEventListener('brandchange', onScroll); // click-to-recolour (theme.js)
  onScroll();

  /* ================= MODAL ================= */
  const modal = document.getElementById('tvModal');
  const tvCh = document.getElementById('tvCh');
  const tvTitle = document.getElementById('tvTitle');
  const tvDesc = document.getElementById('tvDesc');
  const tvGallery = document.getElementById('tvGallery');

  function openChannel(i) {
    const p = PROJECTS[i];
    tvCh.textContent = `CH ${String(i + 1).padStart(2, '0')}`;
    tvTitle.textContent = p.title;
    tvDesc.textContent = p.desc;
    tvGallery.innerHTML = '';
    let tape = 0;
    for (const m of p.media) {
      const item = document.createElement('div');
      item.className = 'tv-item';
      if (m.t === 'i') {
        const d = MEDIA[m.s];
        if (!d) continue;
        const img = new Image();
        img.src = `assets/img/${m.s}.webp`;
        img.width = d.w; img.height = d.h;
        img.loading = 'lazy'; img.decoding = 'async';
        img.alt = `${p.title} — design work`;
        img.style.backgroundImage = `url("${d.lqip}")`;
        img.style.aspectRatio = `${d.w} / ${d.h}`;
        const ready = () => img.classList.add('ready');
        img.complete ? ready() : img.addEventListener('load', ready);
        item.appendChild(img);
      } else if (m.t === 'd') {
        const d = MEDIA[m.cover];
        const a = document.createElement('a');
        a.className = 'tv-doc';
        a.href = `assets/docs/${m.doc}.pdf`;
        a.target = '_blank'; a.rel = 'noopener';
        a.innerHTML = `
          ${d ? `<img src="assets/img/${m.cover}.webp" width="${d.w}" height="${d.h}" loading="lazy" alt="${m.label} cover">` : ''}
          <span class="tv-doc-bar">
            <span class="tv-doc-name">${m.label}</span>
            <span class="tv-doc-open">PDF · ${m.pages} PAGES · OPEN ↗&#xFE0E;</span>
          </span>`;
        item.appendChild(a);
        tvGallery.appendChild(item);
        continue;
      } else {
        tape++;
        // tapes open in the Viewer (sound, teletext, channel zapping)
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'tv-tape';
        b.dataset.tape = m.s;
        b.setAttribute('aria-label', `Putar ${p.title} — ${m.label}`);
        b.innerHTML = `<img src="assets/video/${m.s}.webp" alt="" loading="lazy" decoding="async"><span class="tv-tape-play">▶ PLAY</span>`;
        const tag = document.createElement('span');
        tag.className = 'tape-label';
        tag.textContent = `▶ TAPE ${String(tape).padStart(2, '0')} · ${m.label}`;
        item.append(b, tag);
      }
      tvGallery.appendChild(item);
    }
    modal.showModal();
    modal.scrollTop = 0;
    magHide();
  }

  list.addEventListener('click', (e) => {
    const head = e.target.closest('.project-row-head');
    if (head) openChannel(+head.dataset.idx);
  });
  tvGallery.addEventListener('click', (e) => {
    const b = e.target.closest('.tv-tape');
    if (b && window.Viewer) window.Viewer.open(b.dataset.tape, { trigger: b });
  });
  document.getElementById('tvClose').addEventListener('click', () => modal.close());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.close(); });
  modal.addEventListener('close', () => {
    tvGallery.querySelectorAll('video').forEach((v) => v.pause());
  });

  /* ================= PROFILE CARD ================= */
  const faceCard = document.getElementById('faceCard');
  const faceModal = document.getElementById('faceModal');
  if (faceCard && faceModal) {
    faceCard.addEventListener('click', () => {
      faceModal.showModal();
      faceModal.scrollTop = 0;
      magHide();
    });
    document.getElementById('faceClose').addEventListener('click', () => faceModal.close());
    faceModal.addEventListener('click', (e) => { if (e.target === faceModal) faceModal.close(); });
  }

  /* ================= CURSOR ================= */
  if (finePointer) {
    const dot = document.getElementById('cursorDot');
    const ring = document.getElementById('cursorRing');
    const cur = dot.closest('.cursor');
    let rx = -200, ry = -200;
    addEventListener('pointermove', (e) => {
      dot.style.left = e.clientX + 'px';
      dot.style.top = e.clientY + 'px';
      const t = e.target;
      cur.classList.toggle('grow',
        !!(t.closest && t.closest('a, button, .project-row-head, video, .wall')));
    }, { passive: true });
    (function follow() {
      rx += (mx - rx) * 0.16; ry += (my - ry) * 0.16;
      ring.style.left = rx + 'px';
      ring.style.top = ry + 'px';
      requestAnimationFrame(follow);
    })();
  } else {
    document.body.style.cursor = 'auto';
  }

  /* ================= GRAIN ================= */
  const grain = document.getElementById('grain');
  if (!reduceMotion && grain) {
    const g = grain.getContext('2d', { alpha: true });
    let buf;
    function sizeGrain() {
      grain.width = Math.max(2, innerWidth / 3 | 0);
      grain.height = Math.max(2, innerHeight / 3 | 0);
      buf = g.createImageData(grain.width, grain.height);
    }
    sizeGrain();
    addEventListener('resize', sizeGrain, { passive: true });
    let then = 0;
    (function noise(now) {
      requestAnimationFrame(noise);
      if (now - then < 80) return;
      then = now;
      const d = buf.data;
      for (let i = 0; i < d.length; i += 4) {
        d[i] = d[i + 1] = d[i + 2] = (Math.random() * 255) | 0;
        d[i + 3] = 255;
      }
      g.putImageData(buf, 0, 0);
    })(0);
  }

  /* ================= BUTTONS: icon hops to the other side ================= */
  document.querySelectorAll('.hero-btn, .cv-btn, .contact-btn').forEach((b) => {
    const m = b.textContent.trim().match(/^(.*?)\s*([↓↗→▶])︎?$/u);
    if (!m) return;
    const ico = `${m[2]}︎`;
    b.classList.add('btn-swap');
    b.innerHTML = '<span class="btn-swap-in"><span class="btn-ico btn-ico--in" aria-hidden="true"></span>' +
      '<span class="btn-label"></span><span class="btn-ico btn-ico--out" aria-hidden="true"></span></span>';
    b.querySelector('.btn-label').textContent = m[1];
    b.querySelectorAll('.btn-ico').forEach((i) => { i.textContent = ico; });
  });

  /* ================= HEADLINES THAT REACT TO THE CURSOR ================= */
  /* [data-react] headings are split per letter; letters near the cursor cross-fade
     from Barlow Condensed to VT323 ("kena sinyal") — <em> words go the other way.
     The heading keeps its full text in aria-label; the letters are aria-hidden.
     Touch: one sweep when the heading scrolls in. Reduced motion: untouched. */
  if (!reduceMotion) {
    const RADIUS = 240;
    const groups = [];
    document.querySelectorAll('[data-react]').forEach((el) => {
      const label = el.textContent.replace(/\s+/g, ' ').trim();
      const chars = [];
      const frag = document.createDocumentFragment();
      const addWord = (word, alt) => {
        const w = document.createElement('span');
        w.className = alt ? 'rc-word rc-alt' : 'rc-word';
        for (const ch of word) {
          const c = document.createElement('span'); c.className = 'rc';
          const a = document.createElement('span'); a.className = 'rc-a'; a.textContent = ch;
          const b = document.createElement('span'); b.className = 'rc-b'; b.textContent = ch;
          c.append(a, b); w.appendChild(c);
          chars.push({ el: c, cur: 0, last: 0 });
        }
        frag.appendChild(w);
      };
      el.childNodes.forEach((n) => {
        const alt = n.nodeType === 1 && n.tagName === 'EM';
        if (n.nodeType !== 3 && !alt) return;
        n.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) frag.appendChild(document.createTextNode(' ')); else addWord(part, alt);
        });
      });
      const inner = document.createElement('span');
      inner.setAttribute('aria-hidden', 'true');
      inner.appendChild(frag);
      el.setAttribute('aria-label', label);
      el.replaceChildren(inner);
      el.classList.add('is-react');
      groups.push({ el, chars, seen: false, sweep: 0, swept: false });
    });
    let px = -9999, py = -9999, raf = 0;
    function tick(now) {
      raf = 0;
      let busy = false;
      for (const g of groups) {
        if (!g.seen && !g.chars.some((c) => c.cur)) continue;
        let sx = px, sy = py;
        if (g.sweep) { // one-off scan line on touch screens
          const r = g.el.getBoundingClientRect(), t = (now - g.sweep) / 900;
          if (t >= 1) { g.sweep = 0; sx = sy = -9999; }
          else { sx = r.left - RADIUS + (r.width + RADIUS * 2) * t; sy = r.top + r.height / 2; busy = true; }
        }
        for (const c of g.chars) {
          let want = 0;
          if (g.seen && sx > -9000) {
            const r = c.el.getBoundingClientRect();
            const d = Math.hypot(sx - (r.left + r.width / 2), sy - (r.top + r.height / 2));
            want = Math.max(0, 1 - d / RADIUS);
            want = want * want * (3 - 2 * want);
          }
          c.cur += (want - c.cur) * 0.2;
          if (Math.abs(want - c.cur) < 0.004) c.cur = want; else busy = true;
          if (c.cur !== c.last) { c.el.style.setProperty('--hit', c.cur.toFixed(3)); c.last = c.cur; }
        }
      }
      if (busy) raf = requestAnimationFrame(tick);
    }
    const wake = () => { if (!raf) raf = requestAnimationFrame(tick); };
    const rio = new IntersectionObserver((ens) => ens.forEach((en) => {
      const g = groups.find((x) => x.el === en.target);
      g.seen = en.isIntersecting;
      if (g.seen && !finePointer && !g.swept) { g.swept = true; g.sweep = performance.now(); }
      wake();
    }), { threshold: 0.35 });
    groups.forEach((g) => rio.observe(g.el));
    if (finePointer) {
      addEventListener('pointermove', (e) => { px = e.clientX; py = e.clientY; wake(); }, { passive: true });
      addEventListener('scroll', wake, { passive: true });
      document.documentElement.addEventListener('pointerleave', () => { px = py = -9999; wake(); });
    }
  }

  /* ================= PRIME TIME (curated cases, stacked cards) ================= */
  const primeStack = document.getElementById('primeStack');
  if (primeStack && typeof PRIME !== 'undefined') {
    const tapeOf = (s) => (typeof TAPES !== 'undefined' ? TAPES.find((t) => t.s === s) : null);
    const wallOf = (s) => (typeof WALL !== 'undefined' ? WALL.find((t) => t.s === s) : null);
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    const cards = PRIME.map((c) => ({ c, tape: tapeOf(c.s), still: MEDIA[c.s] })).filter((x) => x.tape || x.still);
    cards.forEach(({ c, tape, still }, i) => {
      const w = wallOf(c.s);
      const ch = tape ? tape.ch : (w ? w.ch : 0);
      const p = PROJECTS[ch - 1];
      const li = document.createElement('li');
      li.className = 'prime-card';
      li.style.setProperty('--c', c.color || '#fff');
      li.style.setProperty('--i', i);
      const ar = tape ? ({ '9:16': 0.5625, '4:5': 0.8, '1:1': 1, '16:9': 1.7778 }[tape.r] || 1) : still.w / still.h;
      const snip = tape && w; // only Wall tapes have a snippet
      const media = tape
        ? `<video muted loop playsinline preload="none" disableremoteplayback data-no-duck
             poster="${snip ? `assets/video/snip/${c.s}.webp` : `assets/video/thumb/${c.s}.webp`}"${snip ? ` data-src="assets/video/snip/${c.s}.mp4"` : ''}></video>`
        : `<img src="assets/img/${c.s}.webp" alt="" loading="lazy" decoding="async" width="${still.w}" height="${still.h}">`;
      li.innerHTML = `
        <button type="button" class="prime-open" data-tape="${esc(c.s)}" aria-label="Buka ${esc(c.title)}">
          <span class="prime-media" style="--ar:${ar.toFixed(4)}">${media}</span>
          <span class="prime-info">
            <span class="prime-nr">${String(i + 1).padStart(2, '0')} / ${String(cards.length).padStart(2, '0')}${p ? ` · ${esc(p.title)}` : ''}</span>
            <span class="prime-name">${esc(c.title)}</span>
            <span class="prime-role">${esc(c.role || (tape && tape.role && tape.role.join(' · ')) || (p ? p.cat : ''))}</span>
            <span class="prime-btn">${tape ? '▶︎ BUKA' : '▣ BUKA'}</span>
          </span>
        </button>`;
      li.querySelector('.prime-open').dataset.title = c.title;
      primeStack.appendChild(li);
    });
    primeStack.addEventListener('click', (e) => {
      const b = e.target.closest('.prime-open');
      if (b && window.Viewer) Viewer.open(b.dataset.tape, { trigger: b });
    });
    primeStack.addEventListener('pointerover', (e) => {
      const b = e.target.closest('.prime-open');
      if (b) chip.show(`BUKA · ${b.dataset.title} →`);
    });
    primeStack.addEventListener('pointerleave', () => chip.hide());
    // snippets play only while their card is on screen (never with reduced motion / data saver)
    const lite = reduceMotion || !!(navigator.connection && navigator.connection.saveData);
    if (!lite) {
      const vio = new IntersectionObserver((ens) => ens.forEach((en) => {
        const v = en.target;
        if (en.isIntersecting) {
          if (!v.src && v.dataset.src) v.src = v.dataset.src;
          if (v.src) v.play().catch(() => {});
        } else if (!v.paused) v.pause();
      }), { threshold: 0.5 });
      primeStack.querySelectorAll('video').forEach((v) => vio.observe(v));
      addEventListener('viewer:open', () => primeStack.querySelectorAll('video').forEach((v) => v.pause()));
    }
  }

  /* ================= FOOTER CTA: sticker trail ================= */
  /* Desktop: a sticker drops every ~120px of cursor travel, fades after 0.8s,
     max 8 alive. Touch / reduced motion keep the three static stickers (CSS). */
  const cta = document.querySelector('.cta');
  if (cta && finePointer && !reduceMotion) {
    cta.classList.add('has-trail');
    const N = 8, GAP = 120, LIFE = 800, MAX = 8;
    const src = (i) => `assets/img/trail/t${i + 1}.webp`;
    let warmed = false, lx = null, ly = null, n = 0;
    const alive = [];
    cta.addEventListener('pointerenter', () => {
      if (warmed) return;
      warmed = true;
      for (let i = 0; i < N; i++) new Image().src = src(i);
    });
    cta.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const b = cta.getBoundingClientRect();
      const x = e.clientX - b.left, y = e.clientY - b.top;
      if (lx != null && Math.hypot(x - lx, y - ly) < GAP) return;
      lx = x; ly = y;
      const im = document.createElement('img');
      im.className = 'sticker';
      im.alt = ''; im.draggable = false;
      im.src = src(n++ % N);
      im.style.left = `${x}px`; im.style.top = `${y}px`;
      im.style.setProperty('--rot', `${(Math.random() * 36 - 18).toFixed(1)}deg`);
      cta.appendChild(im);
      alive.push(im);
      if (alive.length > MAX) alive.shift().remove();
      setTimeout(() => im.classList.add('out'), LIFE);
      setTimeout(() => { im.remove(); const i = alive.indexOf(im); if (i >= 0) alive.splice(i, 1); }, LIFE + 450);
    });
    cta.addEventListener('pointerleave', () => { lx = ly = null; });
  }

  /* ================= IHSAN.TV WALL + DEEP LINKS ================= */
  const WALL_ITEMS = typeof WALL !== 'undefined' ? WALL : [];
  document.querySelectorAll('[data-count]').forEach((el) => {
    const k = el.dataset.count;
    const n = k === 'ch' ? PROJECTS.length : k === 'all' ? WALL_ITEMS.length : WALL_ITEMS.filter((t) => t.k === k).length;
    if (n) el.textContent = k === 'ch' ? String(n).padStart(2, '0') : n;
  });
  const wallEl = document.getElementById('wall');
  const openDoc = (slug) => { // like the .tv-doc cards: the PDF opens in a new tab
    const a = document.createElement('a');
    a.href = `assets/docs/${slug}.pdf`; a.target = '_blank'; a.rel = 'noopener';
    a.click();
    if (window.SFX) window.SFX('click-doc');
  };
  const CHIP_VERB = { v: '▶︎ PUTAR', i: '▣ LIHAT', d: 'PDF · BUKA' };
  let wall = null;
  if (wallEl && window.Fisheye && WALL_ITEMS.length) {
    wall = Fisheye.mount(wallEl, {
      tapes: WALL_ITEMS, atlas: WALL_ATLAS, variant: 'full',
      onOpen(t) {
        chip.hide();
        if (t.k === 'd') openDoc(t.s);
        else if (window.Viewer) Viewer.open(t.s, { trigger: wallEl });
        else location.hash = `tape/${t.s}`;
      },
      onHover(t) { if (t) chip.show(`${CHIP_VERB[t.k] || CHIP_VERB.v} · ${t.label}`); else chip.hide(); },
    });
  }
  // SEMUA · VIDEO · DESAIN — same atlas, the Wall is laid out again with the subset
  const chips = document.querySelectorAll('.wall-chip');
  const syncChips = (f) => chips.forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.filter === f)));
  chips.forEach((c) => c.addEventListener('click', () => { if (wall) { wall.setFilter(c.dataset.filter); syncChips(wall.filter); } }));
  if (wallEl) wallEl.addEventListener('wall:filter', (e) => syncChips(e.detail.filter));
  if (!wall) document.querySelectorAll('.wall-filter').forEach((el) => { el.hidden = true; });
  // the fixed ghost header would sit on top of the wall — hide it while the wall is on screen
  const showreel = document.getElementById('showreel');
  if (showreel) new IntersectionObserver(([en]) => document.body.classList.toggle('wall-on', en.isIntersecting), { rootMargin: '-15% 0px' }).observe(showreel);
  let openedTape = null;
  addEventListener('viewer:open', (e) => { openedTape = e.detail && e.detail.slug; if (wall) wall.setPaused(true); magHide(); chip.hide(); });
  addEventListener('viewer:close', (e) => {
    if (!wall) return;
    wall.setPaused(false);
    // zapped to another tape inside the Viewer → bring the wall to where the viewer ended
    const last = e.detail && e.detail.slug;
    if (last && last !== openedTape) wall.focus(last);
  });
  function route() {
    const h = location.hash;
    const tape = h.match(/^#tape\/([\w-]+)/);
    if (tape && window.Viewer && Viewer.has(tape[1])) {
      if (wall) wall.focus(tape[1]);
      if (Viewer.current !== tape[1]) Viewer.open(tape[1], { history: 'none', trigger: wallEl, silent: true });
      return;
    }
    const ch = h.match(/^#ch-(\d{1,2})$/);
    if (ch && PROJECTS[+ch[1] - 1] && !modal.open) openChannel(+ch[1] - 1);
  }
  route();
  addEventListener('hashchange', route);
})();
