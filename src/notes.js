import { state, save, flush } from './store.js';
import { localDay } from './lib.js';
import { renderMarkdown } from './markdown.js';
import { pauseDots, ripple } from './dots.js';
import { toast } from './ui.js';

const HUES = ['yellow', 'green', 'blue', 'pink', 'purple', 'orange'];
const NOTE_W = 13.5;
const NOTE_H = 11.25;
const GAP = 1;
const DRAG_START = 4;

const board = document.getElementById('board');
const emptyEl = document.getElementById('board-empty');
const editor = document.getElementById('editor');
const input = document.getElementById('ed-input');
const view = document.getElementById('ed-view');
const foot = document.getElementById('ed-foot');
const mdBtn = document.getElementById('ed-md');
const textBtn = document.getElementById('ed-text');
const previewBtn = document.getElementById('ed-preview');
const hueRow = document.getElementById('ed-hues');

const els = new Map();
const changed = new Set();
let current = null;
let previewing = false;

const rem = () => parseFloat(getComputedStyle(document.documentElement).fontSize);
const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const longFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

function metrics() {
  const r = rem();
  const w = NOTE_W * r;
  const h = NOTE_H * r;
  return { W: board.clientWidth, H: board.clientHeight, w, h, gap: GAP * r };
}

function place(note, el) {
  const { W, H, w, h } = metrics();
  el.style.transform = `translate(${note.x * Math.max(0, W - w)}px, ${note.y * Math.max(0, H - h)}px) rotate(${note.rot}deg)`;
  el.style.zIndex = note.z;
}

// Grid position i as board fractions. Past the last slot it cascades, so nothing lands out of reach.
function slot(i) {
  const { W, H, w, h, gap } = metrics();
  const cols = Math.max(1, Math.floor((W + gap) / (w + gap)));
  const rows = Math.max(1, Math.floor((H + gap) / (h + gap)));
  const wrap = Math.floor(i / (cols * rows));
  const k = i % (cols * rows);
  const step = wrap * gap * 1.4;
  return {
    x: Math.min(1, ((k % cols) * (w + gap) + step) / Math.max(1, W - w)),
    y: Math.min(1, (Math.floor(k / cols) * (h + gap) + step) / Math.max(1, H - h)),
  };
}

function freeSlot() {
  const { W, H, w, h } = metrics();
  for (let i = 0; i < 40; i++) {
    const s = slot(i);
    const taken = state.notes.some(
      (n) => Math.abs(n.x - s.x) * (W - w) < w * 0.6 && Math.abs(n.y - s.y) * (H - h) < h * 0.6,
    );
    if (!taken) return s;
  }
  return slot(state.notes.length);
}

const tilt = () => Math.round((Math.random() * 3 - 1.5) * 10) / 10;
const topZ = () => state.notes.reduce((z, n) => Math.max(z, n.z ?? 0), 0) + 1;

export const onNotesChanged = (fn) => changed.add(fn);

// Note text on a card, shared by floating stickies and the calendar's day view.
export function noteFace(note, face) {
  const body = note.body.trim();
  face.className = `note-face ${body ? (note.mode === 'md' ? 'md' : 'text') : 'blank'}`;
  if (!body) face.textContent = 'Empty note';
  else if (note.mode === 'md') face.innerHTML = renderMarkdown(body.slice(0, 700));
  else face.textContent = body.slice(0, 700);
}

function fillFace(note, el) {
  noteFace(note, el.querySelector('.note-face'));
  const body = note.body.trim();
  el.querySelector('.note-date').textContent = dateFmt.format(note.updated);
  el.className = `note ${note.hue}-note`;
  el.setAttribute('aria-label', `Open note: ${body.split('\n')[0].slice(0, 60) || 'empty'}`);
}

function noteEl(note) {
  const el = document.createElement('article');
  el.tabIndex = 0;
  el.setAttribute('role', 'button');
  el.innerHTML = '<div class="note-face"></div><div class="note-date"></div>';
  el.onkeydown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openNote(note.id);
    }
  };
  drag(el, note.id);
  return el;
}

export function renderBoard() {
  const live = new Set();
  for (const note of state.notes) {
    live.add(note.id);
    let el = els.get(note.id);
    if (!el) {
      el = noteEl(note);
      els.set(note.id, el);
      board.append(el);
    }
    fillFace(note, el);
    place(note, el);
  }
  for (const [id, el] of els) {
    if (!live.has(id)) {
      el.remove();
      els.delete(id);
    }
  }
  emptyEl.hidden = state.notes.length > 0 || state.settings.calendar;
  changed.forEach((fn) => fn());
}

function drag(el, id) {
  let start = null;
  let moved = false;
  let frame = 0;
  let pending = null;

  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const note = state.notes.find((n) => n.id === id);
    if (!note) return;
    const { W, H, w, h } = metrics();
    start = { px: e.clientX, py: e.clientY, left: note.x * Math.max(0, W - w), top: note.y * Math.max(0, H - h), W, H, w, h, note };
    moved = false;
    el.setPointerCapture(e.pointerId);
  });

  el.addEventListener('pointermove', (e) => {
    if (!start) return;
    const dx = e.clientX - start.px;
    const dy = e.clientY - start.py;
    if (!moved) {
      if (Math.hypot(dx, dy) < DRAG_START) return;
      moved = true;
      start.note.z = topZ();
      el.style.zIndex = start.note.z;
      el.classList.add('lifted');
    }
    // Lean into the movement a little, like paper picked up by one corner.
    const lean = Math.max(-5, Math.min(5, e.movementX * 0.5));
    pending = {
      left: Math.max(0, Math.min(start.W - start.w, start.left + dx)),
      top: Math.max(0, Math.min(start.H - start.h, start.top + dy)),
      lean,
    };
    frame ||= requestAnimationFrame(() => {
      frame = 0;
      el.style.transform = `translate(${pending.left}px, ${pending.top}px) rotate(${pending.lean}deg) scale(1.04)`;
    });
  });

  const end = (e) => {
    if (!start) return;
    const { note, W, H, w, h } = start;
    start = null;
    if (!moved) {
      if (e.type === 'pointerup') openNote(id);
      return;
    }
    cancelAnimationFrame(frame);
    frame = 0;
    el.classList.remove('lifted');
    if (pending) {
      note.x = W > w ? pending.left / (W - w) : 0;
      note.y = H > h ? pending.top / (H - h) : 0;
    }
    note.rot = tilt();
    place(note, el);
    save('notes');
    if (e.type === 'pointerup') ripple(e.clientX, e.clientY);
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

function makeNote(body = '', key, hue = HUES[state.notes.length % HUES.length]) {
  const note = {
    id: crypto.randomUUID(),
    body,
    mode: 'md',
    hue,
    day: localDay(),
    ...freeSlot(),
    rot: tilt(),
    z: topZ(),
    created: Date.now(),
    updated: Date.now(),
  };
  if (key) note.key = key;
  state.notes.push(note);
  save('notes');
  renderBoard();
  return note;
}

// New never stacks up blanks: a note that is already empty gets reused.
export function newNote(day = localDay()) {
  const note = state.notes.find((n) => !n.body.trim()) ?? makeNote();
  note.day = day;
  save('notes');
  renderBoard();
  openNote(note.id);
}

function dailyNote(kind, heading, hue) {
  const key = `${kind}:${localDay()}`;
  const note = state.notes.find((n) => n.key === key) ?? makeNote(`# ${heading}\n\n`, key, hue);
  openNote(note.id, true);
}

export const todayNote = () => dailyNote('today', longFmt.format(new Date()), 'yellow');
export const learnedNote = () => dailyNote('learned', `What I learned, ${dateFmt.format(new Date())}`, 'purple');

export function tidyNotes() {
  [...state.notes]
    .sort((a, b) => a.created - b.created)
    .forEach((note, i) => {
      Object.assign(note, slot(i), { rot: tilt() });
    });
  save('notes');
  renderBoard();
}

// The day view's card when one is showing, otherwise the floating sticky.
const sourceFor = (id) => document.querySelector(`[data-note-card="${id}"]`) ?? els.get(id);

function morph(update, source) {
  const fast = !document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (fast || !source?.checkVisibility()) return update();
  source.style.viewTransitionName = 'note';
  document
    .startViewTransition(() => {
      source.style.viewTransitionName = '';
      update();
      (editor.hidden ? source : editor).style.viewTransitionName = 'note';
    })
    .finished.finally(() => {
      source.style.viewTransitionName = '';
      editor.style.viewTransitionName = '';
    });
}

function paintEditor() {
  const n = current;
  editor.className = `editor ${n.hue}-note`;
  mdBtn.setAttribute('aria-pressed', n.mode === 'md');
  textBtn.setAttribute('aria-pressed', n.mode === 'text');
  previewBtn.hidden = n.mode !== 'md';
  previewBtn.textContent = previewing ? 'Edit' : 'Preview';
  input.hidden = previewing;
  view.hidden = !previewing;
  if (previewing) view.innerHTML = renderMarkdown(n.body);
  for (const swatch of hueRow.children) swatch.setAttribute('aria-pressed', swatch.dataset.hue === n.hue);
  footer();
}

function footer() {
  const words = current.body.trim() ? current.body.trim().split(/\s+/).length : 0;
  foot.textContent = `${words} ${words === 1 ? 'word' : 'words'}, saved automatically`;
}

export function openNote(id, atEnd = false) {
  const note = state.notes.find((n) => n.id === id);
  if (!note) return;
  const source = sourceFor(id);
  morph(() => {
    current = note;
    // Existing Markdown opens ready to read; empty or daily notes open ready to type.
    previewing = note.mode === 'md' && !!note.body.trim() && !atEnd;
    input.value = note.body;
    editor.hidden = false;
    paintEditor();
    pauseDots(true);
  }, source);
  if (!previewing) {
    requestAnimationFrame(() => {
      input.focus();
      if (atEnd) input.setSelectionRange(input.value.length, input.value.length);
    });
  }
}

export function closeNote() {
  if (!current) return;
  const id = current.id;
  current = null;
  flush();
  renderBoard();
  morph(() => {
    editor.hidden = true;
    pauseDots(false);
  }, sourceFor(id));
}

export function isEditing(id) {
  return id ? current?.id === id : !!current;
}

// Called when another tab changed notes. Keep the open note, or close it if it was deleted there.
export function syncNotes() {
  if (current) {
    const fresh = state.notes.find((n) => n.id === current.id);
    if (fresh) current = fresh;
    else {
      current = null;
      editor.hidden = true;
      pauseDots(false);
    }
  }
  renderBoard();
}

function setup() {
  for (const hue of HUES) {
    const s = document.createElement('button');
    s.className = `swatch ${hue}-note`;
    s.dataset.hue = hue;
    s.setAttribute('aria-label', `${hue} note`);
    s.onclick = () => {
      current.hue = hue;
      save('notes');
      paintEditor();
    };
    hueRow.append(s);
  }

  input.addEventListener('input', () => {
    current.body = input.value;
    current.updated = Date.now();
    save('notes');
    footer();
  });

  document.getElementById('ed-back').onclick = closeNote;
  mdBtn.onclick = () => {
    current.mode = 'md';
    save('notes');
    paintEditor();
  };
  textBtn.onclick = () => {
    current.mode = 'text';
    previewing = false;
    save('notes');
    paintEditor();
  };
  previewBtn.onclick = () => {
    previewing = !previewing;
    paintEditor();
    if (!previewing) input.focus();
  };

  document.getElementById('ed-delete').onclick = () => {
    const note = current;
    const at = state.notes.indexOf(note);
    state.notes.splice(at, 1);
    current = null;
    editor.hidden = true;
    pauseDots(false);
    save('notes');
    renderBoard();
    toast('Note deleted', {
      label: 'Undo',
      run: () => {
        state.notes.splice(at, 0, note);
        save('notes');
        renderBoard();
      },
    });
  };

  new ResizeObserver(() => state.notes.forEach((n) => els.has(n.id) && place(n, els.get(n.id)))).observe(board);
}

setup();
