// Liquid glass: the nav, its menus, the zoom, the label by the logo and the
// hearts are clear glass with a rounded, bevelled edge. Through the bevel the
// wall bends the way it would through a thick slab, mirrored right at the rim
// like the edge of a lens, with a faint rainbow where the colours split. The
// middle stays clear, or frosted on the menus so they can be read.
//
// Bending what's behind an element takes an SVG filter in backdrop-filter, which
// only Chromium browsers (Chrome, Edge, Arc) draw. Everywhere else the glass
// keeps its rim and shading and is simply not bent (styles.css).

import { $$ } from './util.js';

export const LIQUID = !!navigator.userAgentData?.brands?.some((b) => b.brand === 'Chromium');

const NS = 'http://www.w3.org/2000/svg';
const defs = document.createElementNS(NS, 'svg');
defs.setAttribute('aria-hidden', 'true');
defs.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';

// A displacement map for a rounded rectangle. Red and green push each point of
// the bevel inward along the edge's normal, hardest at the rim; blue says how
// far into the flat middle a point is, for the frost.
function bevelMap(w, h, r, bevel) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  const hw = w / 2, hh = h / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = x + 0.5 - hw, py = y + 0.5 - hh;
      const qx = Math.abs(px) - (hw - r), qy = Math.abs(py) - (hh - r);
      let d, nx, ny; // distance to the edge (negative inside) and the way out
      if (qx > 0 && qy > 0) {
        const l = Math.hypot(qx, qy);
        d = l - r; nx = qx / l; ny = qy / l;
      } else if (qx > qy) {
        d = qx - r; nx = 1; ny = 0;
      } else {
        d = qy - r; nx = 0; ny = 1;
      }
      nx *= Math.sign(px) || 1;
      ny *= Math.sign(py) || 1;
      const t = Math.min(1, Math.max(0, -d / bevel)); // 0 at the rim, 1 where the bevel ends
      const push = (1 - t) ** 2;
      const i = (y * w + x) * 4;
      img.data[i] = 128 - nx * push * 127;
      img.data[i + 1] = 128 - ny * push * 127;
      img.data[i + 2] = 255 * t * t * (3 - 2 * t);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL();
}

// The filter: the backdrop bent three times, a little more for green and more
// again for blue, and put back together (the rainbow at the rim), then the
// frosted backdrop laid over the flat middle.
const ONLY = [ // keep just red, just green, just blue
  '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0',
  '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0',
  '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0',
];
function filter(id, w, h, r, bevel, frost) {
  const scale = bevel;
  const channel = (n, s) => `
    <feDisplacementMap in="SourceGraphic" in2="map" scale="${s}" xChannelSelector="R" yChannelSelector="G" result="d${n}"/>
    <feColorMatrix in="d${n}" values="${ONLY[n]}" result="c${n}"/>`;
  const frosted = frost > 0 ? `
    <feGaussianBlur in="SourceGraphic" stdDeviation="${frost}" edgeMode="duplicate" result="blurred"/>
    <feColorMatrix in="map" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 1 0 0" result="middle"/>
    <feComposite in="blurred" in2="middle" operator="in" result="frost"/>
    <feComposite in="frost" in2="bent" operator="over"/>` : '';
  return `<filter id="${id}" color-interpolation-filters="sRGB">
    <feImage href="${bevelMap(w, h, r, bevel)}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="map"/>
    ${channel(0, scale)}${channel(1, scale * 1.07)}${channel(2, scale * 1.14)}
    <feBlend in="c0" in2="c1" mode="screen" result="rg"/>
    <feBlend in="rg" in2="c2" mode="screen" result="bent"/>${frosted}
  </filter>`;
}

// Each pane gets a filter its own size, redrawn when its size changes.
let count = 0;
function fit(el) {
  const w = el.offsetWidth, h = el.offsetHeight;
  if (!w || !h) return;
  const css = getComputedStyle(el);
  const r = Math.min(parseFloat(css.borderTopLeftRadius) || 0, w / 2, h / 2);
  const bevel = Math.min(parseFloat(css.getPropertyValue('--bevel')) || 18, r || 18);
  const frost = parseFloat(css.getPropertyValue('--frost')) || 0;
  const size = `${w} ${h} ${r} ${bevel} ${frost}`;
  if (el.dataset.glass === size) return;
  el.dataset.glass = size;
  el.glassId ||= `glass-${++count}`;
  document.getElementById(el.glassId)?.remove();
  defs.insertAdjacentHTML('beforeend', filter(el.glassId, w, h, r, bevel, frost));
  el.style.setProperty('--refract', `url(#${el.glassId})`);
}

if (LIQUID) {
  document.documentElement.classList.add('liquid');
  document.body.append(defs);
  const seen = new ResizeObserver((entries) => { for (const e of entries) fit(e.target); });
  for (const pane of $$('.glass')) seen.observe(pane);
  // The hearts are all one of two sizes (styles.css), so they share two filters.
  defs.insertAdjacentHTML('beforeend', filter('glass-heart', 54, 54, 27, 18, 0) + filter('glass-heart-tile', 36, 36, 18, 12, 0));
}

// Light catches the glass wherever the mouse is.
for (const pane of $$('.glass')) {
  pane.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const r = pane.getBoundingClientRect();
    pane.style.setProperty('--mx', `${e.clientX - r.left}px`);
    pane.style.setProperty('--my', `${e.clientY - r.top}px`);
  });
}
