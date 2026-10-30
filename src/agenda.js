// "Coming up" section under the to-do list: meetings and recent docs, shown only when there are some.

import { state, save, flush } from './store.js';
import { formatTime, parseDoc, safeUrl, timeAgo } from './lib.js';
import { meetingsBetween, startOfDay, twoDaysFrom } from './ics.js';
import { toast } from './ui.js';

const REFRESH = 15 * 60 * 1000;
const MEETINGS_SHOWN = 2;
const DOCS_SHOWN = 6;
const LOOK_BACK = 14 * 864e5;
const ICAL = /^https:\/\/calendar\.google\.com\/calendar\/ical\/\S+\.ics$/;

const $ = (id) => document.getElementById(id);
const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short' });
let docs = [];

function row(tag, title) {
  const el = document.createElement(tag);
  el.className = 'agenda-row';
  const name = document.createElement('span');
  name.textContent = title;
  el.title = title;
  el.append(name);
  return el;
}

function meetingRow(m) {
  const start = new Date(m.start);
  const minutes = start.getHours() * 60 + start.getMinutes();
  const today = start.getTime() < startOfDay() + 864e5;
  const link = safeUrl(m.link);
  const el = row('div', m.title);
  const when = document.createElement('b');
  when.textContent = `${today ? '' : `${dayFmt.format(start)} `}${formatTime(minutes, state.settings.hour12)}`;
  el.prepend(when);
  if (Date.now() >= m.start) el.classList.add('live');
  if (link) {
    const join = document.createElement('a');
    join.className = 'btn is-small green';
    join.href = link;
    join.textContent = 'Join';
    el.append(join);
  }
  return el;
}

function docRow(doc) {
  const el = row('a', doc.title);
  el.href = doc.url;
  const icon = document.createElement('img');
  icon.src = `assets/icons/${doc.icon}`;
  icon.alt = '';
  el.prepend(icon);
  const when = document.createElement('b');
  when.textContent = timeAgo(doc.at);
  el.append(when);
  return el;
}

function driveRow() {
  const el = row('a', 'All recent files in Drive');
  el.href = 'https://drive.google.com/drive/recent';
  el.classList.add('agenda-more');
  return el;
}

export const recentDocs = () => (state.settings.docs ? docs : []);

export function renderAgenda() {
  const now = Date.now();
  const meetings = state.settings.ical ? state.meetings.list.filter((m) => m.end > now).slice(0, MEETINGS_SHOWN) : [];
  const shown = recentDocs();
  $('agenda-meetings').replaceChildren(...meetings.map(meetingRow));
  $('agenda-docs').replaceChildren(...shown.map(docRow), driveRow());
  $('agenda-meetings').hidden = !meetings.length;
  $('agenda-docs').hidden = !shown.length;
  $('agenda').hidden = !meetings.length && !shown.length;
}

export async function syncMeetings(force = false) {
  const { ical } = state.settings;
  if (!ical || (!force && Date.now() - state.meetings.at < REFRESH)) return;
  try {
    const res = await fetch(ical, { credentials: 'omit' });
    if (!res.ok) throw new Error(String(res.status));
    const from = startOfDay();
    state.meetings = { at: Date.now(), list: meetingsBetween(await res.text(), from, twoDaysFrom(from)) };
    save('meetings');
    flush();
    renderAgenda();
  } catch {
    if (force) toast('Could not read that calendar. Check the address.');
  }
}

export async function loadDocs() {
  if (!state.settings.docs || !chrome.history) return;
  const searches = ['docs.google.com', 'drive.google.com'].map((text) => chrome.history.search({ text, startTime: Date.now() - LOOK_BACK, maxResults: 60 }));
  const items = (await Promise.all(searches)).flat();
  const seen = new Set();
  docs = items
    .sort((a, b) => b.lastVisitTime - a.lastVisitTime)
    .flatMap((item) => {
      const doc = parseDoc(item.url, item.title);
      if (!doc || seen.has(doc.id)) return [];
      seen.add(doc.id);
      return [{ ...doc, at: item.lastVisitTime }];
    })
    .slice(0, DOCS_SHOWN);
  renderAgenda();
}

// Must run inside a click: browsers only show the permission prompt for a user action.
export async function setDocs(on) {
  const granted = on ? await chrome.permissions.request({ permissions: ['history'] }) : false;
  state.settings.docs = on && granted;
  save('settings');
  if (on && !granted) toast('Recent docs stay off without history access.');
  await loadDocs();
  renderAgenda();
}

export function setCalendarFeed(raw) {
  const ical = raw.trim();
  if (ical && !ICAL.test(ical)) return false;
  state.settings.ical = ical;
  state.meetings = { at: 0, list: [] };
  save('settings');
  save('meetings');
  renderAgenda();
  syncMeetings(true);
  return true;
}
