// Who's who. Pinboard is one of:
//   - signed in with Google, once GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are
//     set (with SESSION_SECRET): work accounts on PINBOARD_DOMAIN only
//     (pottingshed.com), plus anyone listed in PINBOARD_GUESTS;
//   - on this Mac, with DEV_SIGNIN=1 in .dev.vars, a stand-in for Google, so
//     signing in can be tried without it. Only ever for a visitor on the same
//     machine: Cloudflare sets the visitor's address itself, so it can't be
//     faked (local Wrangler dresses requests up as pinboard.pottingshed.com,
//     so the address in the URL is no help);
//   - otherwise behind one shared password, if PINBOARD_PASSCODE is set;
//   - otherwise open.
// Signed in, a browser stays signed in for about a year. TVs don't sign in as
// anyone: once Google is on, the shared password (if it's set) becomes the TV
// password, typed in once at /tv, or a TV link from the ⌄ menu does the same.
// Either way the screen opens straight into TV mode and can only look.

import { WORDMARK } from './wordmark.js';

const NOINDEX = 'noindex, nofollow, noimageindex';
const BRAND = ['#FDE619', '#CEFF00', '#69FF46', '#01FECD', '#12CDFF', '#245FFF', '#FF16A5', '#FE1658', '#FF840A', '#FFADA2'];
const YEAR = 34560000; // 400 days, as long as browsers keep a cookie
const onThisMachine = (request) => /^(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)$/.test(request.headers.get('cf-connecting-ip') || '');

export function mode(env, request) {
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.SESSION_SECRET) return 'google';
  if (env.DEV_SIGNIN === '1' && env.SESSION_SECRET && onThisMachine(request)) return 'dev';
  if (env.PINBOARD_PASSCODE) return 'password';
  return 'open';
}
export const withAccounts = (env, request) => ['google', 'dev'].includes(mode(env, request));

// ---------------------------------------------------------------- signing

const enc = (s) => new TextEncoder().encode(s);
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const randomId = (n = 16) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');

async function sameSecret(a, b) {
  const [ha, hb] = await Promise.all([crypto.subtle.digest('SHA-256', enc(a)), crypto.subtle.digest('SHA-256', enc(b))]);
  return crypto.subtle.timingSafeEqual(ha, hb);
}
async function hmac(env, text) {
  const key = await crypto.subtle.importKey('raw', enc(env.SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64(await crypto.subtle.sign('HMAC', key, enc(text)));
}
// "u:abc123.signature": who it is, signed so it can't be made up.
const sign = async (env, value) => `${value}.${await hmac(env, value)}`;
async function unsign(env, signed) {
  const k = (signed || '').lastIndexOf('.');
  if (k < 1) return null;
  const value = signed.slice(0, k);
  return (await sameSecret(signed.slice(k + 1), await hmac(env, value))) ? value : null;
}

function cookie(request, name) {
  const match = (request.headers.get('cookie') || '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? match[1] : '';
}
const setCookie = (name, value, age = YEAR, path = '/') => `${name}=${value}; Path=${path}; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
// Just in: the way-in page's colour, for the wall to lift it away like a
// curtain (index.html reads it once, then it's gone).
const colourOf = (v) => BRAND.find((c) => c.slice(1).toLowerCase() === String(v || '').toLowerCase()) || BRAND[Math.floor(Math.random() * BRAND.length)];
const curtain = (colour) => `pbw=${colourOf(colour).slice(1)}; Path=/; Secure; SameSite=Lax; Max-Age=120`;

// The old shared password, kept as the cookie it's always been.
async function passwordToken(env) {
  const digest = await crypto.subtle.digest('SHA-256', enc(`pinboard:${env.PINBOARD_PASSCODE}`));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Who's asking: { id } signed in, { tv: true } a TV, { open: true } when there
// are no accounts (open, or past the shared password), or null.
export async function who(request, env) {
  const m = mode(env, request);
  if (m === 'open') return { open: true };
  if (m === 'password') return (await sameSecret(cookie(request, 'pb'), await passwordToken(env))) ? { open: true } : null;
  const value = await unsign(env, cookie(request, 'pbs'));
  if (value === 'tv') return { tv: true };
  if (value?.startsWith('u:')) return { id: value.slice(2) };
  return null;
}

export const userOf = (env, w) => (w?.id
  ? env.DB.prepare('SELECT id, email, name, first, picture FROM users WHERE id = ?').bind(w.id).first()
  : null);

// A TV link: opens Pinboard in TV mode on whatever screen it's opened on,
// with no one signing in. It only lasts as long as SESSION_SECRET does, so
// changing that is how to cancel every TV link (and sign everyone out).
export const tvLink = async (env) => `/tv/${await hmac(env, 'tv-link')}`;

// ---------------------------------------------------------------- people

const domain = (env) => (env.PINBOARD_DOMAIN || 'pottingshed.com').toLowerCase();
const guests = (env) => (env.PINBOARD_GUESTS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
const allowed = (env, email) => email.endsWith(`@${domain(env)}`) || guests(env).includes(email);

// Someone signing in: found by their email, or added. The first time, any
// work, notes and boards already up under their name become theirs.
async function personFor(env, { email, name, first, picture }) {
  email = email.toLowerCase();
  name = (name || email.split('@')[0]).slice(0, 80);
  first = (first || name.split(' ')[0]).slice(0, 40);
  const now = Date.now();
  const found = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (found) {
    await env.DB.prepare('UPDATE users SET name = ?, first = ?, picture = ?, last_seen = ? WHERE id = ?').bind(name, first, picture || null, now, found.id).run();
    return found.id;
  }
  const id = randomId(8);
  await env.DB.prepare('INSERT INTO users (id, email, name, first, picture, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, email, name, first, picture || null, now, now).run();
  const names = [...new Set([first, name].map((n) => n.toLowerCase()))];
  const marks = names.map(() => '?').join(', ');
  await env.DB.batch([
    env.DB.prepare(`UPDATE pins SET user_id = ? WHERE user_id IS NULL AND lower(author) IN (${marks})`).bind(id, ...names),
    env.DB.prepare(`UPDATE boards SET user_id = ? WHERE user_id IS NULL AND lower(author) IN (${marks})`).bind(id, ...names),
  ]);
  return id;
}

async function signedIn(env, id, next, colour) {
  const headers = new Headers({ Location: next, 'Cache-Control': 'no-store' });
  headers.append('Set-Cookie', setCookie('pbs', await sign(env, `u:${id}`)));
  headers.append('Set-Cookie', setCookie('pbo', '', 0, '/auth'));
  headers.append('Set-Cookie', curtain(colour));
  return new Response(null, { status: 303, headers });
}

// ---------------------------------------------------------------- Google

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';

function startGoogle(env, url, next, colour) {
  const state = randomId();
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: `${url.origin}/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    hd: domain(env), // Google offers the work account first
    prompt: 'select_account',
  });
  return new Response(null, {
    status: 302,
    headers: { Location: `${GOOGLE_AUTH}?${params}`, 'Set-Cookie': setCookie('pbo', `${state}.${colourOf(colour).slice(1)}.${encodeURIComponent(next)}`, 600, '/auth'), 'Cache-Control': 'no-store' },
  });
}

async function finishGoogle(request, env, url) {
  const [state, colour, ...rest] = cookie(request, 'pbo').split('.');
  const next = nextOf(decodeURIComponent(rest.join('.')));
  if (url.searchParams.get('error')) return gate(request, env, url, { next, error: 'Sign-in was cancelled.' });
  if (!state || state !== url.searchParams.get('state')) return gate(request, env, url, { next, error: 'That took a while. Try again.' });
  const res = await fetch(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: url.searchParams.get('code') || '',
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${url.origin}/auth/google/callback`,
      grant_type: 'authorization_code',
    }),
  });
  const token = await res.json().catch(() => ({}));
  if (!res.ok || !token.id_token) return gate(request, env, url, { next, error: 'Google didn’t let that through. Try again.' });
  // Straight from Google over HTTPS, so what it says can be read as it is.
  const part = token.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  const claims = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(part), (c) => c.charCodeAt(0))));
  const email = String(claims.email || '').toLowerCase();
  const fine = claims.aud === env.GOOGLE_CLIENT_ID && ['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss)
    && claims.exp * 1000 > Date.now() && claims.email_verified && email;
  if (!fine) return gate(request, env, url, { next, error: 'Google didn’t let that through. Try again.' });
  if (!allowed(env, email)) return gate(request, env, url, { next, error: `That’s not a Potting Shed account. Use your @${domain(env)} one.` });
  const id = await personFor(env, { email, name: claims.name, first: claims.given_name, picture: claims.picture });
  return signedIn(env, id, next, colour);
}

// ---------------------------------------------------------------- routes

// Only ever back to somewhere on Pinboard itself.
export const nextOf = (v) => (/^\/(?![/\\])/.test(v || '') && !/^\/(login|auth|tv)\b/.test(v) ? v : '/');

// /login, /auth/…, /tv and /tv/…, or null for anything else.
export async function route(request, env, url) {
  const { pathname } = url;
  const m = mode(env, request);
  const post = request.method === 'POST';

  if (pathname === '/auth/signout') {
    const headers = new Headers({ Location: '/', 'Cache-Control': 'no-store' });
    headers.append('Set-Cookie', setCookie('pbs', '', 0));
    headers.append('Set-Cookie', setCookie('pb', '', 0));
    return new Response(null, { status: 303, headers });
  }

  // pinboard.pottingshed.com/tv: TV mode, short enough to type on a TV's remote.
  if (pathname === '/tv' || pathname === '/tv/') {
    const rest = new URLSearchParams(url.search);
    rest.delete('tv');
    return new Response(null, { status: 302, headers: { Location: `/?tv=1${rest.size ? `&${rest}` : ''}`, 'Cache-Control': 'no-store' } });
  }

  if (pathname.startsWith('/tv/')) {
    if (!['google', 'dev'].includes(m) || !(await sameSecret(pathname.slice(4), await hmac(env, 'tv-link')))) return gate(request, env, url, { next: '/?tv=1' });
    const headers = new Headers({ Location: '/?tv=1', 'Cache-Control': 'no-store' });
    headers.append('Set-Cookie', setCookie('pbs', await sign(env, 'tv')));
    headers.append('Set-Cookie', curtain());
    return new Response(null, { status: 303, headers });
  }

  if (pathname === '/auth/google') {
    if (m !== 'google') return Response.redirect(new URL('/', url), 302);
    return startGoogle(env, url, nextOf(url.searchParams.get('next')), url.searchParams.get('c'));
  }
  if (pathname === '/auth/google/callback') {
    if (m !== 'google') return Response.redirect(new URL('/', url), 302);
    return finishGoogle(request, env, url);
  }

  if (pathname === '/auth/dev' && post && m === 'dev') {
    const form = await request.formData();
    const name = String(form.get('name') || '').replace(/\s+/g, ' ').trim();
    const email = String(form.get('email') || '').trim().toLowerCase();
    const next = nextOf(String(form.get('next') || ''));
    if (!name || !/^[^@\s]+@[^@\s]+$/.test(email)) return gate(request, env, url, { next, error: 'A name and an email, please.' });
    if (!allowed(env, email)) return gate(request, env, url, { next, error: `That’s not a Potting Shed account. Use your @${domain(env)} one.` });
    return signedIn(env, await personFor(env, { email, name }), next, form.get('c'));
  }

  if (pathname === '/login') {
    const next = nextOf(post ? null : url.searchParams.get('next'));
    if (m === 'open' || (!post && (await who(request, env)))) return Response.redirect(new URL(next, url), 302);
    const tvPassword = withAccounts(env, request) && env.PINBOARD_PASSCODE;
    if (!post || (m !== 'password' && !tvPassword)) return gate(request, env, url, { next });
    const form = await request.formData();
    // With accounts, the shared password is only ever the TV password.
    const to = tvPassword ? '/?tv=1' : nextOf(String(form.get('next') || ''));
    if (!(await sameSecret(String(form.get('passcode') || ''), env.PINBOARD_PASSCODE))) {
      await new Promise((r) => setTimeout(r, 800)); // slow down guessing
      return gate(request, env, url, { next: to, error: 'That’s not it.' }, 401);
    }
    const headers = new Headers({ Location: to, 'Cache-Control': 'no-store' });
    headers.append('Set-Cookie', tvPassword ? setCookie('pbs', await sign(env, 'tv')) : setCookie('pb', await passwordToken(env)));
    headers.append('Set-Cookie', curtain(form.get('c')));
    return new Response(null, { status: 303, headers });
  }

  return null;
}

// ---------------------------------------------------------------- the way in

// One page, whatever the way in: a brand colour (a different one each time),
// the leaf and the pinboard wordmark in white, the wordmark as wide as the
// page, and one thing to do, in black. Black and white are pottingshed.com's
// own: #171717 and the off-white #F2F2F2.
//
// The wordmark comes in letter by letter, with GSAP (public/vendor, hosted
// here): the leaf spins into its corner, each letter sweeps up out of the
// bottom edge with a little tilt, left to right, then the i's leaf drops on
// with a spring, like a pin going in, and the whole word gives a touch as it
// lands, while the field comes up and its arrow rolls in to land with the
// leaf. Afterwards, pointing at the wordmark sends a ripple through it.
// Without GSAP, or asked for less motion, it's all just there.
const attr = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg>';
const G = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';

const CSS = `
@font-face { font-family: "PP Neue Montreal"; src: url("/fonts/PPNeueMontreal-Regular.woff2") format("woff2"); font-weight: 400; font-display: swap; }
* { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; }
body { background: var(--c); color: #171717; font: 400 17px/1.35 "PP Neue Montreal", "Helvetica Neue", Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; }
.gate { --pad: clamp(16px, 3.4vw, 44px); display: grid; grid-template-rows: auto 1fr auto; min-height: 100svh; padding: var(--pad); overflow: hidden; }
.gate__top { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.gate__leaf { width: clamp(69px, 7.5vw, 96px); aspect-ratio: 1; background: #F2F2F2; -webkit-mask: url("/brand/leaf.svg") center / contain no-repeat; mask: url("/brand/leaf.svg") center / contain no-repeat; }
.gate__act { align-self: end; width: min(560px, 100%); padding-bottom: clamp(20px, 4vh, 44px); }
.gate__field { display: flex; align-items: center; gap: 14px; border-bottom: 2px solid #171717; }
.gate__field input { flex: 1; min-width: 0; height: clamp(58px, 7vw, 76px); padding: 0; border: 0; outline: 0; background: none; color: inherit; font: inherit; font-size: clamp(26px, 3vw, 36px); letter-spacing: -0.015em; }
.gate__field input::placeholder { color: rgba(23, 23, 23, 0.5); }
.gate__field + .gate__field { margin-top: 6px; }
.go { display: grid; place-items: center; flex: none; width: clamp(48px, 5vw, 60px); aspect-ratio: 1; padding: 0; border: 0; border-radius: 50%; background: #F2F2F2; color: #171717; cursor: pointer; transition: background-color 0.25s, color 0.25s; }
.go:hover, .go:focus-visible { background: #171717; color: #F2F2F2; outline: none; }
/* The nudge is on the arrow, so it never fights the button rolling in. */
.go svg { width: 46%; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; transition: transform 0.25s cubic-bezier(0.3, 1.6, 0.5, 1); }
.go:hover svg { transform: translateX(3px); }
.go:active svg { transform: scale(0.85); }
.google { display: inline-flex; align-items: center; gap: 16px; height: clamp(62px, 7vw, 76px); padding: 0 32px 0 10px; border: 0; border-radius: 999px; background: #F2F2F2; color: #171717; font: inherit; font-size: clamp(20px, 2.2vw, 24px); letter-spacing: -0.01em; text-decoration: none; cursor: pointer; transition: background-color 0.25s, color 0.25s; }
.google:hover, .google:focus-visible { background: #171717; color: #F2F2F2; outline: none; }
.google span { display: grid; place-items: center; width: clamp(44px, 5vw, 56px); aspect-ratio: 1; }
.google svg { width: 46%; }
.dev { margin: 0 0 12px; font-size: 14px; opacity: 0.7; }
/* Its resting and hover looks are in its colour, so GSAP has its opacity to itself. */
.gate__corner { color: rgba(23, 23, 23, 0.78); font-size: clamp(16px, 1.5vw, 19px); text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 4px; transition: color 0.2s; }
.gate__corner:hover { color: #171717; }
.gate__error { min-height: 1.35em; margin: 14px 0 0; font-size: clamp(16px, 1.5vw, 19px); }
/* The pinboard wordmark, made from the logo's letters, edge to edge on the bottom margin. */
h1 { margin: 0; line-height: 0; }
.wm { display: block; width: 100%; height: auto; color: #F2F2F2; overflow: visible; clip-path: inset(-60vh -20vw 0 -20vw); } /* cut only along the bottom, where the letters rise from */
/* Hidden until the intro starts, so nothing shows in its final place first. */
.intro .wm, .intro .gate__leaf, .intro .gate__corner, .intro .gate__act { visibility: hidden; }
.is-wrong .gate__field { animation: shake 0.42s cubic-bezier(0.36, 0.07, 0.19, 0.97); }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@keyframes shake { 20%, 60% { transform: translateX(-8px); } 40%, 80% { transform: translateX(8px); } }
@media (prefers-reduced-motion: reduce) { .is-wrong .gate__field { animation: none; } }
`;

// The intro (GSAP), and the ripple once it's done. The motion is real spring
// physics rather than stock eases: each spring is how stiff it is (w) and how
// soon it settles (z, lower is bouncier), so letters rise, overshoot a touch
// and settle, stretching as they move and wobbling a little as they land.
const INTRO = `(() => {
  const root = document.documentElement;
  const show = () => root.classList.remove('intro');
  setTimeout(show, 4000); // whatever happens, never left hidden
  if (!root.classList.contains('intro') || !window.gsap || matchMedia('(prefers-reduced-motion: reduce)').matches) return show();
  const spring = (z, w) => {
    const d = w * Math.sqrt(1 - z * z);
    const f = (t) => 1 - Math.exp(-z * w * t) * (Math.cos(d * t) + ((z * w) / d) * Math.sin(d * t));
    const end = f(1);
    return (p) => f(p) + (1 - end) * p; // lands exactly
  };
  const rise = spring(0.68, 11), jelly = spring(0.36, 15), drop = spring(0.58, 13), give = spring(0.3, 18), soft = spring(0.78, 10);
  const letters = gsap.utils.toArray('.wm__l');
  const [, stem] = letters;
  const leaf = document.querySelector('.wm__leaf');
  const word = document.querySelector('.wm__word');
  const tl = gsap.timeline().timeScale(1.12); // a touch quicker than the springs alone
  tl.call(show, null, 0)
    .from('.gate__leaf', { scale: 0, rotation: -35, transformOrigin: '50% 50%', duration: 1.3, ease: jelly }, 0.05)
    .from(letters, { y: 165, rotation: 7, transformOrigin: '50% 100%', duration: 1.5, ease: rise, stagger: 0.065 }, 0.1) // low enough that even a stretched d stays out of sight
    .from(letters, { scaleY: 1.32, scaleX: 0.82, duration: 1.5, ease: jelly, stagger: 0.065 }, 0.1)
    .from(leaf, { y: -95, rotation: -40, transformOrigin: '25% 100%', duration: 1.6, ease: drop }, 0.92)
    .from(leaf, { opacity: 0, duration: 0.25, ease: 'power1.out' }, 0.92)
    // as it lands, the i takes the weight and the whole word gives a little
    .to(stem, { scaleY: 0.9, scaleX: 1.05, transformOrigin: '50% 100%', duration: 0.1, ease: 'power2.out' }, 1.24)
    .to(stem, { scaleY: 1, scaleX: 1, duration: 1.1, ease: give }, 1.34)
    .to(word, { y: 3.5, duration: 0.1, ease: 'power2.out' }, 1.24)
    .to(word, { y: 0, duration: 1.2, ease: give }, 1.34)
    // the field comes up as the leaf falls...
    .from('.gate__act > *', { y: 34, duration: 1.4, ease: soft, stagger: 0.08 }, 0.85)
    .from('.gate__act > *', { opacity: 0, duration: 0.5, ease: 'power1.out', stagger: 0.08 }, 0.85);
  // ...and its arrow rolls in along the line, turning as far as it travels,
  // on the leaf's own spring and a beat behind it: it arrives just as the leaf
  // lands, and goes still just after the leaf does
  const corner = document.querySelector('.gate__corner');
  if (corner) tl.from(corner, { opacity: 0, y: -12, duration: 1.2, ease: soft }, 0.2);
  const go = document.querySelector('.go');
  if (go) tl.from(go, { x: -76, rotation: -160, duration: 1.6, ease: drop }, 0.95);
  // Afterwards, point at the wordmark and a ripple runs through it from there.
  const ripple = (e) => {
    if (tl.isActive()) return;
    const box = word.getBoundingClientRect();
    const at = Math.max(0, Math.min(letters.length - 1, Math.round(((e.clientX - box.left) / box.width) * (letters.length - 1))));
    const wave = { keyframes: [{ y: -10, duration: 0.18, ease: 'power2.out' }, { y: 0, duration: 1, ease: jelly }], overwrite: 'auto' };
    gsap.to(letters, { ...wave, stagger: { each: 0.04, from: at } });
    gsap.to(leaf, { ...wave, delay: Math.abs(1 - at) * 0.04 }); // the i's dot goes with the i
  };
  if (matchMedia('(hover: hover)').matches) document.querySelector('.wm').addEventListener('pointerenter', ripple);
})();`;

const isTv = (next) => /^\/\?tv=1\b/.test(next);

function action(m, next, c, tvPassword) {
  const back = `<input type="hidden" name="next" value="${attr(next)}"><input type="hidden" name="c" value="${c.slice(1)}">`;
  const password = (label, button) => `<form method="post" action="/login">${back}
<label class="gate__field"><span class="sr">${label}</span>
<input name="passcode" type="password" placeholder="${label}" autocomplete="current-password" autocapitalize="none" autocorrect="off" spellcheck="false" autofocus required>
<button class="go" type="submit" aria-label="${button}">${ARROW}</button></label></form>`;
  // With accounts, a TV (anything headed for /?tv=1) gets the TV password
  // instead of signing in (the way between the two is in the top corner).
  if (tvPassword && isTv(next)) {
    return `<p class="dev">For the studio TVs: approved work and Social, nothing else.</p>${password('TV password', 'Open TV mode')}`;
  }
  if (m === 'google') {
    return `<a class="google" href="/auth/google?next=${encodeURIComponent(next)}&amp;c=${c.slice(1)}"><span>${G}</span>Sign in with Google</a>`;
  }
  if (m === 'dev') {
    return `<p class="dev">On this Mac only: standing in for Google.</p>
<form method="post" action="/auth/dev">${back}
<label class="gate__field"><span class="sr">Name</span><input name="name" placeholder="Your name" autocomplete="name" required autofocus></label>
<label class="gate__field"><span class="sr">Work email</span><input name="email" type="email" placeholder="you@pottingshed.com" autocomplete="email" required>
<button class="go" type="submit" aria-label="Sign in">${ARROW}</button></label></form>`;
  }
  return password('Password', 'Open the wall');
}

export function gate(request, env, url, { next = '/', error = '' } = {}, status = 200) {
  const c = BRAND[Math.floor(Math.random() * BRAND.length)];
  // With accounts and a shared password: TV mode in the top corner, or back to
  // signing in from the TV version.
  const tvPassword = withAccounts(env, request) && !!env.PINBOARD_PASSCODE;
  const corner = !tvPassword ? '' : isTv(next) ? '<a class="gate__corner" href="/login">Sign in</a>' : '<a class="gate__corner" href="/tv">TV mode</a>';
  const share = `${url.origin}/brand/share.png`;
  const body = `<!doctype html>
<html lang="en" class="${error ? '' : 'intro'}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow"><meta name="theme-color" content="${c}">
<title>Pinboard</title>
<meta name="description" content="Potting Shed’s studio wall.">
<meta property="og:title" content="Pinboard"><meta property="og:description" content="Potting Shed’s studio wall.">
<meta property="og:image" content="${share}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${share}">
<link rel="icon" href="/brand/favicon.svg" type="image/svg+xml"><link rel="icon" href="/brand/favicon-32.png" sizes="32x32" type="image/png"><link rel="icon" href="/brand/favicon-16.png" sizes="16x16" type="image/png">
<link rel="preload" href="/fonts/PPNeueMontreal-Regular.woff2" as="font" type="font/woff2" crossorigin>
<link rel="prefetch" href="/brand/pinboard-white.svg"><link rel="prefetch" href="/brand/leaf.svg">
<style>${CSS}</style>
<noscript><style>.intro .wm, .intro .gate__leaf, .intro .gate__corner, .intro .gate__act { visibility: visible; }</style></noscript></head>
<body style="--c:${c}">
<main class="gate${error ? ' is-wrong' : ''}">
<div class="gate__top"><div class="gate__leaf" role="img" aria-label="Potting Shed"></div>${corner}</div>
<div class="gate__act">${action(mode(env, request), next, c, tvPassword)}<p class="gate__error" role="alert">${attr(error)}</p></div>
<h1><span class="sr">Pinboard</span>${WORDMARK.replace('aria-hidden="true">', 'aria-hidden="true"><g class="wm__word">').replace('</svg>', '</g></svg>')}</h1>
</main>
<script src="/vendor/gsap.min.js" onerror="document.documentElement.classList.remove('intro')"></script>
<script>${INTRO}</script>
</body></html>`;
  return new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': NOINDEX } });
}
