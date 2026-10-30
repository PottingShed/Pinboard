// Pinboard: ties the two views, the menus, adding work, comments, live
// updates and TV mode together.

import { $, $$, h, clamp, sleep, api, toast, fmtDate, fileUrl, hash, reduceMotion, PREVIEW } from './util.js';
import { state, remember, childrenOf, selection, matches, inView, fromWebsite, ourWork, onTvs, boardsWith, TYPES } from './store.js';
import { analyse, hsv, toHex, fromHex, toHsv } from './colour.js';
import { DARK_COLOURS, describe, refreshHeart, retape, notePlace, HEART } from './pieces.js';
import { initBoards, loadBoards, applyBoard, renderMenu, menuClosed, openSave, saveTo } from './boards.js';
import { createWall } from './wall.js';
import { createGrid } from './grid.js';
import { kindOf, prepImage, prepVideo, uploadBlob } from './upload.js';
import { isLocalPin } from './local.js';
import './glass.js';

// In the prototype, only what you've added in this browser can be changed or taken down.
const yours = (p) => !PREVIEW || isLocalPin(p);

// One brand colour at a time, for the logo and anything that needs a highlight.
// Royal blue is the only one dark enough to need light text on it.
const BRAND = ['#FE1658', '#FDE619', '#01FECD', '#12CDFF', '#245FFF', '#FF16A5', '#FF840A', '#FFADA2', '#CEFF00', '#69FF46'];

const hooks = { onTap: tap, onColours: saveColours, onInteract: interact, onHold: holdNote, onNoteMove: moveNote };
const wall = createWall($('#wall'), hooks);
const grid = createGrid($('#grid'), hooks);
let view = wall;
let showing = []; // the pieces in the current arrangement, in order (for next/previous)


function setAccent() {
  const now = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim().toUpperCase();
  const choices = BRAND.filter((c) => c !== now);
  const accent = choices[Math.floor(Math.random() * choices.length)];
  document.documentElement.style.setProperty('--accent', accent);
  document.documentElement.style.setProperty('--on-accent', DARK_COLOURS.has(accent) ? '#F2F2F2' : '#171717');
  setCursor(accent);
}

// The pointer is a little dot in the logo's colour. Holding space makes it a ring.
function setCursor(colour) {
  const svg = (shape) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24">${shape}</svg>`)}") 12 12`;
  const root = document.documentElement;
  root.style.setProperty('--dot', `${svg(`<circle cx="12" cy="12" r="6.5" fill="${colour}"/>`)}, auto`);
  root.style.setProperty('--ring', `${svg(`<circle cx="12" cy="12" r="9" fill="none" stroke="${colour}" stroke-width="2.5"/>`)}, grab`);
  root.classList.add('dotted');
}

// Hover the logo and it takes another brand colour while its leaves hop, left
// to right. A hop always finishes before the next one starts.
const logo = $('.logo');
const leaves = $$('.leaf', logo);
logo.addEventListener('pointerenter', (e) => {
  if (e.pointerType !== 'mouse' || state.tv) return;
  setAccent();
  logo.classList.add('logo--hop');
});
leaves.at(-1).addEventListener('animationend', () => logo.classList.remove('logo--hop'));

// Going in and out of TV mode the logo glides between its corner and the
// middle of the screen: measure it, make the change, then play it back from
// where it was (as a transform, so it stays smooth while the wall redraws).
function glideLogo(change) {
  const from = logo.getBoundingClientRect();
  for (const a of logo.getAnimations()) if (a.id === 'glide') a.cancel();
  change();
  if (reduceMotion) return;
  const to = logo.getBoundingClientRect();
  const m = new DOMMatrix(getComputedStyle(logo).transform);
  const x = to.left - m.e, y = to.top - m.f; // where it sits before its own transform
  logo.animate([
    { transformOrigin: '0 0', transform: `translate(${from.left - x}px, ${from.top - y}px) scale(${from.width / to.width})` },
    { transformOrigin: '0 0', transform: `translate(${m.e}px, ${m.f}px)` },
  ], { id: 'glide', duration: 1200, easing: 'cubic-bezier(0.65, 0, 0.25, 1)' });
}

// ------------------------------------------------------------------ palette cards
//
// Every so often among the work there's a card with one piece's colours on it,
// like the paint chips and swatches that end up on a real studio wall.

const palettes = new Map();

// A handful only: client work (not the showreel), one card per project, and
// well spread out.
const paletteWorthy = (p) => ourWork(p) && !/showreel/i.test(p.title || '');
const PALETTE_EVERY = 32;
const PALETTE_MAX = 5;

function withPalettes(list) {
  palettes.clear();
  const out = [];
  const done = new Set();
  let since = 0;
  list.forEach((p) => {
    out.push(p);
    since++;
    const colours = (p.colors?.palette || []).map((e) => (typeof e === 'string' ? e : e.c));
    const project = p.title || p.id;
    if (since < PALETTE_EVERY || done.size >= PALETTE_MAX || colours.length < 4 || !paletteWorthy(p) || done.has(project)) return;
    since = 0;
    done.add(project);
    const style = hash(p.id) % 2 ? 'strip' : 'row';
    const lightness = (c) => { const [r, g, b] = fromHex(c); return r * 0.3 + g * 0.59 + b * 0.11; };
    const card = {
      id: `palette-${p.id}`,
      kind: 'palette',
      style,
      title: p.title,
      from: p.id,
      // a paint strip runs light to dark; a swatch row keeps the biggest colour first
      colours: (style === 'strip' ? [...colours].sort((a, b) => lightness(b) - lightness(a)) : colours).slice(0, 5),
    };
    palettes.set(card.id, card);
    out.push(card);
  });
  return out;
}

// ------------------------------------------------------------------ drawing the wall

function render() {
  // Everything that matches goes up: the views only load media near the screen.
  const list = selection();
  showing = list;
  wall.root.hidden = state.view !== 'wall';
  grid.root.hidden = state.view !== 'grid';
  if (state.view === 'wall') grid.hide();
  view = state.view === 'grid' ? grid : wall;
  view.show(withPalettes(list));
  updateChrome(list);
}

// What an empty wall says when you're looking at one type, and what its button adds.
const EMPTY = {
  public: ['No ', h('em', {}, 'approved'), ' work yet.'],
  wip: ['No work in ', h('em', {}, 'progress'), ' yet.'],
  inspo: ['No ', h('em', {}, 'inspo'), ' pinned yet.'],
  social: ['No ', h('em', {}, 'social'), ' snaps yet.'],
};
const ADD = { inspo: 'Add inspo', social: 'Add photos' };

function updateChrome(list) {
  const board = state.boards.get(state.board);
  if (list) {
    const type = board ? null : state.show;
    // e.g. nothing but video, and video's off
    const filteredOut = !state.video && [...state.pins.values()].some((p) => p.kind === 'video' && inView(p));
    $('#empty').hidden = list.length > 0;
    $('#empty-text').replaceChildren(...(filteredOut
      ? ['Nothing to show', h('br'), 'with video ', h('em', {}, 'off'), '.']
      : board
        ? ['Nothing on ', h('em', {}, board.name), ' yet.', h('br'), h('small', {}, 'Tap the heart on any piece to save it here.')]
        : EMPTY[type] || ['The wall’s bare.', h('br'), 'Pin the ', h('em', {}, 'first'), ' thing.']));
    $('#empty-add').textContent = board ? 'Back to all work' : ADD[type] || 'Add work';
    $('#empty-clear').hidden = !filteredOut;
    $('#empty-clear').textContent = 'Turn video on';
  }

  // On a board, or looking at one type, a label by the logo says so, with a way back.
  $('#section').hidden = state.tv || (!board && state.show === 'all');
  $('#section').classList.toggle('section--board', !!board);
  $('#section-name').textContent = board ? board.name : TYPES[state.show]?.name.toLowerCase() || '';
  $('#boards-btn').classList.toggle('is-on', !!board);
  $('#video-switch').checked = state.video;

  const toGrid = state.view === 'wall';
  const vb = $('#view-btn');
  vb.classList.toggle('is-grid', !toGrid);
  vb.setAttribute('aria-label', toGrid ? 'Switch to the grid' : 'Switch to the wall');
  vb.title = toGrid ? 'Grid' : 'Wall';
  $('#zoom').hidden = state.view !== 'wall';

  showColour(state.colour);
  $('#colour-btn').setAttribute('aria-label', state.colour ? `Sorted by ${state.colour.toUpperCase()}. Change colour` : 'Sort by colour');
  $('#colour-clear').hidden = !state.colour;
  $('#order-hint').hidden = !state.colour;
  for (const seg of $$('.pop__seg')) {
    const group = seg.dataset.group;
    for (const b of $$('button', seg)) {
      b.setAttribute('aria-pressed', String(state[group] === b.dataset.value && !(group === 'order' && state.colour) && !(group === 'show' && state.board)));
    }
    slideThumb(seg);
  }
}

// The choice that's on has an ink pill under it, which slides across to the
// next one. It can only be measured while its menu is open.
function slideThumb(seg, still = false) {
  const on = $('[aria-pressed="true"]', seg);
  const appearing = seg.classList.contains('is-empty');
  seg.classList.toggle('is-empty', !on);
  if (!on?.offsetWidth) return;
  seg.classList.toggle('is-still', still || appearing); // arrives in place rather than sliding from where it last was
  seg.style.setProperty('--x', `${on.offsetLeft}px`);
  seg.style.setProperty('--w', `${on.offsetWidth}px`);
  void seg.offsetWidth;
  seg.classList.remove('is-still');
}

// The nav's colour circle: the chosen colour, or the whole wheel when there isn't one.
function showColour(hex) {
  const dot = $('#colour-dot');
  if (hex) dot.style.setProperty('--set', hex); // kept when cleared, so it fades in its own colour
  dot.classList.toggle('is-set', !!hex);
}

function sortByColour(hex) {
  remember('colour', hex);
  render();
}

function clearColour() {
  remember('colour', null);
  render();
}

// ------------------------------------------------------------------ the pill and its menus

const pops = {
  boards: [$('#boards-btn'), $('#boards-menu')],
  colour: [$('#colour-btn'), $('#colour-menu')],
  more: [$('#more-btn'), $('#more-menu')],
};

function togglePop(name, force) {
  const changed = [];
  for (const [key, [btn, pop]] of Object.entries(pops)) {
    const open = key === name ? (force ?? pop.hidden) : false;
    if (open !== pop.hidden) continue;
    pop.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    changed.push([btn, pop, open]);
  }
  if (!pops.colour[1].hidden) openWheel();
  if (!pops.boards[1].hidden) renderMenu();
  else menuClosed();
  for (const [btn, pop, open] of changed) {
    if (open) popIn(pop, btn);
    else popOut(pop);
  }
}
const closePops = () => togglePop(null);

// A menu grows out of the button that opened it on a spring, its contents a
// beat behind, and tucks back into it when it closes. A closing menu is hidden
// straight away, so nothing thinks it's still open, but stays in sight as it goes.
const SPRING = getComputedStyle(document.documentElement).getPropertyValue('--spring').trim();

function popIn(pop, btn) {
  for (const a of pop.getAnimations({ subtree: true })) a.cancel();
  pop.classList.remove('is-leaving');
  for (const seg of $$('.pop__seg', pop)) slideThumb(seg, true);
  if (reduceMotion) return;
  const b = btn.getBoundingClientRect();
  const r = pop.getBoundingClientRect();
  pop.style.transformOrigin = `${b.left + b.width / 2 - r.left}px ${b.top + b.height / 2 - r.top}px`;
  pop.animate([{ scale: '0.82' }, { scale: '1' }], { duration: 560, easing: SPRING });
  pop.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
  $$(':scope > :not(.boards), :scope > .boards > *', pop).slice(0, 12).forEach((el, i) => el.animate(
    [{ opacity: 0, translate: '0 10px' }, { opacity: 1, translate: '0 0' }],
    { duration: 560, delay: 60 + i * 28, easing: SPRING, fill: 'backwards' },
  ));
}

function popOut(pop) {
  if (reduceMotion) return;
  for (const a of pop.getAnimations({ subtree: true })) a.cancel();
  pop.classList.add('is-leaving');
  const out = pop.animate([{ opacity: 1, scale: '1' }, { opacity: 0, scale: '0.9' }], { duration: 170, easing: 'cubic-bezier(0.4, 0, 1, 1)' });
  out.onfinish = () => pop.classList.remove('is-leaving');
}

$('#add-btn').addEventListener('click', () => { closePops(); openMedia(); });
$('#boards-btn').addEventListener('click', () => togglePop('boards'));
$('#colour-btn').addEventListener('click', () => togglePop('colour'));
$('#more-btn').addEventListener('click', () => togglePop('more'));
// Clicking away from an open menu just closes it; it doesn't also open whatever was underneath.
let dismissing = false;
document.addEventListener('pointerdown', (e) => {
  if (e.target.closest('.nav, .pop')) return;
  dismissing = Object.values(pops).some(([, pop]) => !pop.hidden);
  closePops();
}, true);

$('#view-btn').addEventListener('click', () => {
  closePops();
  remember('view', state.view === 'wall' ? 'grid' : 'wall');
  render();
});

$('#more-menu').addEventListener('click', (e) => {
  const b = e.target.closest('.pop__seg button');
  if (!b) return;
  const group = b.closest('.pop__seg').dataset.group;
  remember(group, b.dataset.value);
  if (group === 'order') remember('colour', null); // picking an order replaces sorting by colour
  if (group === 'show' && state.board) return openBoard(null); // and what to show, the board
  render();
});
$('#shuffle-btn').addEventListener('click', () => { closePops(); render(); });
$('#tv-btn').addEventListener('click', () => { closePops(); setTv(true); });
$('#home-btn').addEventListener('click', () => {
  closePops();
  $('#home-url').textContent = location.origin;
  $('#home-sheet').showModal();
});
$('#home-copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(location.origin);
    $('#home-copy').textContent = 'Copied';
    setTimeout(() => { $('#home-copy').textContent = 'Copy link'; }, 2000);
  } catch {
    getSelection().selectAllChildren($('#home-url'));
  }
});
$('#empty-clear').addEventListener('click', () => setVideo(true));
$('#empty-add').addEventListener('click', () => (state.board ? openBoard(null) : openMedia()));
$('#section').addEventListener('click', () => {
  if (state.board) return openBoard(null);
  remember('show', 'all');
  render();
});

// ------------------------------------------------------------------ boards

// Put a board in the address (or take it out), so the link can be shared and
// a TV can be pointed at a board.
function setBoard(id) {
  state.board = id && state.boards.has(id) ? id : null;
  const url = new URL(location.href);
  if (state.board) url.searchParams.set('board', state.board);
  else url.searchParams.delete('board');
  history.replaceState(null, '', url);
}

// Look at one board, or (with null) go back to all the work.
function openBoard(id) {
  setBoard(id);
  closePops();
  render();
}

// If the board in the address has gone (deleted, or a wrong link), go back to
// all the work. Says whether it was still there.
function checkBoard() {
  if (!state.board || state.boards.has(state.board)) return true;
  setBoard(null);
  return false;
}

// A board changed, here or on someone else's screen: fill in the hearts, and
// if it's the board on screen, bring pieces in or take them off.
function boardChanged({ id, added, removed, deleted }) {
  for (const pid of [...added, ...removed]) refreshHeart(pid);
  if (focusId) renderSaved(state.pins.get(focusId));
  if (id !== state.board) return;
  if (deleted) {
    openBoard(null);
    toast('That board has just been deleted.');
    return;
  }
  // A board is small enough to lay out afresh. The TVs keep still and just
  // take pieces down or put them up.
  if (!state.tv) return render();
  for (const pid of removed) view.remove(pid);
  for (const pid of added) {
    const p = state.pins.get(pid);
    if (p && matches(p) && !view.has(pid)) putUp(p, 'arrive');
  }
  showing = selection();
  updateChrome(showing);
}
initBoards({ open: openBoard, changed: boardChanged });

function setVideo(on) {
  remember('video', on ? null : 'off'); // stored as 'off' or nothing…
  state.video = on; // …but kept as true/false
  render();
}
$('#video-switch').addEventListener('change', (e) => setVideo(e.target.checked));

$('#zoom-in').addEventListener('click', () => wall.zoom(1.4));
$('#zoom-out').addEventListener('click', () => wall.zoom(1 / 1.4));
$('#zoom-fit').addEventListener('click', () => wall.fit());
$('#zoom-level').addEventListener('click', () => wall.zoom(1 / Number.parseFloat($('#zoom-level').dataset.s || 1)));
wall.root.addEventListener('zoom', (e) => {
  $('#zoom-level').textContent = `${Math.round(e.detail * 100)}%`;
  $('#zoom-level').dataset.s = e.detail;
});

// Close buttons, and clicking outside a sheet
for (const dlg of $$('dialog')) {
  dlg.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) dlg.close();
    else if (e.target === dlg && dlg.classList.contains('sheet')) dlg.close();
  });
}

// ------------------------------------------------------------------ the colour wheel
//
// Hue round the edge, softer towards the middle, brightness on the slider.
// Dragging previews the colour; letting go sorts the wall by it.

const wheel = { h: 220, s: 0.75, v: 1 };
const wheelCanvas = $('#wheel-canvas');

function drawWheel() {
  const size = wheelCanvas.width;
  const r = size / 2;
  const ctx = wheelCanvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - r + 0.5, dy = y - r + 0.5;
      const d = Math.hypot(dx, dy) / r;
      const i = (y * size + x) * 4;
      const [R, G, B] = hsv((Math.atan2(dy, dx) * 180 / Math.PI + 450) % 360, Math.min(1, d), wheel.v);
      img.data[i] = R; img.data[i + 1] = G; img.data[i + 2] = B;
      img.data[i + 3] = Math.max(0, Math.min(1, (1 - d) * r)) * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

const wheelHex = () => toHex(hsv(wheel.h, wheel.s, wheel.v));

function placeMarker() {
  const a = ((wheel.h - 90) * Math.PI) / 180; // red at the top
  const m = $('#wheel-mark');
  m.style.left = `${50 + Math.cos(a) * wheel.s * 50}%`;
  m.style.top = `${50 + Math.sin(a) * wheel.s * 50}%`;
  m.style.background = wheelHex();
  $('#wheel-light').style.setProperty('--hue', toHex(hsv(wheel.h, wheel.s, 1)));
  $('#wheel-light').style.setProperty('--pick', wheelHex());
  $('#wheel-hex').textContent = wheelHex().toUpperCase();
}

function openWheel() {
  if (state.colour) [wheel.h, wheel.s, wheel.v] = toHsv(fromHex(state.colour));
  $('#wheel-light').value = Math.round(wheel.v * 100);
  drawWheel();
  placeMarker();
}

function pickAt(e) {
  const r = wheelCanvas.getBoundingClientRect();
  const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
  wheel.h = (Math.atan2(dy, dx) * 180 / Math.PI + 450) % 360;
  wheel.s = Math.min(1, Math.hypot(dx, dy) / (r.width / 2));
  placeMarker();
  showColour(wheelHex());
}

wheelCanvas.addEventListener('pointerdown', (e) => {
  wheelCanvas.setPointerCapture(e.pointerId);
  pickAt(e);
});
wheelCanvas.addEventListener('pointermove', (e) => { if (wheelCanvas.hasPointerCapture(e.pointerId)) pickAt(e); });
wheelCanvas.addEventListener('pointerup', () => sortByColour(wheelHex()));
wheelCanvas.addEventListener('keydown', (e) => {
  const step = { ArrowLeft: [-8, 0], ArrowRight: [8, 0], ArrowUp: [0, 0.08], ArrowDown: [0, -0.08] }[e.key];
  if (e.key === 'Enter') return sortByColour(wheelHex());
  if (!step) return;
  e.preventDefault();
  wheel.h = (wheel.h + step[0] + 360) % 360;
  wheel.s = Math.max(0, Math.min(1, wheel.s + step[1]));
  placeMarker();
  showColour(wheelHex());
});
$('#wheel-light').addEventListener('input', (e) => {
  wheel.v = e.target.value / 100;
  drawWheel();
  placeMarker();
  showColour(wheelHex());
});
$('#wheel-light').addEventListener('change', () => sortByColour(wheelHex()));
$('#colour-clear').addEventListener('click', () => { closePops(); clearColour(); });

// ------------------------------------------------------------------ tapping

function tap(id, hit) {
  if (dismissing) { dismissing = false; return; }
  if (state.tv) return;
  const card = palettes.get(id);
  if (card) {
    const hex = hit?.closest?.('[data-hex]')?.dataset.hex;
    if (hex) sortByColour(hex);
    else if (state.pins.has(card.from)) openFocus(state.pins.get(card.from));
    return;
  }
  const p = state.pins.get(id);
  if (p && hit?.closest?.('.heart')) return openSave(p);
  if (p && hit?.closest?.('.jot')) return startNote(p.id);
  if (p) openFocus(p.parent_id ? state.pins.get(p.parent_id) || p : p);
}

// Colours are read from whatever image loads first, then remembered for everyone.
const coloured = new Set();
function saveColours(p, img) {
  if (PREVIEW || p.colors || coloured.has(p.id)) return;
  coloured.add(p.id);
  const colors = analyse(img);
  if (!colors) return;
  p.colors = colors;
  api(`/api/pins/${p.id}/colors`, { method: 'PUT', body: colors }).catch(() => {});
}

// ------------------------------------------------------------------ who's pinning

function rememberMe(name) {
  state.me = { name };
  try { localStorage.setItem('pb.me', JSON.stringify(state.me)); } catch {}
}

// ------------------------------------------------------------------ add media

const mediaSheet = $('#media-sheet');
const media = { items: [], busy: false };

function openMedia(files = []) {
  if (state.tv) return;
  if (!media.busy) setMediaStatus('');
  addFiles(files);
  if (!mediaSheet.open) {
    setType(startingType());
    const board = state.boards.get(state.board);
    $('#media-board-note').hidden = !board;
    $('#media-board-note').textContent = board ? `It goes on the wall, and on ${board.name} too.` : '';
  }
  $('#media-name').value = state.me?.name || '';
  if (!mediaSheet.open) mediaSheet.showModal();
}

function addFiles(files) {
  const maxBytes = state.config.maxUploadMB * 1024 * 1024;
  for (const file of files) {
    const kind = kindOf(file);
    if (!kind) { toast(`${file.name || 'That'} isn’t an image or video`); continue; }
    if (kind === 'video' && file.size > maxBytes) { toast(`${file.name} is over ${state.config.maxUploadMB}MB`); continue; }
    media.items.push({ file, kind, url: URL.createObjectURL(file) });
  }
  renderPreviews();
}

function renderPreviews() {
  $('#previews').replaceChildren(...media.items.map((item, i) => h('span', { class: 'preview' }, [
    item.kind === 'image'
      ? h('img', { src: item.url, alt: '' })
      : h('video', { src: item.url, muted: true, playsinline: true, preload: 'metadata' }),
    item.kind === 'video' ? h('span', { class: 'preview__kind' }, 'Video') : null,
    media.busy ? null : h('button', {
      type: 'button',
      'aria-label': `Remove ${item.file.name}`,
      onclick: (e) => { e.preventDefault(); URL.revokeObjectURL(item.url); media.items.splice(i, 1); renderPreviews(); },
    }, '×'),
  ])));
  $('#drop').classList.toggle('has-files', media.items.length > 0);
  $('#media-submit').disabled = media.busy || !media.items.length;
  $('#media-submit').textContent = media.items.length > 1 ? `Pin ${media.items.length}` : 'Pin it';
}

// What's added is our work, in progress, unless someone says otherwise, so
// nothing reaches the TVs by accident. Looking at one type, you add that type. And
// once someone's added Social or Inspo it stays picked for the rest of the
// day, so a night out's photos don't each need it choosing again.
const STICKY_TYPES = ['social', 'inspo'];
const today = () => new Date().toDateString();
function startingType() {
  if (TYPES[state.show]) return state.show;
  try {
    const last = JSON.parse(localStorage.getItem('pb.lastType'));
    if (last?.day === today() && STICKY_TYPES.includes(last.type)) return last.type;
  } catch {}
  return 'wip';
}
function keepType(type) {
  try { localStorage.setItem('pb.lastType', JSON.stringify({ type, day: today() })); } catch {}
}

// The sheet fits what's being added: inspo says where it's from, for one.
const HEADINGS = { inspo: 'inspo', social: 'photos' };
const TITLES = { inspo: 'e.g. Pentagram, Rijksmuseum identity', social: 'e.g. Summer party' };
const DESCRIPTIONS = { inspo: 'Why it’s worth a look', social: 'Who, where, what’s going on' };
// Two questions in the sheet: what is it (our work, inspo or social) and, for
// our work, is it approved yet. Together they make its type.
function formType() {
  const f = $('#media-form').elements;
  return f.what.value === 'work' ? f.stage.value : f.what.value;
}
function setType(type) {
  const f = $('#media-form').elements;
  f.what.value = ourWork({ type }) ? 'work' : type;
  if (ourWork({ type })) f.stage.value = type;
  showType();
}
function showType() {
  const type = formType();
  $('#media-stage').hidden = !ourWork({ type });
  $('#type-note').textContent = TYPES[type].note;
  $('#media-source-field').hidden = type !== 'inspo';
  $('#media-heading').replaceChildren('Add ', h('em', {}, HEADINGS[type] || 'work'));
  $('#media-title').placeholder = TITLES[type] || 'e.g. Rams GIP, round two';
  $('#media-description').placeholder = DESCRIPTIONS[type] || 'What it is, what it’s for, what feedback would help';
}
$('#media-form').addEventListener('change', (e) => {
  if (e.target.name === 'what' || e.target.name === 'stage') showType();
});

function setMediaStatus(msg, error = false) {
  $('#media-status').textContent = msg;
  $('#media-status').classList.toggle('error', error);
}

// Browsing on a computer; on a phone, the camera or the camera roll.
for (const input of $$('#media-input, .pick__input')) {
  input.addEventListener('change', (e) => {
    addFiles([...e.target.files]);
    e.target.value = '';
  });
}
const drop = $('#drop');
drop.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#media-input').click(); }
});
drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', () => drop.classList.remove('over'));

mediaSheet.addEventListener('cancel', (e) => { if (media.busy) e.preventDefault(); });
mediaSheet.addEventListener('close', () => {
  if (media.busy) return;
  for (const item of media.items) URL.revokeObjectURL(item.url);
  media.items = [];
  $('#media-title').value = '';
  $('#media-description').value = '';
  $('#media-source').value = '';
  renderPreviews();
});

$('#media-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (media.busy || !media.items.length) return;
  const name = $('#media-name').value.trim();
  if (!name) {
    setMediaStatus('Add your name so people know who pinned it.', true);
    return $('#media-name').focus();
  }
  rememberMe(name);
  media.busy = true;
  renderPreviews();
  const title = $('#media-title').value;
  const description = $('#media-description').value;
  const type = formType();
  const source = type === 'inspo' ? $('#media-source').value : '';
  keepType(type);
  const total = media.items.length;
  let last = null;
  try {
    for (let i = 1; media.items.length; i++) {
      const item = media.items[0];
      const n = total > 1 ? ` ${i} of ${total}` : '';
      setMediaStatus(`Preparing${n}…`);
      const prepped = item.kind === 'image' ? await prepImage(item.file) : await prepVideo(item.file);
      const src = await uploadBlob(prepped.full, (f) => setMediaStatus(`Uploading${n} · ${Math.round(f * 100)}%`));
      const thumb = prepped.thumb ? await uploadBlob(prepped.thumb) : null;
      last = await create({ kind: item.kind, src, thumb, nat_w: prepped.w, nat_h: prepped.h, title, description, colors: prepped.colors, type, source });
      if (state.board) await saveTo(state.board, last.id); // added while looking at a board: it goes on the board too
      URL.revokeObjectURL(item.url);
      media.items.shift();
      renderPreviews();
    }
    media.busy = false;
    mediaSheet.close();
    // Make sure it's in sight: a Social photo added while looking at Approved, say, opens All.
    if (last && !matches(last)) {
      remember('show', 'all');
      remember('colour', null);
      if (!state.video && last.kind === 'video') setVideo(true);
      render();
    }
    if (last) view.reveal(last);
  } catch (err) {
    media.busy = false;
    renderPreviews();
    setMediaStatus(err.message, true);
  }
});

// Pin something as you. The live update can beat the reply back, so whichever
// lands first puts it up and the other leaves it be.
let posting = 0;
async function create(body) {
  posting++;
  try {
    const pin = await api('/api/pins', { method: 'POST', body: { ...body, author: state.me.name } });
    landed(pin);
    return pin;
  } finally {
    posting--;
  }
}

function landed(pin) {
  if (state.pins.has(pin.id)) return;
  state.pins.set(pin.id, pin);
  if (!pin.parent_id && !matches(pin)) return; // the upload switches section to show it
  if (!pin.parent_id) showing = [pin, ...showing];
  putUp(pin, 'arrive');
}

// ------------------------------------------------------------------ a closer look

const focus = $('#focus');
let focusId = null;

// writing: straight to the box for a new note.
function openFocus(p, writing = false) {
  focusId = p.id;
  if (!showing.some((q) => q.id === p.id)) showing = [p, ...showing];
  const box = $('#focus-media');
  if (p.kind === 'image') {
    box.replaceChildren(h('img', { src: fileUrl(p.src), alt: p.title || '' }));
  } else {
    const v = h('video', { src: fileUrl(p.src), controls: true, autoplay: true, loop: true, playsinline: true, poster: p.thumb ? fileUrl(p.thumb) : null });
    v.muted = true;
    box.replaceChildren(v);
  }
  const d = describe(p);
  $('#focus-meta').textContent = fromWebsite(p) ? d.by : [p.author, fmtDate(p.created_at, true)].filter(Boolean).join(' · ');
  renderSource(p);
  $('#focus-title').textContent = p.title || 'Untitled';
  // The piece's colours, sized by how much of it they cover. Tap one to sort by it.
  // One colour on its own says little, so it isn't shown.
  let palette = (p.colors?.palette || []).map((e) => (typeof e === 'string' ? { c: e, w: 1 } : e));
  if (palette.length < 2) palette = [];
  $('#focus-palette').replaceChildren(...palette.map(({ c, w }) => h('button', {
    type: 'button',
    style: `--c:${c};flex-grow:${w}`,
    title: `Sort the wall by ${c.toUpperCase()}`,
    'aria-label': `Sort the wall by ${c.toUpperCase()}`,
    onclick: () => { focus.close(); sortByColour(c); },
  })));
  renderDescription(p);
  renderType(p);
  renderSaved(p);
  renderComments();
  $('#comment-name').value = state.me?.name || '';
  $('#focus-open').href = fileUrl(p.src);
  $('#focus-count').textContent = showing.length > 1 ? `${showing.findIndex((q) => q.id === p.id) + 1} / ${showing.length}` : '';
  resetRemove();
  $('#focus-remove').hidden = !yours(p);
  updateComment();
  if (!focus.open) focus.showModal();
  if (writing) $('#comment-text').focus();
}

// Where a piece of inspiration came from: a link if it's a link.
function renderSource(p) {
  const box = $('#focus-source');
  box.hidden = !p.source;
  if (!p.source) return;
  const link = /^https?:\/\/\S+$/i.test(p.source);
  box.replaceChildren('From ', link
    ? h('a', { href: p.source, target: '_blank', rel: 'noopener noreferrer' }, p.source.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, ''))
    : p.source);
}

// A few lines about the piece, which anyone can add or tidy up later.
function renderDescription(p) {
  $('#focus-description').textContent = p.description || '';
  $('#focus-description').hidden = false;
  $('#focus-edit').textContent = p.description ? 'Edit description' : 'Add a description';
  $('#focus-edit').hidden = !yours(p);
  $('#describe-form').hidden = true;
}
$('#focus-edit').addEventListener('click', () => {
  const p = state.pins.get(focusId);
  if (!p) return;
  $('#describe-text').value = p.description || '';
  $('#describe-text').maxLength = state.config.descriptionMax || 400;
  $('#focus-description').hidden = true;
  $('#focus-edit').hidden = true;
  $('#describe-form').hidden = false;
  $('#describe-text').focus();
});
const closeDescribe = () => {
  $('#focus-description').hidden = false;
  const p = state.pins.get(focusId);
  if (p) renderDescription(p);
};
$('#describe-cancel').addEventListener('click', closeDescribe);
$('#describe-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const p = state.pins.get(focusId);
  if (!p) return;
  try {
    Object.assign(p, await api(`/api/pins/${p.id}`, { method: 'PATCH', body: { description: $('#describe-text').value } }));
    closeDescribe();
  } catch (err) {
    toast(err.message);
  }
});

// What it is, changeable any time: work in progress gets approved, say.
// Only approved work and Social show on the TVs.
function renderType(p) {
  $('#focus-type').hidden = !yours(p);
  for (const b of $$('#focus-type button')) b.setAttribute('aria-pressed', String(p.type === b.dataset.type));
  $('#focus-type-note').textContent = onTvs(p) ? 'On the TVs' : 'Not on the TVs';
}
$('#focus-type').addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  const p = state.pins.get(focusId);
  if (!b || !p || p.type === b.dataset.type) return;
  try {
    Object.assign(p, await api(`/api/pins/${p.id}`, { method: 'PATCH', body: { type: b.dataset.type } }));
    renderType(p);
    retape(p);
  } catch (err) {
    toast(err.message);
  }
});

// Next and previous go through the pieces in the current arrangement.
function step(by) {
  const live = showing.filter((q) => state.pins.has(q.id));
  if (live.length < 2) return;
  const i = live.findIndex((q) => q.id === focusId);
  openFocus(live[(i + by + live.length) % live.length]);
}
$('#focus-prev').addEventListener('click', () => step(-1));
$('#focus-next').addEventListener('click', () => step(1));
focus.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea')) return;
  if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
  if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
});

function resetRemove() {
  const b = $('#focus-remove');
  delete b.dataset.armed;
  b.textContent = 'Take it down';
}

focus.addEventListener('close', () => { $('#focus-media').replaceChildren(); focusId = null; });

// Saving to boards from a closer look, and which boards it's on already.
function renderSaved(p) {
  if (!p) return;
  const on = boardsWith(p.id);
  const b = $('#focus-save');
  b.classList.toggle('is-saved', on.length > 0);
  b.innerHTML = `${HEART}<span>${on.length ? 'Saved' : 'Save'}</span>`;
  b.setAttribute('aria-label', on.length ? 'Saved. Change boards' : 'Save to a board');
  $('#focus-on').replaceChildren(...(on.length
    ? ['On ', ...on.flatMap((x, i) => [i ? (i === on.length - 1 ? ' and ' : ', ') : '', h('button', { type: 'button', 'data-board': x.id }, x.name)])]
    : []));
}
$('#focus-save').addEventListener('click', () => { const p = state.pins.get(focusId); if (p) openSave(p); });
$('#focus-on').addEventListener('click', (e) => {
  const b = e.target.closest('[data-board]');
  if (!b) return;
  focus.close();
  openBoard(b.dataset.board);
});
$('#focus-media').addEventListener('click', (e) => { if (e.target === e.currentTarget) focus.close(); });

// Comments: a short note and your name, kept with the piece wherever it lands.
function renderComments() {
  $('#focus-notes').replaceChildren(...childrenOf(focusId).map((c) => h('li', { style: `--c:${c.color}` }, [
    h('span', {}, c.text),
    h('small', {}, [c.author, fmtDate(c.created_at)].filter(Boolean).join(' · ')),
    yours(c) ? h('button', { type: 'button', class: 'focus__unnote', 'aria-label': 'Remove this note', title: 'Remove', onclick: () => removeComment(c.id) }, '×') : null,
  ])));
}

function updateComment() {
  const n = $('#comment-text').value.length;
  $('#comment-count').textContent = `${n} / ${state.config.commentMax}`;
  $('#comment-post').disabled = !$('#comment-text').value.trim() || !$('#comment-name').value.trim();
}
$('#comment-text').addEventListener('input', updateComment);
$('#comment-name').addEventListener('input', updateComment);
$('#comment-text').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#comment-form').requestSubmit(); }
});

$('#comment-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = $('#comment-text').value.trim();
  const name = $('#comment-name').value.trim();
  if (!name) return $('#comment-name').focus();
  if (!text || !focusId) return;
  if (name !== state.me?.name) rememberMe(name);
  try {
    $('#comment-post').disabled = true;
    await create({ kind: 'comment', text, parent_id: focusId, color: noteColour(focusId) });
    $('#comment-text').value = '';
    renderComments();
  } catch (err) {
    toast(err.message);
  }
  updateComment();
});

async function removeComment(id) {
  try {
    await api(`/api/pins/${id}`, { method: 'DELETE' });
    takeDown(id);
  } catch (err) {
    toast(err.message);
  }
}

// ------------------------------------------------------------------ sticky notes
//
// Comments show on the wall as sticky notes on their piece (pieces.js), and a
// new one can go straight on where you want it: the note button by the heart,
// N with the pointer over a piece, or a finger held on it. Type, then Enter to
// stick it. Esc, or clicking away with nothing written, takes it off again.
// In the grid, the note button opens the piece with its note box ready.

// Each note is any brand colour (with black text), never the same as the
// one it goes on top of.
function noteColour(id) {
  const top = childrenOf(id).at(-1)?.color;
  const colours = state.config.commentColours.filter((c) => c !== top);
  return colours[Math.floor(Math.random() * colours.length)];
}

let draft = null;

function startNote(id, at, focusNow = true) {
  const p = state.pins.get(id);
  if (!p || state.tv) return;
  const el = state.view === 'wall' && $(`#wall [data-id="${CSS.escape(id)}"]`);
  if (!el) return openFocus(p, true);
  closeDraft();
  let { ax, ay } = notePlace(id);
  if (at) {
    const r = el.getBoundingClientRect();
    const share = (v) => Math.round(clamp(v, 0, 1) * 1000) / 1000;
    ax = share((at.x - r.left) / r.width);
    ay = share((at.y - r.top) / r.height);
  }
  const text = h('textarea', { maxlength: state.config.commentMax, rows: '3', placeholder: 'Add a note…', 'aria-label': 'Note' });
  const who = state.me?.name ? null : h('input', { type: 'text', maxlength: '40', placeholder: 'Your name', autocomplete: 'given-name', 'aria-label': 'Your name' });
  const note = h('form', { class: 'note', novalidate: true }, [text, who, h('small', { class: 'note__hint' }, 'Enter to stick it')]);
  const colour = noteColour(id);
  const stack = h('div', { class: 'stack is-draft', style: `--x:${ax};--y:${ay};--c:${colour}` }, note);
  el.querySelector(':scope > .jot').before(stack);
  view.notes(id, 'quiet'); // brings the piece to the front
  draft = { id, stack, text, who, ax, ay, colour };

  const keys = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); closeDraft(); }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); stickNote(); }
  };
  text.addEventListener('keydown', keys);
  who?.addEventListener('keydown', keys);
  // Clicking away sticks it, or takes it off if there's nothing on it.
  note.addEventListener('focusout', (e) => {
    if (!stack.contains(e.relatedTarget)) setTimeout(() => { if (draft?.stack === stack && !stack.contains(document.activeElement)) stickNote(); }, 0);
  });
  if (focusNow) text.focus({ preventScroll: true });
}

// Held a finger on a piece: the note appears under it, and the keyboard comes
// up as the finger lifts (phones only bring it up for a tap or a lift).
function holdNote(id, x, y) {
  navigator.vibrate?.(8);
  startNote(id, { x, y }, false);
  const ready = () => draft?.text.focus({ preventScroll: true });
  addEventListener('touchend', ready, { once: true });
  addEventListener('pointerup', ready, { once: true });
}

async function stickNote() {
  const d = draft;
  if (!d || d.saving) return;
  const text = d.text.value.trim();
  const name = (d.who ? d.who.value : state.me?.name || '').trim();
  if (!text) return closeDraft();
  if (!name) return d.who.focus();
  d.saving = true;
  if (name !== state.me?.name) rememberMe(name);
  try {
    await create({ kind: 'comment', text, parent_id: d.id, color: d.colour, ax: d.ax, ay: d.ay });
    if (draft === d) closeDraft();
  } catch (err) {
    d.saving = false;
    toast(err.message);
  }
}

function closeDraft() {
  draft?.stack.remove();
  draft = null;
}

// Notes dragged round their piece stay where they're put, for everyone.
async function moveNote(id, ax, ay) {
  const c = state.pins.get(id);
  if (!c) return;
  const was = { ax: c.ax, ay: c.ay };
  Object.assign(c, { ax, ay });
  try {
    Object.assign(c, await api(`/api/pins/${id}`, { method: 'PATCH', body: { ax, ay } }));
  } catch (err) {
    Object.assign(c, was);
    view.notes(c.parent_id);
    toast(err.message);
  }
}

// Notes can be folded away, leaving just the dot (only on this screen).
function setNotes(on) {
  remember('notes', on ? null : 'off');
  state.notes = on;
  document.documentElement.classList.toggle('notes-off', !on);
  $('#notes-switch').checked = on;
}
$('#notes-switch').addEventListener('change', (e) => setNotes(e.target.checked));
setNotes(state.notes);

$('#focus-remove').addEventListener('click', async (e) => {
  const b = e.currentTarget;
  if (!b.dataset.armed) {
    b.dataset.armed = '1';
    b.textContent = 'Sure? Tap again';
    setTimeout(resetRemove, 4000);
    return;
  }
  const id = focusId;
  try {
    await api(`/api/pins/${id}`, { method: 'DELETE' });
    focus.close();
    takeDown(id);
  } catch (err) {
    toast(err.message);
  }
});

// ------------------------------------------------------------------ drag, drop and paste

let dragDepth = 0;
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
addEventListener('dragenter', (e) => {
  if (!hasFiles(e) || state.tv) return;
  e.preventDefault();
  dragDepth++;
  if (!mediaSheet.open) $('#dropzone').hidden = false;
});
addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
addEventListener('dragleave', (e) => {
  if (!hasFiles(e)) return;
  if (--dragDepth <= 0) { dragDepth = 0; $('#dropzone').hidden = true; }
});
addEventListener('drop', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth = 0;
  $('#dropzone').hidden = true;
  if (state.tv || media.busy) return;
  openMedia([...e.dataTransfer.files]);
});
addEventListener('paste', (e) => {
  if (state.tv || media.busy) return;
  const files = [...(e.clipboardData?.files || [])].filter(kindOf);
  if (!files.length) return;
  e.preventDefault();
  openMedia(files);
});

// ------------------------------------------------------------------ keys

addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'Escape' && Object.values(pops).some(([, pop]) => !pop.hidden)) {
    closePops();
    return;
  }
  if (e.target.closest?.('input, textarea, [contenteditable], canvas') || $('dialog[open]')) return;
  const onWall = state.view === 'wall';
  switch (e.key) {
    case 'Escape':
      if (state.tv) setTv(false);
      else closePops();
      break;
    case 'f': case '0': if (onWall) wall.fit(); break;
    case '=': case '+': if (onWall) wall.zoom(1.4); break;
    case '-': case '_': if (onWall) wall.zoom(1 / 1.4); break;
    case 'ArrowLeft': if (onWall) wall.pan(-160, 0); break;
    case 'ArrowRight': if (onWall) wall.pan(160, 0); break;
    case 'ArrowUp': if (onWall) wall.pan(0, -160); break;
    case 'ArrowDown': if (onWall) wall.pan(0, 160); break;
    case 'b': togglePop('boards'); break;
    case 'g': $('#view-btn').click(); break;
    case 's': render(); break;
    case 't': setTv(!state.tv); break;
    case 'n': {
      const piece = document.elementFromPoint(pointer.x, pointer.y)?.closest('[data-id]');
      if (!piece || !state.pins.has(piece.dataset.id)) return;
      startNote(piece.dataset.id, onWall ? pointer : null);
      break;
    }
    default: return;
  }
  e.preventDefault();
});

// Holding space turns the pointer into a hand: drag to move round the wall
// (or the grid) without picking anything up, and clicks don't open work.
// Someone who tabbed to a button still gets to press it with space.
let tabbing = false;
addEventListener('pointerdown', () => { tabbing = false; }, { capture: true, passive: true });
function setHand(on) {
  if (state.hand === on) return;
  state.hand = on;
  document.documentElement.classList.toggle('hand', on);
}
addEventListener('keydown', (e) => {
  if (e.key === 'Tab') tabbing = true;
  if (e.key !== ' ' || e.metaKey || e.ctrlKey || e.altKey || state.tv) return;
  if (e.target.closest?.('input, textarea, select, [contenteditable], canvas') || $('dialog[open]')) return;
  const el = document.activeElement;
  if (tabbing && el && el !== document.body) return;
  e.preventDefault();
  if (el !== document.body) el?.blur?.(); // a clicked button would otherwise press again
  setHand(true);
});
addEventListener('keyup', (e) => { if (e.key === ' ') setHand(false); });
addEventListener('blur', () => setHand(false));

addEventListener('resize', () => { wall.resize(); if (state.view === 'grid') grid.resize(); });

// ------------------------------------------------------------------ live updates

// Put a pin that's just arrived into the view. A comment updates the dot on
// its piece, and brings the piece along if it isn't showing. Returns the id of
// a piece that should animate in, if any.
function putUp(p, how) {
  if (!p.parent_id) {
    view.add(p, how);
    return p.id;
  }
  if (view.has(p.parent_id)) {
    view.notes(p.parent_id, how);
    return null;
  }
  const parent = state.pins.get(p.parent_id);
  if (!parent) return null;
  view.add(parent, how);
  return parent.id;
}

function takeDown(id) {
  const p = state.pins.get(id);
  if (!p) return;
  for (const c of childrenOf(id)) state.pins.delete(c.id);
  state.pins.delete(id);
  if (p.parent_id) view.notes(p.parent_id);
  else view.remove(id);
  if (focusId === id) focus.close();
  else if (focusId && p.parent_id === focusId) renderComments();
}

function onNewPin(p) {
  if (state.pins.has(p.id)) return; // one of ours, already up
  if (p.parent_id && !state.pins.has(p.parent_id)) return;
  if (posting && p.author === state.me?.name) return landed(p);
  state.pins.set(p.id, p);
  if (focusId && p.parent_id === focusId) renderComments();
  if (fromWebsite(p)) return; // imported work joins quietly and turns up in the next arrangement
  if (state.tv) return tvPlace(p);
  if (!p.parent_id && !matches(p)) return; // belongs to a section you're not looking at
  putUp(p, 'arrive'); // it just appears, no fanfare
}

// A piece changed type or description. A TV drops anything that's no longer for the TVs.
function onUpdated(p) {
  const mine = state.pins.get(p.id);
  if (!mine) return;
  Object.assign(mine, p);
  if (p.parent_id) return view.notes(p.parent_id); // a note moved
  if (focusId === p.id) {
    renderType(mine);
    if ($('#describe-form').hidden) renderDescription(mine);
  }
  retape(mine);
  if (state.tv && !onTvs(mine)) view.remove(p.id);
}

// Live updates come over a WebSocket. If it drops (Wi-Fi, sleep, a deploy),
// keep retrying, backing off a little each time, and catch up once it's back.
let live = null;
let retry = 1000;
let everConnected = false;
function connect() {
  live = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/live`);
  let ping = 0;
  live.addEventListener('open', () => {
    if (everConnected) resync();
    everConnected = true;
    retry = 1000;
    ping = setInterval(() => { if (live.readyState === WebSocket.OPEN) live.send('ping'); }, 30_000);
  });
  live.addEventListener('message', (e) => {
    if (e.data === 'pong') return;
    const { type, data } = JSON.parse(e.data);
    if (type === 'pin') onNewPin(data);
    else if (type === 'update') onUpdated(data);
    else if (type === 'remove') takeDown(data.id);
    else if (type === 'board') applyBoard(data);
  });
  live.addEventListener('close', () => {
    clearInterval(ping);
    setTimeout(connect, retry);
    retry = Math.min(retry * 2, 30_000);
  });
}

// Fetch everything afresh and redraw, newest work and all.
let lastTouched = Date.now();
for (const type of ['pointerdown', 'wheel', 'keydown']) addEventListener(type, () => { lastTouched = Date.now(); }, { capture: true, passive: true });
async function refresh() {
  try {
    const [{ pins }] = await Promise.all([api('/api/pins'), loadBoards()]);
    state.pins = new Map(pins.map((p) => [p.id, p]));
    checkBoard();
    gaps.length = 0;
    render();
  } catch {}
}

// Catch up on anything missed while the connection was down.
async function resync() {
  try {
    const { pins } = await api('/api/pins');
    const ids = new Set(pins.map((p) => p.id));
    for (const id of [...state.pins.keys()]) if (!ids.has(id)) takeDown(id);
    for (const p of pins) if (!state.pins.has(p.id)) onNewPin(p);
    await loadBoards();
    if (!checkBoard() || state.board) render();
    else for (const id of state.pins.keys()) refreshHeart(id);
  } catch {}
}

// ------------------------------------------------------------------ TV mode
//
// On the studio screens the board looks after itself, with the logo big in the
// middle and changing colour every minute. The wall holds still and the grid
// barely creeps; the change comes from the work itself, one piece at a time
// (see tick). New approved work and social photos go up straight away.
// Work in progress and inspo never show here.

const tv = { run: 0, pausedUntil: 0, timers: [] };
let wakeLock = null;

function setTv(on, glide = true) {
  state.tv = on;
  const change = () => document.body.classList.toggle('tv', on);
  if (glide) glideLogo(change);
  else change();
  const url = new URL(location.href);
  if (on) url.searchParams.set('tv', '1');
  else url.searchParams.delete('tv');
  history.replaceState(null, '', url);
  for (const t of tv.timers) clearInterval(t);
  tv.timers = [];
  render(); // the TVs leave out work in progress and inspo, so the arrangement changes either way
  if (on) {
    closePops();
    if (focus.open) focus.close();
    requestWake();
    tvLoop();
    tv.timers.push(setInterval(setAccent, 60_000), setInterval(tick, 5_000));
  } else {
    tv.run++;
    view.cancelAnim();
    wakeLock?.release().catch(() => {});
    wakeLock = null;
  }
}
$('#tv-exit').addEventListener('click', () => setTv(false));

function interact() {
  if (state.tv) tv.pausedUntil = Date.now() + 45_000;
}

async function requestWake() {
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch {}
}
document.addEventListener('visibilitychange', () => {
  if (state.tv && document.visibilityState === 'visible') requestWake();
  view.wake();
});

async function tvLoop() {
  const run = ++tv.run;
  const alive = () => state.tv && run === tv.run;
  while (alive()) {
    if (Date.now() < tv.pausedUntil || !state.pins.size) { await sleep(1000); continue; }
    await view.tourStep();
  }
}

// The work evolves one piece at a time: every ten seconds one of the older
// pieces on screen comes down, and five seconds later something else goes up
// in the gap it left. What goes up comes from the top of what's waiting
// (newest first, by default), picking the closest in shape so it fits.
const gaps = [];
let goingUp = false;
const shape = (p) => Math.log((p.nat_w || 4) / (p.nat_h || 3));

function tick() {
  if (document.hidden) return;
  goingUp = !goingUp;
  if (goingUp) return putOneUp();
  if (gaps.length) return; // one gap at a time
  const onScreen = view.visible().map((id) => state.pins.get(id)).filter(Boolean);
  if (onScreen.length < 2) return;
  const oldest = onScreen.sort((a, b) => a.created_at - b.created_at).slice(0, Math.max(3, Math.ceil(onScreen.length / 4)));
  const leaving = oldest[Math.floor(Math.random() * oldest.length)];
  const spot = view.vacate(leaving.id);
  if (!spot) return;
  gaps.push({ spot, shape: shape(leaving) });
  showing = showing.filter((q) => q.id !== leaving.id);
}

function putOneUp(p) {
  const gap = gaps.shift();
  if (!gap) return false;
  const up = new Set(view.shown());
  const arriving = p || selection().filter((q) => !up.has(q.id)).slice(0, 12)
    .sort((a, b) => Math.abs(shape(a) - gap.shape) - Math.abs(shape(b) - gap.shape))[0];
  if (!arriving || !view.fill(gap.spot, arriving)) return false;
  showing = [...showing, arriving];
  return true;
}

// Something new arrives on a TV: public work takes the place of the oldest
// piece on screen; a comment just puts its dot on the piece.
function tvPlace(p) {
  const piece = p.parent_id ? state.pins.get(p.parent_id) : p;
  if (!piece || !matches(piece)) return; // work in progress, inspo and (if off) video stay off
  if (p.parent_id) { view.notes(p.parent_id, 'arrive'); return; }
  if (putOneUp(p)) return; // fill the gap if there is one
  const oldest = view.visible().map((id) => state.pins.get(id)).filter(Boolean).sort((a, b) => a.created_at - b.created_at)[0];
  if (oldest && view.swap(oldest.id, p)) showing = showing.map((q) => (q.id === oldest.id ? p : q));
  else view.add(p, 'arrive');
}

// Hide the cursor (and the way out) on the TVs when nobody's touching anything.
let idleTimer = 0;
const pointer = { x: -1, y: -1 }; // where it last was, for N
addEventListener('pointermove', (e) => { pointer.x = e.clientX; pointer.y = e.clientY; }, { passive: true });
addEventListener('pointermove', () => {
  document.body.classList.remove('idle');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => document.body.classList.add('idle'), 3000);
});

// ------------------------------------------------------------------ start

async function boot() {
  setAccent();
  document.body.classList.toggle('tv', state.tv);
  try {
    const [config, { pins }] = await Promise.all([api('/api/config'), api('/api/pins'), loadBoards().catch(() => {})]);
    state.config = config;
    for (const p of pins) state.pins.set(p.id, p);
  } catch (err) {
    toast(err.message);
  }
  if (!checkBoard()) toast('That board isn’t here any more.');
  if (!state.tv) render(); // setTv draws it for the TVs
  if (!PREVIEW) connect(); // the preview is a snapshot: nothing to listen for

  // Every five minutes, redraw with the latest work. On people's own screens,
  // only once they've left it alone for a couple of minutes.
  setInterval(() => {
    const busy = Date.now() - lastTouched < 120_000 || $('dialog[open]') || Object.values(pops).some(([, pop]) => !pop.hidden) || media.busy;
    if (!document.hidden && (state.tv || !busy)) refresh();
  }, 5 * 60_000);
  // And a full reload now and then for screens that stay on for weeks.
  setInterval(() => { if (state.tv) location.reload(); }, 6 * 3600_000);

  if (state.tv) setTv(true, false); // a TV starting up just shows the logo in the middle
}

boot();
