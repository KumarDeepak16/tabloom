// Reads a Google Calendar iCal feed into timed meetings inside a time window.
// Handles the recurrence Google actually writes: daily, weekly, monthly, yearly, with
// interval, BYDAY, COUNT, UNTIL, EXDATE and moved instances. All-day events are skipped.

const DAY_MS = 864e5;
const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const MAX_DAYS = 12000; // about 33 years of a daily event; a stop for malformed rules

const clocks = new Map();

function zoneOffset(ms, zone) {
  if (!clocks.has(zone)) {
    clocks.set(zone, new Intl.DateTimeFormat('en-US', {
      timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
    }));
  }
  const p = Object.fromEntries(clocks.get(zone).formatToParts(ms).map(({ type, value }) => [type, Number(value)]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - ms;
}

// Wall-clock time in a zone to an instant. Checked twice so a daylight-saving edge lands right.
function wallToMs(w, zone) {
  const guess = Date.UTC(w.y, w.m, w.d, w.h, w.mi, w.s);
  if (zone === 'UTC') return guess;
  if (!zone) return new Date(w.y, w.m, w.d, w.h, w.mi, w.s).getTime();
  try {
    const first = guess - zoneOffset(guess, zone);
    return guess - zoneOffset(first, zone);
  } catch {
    return new Date(w.y, w.m, w.d, w.h, w.mi, w.s).getTime(); // unknown zone name
  }
}

function parseStamp(value, params) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const wall = { y: +m[1], m: +m[2] - 1, d: +m[3], h: +(m[4] ?? 0), mi: +(m[5] ?? 0), s: +(m[6] ?? 0) };
  const allDay = !m[4];
  const zone = m[7] ? 'UTC' : params.TZID;
  return { wall, zone, allDay, ms: wallToMs(wall, zone) };
}

const cleanText = (s) => s.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();

function readEvents(text) {
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const events = [];
  let e = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') e = { exdates: new Set() };
    else if (line === 'END:VEVENT') {
      if (e?.start) events.push(e);
      e = null;
    } else if (e) {
      const colon = line.indexOf(':');
      if (colon < 0) continue;
      const [name, ...rest] = line.slice(0, colon).split(';');
      const params = Object.fromEntries(rest.map((p) => p.split('=')));
      const value = line.slice(colon + 1);
      if (name === 'SUMMARY') e.title = cleanText(value);
      else if (name === 'UID') e.uid = value;
      else if (name === 'STATUS') e.cancelled = value === 'CANCELLED';
      else if (name === 'DTSTART') e.start = parseStamp(value, params);
      else if (name === 'DTEND') e.end = parseStamp(value, params);
      else if (name === 'RRULE') e.rule = Object.fromEntries(value.split(';').map((p) => p.split('=')));
      else if (name === 'RECURRENCE-ID') e.replaces = parseStamp(value, params)?.ms;
      else if (name === 'EXDATE') value.split(',').forEach((v) => e.exdates.add(parseStamp(v, params)?.ms));
      else if (name === 'X-GOOGLE-CONFERENCE') e.link = value;
      else if (['LOCATION', 'DESCRIPTION'].includes(name) && !e.link) {
        e.link = /https:\/\/(?:meet\.google\.com|[\w.-]*zoom\.us|teams\.microsoft\.com)\/[^\s\\"<]+/.exec(value)?.[0];
      }
    }
  }
  return events;
}

function ruleHits(rule, start, day, index) {
  const interval = Number(rule.INTERVAL ?? 1);
  const by = rule.BYDAY?.split(',') ?? [];
  const weekday = WEEKDAYS[day.getUTCDay()];
  if (rule.FREQ === 'DAILY') return index % interval === 0 && (!by.length || by.includes(weekday));
  if (rule.FREQ === 'WEEKLY') {
    // Weeks counted from the Monday of the start week, the iCal default.
    const startDay = new Date(Date.UTC(start.y, start.m, start.d));
    const monday = (startDay.getUTCDay() + 6) % 7;
    const week = Math.floor((index + monday) / 7);
    return week % interval === 0 && (by.length ? by.includes(weekday) : day.getUTCDay() === startDay.getUTCDay());
  }
  if (rule.FREQ === 'MONTHLY') {
    const months = (day.getUTCFullYear() - start.y) * 12 + day.getUTCMonth() - start.m;
    if (months % interval !== 0) return false;
    const nth = by[0] && /^(-?\d+)([A-Z]{2})$/.exec(by[0]);
    if (!nth) return day.getUTCDate() === start.d;
    if (nth[2] !== weekday) return false;
    const fromStart = Math.ceil(day.getUTCDate() / 7);
    const last = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 0)).getUTCDate();
    return Number(nth[1]) > 0 ? fromStart === Number(nth[1]) : day.getUTCDate() > last - 7;
  }
  if (rule.FREQ === 'YEARLY') return day.getUTCMonth() === start.m && day.getUTCDate() === start.d;
  return false;
}

function startsIn(event, from, to, moved) {
  const { start, end, rule, exdates, uid } = event;
  const length = (end?.ms ?? start.ms + 36e5) - start.ms;
  if (!rule) return start.ms < to && start.ms + length > from ? [start.ms] : [];

  const until = rule.UNTIL ? parseStamp(rule.UNTIL, { TZID: start.zone })?.ms : Infinity;
  const limit = rule.COUNT ? Number(rule.COUNT) : Infinity;
  const hits = [];
  let count = 0;
  for (let i = 0; i < MAX_DAYS; i++) {
    const day = new Date(Date.UTC(start.wall.y, start.wall.m, start.wall.d + i));
    const wall = { ...start.wall, y: day.getUTCFullYear(), m: day.getUTCMonth(), d: day.getUTCDate() };
    const ms = wallToMs(wall, start.zone);
    if (ms >= to || ms > until || count >= limit) break;
    if (!ruleHits(rule, start.wall, day, i)) continue;
    count++;
    if (ms + length > from && !exdates.has(ms) && !moved.has(`${uid}|${ms}`)) hits.push(ms);
  }
  return hits;
}

// Meetings that overlap [from, to), soonest first. Times are epoch milliseconds.
export function meetingsBetween(text, from, to) {
  const events = readEvents(text);
  const moved = new Set(events.filter((e) => e.replaces).map((e) => `${e.uid}|${e.replaces}`));
  return events
    .filter((e) => !e.cancelled && !e.start.allDay)
    .flatMap((e) => {
      const length = (e.end?.ms ?? e.start.ms + 36e5) - e.start.ms;
      return startsIn(e, from, to, moved).map((start) => ({
        title: e.title || 'Busy',
        start,
        end: start + length,
        link: e.link ?? '',
      }));
    })
    .sort((a, b) => a.start - b.start);
}

export const startOfDay = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
export const twoDaysFrom = (ms) => ms + 2 * DAY_MS;
