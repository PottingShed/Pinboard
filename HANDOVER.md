# Pinboard: handover

For Jamie, from Luke (27 Oct 2026), updated by Jamie and Luke (29 Oct 2026). `README.md` has the full detail on what Pinboard does and how it's built; this note is where things stand and what's left.

## Where it is

- **Live at https://pinboard.pottingshed.com** since 29 Oct 2026. The website work is on it (530 pieces, imported 29 Oct).
- It's in the **Potting Shed** Cloudflare account (ID `d46ba8453fcdc412ec5078d42deb1af1`), the one that holds pottingshed.com's DNS. `wrangler.jsonc` names that account, so Wrangler always deploys there.
  - D1 database `pinboard` (Western Europe), tables created (migrations 0001–0005; 0006 and 0007 go on with the next deploy).
  - R2 bucket `pinboard-files`, holding the website work.
  - The custom domain made its own DNS record and certificate. The `workers.dev` address is switched off.
- **No passcode** for now: anyone with the link can add and take down work.
- The GitHub Pages copy (`npm run preview`, served from `docs/`) is still the prototype: there's no server, so what people add there is saved in their own browser only. The live version never uses `docs/` or `public/js/local.js`.

## To do

1. **Deploy the latest** (types, sticky notes, the home-screen icon): `npm run deploy`. It adds migrations 0006 (types) and 0007 (where notes sit) before publishing. Until then the live site runs the version before them.
2. **Check it in a browser.**
   - Open https://pinboard.pottingshed.com and add a piece of each type.
   - Stick a note on one from the wall (the note button, `N`, or a held finger on a phone), and drag it (on a phone, hold the note until it lifts first).
   - On a phone, check that dragging anywhere moves round the wall, and that a flick glides on.
   - Sort by a colour.
   - Open `https://pinboard.pottingshed.com/?tv=1` on a second screen. Public work and social photos you add should cut in there; work in progress and inspo shouldn't.
   - On an iPhone, Share → Add to Home Screen, and check the icon and that it opens full screen.
3. **Decide on a passcode.** Luke's preference is none, just unlisted (it's already marked noindex). But the whole wall, work in progress included, goes to anyone with the link (TV mode only hides it on the TV), and now there are photos of the team too. With a passcode, each phone or laptop asks once and remembers it for about a year. To add one: `npx wrangler secret put PINBOARD_PASSCODE`.
4. **Tidy up.**
   - Make the repo private once the GitHub Pages preview isn't needed (the fonts are licensed), and turn off Pages.
   - Delete `docs/` once the preview is gone.
   - Delete the empty `pinboard` D1 database in Luke's own account (`Luke@pottingshed.com's Account`, ID `121dc0e8a89876f04d58573880de5ae3`). It was never used.

To deploy changes: `npm run deploy` from this folder (after `npx wrangler login`). It applies any new migrations, then publishes.

## Decisions already made with Luke

So nothing gets undone by accident:

- **The wall:** fills the screen and runs well past it, with the newest work in the middle. It's arranged fresh on every load, and you can't pan or zoom past the edge of the work.
- **Sticky notes** (Harry's ask, 29 Oct 2026, replacing "no sticky notes"): comments show on the wall as sticky notes on their piece and follow it everywhere; there's no separate comments system. They're small and hang off the edge of the work (Luke likes the layering). The newest is on top of a little stack with a count. Any brand colour, black text. They're added from the work itself (the note button on a piece, `N`, or a held finger on a phone), not from the nav, and can be dragged round their piece (where they sit is saved; on a phone, hold one until it lifts, then drag). Zoomed far out they fold down to the dot.
- **The pinboard wordmark** signs Pinboard's own notes and is used nowhere else. It's built from the logo's letters by its rules (one weight, circular bowls flowing into stems, notched shoulders, flat ends on the x-height with round overshoots, tall stems rounded on their right corner only, tight spacing); `scripts/wordmark.mjs` explains each letter.
- **On a phone, Add** offers the camera (photo or video) or the camera roll.
- **On a phone, a finger moves round the wall**, wherever it lands, never a piece (Luke, 30 Oct 2026: otherwise it's too hard to get around). A flick glides on and slows, as a phone's own scrolling does. Shuffling pieces is a mouse thing.
- **Four types** (29 Oct 2026): every piece is one of Work in progress (studio only), Public (our work, fine for anyone), Inspo (work we didn't make) or Social (life at Potting Shed). They replace Private/Public and the separate Inspiration section. Public has plain tape; the others have coloured, labelled tape (yellow WIP, blue Inspo, pink Social).
- **Show:** All (everything, Inspo included: the default), Public, WIP, Inspo or Social.
- **Defaults:** wall view, newest first, All, video on, notes on. Video and notes can be turned off per person.
- **Refresh:** every five minutes the wall is redrawn with the latest work (on people's own screens only once they're idle).
- **Colour:** the wheel *sorts* by any colour; it doesn't filter.
- **Palette cards:** at most five, and only for client work.
- **Tape:** one strip on every piece (top or a corner), no pins.
- **Everything shows** in both views; only media near the screen loads, and far-away media is let go.
- **Boards** are shared and need no login: anyone can make one, save to it, rename or delete it. A ♡ shows on a piece under the pointer (nothing else does); the nav's ♡ lists boards. Opening TV mode on a board puts that board on the TVs (public pieces only).
- **No hover captions** on pieces; the pointer is a small dot in the logo's colour. Hold space and drag to move round without picking anything up.
- **Home-screen icon:** the white "ps." from the leaf on royal blue (#245FFF), made from the logo's own letters (`scripts/app-icon.mjs`). Added to a phone's home screen it opens full screen as "Pinboard". A phone keeps the icon from the day it was added, so it can't change colour on its own.
- **The logo:** hover it for a new brand colour and a quick hop of its leaves, left to right. Going into TV mode it glides to the middle, centred on its "o" (not its box, which sits high), and back again.
- **Glass:** the nav, its menus, the zoom and the section label are clear glass whose edges bend the wall behind (Luke's reference: clear, refracting, a hint of rainbow, not frosted). Menus are frosted only in the middle, for reading. Menus grow from their button on a spring. The ♡ on a piece is a small clear lens, kept quiet.
- **Sorting by colour** lasts for that visit only; the wall opens newest first.
- **No animation or announcements.** New work just appears: no drop-ins, no "just pinned" cards, no toasts. Only errors show a message.
- **New work defaults to Work in progress.** Social and Inspo stay picked for the rest of the day once used; Public is always chosen deliberately. The TVs show Public and Social only, from an allow-list, so a new type never reaches them by accident.
- **TV mode** (its own button in the nav):
  - The wall holds still. Every 10 seconds an older piece on screen comes down, and 5 seconds later the next piece goes up in its gap.
  - The logo sits big in the middle and changes brand colour every minute.
  - Notes only add their dot, never their words.

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
- **If Wrangler says "Authentication error [code: 10000]"** for the Potting Shed account, log out and back in (`npx wrangler logout`, then `npx wrangler login`). If that doesn't fix it, use a Cloudflare API token scoped to the Potting Shed account in `CLOUDFLARE_API_TOKEN` (never in a file in this repo).
