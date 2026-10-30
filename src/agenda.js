// "Coming up" section under the to-do list: meetings and recent docs, shown only when there are some.

import { state, save, flush } from './store.js';
import { formatTime, safeUrl } from './lib.js';
import { meetingsBetween, startOfDay, twoDaysFrom } from './ics.js';
import { toast } from './ui.js';

const REFRESH = 15 * 60 * 1000;
const MEETINGS_SHOWN = 2;
const DOCS_SHOWN = 3;
const LOOK_BACK = 14 * 864e5;
const ICAL = /^https:\/\/calendar\.google\.com\/calendar\/ical\/\S+\.ics$/;
const DOC_PATTERN = /docs\.google\.com\/(document|spreadsheets|presentation|forms)\/d\/([\w-]+)/;
const KINDS = {
  document: ['docs.png', / - Google Docs$/],
  spreadsheets: ['sheets.png', / - Google Sheets$/],
  presentation: ['slides.png', / - Google Slides$/],
  forms: ['forms.png', / - Google Forms$/],
};

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
  return el;
}

export function renderAgenda() {
  const now = Date.now();
  const meetings = state.settings.ical ? state.meetings.list.filter((m) => m.end > now).slice(0, MEETINGS_SHOWN) : [];
  const shown = state.settings.docs ? docs : [];
  $('agenda-meetings').replaceChildren(...meetings.map(meetingRow));
  $('agenda-docs').replaceChildren(...shown.map(docRow));
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
  const items = await chrome.history.search({ text: 'docs.google.com', startTime: Date.now() - LOOK_BACK, maxResults: 60 });
  const seen = new Set();
  docs = items
    .sort((a, b) => b.lastVisitTime - a.lastVisitTime)
    .flatMap((item) => {
      const match = DOC_PATTERN.exec(item.url ?? '');
      if (!match || !item.title || seen.has(match[2])) return [];
      seen.add(match[2]);
      const [icon, suffix] = KINDS[match[1]];
      return [{ title: item.title.replace(suffix, ''), url: item.url, icon }];
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
