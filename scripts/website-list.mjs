// Builds the list of website work for seed.mjs from the website export folder
// (05 Images, 06 Videos), so old projects sit on the wall alongside new work.
//
//   node scripts/website-list.mjs "/path/to/Potting Shed Website Redesign Test" > website.json
//   node scripts/seed.mjs website.json

import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2];
if (!root) {
  console.error('Usage: node scripts/website-list.mjs "/path/to/website folder" > website.json');
  process.exit(1);
}

const DAY = 864e5;
const MAX_VIDEO = 40 * 1024 * 1024; // keep the wall light; the big hero films stay on the website
const list = [];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const titleOf = (name) => name.replace(/^\d+\s+/, '').replace(/\.[a-z0-9]+$/i, '').replace(' - ', ' — ');
const ls = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => !f.startsWith('.')).sort() : []);

// Case studies: newest first on the website, so they get dates in that order.
// The dates only order things; the wall never shows them for website work.
const caseDir = path.join(root, '05 Images', 'Case Studies');
const filmDir = path.join(root, '06 Videos', 'Case Studies');
let yoonoHero = null;
ls(caseDir).forEach((folder, i) => {
  const title = titleOf(folder);
  const when = Date.UTC(2025, 8, 1) - i * 30 * DAY;
  ls(path.join(caseDir, folder)).filter((f) => /\.(jpe?g|png|webp|gif)$/i.test(f)).forEach((file, j) => {
    if (/^01 /.test(folder) && file === 'hero.jpg') yoonoHero = list.length;
    list.push({
      file: path.join(caseDir, folder, file),
      title,
      size: file.startsWith('hero') ? 'l' : pick(['s', 'm', 'm']),
      origin: 'case-study',
      created_at: when - j * 60_000,
    });
  });
  const film = path.join(filmDir, `${folder} - hero.mp4`);
  if (fs.existsSync(film) && fs.statSync(film).size <= MAX_VIDEO) {
    list.push({ file: film, title, size: 'l', origin: 'case-study', created_at: when + 60_000 });
  }
});

// Showreel tiles from the homepage, with their poster frames.
const reelDir = path.join(root, '06 Videos', 'Homepage');
for (const file of ls(reelDir).filter((f) => /showreel/i.test(f))) {
  const poster = path.join(root, '05 Images', 'Homepage', file.replace(/\.mp4$/, ' - poster.jpg'));
  list.push({
    file: path.join(reelDir, file),
    poster: fs.existsSync(poster) ? poster : undefined,
    title: 'Showreel',
    size: 'm',
    origin: 'case-study',
    created_at: Date.UTC(2025, 8, 2),
  });
}

// The project archive: older work, one cover each.
const archiveDir = path.join(root, '05 Images', 'Project Archive');
ls(archiveDir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).forEach((file, i) => {
  list.push({
    file: path.join(archiveDir, file),
    title: titleOf(file),
    size: pick(['s', 'm']),
    origin: 'archive',
    created_at: Date.UTC(2023, 0, 1) - i * 7 * DAY,
  });
});

// One comment, so the dot and the comments have something to show. Take it down whenever.
if (yoonoHero != null) list.push({ comment: 'Comments live here, with the work. Open any piece to add yours.', on: yoonoHero, author: 'Pinboard' });

process.stdout.write(JSON.stringify(list, null, 1));
console.error(`${list.length} things to pin`);
