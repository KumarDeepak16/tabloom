// Work calendar. Notes live inside their date: click a day and it grows into a view of
// everything on it. Drag across days to plan a job; bars show how long each one runs.

import { state, save, flush } from './store.js';
import { dayDiff, formatTime, localDay, monthWeeks, noteDay, weekBars, workProgress } from './lib.js';
import { newNote, noteFace, onNotesChanged, openNote } from './notes.js';
import { toast } from './ui.js';

const HUES = ['blue', 'pink', 'green', 'orange', 'purple', 'yellow'];
const LANE = 1.17; // rem, bar height plus its gap
const DATE_ROW = 1.75; // rem kept clear for the date number
const MAX_PAPERS = 3;

const $ = (id) => document.getElementById(id);
const root = $('calendar');
const weeksEl = $('cal-weeks');
const foot = $('cal-foot');
const dialog = $('work-dialog');
const dayPanel = $('day');
const monthFmt = new Intl.DateTimeFormat('en-GB', { month: 'long' });
const shortFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const longFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

const now = new Date();
let shown = { year: now.getFullYear(), month: now.getMonth() };
let selecting = null;
let editing = null;
let hue = HUES[0];
let openedDay = null;

const rem = () => parseFloat(getComputedStyle(document.documentElement).fontSize);
const days = (n) => `${n} ${n === 1 ? 'day' : 'days'}`;
const label = (w) => (w.at != null ? `${formatTime(w.at, state.settings.hour12)} ${w.title}` : w.title);
const asDate = (day) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const cellOf = (day) => weeksEl.querySelector(`[data-day="${day}"]`);

function describe(work) {
  const p = workProgress(work, localDay());
  if (p.phase === 'upcoming') return `${days(p.total)}, starts in ${days(p.startsIn)}`;
  if (p.phase === 'past') return `${days(p.total)}, finished`;
  return `Day ${p.done} of ${p.total}, ${p.left ? `${days(p.left)} left` : 'ends today'}`;
}

function barEl(bar) {
  const { item, from, span, lane, opens, closes } = bar;
  const btn = document.createElement('button');
  btn.className = `cal-bar ${item.hue}-note${opens ? ' opens' : ''}${closes ? ' closes' : ''}`;
  btn.style.gridColumn = `${from + 1} / span ${span}`;
  btn.style.gridRow = lane + 1;
  btn.textContent = label(item);
  btn.dataset.tip = `${item.title}: ${describe(item)}`;
  btn.onclick = () => openDialog(item);
  return btn;
}

// Tiny sheets of paper on a date: one per note, in the note's color.
function papersEl(notes) {
  const box = document.createElement('div');
  box.className = 'cal-papers';
  for (const note of notes.slice(0, MAX_PAPERS)) {
    const sheet = document.createElement('i');
    sheet.className = `${note.hue}-note`;
    box.append(sheet);
  }
  if (notes.length > MAX_PAPERS) {
    const more = document.createElement('b');
    more.textContent = notes.length;
    box.append(more);
  }
  return box;
}

function weekEl(week, today, maxLanes, notesByDay) {
  const row = document.createElement('div');
  row.className = 'cal-week';

  const bars = weekBars(state.work, week);
  const hidden = week.map((_, i) => bars.filter((b) => b.lane >= maxLanes && i >= b.from && i < b.from + b.span).length);

  week.forEach((day, i) => {
    const cell = document.createElement('button');
    const inMonth = asDate(day).getMonth() === shown.month;
    const notes = notesByDay.get(day) ?? [];
    cell.className = `cal-day${inMonth ? '' : ' outside'}${day === today ? ' is-today' : ''}${i > 4 ? ' weekend' : ''}${day < today ? ' past' : ''}`;
    cell.dataset.day = day;
    cell.setAttribute('aria-label', `Open ${shortFmt.format(asDate(day))}${notes.length ? `, ${notes.length} notes` : ''}`);
    const num = document.createElement('span');
    num.textContent = asDate(day).getDate();
    cell.append(num);
    if (notes.length) cell.append(papersEl(notes));
    if (hidden[i]) {
      const more = document.createElement('small');
      more.textContent = `+${hidden[i]}`;
      cell.append(more);
    }
    row.append(cell);
  });

  const layer = document.createElement('div');
  layer.className = 'cal-bars';
  layer.append(...bars.filter((b) => b.lane < maxLanes).map(barEl));
  row.append(layer);
  return row;
}

function chipEl(work) {
  const chip = document.createElement('button');
  chip.className = `cal-chip ${work.hue}-note`;
  const title = document.createElement('b');
  title.textContent = work.title;
  const info = document.createElement('span');
  info.textContent = describe(work);
  chip.append(title, info);
  chip.onclick = () => openDialog(work);
  return chip;
}

function renderFoot(today) {
  const live = state.work
    .filter((w) => w.end >= today)
    .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
  if (live.length) return foot.replaceChildren(...live.map(chipEl));
  const empty = document.createElement('p');
  empty.textContent = 'Click a date to open it. Drag across days to plan work.';
  foot.replaceChildren(empty);
}

export function renderCalendar() {
  if (root.hidden) return;
  const today = localDay();
  const weeks = monthWeeks(shown.year, shown.month);
  $('cal-month').textContent = monthFmt.format(new Date(shown.year, shown.month, 1));
  $('cal-year').textContent = shown.year;

  const notesByDay = new Map();
  for (const note of state.notes) {
    const day = noteDay(note);
    notesByDay.set(day, [...(notesByDay.get(day) ?? []), note]);
  }

  const r = rem();
  renderFoot(today);
  const rowHeight = weeksEl.clientHeight / weeks.length;
  const maxLanes = Math.max(1, Math.floor((rowHeight - DATE_ROW * r) / (LANE * r)));
  weeksEl.replaceChildren(...weeks.map((week) => weekEl(week, today, maxLanes, notesByDay)));
  if (openedDay) paintDay();
}

function paintDay(entering = false) {
  const day = openedDay;
  const notes = state.notes.filter((n) => noteDay(n) === day);
  const work = state.work.filter((w) => w.start <= day && w.end >= day);
  const heading = longFmt.format(asDate(day));
  $('day-title').textContent = day === localDay() ? `Today, ${heading}` : heading;
  const parts = [];
  if (notes.length) parts.push(notes.length === 1 ? '1 note' : `${notes.length} notes`);
  if (work.length) parts.push(`${work.length} work`);
  $('day-sub').textContent = parts.join(', ') || 'Nothing here yet';

  $('day-works').replaceChildren(...work.map(chipEl));
  $('day-works').hidden = work.length === 0;

  $('day-notes').replaceChildren(
    ...notes.map((note, i) => {
      const card = document.createElement('button');
      card.className = `day-card ${note.hue}-note${entering ? ' entering' : ''}`;
      card.dataset.noteCard = note.id;
      card.style.setProperty('--i', i);
      const face = document.createElement('div');
      noteFace(note, face);
      card.setAttribute('aria-label', `Open note: ${note.body.trim().split('\n')[0].slice(0, 60) || 'empty'}`);
      card.append(face);
      card.onclick = () => openNote(note.id);
      return card;
    }),
  );
}

// The date grows into the day view, and shrinks back into its cell.
function grow(update, from) {
  const fast = !document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (fast || !from) return update();
  from.style.viewTransitionName = 'day';
  const run = document.startViewTransition(() => {
    from.style.viewTransitionName = '';
    update();
    dayPanel.style.viewTransitionName = dayPanel.hidden ? '' : 'day';
    if (dayPanel.hidden) cellOf(selectedCell)?.style.setProperty('view-transition-name', 'day');
  });
  run.finished.catch(() => {}).finally(() => {
    dayPanel.style.viewTransitionName = '';
    if (selectedCell) cellOf(selectedCell)?.style.removeProperty('view-transition-name');
  });
}

let selectedCell = null;

export function openDay(day) {
  selectedCell = day;
  grow(() => {
    openedDay = day;
    dayPanel.hidden = false;
    paintDay(true);
  }, cellOf(day));
}

export function closeDay() {
  if (!openedDay) return;
  grow(() => {
    openedDay = null;
    dayPanel.hidden = true;
    renderCalendar();
  }, dayPanel);
}

export const activeDay = () => openedDay ?? localDay();

function move(by) {
  const d = new Date(shown.year, shown.month + by, 1);
  shown = { year: d.getFullYear(), month: d.getMonth() };
  renderCalendar();
}

function markSelection() {
  const [a, b] = [selecting.from, selecting.to].sort();
  for (const cell of weeksEl.querySelectorAll('.cal-day')) {
    cell.classList.toggle('picking', cell.dataset.day >= a && cell.dataset.day <= b);
  }
}

function paintHues() {
  for (const swatch of $('work-hues').children) swatch.setAttribute('aria-pressed', swatch.dataset.hue === hue);
}

function fail(message, input) {
  $('work-error').textContent = message;
  $('work-error').hidden = false;
  input.focus();
}

export function openDialog(work, start = activeDay(), end = start) {
  editing = work ?? null;
  $('work-heading').textContent = work ? 'Edit work' : 'Add work';
  $('work-title').value = work?.title ?? '';
  $('work-start').value = work?.start ?? start;
  $('work-end').value = work?.end ?? end;
  const at = work?.at;
  $('work-time').value = at == null ? '' : `${String(Math.floor(at / 60)).padStart(2, '0')}:${String(at % 60).padStart(2, '0')}`;
  hue = work?.hue ?? HUES[state.work.length % HUES.length];
  $('work-delete').hidden = !work;
  $('work-error').hidden = true;
  paintHues();
  dialog.showModal();
  $('work-title').focus();
}

function commit() {
  save('work');
  flush();
  renderCalendar();
}

function submit(e) {
  e.preventDefault();
  const title = $('work-title').value.trim();
  const start = $('work-start').value;
  const end = $('work-end').value;
  const time = $('work-time').value;
  if (!title) return fail('Enter what you are working on.', $('work-title'));
  if (!start || !end) return fail('Pick a start and end date.', $('work-start'));
  if (end < start) return fail('The end date is before the start date.', $('work-end'));

  const [h, m] = time.split(':').map(Number);
  const fields = { title, start, end, hue, at: time ? h * 60 + m : undefined };
  if (editing) Object.assign(editing, fields);
  else state.work.push({ id: crypto.randomUUID(), ...fields });
  dialog.close();
  commit();
  if (start.slice(0, 7) !== `${shown.year}-${String(shown.month + 1).padStart(2, '0')}` && dayDiff(start, end) < 32) {
    const d = asDate(start);
    shown = { year: d.getFullYear(), month: d.getMonth() };
    renderCalendar();
  }
}

function removeWork() {
  const at = state.work.indexOf(editing);
  const work = editing;
  dialog.close();
  if (at < 0) return;
  state.work.splice(at, 1);
  commit();
  toast(`${work.title} deleted`, {
    label: 'Undo',
    run: () => {
      state.work.splice(at, 0, work);
      commit();
    },
  });
}

function bindDrag() {
  weeksEl.addEventListener('pointerdown', (e) => {
    const cell = e.target.closest('.cal-day');
    if (!cell || e.button !== 0) return;
    e.preventDefault();
    selecting = { from: cell.dataset.day, to: cell.dataset.day };
    markSelection();
  });
  addEventListener('pointermove', (e) => {
    if (!selecting) return;
    const cell = document.elementFromPoint(e.clientX, e.clientY)?.closest('.cal-day');
    if (cell && cell.dataset.day !== selecting.to) {
      selecting.to = cell.dataset.day;
      markSelection();
    }
  });
  addEventListener('pointerup', () => {
    if (!selecting) return;
    const { from, to } = selecting;
    selecting = null;
    weeksEl.querySelectorAll('.picking').forEach((c) => c.classList.remove('picking'));
    if (from === to) return openDay(from);
    const [start, end] = [from, to].sort();
    openDialog(null, start, end);
  });
  // Keyboard path: Enter on a day. Pointer clicks arrive with detail > 0 and were handled above.
  weeksEl.addEventListener('click', (e) => {
    const cell = e.target.closest('.cal-day');
    if (cell && e.detail === 0) openDay(cell.dataset.day);
  });
}

export function initCalendar() {
  for (const name of HUES) {
    const s = document.createElement('button');
    s.type = 'button';
    s.className = `swatch ${name}-note`;
    s.dataset.hue = name;
    s.setAttribute('aria-label', `${name} color`);
    s.onclick = () => {
      hue = name;
      paintHues();
    };
    $('work-hues').append(s);
  }
  $('cal-prev').onclick = () => move(-1);
  $('cal-next').onclick = () => move(1);
  $('cal-today').onclick = () => {
    const d = new Date();
    shown = { year: d.getFullYear(), month: d.getMonth() };
    renderCalendar();
  };
  $('cal-add').onclick = () => openDialog();
  $('day-note').onclick = () => newNote(activeDay());
  $('day-work').onclick = () => openDialog();
  $('day-close').onclick = closeDay;
  $('work-form').addEventListener('submit', submit);
  $('work-cancel').onclick = () => dialog.close();
  $('work-delete').onclick = removeWork;
  bindDrag();
  onNotesChanged(renderCalendar);

  let frame = 0;
  new ResizeObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(renderCalendar);
  }).observe(weeksEl);
}
