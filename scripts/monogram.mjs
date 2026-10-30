// Builds the pb. monogram, and the share image made from it: what a link to
// Pinboard shows in Slack, iMessage and WhatsApp.
//
// pb. is set exactly as ps. is on the Potting Shed leaf (public/brand/leaf.svg),
// which turns out to be the logo's own p and s at 39%: the second letter tucks
// into the p's bowl (the s by 6.7 units, the b a touch less, 5.5, as its stem
// is straight), and the dot (as wide as a stem, just below the baseline) comes
// as close to it as the leaf's dot comes to the s: 4.92 units at the nearest.
// (Measured from the widest points instead, the b's dot would look twice as
// far away, as the b's bowl curves away at the dot's height and the s doesn't.)
// The p is the logo's, the b is the wordmark's (scripts/wordmark.mjs).
//
// The share image is the monogram in off-white, centred and big on hot pink
// (1200×630, everything well inside the middle square, so it crops square).
// The home-screen icons are made from it too (scripts/app-icon.mjs).
//
//   node scripts/monogram.mjs   (writes public/brand/pb.svg, and share.png
//                                using Chrome to draw it)

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { letters, bandBox, box, points, BASE } from './wordmark.mjs';

const BRAND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'brand');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const JOIN = -5.5; // the b's stem starts this far after the p's bowl (into it)
const DOT_CLEAR = 4.92; // nearest the dot comes to the letter before it
const R = 10.25;
const DOT_BOTTOM = BASE + 2.94;
const PINK = '#FF16A5';
const OFF_WHITE = '#F2F2F2';

const fmt = (v) => String(+v.toFixed(3));
const pathOf = (subs, dx) => subs.map((sp) => `M${fmt(sp.x + dx)} ${fmt(sp.y)}${sp.segs.map((s) => (s.type === 'L'
  ? `L${fmt(s.x + dx)} ${fmt(s.y)}`
  : `C${fmt(s.x1 + dx)} ${fmt(s.y1)} ${fmt(s.x2 + dx)} ${fmt(s.y2)} ${fmt(s.x + dx)} ${fmt(s.y)}`)).join('')}Z`).join('');

// Area and centre of an outline (from its points), for the centre of weight.
function areaOf(sp) {
  const pts = points(sp, 60);
  let a = 0, x = 0, y = 0;
  for (let k = 0; k < pts.length; k++) {
    const [x1, y1] = pts[k], [x2, y2] = pts[(k + 1) % pts.length];
    const c = x1 * y2 - x2 * y1;
    a += c; x += (x1 + x2) * c; y += (y1 + y2) * c;
  }
  return { a: Math.abs(a / 2), x: x / (3 * a), y: y / (3 * a) };
}

export function monogram() {
  const L = letters();
  const p = bandBox(L.p), b = bandBox(L.b);
  const bx = p.x1 + JOIN - b.x0;
  const cy = DOT_BOTTOM - R;
  const bOutline = L.b.flatMap((sp) => points(sp, 200)).map(([x, y]) => [x + bx, y]);
  const clear = (x) => Math.min(...bOutline.map(([px, py]) => Math.hypot(px - x, py - cy))) - R;
  let lo = b.x1 + bx - R, hi = b.x1 + bx + 2 * R; // where the dot's centre goes
  for (let k = 0; k < 50; k++) { const mid = (lo + hi) / 2; if (clear(mid) > DOT_CLEAR) hi = mid; else lo = mid; }
  const cx = (lo + hi) / 2;
  const x0 = box(L.p).x0, y0 = box(L.b).y0, y1 = box(L.p).y1;
  // One outline per letter (and the dot), so where p and b overlap they simply join.
  const shapes = (fill) => `<path fill="${fill}" fill-rule="evenodd" d="${pathOf(L.p, 0)}"/><path fill="${fill}" fill-rule="evenodd" d="${pathOf(L.b, bx)}"/><circle fill="${fill}" cx="${fmt(cx)}" cy="${fmt(cy)}" r="${R}"/>`;
  // Its centre of weight across (each letter less its counter, and the dot),
  // and the middle of its counters (the p's and the b's, at the same height).
  const parts = [
    ...[[L.p, 0], [L.b, bx]].flatMap(([[outer, counter], dx]) => {
      const o = areaOf(outer), c = areaOf(counter);
      return [{ a: o.a, x: o.x + dx }, { a: -c.a, x: c.x + dx }];
    }),
    { a: Math.PI * R * R, x: cx },
  ];
  const weightX = parts.reduce((s, q) => s + q.a * q.x, 0) / parts.reduce((s, q) => s + q.a, 0);
  const cb = box([L.p[1]]);
  return { shapes, x0, y0, w: cx + R - x0, h: y1 - y0, weightX, counterY: (cb.y0 + cb.y1) / 2 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const m = monogram();
  fs.writeFileSync(path.join(BRAND, 'pb.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${fmt(m.x0)} ${fmt(m.y0)} ${fmt(m.w)} ${fmt(m.h)}" width="${fmt(m.w)}" height="${fmt(m.h)}">
  <title>pb.</title>
  ${m.shapes('#171717')}
  </svg>
  `);

  // The share image: its box in the middle, a touch right as the dot side is lighter.
  const W = 1200, H = 630, k = 400 / m.h;
  const tx = W / 2 - (m.x0 + m.w / 2) * k + 0.012 * m.w * k, ty = H / 2 - (m.y0 + m.h / 2) * k;
  const share = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="${PINK}"/><g transform="translate(${fmt(tx)} ${fmt(ty)}) scale(${fmt(k)})">${m.shapes(OFF_WHITE)}</g></svg>`;
  console.log('public/brand/pb.svg');
  if (fs.existsSync(CHROME)) {
    const page = path.join(fs.mkdtempSync(path.join(fs.realpathSync('/tmp'), 'pinboard-share-')), 'share.html');
    fs.writeFileSync(page, `<!doctype html><body style="margin:0">${share}</body>`);
    execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--window-size=${W},${H}`, '--force-device-scale-factor=1', `--screenshot=${path.join(BRAND, 'share.png')}`, `file://${page}`], { stdio: 'ignore' });
    fs.rmSync(path.dirname(page), { recursive: true, force: true });
    console.log('public/brand/share.png');
  } else {
    console.log('share.png needs Google Chrome to draw it.');
  }
}
