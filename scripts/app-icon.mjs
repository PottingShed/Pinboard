// Builds the home-screen icon: the "ps." from the leaf, in white, on a brand
// colour. The p and s are the logo's own letters, cut out of logo.svg, so the
// icon is sharp at any size.
//
//   node scripts/app-icon.mjs            (royal blue)
//   node scripts/app-icon.mjs "#FE1658"
//
// Writes public/brand/app-icon.svg and, on a Mac (QuickLook draws the SVG,
// sips sizes it), the 180px PNG for iPhones and the 192px and 512px ones for
// Android.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BRAND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'brand');
const colour = process.argv[2] || '#245FFF';
const logo = fs.readFileSync(path.join(BRAND, 'logo.svg'), 'utf8');
const paths = logo.match(/<path[^>]*\/?>(?:<\/path>)?/gs).join('')
  .replace(/\sfill="[^"]*"/g, '')
  .replace(/<path /g, '<path fill="#fff" ');

// Everything below is in the logo's units. Each letter is a window onto the
// logo: where it goes, and the bit of the logo it shows.
const GAP = 4.5; // between the p and the s, as tight as in the leaf
const p = { x: -0.5, vb: [-0.5, 21, 74.75, 92.75] }; // the p is x 0–73.75 in the logo
const s = { x: 73.75 + GAP - 0.375, vb: [404, 20.38, 56.25, 73.62] }; // the s is x 404.375–460.125
const r = 10.2; // the dot, as wide as a stem
const dot = { cx: 73.75 + GAP + 55.75 + 5.5 + r, cy: 93.38 - r };
const mark = { x0: 0, x1: dot.cx + r, top: 20.38, base: 93.38 };

const size = 1024;
const k = (size * 0.6) / (mark.x1 - mark.x0);
// Centred on the letters' bodies (top of the x-height to the baseline), like
// the TV logo on its "o", nudged down a touch for the tail of the p.
const tx = size / 2 - ((mark.x0 + mark.x1) / 2) * k;
const ty = size / 2 - ((mark.top + mark.base) / 2 + 5) * k;
const cut = (g) => `<svg x="${g.x}" y="${g.vb[1]}" width="${g.vb[2]}" height="${g.vb[3]}" viewBox="${g.vb.join(' ')}">${paths}</svg>`;

const svg = path.join(BRAND, 'app-icon.svg');
fs.writeFileSync(svg, `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<rect width="${size}" height="${size}" fill="${colour}"/>
<g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${k.toFixed(4)})">${cut(p)}${cut(s)}<circle fill="#fff" cx="${dot.cx.toFixed(2)}" cy="${dot.cy.toFixed(2)}" r="${r}"/></g>
</svg>
`);

if (process.platform === 'darwin') {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pinboard-icon-'));
  execFileSync('qlmanage', ['-t', '-s', String(size), '-o', tmp, svg], { stdio: 'ignore' });
  const big = path.join(tmp, 'app-icon.svg.png');
  for (const [px, name] of [[180, 'app-icon.png'], [192, 'app-icon-192.png'], [512, 'app-icon-512.png']]) {
    execFileSync('sips', ['-z', String(px), String(px), big, '--out', path.join(BRAND, name)], { stdio: 'ignore' });
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`Icon in ${colour}: public/brand/app-icon.svg and its PNGs`);
} else {
  console.log(`Icon in ${colour}: public/brand/app-icon.svg (make the PNGs on a Mac)`);
}
