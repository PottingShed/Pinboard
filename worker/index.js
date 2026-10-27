// Pinboard: Potting Shed's shared studio wall, on Cloudflare.
// The page itself is served straight from public/; this Worker handles
// everything else: the API (D1), images and video (R2), uploads, the optional
// passcode, and live updates (via the Hub Durable Object).


export { Hub } from './hub.js';

// Each comment gets one of the brand colours; it colours the dot on the piece.
const COMMENT_COLOURS = ['#FDE619', '#CEFF00', '#01FECD', '#12CDFF', '#245FFF', '#FF16A5', '#FE1658', '#FF840A', '#FFADA2'];
const COMMENT_MAX = 100;
const TITLE_MAX = 80;
const DESCRIPTION_MAX = 400;
const NAME_MAX = 40;
// studio: pinned by the team; case-study and archive: imported from the website;
// inspiration: work that isn't ours, kept in its own section.
const ORIGINS = ['studio', 'inspiration', 'case-study', 'archive'];
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

const studiosOf = (env) => (env.PINBOARD_STUDIOS || 'Guernsey,Jersey').split(',').map((s) => s.trim()).filter(Boolean);
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
  'title', 'description', 'source', 'text', 'color', 'colors', 'author', 'studio', 'private', 'created_at'];

// D1 builds the JSON for the whole wall itself, so the Worker never has to
// parse hundreds of rows (free Workers get 10ms of CPU per request).
const ALL_PINS = `SELECT json_group_array(json_object(${COLUMNS.map((c) => `'${c}', ${c === 'colors' ? 'json(colors)' : c}`).join(', ')})) AS pins
  FROM (SELECT * FROM pins WHERE deleted_at IS NULL ORDER BY created_at)`;

async function getPin(env, id) {
  const row = await env.DB.prepare('SELECT * FROM pins WHERE id = ? AND deleted_at IS NULL').bind(id).first();
  if (!row) return null;
  delete row.deleted_at;
  return { ...row, colors: row.colors ? JSON.parse(row.colors) : null };
}

const fileExists = async (env, name) => FILE_RE.test(name || '') && !!(await env.BUCKET.head(name));

async function createPin(body, env) {
  const kind = body.kind;
  const origin = ORIGINS.includes(body.origin) ? body.origin : 'studio';
  // Work imported from the website can carry an older date so "newest" stays honest.
  const when = FROM_WEBSITE.includes(origin) && Number.isFinite(body.created_at) ? body.created_at : Date.now();
  const base = {
    id: newId(), kind, origin, parent_id: null, src: null, thumb: null, nat_w: null, nat_h: null, size: null,
    rot: 0, fix: null, fix_color: null, title: null, text: null, color: null, colors: cleanColors(body.colors),
    private: 0,
    author: clean(body.author, NAME_MAX) || null,
    studio: studiosOf(env).includes(body.studio) ? body.studio : null,
    created_at: when,
  };

  if (kind === 'image' || kind === 'video') {
    if (!(await fileExists(env, body.src))) throw new HttpError(400, 'Upload missing');
    return {
      ...base,
      src: body.src, thumb: (await fileExists(env, body.thumb)) ? body.thumb : null,
      nat_w: Math.max(1, Math.round(Number(body.nat_w) || 4)),
      nat_h: Math.max(1, Math.round(Number(body.nat_h) || 3)),
      size: ['s', 'm', 'l'].includes(body.size) ? body.size : 'm',
      title: clean(body.title, TITLE_MAX) || null,
      description: cleanText(body.description, DESCRIPTION_MAX) || null,
      source: origin === 'inspiration' ? clean(body.source, 300) || null : null,
      private: body.private ? 1 : 0, // studio only: never on the TVs
    };
  }

  // A comment on a piece of work
  if (kind === 'comment') {
    const text = clean(body.text, COMMENT_MAX);
    if (!text) throw new HttpError(400, 'Write something first');
    const parent = await env.DB.prepare('SELECT kind FROM pins WHERE id = ? AND deleted_at IS NULL').bind(body.parent_id || '').first();
    if (!parent || parent.kind === 'comment') throw new HttpError(404, 'That piece has gone');
    const color = COMMENT_COLOURS.includes(body.color) ? body.color : COMMENT_COLOURS[0];
    return { ...base, text, color, parent_id: body.parent_id, colors: null };
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

const LOGIN_PAGE = (error = '') => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>Pinboard</title>
<link rel="icon" href="/brand/leaf.png"><link rel="stylesheet" href="/styles.css"></head>
<body class="login"><form method="post" action="/login" class="login__card">
<p class="eyebrow">Potting Shed</p><h1>Pinboard</h1>
<label class="field"><span>Studio passcode</span><input name="passcode" type="password" autocomplete="current-password" autofocus required></label>
${error ? `<p class="login__error">${error}</p>` : ''}
<button class="btn btn--accent" type="submit">Open the wall</button></form></body></html>`;

const html = (body, status = 200) => new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': NOINDEX } });

async function login(request, env) {
  if (!env.PINBOARD_PASSCODE) return Response.redirect(new URL('/', request.url), 302);
  if (request.method !== 'POST') return html(LOGIN_PAGE());
  const form = await request.formData();
  if (!(await sameSecret(String(form.get('passcode') || ''), env.PINBOARD_PASSCODE))) {
    await new Promise((r) => setTimeout(r, 800)); // slow down guessing
    return html(LOGIN_PAGE('That’s not it.'), 401);
  }
  return new Response(null, {
    status: 303,
    headers: { Location: '/', 'Set-Cookie': `pb=${await tokenFor(env)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=34560000` },
  });
}

// ---------------------------------------------------------------- routes

async function api(request, env, ctx, url) {
  const { pathname } = url;
  const method = request.method;

  if (pathname === '/api/config' && method === 'GET') {
    return json({
      studios: studiosOf(env), commentColours: COMMENT_COLOURS, commentMax: COMMENT_MAX, titleMax: TITLE_MAX, descriptionMax: DESCRIPTION_MAX,
      maxUploadMB: maxUpload(env) / 1024 / 1024,
    });
  }

  if (pathname === '/api/pins' && method === 'GET') {
    const row = await env.DB.prepare(ALL_PINS).first();
    return new Response(`{"pins":${row?.pins || '[]'}}`, {
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

  // Changing a piece afterwards: public or private, and its description.
  if (m && method === 'PATCH') {
    const body = await readJSON(request);
    const sets = [];
    const values = [];
    if (typeof body.private === 'boolean') { sets.push('private = ?'); values.push(body.private ? 1 : 0); }
    if (typeof body.description === 'string') { sets.push('description = ?'); values.push(cleanText(body.description, DESCRIPTION_MAX) || null); }
    if (typeof body.source === 'string') { sets.push('source = ?'); values.push(clean(body.source, 300) || null); }
    if (!sets.length) throw new HttpError(400, 'Nothing to change');
    const { meta } = await env.DB.prepare(`UPDATE pins SET ${sets.join(', ')} WHERE id = ? AND deleted_at IS NULL AND kind != 'comment'`)
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

  throw new HttpError(404, 'Not found');
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;
    try {
      if (pathname === '/login') return await login(request, env);
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
