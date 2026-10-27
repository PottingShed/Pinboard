// Getting files from someone's computer onto the wall. Images are resized in
// the browser (a 2400px copy plus a small preview), videos get a poster frame,
// and both get their colours read before they go up.

import { analyse } from './colour.js';
import { PREVIEW } from './util.js';
import { saveFile } from './local.js';

export function kindOf(file) {
  const t = file.type || '';
  if (t === 'image/svg+xml') return null;
  if (t.startsWith('image/') || /\.(heic|heif)$/i.test(file.name)) return 'image';
  if (t.startsWith('video/') || /\.(mp4|mov|m4v|webm)$/i.test(file.name)) return 'video';
  return null;
}

async function decodeImage(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } catch {
      throw new Error(`Can’t read ${file.name}. Try saving it as a JPG or PNG.`);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

const canvasBlob = (c, type, q) => new Promise((r) => c.toBlob(r, type, q));

async function encode(src, w, hgt, max, original) {
  const k = Math.min(1, max / Math.max(w, hgt));
  const web = ['image/jpeg', 'image/webp', 'image/png', 'image/avif'];
  if (k === 1 && original && web.includes(original.type) && original.size < 3.5e6) return original;
  const c = document.createElement('canvas');
  c.width = Math.round(w * k);
  c.height = Math.round(hgt * k);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, c.width, c.height);
  let blob = await canvasBlob(c, 'image/webp', 0.86);
  if (!blob || blob.type !== 'image/webp') {
    if (original?.type === 'image/png') return canvasBlob(c, 'image/png');
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, c.width, c.height);
    blob = await canvasBlob(c, 'image/jpeg', 0.88);
  }
  return blob;
}

export async function prepImage(file) {
  const src = await decodeImage(file);
  const w = src.width || src.naturalWidth;
  const hgt = src.height || src.naturalHeight;
  const colors = analyse(src);
  if (file.type === 'image/gif') return { full: file, thumb: null, w, h: hgt, colors };
  const full = await encode(src, w, hgt, 2400, file);
  const thumb = Math.max(w, hgt) > 1100 ? await encode(src, w, hgt, 960, null) : null;
  src.close?.();
  return { full, thumb, w, h: hgt, colors };
}

export function prepVideo(file) {
  return new Promise((resolve, reject) => {
    const type = file.type || (/\.mov$/i.test(file.name) ? 'video/quicktime' : /\.webm$/i.test(file.name) ? 'video/webm' : 'video/mp4');
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    const finish = (fn) => { clearTimeout(timer); v.removeAttribute('src'); v.load(); URL.revokeObjectURL(url); fn(); };
    const timer = setTimeout(() => finish(() => reject(new Error(`Couldn’t read ${file.name}. MP4 (H.264) works best.`))), 20000);
    v.onerror = () => finish(() => reject(new Error(`This browser can’t play ${file.name}. Export it as an MP4 (H.264).`)));
    v.onloadedmetadata = () => { v.currentTime = Math.min(1, (v.duration || 3) / 3); };
    v.onseeked = async () => {
      const w = v.videoWidth, hgt = v.videoHeight;
      if (!w || !hgt) return finish(() => reject(new Error(`Couldn’t read ${file.name}.`)));
      const k = Math.min(1, 960 / Math.max(w, hgt));
      const c = document.createElement('canvas');
      c.width = Math.round(w * k);
      c.height = Math.round(hgt * k);
      c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
      const thumb = await canvasBlob(c, 'image/jpeg', 0.82);
      const colors = analyse(c);
      finish(() => resolve({ full: new Blob([file], { type }), thumb, w, h: hgt, colors }));
    };
    v.src = url;
  });
}

const SINGLE_MAX = 90 * 1024 * 1024;

// One request for most files. Anything over 90MB goes up in parts, because
// Cloudflare's free plan takes requests up to 100MB.
export async function uploadBlob(blob, onProgress) {
  if (PREVIEW) { onProgress?.(1); return saveFile(blob); } // the prototype keeps it in this browser
  if (blob.size <= SINGLE_MAX) return send('POST', '/api/upload', blob, onProgress).then((d) => d.file);
  const start = await send('POST', '/api/upload/start', JSON.stringify({ type: blob.type, size: blob.size }), null, 'application/json');
  const parts = [];
  const total = Math.ceil(blob.size / start.partSize);
  for (let n = 1; n <= total; n++) {
    const chunk = blob.slice((n - 1) * start.partSize, n * start.partSize);
    const q = new URLSearchParams({ name: start.name, uploadId: start.uploadId, part: n });
    parts.push(await send('PUT', `/api/upload/part?${q}`, chunk, (f) => onProgress?.((n - 1 + f) / total), 'application/octet-stream'));
  }
  const done = await send('POST', '/api/upload/finish', JSON.stringify({ name: start.name, uploadId: start.uploadId, parts }), null, 'application/json');
  return done.file;
}

function send(method, url, body, onProgress, type = body.type) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.setRequestHeader('Content-Type', type);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch {}
      if (xhr.status === 401) location.href = '/login';
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data.error || 'Upload failed. Try again.'));
    };
    xhr.onerror = () => reject(new Error('Upload failed. Check your connection.'));
    xhr.send(body);
  });
}
