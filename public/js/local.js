// The GitHub Pages prototype has no server, so what people add there (work,
// inspiration, comments) is kept in their own browser, in IndexedDB, until
// Pinboard goes live. Nobody else sees it. The live version never uses this.

const isLocal = (id) => typeof id === 'string' && id.startsWith('local');
export const isLocalPin = (p) => isLocal(p?.id);

let opening = null;
function db() {
  opening ||= new Promise((resolve, reject) => {
    const req = indexedDB.open('pinboard-prototype', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('pins', { keyPath: 'id' });
      req.result.createObjectStore('files');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return opening;
}

// Run one request against a store and wait for it.
async function ask(store, mode, call) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const req = call(d.transaction(store, mode).objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Files are blobs in the browser; the page shows them through object URLs.
const urls = new Map();
export const localUrl = (name) => (isLocal(name) ? urls.get(name) : null);

export async function saveFile(blob) {
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' }[blob.type] || 'bin';
  const name = `local${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.${ext}`;
  await ask('files', 'readwrite', (s) => s.put(blob, name));
  urls.set(name, URL.createObjectURL(blob));
  return name;
}

export async function localPins() {
  try {
    const [pins, names, blobs] = await Promise.all([
      ask('pins', 'readonly', (s) => s.getAll()),
      ask('files', 'readonly', (s) => s.getAllKeys()),
      ask('files', 'readonly', (s) => s.getAll()),
    ]);
    names.forEach((name, i) => { if (!urls.has(name)) urls.set(name, URL.createObjectURL(blobs[i])); });
    return pins;
  } catch {
    return []; // private browsing, or storage switched off: just the snapshot
  }
}

// Stand-ins for the live API's create, change and take-down, for this browser only.
const clean = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const cleanText = (v, max) => (typeof v === 'string' ? v.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, max) : '');

export async function createPin(body) {
  const id = `local${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const base = {
    id, kind: body.kind, origin: body.origin === 'inspiration' ? 'inspiration' : 'studio', parent_id: null,
    src: null, thumb: null, nat_w: null, nat_h: null, size: null, rot: 0, fix: null, fix_color: null,
    title: null, description: null, source: null, text: null, color: null, colors: body.colors || null,
    author: clean(body.author, 40) || null, studio: clean(body.studio, 40) || null, private: 0, created_at: Date.now(),
  };
  let pin;
  if (body.kind === 'comment') {
    const text = clean(body.text, 100);
    if (!text) throw new Error('Write something first');
    pin = { ...base, origin: 'studio', colors: null, text, color: body.color, parent_id: body.parent_id };
  } else {
    pin = {
      ...base,
      src: body.src, thumb: body.thumb || null, nat_w: body.nat_w, nat_h: body.nat_h, size: body.size || 'm',
      title: clean(body.title, 80) || null,
      description: cleanText(body.description, 400) || null,
      source: base.origin === 'inspiration' ? clean(body.source, 300) || null : null,
      private: body.private ? 1 : 0,
    };
  }
  await ask('pins', 'readwrite', (s) => s.put(pin));
  return pin;
}

export async function updatePin(id, changes) {
  if (!isLocal(id)) throw new Error('In the prototype you can only change things you added in this browser.');
  const pin = await ask('pins', 'readonly', (s) => s.get(id));
  if (!pin) throw new Error('Not found');
  if (typeof changes.private === 'boolean') pin.private = changes.private ? 1 : 0;
  if (typeof changes.description === 'string') pin.description = cleanText(changes.description, 400) || null;
  await ask('pins', 'readwrite', (s) => s.put(pin));
  return pin;
}

export async function removePin(id) {
  if (!isLocal(id)) throw new Error('In the prototype you can only take down things you added in this browser.');
  const pins = await ask('pins', 'readonly', (s) => s.getAll());
  for (const p of pins) if (p.id === id || p.parent_id === id) await ask('pins', 'readwrite', (s) => s.delete(p.id));
  return { ok: true };
}
