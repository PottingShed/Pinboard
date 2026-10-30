# Pinboard

Potting Shed's shared studio wall at **pinboard.pottingshed.com**. Anyone at Potting Shed can pin work in progress, sketches, inspiration and photos from studio life, stick notes on each other's work, and see it on every screen in the studio the moment it goes up. The website's case studies and project archive sit on the wall too, so old work turns up alongside new.

## What it does

- **The way in.** Before anything shows: a full brand colour (a different one each time), the leaf and the pinboard wordmark in white (the wordmark as wide as the screen), and one thing to do. The intro runs on GSAP (hosted with the site, `public/vendor/gsap.min.js`): the leaf spins into its corner, the letters sweep up out of the bottom edge one after another with a little tilt, then the i's leaf springs on like a pin going in and the whole word gives a touch as it lands, before the field comes up. Afterwards, pointing at the wordmark sends a ripple through it from wherever you point. Once you're in, the page lifts away like a curtain to show the wall, and its bottom edge moves like something thick and liquid: the middle hangs back as it speeds up, then catches up and pulls flat as it goes, dragging the wordmark along a touch behind (`liftCurtain` in `public/js/main.js`; with reduced motion it just fades). That's **Sign in with Google** once it's switched on (work accounts only, see below), and until then one field for the studio password. Each browser stays in for about a year, then goes on to where it was headed. A wrong password gets a shake and "That's not it."
- **Signed in** (once Google is switched on), nobody types their name any more: Pinboard knows it, and puts your first name on what you pin and the notes you leave. Only whoever pinned a piece can change it or take it down (work from before there were accounts, and the website's, is still anyone's). The first time someone signs in, anything already up under their name becomes theirs. The ⌄ menu says who you're signed in as, signs you out, and copies a **TV link**.
- **Wall view.** A layered collage of everything, filling the screen and running far past it, newest work in the middle, arranged fresh on every visit. Each piece has one strip of tape, and a handful of palette cards (one client's colours each) sit among the work. Only what's near the screen loads; images further than a couple of screens away are let go again, so it stays quick with thousands of pieces. Drag around to explore, pinch or ⌘-scroll to zoom. With a mouse, dragging a piece moves it (hold space to move round without picking anything up). On a phone or tablet, a finger always moves round the wall wherever it lands, and a flick glides on and slows to a stop; touching again stops it without opening anything. You can't go past the edge of the work, so the screen is always full.
- **Grid view.** A neat masonry layout of everything, whose columns drift slowly upward. Hover to slow it, scroll or drag to move it. Tiles load as they come near the screen and are let go once they're well past it.
- **Add.** Images and video: drop, paste or browse (on a phone, **Camera** for a photo or video there and then, or **Camera roll** for as many as you like), with an optional title, description (what it is, what it's for, what feedback would help) and **Tools used** (e.g. Figma, After Effects, Midjourney; not asked for Social). Typing a tool suggests the ones already on the wall, most used first, so everyone spells them the same. Add asks **What is it**: Our work, Inspo or Social, and for our work, its **Work status**: In progress or Approved. So each piece is one of four types:
  - **In progress** (WIP): our work, not signed off yet. Studio only, never on the TVs. The default, so nothing goes public by accident.
  - **Approved**: our work, signed off and fine for anyone to see, and on the TVs.
  - **Inspo**: work we love that we didn't make, with an optional source (who made it, or a link). Not on the TVs.
  - **Social**: life at Potting Shed, socials and snapshots. On the TVs.

  Looking at one type, what you add is that type. Once you've added Social or Inspo it stays picked for the rest of the day, so a night out's photos don't each need it choosing again. You add your name once and it's remembered. There's no size to pick: Pinboard sizes each piece itself every time it arranges the wall (mostly medium, some small, some large), so the same piece can come back bigger or smaller, but never bigger than the image has the pixels for, so a small image stays small. The type, description and tools can be changed later in the piece's expanded view, where the tools show as small tags.
- **Download.** In a piece's expanded view, **Download** saves the file as it was pinned, named after the piece (`yoono-the-more-yoono.jpg`), next to **Full size**, which opens it in a new tab. On a phone it brings up the share sheet instead, where **Save Image** puts it in Photos; videos, which can be big, download straight away. Images are as they were pinned: at most 2400px across, as Pinboard stores them.
- **Telling them apart.** Approved work has plain tape. The others have coloured, labelled tape: yellow **WIP**, blue **Inspo**, pink **Social** (in the grid, a strip in the tile's corner). So work in progress stands out before anyone screenshots it for a client.
- **Show.** In the ⌄ menu: **All** (everything: the default), **WIP**, **Approved**, **Inspo** or **Social**. Looking at one type, a small label sits by the logo; click it to go back to All.
- **Boards.** Collections anyone can make, like a shared Pinterest, with no logins. Point at a piece and tap the ♡ in its corner (or **Save** in the expanded view) to put it on one or more boards, or make a new board there and then. The ♡ in the nav lists the boards: open one and the wall (or grid) shows just that board, newest saves in the middle, with its name by the logo. From the same menu the open board can be renamed, deleted (two taps) or its link copied (`?board=…`, which also works with `?tv=1`, so a TV can show a board). Anything added while a board is open goes on it too. Pieces that are taken down drop off their boards.
- **Sticky notes.** Notes (100 characters, with your name) stick to their piece on the wall, hanging off its edge, so you can read them without opening anything, and they go wherever the piece goes. Each is a brand colour with black text, never the same as the note under it. Pinboard's own notes are signed with the "pinboard" wordmark, made from the Potting Shed logo's letters (`public/brand/pinboard.svg`, and `pinboard-white.svg` for brand colours, both built by `scripts/wordmark.mjs`; it's also the name on the way-in page). A piece with several shows the newest on top, the ones before peeking out underneath, and a count; tap it to read them all in the piece's expanded view.
  - **Adding one:** point at a piece and tap the note button beside the ♡, or press `N`. On a phone, hold a finger on the piece. The note appears where you pointed: type, then Enter to stick it (Esc, or clicking away with nothing written, takes it off). In the grid, the note button opens the piece with its note box ready. Notes can also be added in the expanded view.
  - **Moving one:** drag it anywhere on its piece (its middle stays on the piece). On a phone, hold a finger on the note until it lifts, then drag it. Where it's stuck is saved for everyone.
  - **Zooming:** notes grow a little as you zoom out, to stay readable, and fold down to a small dot with a count when you're far out (where a phone starts). The **Notes** switch in the ⌄ menu folds them all down, per person.
- **Colour.** Pick any colour on the wheel and the wall sorts itself by it: closest in the middle (or the top of the grid). Tap a colour on a palette card, or in a piece's colour bar, to do the same.
- **Order and video.** Newest (the default), Mix or Random. Video can be switched off in the ⌄ menu for anyone who finds moving work distracting; it's remembered per person.
- **Live.** New work and notes appear on every open screen straight away, without fuss. Every five minutes the wall is also redrawn with the latest work (on people's own screens, only once they've left it alone for a couple of minutes).
- **TV mode** (the screen button in the nav, or **pinboard.pottingshed.com/tv**, which is short enough to type on a TV's remote; `?tv=1` works too). Approved work and Social only. The Potting Shed logo glides from its corner to the middle of the screen, centred on its "o" rather than its box so it looks centred (and back on the way out) and changes brand colour every minute. The wall holds still: every 10 seconds one of the older pieces on screen comes down, and 5 seconds later something else goes up in the gap, so it evolves one piece at a time. New approved work and social photos go up the same way. Notes show only as their dot, never their words. The grid version creeps very slowly.
- **The logo** is a different brand colour on every visit. Hover it and it takes another one while its three leaves hop, left to right. Click it for a fresh arrangement.
- **The pointer** is a small dot in the logo's colour (a ring while space is held). Pieces have no hover captions: open one to see what it is.
- **The nav is clear glass**, and so are its menus (frosted in the middle so they read), the zoom and the label by the logo. Their bevelled edges bend the wall behind like a thick slab, with a faint rainbow where the colours split (`public/js/glass.js`; Chrome, Edge and Arc only, elsewhere the glass just isn't bent), plus a thin iridescent rim and a soft light that follows the mouse. Menus grow out of the button that opened them on a spring and tuck back into it; the pill under an Order or Show choice slides to the next. The ♡ on a piece is a small clear lens that whitens when you point at it.
- **Homepage.** The ⌄ menu has instructions for setting it as your browser homepage.
- **On a phone's home screen** (Share → Add to Home Screen) it's an app called Pinboard, opening full screen without the browser around it. Its icon is the white **pb.** monogram (pottingshed.com's off-white, #F2F2F2) on a brand colour, and each phone gets its own: one is picked at random the first time a phone opens Pinboard, and kept, so the icons round the studio all differ. The monogram is always white, as wide as the ps. on the studio's social profile pictures and centred by eye: its counters dead on the centre line, the whole thing a touch right to balance the stems against the dot (`node scripts/app-icon.mjs` remakes all ten in `public/brand/icons/`). A phone keeps the icon it had when it was added, so an icon can't change colour by itself afterwards.
- **In a browser tab** its icon is the same **pb.**, off-white on hot pink (the share image's colours) on a square with rounded corners, on the wall and the way-in page alike. It's bigger in its square than on the home-screen icon (about 80% of the width, not 65%) so it still reads at 16px, centred by eye the same way, at the exact size where the p's stem starts on a whole pixel (`node scripts/favicon.mjs` remakes `public/brand/favicon.svg` and the 16px and 32px PNGs, drawn by Google Chrome).

Keys: `G` grid/wall, `S` shuffle, `F` fit, `+`/`-` zoom, `N` note on the piece under the pointer, `T` TV mode, `Esc` leave. In an open piece, `←`/`→` go to the previous and next.

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

To try signing in on your own Mac, without Google, put these in `.dev.vars` (git-ignored) and restart `npm run dev`:

```
DEV_SIGNIN=1
SESSION_SECRET=anything-long-and-random
```

The way-in page then asks for a name and a @pottingshed.com email instead of Google. It only ever works for someone on the same machine: Cloudflare sets the visitor's address itself, and the live site never has `DEV_SIGNIN`.

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
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `npx wrangler secret put …` | Switch on Sign in with Google (see "Signing in with Google" below). With them, the password isn't used. |
| `SESSION_SECRET` | `npx wrangler secret put SESSION_SECRET` | Signs who's who. Anything long and random (`openssl rand -hex 32`). Changing it signs everyone out and cancels every TV link. |
| `PINBOARD_DOMAIN` | `vars` in `wrangler.jsonc` (optional) | Whose Google accounts can sign in. `pottingshed.com` unless set. |
| `PINBOARD_GUESTS` | `vars` in `wrangler.jsonc` (optional) | Anyone else who can sign in, e.g. a freelancer: emails, separated by commas. |
| `PINBOARD_PASSCODE` | `npx wrangler secret put PINBOARD_PASSCODE` | The studio password (Luke has it; it's not written down here because the repo is public). Until Google is on, it lets anyone in. Once Google is on, it's only the **TV password**: typed in at `/tv`, it opens TV mode as nobody in particular (approved work and Social, look but don't touch), so even if it gets around, work in progress stays behind Google. Remembered for 400 days; changing it signs out everyone who used it. Without it (or Google), anyone with the link can see and add to the board. Locally, put `PINBOARD_PASSCODE=…` in `.dev.vars` (git-ignored). |
| `MAX_UPLOAD_MB` | `vars` in `wrangler.jsonc` | Largest file allowed (`250`) |

It's unlisted: every page and file tells search engines not to index it, and `robots.txt` turns crawlers away. A link to it pasted into Slack, iMessage or WhatsApp still shows a preview: the title, "Potting Shed's studio wall" and `public/brand/share.png`: the **pb.** monogram in off-white, big on hot pink (1200×630, never any work; it sits well inside the middle square, so it crops to a square too). pb. is set exactly as ps. is on the Potting Shed leaf (the logo's p and our b, the b tucked into the p's bowl a touch less than the s is, and the leaf's dot, as close to the b as it is to the s); `node scripts/monogram.mjs` makes `public/brand/pb.svg` and the share image.

### Signing in with Google

Done once, by someone with Potting Shed's Google Workspace admin:

1. Go to https://console.cloud.google.com, signed in with a pottingshed.com account, and create a project called **Pinboard**.
2. **Google Auth Platform → Branding:** app name **Pinboard**, a support email, and `pottingshed.com` as an authorised domain. **Audience:** choose **Internal**, so only Potting Shed accounts can use it (and Google doesn't need to review it).
3. **Clients → Create client:** type **Web application**, name **Pinboard**, and under **Authorised redirect URIs** add `https://pinboard.pottingshed.com/auth/google/callback`. Create it, and copy the **Client ID** and **Client secret**.
4. From this folder (the latest version deployed first, so the database has its `users` table):
   ```bash
   npx wrangler secret put GOOGLE_CLIENT_ID
   npx wrangler secret put GOOGLE_CLIENT_SECRET
   npx wrangler secret put SESSION_SECRET
   ```
   Paste the ID, the secret, and for the last one the output of `openssl rand -hex 32`. Sign-in is on as soon as the last one's in.
5. Sign in at pinboard.pottingshed.com.

Keep `PINBOARD_PASSCODE`: from now on it's the TV password (below).

The brand fonts in `public/fonts/` are licensed to Potting Shed. The repo is public for now so the preview can run on GitHub Pages; make it private once that isn't needed.

## Bringing in the website work

```bash
node scripts/website-list.mjs "/path/to/Potting Shed Website Redesign Test" > website.json
PINBOARD_URL=https://pinboard.pottingshed.com node scripts/seed.mjs website.json
```

Leave out `PINBOARD_URL` to import into the local copy instead, and add `PINBOARD_PASSCODE=…` if you've set one. This brings in the 23 case studies (every image, plus the hero films under 40MB), the showreel tiles and the 103-project archive, tagged as website (public) work, plus one starter comment. Run it on a Mac: `sips` makes the previews and reads the colours, and QuickLook grabs video poster frames. `seed.mjs` takes any list in the same format, so it can import other batches too.

## The prototype (GitHub Pages)

For showing it round before it's live, `npm run preview` builds a prototype into `docs/` from the local copy (`npm run dev` must be running). GitHub Pages serves it from there (Settings → Pages → `main`, `/docs`). There's no server behind it: it reads a snapshot of the wall, and what people add there (work, notes, boards) is saved in their own browser only (`public/js/local.js`), with a note saying so. Snapshot pieces can't be changed or taken down. Because a Pages site is public, it only includes Public work (no work in progress, inspo or social photos), uses the 960px images and leaves out videos over 12MB (about 190MB in all). Once Pinboard is live on Cloudflare, `docs/` can be deleted.

## Setting up the studio TVs

Open `https://pinboard.pottingshed.com/tv` in Chrome, type the studio password once, then make it full screen. Once Google sign-in is on, `/tv` asks for it as the **TV password** (the sign-in page has a small "TV mode" link too): nobody signs in on the TV, it opens straight into TV mode and stays there, and it can only look, never change anything; it's only ever sent approved work and Social. A **TV link** (⌄ menu → Copy a TV link) does the same without typing anything. Add `&view=grid` for the drifting grid instead of the wall, or set a screen up differently, e.g. `&video=off`, `&show=social` or `&colour=ff840a` (sort by a colour). TVs only ever show approved work and Social. The screen stays awake, catches up on its own after Wi-Fi drops, and reloads every 6 hours for a fresh arrangement.

For a dedicated screen, start Chrome in kiosk mode:

```bash
open -a "Google Chrome" --args --kiosk "https://pinboard.pottingshed.com/tv"
```

## Good to know

- Images are resized in the browser before upload: a 2400px copy for close-ups and a 960px preview for the wall.
- Video plays muted and loops. MP4 (H.264) plays everywhere. iPhone HEVC `.mov` files may not play on Chrome-based TVs, so export as MP4.
- "Take it down" hides a piece (and its notes) from the wall but keeps the file in R2.
- Where pieces sit on the wall isn't saved. Every visit is a new arrangement, and dragging a piece is just for you. Notes belong to the piece, and where one sits is saved as a share of the piece's width and height, so it follows the piece everywhere.
- Types are allow-listed for the TVs (`ON_TVS` in `public/js/store.js`), so a new type never reaches them by accident.

## Files

```
wrangler.jsonc       Cloudflare setup: Worker, R2, D1, Durable Object
worker/index.js      the API: pins, notes, uploads, files
worker/auth.js       the way in: Google sign-in, the stand-in for this Mac, the password, TV links, /tv
worker/wordmark.js   the wordmark letter by letter, for the way-in page to animate (made by scripts/wordmark.mjs)
public/vendor/       GSAP, for the way-in page's intro (copied from node_modules/gsap/dist; GSAP's free standard licence)
worker/hub.js        live updates to every open screen
migrations/          the D1 database tables
public/              the site: page, styles, fonts, brand files
public/js/main.js    menus, adding things, writing notes, live updates, TV mode, preview mode
public/js/pieces.js  a piece on the wall: tape, sticky notes, buttons
public/js/wall.js    the layered collage and its camera
public/js/grid.js    the drifting masonry grid
public/js/colour.js  reading colours out of images
scripts/             importing batches (website work), building the preview, the app icon, the pinboard wordmark and the pb. monogram
```
