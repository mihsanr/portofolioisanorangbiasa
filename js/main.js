/* Rows + scramble hover, magnetic floating preview, journey render,
   scroll background transition, CRT barrel frame, TV preloader,
   custom cursor, grain, project modal. */
(() => {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const BLUE = [0, 0, 255], PAPER = [244, 242, 238];

  /* ================= PRELOADER ================= */
  const pre = document.getElementById('preloader');
  const fill = document.getElementById('tvFill');
  function endPre() {
    if (!pre || pre.classList.contains('loaded')) return;
    pre.classList.add('loaded');
    setTimeout(() => pre.remove(), 700);
  }
  if (reduceMotion || !pre) { pre && pre.remove(); }
  else {
    let p = 0;
    const iv = setInterval(() => {
      p = Math.min(100, p + 4 + Math.random() * 14);
      fill.style.width = p.toFixed(0) + '%';
      if (p >= 100) { clearInterval(iv); setTimeout(endPre, 260); }
    }, 90);
    pre.addEventListener('click', endPre);
    addEventListener('keydown', endPre, { once: true });
    setTimeout(endPre, 4000); // failsafe
  }

  /* ================= CRT BARREL FRAME ================= */
  const frame = document.getElementById('crtFrame');
  const bevel = document.getElementById('crtBevel');
  const strokeSvg = document.getElementById('crtStroke');
  function barrel() {
    const W = innerWidth, H = innerHeight, m = W <= 768;
    const MC = m ? 12 : 38;              // corner inset
    const MM = m ? 4 : 8;                // mid-edge inset (barrel bulge)
    const R = m ? Math.min(Math.max(18, W * 0.03), 28)
                : Math.min(Math.max(40, W * 0.042), 70); // corner radius
    const inner =
      `M ${MC + R},${MC} Q ${W / 2},${MM} ${W - MC - R},${MC}` +
      ` Q ${W - MC},${MC} ${W - MC},${MC + R} Q ${W - MM},${H / 2} ${W - MC},${H - MC - R}` +
      ` Q ${W - MC},${H - MC} ${W - MC - R},${H - MC} Q ${W / 2},${H - MM} ${MC + R},${H - MC}` +
      ` Q ${MC},${H - MC} ${MC},${H - MC - R} Q ${MM},${H / 2} ${MC},${MC + R}` +
      ` Q ${MC},${MC} ${MC + R},${MC} Z`;
    const outer = `M 0,0 L ${W},0 L ${W},${H} L 0,${H} Z`;
    frame.style.clipPath = `path(evenodd, '${outer} ${inner}')`;
    frame.style.visibility = 'visible';
    bevel.style.clipPath = `path('${inner}')`;
    strokeSvg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    strokeSvg.style.clipPath = `path('${inner}')`;
    strokeSvg.innerHTML = '';
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', inner);
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', 'rgba(30,28,26,0.10)');
    p.setAttribute('stroke-width', '6');
    strokeSvg.appendChild(p);
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

  PROJECTS.forEach((p, i) => {
    const li = document.createElement('li');
    li.className = 'project-row';
    li.innerHTML = `
      <button class="project-row-head" data-idx="${i}" aria-haspopup="dialog">
        <span class="project-row-nr">${String(i + 1).padStart(2, '0')}</span>
        <span class="project-row-title">${p.title}</span>
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

  addEventListener('pointermove', (e) => { mx = e.clientX; my = e.clientY; }, { passive: true });

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
  function magHide() { magOn = false; mag.classList.remove('is-visible'); }

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
      scramble(head.querySelector('.project-row-title'));
    }
  });
  list.addEventListener('pointerleave', () => {
    if (activeRow) activeRow.classList.remove('is-active');
    activeRow = null;
    magHide();
  });

  /* ================= CLIENTS MARQUEE ================= */
  const track = document.getElementById('clientsTrack');
  const names = CLIENTS.map((c) => `<span class="client-name">${c}</span>`).join('');
  track.innerHTML = names + names;

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
  const journey = document.getElementById('journey');
  const lerp3 = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  function onScroll() {
    nav.classList.toggle('is-scrolled', scrollY > 8);
    const r = journey.getBoundingClientRect();
    const vh = innerHeight;
    // 0 while journey below viewport → 1 once its top passes 25% of screen
    const t = Math.min(1, Math.max(0, (vh * 0.85 - r.top) / (vh * 0.60)));
    const c = lerp3(BLUE, PAPER, t);
    document.body.style.backgroundColor = `rgb(${c[0]},${c[1]},${c[2]})`;
    document.body.classList.toggle('on-light', t > 0.5);
  }
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll, { passive: true });
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
        const v = document.createElement('video');
        v.src = `assets/video/${m.s}.mp4`;
        v.poster = `assets/video/${m.s}.webp`;
        v.preload = 'none'; v.controls = true; v.playsInline = true;
        v.setAttribute('aria-label', `${p.title} — ${m.label}`);
        v.addEventListener('play', () => {
          tvGallery.querySelectorAll('video').forEach((o) => { if (o !== v) o.pause(); });
        });
        const tag = document.createElement('span');
        tag.className = 'tape-label';
        tag.textContent = `▶ TAPE ${String(tape).padStart(2, '0')} · ${m.label}`;
        item.append(v, tag);
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
  document.getElementById('tvClose').addEventListener('click', () => modal.close());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.close(); });
  modal.addEventListener('close', () => {
    tvGallery.querySelectorAll('video').forEach((v) => v.pause());
  });

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
        !!(t.closest && t.closest('a, button, .project-row-head, video')));
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
})();
