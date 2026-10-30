// Pinboard: Potting Shed's shared studio wall, on Cloudflare.
// The page itself is served straight from public/; this Worker handles
// everything else: the API (D1), images and video (R2), uploads, the optional
// passcode, and live updates (via the Hub Durable Object).


export { Hub } from './hub.js';

// Each note is one of the brand colours (with black text); it colours the dot on the piece too.
const COMMENT_COLOURS = ['#FDE619', '#CEFF00', '#69FF46', '#01FECD', '#12CDFF', '#245FFF', '#FF16A5', '#FE1658', '#FF840A', '#FFADA2'];
const COMMENT_MAX = 100;
const TITLE_MAX = 80;
const DESCRIPTION_MAX = 400;
const NAME_MAX = 40;
const BOARD_NAME_MAX = 60;
// What a piece is, and so who it's for. public and social show on the TVs;
// wip (work in progress) is for the studio only; inspo is work we didn't make.
const TYPES = ['public', 'wip', 'inspo', 'social'];
// studio: pinned by the team; case-study and archive: imported from the website.
const ORIGINS = ['studio', 'case-study', 'archive'];
const FROM_WEBSITE = ['case-study', 'archive'];
const UPLOAD_TYPES = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov',
};
const FILE_RE = /^[a-z0-9]+\.(jpg|png|webp|gif|avif|mp4|webm|mov)$/;
// Workers on the free plan take request bodies up to 100MB, so anything bigger
// goes up in 50MB parts and R2 puts it back together.
const SINGLE_MAX = 95 * 1024 * 1024;
const PART_SIZE = 50 * 1024 * 1024;
const NOINDEX = 'noindex, nofollow, noimageindex';

const maxUpload = (env) => (Number(env.MAX_UPLOAD_MB) || 250) * 1024 * 1024;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': NOINDEX, ...headers },
  });
}

async function readJSON(request) {
  if (Number(request.headers.get('content-length') || 0) > 64 * 1024) throw new HttpError(413, 'Too large');
  try { return await request.json(); } catch { throw new HttpError(400, 'Bad JSON'); }
}

const clean = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
// Like clean(), but keeps line breaks (no more than one blank line in a row).
const cleanText = (v, max) => (typeof v === 'string'
  ? v.replace(/\r/g, '').split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, max)
  : '');

// What a piece was made with, as a list: "Figma, After Effects". Each tool
// once (whatever the capitals), at most 12 of them.
const TOOLS_MAX = 12;
function cleanTools(v) {
  if (typeof v !== 'string') return null;
  const seen = new Set();
  const tools = v.split(',').map((t) => clean(t, 40)).filter((t) => t && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()));
  return tools.length ? tools.slice(0, TOOLS_MAX).join(', ') : null;
}

function newId() {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Date.now().toString(36) + [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// { palette: [{ c: '#1d3fd0', w: 0.42 }, …] } worked out in the browser, checked.
function cleanColors(colors) {
  if (!colors || !Array.isArray(colors.palette)) return null;
  const palette = colors.palette
    .filter((e) => e && /^#[0-9a-f]{6}$/i.test(e.c) && e.w > 0 && e.w <= 1)
    .slice(0, 8)
    .map((e) => ({ c: e.c.toLowerCase(), w: Math.round(e.w * 1000) / 1000 }));
  return palette.length ? JSON.stringify({ palette }) : null;
}

// ---------------------------------------------------------------- database

const COLUMNS = ['id', 'kind', 'origin', 'parent_id', 'src', 'thumb', 'nat_w', 'nat_h', 'size', 'rot', 'fix', 'fix_color',
  'title', 'description', 'tools', 'source', 'text', 'color', 'colors', 'author', 'studio', 'type', 'ax', 'ay', 'created_at'];

// D1 builds the JSON for the whole wall itself, so the Worker never has to
// parse hundreds of rows (free Workers get 10ms of CPU per request).
const ALL_PINS = `SELECT json_group_array(json_object(${COLUMNS.map((c) => `'${c}', ${c === 'colors' ? 'json(colors)' : c}`).join(', ')})) AS pins
  FROM (SELECT * FROM pins WHERE deleted_at IS NULL ORDER BY created_at)`;

async function getPin(env, id) {
  const row = await env.DB.prepare('SELECT * FROM pins WHERE id = ? AND deleted_at IS NULL').bind(id).first();
  if (!row) return null;
  delete row.deleted_at;
  delete row.private; // replaced by type
  return { ...row, colors: row.colors ? JSON.parse(row.colors) : null };
}

// A board and what's on it, as JSON straight from D1. Pieces that have been
// taken down drop off. The browser puts them in order.
const BOARD_JSON = `json_object('id', b.id, 'name', b.name, 'author', b.author, 'created_at', b.created_at,
  'pins', json((SELECT json_group_array(json_object('id', bp.pin_id, 'by', bp.added_by, 'at', bp.added_at))
    FROM board_pins bp JOIN pins p ON p.id = bp.pin_id AND p.deleted_at IS NULL WHERE bp.board_id = b.id)))`;
const ALL_BOARDS = `SELECT json_group_array(${BOARD_JSON}) AS boards FROM (SELECT * FROM boards WHERE deleted_at IS NULL ORDER BY created_at) b`;
const ONE_BOARD = `SELECT ${BOARD_JSON} AS board FROM boards b WHERE b.id = ? AND b.deleted_at IS NULL`;

// Send everyone the board as it is now, and reply with it.
async function boardChanged(env, ctx, id, status = 200) {
  const row = await env.DB.prepare(ONE_BOARD).bind(id).first();
  if (!row) throw new HttpError(404, 'That board’s gone');
  const board = JSON.parse(row.board);
  ctx.waitUntil(broadcast(env, 'board', board));
  return json(board, status);
}

const fileExists = async (env, name) => FILE_RE.test(name || '') && !!(await env.BUCKET.head(name));

// A piece's type. Pages opened before there were types send private and
// origin instead; anything that says neither (like the website import) is public.
function typeOf(body) {
  if (TYPES.includes(body.type)) return body.type;
  if (body.origin === 'inspiration') return 'inspo';
  if (typeof body.private === 'boolean') return body.private ? 'wip' : 'public';
  return null;
}

// Where a sticky note sits on its piece: its middle, as a share of the
// piece's width and height.
function place(body) {
  const ok = (v) => typeof v === 'number' && Number.isFinite(v);
  if (!ok(body.ax) || !ok(body.ay)) return null;
  const share = (v) => Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000;
  return { ax: share(body.ax), ay: share(body.ay) };
}

async function createPin(body, env) {
  const kind = body.kind;
  const origin = ORIGINS.includes(body.origin) ? body.origin : 'studio';
  // Work imported from the website can carry an older date so "newest" stays honest.
  const when = FROM_WEBSITE.includes(origin) && Number.isFinite(body.created_at) ? body.created_at : Date.now();
  const base = {
    id: newId(), kind, origin, parent_id: null, src: null, thumb: null, nat_w: null, nat_h: null, size: null,
    rot: 0, fix: null, fix_color: null, title: null, tools: null, text: null, color: null, colors: cleanColors(body.colors),
    type: 'public', ax: null, ay: null,
    author: clean(body.author, NAME_MAX) || null,
    studio: null, // no longer asked: Pinboard isn't tied to either studio
    created_at: when,
  };

  if (kind === 'image' || kind === 'video') {
    if (!(await fileExists(env, body.src))) throw new HttpError(400, 'Upload missing');
    const type = typeOf(body) || 'public';
    return {
      ...base,
      src: body.src, thumb: (await fileExists(env, body.thumb)) ? body.thumb : null,
      nat_w: Math.max(1, Math.round(Number(body.nat_w) || 4)),
      nat_h: Math.max(1, Math.round(Number(body.nat_h) || 3)),
      title: clean(body.title, TITLE_MAX) || null,
      description: cleanText(body.description, DESCRIPTION_MAX) || null,
      tools: cleanTools(body.tools),
      source: type === 'inspo' ? clean(body.source, 300) || null : null,
      type,
    };
  }

  // A comment on a piece of work
  if (kind === 'comment') {
    const text = clean(body.text, COMMENT_MAX);
    if (!text) throw new HttpError(400, 'Write something first');
    const parent = await env.DB.prepare('SELECT kind FROM pins WHERE id = ? AND deleted_at IS NULL').bind(body.parent_id || '').first();
    if (!parent || parent.kind === 'comment') throw new HttpError(404, 'That piece has gone');
    const color = COMMENT_COLOURS.includes(body.color) ? body.color : COMMENT_COLOURS[0];
    return { ...base, text, color, parent_id: body.parent_id, colors: null, ...place(body) };
  }

  throw new HttpError(400, 'Unknown kind');
}

// ---------------------------------------------------------------- live updates

const hub = (env) => env.HUB.get(env.HUB.idFromName('wall'));
const broadcast = (env, type, data) => hub(env).broadcast(JSON.stringify({ type, data }));

// ---------------------------------------------------------------- files

const contentTypeOf = (request) => (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();

async function upload(request, env) {
  const ext = UPLOAD_TYPES[contentTypeOf(request)];
  if (!ext) throw new HttpError(415, 'Images (JPG, PNG, WebP, GIF, AVIF) and videos (MP4, WebM, MOV) only.');
  const size = Number(request.headers.get('content-length') || 0);
  if (!size) throw new HttpError(400, 'Empty file');
  if (size > SINGLE_MAX) throw new HttpError(413, 'Too big to send in one go');
  const name = `${newId()}.${ext}`;
  await env.BUCKET.put(name, request.body, { httpMetadata: { contentType: contentTypeOf(request) } });
  return json({ file: name }, 201);
}

async function uploadStart(request, env) {
  const { type, size } = await readJSON(request);
  const ext = UPLOAD_TYPES[type];
  if (!ext) throw new HttpError(415, 'Images (JPG, PNG, WebP, GIF, AVIF) and videos (MP4, WebM, MOV) only.');
  if (!(size > 0) || size > maxUpload(env)) throw new HttpError(413, `Files up to ${maxUpload(env) / 1024 / 1024}MB please.`);
  const name = `${newId()}.${ext}`;
  const up = await env.BUCKET.createMultipartUpload(name, { httpMetadata: { contentType: type } });
  return json({ name, uploadId: up.uploadId, partSize: PART_SIZE });
}

async function uploadPart(request, env, url) {
  const name = url.searchParams.get('name') || '';
  const uploadId = url.searchParams.get('uploadId') || '';
  const n = Number(url.searchParams.get('part'));
  if (!FILE_RE.test(name) || !uploadId || !(n >= 1 && n <= 100)) throw new HttpError(400, 'Bad part');
  if (Number(request.headers.get('content-length') || 0) > PART_SIZE) throw new HttpError(413, 'Part too big');
  const part = await env.BUCKET.resumeMultipartUpload(name, uploadId).uploadPart(n, request.body);
  return json(part);
}

async function uploadFinish(request, env) {
  const { name, uploadId, parts } = await readJSON(request);
  if (!FILE_RE.test(name || '') || !uploadId || !Array.isArray(parts) || !parts.length) throw new HttpError(400, 'Bad upload');
  await env.BUCKET.resumeMultipartUpload(name, uploadId).complete(parts.map((p) => ({ partNumber: p.partNumber, etag: p.etag })));
  return json({ file: name }, 201);
}

// Images and video from R2. Range requests are passed through (Safari won't
// play video without them); whole files are cached at the edge, and in the
// browser forever, since a file never changes once it's up.
async function serveFile(request, env, ctx, name) {
  if (!FILE_RE.test(name) || !['GET', 'HEAD'].includes(request.method)) return new Response('Not found', { status: 404 });
  const want = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') || '');
  if (!want) {
    const hit = await caches.default.match(request);
    if (hit) return hit;
  }
  let range;
  if (want) {
    const head = await env.BUCKET.head(name);
    if (!head) return new Response('Not found', { status: 404 });
    const size = head.size;
    const start = want[1] === '' ? Math.max(0, size - Number(want[2])) : Number(want[1]);
    const end = want[1] !== '' && want[2] !== '' ? Math.min(Number(want[2]), size - 1) : size - 1;
    if (start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    range = { offset: start, length: end - start + 1 };
  }
  const ranged = !!range;
  const obj = await env.BUCKET.get(name, range ? { range } : { onlyIf: request.headers });
  if (!obj) return new Response('Not found', { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('ETag', obj.httpEtag);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('Accept-Ranges', 'bytes');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Robots-Tag', NOINDEX);
  if (!('body' in obj)) return new Response(null, { status: 304, headers });
  if (ranged) {
    headers.set('Content-Range', `bytes ${range.offset}-${range.offset + range.length - 1}/${obj.size}`);
    headers.set('Content-Length', String(range.length));
    return new Response(request.method === 'HEAD' ? null : obj.body, { status: 206, headers });
  }
  headers.set('Content-Length', String(obj.size));
  const res = new Response(request.method === 'HEAD' ? null : obj.body, { headers });
  if (request.method === 'GET') ctx.waitUntil(caches.default.put(request, res.clone()));
  return res;
}

// ---------------------------------------------------------------- passcode (optional)

const enc = (s) => new TextEncoder().encode(s);

async function tokenFor(env) {
  const digest = await crypto.subtle.digest('SHA-256', enc(`pinboard:${env.PINBOARD_PASSCODE}`));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function cookie(request, name) {
  const match = (request.headers.get('cookie') || '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? match[1] : '';
}

async function sameSecret(a, b) {
  const [ha, hb] = await Promise.all([crypto.subtle.digest('SHA-256', enc(a)), crypto.subtle.digest('SHA-256', enc(b))]);
  return crypto.subtle.timingSafeEqual(ha, hb);
}

async function authed(request, env) {
  if (!env.PINBOARD_PASSCODE) return true;
  return sameSecret(cookie(request, 'pb'), await tokenFor(env));
}

// The way in, before anything else: the leaf in one of the brand colours (a
// different one each time), the name, one field. A wrong password gets a
// shake and a word. Afterwards it goes back where you were headed, so a TV
// opened on /?tv=1 lands in TV mode.
const attr = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const GATE_CSS = `
@font-face { font-family: "PP Neue Montreal"; src: url("/fonts/PPNeueMontreal-Regular.woff2") format("woff2"); font-weight: 400; font-display: swap; }
@font-face { font-family: "Quarto"; src: url("/fonts/Quarto-MediumItalic.woff2") format("woff2"); font-weight: 500; font-style: italic; font-display: swap; }
* { box-sizing: border-box; }
html, body { height: 100%; margin: 0; }
body { display: grid; place-items: center; padding: 16px 16px 9vh; background: #F2F2F2; color: #171717; font: 400 16px/1.4 "PP Neue Montreal", "Helvetica Neue", Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; }
.gate { display: flex; flex-direction: column; align-items: center; width: min(340px, 100%); text-align: center; animation: rise 0.9s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
.gate__leaf { width: 76px; height: 76px; background: var(--c); -webkit-mask: url("/brand/leaf.svg") center / contain no-repeat; mask: url("/brand/leaf.svg") center / contain no-repeat; }
h1 { margin: 26px 0 0; font-size: 44px; font-weight: 400; letter-spacing: -0.035em; line-height: 1; }
p { margin: 10px 0 0; color: #8B8B8B; font-size: 17px; letter-spacing: -0.01em; }
em { font-family: "Quarto", Georgia, serif; font-size: 1.1em; font-style: italic; font-weight: 500; color: #171717; }
form { width: 100%; margin-top: 40px; }
.gate__field { display: flex; align-items: center; gap: 6px; padding: 6px 6px 6px 22px; background: #fff; border-radius: 999px; box-shadow: 0 1px 2px rgba(23, 23, 23, 0.06), 0 14px 30px -18px rgba(23, 23, 23, 0.3); transition: box-shadow 0.2s; }
.gate__field:focus-within { box-shadow: 0 0 0 1.5px #171717, 0 14px 30px -18px rgba(23, 23, 23, 0.3); }
input { flex: 1; min-width: 0; height: 44px; padding: 0; border: 0; outline: 0; background: none; color: inherit; font: inherit; font-size: 17px; letter-spacing: 0.01em; }
input::placeholder { color: #A2A2A2; }
button { display: grid; place-items: center; flex: none; width: 44px; height: 44px; padding: 0; border: 0; border-radius: 50%; background: #171717; color: #F2F2F2; cursor: pointer; transition: transform 0.2s cubic-bezier(0.3, 1.6, 0.5, 1); }
button:hover { transform: translateX(2px); }
button:active { transform: scale(0.92); }
button svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.gate__error { min-height: 1.4em; margin-top: 14px; color: #171717; font-size: 15px; }
.gate.is-wrong { animation: none; }
.is-wrong .gate__field { animation: shake 0.42s cubic-bezier(0.36, 0.07, 0.19, 0.97); }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@keyframes rise { from { opacity: 0; transform: translateY(10px); } }
@keyframes shake { 20%, 60% { transform: translateX(-7px); } 40%, 80% { transform: translateX(7px); } }
@media (prefers-reduced-motion: reduce) { .gate, .is-wrong .gate__field { animation: none; } }
`;

const GATE = ({ error = '', next = '/' } = {}) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow"><meta name="theme-color" content="#F2F2F2">
<title>Pinboard</title><link rel="icon" href="/brand/leaf.png">
<style>${GATE_CSS}</style></head>
<body style="--c:${COMMENT_COLOURS[Math.floor(Math.random() * COMMENT_COLOURS.length)]}">
<main class="gate${error ? ' is-wrong' : ''}">
<div class="gate__leaf" role="img" aria-label="Potting Shed"></div>
<h1>Pinboard</h1>
<p>Potting Shed’s studio <em>wall</em></p>
<form method="post" action="/login">
<input type="hidden" name="next" value="${attr(next)}">
<label class="gate__field"><span class="sr">Password</span>
<input name="passcode" type="password" placeholder="Password" autocomplete="current-password" autocapitalize="none" autocorrect="off" spellcheck="false" autofocus required>
<button type="submit" aria-label="Open the wall"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg></button>
</label>
<p class="gate__error" role="alert">${error}</p>
</form>
</main>
</body></html>`;

const html = (body, status = 200) => new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': NOINDEX } });

// Only ever back to somewhere on Pinboard itself.
const nextOf = (v) => (/^\/(?![/\\])/.test(v || '') && !v.startsWith('/login') ? v : '/');

async function login(request, env, url) {
  const next = nextOf(request.method === 'POST' ? null : url.searchParams.get('next'));
  if (!env.PINBOARD_PASSCODE || (request.method !== 'POST' && (await authed(request, env)))) return Response.redirect(new URL(next, request.url), 302);
  if (request.method !== 'POST') return html(GATE({ next }));
  const form = await request.formData();
  const to = nextOf(String(form.get('next') || ''));
  if (!(await sameSecret(String(form.get('passcode') || ''), env.PINBOARD_PASSCODE))) {
    await new Promise((r) => setTimeout(r, 800)); // slow down guessing
    return html(GATE({ error: 'That’s not it.', next: to }), 401);
  }
  return new Response(null, {
    status: 303,
    headers: { Location: to, 'Set-Cookie': `pb=${await tokenFor(env)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=34560000` },
  });
}

// ---------------------------------------------------------------- routes

async function api(request, env, ctx, url) {
  const { pathname } = url;
  const method = request.method;

  if (pathname === '/api/config' && method === 'GET') {
    return json({
      commentColours: COMMENT_COLOURS, commentMax: COMMENT_MAX, titleMax: TITLE_MAX, descriptionMax: DESCRIPTION_MAX,
      maxUploadMB: maxUpload(env) / 1024 / 1024,
    });
  }

  if (pathname === '/api/pins' && method === 'GET') {
    const row = await env.DB.prepare(ALL_PINS).first();
    return new Response(`{"pins":${row?.pins || '[]'}}`, {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': NOINDEX },
    });
  }

  if (pathname === '/api/boards' && method === 'GET') {
    const row = await env.DB.prepare(ALL_BOARDS).first();
    return new Response(`{"boards":${row?.boards || '[]'}}`, {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': NOINDEX },
    });
  }

  if (pathname === '/api/live') {
    if (request.headers.get('upgrade') !== 'websocket') throw new HttpError(426, 'Expected a WebSocket');
    return hub(env).fetch(request);
  }

  if (pathname === '/api/upload' && method === 'POST') return upload(request, env);
  if (pathname === '/api/upload/start' && method === 'POST') return uploadStart(request, env);
  if (pathname === '/api/upload/part' && method === 'PUT') return uploadPart(request, env, url);
  if (pathname === '/api/upload/finish' && method === 'POST') return uploadFinish(request, env);

  if (pathname === '/api/pins' && method === 'POST') {
    const pin = await createPin(await readJSON(request), env);
    await env.DB.prepare(`INSERT INTO pins (${COLUMNS.join(', ')}) VALUES (${COLUMNS.map(() => '?').join(', ')})`)
      .bind(...COLUMNS.map((c) => pin[c] ?? null)).run();
    const saved = await getPin(env, pin.id);
    ctx.waitUntil(broadcast(env, 'pin', saved));
    return json(saved, 201);
  }

  // Colours are read from the image by whichever browser sees it first.
  const c = /^\/api\/pins\/([a-z0-9]+)\/colors$/.exec(pathname);
  if (c && method === 'PUT') {
    const colors = cleanColors(await readJSON(request));
    if (!colors) throw new HttpError(400, 'Bad colours');
    await env.DB.prepare('UPDATE pins SET colors = ? WHERE id = ? AND colors IS NULL').bind(colors, c[1]).run();
    return json({ ok: true });
  }

  const m = /^\/api\/pins\/([a-z0-9]+)$/.exec(pathname);

  // Changing something afterwards: a piece's type, description, tools or source, or
  // where a sticky note sits on its piece.
  if (m && method === 'PATCH') {
    const body = await readJSON(request);
    const note = place(body);
    const sets = [];
    const values = [];
    if (note) {
      sets.push('ax = ?', 'ay = ?');
      values.push(note.ax, note.ay);
    } else {
      const type = typeOf(body);
      if (type) { sets.push('type = ?'); values.push(type); }
      if (typeof body.description === 'string') { sets.push('description = ?'); values.push(cleanText(body.description, DESCRIPTION_MAX) || null); }
      if (typeof body.tools === 'string') { sets.push('tools = ?'); values.push(cleanTools(body.tools)); }
      if (typeof body.source === 'string') { sets.push('source = ?'); values.push(clean(body.source, 300) || null); }
    }
    if (!sets.length) throw new HttpError(400, 'Nothing to change');
    const { meta } = await env.DB.prepare(`UPDATE pins SET ${sets.join(', ')} WHERE id = ? AND deleted_at IS NULL AND kind ${note ? '=' : '!='} 'comment'`)
      .bind(...values, m[1]).run();
    if (!meta.changes) throw new HttpError(404, 'Not found');
    const saved = await getPin(env, m[1]);
    ctx.waitUntil(broadcast(env, 'update', saved));
    return json(saved);
  }

  // Taking something down hides it (and its comments); the files stay in R2.
  if (m && method === 'DELETE') {
    const { meta } = await env.DB.prepare('UPDATE pins SET deleted_at = ? WHERE (id = ? OR parent_id = ?) AND deleted_at IS NULL')
      .bind(Date.now(), m[1], m[1]).run();
    if (!meta.changes) throw new HttpError(404, 'Not found');
    ctx.waitUntil(broadcast(env, 'remove', { id: m[1] }));
    return json({ ok: true });
  }

  // Boards are shared: anyone can make one, rename it, take it down, and save
  // pieces to it or take them off.
  if (pathname === '/api/boards' && method === 'POST') {
    const body = await readJSON(request);
    const name = clean(body.name, BOARD_NAME_MAX);
    if (!name) throw new HttpError(400, 'Give the board a name');
    const id = newId();
    await env.DB.prepare('INSERT INTO boards (id, name, author, created_at) VALUES (?, ?, ?, ?)')
      .bind(id, name, clean(body.author, NAME_MAX) || null, Date.now()).run();
    return boardChanged(env, ctx, id, 201);
  }

  const b = /^\/api\/boards\/([a-z0-9]+)(?:\/pins\/([a-z0-9]+))?$/.exec(pathname);
  if (b && !b[2] && method === 'PATCH') {
    const name = clean((await readJSON(request)).name, BOARD_NAME_MAX);
    if (!name) throw new HttpError(400, 'Give the board a name');
    const { meta } = await env.DB.prepare('UPDATE boards SET name = ? WHERE id = ? AND deleted_at IS NULL').bind(name, b[1]).run();
    if (!meta.changes) throw new HttpError(404, 'That board’s gone');
    return boardChanged(env, ctx, b[1]);
  }
  if (b && !b[2] && method === 'DELETE') {
    const { meta } = await env.DB.prepare('UPDATE boards SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL').bind(Date.now(), b[1]).run();
    if (!meta.changes) throw new HttpError(404, 'That board’s gone');
    ctx.waitUntil(broadcast(env, 'board', { id: b[1], deleted: true }));
    return json({ ok: true });
  }
  if (b && b[2] && method === 'PUT') {
    const author = clean((await readJSON(request)).author, NAME_MAX) || null;
    const ok = await env.DB.prepare(`SELECT (SELECT 1 FROM boards WHERE id = ? AND deleted_at IS NULL) AS board,
      (SELECT 1 FROM pins WHERE id = ? AND deleted_at IS NULL AND kind != 'comment') AS pin`).bind(b[1], b[2]).first();
    if (!ok?.board) throw new HttpError(404, 'That board’s gone');
    if (!ok.pin) throw new HttpError(404, 'That piece has been taken down');
    await env.DB.prepare('INSERT OR IGNORE INTO board_pins (board_id, pin_id, added_by, added_at) VALUES (?, ?, ?, ?)')
      .bind(b[1], b[2], author, Date.now()).run();
    return boardChanged(env, ctx, b[1]);
  }
  if (b && b[2] && method === 'DELETE') {
    await env.DB.prepare('DELETE FROM board_pins WHERE board_id = ? AND pin_id = ?').bind(b[1], b[2]).run();
    return boardChanged(env, ctx, b[1]);
  }

  throw new HttpError(404, 'Not found');
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;
    try {
      if (pathname === '/login') return await login(request, env, url);
      // The page itself comes through here first (run_worker_first), so the
      // gate is the first thing anyone sees, not a flash of the wall.
      if (pathname === '/' || pathname === '/index.html') {
        if (!(await authed(request, env))) return html(GATE({ next: nextOf(pathname + url.search) }));
        return env.ASSETS.fetch(request);
      }
      if (!(await authed(request, env))) return json({ error: 'Locked' }, 401);
      if (pathname.startsWith('/files/')) return await serveFile(request, env, ctx, pathname.slice(7));
      if (pathname.startsWith('/api/')) return await api(request, env, ctx, url);
      return new Response('Not found', { status: 404, headers: { 'X-Robots-Tag': NOINDEX } });
    } catch (err) {
      if (!(err instanceof HttpError)) console.error(err);
      return json({ error: err instanceof HttpError ? err.message : 'Something went wrong' }, err.status || 500);
    }
  },
};
