// The header's moving parts: a sun walking the working day, with today's timed work
// marked on its path, and one line of news under the clock at a time.

import { state } from './store.js';
import { formatTime, localDay, workProgress } from './lib.js';
import { popCount } from './dots.js';
import { nextLine, openCount, timedToday } from './today.js';
import { rotate } from './ui.js';

const DAY_START = 6 * 60;
const DAY_END = 22 * 60;
const SVG = 'http://www.w3.org/2000/svg';

const $ = (id) => document.getElementById(id);
const dateFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

function greeting(hour) {
  if (hour < 5) return 'Still up';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

const minutesOf = (ms) => new Date(ms).getHours() * 60 + new Date(ms).getMinutes();
const dayFraction = (minutes) => Math.min(1, Math.max(0, (minutes - DAY_START) / (DAY_END - DAY_START)));

function lines() {
  const now = new Date();
  const { name } = state.settings;
  const out = [`${greeting(now.getHours())}${name ? `, ${name}` : ''}. ${dateFmt.format(now)}`];

  const next = nextLine();
  if (next) out.push(next);
  const meeting = state.meetings.list.find((m) => m.start > Date.now());
  if (meeting) out.push(`${formatTime(minutesOf(meeting.start), state.settings.hour12)} ${meeting.title}`);
  const open = openCount();
  if (open) out.push(open === 1 ? '1 task left today' : `${open} tasks left today`);
  const today = localDay();
  const running = state.work.filter((w) => workProgress(w, today).phase === 'active');
  if (running.length === 1) out.push(`Working on ${running[0].title}`);
  if (running.length > 1) out.push(`${running.length} jobs running`);
  const pops = popCount();
  if (pops) out.push(pops === 1 ? '1 bubble popped' : `${pops} bubbles popped`);
  return out;
}

function paintArc() {
  const svg = $('day-arc');
  const path = svg.querySelector('.arc-base');
  const length = path.getTotalLength();
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const f = dayFraction(minutes);

  svg.querySelector('.arc-done').style.strokeDasharray = `${f * length} ${length}`;
  const at = path.getPointAtLength(f * length);
  const sun = svg.querySelector('.arc-sun');
  sun.style.transform = `translate(${at.x}px, ${at.y}px)`;
  const night = minutes < DAY_START || minutes >= DAY_END;
  sun.classList.toggle('night', night);
  const left = DAY_END - minutes;
  sun.dataset.tip = night ? 'Day is done' : `${Math.floor(left / 60)}h ${left % 60}m left in the day`;

  const marks = svg.querySelector('.arc-marks');
  const items = [
    ...timedToday().map((t) => ({ at: t.at, title: t.text })),
    ...state.meetings.list
      .filter((m) => localDay(new Date(m.start)) === localDay())
      .map((m) => ({ at: minutesOf(m.start), title: m.title })),
  ];
  marks.replaceChildren(
    ...items.map((item) => {
      const spot = path.getPointAtLength(dayFraction(item.at) * length);
      const dot = document.createElementNS(SVG, 'circle');
      dot.setAttribute('cx', spot.x);
      dot.setAttribute('cy', spot.y);
      dot.setAttribute('r', 4.5);
      dot.classList.toggle('past', item.at <= minutes);
      dot.dataset.tip = `${formatTime(item.at, state.settings.hour12)} ${item.title}`;
      return dot;
    }),
  );
}

let refreshTicker = () => {};

export function paintHeader() {
  paintArc();
  refreshTicker();
}

export function initHeader() {
  refreshTicker = rotate($('date'), lines, 7000);
  const sun = $('day-arc').querySelector('.arc-sun');
  sun.onclick = () => sun.firstElementChild.animate(
    [{ transform: 'none' }, { transform: 'translateY(-11px) scale(1.2)' }, { transform: 'none' }],
    { duration: 480, easing: 'cubic-bezier(0.3, 1.5, 0.5, 1)' },
  );
  paintArc();
  // A soft draw on open, once: the line runs out to where the day is now.
  $('day-arc').querySelector('.arc-done').animate(
    [{ strokeDasharray: `0 ${$('day-arc').querySelector('.arc-base').getTotalLength()}` }, {}],
    { duration: 900, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' },
  );
}
