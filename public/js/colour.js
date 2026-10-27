// Colour: reading the main colours out of an image, and how close a piece of
// work is to any colour picked on the wheel. analysePixels() has no DOM in it,
// so the import script runs it in Node too.

// A tiny seeded random, so the same image always gives the same palette.
function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Distance that roughly follows how different two colours look.
const near = (a, b) => 2 * (a[0] - b[0]) ** 2 + 4 * (a[1] - b[1]) ** 2 + 3 * (a[2] - b[2]) ** 2;
const hex2 = (n) => Math.round(n).toString(16).padStart(2, '0');
export const toHex = ([r, g, b]) => `#${hex2(r)}${hex2(g)}${hex2(b)}`;
export const fromHex = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

// RGBA pixels -> { palette: [{ c: '#hex', w: share 0..1 }, …] }, up to six
// colours, biggest first. k-means, started from well spread-out colours.
export function analysePixels(data) {
  const px = [];
  for (let i = 0; i < data.length; i += 4) if (data[i + 3] >= 128) px.push([data[i], data[i + 1], data[i + 2]]);
  if (!px.length) return null;
  const rand = seeded(px.length);
  const K = Math.min(6, px.length);
  const centres = [px[Math.floor(rand() * px.length)]];
  while (centres.length < K) {
    const d = px.map((p) => Math.min(...centres.map((c) => near(p, c))));
    let r = rand() * d.reduce((a, b) => a + b, 0);
    centres.push(px[Math.max(0, d.findIndex((v) => (r -= v) <= 0))]);
  }
  const owner = new Array(px.length).fill(0);
  for (let round = 0; round < 10; round++) {
    px.forEach((p, i) => {
      let best = 0;
      for (let k = 1; k < centres.length; k++) if (near(p, centres[k]) < near(p, centres[best])) best = k;
      owner[i] = best;
    });
    for (let k = 0; k < centres.length; k++) {
      const mine = px.filter((_, i) => owner[i] === k);
      if (mine.length) centres[k] = [0, 1, 2].map((ch) => mine.reduce((s, p) => s + p[ch], 0) / mine.length);
    }
  }
  const counts = centres.map((_, k) => owner.filter((o) => o === k).length);
  // Fold together colours that ended up almost the same.
  const out = [];
  centres.map((c, k) => ({ c, n: counts[k] })).sort((a, b) => b.n - a.n).forEach(({ c, n }) => {
    const twin = out.find((o) => near(o.c, c) < 900);
    if (twin) twin.n += n;
    else if (n) out.push({ c, n });
  });
  return {
    palette: out.filter((o) => o.n / px.length >= 0.03).map((o) => ({ c: toHex(o.c), w: +(o.n / px.length).toFixed(3) })),
  };
}

export function analyse(source) {
  const c = document.createElement('canvas');
  c.width = c.height = 48;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  try {
    ctx.drawImage(source, 0, 0, 48, 48);
    return analysePixels(ctx.getImageData(0, 0, 48, 48).data);
  } catch {
    return null;
  }
}

// CIE Lab, where distance matches what the eye sees well enough.
function lab([r, g, b]) {
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047);
  const y = f(R * 0.2126 + G * 0.7152 + B * 0.0722);
  const z = f((R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

// How much of a piece is close to a colour: 0 (none of it) to 1 (all of it).
export function closeness(colors, targetHex) {
  const palette = colors?.palette;
  if (!palette?.length || !targetHex) return 0;
  const t = lab(fromHex(targetHex));
  let score = 0;
  for (const entry of palette) {
    const { c, w } = typeof entry === 'string' ? { c: entry, w: 1 / palette.length } : entry;
    const d = Math.hypot(...lab(fromHex(c)).map((v, i) => v - t[i]));
    const sim = Math.max(0, 1 - d / 45);
    score += w * sim * sim;
  }
  return score;
}

// The colour wheel: hue round the edge, saturation from the middle out, and a
// brightness slider underneath.
export function hsv(h, s, v) {
  const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return [f(5) * 255, f(3) * 255, f(1) * 255];
}

export function toHsv([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, max ? d / max : 0, max];
}
