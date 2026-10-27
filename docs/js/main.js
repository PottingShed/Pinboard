// Pinboard: ties the two views, the menus, adding work, comments, live
// updates and TV mode together.

import { $, $$, h, sleep, api, toast, fmtDate, fileUrl, hash, PREVIEW } from './util.js';
import { state, remember, childrenOf, selection, matches, fromWebsite, isInspiration, onTvs } from './store.js';
import { analyse, hsv, toHex, fromHex, toHsv } from './colour.js';
import { DARK_COLOURS, describe } from './pieces.js';
import { createWall } from './wall.js';
import { createGrid } from './grid.js';
import { kindOf, prepImage, prepVideo, uploadBlob } from './upload.js';

// One brand colour at a time, for the logo and anything that needs a highlight.
// Royal blue is the only one dark enough to need light text on it.
const BRAND = ['#FE1658', '#FDE619', '#01FECD', '#12CDFF', '#245FFF', '#FF16A5', '#FF840A', '#FFADA2', '#CEFF00', '#69FF46'];

const hooks = { onTap: tap, onColours: saveColours, onInteract: interact };
const wall = createWall($('#wall'), hooks);
const grid = createGrid($('#grid'), hooks);
let view = wall;
let showing = []; // the pieces in the current arrangement, in order (for next/previous)

// The most each view takes; the wall uses as many as it needs to fill the screen.
const limit = () => (state.view === 'grid' ? 180 : 200);

function setAccent() {
  const now = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim().toUpperCase();
  const choices = BRAND.filter((c) => c !== now);
  const accent = choices[Math.floor(Math.random() * choices.length)];
  document.documentElement.style.setProperty('--accent', accent);
  document.documentElement.style.setProperty('--on-accent', DARK_COLOURS.has(accent) ? '#F2F2F2' : '#171717');
}

// ------------------------------------------------------------------ palette cards
//
// Every so often among the work there's a card with one piece's colours on it,
// like the paint chips and swatches that end up on a real studio wall.

const palettes = new Map();

// A handful only: client work (not the showreel), one card per project, and
// well spread out.
const paletteWorthy = (p) => !isInspiration(p) && !/showreel/i.test(p.title || '');
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
  const list = selection(limit());
  showing = list;
  wall.root.hidden = state.view !== 'wall';
  grid.root.hidden = state.view !== 'grid';
  if (state.view === 'wall') grid.hide();
  view = state.view === 'grid' ? grid : wall;
  view.show(withPalettes(list));
  updateChrome(list);
}

function updateChrome(list) {
  if (list) {
    const inspiration = state.show === 'inspiration';
    const filteredOut = state.pins.size && !inspiration && !state.video; // e.g. nothing but video, and video's off
    $('#empty').hidden = list.length > 0;
    $('#empty-text').replaceChildren(...(inspiration
      ? ['No ', h('em', {}, 'inspiration'), ' pinned yet.']
      : filteredOut
        ? ['Nothing to show', h('br'), 'with video ', h('em', {}, 'off'), '.']
        : ['The wall’s bare.', h('br'), 'Pin the ', h('em', {}, 'first'), ' thing.']));
    $('#empty-add').textContent = inspiration ? 'Add inspiration' : 'Add work';
    $('#empty-clear').hidden = !filteredOut;
    $('#empty-clear').textContent = 'Turn video on';
  }

  $('#section').hidden = state.show !== 'inspiration' || state.tv;
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
      b.setAttribute('aria-pressed', String(state[group] === b.dataset.value && !(group === 'order' && state.colour)));
    }
  }
}

// The nav's colour circle: the chosen colour, or the whole wheel when there isn't one.
function showColour(hex) {
  $('#colour-dot').style.background = hex || '';
  $('#colour-dot').classList.toggle('is-set', !!hex);
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
  colour: [$('#colour-btn'), $('#colour-menu')],
  more: [$('#more-btn'), $('#more-menu')],
};

function togglePop(name, force) {
  for (const [key, [btn, pop]] of Object.entries(pops)) {
    const open = key === name ? (force ?? pop.hidden) : false;
    pop.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  }
  if (!pops.colour[1].hidden) openWheel();
}
const closePops = () => togglePop(null);

$('#add-btn').addEventListener('click', () => { closePops(); openMedia(); });
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
$('#empty-add').addEventListener('click', () => openMedia());
$('#section').addEventListener('click', () => { remember('show', 'work'); render(); });

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

// ------------------------------------------------------------------ hovering, tapping

const hover = $('#hover');
function moveHover(e) {
  const x = Math.min(e.clientX + 16, innerWidth - hover.offsetWidth - 8);
  const y = e.clientY + 22 + hover.offsetHeight > innerHeight ? e.clientY - hover.offsetHeight - 12 : e.clientY + 22;
  hover.style.transform = `translate(${x}px, ${y}px)`;
}
for (const root of [wall.root, grid.root]) {
  root.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse' || state.tv) return;
    const el = e.target.closest('[data-id]');
    const id = el?.dataset.id;
    const card = palettes.get(id);
    const p = state.pins.get(id);
    if (!p && !card) { hover.hidden = true; return; }
    const d = card
      ? { title: `Palette${card.title ? ` — ${card.title}` : ''}`, by: 'Tap a colour to sort the wall by it', note: '' }
      : describe(p);
    if (p?.private) d.by = ['Private', d.by].filter(Boolean).join(' · ');
    $('#hover-title').textContent = d.title;
    $('#hover-by').textContent = d.by;
    $('#hover-note').textContent = d.note;
    hover.hidden = false;
    moveHover(e);
  });
  root.addEventListener('pointermove', (e) => { if (!hover.hidden) moveHover(e); });
  root.addEventListener('pointerout', (e) => {
    if (!e.relatedTarget?.closest?.('[data-id]')) hover.hidden = true;
  });
  root.addEventListener('pointerdown', () => { hover.hidden = true; });
}

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

function rememberMe(name, studio = state.me?.studio || '') {
  state.me = { name, studio };
  try { localStorage.setItem('pb.me', JSON.stringify(state.me)); } catch {}
}

// ------------------------------------------------------------------ add media

const mediaSheet = $('#media-sheet');
const media = { items: [], busy: false };

function openMedia(files = []) {
  if (state.tv || PREVIEW) return;
  if (!media.busy) setMediaStatus('');
  addFiles(files);
  if (!mediaSheet.open) {
    $('#media-form').elements.visibility.value = 'private'; // private unless someone says otherwise
    $('#visibility-note').textContent = VISIBILITY.private;
    // in the inspiration section, what you add is inspiration
    $('#media-form').elements.origin.value = state.show === 'inspiration' ? 'inspiration' : 'studio';
    showOrigin();
  }
  $('#media-name').value = state.me?.name || '';
  $('#media-studio').replaceChildren(h('legend', {}, 'Studio'), ...state.config.studios.map((s) => h('label', {}, [
    h('input', { type: 'radio', name: 'studio', value: s, checked: (state.me?.studio || state.config.studios[0]) === s || null }),
    h('span', {}, s),
  ])));
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

// Our work, or inspiration (work that isn't ours, kept in its own section, with where it came from).
function showOrigin() {
  const inspiration = $('#media-form').elements.origin.value === 'inspiration';
  $('#media-source-field').hidden = !inspiration;
  $('#media-heading').replaceChildren('Add ', h('em', {}, inspiration ? 'inspiration' : 'work'));
  $('#media-title').placeholder = inspiration ? 'e.g. Pentagram, Rijksmuseum identity' : 'e.g. Rams GIP, round two';
  $('#media-description').placeholder = inspiration ? 'Why it’s worth a look' : 'What it is, what it’s for, what feedback would help';
}

const VISIBILITY = {
  private: 'Studio only. Never shown on the studio TVs.',
  public: 'Fine for anyone to see, including on the studio TVs.',
};
$('#media-form').addEventListener('change', (e) => {
  if (e.target.name === 'visibility') $('#visibility-note').textContent = VISIBILITY[e.target.value];
  if (e.target.name === 'origin') showOrigin();
});

function setMediaStatus(msg, error = false) {
  $('#media-status').textContent = msg;
  $('#media-status').classList.toggle('error', error);
}

$('#media-input').addEventListener('change', (e) => {
  addFiles([...e.target.files]);
  e.target.value = '';
});
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
  rememberMe(name, $('#media-form').elements.studio?.value || '');
  media.busy = true;
  renderPreviews();
  const title = $('#media-title').value;
  const description = $('#media-description').value;
  const size = $('#media-form').elements.size.value;
  const isPrivate = $('#media-form').elements.visibility.value !== 'public';
  const origin = $('#media-form').elements.origin.value === 'inspiration' ? 'inspiration' : 'studio';
  const source = origin === 'inspiration' ? $('#media-source').value : '';
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
      last = await create({ kind: item.kind, src, thumb, nat_w: prepped.w, nat_h: prepped.h, size, title, description, colors: prepped.colors, private: isPrivate, origin, source });
      URL.revokeObjectURL(item.url);
      media.items.shift();
      renderPreviews();
    }
    media.busy = false;
    mediaSheet.close();
    // Show it where it belongs: inspiration added from our work (or the other way) switches section.
    if (last && !matches(last)) {
      remember('show', isInspiration(last) ? 'inspiration' : 'work');
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
    const pin = await api('/api/pins', { method: 'POST', body: { ...body, author: state.me.name, studio: state.me.studio } });
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

function openFocus(p) {
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
  $('#focus-meta').textContent = fromWebsite(p) ? d.by : [isInspiration(p) ? 'Inspiration' : null, p.author, p.studio, fmtDate(p.created_at, true)].filter(Boolean).join(' · ');
  renderSource(p);
  $('#focus-title').textContent = p.title || 'Untitled';
  // The piece's colours, sized by how much of it they cover. Tap one to sort by it.
  const palette = (p.colors?.palette || []).map((e) => (typeof e === 'string' ? { c: e, w: 1 } : e));
  $('#focus-palette').replaceChildren(...palette.map(({ c, w }) => h('button', {
    type: 'button',
    style: `--c:${c};flex-grow:${w}`,
    title: `Sort the wall by ${c.toUpperCase()}`,
    'aria-label': `Sort the wall by ${c.toUpperCase()}`,
    onclick: () => { focus.close(); sortByColour(c); },
  })));
  renderDescription(p);
  renderVisibility(p);
  renderComments();
  $('#comment-name').value = state.me?.name || '';
  $('#focus-open').href = fileUrl(p.src);
  $('#focus-count').textContent = showing.length > 1 ? `${showing.findIndex((q) => q.id === p.id) + 1} / ${showing.length}` : '';
  resetRemove();
  updateComment();
  if (!focus.open) focus.showModal();
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
  $('#focus-edit').hidden = false;
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

// Public or private, switchable any time. Private work never shows on the TVs.
function renderVisibility(p) {
  for (const b of $$('#focus-visibility button')) b.setAttribute('aria-pressed', String(!!p.private === (b.dataset.private === '1')));
  $('#focus-visibility-note').textContent = p.private ? 'Studio only' : 'On the TVs';
}
$('#focus-visibility').addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  const p = state.pins.get(focusId);
  if (!b || !p) return;
  const wanted = b.dataset.private === '1';
  if (!!p.private === wanted) return;
  try {
    Object.assign(p, await api(`/api/pins/${p.id}`, { method: 'PATCH', body: { private: wanted } }));
    renderVisibility(p);
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
$('#focus-media').addEventListener('click', (e) => { if (e.target === e.currentTarget) focus.close(); });

// Comments: a short note and your name, kept with the piece wherever it lands.
function renderComments() {
  $('#focus-notes').replaceChildren(...childrenOf(focusId).map((c) => h('li', { class: DARK_COLOURS.has(c.color) ? 'is-dark' : '', style: `--c:${c.color}` }, [
    h('span', {}, c.text),
    h('small', {}, [c.author, c.studio, fmtDate(c.created_at)].filter(Boolean).join(' · ')),
    h('button', { type: 'button', class: 'focus__unnote', 'aria-label': 'Remove this comment', title: 'Remove', onclick: () => removeComment(c.id) }, '×'),
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
  const colours = state.config.commentColours;
  try {
    $('#comment-post').disabled = true;
    await create({ kind: 'comment', text, parent_id: focusId, color: colours[Math.floor(Math.random() * colours.length)] });
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
  if (e.target.closest('input, textarea, [contenteditable], canvas') || $('dialog[open]')) return;
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
    case 'g': $('#view-btn').click(); break;
    case 's': render(); break;
    case 't': setTv(!state.tv); break;
    default: return;
  }
  e.preventDefault();
});

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

// A piece went public or private. A TV drops anything that's gone private.
function onUpdated(p) {
  const mine = state.pins.get(p.id);
  if (!mine) return;
  Object.assign(mine, p);
  if (focusId === p.id) {
    renderVisibility(mine);
    if ($('#describe-form').hidden) renderDescription(mine);
  }
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
    const { pins } = await api('/api/pins');
    state.pins = new Map(pins.map((p) => [p.id, p]));
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
  } catch {}
}

// ------------------------------------------------------------------ TV mode
//
// On the studio screens the board looks after itself, with the logo big in the
// middle and changing colour every minute. The wall holds still and the grid
// barely creeps; the change comes from the work itself, one piece at a time
// (see tick). New public work from either studio goes up straight away.
// Private work never shows here.

const tv = { run: 0, pausedUntil: 0, timers: [] };
let wakeLock = null;

function setTv(on) {
  state.tv = on;
  document.body.classList.toggle('tv', on);
  const url = new URL(location.href);
  if (on) url.searchParams.set('tv', '1');
  else url.searchParams.delete('tv');
  history.replaceState(null, '', url);
  for (const t of tv.timers) clearInterval(t);
  tv.timers = [];
  render(); // the TVs leave out private work, so the arrangement changes either way
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
  if (!piece || !matches(piece)) return; // private work, other sections and (if off) video stay off
  if (p.parent_id) { view.notes(p.parent_id, 'arrive'); return; }
  if (putOneUp(p)) return; // fill the gap if there is one
  const oldest = view.visible().map((id) => state.pins.get(id)).filter(Boolean).sort((a, b) => a.created_at - b.created_at)[0];
  if (oldest && view.swap(oldest.id, p)) showing = showing.map((q) => (q.id === oldest.id ? p : q));
  else view.add(p, 'arrive');
}

// Hide the cursor (and the way out) on the TVs when nobody's touching anything.
let idleTimer = 0;
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
    const [config, { pins }] = await Promise.all([api('/api/config'), api('/api/pins')]);
    state.config = config;
    for (const p of pins) state.pins.set(p.id, p);
  } catch (err) {
    toast(err.message);
  }
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

  if (state.tv) setTv(true);
}

boot();
