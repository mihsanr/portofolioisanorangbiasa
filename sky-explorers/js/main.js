import * as THREE from 'three';
import { NO_PHOTO, CRASH_VO, FLIGHT, LETTERS, NUMBERS, COLORS, THRUST, FOG } from './config.js';
import { buildWorld, heightAt, near, wrapC, blobMat } from './world.js';
import { makePlane, makeArrow, setPlaneSkin, SKINS } from './models.js';
import { createEnvironment } from './sky.js';
import { installLeanShadows } from './shadows.js';
import { createFlight } from './flight.js';
import { createAudio } from './audio.js';
import { createFx, createOutline, propBlur } from './fx.js';
import { createQuests } from './quests.js';
import { createPlay } from './play.js';
import { oldTown, LEMBANG } from './districts.js';

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

// ── Simpan lokal (versi skema untuk migrasi; tanpa data pribadi) ──
const SAVE_KEY = 'skyexplorers.save';
const save = (() => {
  const d = { v: 1, got: [], volume: 1, muted: false, hint: true, tutorialDone: false, lang: 'id', skin: 'classic' };
  try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s?.v === 1) Object.assign(d, s); } catch {}
  if (d.hintV !== 2) { d.hint = true; d.hintV = 2; }
  if (d.tutV !== 2) { d.tutorialDone = false; d.tutV = 2; }   // tutorial bergambar baru: tampil sekali lagi   // panah sempat tersimpan mati tanpa disadari: nyalakan sekali
  return d;
})();
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch {} };

// ── Render ──
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
let pixelRatio = Math.min(devicePixelRatio, 1.5);
renderer.setPixelRatio(pixelRatio);
renderer.toneMapping = THREE.ACESFilmicToneMapping;  // sama dengan Pemburu Kaset
// Bayangan matahari sungguhan hanya di desktop (HP: bayangan bulat saja supaya ringan).
const SHADOWS = !matchMedia('(pointer: coarse)').matches && !/[?&]noshadow/.test(location.search);
if (SHADOWS) { installLeanShadows(); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; }
const scene = new THREE.Scene();
scene.environment = createEnvironment(renderer);    // hanya material Standard (kaca kokpit) yang memantulkan langit
const camera = new THREE.PerspectiveCamera(60, 1, 0.5, 1800);
function resize() { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

const world = buildWorld(scene, { shadows: SHADOWS });
const plane = makePlane(SKINS[save.skin] ? save.skin : 'classic');
scene.add(plane.root);
const flight = createFlight(plane, camera, world);
flight.reset();

// Bayangan bulat murah di bawah pesawat (membantu anak membaca ketinggian).
const shadow = new THREE.Mesh(new THREE.PlaneGeometry(6, 6).rotateX(-Math.PI / 2), blobMat.clone());
scene.add(shadow);

// Potret objek 3D (dirender dari model asli) untuk pilihan pesawat.
const pScene = new THREE.Scene(), pCam = new THREE.PerspectiveCamera(30, 4 / 3, 0.1, 500), portraits = new Map();
const pSun = new THREE.DirectionalLight('#ffe9c8', 2.6); pSun.position.set(-2, 4, -4);
pScene.add(new THREE.HemisphereLight('#dfeaff', '#9aa77d', 1.5), pSun);
function portrait(key, make, { bg = '#8fd0ff', back = false, zoom = 1, light = 1 } = {}) {
  if (portraits.has(key)) return portraits.get(key);
  const o = make(), W = 320, H = 240, pr = renderer.getPixelRatio(), dir = back ? 1 : -1;
  pSun.position.set(-2, 4, dir * 4);
  pScene.add(o); o.updateMatrixWorld(true);
  const sp = new THREE.Box3().setFromObject(o).getBoundingSphere(new THREE.Sphere());
  pCam.position.copy(sp.center).add(new THREE.Vector3(-0.55, 0.3, dir).normalize().multiplyScalar(sp.radius * 3.3 / zoom));
  pCam.lookAt(sp.center); pScene.background = new THREE.Color(bg);
  renderer.setRenderTarget(null); renderer.setViewport(0, 0, W / pr, H / pr); renderer.setScissor(0, 0, W / pr, H / pr); renderer.setScissorTest(true);
  renderer.render(pScene, pCam);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  c.getContext('2d').drawImage(renderer.domElement, 0, renderer.domElement.height - H, W, H, 0, 0, W, H);
  renderer.setScissorTest(false); renderer.setViewport(0, 0, innerWidth, innerHeight);
  pScene.remove(o);
  const url = c.toDataURL('image/webp', 0.9);
  portraits.set(key, url); return url;
}

// Pilih karakter pesawat: ubin bergambar (tanpa perlu membaca); pesawat di layar langsung berganti.
if (!SKINS[save.skin]) save.skin = 'classic';
const SKIN_BG = { classic: '#ffd0c9', police: '#bcd8ff', cat: '#ffe4a6', dino: '#c9f2bd' };
$('#planes').innerHTML = Object.keys(SKINS).map(k => `<button class="plane" role="radio" data-skin="${k}" aria-label="${SKINS[k].name}"><img alt="" src="${portrait('s-' + k, () => makePlane(k).root, { bg: SKIN_BG[k], zoom: 1.5 })}"></button>`).join('');
function showSkin() { $$('#planes .plane').forEach(b => b.setAttribute('aria-checked', b.dataset.skin === save.skin)); }
$('#planes').addEventListener('click', e => {
  const b = e.target.closest('.plane'); if (!b) return;
  save.skin = b.dataset.skin; persist(); setPlaneSkin(plane, save.skin); showSkin(); audio.play('ring'); fx.party(flight.state.pos); hop = 1;
});
let hop = 0;   // pesawat berputar gembira saat dipilih
showSkin();

// Pesan singkat di tengah atas (nabrak / terbang lagi)
let toastTimer = 0;
function toast(html, sec = 1.6) { $('#toast').innerHTML = html; $('#toast').hidden = false; toastTimer = sec; }

// Efek (partikel, jejak sayap, garis kecepatan, bintang pusing) + outline hitam tipis.
const fx = createFx(scene, camera, renderer);
const outline = createOutline(renderer, scene, camera, FOG);
const blur = propBlur();
plane.visual.add(blur);

// ── Audio ──
const audio = createAudio(save);
function syncSound() {
  $$('.mute use').forEach(u => u.setAttribute('href', save.muted ? '#i-mute' : '#i-sound'));
  $$('.mute').forEach(b => b.classList.toggle('red', save.muted));
  $$('.vol').forEach(r => (r.value = save.volume));
  audio.apply();
}
$$('.mute').forEach(b => b.addEventListener('click', () => { save.muted = !save.muted; persist(); syncSound(); }));
$$('.vol').forEach(r => r.addEventListener('input', () => { save.volume = +r.value; save.muted = false; persist(); syncSound(); }));
syncSound();
const firstGesture = () => { audio.unlock(); audio.music(true); audio.preloadVoices([...all.map(voName), CRASH_VO].filter(Boolean)); LETTERS.forEach(d => { if (d.big && !noPhoto.has(d.ch)) new Image().src = `assets/words/${d.lo}.webp`; }); };
addEventListener('pointerdown', firstGesture, { once: true });
addEventListener('keydown', firstGesture, { once: true });
$$('button').forEach(b => b.addEventListener('click', () => audio.play('click')));

// ── Input: keyboard + joystick sentuh ──
const keys = new Set();
const KEYMAP = { ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r', ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd', Space: 'b', ShiftLeft: 'b', ShiftRight: 'b' };
addEventListener('keydown', e => {
  if (e.code === 'Escape') { mode === 'play' ? setMode('pause') : mode === 'pause' ? setMode('play') : mode === 'book' && closeBook(); return; }
  if (KEYMAP[e.code]) { keys.add(KEYMAP[e.code]); if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault(); }
});
addEventListener('keyup', e => keys.delete(KEYMAP[e.code]));
addEventListener('blur', () => { keys.clear(); if (mode === 'play') setMode('pause'); });

const joy = { x: 0, y: 0, id: null, cx: 0, cy: 0 };
const JOY_R = 60;
const zone = $('#joyzone'), base = $('#joy'), knob = $('#knob');
zone.addEventListener('pointerdown', e => {
  joy.id = e.pointerId; joy.cx = e.clientX; joy.cy = e.clientY;
  try { zone.setPointerCapture(e.pointerId); } catch {}
  base.style.left = joy.cx + 'px'; base.style.top = joy.cy + 'px'; base.classList.add('on');
  moveJoy(e);
});
zone.addEventListener('pointermove', e => e.pointerId === joy.id && moveJoy(e));
const endJoy = e => { if (e.pointerId !== joy.id) return; joy.id = null; joy.x = joy.y = 0; knob.style.transform = ''; base.classList.remove('on'); };
zone.addEventListener('pointerup', endJoy);
zone.addEventListener('pointercancel', endJoy);
function moveJoy(e) {
  let dx = e.clientX - joy.cx, dy = e.clientY - joy.cy;
  const d = Math.hypot(dx, dy); if (d > JOY_R) { dx *= JOY_R / d; dy *= JOY_R / d; }
  joy.x = dx / JOY_R; joy.y = -dy / JOY_R;
  knob.style.transform = `translate(${dx}px, ${dy}px)`;
}
// Thrust: terkunci sampai objective pertama; tiap huruf/angka mengisi tangki (THRUST di config).
let thrust = 0, thrustHeld = false;
const thrustBtn = $('#bThrust'), thrustBar = $('#thrustBar');
thrustBtn.addEventListener('pointerdown', e => { thrustHeld = true; try { thrustBtn.setPointerCapture(e.pointerId); } catch {} });
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) thrustBtn.addEventListener(ev, () => (thrustHeld = false));
function drawThrust() {
  thrustBar.style.transform = `scaleX(${thrust / THRUST.max})`;
  $('#thrust').classList.toggle('empty', thrust <= 0);
  $('#thrust').classList.toggle('ready', thrust > 0);
}
const input = { x: 0, y: 0, boost: false };
function readInput() {
  const clamp = v => Math.max(-1, Math.min(1, v));
  input.x = clamp((keys.has('r') - keys.has('l')) + joy.x);
  input.y = clamp((keys.has('u') - keys.has('d')) + joy.y);
  input.boost = (keys.has('b') || thrustHeld) && thrust > 0;
  return input;
}

// ── Fullscreen: API standar (Android/desktop/iPad) atau "Tambah ke Layar Utama" (iPhone) ──
const docEl = document.documentElement;
const canFs = !!(docEl.requestFullscreen || docEl.webkitRequestFullscreen);
const standalone = matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || navigator.standalone;
const isFs = () => document.fullscreenElement || document.webkitFullscreenElement;
if (standalone) $$('.fs').forEach(b => (b.hidden = true));
$$('.fs').forEach(b => b.addEventListener('click', () => {
  if (!canFs) { $('#ios').hidden = false; return; }
  if (isFs()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  else Promise.resolve((docEl.requestFullscreen || docEl.webkitRequestFullscreen).call(docEl, { navigationUI: 'hide' }))
    .then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
}));
$('#iosClose').addEventListener('click', () => ($('#ios').hidden = true));

// ── Collectible ──
const all = [...LETTERS, ...NUMBERS];
const owned = ch => save.got.includes(ch);
function resetItems() {
  for (const it of world.items) {
    it.state = 'idle'; it.mesh.visible = true; it.mesh.scale.setScalar(1);
  }
}
resetItems();
function updateCounts() {
  for (const [id, list] of [['#cL', LETTERS], ['#cN', NUMBERS]]) {
    const n = list.filter(d => owned(d.ch)).length, el = $(id), pill = el.closest('.pill');
    if (el.textContent !== String(n)) { pill.classList.remove('bump'); void pill.offsetWidth; pill.classList.add('bump'); }
    el.textContent = n; pill.style.setProperty('--p', n / list.length * 100 + '%');
  }
}
updateCounts();

const colorNum = d => COLORS[d.i % COLORS.length];
const colorOf = d => '#' + colorNum(d).toString(16).padStart(6, '0');
// Klip narator rekaman: audio/vo/letter_a.mp3 … number_9.mp3
const voName = d => (d.kind === 'letter' ? 'letter_' + d.ch.toLowerCase() : 'number_' + d.n);


let cardTimer = 0;
// Foto asli kata (assets/words/<huruf>.webp, Wikimedia Commons). Tanpa foto (mis. nama tokoh) → emoji.
// Gambar berlisensi milik sendiri cukup ditaruh di folder itu dengan nama huruf → otomatis dipakai.
const noPhoto = new Set(NO_PHOTO);
const photo = d => (d.kind === 'letter' && !noPhoto.has(d.ch)
  ? `<img src="assets/words/${d.ch.toLowerCase()}.webp" alt="${d.word}" data-ch="${d.ch}" data-icon="${d.icon}">` : d.icon);
document.addEventListener('error', e => {
  const i = e.target;
  if (i.tagName === 'IMG' && i.dataset.icon) { noPhoto.add(i.dataset.ch); i.replaceWith(i.dataset.icon); }
}, true);
fetch('assets/words/credits.json').then(r => r.json()).then(c => {
  $('#photoCredit').textContent = 'Foto: Wikimedia Commons — ' + Object.entries(c).map(([k, v]) => `${k.toUpperCase()}: ${v.author} (${v.license})`).join(' · ');
}).catch(() => {});
const STAR = '<svg><use href="#i-star"/></svg>';

// Notifikasi besar saat mengambil objective: huruf besar+kecil (yang diambil paling menonjol), gambar utuh, kata.
function showCard(d, fresh = false) {
  const letter = d.kind === 'letter', pair = letter && owned(d.up) && owned(d.lo);
  const pic = letter ? `<span class="pic">${photo(d)}</span>`
    : d.n ? `<span class="stars">${STAR.repeat(d.n)}</span>` : '<span class="stars empty">☁️</span>';
  const big = letter ? `<b class="${d.big || pair ? 'on' : ''}">${d.up}</b><b class="${d.big && !pair ? '' : 'on'}">${d.lo}</b>` : `<b class="on">${d.ch}</b>`;
  const word = letter ? `<small>${d.ch} untuk</small><em>${d.word[0]}</em>${d.word.slice(1)}` : d.word;
  const c = $('#card');
  c.style.setProperty('--c', colorOf(d));
  c.innerHTML = `${fresh ? `<span class="ribbon">${STAR.repeat(pair ? 3 : 1)}</span>` : ''}<span class="ltr">${big}</span>${pic}<span class="word">${word}</span>`;
  popCard();
}
let bookTimer = 0;
function popCard() {
  const c = $('#card');
  c.hidden = true; void c.offsetWidth; c.hidden = false; c.classList.remove('out');
  cardTimer = 3.4;
  clearTimeout(bookTimer);
  if (mode === 'book') bookTimer = setTimeout(() => { c.hidden = true; }, 3800);
}

function collect(it) {
  it.state = 'pop'; it.t = 0;
  fx.collect(it.mesh.position, colorNum(it.data));
  audio.play('pickup');
  setTimeout(() => audio.voice(voName(it.data)), 250);
  const fresh = !owned(it.data.ch);
  if (fresh) { save.got.push(it.data.ch); persist(); updateCounts(); }
  showCard(it.data, fresh);
  if (fresh && save.got.length === all.length) toast('🏆✨', 5);
  thrust = Math.min(THRUST.max, thrust + THRUST.perItem); drawThrust();
  if (it.data.kind === 'letter') quests.event('letter', it.data.ch);
  const other = it.data.kind === 'letter' && (it.data.big ? it.data.lo : it.data.up);
  if (other && owned(other)) quests.event('pair', it.data.up);
  if (fresh && other && owned(other)) { fx.party(pos); setTimeout(() => audio.play('fanfare'), 1600); }   // pasangan Aa lengkap
  if (tut) tut.collected = true;
}

// ── Collection book ──
let bookReturn = 'menu';
function openBook() {
  bookReturn = mode;
  audio.play('open');
  drawBook(); setMode('book');
}
let tab = 'abc';
$('#tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { tab = b.dataset.tab; audio.play('click'); drawBook(); } });
function drawBook() {
  $$('#tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === tab));
  const num = d => (owned(d.ch)
    ? `<button class="tile" data-ch="${d.ch}" style="--c:${colorOf(d)}"><b>${d.ch}</b><span class="stars">${STAR.repeat(d.n)}</span></button>`
    : `<button class="tile off" data-ch="${d.ch}"><b>${d.ch}</b></button>`);
  // Huruf ditampilkan berpasangan (Aa) berurutan A–Z; yang belum ditemukan tampak abu-abu.
  const pairTile = d => {
    const U = owned(d.up), l = owned(d.lo);
    return `<button class="tile ${U || l ? '' : 'off'}" data-ch="${U ? d.up : d.lo}" style="--c:${colorOf(d)}"><span class="pair"><b class="${U ? '' : 'no'}">${d.up}</b><b class="${l ? '' : 'no'}">${d.lo}</b></span>${U || l ? photo(d) : ''}</button>`;
  };
  const T = { abc: [LETTERS.filter(d => d.big).map(pairTile), LETTERS.filter(d => owned(d.ch)).length, LETTERS.length], num: [NUMBERS.map(num), NUMBERS.filter(d => owned(d.ch)).length, NUMBERS.length] }[tab];
  $('#grid').className = tab; $('#grid').innerHTML = T[0].join('');
  $('#total').style.setProperty('--p', T[1] / T[2] * 100 + '%'); $('#total b').textContent = `${T[1]} / ${T[2]}`;
  $('#photoCredit').hidden = tab !== 'abc';
  outline.render();   // potret memakai kanvas yang sama: gambar ulang latar saat permainan sedang jeda
}
const closeBook = () => setMode(bookReturn);
$$('.book').forEach(b => b.addEventListener('click', openBook));
$('#grid').addEventListener('click', e => {   // ketuk kartu yang sudah dimiliki → dengar lagi
  const t = e.target.closest('.tile:not(.off)'); if (!t) return;
  const d = all.find(d => d.ch === t.dataset.ch); showCard(d); audio.voice(voName(d));
});
$('#bClose').addEventListener('click', closeBook);

// ── Tutorial singkat (sekali, bisa dilewati) ──
const TUT = [
  // Semua langkah berupa gambar bergerak, tidak perlu membaca.
  { tip: () => demo(ic('plane', 'go')), done: s => s.t > 2 },
  { tip: () => demo(`<kbd class="k1">◀</kbd>${ic('plane', 'lr')}<kbd class="k2">▶</kbd>`), touch: () => demo(`<i class="jd lr"></i>${ic('plane', 'lr')}`), done: s => s.turned > 1.2 },
  { tip: () => demo(`<span class="col"><kbd class="k1">▲</kbd><kbd class="k2">▼</kbd></span>${ic('plane', 'ud')}`), touch: () => demo(`<i class="jd ud"></i>${ic('plane', 'ud')}`), done: s => s.climbed > 1.2 },
  { tip: () => demo(`${ic('plane', 'go2')}<b class="goal">A</b>`), done: s => s.collected },
];
let tut = null, touchUsed = matchMedia('(pointer: coarse)').matches;
addEventListener('touchstart', () => (touchUsed = true), { once: true, passive: true });
function tutStep(i) {
  if (i >= TUT.length) { endTutorial(); return; }
  tut.step = i; tut.t = 0;
  const s = TUT[i];
  $('#tipText').innerHTML = (touchUsed && s.touch ? s.touch : s.tip)();
  $('#tip').hidden = false;
}
function endTutorial() { tut = null; $('#tip').hidden = true; save.tutorialDone = true; persist(); }
$('#tipSkip').addEventListener('click', endTutorial);

// ── Mode & menu ──
const demo = html => `<span class="demo">${html}</span>`, ic = (n, c = '') => `<svg class="${c}"><use href="#i-${n}"/></svg>`;
$('h1').innerHTML = 'Sky|Explorers'.split('|').map(w => `<span>${[...w].map((ch, i) => `<i style="--i:${i};color:#${COLORS[i % COLORS.length].toString(16).padStart(6, '0')}">${ch}</i>`).join('')}</span>`).join('');
let mode = 'menu';
function setMode(m) {
  mode = m;
  if (m !== 'menu') camera.clearViewOffset();
  $('#menu').hidden = m !== 'menu';
  $('#pause').hidden = m !== 'pause';
  $('#book').hidden = m !== 'book';
  $('#hud').hidden = m !== 'play';
  $('#joyzone').hidden = m !== 'play';
  if (m !== 'play') { $('#card').hidden = true; cardTimer = 0; keys.clear(); joy.x = joy.y = 0; base.classList.remove('on'); }
  audio.flight(m === 'play'); if (m !== 'play') audio.ambient(0, 0);
}
function startFlight() {
  flight.reset(); resetItems(); play.reset(); thrust = 0; drawThrust(); camera.clearViewOffset(); setMode('play'); quests.refresh();
  if (!save.tutorialDone) { tut = { step: 0, t: 0, turned: 0, climbed: 0, collected: false }; tutStep(0); }
}
$('#mPlay').addEventListener('click', startFlight);
$('#bPause').addEventListener('click', () => setMode('pause'));
$('#pResume').addEventListener('click', () => setMode('play'));
$('#pRestart').addEventListener('click', startFlight);
$('#pMenu').addEventListener('click', () => { tut = null; $('#tip').hidden = true; $('#card').hidden = true; $('#toast').hidden = true; flight.reset(); resetItems(); setMode('menu'); });
$('#bHint').addEventListener('click', () => { save.hint = !save.hint; persist(); $('#bHint').classList.toggle('off', !save.hint); });
$('#bHint').classList.toggle('off', !save.hint);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (mode === 'play') setMode('pause'); audio.suspend(); }
  else audio.unlock();
});

// ── Misi huruf ──
const missionEl = $('#mission');
const quests = createQuests({
  world, save, persist, flight, fx, audio, owned,
  onStar: n => { const p = $('#cS'); p.textContent = n; const k = p.closest('.pill'); k.classList.remove('bump'); void k.offsetWidth; k.classList.add('bump'); },
  onMission: (m, n, done) => {
    const find = m.k === 'find' && m.target;
    missionEl.querySelector('.mi').innerHTML = find ? `<b style="color:${colorOf(m.target)}">${m.target.ch}</b>` : m.icon;
    missionEl.classList.toggle('find', !!find);
    if (find && !done && mode === 'play' && !tut) setTimeout(() => mode === 'play' && quests.target === m.target && audio.voice(voName(m.target)), 900);   // terdengar hurufnya, lalu dicari
    missionEl.querySelector('.dots').innerHTML = find && !done ? ic('sound') : Array.from({ length: m.n }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('');
    missionEl.classList.toggle('done', done); missionEl.classList.remove('bump'); void missionEl.offsetWidth; missionEl.classList.add('bump');
    if (done) toast('⭐⭐⭐⭐⭐', 2.4);
  },
});
missionEl.addEventListener('click', () => { if (quests.target) { audio.voice(voName(quests.target)); missionEl.classList.remove('bump'); void missionEl.offsetWidth; missionEl.classList.add('bump'); } });
const play = createPlay({
  scene, world, flight, fx, audio, quests, owned, say: d => audio.voice(voName(d)), showCard,
});
$('#cS').textContent = save.stars || 0; quests.refresh();

// Suara sekitar: burung di darat, ombak di laut, peluit kereta & sapi saat lewat.
let ambT = 0, hornT = 0, mooT = 0;
const STATION = oldTown(-62, -30);
function ambience(dt) {
  hornT -= dt; mooT -= dt;
  if ((ambT -= dt) > 0) return;
  ambT = 0.3;
  const on = mode === 'play' && !flight.crashed, g = heightAt(pos.x, pos.z), low = Math.max(0, 1 - Math.max(0, pos.y - Math.max(g, 0) - 25) / 60);
  audio.ambient(on && g > 0 ? low : 0, on && g < 1.5 ? low : 0);
  const d = (x, z) => Math.hypot(wrapC(x - pos.x), wrapC(z - pos.z));
  if (on && hornT <= 0 && d(...STATION) < 75) { audio.play('horn'); hornT = 26; }
  if (on && mooT <= 0 && d(LEMBANG.x, LEMBANG.z) < 50) { audio.play('moo', 0.9 + Math.random() * 0.3); mooT = 14; }
}

// ── Loop ──
const clock = new THREE.Clock();
let smoothDt = 1 / 60;   // langkah waktu diratakan → gerak tidak tersentak saat frame tidak rata
let t = 0, wasBoost = false, slowFrames = 0, frames = 0;
const AUTOPILOT = { x: 0.35, y: 0, boost: false }, NO_INPUT = { x: 0, y: 0, boost: false };
const R2 = FLIGHT.collectRadius ** 2, SHOW = 340;   // huruf terlihat sampai 340 unit, membesar dengan jarak agar tetap terbaca
const pos = flight.state.pos;
// Panah petunjuk: maks. 3 objective terdekat dalam HINT_R; objective jauh tidak ditunjuk.
const HINT_R = 260, inds = [0, 1, 2].map(() => {
  const el = document.createElement('div');
  el.className = 'ind'; el.innerHTML = '<span class="ar"><svg><use href="#i-play"/></svg></span><b></b>';
  $('#inds').append(el); return el;
});
const ndc = new THREE.Vector3(), camDir = new THREE.Vector3();
// Panah 3D di atas pesawat: menunjuk objective terdekat.
let guideA = 0;
const guide = makeArrow();
scene.add(guide);

// Menu: kamera mengitari wajah pesawat yang dipilih, digeser supaya tidak tertutup panel.
const heroLook = new THREE.Vector3();
function heroCamera(dt) {
  const a = flight.state.yaw + Math.sin(t * 0.35) * 0.55 - 0.45, wide = innerWidth > innerHeight, D = wide ? 8.5 : 10.5;
  camera.up.set(0, 1, 0); camera.position.set(pos.x - Math.sin(a) * D, pos.y + 1.6, pos.z - Math.cos(a) * D);
  camera.lookAt(heroLook.copy(pos));
  if (wide) camera.setViewOffset(innerWidth, innerHeight, -Math.min(230, innerWidth * 0.17), 0, innerWidth, innerHeight);
  else camera.setViewOffset(innerWidth, innerHeight, 0, innerHeight * 0.27, innerWidth, innerHeight);
  hop = Math.max(0, hop - dt * 1.4);
  plane.visual.rotation.z += (1 - Math.pow(1 - hop, 3)) * Math.PI * 2; plane.visual.visible = true;
}

renderer.setAnimationLoop(() => {
  const raw = Math.min(clock.getDelta(), 0.05), dt = smoothDt += (raw - smoothDt) * 0.2;
  if (mode === 'pause' || mode === 'book' || document.hidden) return;  // tidak render saat jeda
  t += dt;

  const inp = mode === 'play' && !flight.crashed ? readInput() : mode === 'play' ? NO_INPUT : AUTOPILOT;
  const ev = flight.update(dt, inp, t, mode !== 'play');
  world.update(t, dt, camera.position, pos, camera.getWorldDirection(camDir));

  if (toastTimer > 0 && (toastTimer -= dt) <= 0) $('#toast').hidden = true;
  if (ev === 'respawn') {
    // Mulai lagi dari titik awal. Koleksi & tangki thrust TIDAK berkurang.
    flight.reset();
    toast('✈️✨', 1.4);
  } else if (ev) {
    CRASH_VO ? audio.voice(CRASH_VO) : audio.play('bump'); audio.flight(false);   // SFX nabrak dari pemilik (audio/vo/crash_aduh.mp3)
    fx.crash(pos, ev === 'water'); $('#card').hidden = true; cardTimer = 0; play.reset();
    toast(ev === 'water' ? '💦' : '💥', 2.2);
  }

  if (mode === 'play' && !flight.crashed) {
    if (inp.boost && !wasBoost) audio.play('whoosh');
    if (inp.boost) { thrust = Math.max(0, thrust - dt); drawThrust(); }
    wasBoost = inp.boost;
    audio.flight(true, (flight.state.speed - FLIGHT.speed) / (FLIGHT.boost - FLIGHT.speed));

    if (tut) {
      tut.t += dt; tut.turned += Math.abs(inp.x) * dt; tut.climbed += Math.abs(inp.y) * dt;
      if (TUT[tut.step].done(tut)) tutStep(tut.step + 1);
    }
    if (cardTimer > 0) {
      cardTimer -= dt;
      if (cardTimer < 0.25) $('#card').classList.add('out');
      if (cardTimer <= 0) $('#card').hidden = true;
    }
  }

  // Collectible: melayang + berputar, diambil otomatis berdasarkan jarak.
  const near3 = [];
  for (const it of world.items) {
    const m = it.mesh;
    if (it.state === 'idle') {
      // Menghadap kamera sambil bergoyang pelan: tidak pernah terlihat dari samping (tetap terbaca).
      m.rotation.y = Math.atan2(camera.position.x - m.position.x, camera.position.z - m.position.z) + Math.sin(t * 0.9 + it.phase) * 0.3;
      m.position.set(near(it.home.x, pos.x), it.home.y + Math.sin(t * 1.6 + it.phase) * 0.6, near(it.home.z, pos.z)); // salinan terdekat
      const d2 = m.position.distanceToSquared(pos);
      const d = Math.sqrt(d2), tgt = quests.target === it.data, have = owned(it.data.ch) && !tgt, vis = Math.min(1, Math.max(0, (SHOW - d) / 40));
      m.visible = vis > 0.15;
      const want = Math.max(0.001, vis) * (have ? 0.7 : 1) * Math.min(2.6, Math.max(1, 1 + (d - 50) / 120));
      it.s = it.s === undefined ? want : it.s + (want - it.s) * (1 - Math.exp(-7 * dt)); m.scale.setScalar(it.s);
      it.halo.visible = !have;   // sudah dimiliki: lebih kecil & tanpa cahaya, warna tetap penuh
      if (mode === 'play' && !flight.crashed && d2 < R2) collect(it);
      else if (tgt || !have && d2 < HINT_R * HINT_R) near3.push([tgt ? -1 : d2, it]);   // huruf misi selalu ditunjuk lebih dulu
    } else if (it.state === 'pop') {
      it.t += dt;
      const u = Math.min(1, it.t / 0.5); m.scale.setScalar((it.s || 1) * Math.max(0.001, (1 + 2.2 * u) * (1 - u * u * u)));   // membesar lalu lenyap halus
      if (it.t > 0.5) { it.state = 'gone'; m.visible = false; }
    }
  }

  // Panah petunjuk ke collectible terdekat yang belum dimiliki (bisa dimatikan).
  near3.sort((a, b) => a[0] * (a[1].shown ? 0.7 : 1) - b[0] * (b[1].shown ? 0.7 : 1));   // yang sedang ditunjuk tidak mudah berganti
  for (const el of inds) if (el.it && !near3.slice(0, 3).some(n => n[1] === el.it)) { el.it.shown = false; el.it = null; }
  for (const [, it] of near3.slice(0, 3)) if (!it.shown) { const el = inds.find(e => !e.it); if (el) { el.it = it; it.shown = true; el.snap = true; } }
  const placed = [], first = near3[0]?.[1];
  guide.visible = !!first && mode === 'play' && save.hint && !flight.crashed;
  if (guide.visible) {
    const cy = Math.atan2(-camDir.x, -camDir.z), rel = Math.atan2(-(first.mesh.position.x - pos.x), -(first.mesh.position.z - pos.z)) - cy;
    guideA += Math.atan2(Math.sin(rel - guideA), Math.cos(rel - guideA)) * (1 - Math.exp(-6 * dt));   // berputar halus seperti kompas
    guide.position.set(pos.x, pos.y + 2.6 + Math.sin(t * 2.4) * 0.1, pos.z); guide.rotation.set(0, cy, 0); guide.rotateX(0.95); guide.rotateY(guideA); guide.scale.setScalar(0.5);
    guide.material.color.set(colorNum(first.data)); guide.material.emissive.set(colorNum(first.data)).multiplyScalar(0.4);
  }
  inds.forEach(el => {
    const it = el.it;
    el.hidden = !(it && mode === 'play' && save.hint && !flight.crashed);
    if (el.hidden) { el.snap = true; return; }
    ndc.copy(it.mesh.position).add({ x: 0, y: 3.5 * it.mesh.scale.y, z: 0 }).project(camera);
    const behind = ndc.z > 1, lim = el.on ? 1.05 : 1, onScreen = el.on = !behind && Math.abs(ndc.x) < 0.9 * lim && Math.abs(ndc.y) < 0.85 * lim;
    let x = ndc.x, y = ndc.y, ang = 0;
    if (!onScreen) {                                              // di tepi layar: panah menunjuk ke arah objek
      if (behind) { x = -x; y = -y; }
      ang = Math.atan2(-y, x);
      const k2 = 0.86 / Math.max(Math.abs(x) / 0.92, Math.abs(y) / 0.8, 1e-3);
      x *= k2; y *= k2;
    }
    el.classList.toggle('on-screen', onScreen); el.classList.toggle('tgt', quests.target === it.data);
    let px = (x * 0.5 + 0.5) * innerWidth, py = Math.min((-y * 0.5 + 0.5) * innerHeight, onScreen ? 1e9 : innerHeight - (innerHeight > innerWidth ? 215 : innerHeight < 520 ? 105 : 165));   // jangan tertutup tombol roket & strip abjad
    for (let k = 0; k < 3; k++) for (const [qx, qy] of placed) if (Math.hypot(px - qx, py - qy) < 62) {   // jangan bertumpuk: geser sepanjang tepi
      if (Math.abs(x) > Math.abs(y) * 1.1) py = qy + (py > qy ? 64 : -64); else px = qx + (px > qx ? 64 : -64);
    }
    placed.push([px, py]);
    if (el.snap) { el.px = px; el.py = py; el.a = onScreen ? Math.PI / 2 : ang; el.snap = false; }
    const k3 = 1 - Math.exp(-(onScreen ? 16 : 9) * dt), ta = onScreen ? Math.PI / 2 : ang;
    el.px += (px - el.px) * k3; el.py += (py - el.py) * k3; el.a += Math.atan2(Math.sin(ta - el.a), Math.cos(ta - el.a)) * k3;
    el.style.transform = `translate(${el.px.toFixed(1)}px, ${el.py.toFixed(1)}px)`;
    el.style.setProperty('--c', colorOf(it.data));
    el.firstChild.style.transform = onScreen ? 'rotate(90deg)' : `rotate(${el.a}rad) translateX(${quests.target === it.data ? 46 : 34}px)`;  // di atas objek: menunjuk ke bawah
    el.lastChild.textContent = it.data.ch;
  });

  const speed01 = (flight.state.speed - FLIGHT.speed) / (FLIGHT.boost - FLIGHT.speed);
  if (mode === 'play' && !flight.crashed) play.update(dt, t, camera.position);
  ambience(dt);
  const inCloud = world.life.clouds.some(c => Math.abs(c[1] - pos.y) < 5 * c[3] && Math.hypot(wrapC(c[0] - pos.x), wrapC(c[2] - pos.z)) < 6 * c[3]);
  fx.update(dt, { plane, boosting: mode === 'play' && (inp.boost || flight.state.push > 0) && !flight.crashed, crashed: flight.crashed, flying: !flight.crashed, mist: inCloud && !flight.crashed, spray: pos.y < 9 && heightAt(pos.x, pos.z) < 0 && !flight.crashed });
  if (mode === 'menu') heroCamera(dt);
  blur.material.opacity = flight.crashed ? 0 : 0.65 + 0.35 * speed01;

  const g = Math.max(heightAt(pos.x, pos.z), 0);
  shadow.visible = !SHADOWS || pos.y - g > 40;   // desktop: bayangan matahari sudah ada; blob hanya saat sangat tinggi
  shadow.position.set(pos.x, g + 0.15, pos.z);
  shadow.scale.setScalar(Math.max(0.35, 1 - (pos.y - g) / 70));
  shadow.material.opacity = 0.4 * Math.max(0.25, 1 - (pos.y - g) / 80);

  outline.render();

  // Resolusi adaptif sederhana: bila sering lambat, turunkan pixel ratio ke 1.
  if (raw > 0.024) slowFrames++;
  if (++frames === 180) { if (slowFrames > 60 && pixelRatio > 0.75) { pixelRatio = pixelRatio > 1 ? 1 : 0.75; renderer.setPixelRatio(pixelRatio); } frames = slowFrames = 0; }
});

window.__sky = { play, showCard, quests, fx, outline, plane, flight, world, save, setMode, renderer, scene, camera, input: joy, keys, get thrust() { return thrust; } }; // untuk uji otomatis
