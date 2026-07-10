// Project channels, journey chapters, skills, clients.
// Image items reference slugs in assets/img (dims + LQIP in media.js).
// Album channels expand every slug in ALBUMS.<name> (generated in media.js).
// Video items reference assets/video/<slug>.mp4 with a .webp poster.
// Doc items ({t:'d'}) link to assets/docs/<doc>.pdf with a cover page.
const imgs = (album) => (ALBUMS[album] || []).map((s) => ({ t: 'i', s }));
const doc = (docSlug, label, pages) => ({ t: 'd', doc: docSlug, label, pages, cover: (ALBUMS[docSlug] || [])[0] });

const PROJECTS = [
  {
    title: 'AF Medika', cat: 'Social Media Package', year: '2023',
    tags: ['Brand Board', 'Feed Templates', 'Education Carousels', 'Reels'],
    desc: 'Full Instagram package for a dental clinic — brand board, feed templates, education carousels, and an animated reel. Designed to make a clinic feel like a place, not a procedure.',
    cover: 'afmedika-cards-dark',
    media: [
      { t: 'v', s: 'afmedika-reels', label: 'Instagram reel' },
      { t: 'i', s: 'afmedika-cards-dark' },
      { t: 'i', s: 'afmedika-brandboard' },
      { t: 'v', s: 'mg-afmedika-pp', label: 'Profile motion' },
      { t: 'i', s: 'afmedika-consultation' },
      { t: 'i', s: 'afmedika-klinik' },
      { t: 'i', s: 'afmedika-yellowteeth' },
      { t: 'i', s: 'afmedika-lokasi' },
      { t: 'i', s: 'afmedika-hours' },
      { t: 'i', s: 'afmedika-treatment' },
    ],
  },
  {
    title: 'Vinco Shorts', cat: 'Video Editing', year: '2025 — NOW',
    tags: ['YouTube Shorts', 'Captions', 'Sound Design', 'Pacing'],
    desc: 'Talking-head shorts for Vinco, a science-flavored YouTube channel. Cutting, captions, sound design, and pacing tuned to survive the scroll.',
    cover: 'video:vinco-tokamak',
    media: [
      { t: 'v', s: 'vinco-tokamak', label: 'Tokamak' },
      { t: 'v', s: 'vinco-surtsey', label: 'Surtsey Island' },
      { t: 'v', s: 'vinco-alien', label: 'Alien' },
      { t: 'v', s: 'vinco-nuklir', label: 'Nuklir' },
      { t: 'v', s: 'vinco-bensin', label: 'Buang Bensin' },
      { t: 'v', s: 'vinco-chip', label: 'Chip' },
    ],
  },
  {
    title: 'Motion Graphics', cat: 'Motion Design', year: '2022 — 2025',
    tags: ['After Effects', 'Logo Sting', 'Kinetic Type', 'Social Motion'],
    desc: 'The full motion shelf — logo stings, kinetic type, invitations, story loops, and animated social pieces built in After Effects.',
    cover: 'video:mg-beda',
    media: [
      { t: 'v', s: 'mg-beda', label: 'BeDa logo motion' },
      { t: 'v', s: 'mg-logofolio', label: 'Logofolio' },
      { t: 'v', s: 'mg-exora', label: 'Exora League opening' },
      { t: 'v', s: 'mg-shifter', label: 'GA Shifter reel' },
      { t: 'v', s: 'mg-motion', label: 'Motion reel' },
      { t: 'v', s: 'mg-jasadesain', label: 'Jasa desain promo' },
      { t: 'v', s: 'mg-invitation', label: 'Invitation card' },
      { t: 'v', s: 'mg-gohyong', label: 'Gohyong story' },
      { t: 'v', s: 'mg-day1', label: 'Day 1' },
      { t: 'v', s: 'mg-21story', label: '21 Sep story' },
      { t: 'v', s: 'mg-21sep', label: '21 Sep feed' },
      { t: 'v', s: 'mg-bekind', label: 'Be Kind' },
      { t: 'v', s: 'mg-fractal', label: 'Fractal noise face' },
      { t: 'v', s: 'mg-idup', label: 'Idup' },
      { t: 'v', s: 'mg-intro', label: 'Intro' },
      { t: 'v', s: 'mg-lesson', label: 'Lesson' },
      { t: 'v', s: 'mg-mg', label: 'MG reel' },
      { t: 'v', s: 'mg-niche', label: 'Niche' },
      { t: 'v', s: 'mg-onelastcry', label: 'One Last Cry' },
      { t: 'v', s: 'mg-preempted', label: 'Preempted' },
      { t: 'v', s: 'mg-prodby', label: 'Prodby Khalil' },
      { t: 'v', s: 'mg-prodby2', label: 'Prodby Khalil 2.0' },
      { t: 'v', s: 'mg-ruanglingkup', label: 'Ruang lingkup' },
      { t: 'v', s: 'mg-ruangnera', label: 'Ruang Nera teaser' },
      { t: 'v', s: 'mg-thisaccount', label: 'This account' },
      { t: 'v', s: 'mg-timeline', label: 'Timeline' },
      { t: 'v', s: 'mg-vid', label: 'VID' },
      { t: 'v', s: 'mg-exp', label: 'Exp' },
      { t: 'v', s: 'mg-final', label: 'Final' },
      { t: 'v', s: 'mg-pisgemajja', label: 'Pisgemajja' },
      { t: 'v', s: 'mg-realjorok', label: 'Real jorok' },
      { t: 'v', s: 'mg-realign', label: 'Realign' },
      { t: 'v', s: 'mg-render1', label: 'Render' },
      { t: 'v', s: 'mg-ujumaki', label: 'Ujumaki' },
      { t: 'v', s: 'mg-afmedika-pp', label: 'AF Medika profile' },
    ],
  },
  {
    title: 'Rabbani', cat: 'Retail Campaign Design', year: '2025',
    tags: ['Poster', 'Backdrop', 'Banner', 'Biro Branding', 'Payday Campaign'],
    desc: 'In-house design for CV Rabbani Asysa — event posters, bazaar backdrops, x-banners, payday campaigns, and branch (biro) branding across print and digital.',
    cover: 'rabbani-004',
    media: [
      ...imgs('rabbani'),
      doc('pdf-biro-rabbani', 'Biro Branding Deck', 10),
      ...imgs('pdf-biro-rabbani'),
    ],
  },
  {
    title: 'Logo & Brand', cat: 'Brand Identity', year: '2021 — 2025',
    tags: ['Logo', 'Brand Identity', 'Logofolio', 'Mockups'],
    desc: 'Identities for warungs, farms, hotels, and gift shops — BeDa, KadoMe, Sumberpasir Farm, Rizky Farm, Ongkel Bob, and friends — plus the full logofolio document.',
    cover: 'logo-storefront',
    media: [
      ...imgs('logoall'),
      doc('pdf-logofolio', 'Logofolio 2024', 25),
      ...imgs('pdf-logofolio'),
    ],
  },
  {
    title: 'Poster & Campaign', cat: 'Print & Promo', year: '2021 — 2025',
    tags: ['Poster', 'Banner', 'Backdrop', 'Menu Design', 'Guidebook', 'Promo Video'],
    desc: 'Posters, backdrops, banners, menu design, a competition guidebook, and a snack-brand promo video. Made for print shops and street corners, not just feeds.',
    cover: 'poster-chipaws',
    media: [
      { t: 'i', s: 'poster-selfpromo' },
      { t: 'v', s: 'chipaws-promo', label: 'Chipaws promo video' },
      { t: 'i', s: 'poster-chipaws' },
      { t: 'i', s: 'poster-angkringan' },
      { t: 'i', s: 'poster-nobaria' },
      { t: 'i', s: 'poster-kabinet' },
      { t: 'i', s: 'poster-lutuna' },
      { t: 'i', s: 'poster-afmedika' },
      { t: 'i', s: 'poster-indosari' },
      doc('pdf-menu-ongkelbob', 'Menu Ongkel Bob', 2),
      ...imgs('pdf-menu-ongkelbob'),
      doc('pdf-panduan-lomba', 'Panduan Lomba — Prosperity Project', 9),
      ...imgs('pdf-panduan-lomba'),
    ],
  },
  {
    title: 'Merch & Apparel', cat: 'Product Design', year: '2022 — 2025',
    tags: ['Apparel', 'Jersey', 'Varsity', 'Print-ready'],
    desc: 'Jerseys, varsity jackets, work shirts, and tees — the complete apparel archive, from concept to print-ready mockup.',
    cover: 'merch-varsity-blue',
    media: imgs('merch'),
  },
  {
    title: 'Social Content', cat: 'Instagram Feeds', year: '2021 — 2023',
    tags: ['Instagram', 'Carousel', 'Feed System', 'Campaign'],
    desc: 'The full feed archive — carousels, education posts, event promos, and product content for campus orgs, NGOs, and small brands. Everything, no reruns.',
    cover: 'feed-shifter',
    media: imgs('feeds'),
  },
  {
    title: 'Personal Project', cat: 'Stickers & Type', year: 'ONGOING',
    tags: ['Stickers', 'Type', 'Experiments'],
    desc: 'Sticker packs, type experiments, and things made for no client at all — where most of the good ideas start. Complete archive.',
    cover: 'pp-kindness',
    media: imgs('personal'),
  },
];

const JOURNEY = [
  {
    company: 'CV Rabbani Asysa', cat: 'Graphic Design', period: '03/2025 — 12/2025',
    role: 'Graphic Designer',
    desc: 'Visual content for three product brands — Kemko, Hiro, and Palestine — plus posters, vouchers, backdrops, monthly Shopee campaign assets, and after-event video edits.',
  },
  {
    company: 'PT Sumber Jaya Cipta', cat: 'Digital Creator', period: '11/2024 — 02/2025',
    role: 'Fulltime Digital Creator',
    desc: 'A one-person content unit: product design, brand collateral, social media management, and video campaigns shot and edited solo.',
  },
  {
    company: 'Prosperity Project', cat: 'Freelance', period: '08/2021 — PRESENT',
    role: 'Freelance Graphic Designer',
    desc: 'Logos, social media packages, promo videos, and campaign design for small businesses — BeDa, KadoMe, AF Medika, Chipaws, Ongkel Bob, and more.',
  },
  {
    company: 'Universitas Brawijaya', cat: 'Campus Era', period: '2021 — 2022',
    role: 'Media & Design Roles',
    desc: 'Media lead and design staff across student orgs, Kulturnera, and NGO campaigns: infographics, event branding, virtual stages, bumpers, and teaser videos. Also: Bachelor of Fisheries (Aquaculture), GPA 3.73.',
  },
];

const SKILLS = [
  'CapCut', 'Canva', 'Adobe Photoshop', 'Adobe Illustrator',
  'After Effects', 'Premiere Pro', 'Figma', 'Copywriting', 'Graphic Design',
];

const CLIENTS = [
  'Vinco', 'AF Medika', 'Rabbani', 'PT Sumber Jaya Cipta', 'Prosperity Project',
  'Kulturnera', 'Universitas Brawijaya', 'Chipaws', 'BeDa', 'KadoMe',
  'Ongkel Bob', 'MTH Pro Audio', 'Angkringan PLC', 'Rizky Farm',
  'Sumberpasir Farm', 'Kaktus Tanijuniorr', 'Pie Nanas Candaria', 'Darelia Gift',
  'Get Wellness Soon', 'Potabos', 'Workeazy', 'Exora League : Kediri',
];
