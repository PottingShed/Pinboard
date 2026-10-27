// Pin a batch of files onto a running Pinboard, e.g. to bring in the work from
// the website or give a new wall some starting material.
//
//   node scripts/seed.mjs list.json
//   PINBOARD_URL=https://pinboard.pottingshed.com PINBOARD_PASSCODE=… node scripts/seed.mjs list.json
//
// list.json is a list of things to pin, in order:
//   { "file": "/path/to/image.jpg", "title": "Yoono — The more Yoono", "size": "m",
//     "origin": "case-study", "created_at": 1735689600000 }
//   { "file": "/path/to/clip.mp4", "poster": "/path/to/frame.jpg", "title": "Showreel" }
//   { "comment": "Love this", "on": 3, "author": "Luke" }   // "on" = index of an earlier item
//
// On a Mac, `sips` makes the small preview copy and reads the colours, and
// QuickLook grabs a poster frame for videos that don't come with one.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { analysePixels } from '../public/js/colour.js';

const BASE = (process.env.PINBOARD_URL || 'http://localhost:8787').replace(/\/$/, '');
const PASSCODE = process.env.PINBOARD_PASSCODE || '';
const MAC = process.platform === 'darwin';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pinboard-seed-'));
const TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime' };
const typeOf = (file) => TYPES[path.extname(file).slice(1).toLowerCase()];

let cookie = '';
async function login() {
  if (!PASSCODE) return;
  const res = await fetch(`${BASE}/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ passcode: PASSCODE }),
  });
  cookie = (res.headers.get('set-cookie') || '').split(';')[0];
  if (!cookie) throw new Error('Passcode rejected');
}

async function upload(file, type) {
  const res = await fetch(`${BASE}/api/upload`, { method: 'POST', headers: { 'Content-Type': type, Cookie: cookie }, body: fs.readFileSync(file) });
  const data = await res.json();
  if (!res.ok) throw new Error(`${path.basename(file)}: ${data.error}`);
  return data.file;
}

async function pin(body) {
  const res = await fetch(`${BASE}/api/pins`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
}

// Width and height straight from the file header.
function imageSize(buf) {
  if (buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf.toString('ascii', 0, 3) === 'GIF') return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buf.toString('ascii', 12, 16);
    if (chunk === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
    if (chunk === 'VP8L') { const b = buf.readUInt32LE(21); return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 }; }
    return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
      i += 2 + len;
    }
  }
  throw new Error('Unknown image format');
}

// Video frame size from the first track header that has one (MP4/MOV).
function videoSize(buf) {
  let i = buf.indexOf('tkhd');
  while (i > 0) {
    const end = i - 4 + buf.readUInt32BE(i - 4);
    const w = buf.readUInt32BE(end - 8) / 65536;
    const h = buf.readUInt32BE(end - 4) / 65536;
    if (w && h) return { w: Math.round(w), h: Math.round(h) };
    i = buf.indexOf('tkhd', i + 4);
  }
  return { w: 16, h: 9 };
}

const sips = (...args) => execFileSync('sips', args, { stdio: 'ignore' });

function thumbFor(file, w, h) {
  if (!MAC || Math.max(w, h) <= 1100) return null;
  const out = path.join(TMP, `${Date.now()}-thumb.jpg`);
  sips('-Z', '960', '-s', 'format', 'jpeg', '-s', 'formatOptions', '80', file, '--out', out);
  return out;
}

// Shrink to 48x48, read the BMP, and run the same colour reading the browser uses.
function coloursFor(file) {
  if (!MAC) return null;
  const out = path.join(TMP, `${Date.now()}-c.bmp`);
  try {
    sips('-z', '48', '48', '-s', 'format', 'bmp', file, '--out', out);
    const b = fs.readFileSync(out);
    const start = b.readUInt32LE(10), w = b.readInt32LE(18), h = Math.abs(b.readInt32LE(22)), bpp = b.readUInt16LE(28) / 8;
    const row = Math.ceil((w * bpp) / 4) * 4;
    const px = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = start + y * row + x * bpp, o = (y * w + x) * 4;
        px[o] = b[i + 2]; px[o + 1] = b[i + 1]; px[o + 2] = b[i]; px[o + 3] = 255;
      }
    }
    return analysePixels(px);
  } catch {
    return null;
  } finally {
    fs.rmSync(out, { force: true });
  }
}

function posterFor(video) {
  if (!MAC) return null;
  try {
    execFileSync('qlmanage', ['-t', '-s', '960', '-o', TMP, video], { stdio: 'ignore', timeout: 30_000 });
    const png = path.join(TMP, `${path.basename(video)}.png`);
    if (!fs.existsSync(png)) return null;
    const jpg = png.replace(/\.png$/, '.jpg');
    sips('-s', 'format', 'jpeg', '-s', 'formatOptions', '80', png, '--out', jpg);
    return jpg;
  } catch {
    return null;
  }
}

const list = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
await login();
const made = [];
let failed = 0;
for (const [n, item] of list.entries()) {
  const extra = { author: item.author ?? null, studio: item.studio ?? null, origin: item.origin, created_at: item.created_at };
  try {
    if (item.comment) {
      const parent = made[item.on];
      if (!parent) throw new Error('Comment needs an earlier piece to go on');
      made.push(await pin({ kind: 'comment', text: item.comment, color: item.color || '#CEFF00', parent_id: parent.id, ...extra }));
    } else {
      const type = typeOf(item.file);
      if (!type) throw new Error(`Can't pin ${item.file}`);
      const buf = fs.readFileSync(item.file);
      const kind = type.startsWith('video') ? 'video' : 'image';
      const { w, h } = kind === 'video' ? videoSize(buf) : imageSize(buf);
      const src = await upload(item.file, type);
      let thumb = null;
      let colors = null;
      if (kind === 'video') {
        const poster = item.poster || posterFor(item.file);
        if (poster) {
          thumb = await upload(poster, typeOf(poster));
          colors = coloursFor(poster);
        }
      } else {
        const t = thumbFor(item.file, w, h);
        colors = coloursFor(t || item.file);
        if (t) { thumb = await upload(t, 'image/jpeg'); fs.rmSync(t, { force: true }); }
      }
      made.push(await pin({ kind, src, thumb, nat_w: w, nat_h: h, size: item.size || 'm', title: item.title, colors, ...extra }));
    }
  } catch (err) {
    failed++;
    made.push(null);
    console.error(`\n${item.file || item.comment}: ${err.message}`);
  }
  process.stdout.write(`\rPinned ${n + 1 - failed} of ${list.length}`);
}
fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\nDone${failed ? ` (${failed} failed)` : ''}: ${BASE}`);
