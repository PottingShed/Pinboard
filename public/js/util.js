// Small shared helpers.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) if (c != null && c !== '') el.append(c);
  return el;
}

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const rand = (a, b) => a + Math.random() * (b - a);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const fileUrl = (name) => `files/${name}`;

// The view-only preview (on GitHub Pages) reads a snapshot instead of the API.
export const PREVIEW = document.documentElement.hasAttribute('data-preview');
const SNAPSHOT = { '/api/pins': 'data/pins.json', '/api/config': 'data/config.json' };
export const hash = (str) => [...str].reduce((x, c) => (x * 31 + c.charCodeAt(0)) | 0, 7) >>> 0;
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
export const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

export function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function fmtDate(ts, long = false) {
  const d = new Date(ts);
  const opts = { day: 'numeric', month: 'short' };
  if (long || d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('en-GB', opts);
}

export async function api(path, opts = {}) {
  if (PREVIEW) {
    if ((opts.method || 'GET') !== 'GET' || !SNAPSHOT[path]) throw new Error('This is a view-only preview.');
    return (await fetch(SNAPSHOT[path])).json();
  }
  const res = await fetch(path, {
    method: opts.method || 'GET',
    headers: opts.body ? { 'Content-Type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401) { location.href = '/login'; throw new Error('Locked'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Try again.');
  return data;
}

let toastTimer = 0;
export function toast(msg, action) {
  const t = $('#toast');
  t.replaceChildren(h('span', {}, msg));
  if (action) {
    t.append(h('button', { type: 'button', onclick: () => { t.classList.remove('show'); action.fn(); } }, action.label));
  }
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), action ? 8000 : 3200);
}
