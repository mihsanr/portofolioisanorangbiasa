/* Service worker for the teleprompter (scope: /tools/).
   It only ever answers for the files listed below — every other page and
   request on the site, and anything on another origin, goes straight to
   the network untouched.

   Releasing a change: bump V here together with the ?v= in the HTML files
   and the V constant in js/prompter.js. The old cache is dropped on activate. */
const V = '4';
const CACHE = 'tp-v' + V;

const PAGES = ['teleprompter.html'];
const ASSETS = [
  `../css/prompter.css?v=${V}`,
  `../js/prompter.js?v=${V}`,
  `../js/prompter-pro.js?v=${V}`,
  'manifest.webmanifest',
  '../assets/favicon.png',
  '../assets/icons/tp-192.png',
  '../assets/icons/tp-512.png',
  '../assets/icons/tp-maskable.png',
];

const abs = (u) => new URL(u, self.location.href);
const PAGE_PATHS = new Set(PAGES.map((u) => abs(u).pathname));
const ASSET_PATHS = new Set(ASSETS.map((u) => abs(u).pathname));

self.addEventListener('install', (e) => {
  // one missing file must not block the install, so each is added on its own
  e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(
    [...PAGES, ...ASSETS].map((u) => c.add(new Request(abs(u), { cache: 'reload' })))
  )));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('tp-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// the page asks for this when the reader taps "New version — tap to reload"
self.addEventListener('message', (e) => { if (e.data === 'skip') self.skipWaiting(); });

const keep = (req, res) => {
  if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
  return res;
};
const timeout = (ms) => new Promise((_, no) => setTimeout(() => no(new Error('slow')), ms));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // Supabase and friends: never cached

  // pages: network first so updates land at once, cache when offline or stuck
  if (req.mode === 'navigate') {
    if (!PAGE_PATHS.has(url.pathname)) return;
    e.respondWith(
      Promise.race([fetch(req), timeout(4000)])
        .then((res) => keep(req, res))
        .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req)))
    );
    return;
  }

  // css / js / icons: cache first (their URLs carry ?v=)
  if (!ASSET_PATHS.has(url.pathname)) return;
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req)
      .then((res) => keep(req, res))
      .catch(() => caches.match(req, { ignoreSearch: true }).then((old) => old || Response.error())))
  );
});
