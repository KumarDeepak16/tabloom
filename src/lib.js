// Pure helpers: no DOM, no chrome.* so they run under node:test.

// Local date, not toISOString: that is UTC and flips the day at 05:30 in India.
export const localDay = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function daysBefore(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  return localDay(new Date(y, m - 1, d - n));
}

export const yesterday = (day) => daysBefore(day, 1);

const utc = (day) => {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

// Whole days from a to b. UTC so a daylight-saving change can't skew the count.
export const dayDiff = (a, b) => Math.round((utc(b) - utc(a)) / 864e5);

// Monday-first weeks covering a month (month is 0-based). Only as many weeks as it needs.
export function monthWeeks(year, month) {
  const first = new Date(year, month, 1);
  let day = daysBefore(localDay(first), (first.getDay() + 6) % 7);
  const last = localDay(new Date(year, month + 1, 0));
  const weeks = [];
  while (day <= last) {
    weeks.push(Array.from({ length: 7 }, (_, i) => daysBefore(day, -i)));
    day = daysBefore(day, -7);
  }
  return weeks;
}

// Bars for one week, each on the first lane free for its days. Earlier and longer work sits on top.
export function weekBars(work, week) {
  const [first, last] = [week[0], week[6]];
  const lanes = [];
  return work
    .filter((w) => w.start <= last && w.end >= first)
    .sort((a, b) => a.start.localeCompare(b.start) || dayDiff(b.start, b.end) - dayDiff(a.start, a.end))
    .map((item) => {
      const from = item.start < first ? 0 : dayDiff(first, item.start);
      const to = item.end > last ? 6 : dayDiff(first, item.end);
      let lane = lanes.findIndex((end) => end < from);
      if (lane < 0) lane = lanes.length;
      lanes[lane] = to;
      return { item, from, span: to - from + 1, lane, opens: item.start >= first, closes: item.end <= last };
    });
}

// Notes made before dates existed belong to the day they were created.
export const noteDay = (note) => note.day ?? localDay(new Date(note.created));

export function workProgress({ start, end }, today) {
  const total = dayDiff(start, end) + 1;
  if (today < start) return { total, done: 0, left: total, phase: 'upcoming', startsIn: dayDiff(today, start) };
  if (today > end) return { total, done: total, left: 0, phase: 'past', startsIn: 0 };
  return { total, done: dayDiff(start, today) + 1, left: dayDiff(today, end), phase: 'active', startsIn: 0 };
}

// Finished tasks stay a week so the earlier card can show them; unfinished ones stay until handled.
export function keepTasks(tasks, today) {
  const cutoff = daysBefore(today, 7);
  return tasks.filter((t) => !t.done || (t.doneDay ?? t.day) >= cutoff);
}

const BLOOM_STAGES = [
  { from: 1, name: 'Seed' },
  { from: 2, name: 'Sprout' },
  { from: 4, name: 'Seedling' },
  { from: 7, name: 'Bud' },
  { from: 14, name: 'Flower' },
  { from: 30, name: 'Full bloom' },
];

export function bloomStage(days) {
  const i = Math.max(0, BLOOM_STAGES.findLastIndex((s) => days >= s.from));
  const stage = BLOOM_STAGES[i];
  const next = BLOOM_STAGES[i + 1];
  return {
    name: stage.name,
    next: next?.name ?? null,
    daysLeft: next ? next.from - days : 0,
    progress: next ? (days - stage.from + 1) / (next.from - stage.from) : 1,
  };
}

// One step per calendar day, however many tabs open. Missed days never undo growth.
export function nextBloom(bloom, today) {
  if (bloom?.last === today) return bloom;
  return { days: (bloom?.days ?? 0) + 1, last: today };
}

// Trust boundary: every stored or typed URL passes here, so only http(s) ever reaches an href.
export function safeUrl(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

// "3pm call", "call 3:30 pm", "15:30 sync" → minutes since midnight, or null.
export function parseTime(text) {
  const m = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i.exec(text) || /\b([01]?\d|2[0-3]):([0-5]\d)\b/.exec(text);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (min > 59) return null;
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (m[3].toLowerCase() === 'pm' ? 12 : 0);
  }
  return h * 60 + min;
}

export function formatTime(minutes, hour12 = true) {
  const h = Math.floor(minutes / 60);
  const m = String(minutes % 60).padStart(2, '0');
  if (!hour12) return `${String(h).padStart(2, '0')}:${m}`;
  return `${h % 12 || 12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
}

// Adds a link once per group. An existing URL just takes the new name.
export function addToGroup(links, groupId, { name, url, icon, favicon }) {
  const group = links.find((g) => g.id === groupId);
  const href = safeUrl(url);
  if (!group || !href) return false;
  const found = group.items.find((i) => safeUrl(i.url) === href);
  if (found) {
    found.name = name;
    if (favicon) found.favicon = favicon;
    return true;
  }
  const item = { name, url: href };
  if (icon) item.icon = icon;
  if (favicon) item.favicon = favicon;
  group.items.push(item);
  return true;
}

// Text picked on any page, from the right-click menu, into notes, What I learned or to-dos.
export function addClip(data, kind, { text, url, title, day, heading, now, id }) {
  const clean = text.trim();
  if (!clean) return false;
  const line = clean.replace(/\s+/g, ' ');
  const href = safeUrl(url);
  const source = href && title ? `[${title.replace(/[[\]]/g, '').slice(0, 80)}](${href})` : href ?? '';
  const paper = (body, hue, key) => {
    const note = { id, body, mode: 'md', hue, day, x: Math.random(), y: Math.random(), rot: 0.8, z: data.notes.length + 1, created: now, updated: now };
    if (key) note.key = key;
    data.notes.push(note);
    return note;
  };

  if (kind === 'todo') {
    data.tasks.push({ id, text: line.slice(0, 200), done: false, day, at: parseTime(line) ?? undefined });
  } else if (kind === 'learned') {
    const key = `learned:${day}`;
    const note = data.notes.find((n) => n.key === key) ?? paper(`# ${heading}\n`, 'purple', key);
    note.body = `${note.body.trimEnd()}\n\n- ${line}${source ? ` (${source})` : ''}\n`;
    note.updated = now;
  } else {
    paper(source ? `${clean}\n\n${source}` : clean, 'blue');
  }
  return true;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

// Backup files come from disk, so check their shape before they replace live data.
export function validBackup(data) {
  return (
    !!data &&
    Array.isArray(data.notes) &&
    Array.isArray(data.tasks) &&
    Array.isArray(data.links) &&
    data.notes.every((n) => typeof n?.id === 'string' && typeof n?.body === 'string') &&
    data.tasks.every((t) => typeof t?.id === 'string' && typeof t?.text === 'string') &&
    data.links.every((g) => typeof g?.id === 'string' && Array.isArray(g?.items)) &&
    // Backups from before the calendar have no work list.
    (data.work === undefined ||
      (Array.isArray(data.work) &&
        data.work.every((w) => typeof w?.id === 'string' && typeof w?.title === 'string' && DAY.test(w?.start) && DAY.test(w?.end))))
  );
}
