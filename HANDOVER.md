# Pinboard: handover

For Jamie, from Luke (27 Oct 2026). `README.md` has the full detail on what Pinboard does and how it's built; this note is where things stand and what's left to put it live.

## Where it is

- Built and tested end to end on Cloudflare's local emulation (`npm run dev`), with all the website work imported (530 pieces).
- **Adding work from anyone is already built.** Uploads, comments, public/private, inspiration and live updates all work in the Worker; they just need deploying to Cloudflare. The GitHub Pages copy (`npm run preview`, served from `docs/`) is a prototype: there's no server, so what people add there is saved in their own browser only. Once it's live on Cloudflare, `docs/` and `public/js/local.js`'s role go away (the live version never uses it).
- **Not live yet.**
- Already done on Cloudflare, in Luke's account (`Luke@pottingshed.com's Account`, ID `121dc0e8a89876f04d58573880de5ae3`):
  - Created the D1 database `pinboard` (Western Europe). Its ID is already in `wrangler.jsonc`. It has no tables yet; deploying adds them.
- Stuck on: **R2 isn't enabled on that account**, so the storage bucket can't be created.

## To put it live

1. **Pick the Cloudflare account.** Use the one that holds pottingshed.com's DNS (nameservers `algin` / `ingrid.ns.cloudflare.com`), so the custom domain attaches by itself. If that isn't Luke's account, run `npx wrangler d1 create pinboard` in the right one and put its `database_id` into `wrangler.jsonc`. The empty database in Luke's account can then be deleted.
2. **Enable R2** in the dashboard (R2 Object Storage, then Enable). It's free up to 10GB, but Cloudflare may want a card on file.
3. Install and set up:
   ```bash
   npm install
   npx wrangler login
   npx wrangler r2 bucket create pinboard-files
   npm run deploy        # creates the tables (migrations 0001–0005), then deploys
   ```
4. **Attach the domain.** Add this to `wrangler.jsonc`, then `npm run deploy` again:
   ```jsonc
   "routes": [{ "pattern": "pinboard.pottingshed.com", "custom_domain": true }]
   ```
5. **Passcode (optional).** Luke's preference is no passcode, just unlisted (it's already marked noindex). Without one, anyone with the link can add and take down work. To add one: `npx wrangler secret put PINBOARD_PASSCODE`.
6. **Import the website work.** This needs a Mac (it uses `sips` and QuickLook) and the website export folder, which is on Luke's machine at `~/Documents/Claude Code Projects/Potting Shed Website Redesign Test`:
   ```bash
   node scripts/website-list.mjs "/path/to/Potting Shed Website Redesign Test" > website.json
   PINBOARD_URL=https://pinboard.pottingshed.com node scripts/seed.mjs website.json
   ```
   Uploading about 800MB takes 10 minutes or so.
7. **Check it:**
   - Open the site and add a piece.
   - Leave a comment.
   - Sort by a colour.
   - Open `https://pinboard.pottingshed.com/?tv=1` on a second screen. Public work you add should cut in there; private work shouldn't.

## Decisions already made with Luke

So nothing gets undone by accident:

- **The wall:** fills the screen and runs well past it, with the newest work in the middle. It's arranged fresh on every load, and you can't pan or zoom past the edge of the work.
- **No sticky notes.** Comments live in the expanded view of a piece, with a small brand-coloured dot on any piece that has comments.
- **Inspiration** (work that isn't ours) is its own section, off the main wall by default.
- **Show:** All (our work, public and private: the default), Public, or Inspiration.
- **Defaults:** wall view, newest first, All, video on. Video can be turned off per person.
- **Refresh:** every five minutes the wall is redrawn with the latest work (on people's own screens only once they're idle).
- **Colour:** the wheel *sorts* by any colour; it doesn't filter.
- **Palette cards:** at most five, and only for client work.
- **Tape:** one strip on every piece (top or a corner), no pins.
- **Everything shows** in both views; only media near the screen loads, and far-away media is let go.
- **Boards** are shared and need no login: anyone can make one, save to it, rename or delete it. A ♡ shows on a piece under the pointer (nothing else does); the nav's ♡ lists boards. Opening TV mode on a board puts that board on the TVs (public pieces only).
- **No hover captions** on pieces; the pointer is a small dot in the logo's colour. Hold space and drag to move round without picking anything up.
- **The logo:** hover it for a new brand colour and a quick hop of its leaves, left to right. Going into TV mode it glides to the middle, and back again.
- **Sorting by colour** lasts for that visit only; the wall opens newest first.
- **No animation or announcements.** New work just appears: no drop-ins, no "just pinned" cards, no toasts. Only errors show a message.
- **New work defaults to Private** (studio only). TV mode shows public work only.
- **TV mode** (its own button in the nav):
  - The wall holds still. Every 10 seconds an older piece on screen comes down, and 5 seconds later the next piece goes up in its gap.
  - The logo sits big in the middle and changes brand colour every minute.
  - Comments only add their dot, never their text.

## Good to know

- **The repo is public for now** (Luke's call, 27 Oct 2026), at `PottingShed/Pinboard`, so the preview can run on GitHub Pages (`https://pottingshed.github.io/Pinboard/`). The fonts in `public/fonts/` are licensed to Potting Shed and can be downloaded from it, so it's worth making it private once the preview isn't needed.
- **Wrangler is pinned at 4.149.0.** `npm audit` flags a library inside its local-dev emulator; nothing from it ships.
- **Free plan limits:**
  - 100,000 Worker requests a day. Each image costs one the first time a browser sees it.
  - Uploads over 90MB go up in parts automatically, up to 250MB.
- **Local folders** (both git-ignored and safe to delete):
  - `.wrangler/` is the local emulator's database and files, about 900MB.
  - `data/` is left over from an earlier Node version, about 770MB.
- **If you run Wrangler from Claude Code:** its sandbox can't read the Wrangler login, so those commands need the sandbox turned off.
