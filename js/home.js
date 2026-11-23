/* Halaman utama: kolase hero berlapis (parallax kursor + gulir), TV vintage
   (dinding karya, hover = parallax), preview TikTok (dimuat saat mendekat),
   kartu game (klip demo + rekor), tombol bagikan. Semua null-safe. */
(function () {
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  var saveData = !!(navigator.connection && navigator.connection.saveData);

  /* ================= TV VINTAGE: dinding karya ================= */
  (function () {
    var el = document.getElementById('wallPreview');
    var count = document.getElementById('wallCount');
    if (count && typeof WALL !== 'undefined' && WALL.length) count.textContent = WALL.length + '+';
    // reduced motion: biarkan strip thumbnail statis (link ke work.html)
    if (!el || !window.Fisheye || typeof WALL === 'undefined' || reduce) return;
    Fisheye.mount(el, {
      tapes: WALL, atlas: WALL_ATLAS, variant: 'preview', lazyAtlas: true,
      hover: 'parallax',
      href: function (t) { return 'work.html#tape/' + t.s; },
      onOpen: function (t) { location.href = 'work.html#tape/' + t.s; }
    });
  })();

  /* ================= PARALLAX berlapis =================
     [data-depth]  = geser ikut kursor (negatif = berlawanan arah)
     [data-scroll] = geser vertikal ikut gulir (relatif ke section-nya)
     Pakai properti `translate` supaya `rotate`/`transform` di CSS tetap utuh. */
  (function () {
    if (reduce) return;
    var layers = [].map.call(document.querySelectorAll('[data-depth],[data-scroll]'), function (el) {
      return { el: el, d: +el.getAttribute('data-depth') || 0, s: +el.getAttribute('data-scroll') || 0, sec: el.closest('section') || document.body };
    });
    var tilt = document.querySelector('[data-tilt]');
    if (!layers.length && !tilt) return;
    var mx = 0, my = 0, cx = 0, cy = 0, raf = 0;
    var tx = 0, ty = 0, ttx = 0, tty = 0; // kemiringan TV
    function kick() { if (!raf) raf = requestAnimationFrame(frame); }
    if (fine) {
      addEventListener('pointermove', function (e) {
        if (e.pointerType !== 'mouse') return;
        mx = e.clientX / innerWidth * 2 - 1;
        my = e.clientY / innerHeight * 2 - 1;
        if (tilt) {
          var b = tilt.getBoundingClientRect();
          var inside = e.clientX >= b.left && e.clientX <= b.right && e.clientY >= b.top && e.clientY <= b.bottom;
          ttx = inside ? ((e.clientX - b.left) / b.width * 2 - 1) : 0;
          tty = inside ? ((e.clientY - b.top) / b.height * 2 - 1) : 0;
        }
        kick();
      }, { passive: true });
      document.documentElement.addEventListener('pointerleave', function () { mx = my = ttx = tty = 0; kick(); });
    }
    addEventListener('scroll', kick, { passive: true });
    addEventListener('resize', kick, { passive: true });
    function frame() {
      raf = 0;
      cx += (mx - cx) * 0.08; cy += (my - cy) * 0.08;
      tx += (ttx - tx) * 0.08; ty += (tty - ty) * 0.08;
      var unit = Math.min(innerWidth, 1400) / 60; // px per kedalaman 1
      var vh = innerHeight;
      for (var i = 0; i < layers.length; i++) {
        var L = layers[i];
        var b = L.sec.getBoundingClientRect();
        if (b.bottom < -200 || b.top > vh + 200) continue; // di luar layar: diam
        var x = cx * L.d * unit, y = cy * L.d * unit * 0.6 - b.top * L.s;
        L.el.style.translate = x.toFixed(1) + 'px ' + y.toFixed(1) + 'px';
      }
      if (tilt) tilt.style.transform = 'perspective(1100px) rotateY(' + (tx * 4).toFixed(2) + 'deg) rotateX(' + (-ty * 3).toFixed(2) + 'deg)';
      if (Math.abs(mx - cx) + Math.abs(my - cy) + Math.abs(ttx - tx) + Math.abs(tty - ty) > 0.002) kick();
    }
    kick();
  })();

  /* ================= PREVIEW TIKTOK =================
     Skrip resmi embed TikTok baru dimuat saat section mendekati layar
     (hemat data di awal). Tanpa skrip/diblokir: kartu fallback tetap jadi link. */
  (function () {
    var sec = document.getElementById('orgbiasa');
    if (!sec) return;
    var done = false;
    function load() {
      if (done) return; done = true;
      var s = document.createElement('script');
      s.async = true; s.src = 'https://www.tiktok.com/embed.js';
      document.body.appendChild(s);
    }
    if (!('IntersectionObserver' in window)) { load(); return; }
    var io = new IntersectionObserver(function (es) {
      if (es.some(function (e) { return e.isIntersecting; })) { load(); io.disconnect(); }
    }, { rootMargin: '600px 0px' });
    io.observe(sec);
  })();

  /* ================= KARTU GAME =================
     Klip demo baru diunduh saat kartu mendekati layar, berhenti saat keluar layar.
     Hemat data / kurangi gerak: cukup gambar diam. Rekor teratas diambil sekali. */
  (function () {
    var vids = document.querySelectorAll('.hm-game video[data-src]'), rec = document.getElementById('gameRec');
    if (!vids.length) return;
    var still = reduce || saveData;
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    function fmt(ms) { var cs = Math.floor(ms / 10); return pad(Math.floor(cs / 6000)) + ':' + pad(Math.floor(cs / 100) % 60) + '.' + pad(cs % 100); }
    function top() {
      var c = window.WAITLIST_SUPABASE;
      if (!c || !c.url || !c.anonKey || /^sb_secret_/.test(c.anonKey) || !window.fetch) return;
      var h = { apikey: c.anonKey, 'Content-Type': 'application/json' };
      if (/^eyJ/.test(c.anonKey)) h.Authorization = 'Bearer ' + c.anonKey;
      fetch(c.url.replace(/\/+$/, '') + '/rest/v1/rpc/game_top_scores', { method: 'POST', headers: h, body: '{"p_limit":1}' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (rows) {
          if (!rows || !rows[0] || !(rows[0].time_ms > 0)) return;
          rec.textContent = 'rekor ' + fmt(rows[0].time_ms) + ' · ' + String(rows[0].name || '').slice(0, 12) + ' — kalahin?';
          rec.hidden = false;
        })
        .catch(function () {});
    }
    function load(v) {
      v.seen = true;
      if (!still) { v.src = v.getAttribute('data-src'); v.muted = true; }
      if (!rec || !v.closest('#game')) return;
      var s = document.createElement('script');
      s.src = 'js/supabase-config.js?v=8'; s.onload = top;
      document.head.appendChild(s);
    }
    [].forEach.call(vids, function (v) {
      if (!('IntersectionObserver' in window)) { load(v); if (!still) v.play().catch(function () {}); return; }
      new IntersectionObserver(function (es) {
        var e = es[es.length - 1];
        if (e.isIntersecting) { if (!v.seen) load(v); if (!still) v.play().catch(function () {}); }
        else if (!v.paused) v.pause();
      }, { rootMargin: '150px 0px' }).observe(v);
    });
  })();

  /* ================= BAGIKAN ================= */
  (function () {
    var btn = document.getElementById('shareBtn');
    var toast = document.getElementById('toast');
    if (!btn || !toast) return;
    var timer;
    function say(msg) {
      toast.textContent = msg;
      toast.classList.add('show');
      clearTimeout(timer);
      timer = setTimeout(function () { toast.classList.remove('show'); }, 1800);
    }
    btn.addEventListener('click', function () {
      var url = location.origin + location.pathname;
      if (navigator.share) {
        navigator.share({ title: document.title, url: url }).catch(function () {});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(function () { say('LINK DISALIN ✓'); }, function () { say(url); });
      } else {
        say(url);
      }
    });
  })();
})();
