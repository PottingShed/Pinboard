// The Wall: an organic, layered collage that's composed fresh on every visit.
//
// It's built wall to wall and runs far past the screen: pieces fill a patch
// big enough for all of them, newest in the middle, each one plugging the bare
// spot nearest the middle, sometimes tucked over a corner of its neighbour but
// never covering more than a slice of it. A camera (x, y = the wall point at
// the centre of the screen, s = scale) pans and zooms over it, never past the
// edge of the work, and on the TVs it wanders around by itself.

import { h, clamp, rand, sleep, easeInOut, fileUrl, reduceMotion } from './util.js';
import { state, childrenOf } from './store.js';
import { buildPiece, buildPalette, refreshDot, popDot, arrive, wake, rest } from './pieces.js';

const MIN_S = 0.03;
const MAX_S = 3;
const AREA = { s: 105_000, m: 180_000, l: 320_000 };
const PALETTE = { strip: { w: 210, h: 430 }, row: { w: 400, h: 270 } };

// How big a piece goes up is Pinboard's call, made afresh every time the wall
// is arranged, so the same piece can come back bigger or smaller: mostly
// medium, some small, some large. Never bigger than the image has the pixels
// for (sharp at 100% on a retina screen), so a small image stays small.
function areaFor(p) {
  const n = Math.random();
  const area = (n < 0.3 ? AREA.s : n < 0.75 ? AREA.m : AREA.l) * rand(0.8, 1.2);
  if (!p.nat_w || !p.nat_h) return area;
  return Math.max(Math.min(area, (p.nat_w / 2) * (p.nat_h / 2)), AREA.s * 0.7);
}

function sizeFor(p) {
  if (p.kind === 'palette') return { ...PALETTE[p.style] };
  const area = areaFor(p);
  const ar = p.nat_w && p.nat_h ? p.nat_w / p.nat_h : 4 / 3;
  let w = Math.sqrt(area * ar);
  let hh = w / ar;
  const k = Math.min(1, 880 / Math.max(w, hh));
  return { w: Math.round(w * k), h: Math.round(hh * k) };
}

// Pieces go up slightly squint; palette cards a bit more so.
const tiltFor = (p) => +rand(p.kind === 'palette' ? -4 : -2.4, p.kind === 'palette' ? 4 : 2.4).toFixed(2);

// Is c an OK place to be, given what's already up?
function fits(c, placed) {
  let covered = 0;
  for (const q of placed) {
    const ix = Math.min(c.x + c.w / 2, q.x + q.w / 2) - Math.max(c.x - c.w / 2, q.x - q.w / 2);
    const iy = Math.min(c.y + c.h / 2, q.y + q.h / 2) - Math.max(c.y - c.h / 2, q.y - q.h / 2);
    if (ix <= 0 || iy <= 0) {
      if (ix > -8 && iy > -8) return false; // too tight without overlapping looks like a mistake
      continue;
    }
    const area = ix * iy;
    if (area > q.w * q.h * 0.26) return false; // don't hide what's underneath
    if (Math.abs(c.x - q.x) < c.w / 2 && Math.abs(c.y - q.y) < c.h / 2) return false;
    if (Math.abs(q.x - c.x) < q.w / 2 && Math.abs(q.y - c.y) < q.h / 2) return false;
    covered += area;
  }
  return covered <= c.w * c.h * 0.32;
}

// Pieces already up, filed by patch of wall, so checking a spot only looks at
// its neighbours. Keeps arranging the wall quick with thousands of pieces.
function neighbours(cell = 700) {
  const cells = new Map();
  const keys = (r, pad = 0) => {
    const out = [];
    for (let x = Math.floor((r.x - r.w / 2 - pad) / cell); x <= Math.floor((r.x + r.w / 2 + pad) / cell); x++) {
      for (let y = Math.floor((r.y - r.h / 2 - pad) / cell); y <= Math.floor((r.y + r.h / 2 + pad) / cell); y++) out.push(`${x},${y}`);
    }
    return out;
  };
  return {
    add(L) {
      for (const k of keys(L)) {
        if (!cells.has(k)) cells.set(k, []);
        cells.get(k).push(L);
      }
    },
    near(r) {
      const found = new Set();
      for (const k of keys(r, 10)) for (const q of cells.get(k) || []) found.add(q);
      return found;
    },
  };
}

// How big the work looks on screen: bigger on big screens, never tiny on phones.
const homeScale = (vw) => clamp(vw / 2600, 0.3, 0.95);

// Fill a W x H patch (centred on 0,0) wall to wall. The next piece always goes
// over the bare spot nearest the middle, wherever it covers the most bare wall.
// Returns the pieces and how far out (0 to 0.5 of the patch) it's solid.
function compose(list, W, H) {
  const CELL = 36;
  const cols = Math.ceil(W / CELL), rows = Math.ceil(H / CELL);
  const x0 = -W / 2, y0 = -H / 2;
  const bare = new Uint8Array(cols * rows).fill(1);
  const order = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = x0 + (c + 0.5) * CELL, cy = y0 + (r + 0.5) * CELL;
      order.push({ i: r * cols + c, cx, cy, d: Math.max(Math.abs(cx) / W, Math.abs(cy) / H) + rand(0, 0.05) });
    }
  }
  order.sort((a, b) => a.d - b.d);
  const span = (L) => [
    clamp(Math.round((L.x - L.w / 2 - x0) / CELL), 0, cols), clamp(Math.round((L.x + L.w / 2 - x0) / CELL), 0, cols),
    clamp(Math.round((L.y - L.h / 2 - y0) / CELL), 0, rows), clamp(Math.round((L.y + L.h / 2 - y0) / CELL), 0, rows),
  ];
  const each = (L, fn) => { const [c0, c1, r0, r1] = span(L); for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) fn(r * cols + c); };

  const placed = [];
  const around = neighbours();
  let next = 0;
  for (const p of list) {
    let spot = null;
    while (!spot) {
      while (next < order.length && !bare[order[next].i]) next++;
      if (next >= order.length) return { placed, reach: 0.5 }; // the patch is full
      const hole = order[next];
      let { w, h: hh } = sizeFor(p);
      for (let attempt = 0; attempt < 2 && !spot; attempt++) {
        if (attempt) { w = Math.round(w * 0.7); hh = Math.round(hh * 0.7); }
        for (let k = 0; k < 30; k++) {
          const c = { w, h: hh, x: hole.cx + rand(-0.5, 0.5) * Math.max(0, w - CELL), y: hole.cy + rand(-0.5, 0.5) * Math.max(0, hh - CELL) };
          if (!fits(c, around.near(c))) continue;
          let gain = 0;
          each(c, (i) => { gain += bare[i]; });
          if (gain && (!spot || gain > spot.gain)) spot = { ...c, gain };
        }
      }
      if (!spot) bare[hole.i] = 0; // nothing fits here, so it stays a gap of wall
    }
    const L = { id: p.id, x: Math.round(spot.x), y: Math.round(spot.y), w: spot.w, h: spot.h, rot: tiltFor(p), z: 0 };
    placed.push(L);
    around.add(L);
    each(L, (i) => { bare[i] = 0; });
  }
  // Ran out of work: it's solid up to the first bare spot (less the jumble).
  while (next < order.length && !bare[order[next].i]) next++;
  return { placed, reach: next < order.length ? Math.max(0, order[next].d - 0.05) : 0.5 };
}

export function createWall(root, { onTap, onColours, onInteract, onHold, onNoteMove }) {
  const world = h('div', { class: 'world' });
  root.append(world);
  const cam = { x: 0, y: 0, s: 1 };
  const layout = new Map(); // id -> { x, y, w, h, rot, z }
  const els = new Map();    // id -> element, pieces and stickies alike
  let vw = root.clientWidth || innerWidth;
  let vh = root.clientHeight || innerHeight;
  let zTop = 0;
  let camAnim = null;
  let motionTimer = 0;
  let home = { x: 0, y: 0, s: 1 }; // the wall-to-wall view
  let solid = null; // half-size of the area that's solid work, if it fills the screen
  let built = { vw: 0, vh: 0, list: [] };

  // ---------------------------------------------------------------- drawing

  function draw(p) {
    const L = layout.get(p.id);
    const el = p.kind === 'palette'
      ? buildPalette(p, L.w, L.h)
      : buildPiece(p, L.w, L.h, { onColours, defer: true });
    el.style.left = `${L.x - L.w / 2}px`;
    el.style.top = `${L.y - L.h / 2}px`;
    el.style.zIndex = L.z;
    el.style.setProperty('--rot', `${L.rot}deg`);
    world.append(el);
    els.set(p.id, el);
    return el;
  }

  function show(list) {
    cancelAnim();
    world.replaceChildren();
    layout.clear();
    els.clear();
    zTop = 0;
    vw = root.clientWidth || innerWidth;
    vh = root.clientHeight || innerHeight;
    // A patch the shape of the screen with room for everything, and at least a
    // bit bigger than the screen so the edges run off it.
    const s0 = homeScale(vw);
    const room = list.reduce((sum, p) => sum + (p.kind === 'palette' ? PALETTE.row.w * PALETTE.row.h : AREA.m), 0) * 0.92;
    const W = Math.max(Math.sqrt(room * (vw / vh)), (vw / s0) * 1.15);
    const H = Math.max(W / (vw / vh), (vh / s0) * 1.15);
    const { placed, reach } = compose(list, W, H);
    for (const L of placed) layout.set(L.id, L);
    const used = list.filter((p) => layout.has(p.id));
    built = { vw, vh, list };
    // Later pieces sit on top, and anything with notes on it comes forward.
    const order = [...used].sort((a, b) => (childrenOf(a.id).length ? 1 : 0) - (childrenOf(b.id).length ? 1 : 0));
    for (const p of order) layout.get(p.id).z = ++zTop;
    for (const p of used) draw(p);
    world.classList.remove('fade-in');
    void world.offsetWidth;
    world.classList.add('fade-in');
    // Wall to wall when there's enough work to fill the screen; otherwise
    // gather what there is in the middle.
    solid = { hw: reach * W, hh: reach * H };
    if (solid.hw * 2 * s0 < vw || solid.hh * 2 * s0 < vh) solid = null;
    home = solid ? { x: 0, y: 0, s: s0 } : fitCam();
    goTo(home, 0);
  }

  // Something new goes up on top, near the middle of whatever you're looking at.
  function add(p, how) {
    if (p.parent_id) return notes(p.parent_id, how);
    const { w, h: hh } = sizeFor(p);
    const x = layout.size ? cam.x + (rand(-0.12, 0.12) * vw) / cam.s : 0;
    const y = layout.size ? cam.y + (rand(-0.12, 0.12) * vh) / cam.s : 0;
    layout.set(p.id, { id: p.id, x: Math.round(x), y: Math.round(y), w, h: hh, rot: tiltFor(p), z: ++zTop });
    const el = draw(p);
    wake(el);
    built.list = [p, ...built.list];
    if (how === 'pending') el.classList.add('pending');
    if (how === 'arrive') arrive(el);
    return el;
  }

  // A comment came, went or moved: redraw the notes on its piece. A new one brings the
  // piece to the front so the notes aren't hidden.
  function notes(id, how) {
    const el = els.get(id);
    if (!el) return null;
    if (how) {
      el.style.zIndex = ++zTop;
      const L = layout.get(id);
      if (L) L.z = zTop;
    }
    return refreshDot(el, id, how);
  }

  function remove(id) {
    const el = els.get(id);
    for (const [k, v] of els) if (v && (v === el || el?.contains(v))) els.delete(k);
    layout.delete(id);
    el?.remove();
  }

  const has = (id) => els.has(id);

  // ---------------------------------------------------------------- camera

  // Keep the screen full: no panning or zooming out past the edge of the work.
  function keepFull(c) {
    if (!solid) return c;
    const s = Math.max(c.s, vw / (2 * solid.hw), vh / (2 * solid.hh));
    const mx = solid.hw - vw / (2 * s);
    const my = solid.hh - vh / (2 * s);
    return { x: clamp(c.x, -mx, mx), y: clamp(c.y, -my, my), s };
  }

  function applyCam() {
    Object.assign(cam, keepFull(cam));
    world.style.transform = `translate3d(${vw / 2 - cam.x * cam.s}px, ${vh / 2 - cam.y * cam.s}px, 0) scale(${cam.s})`;
    root.dispatchEvent(new CustomEvent('zoom', { detail: cam.s }));
    // Promote while moving, then let the browser re-rasterise sharp at the new scale.
    world.classList.add('moving');
    clearTimeout(motionTimer);
    motionTimer = setTimeout(() => world.classList.remove('moving'), 220);
    scheduleDetail();
    sizeNotes();
  }

  // Sticky notes grow as you zoom out, to stay readable, up to half as big
  // again; further out than that they fold down to their dots. A note being
  // written stays readable however far out you are. The sizes go in steps,
  // as each change restyles the whole wall.
  let noteSize = {};
  function sizeNotes() {
    const step = (v) => Math.round(v * 20) / 20;
    const note = step(clamp(0.62 / cam.s, 1, 1.5));
    const draft = step(Math.max(1, 0.9 / cam.s));
    if (note !== noteSize.note) root.style.setProperty('--note-scale', note);
    if (draft !== noteSize.draft) root.style.setProperty('--draft-scale', draft);
    root.classList.toggle('far', cam.s < 0.35);
    noteSize = { note, draft };
  }

  function cancelAnim() {
    if (!camAnim) return;
    camAnim.cancelled = true;
    camAnim.resolve(false);
    camAnim = null;
  }

  // Long trips pull back mid-way so you can see where you're going (fly).
  function goTo(target, ms = 900, ease = easeInOut, fly = true) {
    cancelAnim();
    const to = keepFull({ x: target.x, y: target.y, s: clamp(target.s, MIN_S, MAX_S) });
    if (!ms || reduceMotion) {
      Object.assign(cam, to);
      applyCam();
      return Promise.resolve(true);
    }
    const from = { ...cam };
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const sMid = Math.min(from.s, to.s, (vw * 0.9) / (dist + 1));
    const bump = fly ? Math.max(0, Math.log(Math.min(from.s, to.s) / sMid)) * 0.8 : 0;
    const t0 = performance.now();
    return new Promise((resolve) => {
      const anim = { cancelled: false, resolve };
      camAnim = anim;
      const step = (now) => {
        if (anim.cancelled) return;
        const t = Math.min(1, (now - t0) / ms);
        const k = ease(t);
        cam.s = Math.exp(Math.log(from.s) + (Math.log(to.s) - Math.log(from.s)) * k - bump * Math.sin(Math.PI * k));
        cam.x = from.x + (to.x - from.x) * k;
        cam.y = from.y + (to.y - from.y) * k;
        applyCam();
        if (t < 1) requestAnimationFrame(step);
        else { camAnim = null; resolve(true); }
      };
      requestAnimationFrame(step);
    });
  }

  function zoomAt(cx, cy, factor) {
    const ns = clamp(cam.s * factor, MIN_S, MAX_S);
    const wx = cam.x + (cx - vw / 2) / cam.s;
    const wy = cam.y + (cy - vh / 2) / cam.s;
    Object.assign(cam, { x: wx - (cx - vw / 2) / ns, y: wy - (cy - vh / 2) / ns, s: ns });
    applyCam();
  }

  function bounds(items = [...layout.values()]) {
    if (!items.length) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const L of items) {
      x0 = Math.min(x0, L.x - L.w / 2 - 30);
      x1 = Math.max(x1, L.x + L.w / 2 + 30);
      y0 = Math.min(y0, L.y - L.h / 2 - 30);
      y1 = Math.max(y1, L.y + L.h / 2 + 30);
    }
    return { w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }

  function fitCam() {
    const b = bounds();
    if (!b) return { x: 0, y: 0, s: 1 };
    const small = vw < 720;
    const top = small ? 70 : 92;
    const bottom = small ? 96 : 48;
    const side = small ? 16 : 48;
    const s = clamp(Math.min((vw - side * 2) / b.w, (vh - top - bottom) / b.h), MIN_S, 1);
    return { x: b.cx, y: b.cy - (top - bottom) / 2 / s, s };
  }

  function frameCam(id, fill = 0.6) {
    const L = layout.get(id);
    if (!L) return null;
    const s = clamp(Math.min((vh * fill) / L.h, (vw * 0.7) / L.w), MIN_S, 1.6);
    return { x: L.x, y: L.y, s };
  }

  function onScreen(id) {
    const L = layout.get(id);
    if (!L) return false;
    const sx = (L.x - cam.x) * cam.s + vw / 2;
    const sy = (L.y - cam.y) * cam.s + vh / 2;
    return sx > 0 && sx < vw && sy > 0 && sy < vh && L.w * cam.s > 120;
  }

  // Swap thumbnails for full-size images up close; only play videos you can see.
  let detailTimer = 0;
  let lastDetail = 0;
  function scheduleDetail() {
    if (detailTimer) return;
    const wait = Math.max(0, 350 - (performance.now() - lastDetail));
    detailTimer = setTimeout(() => { detailTimer = 0; lastDetail = performance.now(); updateDetail(); }, wait);
  }

  function updateDetail() {
    if (root.hidden) return;
    const dpr = devicePixelRatio || 1;
    const hw = vw / 2 / cam.s + 100, hh = vh / 2 / cam.s + 100;
    const near = 500; // start loading a little before things come into view
    const far = 2.5 * Math.max(hw, hh); // and let go of what's a couple of screens away
    for (const L of layout.values()) {
      const p = state.pins.get(L.id);
      const el = els.get(L.id);
      if (!p || !el) continue;
      const dx = Math.abs(L.x - cam.x) - L.w / 2, dy = Math.abs(L.y - cam.y) - L.h / 2;
      if (dx < hw + near && dy < hh + near) wake(el);
      else if (dx > hw + far || dy > hh + far) rest(el);
      const visible = dx < hw && dy < hh;
      const px = L.w * cam.s * dpr;
      if (p.kind === 'image' && p.thumb) {
        const img = el.querySelector('img');
        if (img.dataset.src) continue;
        const want = visible && px > 1000 ? 'full' : !visible || px < 700 ? 'thumb' : img.dataset.res;
        if (want !== img.dataset.res) {
          img.dataset.res = want;
          const url = fileUrl(want === 'full' ? p.src : p.thumb);
          if (want === 'thumb') img.src = url;
          else { const pre = new Image(); pre.onload = () => { if (img.dataset.res === 'full') img.src = url; }; pre.src = url; }
        }
      } else if (p.kind === 'video') {
        const v = el.querySelector('video');
        const play = visible && L.w * cam.s > 90 && !document.hidden;
        if (play && v.paused) v.play().catch(() => {});
        else if (!play && !v.paused) v.pause();
      }
    }
  }

  // ---------------------------------------------------------------- hands

  const pointers = new Map();
  let gesture = null;

  root.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('.is-draft')) return; // someone's writing a note
    try { root.setPointerCapture(e.pointerId); } catch {}
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const caught = !!camAnim?.glide; // a touch that stops a flick only stops it
    cancelAnim();
    onInteract();
    if (pointers.size === 2) {
      clearTimeout(gesture?.hold);
      if (gesture?.drag || gesture?.stack) putBack();
      const [a, b] = [...pointers.values()];
      gesture = { pinch: true, d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      return;
    }
    if (pointers.size > 2) return;
    const target = state.hand ? null : e.target.closest('[data-id]');
    // Dragging a piece's notes moves them round the piece instead of moving it.
    const stack = target && !state.tv ? e.target.closest('.stack') : null;
    // A finger always moves round the wall, wherever it lands, as on any map.
    // Pieces only get shuffled with a mouse.
    const touch = e.pointerType !== 'mouse';
    const g = { id: target?.dataset.id, el: target, stack, touch, caught, hit: e.target, sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, moved: false, drag: false };
    gesture = g;
    // Hold a finger on a piece to stick a note on it, or on a note to pick it
    // up and move it.
    if (target && touch && !state.tv) {
      g.hold = setTimeout(() => {
        if (gesture !== g || g.moved) return;
        if (stack) {
          g.lifted = true;
          stack.classList.add('lifted');
          navigator.vibrate?.(8);
          return;
        }
        g.held = true;
        onHold(g.id, g.sx, g.sy);
      }, 550);
    }
  });
  // …without the phone's own long-press menu getting in first.
  root.addEventListener('contextmenu', (e) => { if (gesture?.held || (gesture?.hold && e.target.closest('[data-id]'))) e.preventDefault(); });

  root.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!gesture) return;
    if (gesture.pinch) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      cam.x -= (mx - gesture.mx) / cam.s;
      cam.y -= (my - gesture.my) / cam.s;
      zoomAt(mx, my, d / (gesture.d || d));
      Object.assign(gesture, { d, mx, my });
      return;
    }
    if (!gesture.moved && Math.hypot(e.clientX - gesture.sx, e.clientY - gesture.sy) < 6) return;
    if (gesture.held) return; // the note's already on its way
    if (!gesture.moved) {
      gesture.moved = true;
      clearTimeout(gesture.hold);
      if (gesture.touch && !gesture.lifted) gesture.stack = null;
      // Pieces can be shuffled about with a mouse (just for you, it's not saved).
      gesture.drag = !!gesture.el && !gesture.stack && !state.tv && !gesture.touch;
      if (gesture.stack) {
        const L = layout.get(gesture.id);
        gesture.ax = parseFloat(gesture.stack.style.getPropertyValue('--x'));
        gesture.ay = parseFloat(gesture.stack.style.getPropertyValue('--y'));
        gesture.size = L ? { w: L.w, h: L.h } : { w: gesture.el.offsetWidth, h: gesture.el.offsetHeight };
        gesture.stack.classList.add('lifted');
      } else if (gesture.drag) {
        gesture.ox = parseFloat(gesture.el.style.left);
        gesture.oy = parseFloat(gesture.el.style.top);
        gesture.el.style.zIndex = ++zTop;
        const L = layout.get(gesture.id);
        if (L) L.z = zTop;
        gesture.el.classList.add('dragging');
      } else root.classList.add('panning');
      root.dispatchEvent(new CustomEvent('busy'));
    }
    if (gesture.stack) {
      // Anywhere on the piece, as long as their middle stays on it.
      gesture.nx = clamp(gesture.ax + (e.clientX - gesture.sx) / cam.s / gesture.size.w, 0, 1);
      gesture.ny = clamp(gesture.ay + (e.clientY - gesture.sy) / cam.s / gesture.size.h, 0, 1);
      gesture.stack.style.setProperty('--x', gesture.nx);
      gesture.stack.style.setProperty('--y', gesture.ny);
    } else if (gesture.drag) {
      const dx = (e.clientX - gesture.sx) / cam.s, dy = (e.clientY - gesture.sy) / cam.s;
      gesture.el.style.left = `${gesture.ox + dx}px`;
      gesture.el.style.top = `${gesture.oy + dy}px`;
    } else {
      cam.x -= (e.clientX - gesture.lx) / cam.s;
      cam.y -= (e.clientY - gesture.ly) / cam.s;
      applyCam();
      if (gesture.touch) {
        (gesture.trail ||= []).push({ t: e.timeStamp, x: e.clientX, y: e.clientY });
        if (gesture.trail.length > 8) gesture.trail.shift();
      }
    }
    gesture.lx = e.clientX;
    gesture.ly = e.clientY;
  });

  // A flick carries on and slows to a stop, as a phone's own scrolling does.
  // Letting go after holding still doesn't.
  function glide(trail = [], t) {
    const recent = trail.filter((p) => t - p.t < 100);
    if (recent.length < 2 || reduceMotion) return;
    const a = recent[0], b = recent.at(-1);
    let vx = (b.x - a.x) / Math.max(b.t - a.t, 1); // px per ms
    let vy = (b.y - a.y) / Math.max(b.t - a.t, 1);
    if (Math.hypot(vx, vy) < 0.3) return;
    const anim = { cancelled: false, glide: true, resolve() {} };
    camAnim = anim;
    let last = performance.now();
    const step = (now) => {
      if (anim.cancelled) return;
      const dt = Math.min(now - last, 50);
      last = now;
      const was = { x: cam.x, y: cam.y };
      cam.x -= (vx * dt) / cam.s;
      cam.y -= (vy * dt) / cam.s;
      applyCam();
      if (cam.x === was.x) vx = 0; // reached the edge of the work
      if (cam.y === was.y) vy = 0;
      const k = Math.exp(-dt / 325);
      vx *= k;
      vy *= k;
      if (Math.hypot(vx, vy) > 0.02) requestAnimationFrame(step);
      else if (camAnim === anim) camAnim = null;
    };
    requestAnimationFrame(step);
  }

  function putBack() {
    if (gesture.stack) {
      gesture.stack.classList.remove('lifted');
      if (gesture.ax == null) return;
      gesture.stack.style.setProperty('--x', gesture.ax);
      gesture.stack.style.setProperty('--y', gesture.ay);
      return;
    }
    gesture.el.style.left = `${gesture.ox}px`;
    gesture.el.style.top = `${gesture.oy}px`;
    gesture.el.classList.remove('dragging');
  }

  function endPointer(e) {
    if (!pointers.delete(e.pointerId)) return;
    if (gesture?.pinch) { if (pointers.size < 2) gesture = null; return; }
    const g = gesture;
    gesture = null;
    root.classList.remove('panning');
    if (!g) return;
    clearTimeout(g.hold);
    if (g.held) return;
    if (g.stack && (g.moved || g.lifted)) {
      g.stack.classList.remove('lifted');
      if (g.nx != null) onNoteMove(g.stack.dataset.note, g.nx, g.ny);
    } else if (g.moved && g.touch) {
      if (e.type === 'pointerup') glide(g.trail, e.timeStamp);
    } else if (g.drag) {
      g.el.classList.remove('dragging');
      const L = layout.get(g.id);
      if (L) {
        L.x = parseFloat(g.el.style.left) + L.w / 2;
        L.y = parseFloat(g.el.style.top) + L.h / 2;
      }
    } else if (!g.moved && g.id && !g.caught) onTap(g.id, g.hit);
  }
  root.addEventListener('pointerup', endPointer);
  root.addEventListener('pointercancel', endPointer);

  root.addEventListener('wheel', (e) => {
    e.preventDefault();
    cancelAnim();
    onInteract();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? vh : 1;
    if (e.ctrlKey || e.metaKey) zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * unit * 0.01));
    else {
      cam.x += (e.deltaX * unit) / cam.s;
      cam.y += (e.deltaY * unit) / cam.s;
      applyCam();
    }
  }, { passive: false });

  // Safari trackpad pinch
  let gestureScale = 1;
  root.addEventListener('gesturestart', (e) => { e.preventDefault(); gestureScale = 1; });
  root.addEventListener('gesturechange', (e) => {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, e.scale / gestureScale);
    gestureScale = e.scale;
  });

  root.addEventListener('dblclick', (e) => {
    if (e.target.closest('[data-id]') || state.tv) return;
    const wx = cam.x + (e.clientX - vw / 2) / cam.s;
    const wy = cam.y + (e.clientY - vh / 2) / cam.s;
    goTo({ x: wx, y: wy, s: cam.s * 1.8 }, 500);
  });

  // Ids of the pieces you can see right now (most of them on screen).
  function visible() {
    const hw = vw / 2 / cam.s, hh = vh / 2 / cam.s;
    return [...layout.values()]
      .filter((L) => Math.abs(L.x - cam.x) + L.w * 0.25 < hw && Math.abs(L.y - cam.y) + L.h * 0.25 < hh)
      .map((L) => L.id);
  }

  // Take one piece down and put another up in its place: same spot, same size
  // (the new one is cropped to fit), so the wall around it doesn't move.
  function swap(outId, p) {
    const old = layout.get(outId);
    const oldEl = els.get(outId);
    if (!old || !oldEl || layout.has(p.id)) return false;
    layout.delete(outId);
    els.delete(outId);
    layout.set(p.id, { ...old, id: p.id, rot: tiltFor(p), z: ++zTop });
    const el = draw(p);
    wake(el);
    // show the new one only once its image is in, so it simply cuts in
    const img = el.querySelector('img');
    if (img && !img.complete) {
      el.classList.add('pending');
      const swapIn = () => { el.classList.remove('pending'); oldEl.remove(); };
      img.addEventListener('load', swapIn, { once: true });
      img.addEventListener('error', swapIn, { once: true });
    } else oldEl.remove();
    built.list = built.list.map((q) => (q.id === outId ? p : q));
    return true;
  }

  // Take a piece down and leave its spot empty for now. Returns the spot.
  function vacate(id) {
    const L = layout.get(id);
    const el = els.get(id);
    if (!L || !el) return null;
    layout.delete(id);
    els.delete(id);
    el.remove();
    built.list = built.list.filter((q) => q.id !== id);
    return { x: L.x, y: L.y, w: L.w, h: L.h };
  }

  // Put a piece up in an empty spot, cropped to fit. It appears once its image is in.
  function fill(spot, p) {
    if (layout.has(p.id)) return false;
    layout.set(p.id, { ...spot, id: p.id, rot: tiltFor(p), z: ++zTop });
    const el = draw(p);
    wake(el);
    const img = el.querySelector('img');
    if (img && !img.complete) {
      el.classList.add('pending');
      const show = () => el.classList.remove('pending');
      img.addEventListener('load', show, { once: true });
      img.addEventListener('error', show, { once: true });
    }
    built.list = [...built.list, p];
    return true;
  }

  // A much bigger or smaller screen gets a fresh arrangement that fills it.
  let resizeTimer = 0;
  function resize() {
    vw = root.clientWidth || innerWidth;
    vh = root.clientHeight || innerHeight;
    applyCam();
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!root.hidden && (Math.abs(vw - built.vw) > built.vw * 0.15 || Math.abs(vh - built.vh) > built.vh * 0.15)) show(built.list);
    }, 400);
  }

  // ---------------------------------------------------------------- TV

  // On the TVs the wall holds still. The change comes from the work itself,
  // as pieces are swapped in place.
  const tourStep = () => sleep(2000);

  async function reveal(p) {
    const id = p.parent_id || p.id;
    if (state.tv) {
      // No flying about on the TVs: if it's not already in view, it takes the
      // place of something that is.
      if (onScreen(id)) return true;
      const piece = state.pins.get(id);
      const spot = visible().filter((v) => v !== id && state.pins.has(v));
      if (piece && spot.length) {
        remove(id);
        swap(spot[Math.floor(Math.random() * spot.length)], piece);
      }
      return true;
    }
    const target = frameCam(id, state.tv ? 0.58 : 0.5);
    return target ? goTo(target, 2800) : false;
  }

  return {
    root, show, add, remove, has, reveal, tourStep, resize, goTo, cancelAnim,
    notes,
    swap,
    vacate,
    fill,
    visible,
    shown: () => [...layout.keys()],
    arrive: (id) => { const el = els.get(id); if (el) arrive(el); },
    popDot: (id) => { const dot = els.get(id)?.querySelector(':scope > .dot'); if (dot) popDot(dot); },
    fit: (ms = 800) => goTo(home, ms),
    zoom: (factor) => goTo({ ...cam, s: cam.s * factor }, 300),
    pan: (dx, dy) => goTo({ ...cam, x: cam.x + dx / cam.s, y: cam.y + dy / cam.s }, 250),
    focusOn: (id) => { const t = frameCam(id, 0.55); if (t && !onScreen(id)) goTo(t, 1100); },
    wake: scheduleDetail,
  };
}
