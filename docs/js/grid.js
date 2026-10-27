// The Grid: a neat masonry whose columns drift slowly upward, each at its own
// pace, so the page never sits still. Columns loop seamlessly; scroll or drag
// to move faster, hover to slow it down. If there isn't enough to fill the
// screen it simply sits still and scrolls like a page.

import { h, clamp, rand, sleep, reduceMotion } from './util.js';
import { state } from './store.js';
import { buildPiece, buildPalette, refreshDot, popDot, arrive, wake, rest } from './pieces.js';

export function createGrid(root, { onTap, onColours, onInteract }) {
  let cols = [];
  let colW = 0;
  let gap = 16;
  let vw = 0;
  let vh = 0;
  let drifting = false;
  let raf = 0;
  let last = 0;
  let holdUntil = 0;
  let hovering = false;
  let pace = 1;
  let list = [];

  // Tiles load as they come within a screen and a half of view, and let go
  // once they're further away than that, so a long drifting grid stays light.
  const sight = new IntersectionObserver((entries) => {
    for (const e of entries) (e.isIntersecting ? wake : rest)(e.target);
  }, { root, rootMargin: '150% 0px' });

  const videos = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting && !document.hidden) e.target.play().catch(() => {});
      else e.target.pause();
    }
  });

  // A swapped-in piece keeps the height of the one it replaced, so nothing shifts.
  const fixedHeight = new Map();
  const heightOf = (p) => fixedHeight.get(p.id)
    ?? (p.kind === 'palette' ? Math.round(colW * (p.style === 'strip' ? 1.5 : 0.7)) : Math.round(colW * (p.nat_h && p.nat_w ? p.nat_h / p.nat_w : 0.75)));

  // An empty slot, where a piece has come down and the next hasn't gone up yet.
  const gapTile = (id, hgt, rep) => h('div', { class: 'tile tile--gap', 'data-id': id, 'data-rep': rep, style: `height:${hgt}px;margin-bottom:${gap}px` });

  function tile(p, rep) {
    const hgt = heightOf(p);
    if (p.kind === 'gap') return gapTile(p.id, hgt, rep);
    const el = p.kind === 'palette'
      ? buildPalette(p, colW, hgt, { fixings: false })
      : buildPiece(p, colW, hgt, { fixings: false, defer: true, onColours });
    el.classList.add('tile');
    el.style.marginBottom = `${gap}px`;
    el.dataset.rep = rep;
    if (p.kind !== 'palette') sight.observe(el);
    for (const v of el.querySelectorAll('video')) videos.observe(v);
    return el;
  }

  function measure(c) {
    c.H = c.items.reduce((sum, p) => sum + heightOf(p) + gap, 0);
  }

  function renderCol(c) {
    for (const v of c.track.querySelectorAll('video')) videos.unobserve(v);
    for (const t of c.track.querySelectorAll('.tile')) sight.unobserve(t);
    const reps = drifting ? Math.ceil(vh / Math.max(1, c.H)) + 1 : 1;
    const frag = document.createDocumentFragment();
    for (let r = 0; r < reps; r++) for (const p of c.items) frag.append(tile(p, r));
    c.track.replaceChildren(frag);
    place(c);
  }

  const wrap = (c, o) => (drifting ? ((o % c.H) + c.H) % c.H : 0);
  const place = (c) => { c.track.style.transform = drifting ? `translate3d(0, ${-c.offset}px, 0)` : ''; };

  function show(next) {
    list = next;
    stop();
    sight.disconnect();
    videos.disconnect();
    vw = root.clientWidth || innerWidth;
    vh = root.clientHeight || innerHeight;
    const small = vw < 720;
    const n = clamp(Math.round(vw / (small ? 180 : 280)), 2, 8);
    gap = small ? 10 : 16;
    colW = Math.floor((vw - gap * (n + 1)) / n);
    cols = Array.from({ length: n }, () => ({ items: [], H: 0, offset: 0, speed: 1 }));
    for (const p of list) {
      const c = cols.reduce((a, b) => (b.H < a.H ? b : a));
      c.items.push(p);
      c.H += heightOf(p) + gap;
    }
    drifting = !reduceMotion && list.length >= n * 3 && Math.min(...cols.map((c) => c.H)) > vh * 0.7;
    root.classList.toggle('grid--still', !drifting);
    const box = h('div', { class: 'grid__cols', style: `gap:${gap}px;padding:${drifting ? 0 : 88}px ${gap}px ${gap}px` });
    for (const c of cols) {
      c.el = h('div', { class: 'grid__col', style: `width:${colW}px` });
      c.track = h('div', { class: 'grid__track' });
      c.el.append(c.track);
      box.append(c.el);
      // Sorted (newest or by colour): start at the top so the best comes first.
      // Otherwise start each column somewhere different every visit.
      c.offset = !drifting ? 0 : state.colour || state.order === 'new' ? rand(0, 90) : Math.random() * c.H;
      c.speed = rand(0.7, 1.3);
      renderCol(c);
    }
    root.replaceChildren(box);
    root.scrollTop = 0;
    box.classList.add('fade-in');
    if (drifting) start();
  }

  function start() {
    cancelAnimationFrame(raf);
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const target = now < holdUntil ? 0 : hovering ? 0.18 : 1;
    pace += (target - pace) * Math.min(1, dt * 1.6);
    const base = state.tv ? 5 : 15; // px per second; barely moving on the TVs
    for (const c of cols) {
      c.offset = wrap(c, c.offset + base * c.speed * pace * dt);
      place(c);
    }
    raf = requestAnimationFrame(frame);
  }

  function nudge(dy) {
    for (const c of cols) { c.offset = wrap(c, c.offset + dy); place(c); }
    holdUntil = performance.now() + 2500;
  }

  // ---------------------------------------------------------------- hands

  root.addEventListener('wheel', (e) => {
    onInteract();
    if (!drifting) return;
    e.preventDefault();
    nudge((e.deltaMode === 1 ? 16 : 1) * e.deltaY);
  }, { passive: false });

  let press = null;
  root.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    onInteract();
    press = { id: state.hand ? null : e.target.closest('[data-id]')?.dataset.id, hit: e.target, y: e.clientY, sy: e.clientY, sx: e.clientX, moved: false, pid: e.pointerId };
  });
  root.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') hovering = !!e.target.closest('[data-id]');
    if (!press || e.pointerId !== press.pid) return;
    if (!press.moved && Math.hypot(e.clientX - press.sx, e.clientY - press.sy) < 6) return;
    if (!press.moved && (drifting || state.hand)) { root.setPointerCapture(e.pointerId); root.classList.add('panning'); }
    press.moved = true;
    if (drifting) nudge(press.y - e.clientY);
    else if (state.hand) root.scrollTop += press.y - e.clientY;
    press.y = e.clientY;
  });
  const end = (e) => {
    if (!press || e.pointerId !== press.pid) return;
    if (!press.moved && press.id) onTap(press.id, press.hit);
    root.classList.remove('panning');
    press = null;
  };
  root.addEventListener('pointerup', end);
  root.addEventListener('pointercancel', end);
  root.addEventListener('pointerleave', () => { hovering = false; });

  // ---------------------------------------------------------------- live changes

  const tilesOf = (id) => [...root.querySelectorAll(`.tile[data-id="${id}"]`)];

  // A new piece goes into the column with the least in it, about a third of
  // the way down the screen, so it turns up right where people are looking.
  function add(p, how) {
    if (p.parent_id) return notes(p.parent_id, how);
    if (!cols.length) return null;
    const c = cols.reduce((a, b) => (b.items.length < a.items.length ? b : a));
    let idx = 0;
    if (drifting) {
      let y = 0;
      let best = Infinity;
      c.items.forEach((q, i) => {
        const screen = y - c.offset; // only the first copy, so nothing above it moves
        const d = Math.abs(screen - vh * 0.3);
        if (screen > -vh * 0.2 && d < best) { best = d; idx = i; }
        y += heightOf(q) + gap;
      });
      if (best === Infinity) {
        idx = 0;
        c.offset = wrap(c, c.offset + heightOf(p) + gap);
      }
    }
    c.items.splice(idx, 0, p);
    measure(c);
    renderCol(c);
    if (!drifting) list.unshift(p);
    for (const t of tilesOf(p.id)) {
      if (how === 'pending') t.classList.add('pending');
      if (how === 'arrive') arrive(t);
    }
    return tilesOf(p.id)[0] || null;
  }

  function remove(id) {
    for (const c of cols) {
      const i = c.items.findIndex((p) => p.id === id);
      if (i < 0) continue;
      c.items.splice(i, 1);
      measure(c);
      if (drifting && c.H < vh * 0.5) return show(list.filter((p) => p.id !== id));
      renderCol(c);
      return;
    }
  }

  // A comment came or went: redraw the dot on every copy of its piece.
  function notes(id, how) {
    return tilesOf(id).map((t) => refreshDot(t, id, how))[0] || null;
  }

  const has = (id) => !!root.querySelector(`[data-id="${id}"]`);

  // Bring a piece (or the piece a note is on) into view and hold it there.
  async function reveal(p) {
    const id = p.parent_id || p.id;
    holdUntil = performance.now() + 15000;
    if (!drifting) {
      tilesOf(id)[0]?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
      return true;
    }
    const c = cols.find((col) => col.items.some((q) => q.id === id));
    if (!c) return false;
    let y = 0;
    for (const q of c.items) { if (q.id === id) break; y += heightOf(q) + gap; }
    const want = wrap(c, y - vh * 0.3);
    let delta = want - c.offset;
    if (delta < -c.H / 2) delta += c.H;
    if (delta > c.H / 2) delta -= c.H;
    if (Math.abs(delta) > 4 && !reduceMotion) {
      const from = c.offset;
      const t0 = performance.now();
      while (performance.now() - t0 < 1600) {
        const t = (performance.now() - t0) / 1600;
        c.offset = wrap(c, from + delta * (1 - Math.pow(1 - t, 3)));
        place(c);
        await sleep(16);
      }
    }
    c.offset = want;
    place(c);
    return true;
  }

  // Ids of the pieces you can see right now.
  function visible() {
    const seen = new Set();
    for (const t of root.querySelectorAll('.tile')) {
      const r = t.getBoundingClientRect();
      if (r.top > -r.height * 0.25 && r.bottom < vh + r.height * 0.25) seen.add(t.dataset.id);
    }
    return [...seen];
  }

  // Swap one piece for another in the same slot, same height, so the column
  // doesn't jump. The new one is cropped to fit.
  function swap(outId, p) {
    const c = cols.find((col) => col.items.some((q) => q.id === outId));
    if (!c || has(p.id)) return false;
    const i = c.items.findIndex((q) => q.id === outId);
    fixedHeight.set(p.id, heightOf(c.items[i]));
    c.items[i] = p;
    list = list.map((q) => (q.id === outId ? p : q));
    for (const old of root.querySelectorAll(`.tile[data-id="${outId}"]`)) {
      // the new one cuts in once its image has loaded
      const fresh = tile(p, old.dataset.rep);
      const img = fresh.querySelector('img');
      if (img) img.loading = 'eager';
      const swapIn = () => old.replaceWith(fresh);
      if (img && !img.complete) {
        img.addEventListener('load', swapIn, { once: true });
        img.addEventListener('error', swapIn, { once: true });
      } else swapIn();
    }
    return true;
  }

  // Take a piece down and leave an empty slot the same height. Returns the slot.
  function vacate(id) {
    const c = cols.find((col) => col.items.some((q) => q.id === id));
    if (!c) return null;
    const i = c.items.findIndex((q) => q.id === id);
    const hole = { id: `gap-${id}`, kind: 'gap' };
    fixedHeight.set(hole.id, heightOf(c.items[i]));
    c.items[i] = hole;
    list = list.filter((q) => q.id !== id);
    for (const t of root.querySelectorAll(`.tile[data-id="${id}"]`)) t.replaceWith(gapTile(hole.id, fixedHeight.get(hole.id), t.dataset.rep));
    return { gap: hole.id };
  }

  // Put a piece into an empty slot, cropped to its height, once its image is in.
  function fill(spot, p) {
    const c = cols.find((col) => col.items.some((q) => q.id === spot?.gap));
    if (!c || has(p.id)) return false;
    const i = c.items.findIndex((q) => q.id === spot.gap);
    fixedHeight.set(p.id, fixedHeight.get(spot.gap));
    c.items[i] = p;
    list = [...list, p];
    for (const g of root.querySelectorAll(`.tile[data-id="${spot.gap}"]`)) {
      const fresh = tile(p, g.dataset.rep);
      const img = fresh.querySelector('img');
      if (img) img.loading = 'eager';
      const swapIn = () => g.replaceWith(fresh);
      if (img && !img.complete) {
        img.addEventListener('load', swapIn, { once: true });
        img.addEventListener('error', swapIn, { once: true });
      } else swapIn();
    }
    return true;
  }

  let resizeTimer = 0;
  function resize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (Math.abs((root.clientWidth || innerWidth) - vw) > 40 || !drifting) show(list); }, 250);
  }

  return {
    root, show, add, remove, has, reveal, resize, swap, vacate, fill, visible,
    shown: () => cols.flatMap((c) => c.items.map((p) => p.id)),
    notes,
    arrive: (id) => {
      for (const el of root.querySelectorAll(`[data-id="${id}"]`)) arrive(el);
    },
    popDot: (id) => {
      for (const t of tilesOf(id)) { const dot = t.querySelector(':scope > .dot'); if (dot) popDot(dot); }
    },
    hide: stop,
    resume: () => { if (drifting && !raf) start(); },
    tourStep: () => sleep(1500), // the drift does the work
    cancelAnim: () => {},
    wake: () => {},
  };
}
