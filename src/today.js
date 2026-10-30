import { state, save } from './store.js';
import { formatTime, keepTasks, localDay, parseTime, yesterday } from './lib.js';
import { ripple } from './dots.js';
import { celebrate } from './bloom.js';
import { rotate, toast } from './ui.js';

const GREEN = 6;

const list = document.getElementById('tasks');
const emptyEl = document.getElementById('tasks-empty');
const countEl = document.getElementById('task-count');
const meter = document.getElementById('meter');
const fill = document.getElementById('meter-fill');
const streakEl = document.getElementById('streak');
const streakDays = document.getElementById('streak-days');
const deck = document.getElementById('deck');
const earlier = document.getElementById('earlier');
const earlierToggle = document.getElementById('earlier-toggle');
const earlierTitle = document.getElementById('earlier-title');
const earlierLeft = document.getElementById('earlier-left');
const earlierList = document.getElementById('earlier-list');
const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });

const minutesNow = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

const todayTasks = () => state.tasks.filter((t) => t.day === localDay());
const earlierTasks = () => state.tasks.filter((t) => t.day !== localDay());

function dayLabel(day) {
  if (day === yesterday(localDay())) return 'Yesterday';
  const [y, m, d] = day.split('-').map(Number);
  return dayFmt.format(new Date(y, m - 1, d));
}

// Runs at load and at midnight: yesterday's tasks move to the card under Today.
export function rollDay() {
  const kept = keepTasks(state.tasks, localDay());
  if (kept.length !== state.tasks.length) {
    state.tasks = kept;
    save('tasks');
  }
}

function sorted(tasks) {
  const key = (t) => (t.done ? 2e4 : 0) + (t.at ?? 1e4);
  return [...tasks].sort((a, b) => key(a) - key(b));
}

function checkEl(task) {
  const btn = document.createElement('button');
  btn.className = 'check';
  btn.setAttribute('role', 'checkbox');
  btn.setAttribute('aria-checked', task.done);
  btn.setAttribute('aria-label', task.text);
  btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.500 4.500L19 7.500"/></svg>';
  btn.onclick = () => toggle(task, btn);
  return btn;
}

function toggle(task, btn) {
  task.done = !task.done;
  task.doneDay = task.done ? localDay() : undefined;
  btn.setAttribute('aria-checked', task.done);
  btn.closest('li').classList.toggle('done', task.done);
  if (task.done) {
    const box = btn.getBoundingClientRect();
    ripple(box.left - 30, box.top + box.height / 2, GREEN);
    bumpStreak();
    celebrate();
    const todays = todayTasks();
    if (todays.length && todays.every((t) => t.done)) ripple(innerWidth / 2, innerHeight / 2);
  }
  save('tasks');
  renderSummary();
  // Let the check finish its animation before the row sinks to the done pile.
  setTimeout(renderTasks, 420);
}

function bumpStreak() {
  const today = localDay();
  const s = state.streak;
  if (s.last === today) return;
  s.days = s.last === yesterday(today) ? s.days + 1 : 1;
  s.last = today;
  save('streak');
}

function removeTask(task) {
  const at = state.tasks.indexOf(task);
  state.tasks.splice(at, 1);
  save('tasks');
  renderTasks();
  toast('Task deleted', {
    label: 'Undo',
    run: () => {
      state.tasks.splice(at, 0, task);
      save('tasks');
      renderTasks();
    },
  });
}

function moveToToday(task) {
  task.day = localDay();
  task.at = undefined;
  save('tasks');
  renderTasks();
  toast('Moved to today');
}

function iconButton(label, icon, onclick) {
  const btn = document.createElement('button');
  btn.className = 'btn is-small is-square';
  btn.setAttribute('aria-label', label);
  btn.dataset.tip = label;
  btn.innerHTML = `<svg><use href="#${icon}"/></svg>`;
  btn.onclick = onclick;
  return btn;
}

function rowEl(task, past = false) {
  const li = document.createElement('li');
  li.className = `todo${task.done ? ' done' : ''}`;

  const body = document.createElement('div');
  body.className = 'task-body';
  const text = document.createElement('span');
  text.textContent = task.text;
  body.append(text);

  if (task.at != null && !past) {
    const meta = document.createElement('small');
    const late = !task.done && task.at <= minutesNow();
    meta.className = `task-meta at${late ? ' late' : ''}`;
    meta.textContent = formatTime(task.at, state.settings.hour12);
    body.append(meta);
  }

  li.append(checkEl(task), body);
  if (past && !task.done) li.append(iconButton(`Move ${task.text} to today`, 'i-up', () => moveToToday(task)));
  li.append(iconButton(`Delete ${task.text}`, 'i-close', () => removeTask(task)));
  return li;
}

function renderEarlier() {
  const past = earlierTasks();
  deck.classList.toggle('has-earlier', past.length > 0);
  earlier.hidden = past.length === 0;
  if (!past.length) return setEarlierOpen(false);

  const open = past.filter((t) => !t.done);
  const newest = [...past].sort((a, b) => b.day.localeCompare(a.day))[0].day;
  earlierTitle.textContent = dayLabel(open[0] ? [...open].sort((a, b) => b.day.localeCompare(a.day))[0].day : newest);
  earlierLeft.textContent = open.length ? `${open.length} left` : 'All done';

  const days = [...new Set(past.map((t) => t.day))].sort().reverse();
  earlierList.replaceChildren(
    ...days.flatMap((day) => {
      const heading = document.createElement('h3');
      heading.textContent = dayLabel(day);
      const rows = document.createElement('ul');
      rows.className = 'tasks-flat';
      rows.append(...sorted(past.filter((t) => t.day === day)).map((t) => rowEl(t, true)));
      return [heading, rows];
    }),
  );
}

function setEarlierOpen(open) {
  earlier.classList.toggle('open', open);
  earlierToggle.setAttribute('aria-expanded', open);
  earlierList.inert = !open;
}

function renderSummary() {
  const tasks = todayTasks();
  const total = tasks.length;
  const done = tasks.filter((t) => t.done).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  fill.style.transform = `translateX(${pct - 100}%)`;
  meter.setAttribute('aria-valuenow', pct);
  countEl.textContent = total ? `${done} of ${total} done` : 'No tasks yet';
  document.getElementById('today-mini').textContent = `${done}/${total}`;

  const active = state.streak.days > 0 && [localDay(), yesterday(localDay())].includes(state.streak.last);
  streakEl.hidden = !active;
  streakDays.textContent = state.streak.days;
}

export const timedToday = () => todayTasks().filter((t) => !t.done && t.at != null).sort((a, b) => a.at - b.at);
export const openCount = () => todayTasks().filter((t) => !t.done).length;

// For the line under the clock: the next timed task, or the one that just went past.
export function nextLine() {
  const now = minutesNow();
  const timed = timedToday();
  const task = timed.find((t) => t.at > now) ?? timed.at(-1);
  if (!task) return '';
  return `${task.at <= now ? 'Due' : 'Next'} ${formatTime(task.at, state.settings.hour12)}: ${task.text}`;
}

// What the collapsed panel cycles through: unfinished work, today's first.
const pendingTexts = () => [...sorted(todayTasks()), ...earlierTasks()].filter((t) => !t.done).map((t) => t.text);

export const initRail = () => rotate(document.getElementById('rail-task'), () => {
  const pending = pendingTexts();
  return pending.length ? pending : ['All clear'];
}, 4200);

let afterRender = () => {};
export const afterTasks = (fn) => (afterRender = fn);

export function renderTasks() {
  const tasks = todayTasks();
  list.replaceChildren(...sorted(tasks).map((t) => rowEl(t)));
  emptyEl.hidden = tasks.length > 0;
  list.hidden = tasks.length === 0;
  renderSummary();
  renderEarlier();
  afterRender();
}

earlierToggle.onclick = () => setEarlierOpen(!earlier.classList.contains('open'));

document.getElementById('task-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const field = document.getElementById('task-input');
  const text = field.value.trim();
  if (!text) return;
  state.tasks.push({ id: crypto.randomUUID(), text, done: false, day: localDay(), at: parseTime(text) ?? undefined });
  field.value = '';
  save('tasks');
  renderTasks();
});
