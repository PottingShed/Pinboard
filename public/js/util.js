// Small shared helpers.

import { localUrl, localPins, createPin, updatePin, removePin, localBoards, createBoard, renameBoard, removeBoard, saveToBoard, takeOffBoard } from './local.js';

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
export const fileUrl = (name) => localUrl(name) || `files/${name}`;

// The prototype (on GitHub Pages) has no server: it reads a snapshot of the
// wall, and what people add is kept in their own browser (see local.js).
export const PREVIEW = document.documentElement.hasAttribute('data-preview');

async function prototypeApi(path, { method = 'GET', body } = {}) {
  if (method === 'GET' && path === '/api/config') return (await fetch('data/config.json')).json();
  if (method === 'GET' && path === '/api/pins') {
    const res = await fetch('data/pins.json');
    if (!res.ok) throw new Error('Couldn’t load the wall.');
    const { pins } = await res.json();
    return { pins: [...pins, ...(await localPins())] };
  }
  if (method === 'POST' && path === '/api/pins') return createPin(body);
  if (method === 'GET' && path === '/api/boards') return { boards: await localBoards() };
  if (method === 'POST' && path === '/api/boards') return createBoard(body);
  const b = /^\/api\/boards\/([a-z0-9]+)(?:\/pins\/([a-z0-9]+))?$/.exec(path);
  if (b && !b[2] && method === 'PATCH') return renameBoard(b[1], body);
  if (b && !b[2] && method === 'DELETE') return removeBoard(b[1]);
  if (b && b[2] && method === 'PUT') return saveToBoard(b[1], b[2], body);
  if (b && b[2] && method === 'DELETE') return takeOffBoard(b[1], b[2]);
  const m = /^\/api\/pins\/([a-z0-9]+)(\/colors)?$/.exec(path);
  if (m?.[2]) return { ok: true }; // colours stay with the piece in this browser
  if (m && method === 'PATCH') return updatePin(m[1], body);
  if (m && method === 'DELETE') return removePin(m[1]);
  throw new Error('Not in the prototype.');
}
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
  if (PREVIEW) return prototypeApi(path, opts);
  const res = await fetch(path, {
    method: opts.method || 'GET',
    headers: opts.body ? { 'Content-Type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401) { location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`; throw new Error('Locked'); }
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
