// What's on the wall, who's looking, and what they've chosen to see.

import { shuffle } from './util.js';
import { closeness } from './colour.js';

const params = new URLSearchParams(location.search);
const saved = (key) => params.get(key) ?? (() => { try { return localStorage.getItem(`pb.${key}`); } catch { return null; } })();
const oneOf = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback);
const hexOrNull = (v) => (/^#?[0-9a-f]{6}$/i.test(v || '') ? `#${v.replace('#', '').toLowerCase()}` : null);

export const state = {
  config: {
    studios: ['Guernsey', 'Jersey'],
    commentColours: ['#FDE619', '#CEFF00', '#01FECD', '#12CDFF', '#245FFF', '#FF16A5', '#FE1658', '#FF840A', '#FFADA2'],
    commentMax: 100, titleMax: 80, maxUploadMB: 250,
  },
  pins: new Map(),
  me: (() => { try { return JSON.parse(localStorage.getItem('pb.me')) || null; } catch { return null; } })(),
  tv: params.has('tv'),
  view: oneOf(saved('view'), ['wall', 'grid'], 'wall'),
  order: oneOf(saved('order'), ['new', 'mix', 'random'], 'new'), // newest first: new work sets the energy
  // all: all our work, public and private (the default); public: only what's fine
  // for the TVs and clients; inspiration: work that isn't ours, in its own section
  show: oneOf(saved('show'), ['all', 'public', 'inspiration'], 'all'),
  video: saved('video') !== 'off', // some people find moving work on screen distracting
  colour: hexOrNull(saved('colour')), // sort by closeness to this colour, when set
};

export function remember(key, value) {
  state[key] = value;
  if (state.tv) return; // TVs take their settings from the address
  try {
    if (value == null) localStorage.removeItem(`pb.${key}`);
    else localStorage.setItem(`pb.${key}`, value);
  } catch {}
}

export const pieces = () => [...state.pins.values()].filter((p) => !p.parent_id);
export const childrenOf = (id) => [...state.pins.values()].filter((p) => p.parent_id === id).sort((a, b) => a.created_at - b.created_at);
export const fromWebsite = (p) => p.origin === 'case-study' || p.origin === 'archive';
export const isInspiration = (p) => p.origin === 'inspiration';

// Private work is for the studio only: the TVs never show it.
export const onTvs = (p) => !p.private;

export function matches(p) {
  if (state.tv && !onTvs(p)) return false;
  if (!state.video && p.kind === 'video') return false;
  if (state.show === 'inspiration') return isInspiration(p);
  if (isInspiration(p)) return false;
  if (state.show === 'public' && p.private) return false;
  return true;
}

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
  } else if (state.order === 'new') list.sort((a, b) => b.created_at - a.created_at);
  else if (state.order === 'random') list = shuffle(list);
  else list = mix(list);
  return limit ? list.slice(0, limit) : list;
}
