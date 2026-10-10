/* Next Up — ranked idea rows with Join Waitlist.
   Every data call goes through `store`: SupabaseAdapter when
   js/supabase-config.js has a URL + anon key (Phase 2), otherwise
   LocalAdapter (localStorage, this browser only — demo).
   Rows are built with textContent only: data comes from a database. */
(() => {
  const list = document.getElementById('waitlistList');
  if (!list || typeof WAITLIST_IDEAS === 'undefined') return;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const KEY_JOINED = 'ihsan.waitlist.joined';
  const KEY_VOTER = 'ihsan.waitlist.voter';

  /* ================= STORAGE ================= */
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
  };

  // anonymous id per browser — sent to join_waitlist() so one browser = one vote per idea
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function uuid4() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    const b = new Uint8Array(16);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(b);
    else for (let i = 0; i < 16; i++) b[i] = (Math.random() * 256) | 0;
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
  let voter = null;
  function voterId() {
    if (voter) return voter;
    voter = ls.get(KEY_VOTER);
    if (!voter || !UUID.test(voter)) {
      voter = uuid4();
      ls.set(KEY_VOTER, voter);
    }
    return voter;
  }

  let joinedSet = null; // in-memory copy, survives even when storage is blocked
  function joined() {
    if (joinedSet) return joinedSet;
    try {
      const a = JSON.parse(ls.get(KEY_JOINED) || '[]');
      joinedSet = new Set(Array.isArray(a) ? a : []);
    } catch (e) { joinedSet = new Set(); }
    return joinedSet;
  }

  function markJoined(id) {
    joined().add(id);
    ls.set(KEY_JOINED, JSON.stringify([...joined()]));
  }

  /* Phase 1 adapter — counts live in this browser only. */
  const LocalAdapter = {
    async list() {
      return WAITLIST_IDEAS.map((i) => ({
        id: i.id,
        count: (i.seed | 0) + (joined().has(i.id) ? 1 : 0),
        status: i.status,
      }));
    },
    async join(id) {
      const idea = WAITLIST_IDEAS.find((i) => i.id === id);
      if (!idea) throw new Error('unknown-idea');
      if (idea.status !== 'voting') throw new Error('closed');
      if (joined().has(id)) throw new Error('already-joined');
      voterId();
      markJoined(id);
      return { id, count: (idea.seed | 0) + 1 };
    },
    hasJoined(id) { return joined().has(id); },
  };

  /* Phase 2 adapter — PostgREST RPCs from supabase/waitlist.sql, plain fetch
     (no SDK, no build step). Same methods and errors as LocalAdapter. */
  function makeSupabaseAdapter(cfg) {
    const base = cfg.url.replace(/\/+$/, '') + '/rest/v1/rpc/';
    const headers = { apikey: cfg.anonKey, 'Content-Type': 'application/json' };
    // legacy anon keys are JWTs and go in Authorization too; publishable keys must not
    if (/^eyJ/.test(cfg.anonKey)) headers.Authorization = `Bearer ${cfg.anonKey}`;

    async function rpc(fn, body) {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 8000);
      try {
        const res = await fetch(base + fn, {
          method: 'POST', headers, body: JSON.stringify(body || {}), signal: ctl.signal,
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error((data && data.message) || `http-${res.status}`);
        return data;
      } finally {
        clearTimeout(timer);
      }
    }

    return {
      async list() {
        const rows = await rpc('list_waitlist', { voter_id: voterId() });
        // resync the local cache from the server (drops stale Phase 1 demo joins)
        joinedSet = new Set(rows.filter((r) => r.joined).map((r) => r.id));
        ls.set(KEY_JOINED, JSON.stringify([...joinedSet]));
        return rows.map((r) => ({
          id: r.id, title: r.title, type: r.type, price: r.price,
          desc: r.description, status: r.status, sort: r.sort, count: r.count,
        }));
      },
      async join(id) {
        if (joined().has(id)) throw new Error('already-joined');
        const [r] = await rpc('join_waitlist', { idea_id: id, voter_id: voterId() });
        if (!r) throw new Error('unknown-idea');
        markJoined(id); // joined === false means this browser had already voted
        return { id: r.id, count: r.count };
      },
      hasJoined(id) { return joined().has(id); },
    };
  }

  // refuse anything that looks like a secret key — it must never reach the browser
  function isSecretKey(key) {
    if (/^sb_secret_/.test(key)) return true;
    try {
      const p = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return p.role === 'service_role';
    } catch (e) { return false; }
  }

  const cfg = window.WAITLIST_SUPABASE || {};
  let store = LocalAdapter;
  if (cfg.url && cfg.anonKey) {
    if (isSecretKey(cfg.anonKey)) console.error('waitlist: secret key in supabase-config.js — refusing to use it. Use the anon/publishable key.');
    else store = makeSupabaseAdapter(cfg);
  }
  const live = store !== LocalAdapter;

  /* ================= RENDER ================= */
  const META = new Map(WAITLIST_IDEAS.map((i) => [i.id, i]));
  const ORDER = new Map(WAITLIST_IDEAS.map((i, n) => [i.id, n]));
  const stateEl = document.getElementById('waitlistState');
  const liveEl = document.getElementById('waitlistLive');
  const pilotsEl = document.getElementById('pilotsNr');
  const noteEl = document.getElementById('waitlistNote');
  if (noteEl) noteEl.hidden = live; // the "kept on this device" note only applies to the local demo
  const rows = new Map(); // id -> { li, nr, badge, num, btn, label }
  let ideas = [];         // merged meta + { count, status }, ranked

  const pad = (n) => String(n).padStart(2, '0');
  // ties: database `sort`, then order in waitlist-data.js, unknown ideas last
  const pos = (it) => (Number.isFinite(it.sort) ? it.sort : 1e6) * 1e3 + (ORDER.has(it.id) ? ORDER.get(it.id) : 999);
  const rank = (a, b) => b.count - a.count || pos(a) - pos(b);
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const announce = (msg) => { if (liveEl) liveEl.textContent = msg; };

  function setState(kind) {
    list.hidden = kind !== 'ready';
    if (!stateEl) return;
    stateEl.hidden = kind === 'ready';
    stateEl.className = `waitlist-state waitlist-state--${kind}`;
    stateEl.textContent = '';
    if (kind === 'loading') stateEl.textContent = 'TUNING…';
    if (kind === 'empty') stateEl.textContent = 'NOTHING ON THE SCHEDULE YET — CHECK BACK SOON';
    if (kind === 'error') {
      stateEl.append('NO SIGNAL — ');
      const retry = el('button', 'waitlist-retry', 'try again');
      retry.type = 'button';
      retry.addEventListener('click', load);
      stateEl.appendChild(retry);
    }
  }

  function buildRow(it) {
    const li = el('li', 'waitlist-row');
    li.dataset.id = it.id;
    const nr = el('span', 'waitlist-nr');
    const main = el('div', 'waitlist-main');
    const badge = el('p', 'waitlist-badge');
    const title = el('h2', 'waitlist-title', it.title);
    title.id = `idea-${it.id}`;
    const meta = el('p', 'waitlist-meta');
    if (it.price) meta.appendChild(el('span', 'waitlist-tag waitlist-tag--price', it.price));
    if (it.type) meta.appendChild(el('span', 'waitlist-tag', it.type));
    main.append(badge, title, meta);
    if (it.desc) main.appendChild(el('p', 'waitlist-desc', it.desc));

    const count = el('p', 'waitlist-count');
    const num = el('span', 'waitlist-num');
    count.append(num, el('span', 'waitlist-unit', 'WAITING'));

    const btn = el('button', 'waitlist-btn');
    btn.type = 'button';
    btn.setAttribute('aria-describedby', title.id);
    const label = el('span', 'waitlist-btn-label');
    btn.appendChild(label);

    li.append(nr, main, count, btn);
    rows.set(it.id, { li, nr, badge, num, btn, label });
    return li;
  }

  function setBadge(r, text, kind) {
    r.badge.textContent = '';
    r.badge.hidden = !text;
    r.badge.className = `waitlist-badge${kind ? ` waitlist-badge--${kind}` : ''}`;
    if (!text) return;
    r.badge.append(el('span', 'waitlist-badge-dot', '●'), ` ${text}`);
  }

  function paint() {
    ideas.sort(rank);
    // the top idea still open for votes is the one going into production next
    const next = ideas.find((i) => i.status === 'voting' && i.count > 0);
    ideas.forEach((it, i) => {
      const r = rows.get(it.id);
      r.nr.textContent = pad(i + 1);
      r.num.textContent = String(it.count);
      r.li.classList.toggle('is-next', it === next);
      if (it.status === 'in_production') setBadge(r, 'IN PRODUCTION', 'prod');
      else if (it.status === 'done') setBadge(r, 'ON AIR', 'air');
      else if (it === next) setBadge(r, 'NEXT IN PRODUCTION', 'next');
      else setBadge(r, '');

      const joinedIt = store.hasJoined(it.id);
      const open = it.status === 'voting' && !joinedIt;
      r.label.textContent = joinedIt ? '✓ ON THE LIST'
        : it.status === 'in_production' ? 'IN PRODUCTION'
        : it.status === 'done' ? 'ON AIR'
        : 'JOIN WAITLIST';
      // aria-disabled (not `disabled`) keeps keyboard focus on the button after joining
      r.btn.setAttribute('aria-disabled', String(!open));
      r.btn.classList.toggle('is-joined', joinedIt);
    });
    reorder();
  }

  /* FLIP: move rows into rank order, then animate from their old spot */
  function reorder() {
    const current = [...list.children].map((li) => li.dataset.id);
    if (current.length === ideas.length && ideas.every((it, i) => it.id === current[i])) return;
    const first = new Map();
    rows.forEach((r, id) => first.set(id, r.li.getBoundingClientRect().top));
    const focused = document.activeElement;
    ideas.forEach((it) => list.appendChild(rows.get(it.id).li));
    if (focused && list.contains(focused)) focused.focus({ preventScroll: true });
    if (reduceMotion || !first.size) return;
    rows.forEach((r, id) => {
      const dy = first.get(id) - r.li.getBoundingClientRect().top;
      if (Math.abs(dy) < 1) return;
      r.li.animate(
        [{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }],
        { duration: 650, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    });
  }

  async function load() {
    setState('loading');
    try {
      const data = await store.list();
      ideas = data
        .map((d) => Object.assign({}, META.get(d.id), d))
        .filter((it) => it.title);
      if (pilotsEl) pilotsEl.textContent = `${pad(ideas.length)} PILOTS`;
      if (!ideas.length) { setState('empty'); return; }
      list.textContent = '';
      rows.clear();
      ideas.forEach((it) => list.appendChild(buildRow(it)));
      paint();
      setState('ready');
    } catch (e) {
      setState('error');
    }
  }

  /* ================= JOIN ================= */
  const busy = new Set();
  list.addEventListener('click', async (e) => {
    const btn = e.target.closest('.waitlist-btn');
    if (!btn || btn.getAttribute('aria-disabled') === 'true') return;
    const id = btn.closest('.waitlist-row').dataset.id;
    if (busy.has(id)) return;
    busy.add(id);
    btn.classList.add('is-busy');
    try {
      const res = await store.join(id);
      const it = ideas.find((x) => x.id === id);
      it.count = res.count;
      paint();
      const r = rows.get(id);
      if (!reduceMotion) {
        r.num.classList.remove('is-bump');
        void r.num.offsetWidth; // restart the bump animation
        r.num.classList.add('is-bump');
      }
      announce(`You're on the list for ${it.title}. ${it.count} waiting — now ranked number ${ideas.indexOf(it) + 1}.`);
    } catch (err) {
      if (err && err.message === 'already-joined') paint();
      else announce('No signal — could not join the waitlist. Try again.');
    } finally {
      busy.delete(id);
      btn.classList.remove('is-busy');
    }
  });

  load();
})();
