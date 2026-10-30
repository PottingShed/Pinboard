// Builds the favicon: the little icon in a browser tab. Pinboard's pb.
// monogram (scripts/monogram.mjs) in off-white on hot pink, the share image's
// colours, on a square with rounded corners.
//
// A tab icon is tiny (16px, or 32px on a Retina screen), so the monogram is
// bigger in its square than on the home-screen icon: about 80% of the width
// rather than 65%, or its counters close up. It's centred by eye the same way
// (scripts/app-icon.mjs): its counters dead on the centre line, and halfway
// between its box's middle and its centre of weight in the middle. The exact
// size is the one at which the p's stem then starts on a whole pixel (2px in
// at 16px, 4px at 32px), so its left edge is sharp rather than smudged across
// two pixels.
//
//   node scripts/favicon.mjs
//
// Writes public/brand/favicon.svg (what browsers use) and favicon-16.png and
// favicon-32.png for any that can't. Google Chrome draws the PNGs, at exactly
// those sizes (QuickLook fills the rounded corners in white).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { monogram } from './monogram.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BRAND = path.resolve(HERE, '..', 'public', 'brand');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const size = 32; // drawn on a 32px grid, so 16px is every other line
const CORNER = 6; // 3px at 16px
const LEFT = 4; // where the p's stem starts: 2px in at 16px

const m = monogram();
const across = (m.x0 + m.w / 2 + m.weightX) / 2;
const k = (size / 2 - LEFT) / (across - m.x0);
const tx = size / 2 - across * k;
const ty = size / 2 - m.counterY * k;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<rect width="${size}" height="${size}" rx="${CORNER}" fill="#FF16A5"/>
<g transform="translate(${tx.toFixed(4)} ${ty.toFixed(4)}) scale(${k.toFixed(6)})">${m.shapes('#F2F2F2')}</g>
</svg>
`;

const file = path.join(BRAND, 'favicon.svg');
fs.writeFileSync(file, svg);
console.log('public/brand/favicon.svg');

if (!fs.existsSync(CHROME)) {
  console.log('The PNGs need Google Chrome to draw them.');
  process.exit(1);
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pinboard-favicon-'));
for (const px of [16, 32]) {
  const page = path.join(tmp, `${px}.html`);
  fs.writeFileSync(page, `<!doctype html><body style="margin:0"><img src="${pathToFileURL(file)}" width="${px}" height="${px}" style="display:block">`);
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--window-size=${px},${px}`, '--force-device-scale-factor=1', '--default-background-color=00000000', `--screenshot=${path.join(BRAND, `favicon-${px}.png`)}`, pathToFileURL(page).href], { stdio: 'ignore' });
  console.log(`public/brand/favicon-${px}.png`);
}
fs.rmSync(tmp, { recursive: true, force: true });
