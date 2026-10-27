// Building the things that go on the wall: pieces of work, palette cards, and
// the dot that says a piece has comments.

import { h, fileUrl, hash, fmtDate } from './util.js';
import { childrenOf } from './store.js';

// Brand colours dark enough to need light text on them.
export const DARK_COLOURS = new Set(['#245FFF']);

// Tape, sparingly: most pieces sit flat on the wall, about one in three has a
// single strip across the top, and the odd one is taped at two corners.
function tapeFor(id) {
  const n = hash(id) % 100;
  return n < 28 ? ['tape1', 1] : n < 36 ? ['tape', 2] : null;
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
    v.src = fileUrl(p.src);
    paper.append(v);
  }
  el.append(paper);

  const strips = fixings && tapeFor(p.id);
  if (strips) el.append(tape(p.id, ...strips));
  const dot = commentDot(p.id);
  if (dot) el.append(dot);
  return el;
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

// Load a deferred piece's image or poster frame.
export function wake(el) {
  const img = el.querySelector(':scope > .pin__paper > img[data-src]');
  if (img) { img.src = img.dataset.src; delete img.dataset.src; }
  const v = el.querySelector(':scope > .pin__paper > video[data-poster]');
  if (v) { v.poster = v.dataset.poster; delete v.dataset.poster; }
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
