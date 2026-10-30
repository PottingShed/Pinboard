// Builds the home-screen icons: Pinboard's pb. monogram (scripts/monogram.mjs)
// in white on each brand colour. Always white, whatever the colour
// (pottingshed.com's off-white, #F2F2F2). Every phone is given one of these at
// random the first time it opens Pinboard (index.html), so the icons round the
// studio come out in different colours.
//
// It's as wide as the ps. on the studio's own social profile pictures (64.7%
// of the icon), and centred by eye rather than by its box: its counters (the
// p's and the b's) sit dead on the icon's centre line, and the whole thing
// sits a touch right, because the stems on the left weigh more than the dot on
// the right. Halfway between its box's middle and its centre of weight goes in
// the middle.
//
//   node scripts/app-icon.mjs
//
// Writes public/brand/icons/: for each colour, the 180px PNG for iPhones, the
// 192px and 512px ones for Android and the manifest that names them. The PNGs
// need a Mac (QuickLook draws the SVG, sips sizes it).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { monogram } from './monogram.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '..', 'public', 'brand', 'icons');
// The brand colours (as in main.js). If these change, change the list in index.html too.
const COLOURS = ['#245FFF', '#FE1658', '#FF16A5', '#FF840A', '#FDE619', '#CEFF00', '#69FF46', '#01FECD', '#12CDFF', '#FFADA2'];
const WIDTH = 1725 / 2667; // as on the profile pictures (2667px square)

const m = monogram();
const across = (m.x0 + m.w / 2 + m.weightX) / 2;
const size = 1024;
const k = (WIDTH * size) / m.w;
const tx = size / 2 - across * k;
const ty = size / 2 - m.counterY * k;

const icon = (colour) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<rect width="${size}" height="${size}" fill="${colour}"/>
<g transform="translate(${tx.toFixed(3)} ${ty.toFixed(3)}) scale(${k.toFixed(5)})">${m.shapes('#F2F2F2')}</g>
</svg>
`;

// The manifest sits beside its icons, so its way back to the site is ../../
const manifest = (name) => JSON.stringify({
  name: 'Pinboard',
  short_name: 'Pinboard',
  description: "Potting Shed's studio wall",
  start_url: '../../',
  scope: '../../',
  display: 'standalone',
  background_color: '#F2F2F2',
  theme_color: '#F2F2F2',
  icons: [
    { src: `${name}-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: `${name}-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: `${name}-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}, null, 2);

if (process.platform !== 'darwin') {
  console.log('The icons are drawn with QuickLook, so make them on a Mac.');
  process.exit(1);
}
fs.mkdirSync(OUT, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pinboard-icon-'));
for (const colour of COLOURS) {
  const name = colour.slice(1);
  const svg = path.join(tmp, `${name}.svg`);
  fs.writeFileSync(svg, icon(colour));
  execFileSync('qlmanage', ['-t', '-s', String(size), '-o', tmp, svg], { stdio: 'ignore' });
  for (const [px, file] of [[180, `${name}.png`], [192, `${name}-192.png`], [512, `${name}-512.png`]]) {
    execFileSync('sips', ['-z', String(px), String(px), path.join(tmp, `${name}.svg.png`), '--out', path.join(OUT, file)], { stdio: 'ignore' });
  }
  fs.writeFileSync(path.join(OUT, `${name}.webmanifest`), `${manifest(name)}\n`);
  console.log(colour);
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log('public/brand/icons/');
