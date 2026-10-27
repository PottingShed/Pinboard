// Builds a view-only copy of Pinboard into docs/, which GitHub Pages serves
// (Settings → Pages → main, /docs): the site, plus a snapshot of the wall and
// its images.
//
//   npm run dev                          (in another terminal)
//   node scripts/build-preview.mjs       (reads http://localhost:8787 by default)
//
// A preview site is public, so only public work goes in, with no comments
// except the starter one, and no private work at all. To keep it light it uses
// the 960px previews of images and leaves out videos over 12MB.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs');
const BASE = (process.env.PINBOARD_URL || 'http://localhost:8787').replace(/\/$/, '');
const MAX_VIDEO = 12 * 1024 * 1024;

const getJSON = async (p) => (await fetch(BASE + p)).json();
const config = await getJSON('/api/config');
const { pins } = await getJSON('/api/pins');

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'public'), OUT, { recursive: true, filter: (src) => !src.endsWith('_headers') });
fs.mkdirSync(path.join(OUT, 'data'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'files'), { recursive: true });
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

// Mark the page as the preview, so it reads the snapshot and hides adding/changing.
const indexFile = path.join(OUT, 'index.html');
fs.writeFileSync(indexFile, fs.readFileSync(indexFile, 'utf8').replace('<html lang="en">', '<html lang="en" data-preview>'));

async function copyFile(name) {
  const res = await fetch(`${BASE}/files/${name}`);
  if (!res.ok) throw new Error(`${name}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(path.join(OUT, 'files', name), buf);
  return buf.length;
}

async function sizeOf(name) {
  const res = await fetch(`${BASE}/files/${name}`, { method: 'HEAD' });
  return Number(res.headers.get('content-length') || 0);
}

const kept = [];
let bytes = 0;
let skipped = 0;
for (const p of pins) {
  if (p.kind === 'comment') continue;
  if (p.private) { skipped++; continue; }
  if (p.kind === 'video' && (await sizeOf(p.src)) > MAX_VIDEO) { skipped++; continue; }
  const piece = { ...p };
  if (p.kind === 'image' && p.thumb) piece.src = p.thumb; // the 960px copy everywhere
  bytes += await copyFile(piece.src);
  if (piece.thumb && piece.thumb !== piece.src) bytes += await copyFile(piece.thumb);
  kept.push(piece);
  process.stdout.write(`\rCopied ${kept.length} pieces, ${Math.round(bytes / 1e6)}MB`);
}
const ids = new Set(kept.map((p) => p.id));
const comments = pins.filter((p) => p.kind === 'comment' && p.author === 'Pinboard' && ids.has(p.parent_id));

fs.writeFileSync(path.join(OUT, 'data', 'pins.json'), JSON.stringify({ pins: [...kept, ...comments] }));
fs.writeFileSync(path.join(OUT, 'data', 'config.json'), JSON.stringify(config));
console.log(`\nPreview built in docs/: ${kept.length} pieces (${skipped} left out: private or big videos), ${Math.round(bytes / 1e6)}MB of media.`);
