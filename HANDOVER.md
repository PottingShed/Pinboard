# Pinboard: handover

For Jamie, from Luke (27 Oct 2026), updated by Jamie and Luke (29 Oct 2026). `README.md` has the full detail on what Pinboard does and how it's built; this note is where things stand and what's left.

## Where it is

- **Live at https://pinboard.pottingshed.com** since 29 Oct 2026. The website work is on it (530 pieces, imported 29 Oct).
- It's in the **Potting Shed** Cloudflare account (ID `d46ba8453fcdc412ec5078d42deb1af1`), the one that holds pottingshed.com's DNS. `wrangler.jsonc` names that account, so Wrangler always deploys there.
  - D1 database `pinboard` (Western Europe), tables created (migrations 0001–0005; 0006, 0007 and 0008 go on with the next deploy).
  - R2 bucket `pinboard-files`, holding the website work.
  - The custom domain made its own DNS record and certificate. The `workers.dev` address is switched off.
- **Password gate:** built, and on as soon as the password is set (step 3). Until then anyone with the link can add and take down work.
- The GitHub Pages copy (`npm run preview`, served from `docs/`) is still the prototype: there's no server, so what people add there is saved in their own browser only. The live version never uses `docs/` or `public/js/local.js`.

## To do

1. **Set the password first** (Luke, 30 Oct 2026: one global password for everyone). Luke will give it to you; it isn't written here because the repo is public. Run `npx wrangler secret put PINBOARD_PASSCODE` and paste it. Doing this before the deploy means the new version is never live unlocked (the current one already asks for it). From then on the gate is the first thing anyone sees, and each phone, laptop and TV asks once and remembers it for about a year, so each TV needs it typed in once. Changing it later signs everyone out.
2. **Deploy the latest** (types, sticky notes, tools used, the home-screen icons, the password gate): `npm run deploy`. It adds migrations 0006 (types), 0007 (where notes sit) and 0008 (tools used) before publishing. Until then the live site runs the version before them.
3. **Check it in a browser.**
   - Open https://pinboard.pottingshed.com: the password gate comes first. Then add a piece of each type (Our work in progress, Our work approved, Inspo, Social).
   - Stick a note on one from the wall (the note button, `N`, or a held finger on a phone), and drag it (on a phone, hold the note until it lifts first).
   - On a phone, check that dragging anywhere moves round the wall, and that a flick glides on.
   - Sort by a colour.
   - Open `https://pinboard.pottingshed.com/?tv=1` on a second screen. Approved work and social photos you add should cut in there; work in progress and inspo shouldn't.
   - On an iPhone, Share → Add to Home Screen, and check the icon (a random brand colour, different from phone to phone) and that it opens full screen.
4. **Tidy up.**
   - Make the repo private once the GitHub Pages preview isn't needed (the fonts are licensed), and turn off Pages.
   - Delete `docs/` once the preview is gone.
   - Delete the empty `pinboard` D1 database in Luke's own account (`Luke@pottingshed.com's Account`, ID `121dc0e8a89876f04d58573880de5ae3`). It was never used.

To deploy changes: `npm run deploy` from this folder (after `npx wrangler login`). It applies any new migrations, then publishes.

## Decisions already made with Luke

So nothing gets undone by accident:

- **The wall:** fills the screen and runs well past it, with the newest work in the middle. It's arranged fresh on every load, and you can't pan or zoom past the edge of the work.
- **Sticky notes** (Harry's ask, 29 Oct 2026, replacing "no sticky notes"): comments show on the wall as sticky notes on their piece and follow it everywhere; there's no separate comments system. They're small and hang off the edge of the work (Luke likes the layering). The newest is on top of a little stack with a count. Any brand colour, black text. They're added from the work itself (the note button on a piece, `N`, or a held finger on a phone), not from the nav, and can be dragged round their piece (where they sit is saved; on a phone, hold one until it lifts, then drag). Zoomed far out they fold down to the dot.
- **The pinboard wordmark** signs Pinboard's own notes and is used nowhere else. It's built from the logo's own outlines (p, i, n, o, d as drawn; b, a and r made from them by the logo's rules: one weight, bowls running into stems, arches springing from a notch, stem tops square with the top right corner rounded), and spaced by the white between the logo's own letters: b, o and a just touch, and the straight pairs are as tight as the logo's i n. Luke picked this one (version 9 of ten tried, 30 Oct 2026). `scripts/wordmark.mjs` explains each letter, and the gaps are in `GAPS` there.
- **On a phone, Add** offers the camera (photo or video) or the camera roll.
- **On a phone, a finger moves round the wall**, wherever it lands, never a piece (Luke, 30 Oct 2026: otherwise it's too hard to get around). A flick glides on and slows, as a phone's own scrolling does. Shuffling pieces is a mouse thing.
- **Four types** (29 Oct 2026): every piece is one of In progress (our work, studio only), Approved (our work, fine for anyone), Inspo (work we didn't make) or Social (life at Potting Shed). They replace Private/Public and the separate Inspiration section. Approved has plain tape; the others have coloured, labelled tape (yellow WIP, blue Inspo, pink Social).
- **Add asks two things** (Luke, 30 Oct 2026): What is it (Our work, Inspo, Social) and, for our work, Work status (In progress, Approved). "Public" is called Approved everywhere; in the data it's still `public`, and In progress is `wip`.
- **Show:** All (everything, Inspo included: the default), WIP, Approved, Inspo or Social.
- **Tools used** (Luke, 30 Oct 2026): its own field, alongside the description, for our work and inspo (not Social), stored as a list ("Figma, After Effects"). Typing suggests the tools already on the wall so names stay consistent, and a tool typed in other capitals takes the wall's spelling. Tools already written into older descriptions stay there until someone moves them.
- **Download** (Luke, 30 Oct 2026): in a piece's expanded view, for everyone, beside Full size. On phones it opens the share sheet (Save Image to Photos) for images; videos download.
- **No size to pick** (Luke, 30 Oct 2026): the wall sizes each piece itself every time it's arranged, mostly medium, some small, some large, never bigger than the image has the pixels for. The same piece can come back a different size, which Luke's happy with. Older pieces' stored sizes are ignored.
- **Studio agnostic** (Luke, 30 Oct 2026): nothing mentions Guernsey or Jersey, and Add doesn't ask for a studio. Older pieces keep theirs in the database, but it isn't shown.
- **Defaults:** wall view, newest first, All, video on, notes on. Video and notes can be turned off per person.
- **Refresh:** every five minutes the wall is redrawn with the latest work (on people's own screens only once they're idle).
- **Colour:** the wheel *sorts* by any colour; it doesn't filter.
- **Palette cards:** at most five, and only for client work.
- **Tape:** one strip on every piece (top or a corner), no pins.
- **Everything shows** in both views; only media near the screen loads, and far-away media is let go.
- **Boards** are shared and need no login: anyone can make one, save to it, rename or delete it. A ♡ shows on a piece under the pointer (nothing else does); the nav's ♡ lists boards. Opening TV mode on a board puts that board on the TVs (approved and social pieces only).
- **No hover captions** on pieces; the pointer is a small dot in the logo's colour. Hold space and drag to move round without picking anything up.
- **Home-screen icon:** the white "ps." on a brand colour (`scripts/app-icon.mjs`). Each phone gets a colour of its own, picked at random the first time it opens Pinboard and kept (Luke, 30 Oct 2026). The ps. is always white, whatever the colour (Luke). It's the favicon's ps. (`public/brand/leaf.svg`, "PS Favicon" from the brand folder), as big as on the studio's social profile pictures and centred by eye: the p's counter dead on the centre line, the whole thing a touch right to balance the p's tail against the dot. Added to a phone's home screen it opens full screen as "Pinboard". A phone keeps the icon from the day it was added, so it can't change colour on its own.
- **The logo:** hover it for a new brand colour and a quick hop of its leaves, left to right. Going into TV mode it glides to the middle, centred on its "o" (not its box, which sits high), and back again.
- **Glass:** the nav, its menus, the zoom and the section label are clear glass whose edges bend the wall behind (Luke's reference: clear, refracting, a hint of rainbow, not frosted). Menus are frosted only in the middle, for reading. Menus grow from their button on a spring. The ♡ on a piece is a small clear lens, kept quiet.
- **Sorting by colour** lasts for that visit only; the wall opens newest first.
- **No animation or announcements.** New work just appears: no drop-ins, no "just pinned" cards, no toasts. Only errors show a message.
- **New work defaults to Our work, In progress.** Social and Inspo stay picked for the rest of the day once used; Approved is always chosen deliberately. The TVs show Approved and Social only, from an allow-list, so a new type never reaches them by accident.
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
