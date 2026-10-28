// Boards: collections anyone in the studio can make, add to and share, a bit
// like Pinterest. There are no logins: the name you go by on comments is noted
// against what you save, and anyone can rename or take down a board.
//
// This is the Boards menu in the nav (open a board, make one, rename, delete)
// and the sheet that saves a piece to boards. What a board does to the wall is
// main.js's job: it hands in open() and changed() through initBoards().

import { $, h, api, toast, fileUrl, PREVIEW } from './util.js';
import { state, keepBoard, boardList } from './store.js';
import { HEART } from './pieces.js';

const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6.5 12.5 3.6 3.6 7.4-8.2"/></svg>';
const WALL = '<svg viewBox="0 0 24 24" aria-hidden="true"><mask id="wall-cut-menu"><rect width="24" height="24" fill="#fff" stroke="none"/><rect x="9.6" y="3.1" width="11.8" height="9.8" transform="rotate(6 15.5 8)" fill="#000" stroke="none"/></mask><g mask="url(#wall-cut-menu)"><rect x="3.5" y="7.5" width="9.5" height="11.5" transform="rotate(-7 8.25 13.25)"/></g><rect x="10.5" y="4" width="10" height="8" transform="rotate(6 15.5 8)"/></svg>';

let hooks = { open: () => {}, changed: () => {} };
export const initBoards = (given) => { hooks = given; };

const icon = (markup) => { const s = h('span'); s.innerHTML = markup; return s.firstChild; };
const me = () => state.me?.name || null;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export async function loadBoards() {
  const { boards } = await api('/api/boards');
  state.boards.clear();
  for (const b of boards) keepBoard(b);
}

// A board as it is now, from a reply or from someone else's change: keep it,
// tell main.js which pieces came and went, and redraw whatever's open.
export function applyBoard(b) {
  const had = state.boards.get(b.id)?.ids || new Set();
  keepBoard(b);
  const now = state.boards.get(b.id)?.ids || new Set();
  hooks.changed({
    id: b.id,
    added: [...now].filter((id) => !had.has(id)),
    removed: [...had].filter((id) => !now.has(id)),
    deleted: !!b.deleted,
  });
  if (!menu.hidden) renderMenu();
  if (sheet.open) renderSheet();
}

async function call(path, opts) {
  try {
    const b = await api(path, opts);
    if (b?.id) applyBoard(b);
    return b;
  } catch (err) {
    toast(err.message);
    return null;
  }
}
const create = (name) => call('/api/boards', { method: 'POST', body: { name, author: me() } });
const rename = (id, name) => call(`/api/boards/${id}`, { method: 'PATCH', body: { name } });
export const saveTo = (id, pinId) => call(`/api/boards/${id}/pins/${pinId}`, { method: 'PUT', body: { author: me() } });
const takeOff = (id, pinId) => call(`/api/boards/${id}/pins/${pinId}`, { method: 'DELETE' });
async function remove(id) {
  if (state.board === id) hooks.open(null); // first, so the news of it going doesn't come back as a surprise
  try {
    await api(`/api/boards/${id}`, { method: 'DELETE' });
    applyBoard({ id, deleted: true });
  } catch (err) {
    toast(err.message);
  }
}

// ---------------------------------------------------------------- a board, as a row

// The newest piece on the board is its cover.
function cover(b) {
  for (let i = b.pins.length - 1; i >= 0; i--) {
    const p = state.pins.get(b.pins[i].id);
    const src = p && (p.kind === 'image' ? p.thumb || p.src : p.thumb);
    if (src) return h('span', { class: 'board__cover' }, h('img', { src: fileUrl(src), alt: '', loading: 'lazy', decoding: 'async' }));
  }
  return h('span', { class: 'board__cover' }, icon(HEART));
}

function row(b, pressed) {
  const count = b.pins.filter((x) => state.pins.has(x.id)).length;
  return h('button', { type: 'button', class: 'board', 'data-board': b.id, 'aria-pressed': String(pressed) }, [
    cover(b),
    h('span', { class: 'board__text' }, [h('b', {}, b.name), h('small', {}, [plural(count, 'piece'), b.author].filter(Boolean).join(' · '))]),
  ]);
}

// A "New board" field: the button wakes up once there's a name.
function newBoardForm(form, onName) {
  const input = form.querySelector('input');
  const button = form.querySelector('button');
  input.addEventListener('input', () => { button.disabled = !input.value.trim(); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = input.value.trim();
    if (!name || button.disabled) return;
    button.disabled = true;
    if (await onName(name)) input.value = '';
    else button.disabled = false;
  });
}

// ---------------------------------------------------------------- the Boards menu

const menu = $('#boards-menu');
let renaming = null; // the board whose name is being changed
let armed = null; // the board one tap away from being deleted

export function renderMenu() {
  const list = boardList();
  const rows = [h('button', { type: 'button', class: 'board board--all', 'data-board': '', 'aria-pressed': String(!state.board) }, [
    h('span', { class: 'board__cover' }, icon(WALL)),
    h('span', { class: 'board__text' }, [h('b', {}, 'All work'), h('small', {}, 'The whole wall')]),
  ])];
  for (const b of list) {
    if (renaming === b.id) { rows.push(renameForm(b)); continue; }
    rows.push(row(b, state.board === b.id));
    if (state.board === b.id) rows.push(actions(b));
  }
  if (!list.length) rows.push(h('p', { class: 'boards__empty' }, 'No boards yet. Make one below, then tap the heart on any piece to save it there.'));
  $('#boards-list').replaceChildren(...rows);
}

// What you can do to the board you're looking at.
function actions(b) {
  const del = h('button', { type: 'button', class: armed === b.id ? 'is-armed' : null }, armed === b.id ? 'Delete for everyone?' : 'Delete');
  del.addEventListener('click', () => {
    if (armed === b.id) { armed = null; remove(b.id); return; }
    armed = b.id;
    renderMenu();
    setTimeout(() => { if (armed === b.id) { armed = null; if (!menu.hidden) renderMenu(); } }, 4000);
  });
  const copy = PREVIEW ? null : h('button', { type: 'button' }, 'Copy link'); // prototype boards live in one browser
  copy?.addEventListener('click', async () => {
    const url = new URL(location.href);
    url.search = '';
    url.searchParams.set('board', b.id);
    try {
      await navigator.clipboard.writeText(url.href);
      copy.textContent = 'Copied';
      setTimeout(() => { copy.textContent = 'Copy link'; }, 2000);
    } catch {
      toast(url.href);
    }
  });
  const ren = h('button', { type: 'button' }, 'Rename');
  ren.addEventListener('click', () => {
    renaming = b.id;
    renderMenu();
    const input = $('#board-rename');
    input.focus();
    input.select();
  });
  return h('div', { class: 'board__actions' }, [copy, ren, del]);
}

function renameForm(b) {
  const input = h('input', { type: 'text', id: 'board-rename', maxlength: '60', value: b.name, autocomplete: 'off', 'aria-label': 'Board name' });
  const form = h('form', { class: 'boards__new', novalidate: true }, [input, h('button', { class: 'btn btn--accent', type: 'submit' }, 'Save')]);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = input.value.trim();
    renaming = null;
    if (name && name !== b.name) await rename(b.id, name);
    renderMenu();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation(); // leave the menu open
    renaming = null;
    renderMenu();
  });
  return form;
}

export function menuClosed() {
  renaming = null;
  armed = null;
}

$('#boards-list').addEventListener('click', (e) => {
  const r = e.target.closest('.board');
  if (r) hooks.open(r.dataset.board || null);
});
newBoardForm($('#board-new'), async (name) => {
  const b = await create(name);
  if (b) hooks.open(b.id);
  return !!b;
});

// ---------------------------------------------------------------- saving a piece

const sheet = $('#save-sheet');
let saving = null; // the piece being saved

export function openSave(p) {
  saving = p;
  const src = p.kind === 'image' ? p.thumb || p.src : p.thumb;
  $('#saving').replaceChildren(
    src ? h('img', { src: fileUrl(src), alt: '' }) : h('span', { class: 'saving__blank' }),
    h('span', {}, [h('b', {}, p.title || 'Untitled'), h('small', {}, 'Tap a board to save it there, tap again to take it off.')]),
  );
  const form = $('#save-new');
  form.querySelector('input').value = '';
  form.querySelector('button').disabled = true;
  renderSheet();
  sheet.showModal();
  if (!state.boards.size) form.querySelector('input').focus();
}

function renderSheet() {
  const list = boardList();
  $('#save-list').replaceChildren(...(list.length
    ? list.map((b) => {
      const r = row(b, b.ids.has(saving.id));
      r.append(h('span', { class: 'board__check' }, icon(CHECK)));
      return r;
    })
    : [h('p', { class: 'boards__empty' }, 'No boards yet. Name your first one below.')]));
}

$('#save-list').addEventListener('click', async (e) => {
  const r = e.target.closest('.board');
  if (!r || !saving) return;
  const on = r.getAttribute('aria-pressed') !== 'true';
  r.setAttribute('aria-pressed', String(on)); // straight away; the reply confirms it
  const b = await (on ? saveTo(r.dataset.board, saving.id) : takeOff(r.dataset.board, saving.id));
  if (!b) renderSheet();
});
newBoardForm($('#save-new'), async (name) => {
  const b = await create(name);
  if (b) await saveTo(b.id, saving.id);
  return !!b;
});
sheet.addEventListener('close', () => { saving = null; });
