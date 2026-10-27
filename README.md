# Pinboard

Potting Shed's shared studio wall at **pinboard.pottingshed.com**. Anyone in Guernsey or Jersey can pin work in progress, sketches and inspiration, comment on each other's work, and see it on every screen in both studios the moment it goes up. The website's case studies and project archive sit on the wall too, so old work turns up alongside new.

## What it does

- **Wall view.** A layered collage that fills the screen and runs far past it, newest work in the middle, arranged fresh on every visit. Tape is used sparingly, and a handful of palette cards (one client's colours each) sit among the work. Drag around to explore, pinch or ⌘-scroll to zoom; you can't go past the edge of the work, so the screen is always full.
- **Grid view.** A neat masonry layout whose columns drift slowly upward. Hover to slow it, scroll or drag to move it.
- **Add.** Images and video: drop, paste or browse, with an optional title and description (what it is, what it's for, what feedback would help). Each piece is **Our work** or **Inspiration** (work that isn't ours, with an optional source: who made it, or a link), and **Private** (studio only, the default) or **Public** (fine for the TVs). You add your name and studio once and it's remembered. The description and public/private can be changed later in the piece's expanded view.
- **Sections.** Our work (the default), Inspiration, or Everything, in the ⌄ menu. In the Inspiration section a small *inspiration* label sits by the logo; click it to go back.
- **Comments.** Open any piece to read and leave short comments (100 characters, with your name). A piece with comments gets a small brand-coloured dot in its corner showing how many.
- **Colour.** Pick any colour on the wheel and the wall sorts itself by it: closest in the middle (or the top of the grid). Tap a colour on a palette card, or in a piece's colour bar, to do the same.
- **Order and video.** Newest (the default), Mix or Random. Video can be switched off in the ⌄ menu for anyone who finds moving work distracting; it's remembered per person.
- **Live.** New work and comments appear on every open screen straight away, without fuss. Every five minutes the wall is also redrawn with the latest work (on people's own screens, only once they've left it alone for a couple of minutes).
- **TV mode** (the screen button in the nav, or `?tv=1`). Public work only. The Potting Shed logo sits big in the middle and changes brand colour every minute. The wall holds still: every 10 seconds one of the older pieces on screen comes down, and 5 seconds later something else goes up in the gap, so it evolves one piece at a time. New public work goes up the same way. Comments just add their dot. The grid version creeps very slowly.
- **The logo** is a different brand colour on every visit. Click it for a fresh arrangement.
- **Homepage.** The ⌄ menu has instructions for setting it as your browser homepage.

Keys: `G` grid/wall, `S` shuffle, `F` fit, `+`/`-` zoom, `T` TV mode, `Esc` leave. In an open piece, `←`/`→` go to the previous and next.

## How it's hosted

All on Cloudflare's free plan, so nothing has to stay switched on in the studio:

- **Workers** runs the API and serves the site (`worker/`, with the page itself in `public/`).
- **R2** holds the images and video (bucket `pinboard-files`).
- **D1** holds the pins and comments (database `pinboard`).
- A **Durable Object** (`Hub`) keeps a live connection to every open screen and pushes new pins and comments out.

What the free plan allows, and roughly what Pinboard uses:

| | Free allowance | Pinboard |
|---|---|---|
| Worker requests | 100,000 a day | Each first view of an image is one; after that browsers keep them for good. The page, fonts and scripts don't count. |
| R2 storage | 10GB | About 800MB for the website work |
| D1 reads | 5 million rows a day | Each page load reads every row once (about 530 today) |
| Upload size | 100MB per request | Bigger videos go up in 50MB parts automatically, up to 250MB |

If the studio ever outgrows it, Workers Paid is $5 a month and lifts all of these.

## Run it locally

Needs Node 20 or newer.

```bash
npm install
npm run db:local
npm run dev
```

Then open http://localhost:8787. Wrangler runs local copies of D1, R2 and the Durable Object in `.wrangler/`.

## Putting it live

1. Log in to Cloudflare (opens your browser once):
   ```bash
   npx wrangler login
   ```
2. Create the database and bucket, then put the database's `database_id` into `wrangler.jsonc`:
   ```bash
   npx wrangler d1 create pinboard
   npx wrangler r2 bucket create pinboard-files
   ```
3. Deploy (this sets up the database tables, then publishes):
   ```bash
   npm run deploy
   ```
4. Point `pinboard.pottingshed.com` at it. In `wrangler.jsonc`, add
   `"routes": [{ "pattern": "pinboard.pottingshed.com", "custom_domain": true }]`
   and deploy again. Cloudflare makes the DNS record and the certificate itself, since pottingshed.com's DNS is already there.
5. Bring the website work across (below).

| Setting | Where | What it does |
|---|---|---|
| `PINBOARD_PASSCODE` | `npx wrangler secret put PINBOARD_PASSCODE` | Optional studio passcode, asked once per browser and remembered for 400 days. Without it, anyone with the link can see and add to the board. |
| `PINBOARD_STUDIOS` | `vars` in `wrangler.jsonc` | Studios to pick from (`Guernsey,Jersey`) |
| `MAX_UPLOAD_MB` | `vars` in `wrangler.jsonc` | Largest file allowed (`250`) |

It's unlisted: every page and file tells search engines not to index it, and `robots.txt` turns crawlers away. For sign-in with studio Google or Microsoft accounts, put Cloudflare Access in front of it (free for up to 50 people).

Keep the repo **private**. The brand fonts in `public/fonts/` are licensed to Potting Shed.

## Bringing in the website work

```bash
node scripts/website-list.mjs "/path/to/Potting Shed Website Redesign Test" > website.json
PINBOARD_URL=https://pinboard.pottingshed.com node scripts/seed.mjs website.json
```

Leave out `PINBOARD_URL` to import into the local copy instead, and add `PINBOARD_PASSCODE=…` if you've set one. This brings in the 23 case studies (every image, plus the hero films under 40MB), the showreel tiles and the 103-project archive, tagged as website (public) work, plus one starter comment. Run it on a Mac: `sips` makes the previews and reads the colours, and QuickLook grabs video poster frames. `seed.mjs` takes any list in the same format, so it can import other batches too.

## The view-only preview (GitHub Pages)

For showing it round before it's live, `npm run preview` builds a view-only copy into `docs/` from the local copy (`npm run dev` must be running). GitHub Pages serves it from there (Settings → Pages → `main`, `/docs`). It reads a snapshot of the wall instead of the API and hides adding, comments and changes. Because a Pages site is public, it only includes public work, uses the 960px images and leaves out videos over 12MB (about 190MB in all). Once Pinboard is live on Cloudflare, `docs/` can be deleted.

## Setting up the studio TVs

Open `https://pinboard.pottingshed.com/?tv=1` in Chrome (enter the passcode once if you've set one), then make it full screen. Add `&view=grid` for the drifting grid instead of the wall, or set a screen up differently, e.g. `&video=off`, `&show=inspiration` or `&colour=ff840a` (sort by a colour). TVs only ever show public work. The screen stays awake, catches up on its own after Wi-Fi drops, and reloads every 6 hours for a fresh arrangement.

For a dedicated screen, start Chrome in kiosk mode:

```bash
open -a "Google Chrome" --args --kiosk "https://pinboard.pottingshed.com/?tv=1"
```

## Good to know

- Images are resized in the browser before upload: a 2400px copy for close-ups and a 960px preview for the wall.
- Video plays muted and loops. MP4 (H.264) plays everywhere. iPhone HEVC `.mov` files may not play on Chrome-based TVs, so export as MP4.
- "Take it down" hides a piece (and its comments) from the wall but keeps the file in R2.
- Where things sit on the wall isn't saved. Every visit is a new arrangement, and dragging is just for you. Comments belong to the piece, not a spot on the wall, so they follow it everywhere.

## Files

```
wrangler.jsonc       Cloudflare setup: Worker, R2, D1, Durable Object
worker/index.js      the API: pins, comments, uploads, files, passcode
worker/hub.js        live updates to every open screen
migrations/          the D1 database tables
public/              the site: page, styles, fonts, brand files
public/js/main.js    menus, adding things, live updates, TV mode, preview mode
public/js/wall.js    the layered collage and its camera
public/js/grid.js    the drifting masonry grid
public/js/colour.js  reading colours out of images
scripts/             importing batches (website work), building the preview
```
