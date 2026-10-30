// Builds the "pinboard" wordmark that signs Pinboard's own sticky notes, out
// of the Potting Shed logo's own outlines, so it's unmistakably the same hand.
//
// The logo has p, i (with its leaf for a dot), n, o and d, and those are used
// exactly as drawn. The rest are made from them, following how the logo is
// drawn (measured from logo.svg):
//   - one weight: stems 20.4 units, bowls near-circular;
//   - flat ends sit on the x-height (22.8) and baseline (91.1); round shapes
//     go about 2 beyond, so they look the same size;
//   - bowls run into their stems with no spur or foot (the p's top, the d's
//     bottom), and arches spring out of the stem with a notch (the n);
//   - every stem top is square, except its top right-hand corner, which is
//     rounded off (radius 3.665): the tall ones (d, h) and the short ones
//     (i, n) alike.
// So:
//   b is the d turned round, with its stem top put back the right way round
//     (rounded on the right, as on the h);
//   a is the d with its stem stopped at the x-height, finished like the i's
//     and the n's stem tops (square, rounded on the right);
//   r is the n's stem and notched shoulder, cut off square where the arch
//     runs level, so the arm is the same weight as everything else.
// Everything comes out as plain outlines (no clipping), so it opens cleanly
// in Illustrator.
//
// Spacing is matched to the logo's: round letters sit closer than straight
// ones, because the white around a curve looks bigger than the same gap
// between two stems (see GAPS).
//
//   node scripts/wordmark.mjs        (writes public/brand/pinboard.svg)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const BRAND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'brand');
const logo = fs.readFileSync(path.join(BRAND, 'logo.svg'), 'utf8');

export const XH = 22.796; // x-height: the top of the i and the n's stem
export const BASE = 91.137; // baseline
const R = 3.665; // the rounded corner on a stem top
const K = 0.5523; // a quarter circle as a curve

// ------------------------------------------------------------------ outlines
// Just enough SVG path handling to take the logo apart and put it back
// together: every outline becomes lines (L) and curves (C), in absolute units.

function arcToCurves(x1, y1, rx, ry, phi, large, sweep, x2, y2) {
  const a = (phi * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const xp = cos * dx + sin * dy, yp = -sin * dx + cos * dy;
  rx = Math.abs(rx); ry = Math.abs(ry);
  const lam = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
  if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
  let co = Math.sqrt(Math.max(0, (rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp) / (rx * rx * yp * yp + ry * ry * xp * xp)));
  if (large === sweep) co = -co;
  const cxp = (co * rx * yp) / ry, cyp = (-co * ry * xp) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2, cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const angle = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = angle(1, 0, (xp - cxp) / rx, (yp - cyp) / ry);
  let dt = angle((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  else if (sweep && dt < 0) dt += 2 * Math.PI;
  const n = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9));
  const h = dt / n, k = (4 / 3) * Math.tan(h / 4);
  const at = (t) => [cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos];
  const tan = (t) => [-rx * Math.sin(t) * cos - ry * Math.cos(t) * sin, -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos];
  const out = [];
  for (let i = 0; i < n; i++) {
    const s = t1 + i * h, e = s + h;
    const [ax, ay] = at(s), [bx, by] = i === n - 1 ? [x2, y2] : at(e), [sx, sy] = tan(s), [ex, ey] = tan(e);
    out.push({ type: 'C', x1: ax + k * sx, y1: ay + k * sy, x2: bx - k * ex, y2: by - k * ey, x: bx, y: by });
  }
  return out;
}

export function parse(d) {
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/g);
  let i = 0;
  const num = () => parseFloat(tokens[i++]);
  const flag = () => {
    const t = tokens[i];
    if (t.length > 1) { tokens[i] = t.slice(1); return +t[0]; } // flags can be run together: "01"
    i++;
    return +t;
  };
  const subs = [];
  let sp = null, x = 0, y = 0, cmd = '', last = null;
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? x : 0, oy = rel ? y : 0;
    switch (cmd.toUpperCase()) {
      case 'M':
        x = ox + num(); y = oy + num();
        sp = { x, y, segs: [] };
        subs.push(sp);
        cmd = rel ? 'l' : 'L';
        last = null;
        continue;
      case 'L': x = ox + num(); y = oy + num(); sp.segs.push({ type: 'L', x, y }); last = null; break;
      case 'H': x = (rel ? x : 0) + num(); sp.segs.push({ type: 'L', x, y }); last = null; break;
      case 'V': y = (rel ? y : 0) + num(); sp.segs.push({ type: 'L', x, y }); last = null; break;
      case 'C': {
        const s = { type: 'C', x1: ox + num(), y1: oy + num(), x2: ox + num(), y2: oy + num(), x: ox + num(), y: oy + num() };
        sp.segs.push(s); x = s.x; y = s.y; last = s; break;
      }
      case 'S': {
        const x1 = last ? 2 * x - last.x2 : x, y1 = last ? 2 * y - last.y2 : y;
        const s = { type: 'C', x1, y1, x2: ox + num(), y2: oy + num(), x: ox + num(), y: oy + num() };
        sp.segs.push(s); x = s.x; y = s.y; last = s; break;
      }
      case 'A': {
        const rx = num(), ry = num(), phi = num(), large = flag(), sweep = flag();
        const ex = ox + num(), ey = oy + num();
        sp.segs.push(...arcToCurves(x, y, rx, ry, phi, large, sweep, ex, ey));
        x = ex; y = ey; last = null; break;
      }
      case 'Z':
        x = sp.x; y = sp.y; last = null;
        if (i < tokens.length && !/[a-zA-Z]/.test(tokens[i])) throw new Error('numbers after Z');
        continue;
      default: throw new Error(`can't read ${cmd}`);
    }
  }
  return subs;
}

const map = (sp, f) => {
  const [x, y] = f(sp.x, sp.y);
  return {
    x, y,
    segs: sp.segs.map((s) => {
      const [px, py] = f(s.x, s.y);
      if (s.type === 'L') return { type: 'L', x: px, y: py };
      const [x1, y1] = f(s.x1, s.y1), [x2, y2] = f(s.x2, s.y2);
      return { type: 'C', x1, y1, x2, y2, x: px, y: py };
    }),
  };
};
const move = (subs, dx) => subs.map((sp) => map(sp, (x, y) => [x + dx, y]));
const mirror = (subs, about) => subs.map((sp) => map(sp, (x, y) => [2 * about - x, y]));

// Points along an outline, curves included, for measuring.
export function points(sp, steps = 24) {
  const out = [[sp.x, sp.y]];
  let px = sp.x, py = sp.y;
  for (const s of sp.segs) {
    if (s.type === 'L') out.push([s.x, s.y]);
    else for (let k = 1; k <= steps; k++) out.push(bez(px, py, s, k / steps));
    px = s.x; py = s.y;
  }
  return out;
}
const bez = (px, py, s, t) => {
  const u = 1 - t;
  return [u * u * u * px + 3 * u * u * t * s.x1 + 3 * u * t * t * s.x2 + t * t * t * s.x, u * u * u * py + 3 * u * u * t * s.y1 + 3 * u * t * t * s.y2 + t * t * t * s.y];
};
export function box(subs) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const sp of subs) for (const [x, y] of points(sp)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return { x0, x1, y0, y1 };
}

// Split a curve at t (de Casteljau): the part before and the part after.
function split(px, py, s, t) {
  const lerp = (a, b) => a + (b - a) * t;
  const ax = lerp(px, s.x1), ay = lerp(py, s.y1), bx = lerp(s.x1, s.x2), by = lerp(s.y1, s.y2), cx = lerp(s.x2, s.x), cy = lerp(s.y2, s.y);
  const dx = lerp(ax, bx), dy = lerp(ay, by), ex = lerp(bx, cx), ey = lerp(by, cy);
  const [mx, my] = [lerp(dx, ex), lerp(dy, ey)];
  return [{ type: 'C', x1: ax, y1: ay, x2: dx, y2: dy, x: mx, y: my }, { type: 'C', x1: ex, y1: ey, x2: cx, y2: cy, x: s.x, y: s.y }];
}
// Where along a curve x (or y) reaches v, for a curve that only goes one way.
function solve(px, py, s, v, axis) {
  let lo = 0, hi = 1;
  const f = (t) => bez(px, py, s, t)[axis] - v;
  const up = f(1) > f(0);
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    if ((f(mid) < 0) === up) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
const starts = (sp) => sp.segs.map((s, k) => (k ? [sp.segs[k - 1].x, sp.segs[k - 1].y] : [sp.x, sp.y]));
const near = (a, b, tol = 0.01) => Math.abs(a - b) < tol;

// A rounded corner, as on the logo's stem tops: from (ax, ay) to (bx, by),
// turning through a quarter circle.
function corner(ax, ay, bx, by, horizontalFirst) {
  return horizontalFirst
    ? { type: 'C', x1: ax + (bx - ax) * K, y1: ay, x2: bx, y2: by - (by - ay) * K, x: bx, y: by }
    : { type: 'C', x1: ax, y1: ay + (by - ay) * K, x2: bx - (bx - ax) * K, y2: by, x: bx, y: by };
}

// ------------------------------------------------------------------ letters

const outlines = [...logo.matchAll(/<path[^>]*\sd="([^"]+)"/g)].flatMap((m) => parse(m[1]));
// An outline of the logo, found by the top left corner of its box.
function pick(x0, y0) {
  const found = outlines.filter((sp) => { const b = box([sp]); return near(b.x0, x0, 0.6) && near(b.y0, y0, 0.6); });
  if (found.length !== 1) throw new Error(`expected one outline at ${x0}, ${y0}, found ${found.length}`);
  return found[0];
}

export function letters({ rCut = 293.5, aTop = 'notch' } = {}) {
  const p = [pick(0, 21.05), pick(20.44, 40.13)];
  const o = [pick(78.04, 21.05), pick(98.49, 40.13)];
  const i = [pick(228.12, 22.8), pick(228.64, 0.45)];
  const n = [pick(257.19, 20.45)];
  const d = [pick(608.87, 0.3), pick(629.31, 39.47)];

  // The d's stem: up its inside edge, across the top, round the corner (the
  // logo draws it as two short curves), and down the outside.
  const [dOut, dIn] = d;
  const top = dOut.segs.findIndex((s, k) => s.type === 'L' && near(s.y, 0.296) && dOut.segs[k + 1]?.type === 'L');
  const down = dOut.segs.findIndex((s, k) => k > top + 1 && s.type === 'C' && s.y > 50);
  const xIn = dOut.segs[top].x, yTop = dOut.segs[top].y;
  const [ox, oy] = starts(dOut)[down];

  // b: the d turned round, with the stem top's rounded corner moved back to
  // the right (the inside of the stem, once it's turned round).
  const [bOut0, bIn] = mirror(d, (box(d).x0 + box(d).x1) / 2);
  const bx = bOut0.segs[top].x, bo = starts(bOut0)[down][0];
  const bOut = {
    ...bOut0,
    segs: [
      ...bOut0.segs.slice(0, top),
      { type: 'L', x: bx, y: yTop + R },
      corner(bx, yTop + R, bx - R, yTop, false),
      { type: 'L', x: bo, y: yTop },
      { type: 'L', x: bo, y: oy },
      ...bOut0.segs.slice(down),
    ],
  };

  // a: the d's stem stopped at the x-height, square with its right-hand
  // corner rounded, like the i's. Cut there, the bowl would run into the
  // stem just under its top and leave a nick, so the bowl springs out of the
  // stem the way the n's arch does, from a notch lower down: the n's
  // shoulder, turned round.
  const outside = dOut.segs[down];
  const t = solve(ox, oy, outside, XH + R, 1);
  const [, rest] = split(ox, oy, outside, t);
  const xr = bez(ox, oy, outside, t)[0];
  const [nOut] = n;
  const nFrom = starts(nOut);
  const sh = nOut.segs.findIndex((s, k) => s.type === 'C' && nFrom[k][1] < 21 && s.y > 29); // apex down to the notch
  const shoulder = nOut.segs[sh], [apexX, apexY] = nFrom[sh], step = nOut.segs[sh + 1];
  const nEdge = box(n).x0;
  const bowlTop = starts(dOut)[top - 1]; // the top of the d's bowl
  const end = xr - (shoulder.x - nEdge), notch = xr - (step.x - nEdge);
  const k = (end - bowlTop[0]) / (apexX - shoulder.x); // the a's shoulder is a touch shorter
  const aShoulder = {
    type: 'C',
    x1: bowlTop[0] + (apexX - shoulder.x1) * k, y1: bowlTop[1],
    x2: end - (shoulder.x2 - shoulder.x) * k, y2: shoulder.y2,
    x: end, y: shoulder.y,
  };
  const aOut = aTop === 'flush'
    ? { ...dOut, segs: [...dOut.segs.slice(0, top), { type: 'L', x: xIn, y: XH }, { type: 'L', x: xr - R, y: XH }, corner(xr - R, XH, xr, XH + R, true), rest, ...dOut.segs.slice(down + 1)] }
    : {
      ...dOut,
      segs: [
        ...dOut.segs.slice(0, top - 1),
        aShoulder,
        { type: 'L', x: notch, y: shoulder.y },
        { type: 'L', x: notch, y: XH },
        { type: 'L', x: xr - R, y: XH },
        corner(xr - R, XH, xr, XH + R, true),
        rest,
        ...dOut.segs.slice(down + 1),
      ],
    };

  // r: the n's stem and shoulder, cut square where the arch runs level.
  const from = starts(nOut);
  const inner = nOut.segs.findIndex((s, k) => s.type === 'C' && from[k][0] < rCut && s.x > rCut);
  const outer = nOut.segs.findIndex((s, k) => s.type === 'C' && from[k][0] > rCut && s.x < rCut);
  const ti = solve(...from[inner], nOut.segs[inner], rCut, 0);
  const to = solve(...from[outer], nOut.segs[outer], rCut, 0);
  const [innerPart] = split(...from[inner], nOut.segs[inner], ti);
  const [, outerPart] = split(...from[outer], nOut.segs[outer], to);
  const rOut = {
    ...nOut,
    segs: [
      ...nOut.segs.slice(0, inner),
      { ...innerPart, x: rCut },
      { type: 'L', x: rCut, y: bez(...from[outer], nOut.segs[outer], to)[1] },
      { ...outerPart },
      ...nOut.segs.slice(outer + 1),
    ],
  };

  return { p, i, n, b: [bOut, bIn], o, a: [aOut, dIn], r: [rOut], d };
}

// ------------------------------------------------------------------ setting

// Letters are spaced by their bodies, between the x-height and the baseline,
// as in the logo: the i's leaf, the p's tail and the tall stems don't count.
export function bandBox(subs) {
  let x0 = Infinity, x1 = -Infinity;
  for (const sp of subs) for (const [x, y] of points(sp, 60)) if (y >= XH - 0.01 && y <= BASE + 0.01) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
  return { x0, x1 };
}

// The gap after each letter, between its body and the next one's (less than
// nothing means they overlap). Matched to the white between the logo's own
// letters (about 806 square units each, measured between the x-height and
// the baseline, 14 units deep): that brings the three round ones, b o a,
// together until they touch, so they overlap a little and join, as the
// logo's t crosses its o. The i to n is the logo's own.
export const GAPS = { p: 6.06, i: 8.63, n: 7.62, b: -1.5, o: -1.5, a: 8.82, r: -0.42 };

const fmt = (v) => String(+v.toFixed(3));
function svgPath(subs) {
  return subs.map((sp) => `M${fmt(sp.x)} ${fmt(sp.y)}${sp.segs.map((s) => (s.type === 'L'
    ? `L${fmt(s.x)} ${fmt(s.y)}`
    : `C${fmt(s.x1)} ${fmt(s.y1)} ${fmt(s.x2)} ${fmt(s.y2)} ${fmt(s.x)} ${fmt(s.y)}`)).join('')}Z`).join('');
}

export function build({ gaps = GAPS, rCut, word = 'pinboard' } = {}) {
  const L = letters({ rCut });
  let at = 0;
  const placed = [];
  [...word].forEach((ch, k) => {
    const b = bandBox(L[ch]);
    placed.push(move(L[ch], at - b.x0));
    at += b.x1 - b.x0 + (k < word.length - 1 ? gaps[ch] : 0);
  });
  // The whole word's ink, so nothing overhangs the edge (the i's leaf, the r's arm).
  const ink = box(placed.flat());
  const x0 = Math.min(0, ink.x0), x1 = Math.max(at, ink.x1);
  const width = +(x1 - x0).toFixed(3);
  const height = 114.5;
  // One outline per letter, so letters that touch or overlap just join.
  const paths = placed.map((subs) => `<path fill-rule="evenodd" d="${svgPath(move(subs, -x0))}"/>`).join('\n');
  return {
    width,
    paths,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" fill="#171717">
<title>Pinboard</title>
${paths}
</svg>
`,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { svg, width } = build();
  fs.writeFileSync(path.join(BRAND, 'pinboard.svg'), svg);
  console.log(`public/brand/pinboard.svg, ${width} × 114.5`);
}
