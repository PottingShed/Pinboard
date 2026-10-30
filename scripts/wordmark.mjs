// Builds the "pinboard" wordmark that signs Pinboard's own sticky notes, out
// of the Potting Shed logo's letters, so it's unmistakably the same hand.
// The logo has p, i (with its leaf for a dot), n, o and d. The rest are made
// from those, following how the logo is drawn:
//   - one weight: stems and the sides of bowls 20.4 units, horizontals a
//     touch lighter (19) so they look the same;
//   - circular bowls that flow into their stems (no spur on the p, no foot on
//     the d), and arches that spring out of the stem with a sharp notch;
//   - flat ends sit exactly on the x-height (22.8) and baseline (91.1); round
//     shapes go about 2 beyond, so they look the same size;
//   - corners are sharp, except the top of a tall stem, which is rounded off
//     on its right-hand corner only (the d's and the h's);
//   - tight spacing, about a quarter of a stem.
// So b is the d mirrored, with the d's own stem top so the rounded corner
// stays on the right, as on the h; a is the d with its stem cut flat at the x-height
// (its round bowl still goes over); r is the n's stem and notched shoulder,
// cut square at the top of the arch, where the stroke runs level and is the
// same weight as everything else.
//
//   node scripts/wordmark.mjs        (writes public/brand/pinboard.svg)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BRAND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'brand');
const logo = fs.readFileSync(path.join(BRAND, 'logo.svg'), 'utf8');
const paths = logo.match(/<path[^>]*\/?>(?:<\/path>)?/gs).join('').replace(/\sfill="[^"]*"/g, '');

// Each letter is one or more windows onto the logo (in its units): x from–to,
// y from–to, whether it's mirrored, and a shape to keep it to where a window
// alone isn't enough. Each starts at the letter's left edge. Measured from
// logo.svg.
const D = 645.625; // the middle of the d, for mirroring it into a b
const LETTERS = {
  p: { x: [0, 73.75], y: [20, 114.5] },
  i: { x: [228, 252.25], y: [0, 92] },
  n: { x: [257.25, 320.5], y: [20, 92] },
  b: [
    { x: [608.75, 682.5], y: [10, 94], mirror: true },
    { x: [662.25, 682.5], y: [0, 10.5] }, // the stem's top, the right way round
  ],
  o: { x: [78, 151.75], y: [18, 94.5], keep: '<circle cx="114.875" cy="57.44" r="37.6"/>' }, // the next t's crossbar reaches over its corner
  a: { x: [608.75, 682.5], y: [20, 94], keep: '<path d="M608 19H661.5V22.8H683V95H608Z"/>' }, // the stem stops at the x-height
  r: { x: [257.25, 293.5], y: [20, 92] },
  d: { x: [608.75, 682.5], y: [0, 94] },
};
// Space before each letter, from the logo's own fitting: 4.75 between
// straight stems (its i→n), 4.25 where bowls meet (its p→o). The r's arm
// tucks in over the d's bowl, leaving about the same gap at its tip.
const GAPS = { i: 5, n: 4.75, b: 4.75, o: 4.25, a: 4.25, r: 4.75, d: 2 };

let at = 0;
const parts = [];
for (const ch of 'pinboard') {
  const windows = [].concat(LETTERS[ch]);
  at += GAPS[ch] || 0;
  windows.forEach((L, n) => {
    const w = L.x[1] - L.x[0], hgt = L.y[1] - L.y[0];
    const id = `${ch}${n}-keep`;
    const clip = L.keep ? `<clipPath id="${id}">${L.keep}</clipPath>` : '';
    const use = `<use href="#l"${L.mirror ? ` transform="translate(${2 * D} 0) scale(-1 1)"` : ''}${clip ? ` clip-path="url(#${id})"` : ''}/>`;
    parts.push(`<svg x="${at}" y="${L.y[0]}" width="${w}" height="${hgt}" viewBox="${L.x[0]} ${L.y[0]} ${w} ${hgt}">${clip}${use}</svg>`);
  });
  const first = windows[0];
  at += first.x[1] - first.x[0];
}
const width = +at.toFixed(2);
fs.writeFileSync(path.join(BRAND, 'pinboard.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 114.5" width="${width}" height="114.5" fill="#171717">
<title>Pinboard</title>
<defs><g id="l">${paths}</g></defs>
${parts.join('\n')}
</svg>
`);
console.log(`public/brand/pinboard.svg, ${width} × 114.5`);
