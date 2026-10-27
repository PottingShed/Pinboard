// Building the things that go on the wall: pieces of work, palette cards, the
// dot that says a piece has comments, and the heart for saving it to a board.

import { h, fileUrl, hash, fmtDate } from './util.js';
import { childrenOf, boardsWith } from './store.js';

// Brand colours dark enough to need light text on them.
export const DARK_COLOURS = new Set(['#245FFF']);

// One strip of tape on every piece, never more: across the top, or over one
// of the corners, different from piece to piece.
function tapeFor(id) {
  const n = hash(id) % 100;
  const spot = n < 40 ? 'tape1' : n < 60 ? 'tape-tl' : n < 80 ? 'tape-tr' : n < 90 ? 'tape-bl' : 'tape-br';
  return [spot, 1];
}

// onColours(p, imageElement) is called once an image without colours has loaded.
// defer leaves the image unloaded until wake() is called, for walls bigger than the screen.
export function buildPiece(p, w, hgt, { fixings = true, lazy = false, defer = false, onColours } = {}) {
  const el = h('div', { class: `pin pin--${p.kind}`, 'data-id': p.id, style: `width:${w}px;height:${hgt}px` });
  const paper = h('div', { class: 'pin__paper' });

  if (p.kind === 'image') {
    const img = h('img', { alt: p.title || 'Pinned work', draggable: 'false', decoding: 'async', loading: lazy ? 'lazy' : null });
    img.addEventListener('load', () => {
      img.classList.add('loaded');
      if (!p.colors) onColours?.(p, img);
    });
    img.dataset.res = p.thumb ? 'thumb' : 'full';
    if (defer) img.dataset.src = fileUrl(p.thumb || p.src);
    else img.src = fileUrl(p.thumb || p.src);
    paper.append(img);
  } else {
    const poster = p.thumb ? fileUrl(p.thumb) : null;
    const v = h('video', { playsinline: true, loop: true, muted: true, preload: 'none', poster: defer ? null : poster, 'data-poster': defer ? poster : null });
    v.muted = true;
    v.defaultMuted = true;
    v.addEventListener('loadeddata', () => v.classList.add('loaded'));
    if (p.thumb) {
      v.classList.add('loaded');
      if (!p.colors) {
        const frame = new Image();
        frame.onload = () => onColours?.(p, frame);
        frame.src = poster;
      }
    }
    if (defer) v.dataset.video = fileUrl(p.src);
    else v.src = fileUrl(p.src);
    paper.append(v);
  }
  el.append(paper);

  const strips = fixings && tapeFor(p.id);
  if (strips) el.append(tape(p.id, ...strips));
  const dot = commentDot(p.id);
  if (dot) el.append(dot);
  el.append(heart(p.id));
  return el;
}

// The heart shows in a piece's corner under the pointer; tap it to save the
// piece to a board. It's filled in once the piece is on one.
export const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.3 4.7 13.2a4.6 4.6 0 0 1 6.5-6.5l.8.8.8-.8a4.6 4.6 0 0 1 6.5 6.5Z"/></svg>';
function heart(id) {
  const b = h('button', { type: 'button', class: `heart${boardsWith(id).length ? ' is-saved' : ''}`, tabindex: '-1', 'aria-label': 'Save to a board' });
  b.innerHTML = HEART;
  return b;
}
export function refreshHeart(id) {
  const saved = boardsWith(id).length > 0;
  for (const b of document.querySelectorAll(`[data-id="${CSS.escape(id)}"] > .heart`)) b.classList.toggle('is-saved', saved);
}

function tape(id, kind, n) {
  return h('div', { class: `fix fix--${kind}`, style: `--t:${(hash(id) % 9) - 4}deg` }, Array.from({ length: n }, () => h('i')));
}

// A palette card: the colours of one piece of work, as a paint-chip strip or
// a row of swatches, taped up among the work. Tap a colour to sort by it.
const isLight = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 > 150;
};

export function buildPalette(card, w, hgt, { fixings = true } = {}) {
  const chips = card.colours.map((c) => h('button', {
    type: 'button',
    class: `palette__chip${isLight(c) ? '' : ' palette__chip--dark'}`,
    style: `--c:${c}`,
    'data-hex': c,
    'aria-label': `Sort by ${c.toUpperCase()}`,
  }, h('span', {}, c.slice(1).toUpperCase())));
  const el = h('div', {
    class: `pin pin--palette palette--${card.style}`,
    'data-id': card.id,
    style: `width:${w}px;height:${hgt}px`,
  }, [
    h('div', { class: 'pin__paper palette' }, [
      h('div', { class: 'palette__chips' }, chips),
      h('p', { class: 'palette__label' }, [h('span', {}, 'Palette'), h('span', {}, card.title || '')]),
    ]),
  ]);
  if (fixings) el.append(tape(card.id, 'tape1', 1));
  return el;
}

// Load a deferred piece's image, or its video and poster frame, as it comes near the screen…
export function wake(el) {
  const img = el.querySelector(':scope > .pin__paper > img[data-src]');
  if (img) { img.src = img.dataset.src; delete img.dataset.src; }
  const v = el.querySelector(':scope > .pin__paper > video');
  if (v?.dataset.poster) { v.poster = v.dataset.poster; delete v.dataset.poster; }
  if (v?.dataset.video) { v.src = v.dataset.video; delete v.dataset.video; }
}

// …and let it go again once it's well out of view, so a wall of thousands of
// pieces (or a TV left on for a week) only ever holds what's around the screen.
// Coming back is quick: the files are in the browser's cache.
export function rest(el) {
  const img = el.querySelector(':scope > .pin__paper > img[src]');
  if (img) {
    img.dataset.src = img.getAttribute('src');
    img.removeAttribute('src');
    img.classList.remove('loaded');
  }
  const v = el.querySelector(':scope > .pin__paper > video[src]');
  if (v) {
    v.pause();
    v.dataset.video = v.getAttribute('src');
    v.removeAttribute('src');
    v.load(); // drops what it had buffered
  }
}

// A dot in the corner, in the colour of the latest comment, counting them.
export function commentDot(id) {
  const notes = childrenOf(id);
  if (!notes.length) return null;
  const last = notes[notes.length - 1];
  return h('span', {
    class: `dot${DARK_COLOURS.has(last.color) ? ' dot--dark' : ''}`,
    style: `--c:${last.color}`,
    'aria-label': `${notes.length} comment${notes.length === 1 ? '' : 's'}`,
  }, String(notes.length));
}

// Redraw a piece's dot after a comment comes or goes.
// how: 'quiet', 'arrive' (pops in) or 'pending' (hidden until the TV gets there)
export function refreshDot(el, id, how = 'quiet') {
  el.querySelector(':scope > .dot')?.remove();
  const dot = commentDot(id);
  if (!dot) return null;
  el.append(dot);
  if (how === 'pending') dot.classList.add('pending');
  if (how === 'arrive') popDot(dot);
  return dot;
}

// New things just appear: no drop, no bounce. It's a wall, not a slot machine.
export function popDot(dot) {
  dot.classList.remove('pending');
}

// Title, who and when, and the latest comment if there is one.
export function describe(p) {
  const from = p.origin === 'case-study' ? 'Case study' : p.origin === 'archive' ? 'From the archive' : null;
  const who = from || [p.origin === 'inspiration' ? 'Inspiration' : null, p.author, p.studio].filter(Boolean).join(' · ');
  const last = childrenOf(p.id).at(-1);
  return {
    title: p.title || 'Untitled',
    by: [who, from ? null : fmtDate(p.created_at)].filter(Boolean).join(' — '),
    note: last ? `“${last.text}” ${last.author ? `— ${last.author}` : ''}`.trim() : '',
  };
}

export function arrive(el) {
  el.classList.remove('pending');
}
