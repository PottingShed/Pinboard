// What's on the wall, who's looking, and what they've chosen to see.

import { shuffle } from './util.js';
import { closeness } from './colour.js';

const params = new URLSearchParams(location.search);
const saved = (key) => params.get(key) ?? (() => { try { return localStorage.getItem(`pb.${key}`); } catch { return null; } })();
const oneOf = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback);
const hexOrNull = (v) => (/^#?[0-9a-f]{6}$/i.test(v || '') ? `#${v.replace('#', '').toLowerCase()}` : null);

// What a piece is, and so who it's for. Public and Social show on the TVs;
// nothing else ever does.
export const TYPES = {
  wip: { name: 'Work in progress', short: 'WIP', note: 'Studio only. Never on the TVs.' },
  public: { name: 'Public', note: 'Our work, fine for anyone to see. Shows on the studio TVs.' },
  inspo: { name: 'Inspo', note: 'Work we love that we didn’t make. Not on the TVs.' },
  social: { name: 'Social', note: 'Life at Potting Shed. Shows on the studio TVs.' },
};
const ON_TVS = new Set(['public', 'social']);

export const state = {
  config: {
    studios: ['Guernsey', 'Jersey'],
    commentColours: ['#FDE619', '#CEFF00', '#69FF46', '#01FECD', '#12CDFF', '#245FFF', '#FF16A5', '#FE1658', '#FF840A', '#FFADA2'],
    commentMax: 100, titleMax: 80, maxUploadMB: 250,
  },
  pins: new Map(),
  boards: new Map(), // shared collections: { id, name, author, created_at, pins: [{ id, by, at }], ids }
  board: params.get('board'), // the board being looked at, if any (it's in the address, so it can be shared)
  me: (() => { try { return JSON.parse(localStorage.getItem('pb.me')) || null; } catch { return null; } })(),
  tv: params.has('tv'),
  view: oneOf(saved('view'), ['wall', 'grid'], 'wall'),
  order: oneOf(saved('order'), ['new', 'mix', 'random'], 'new'), // newest first: new work sets the energy
  // all: everything (the default), or just one type
  show: oneOf(saved('show') === 'inspiration' ? 'inspo' : saved('show'), ['all', ...Object.keys(TYPES)], 'all'),
  video: saved('video') !== 'off', // some people find moving work on screen distracting
  notes: saved('notes') !== 'off', // sticky notes on the work, or just their dots
  hand: false, // space held: drag moves round the work instead of picking it up
  // Sort by closeness to this colour, when set. Only for this visit: next time
  // the wall opens newest first again (unless the address asks for a colour).
  colour: hexOrNull(params.get('colour')),
};
try { localStorage.removeItem('pb.colour'); } catch {} // older versions kept it

const THIS_VISIT = new Set(['colour']);

export function remember(key, value) {
  state[key] = value;
  if (state.tv || THIS_VISIT.has(key)) return; // TVs take their settings from the address
  try {
    if (value == null) localStorage.removeItem(`pb.${key}`);
    else localStorage.setItem(`pb.${key}`, value);
  } catch {}
}

// Keep a board from the API (or forget a deleted one), pieces in the order they were saved.
export function keepBoard(b) {
  if (b.deleted) return state.boards.delete(b.id);
  b.pins.sort((x, y) => x.at - y.at);
  b.ids = new Set(b.pins.map((x) => x.id));
  state.boards.set(b.id, b);
}
export const boardsWith = (id) => [...state.boards.values()].filter((b) => b.ids.has(id));
// Boards most recently made or added to come first.
export const boardActivity = (b) => Math.max(b.created_at, b.pins.at(-1)?.at || 0);
export const boardList = () => [...state.boards.values()].sort((a, b) => boardActivity(b) - boardActivity(a));

export const pieces = () => [...state.pins.values()].filter((p) => !p.parent_id);
export const childrenOf = (id) => [...state.pins.values()].filter((p) => p.parent_id === id).sort((a, b) => a.created_at - b.created_at);
export const fromWebsite = (p) => p.origin === 'case-study' || p.origin === 'archive';
export const ourWork = (p) => p.type === 'public' || p.type === 'wip';
export const onTvs = (p) => ON_TVS.has(p.type);

// Whether a piece belongs in what's being looked at, leaving video aside.
export function inView(p) {
  if (state.tv && !onTvs(p)) return false;
  if (state.board) return !!state.boards.get(state.board)?.ids.has(p.id); // a board can hold any type
  return state.show === 'all' || p.type === state.show;
}
export const matches = (p) => (state.video || p.kind !== 'video') && inView(p);

// New studio work first (it lands at the heart of the wall), with older pins
// and website projects woven through. Different every time.
function mix(list) {
  const now = Date.now();
  const fresh = shuffle(list.filter((p) => !fromWebsite(p) && now - p.created_at < 21 * 864e5));
  const rest = shuffle(list.filter((p) => !fresh.includes(p)));
  const out = [];
  while (fresh.length || rest.length) {
    if (fresh.length) out.push(fresh.shift());
    if (rest.length) out.push(rest.shift());
  }
  return out;
}

// Everything that should be up, best first: closest to the chosen colour if
// there is one, otherwise newest, mixed or random.
export function selection(limit) {
  let list = pieces().filter(matches);
  if (state.colour) {
    const score = new Map(list.map((p) => [p.id, closeness(p.colors, state.colour)]));
    list.sort((a, b) => score.get(b.id) - score.get(a.id));
  } else if (state.order === 'new') {
    // On a board, newest means newest to the board.
    const saved = state.board && new Map(state.boards.get(state.board)?.pins.map((x) => [x.id, x.at]));
    const when = (p) => (saved && saved.get(p.id)) || p.created_at;
    list.sort((a, b) => when(b) - when(a));
  }
  else if (state.order === 'random') list = shuffle(list);
  else list = mix(list);
  return limit ? list.slice(0, limit) : list;
}
