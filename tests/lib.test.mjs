// Run: node --test tests/lib.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown as md } from '../src/markdown.js';
import { meetingsBetween } from '../src/ics.js';
import { defaultLinks, upgradeLinks } from '../src/defaults.js';
import { addClip, addSection, importLinks, moveLink, rankFind, timeTheme, webTarget, addToGroup, bloomStage, dayDiff, daysBefore, formatTime, keepTasks, localDay, monthWeeks, nextBloom, noteDay, parseDoc, parseTime, safeUrl, timeAgo, validBackup, weekBars, workProgress, yesterday } from '../src/lib.js';

test('markdown: blocks', () => {
  assert.equal(md('# Hi'), '<h1>Hi</h1>');
  assert.equal(md('a\nb'), '<p>a<br>b</p>');
  assert.equal(md('---'), '<hr>');
  assert.equal(md('> q'), '<blockquote><p>q</p></blockquote>');
  assert.equal(md('```\n<b>\n```'), '<pre><code>&lt;b&gt;</code></pre>');
});

test('markdown: inline', () => {
  assert.equal(md('**b** *i* ~~s~~ `c`'), '<p><strong>b</strong> <em>i</em> <del>s</del> <code>c</code></p>');
  assert.equal(md('snake_case_name 2*3*4'), '<p>snake_case_name 2*3*4</p>');
  assert.equal(md('`**raw**`'), '<p><code>**raw**</code></p>');
});

test('markdown: lists and tables', () => {
  assert.equal(md('- a\n- b'), '<ul><li>a</li><li>b</li></ul>');
  assert.equal(md('1. a\n2. b'), '<ol><li>a</li><li>b</li></ol>');
  assert.equal(md('- a\n  - b\n- c'), '<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>');
  assert.match(md('- [x] done'), /type="checkbox" disabled checked/);
  assert.match(md('| a | b |\n|---|--:|\n| 1 | 2 |'), /<th>a<\/th>.*text-align:right.*<td>1<\/td>/);
});

test('markdown: links stay safe', () => {
  assert.match(md('[x](https://a.co?a=1&b=2)'), /href="https:\/\/a\.co\?a=1&amp;b=2"/);
  assert.match(md('see https://a.co.'), /<a href="https:\/\/a\.co"[^>]*>https:\/\/a\.co<\/a>\./);
  assert.ok(!md('[x](javascript:alert(1))').includes('href'));
  assert.ok(!md('[x](data:text/html,<script>)').includes('<script'));
  assert.ok(!md('<img src=x onerror=alert(1)>').includes('<img'));
  assert.ok(!md('[a"onmouseover="x](https://a.co)').includes('"onmouseover'));
  assert.ok(!md('[t](https://a.co"onclick="x)').includes('"onclick'));
});

test('markdown: odd input does not crash or hang', () => {
  for (const s of ['', '\0', '|', '- ', '```', '> ', '#', '****', '[](', '|-|', '\0' + '0\0']) md(s);
});

test('safeUrl: only http(s)', () => {
  assert.equal(safeUrl('github.com'), 'https://github.com/');
  assert.equal(safeUrl('localhost:3000/x'), 'https://localhost:3000/x');
  assert.equal(safeUrl('http://a.co'), 'http://a.co/');
  for (const bad of ['', null, 'javascript:alert(1)', 'javascript://x', 'file:///c:/x', 'chrome://settings', 'a b']) {
    assert.equal(safeUrl(bad), null, String(bad));
  }
});

test('parseTime', () => {
  assert.equal(parseTime('3pm call'), 900);
  assert.equal(parseTime('call at 3:30 PM'), 930);
  assert.equal(parseTime('12am'), 0);
  assert.equal(parseTime('12pm lunch'), 720);
  assert.equal(parseTime('sync 15:30'), 930);
  assert.equal(parseTime('buy 3 apples'), null);
  assert.equal(parseTime('13pm'), null);
  assert.equal(parseTime('25:00'), null);
});

test('formatTime', () => {
  assert.equal(formatTime(0), '12:00 AM');
  assert.equal(formatTime(930), '3:30 PM');
  assert.equal(formatTime(930, false), '15:30');
});

test('localDay uses local time and yesterday crosses months', () => {
  assert.equal(localDay(new Date(2026, 0, 5, 1)), '2026-01-05');
  assert.equal(yesterday('2026-03-01'), '2026-02-28');
  assert.equal(yesterday('2026-01-01'), '2025-12-31');
});

test('addToGroup dedupes and rejects bad URLs', () => {
  const links = [{ id: 'b', items: [] }];
  assert.ok(addToGroup(links, 'b', { name: 'A', url: 'a.co' }));
  assert.ok(addToGroup(links, 'b', { name: 'A2', url: 'https://a.co/' }));
  assert.deepEqual(links[0].items, [{ name: 'A2', url: 'https://a.co/' }]);
  assert.equal(addToGroup(links, 'b', { name: 'X', url: 'javascript:alert(1)' }), false);
  assert.equal(addToGroup(links, 'nope', { name: 'X', url: 'a.co' }), false);
});

test('addToGroup keeps a favicon and refreshes it on a repeat save', () => {
  const links = [{ id: 'b', items: [] }];
  addToGroup(links, 'b', { name: 'A', url: 'a.co', favicon: 'data:one' });
  assert.equal(links[0].items[0].favicon, 'data:one');
  addToGroup(links, 'b', { name: 'A', url: 'a.co', favicon: '' });
  assert.equal(links[0].items[0].favicon, 'data:one');
  addToGroup(links, 'b', { name: 'A', url: 'a.co', favicon: 'data:two' });
  assert.equal(links[0].items[0].favicon, 'data:two');
});

test('bloom grows once a day and never shrinks', () => {
  const first = nextBloom(undefined, '2026-10-30');
  assert.deepEqual(first, { days: 1, last: '2026-10-30' });
  assert.equal(nextBloom(first, '2026-10-30'), first);
  assert.equal(nextBloom(first, '2026-11-15').days, 2);
});

test('bloomStage', () => {
  assert.equal(bloomStage(0).name, 'Seed');
  assert.equal(bloomStage(1).next, 'Sprout');
  assert.equal(bloomStage(1).daysLeft, 1);
  assert.equal(bloomStage(7).name, 'Bud');
  assert.equal(bloomStage(13).daysLeft, 1);
  assert.equal(bloomStage(14).name, 'Flower');
  assert.equal(bloomStage(100).name, 'Full bloom');
  assert.equal(bloomStage(100).next, null);
  for (let d = 1; d < 60; d++) assert.ok(bloomStage(d).progress > 0 && bloomStage(d).progress <= 1, `day ${d}`);
});

test('keepTasks: finished tasks last a week, unfinished stay', () => {
  const today = '2026-10-30';
  const kept = keepTasks([
    { id: 'open', done: false, day: '2026-01-01' },
    { id: 'recent', done: true, day: daysBefore(today, 7), doneDay: daysBefore(today, 7) },
    { id: 'old', done: true, day: daysBefore(today, 8), doneDay: daysBefore(today, 8) },
  ], today);
  assert.deepEqual(kept.map((t) => t.id), ['open', 'recent']);
});

test('upgradeLinks moves LinkedIn and YouTube to Social and adds new sites once', () => {
  const names = (links, id) => links.find((g) => g.id === id).items.map((i) => i.name);
  const old = [
    { id: 'bookmarks', items: [{ name: 'Mine', url: 'https://a.co/' }] },
    { id: 'extra', items: [{ name: 'YouTube', url: 'https://www.youtube.com/' }, { name: 'Figma', url: 'https://www.figma.com/files/' }] },
  ];
  const links = upgradeLinks(old, 1);
  assert.deepEqual(links.map((g) => g.id), ['bookmarks', 'social', 'extra']);
  assert.ok(names(links, 'social').includes('YouTube'));
  assert.ok(names(links, 'social').includes('LinkedIn'));
  assert.ok(!names(links, 'extra').includes('YouTube'));
  assert.ok(names(links, 'extra').includes('Udemy'));
  assert.deepEqual(names(links, 'bookmarks'), ['Mine']);
});

test('upgradeLinks respects a tile the user removed', () => {
  const names = (links, id) => links.find((g) => g.id === id).items.map((i) => i.name);
  const fromV2 = defaultLinks().filter((g) => g.id !== 'social');
  fromV2.find((g) => g.id === 'extra').items.push({ name: 'LinkedIn', url: 'https://www.linkedin.com/' });
  const links = upgradeLinks(fromV2, 2);
  assert.ok(names(links, 'social').includes('LinkedIn'));
  assert.ok(!names(links, 'social').includes('YouTube'), 'YouTube was not in the list, so it stays out');
  assert.equal(names(links, 'extra').filter((n) => n === 'Udemy').length, 1);
});

test('default links: valid and unique', () => {
  const items = defaultLinks().flatMap((g) => g.items);
  assert.equal(new Set(items.map((i) => i.url)).size, items.length);
  for (const i of items) assert.ok(safeUrl(i.url) && i.icon.startsWith('assets/icons/'), i.name);
});

test('monthWeeks: Monday first, covers the month, no spare week', () => {
  const oct = monthWeeks(2026, 9);
  assert.equal(oct[0][0], '2026-09-28');
  assert.equal(oct.at(-1)[6], '2026-11-01');
  assert.equal(oct.length, 5);
  assert.equal(monthWeeks(2026, 1).length, 5); // Feb 2026 starts on a Sunday
  assert.equal(monthWeeks(2026, 7).length, 6); // Aug 2026 starts on a Saturday, ends on a Monday
  assert.equal(monthWeeks(2027, 1).length, 4); // Feb 2027 is exactly four rows
});

test('dayDiff stays whole across a daylight-saving change', () => {
  assert.equal(dayDiff('2026-03-07', '2026-03-09'), 2);
  assert.equal(dayDiff('2026-10-30', '2026-10-30'), 0);
  assert.equal(dayDiff('2026-12-31', '2027-01-01'), 1);
});

test('weekBars: lanes, clipping and open ends', () => {
  const week = monthWeeks(2026, 9)[4]; // Mon 26 Oct to Sun 1 Nov
  const a = { id: 'a', start: '2026-10-20', end: '2026-10-28' };
  const b = { id: 'b', start: '2026-10-27', end: '2026-11-10' };
  const c = { id: 'c', start: '2026-10-29', end: '2026-10-29' };
  const d = { id: 'd', start: '2026-11-02', end: '2026-11-03' };
  const bars = weekBars([c, b, a, d], week);
  const of = (id) => bars.find((x) => x.item.id === id);
  assert.equal(bars.length, 3);
  assert.deepEqual([of('a').from, of('a').span, of('a').opens, of('a').closes], [0, 3, false, true]);
  assert.deepEqual([of('b').from, of('b').span, of('b').opens, of('b').closes], [1, 6, true, false]);
  assert.equal(of('a').lane, 0);
  assert.equal(of('b').lane, 1);
  assert.equal(of('c').lane, 0, 'a free lane is reused');
});

test('noteDay uses the saved date, else the created date', () => {
  assert.equal(noteDay({ day: '2026-10-05', created: Date.now() }), '2026-10-05');
  assert.equal(noteDay({ created: new Date(2026, 9, 30, 23, 30).getTime() }), '2026-10-30');
});

test('workProgress', () => {
  const job = { start: '2026-10-26', end: '2026-11-03' };
  assert.deepEqual(workProgress(job, '2026-10-30'), { total: 9, done: 5, left: 4, phase: 'active', startsIn: 0 });
  assert.equal(workProgress(job, '2026-10-25').startsIn, 1);
  assert.equal(workProgress(job, '2026-10-25').phase, 'upcoming');
  assert.equal(workProgress(job, '2026-11-04').phase, 'past');
  assert.equal(workProgress({ start: '2026-10-30', end: '2026-10-30' }, '2026-10-30').left, 0);
});

test('validBackup checks the work list when present', () => {
  const base = { notes: [], tasks: [], links: [] };
  assert.ok(validBackup({ ...base, work: [{ id: '1', title: 'x', start: '2026-01-01', end: '2026-01-02' }] }));
  assert.equal(validBackup({ ...base, work: [{ id: '1', title: 'x', start: 'soon', end: '2026-01-02' }] }), false);
  assert.equal(validBackup({ ...base, work: 'nope' }), false);
});

test('addClip: to-do, note with source, learned appends to one daily note', () => {
  const data = { notes: [], tasks: [] };
  const base = { url: 'https://a.co/x', title: 'Chat [1]', day: '2026-10-30', heading: 'What I learned, 30 Oct', now: 5 };
  assert.ok(addClip(data, 'todo', { ...base, id: '1', text: '  call Ravi\nat 3pm  ' }));
  assert.equal(data.tasks[0].text, 'call Ravi at 3pm');
  assert.equal(data.tasks[0].at, 900);
  addClip(data, 'note', { ...base, id: '2', text: 'A message' });
  assert.equal(data.notes[0].body, 'A message\n\n[Chat 1](https://a.co/x)');
  addClip(data, 'learned', { ...base, id: '3', text: 'First' });
  addClip(data, 'learned', { ...base, id: '4', text: 'Second' });
  assert.equal(data.notes.length, 2);
  assert.match(data.notes[1].body, /^# What I learned, 30 Oct\n\n- First \(.*\)\n\n- Second/);
  assert.equal(addClip(data, 'todo', { ...base, id: '5', text: '   ' }), false);
  addClip(data, 'note', { ...base, id: '6', text: 'safe', url: 'javascript:alert(1)' });
  assert.ok(!data.notes.at(-1).body.includes('javascript'));
});

const ICS = (body) => `BEGIN:VCALENDAR\r\n${body.join('\r\n')}\r\nEND:VCALENDAR\r\n`;
const at = (s) => Date.parse(s);

test('ics: single events, time zones, cancelled, all-day, folded lines', () => {
  const text = ICS([
    'BEGIN:VEVENT', 'UID:a', 'SUMMARY:Sync\\, weekly', 'DTSTART:20261030T100000Z', 'DTEND:20261030T103000Z',
    'X-GOOGLE-CONFERENCE:https://meet.google.com/abc-defg-hij', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:b', 'SUMMARY:Local', 'DTSTART;TZID=Asia/Kolkata:20261030T153000', 'DTEND;TZID=Asia/Kolkata:20261030T160000', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:c', 'SUMMARY:Gone', 'STATUS:CANCELLED', 'DTSTART:20261030T110000Z', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:d', 'SUMMARY:Holiday', 'DTSTART;VALUE=DATE:20261030', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:e', 'SUMMARY:Long tit', ' le', 'DTSTART:20261030T120000Z', 'END:VEVENT',
  ]);
  const list = meetingsBetween(text, at('2026-10-30T00:00:00Z'), at('2026-10-31T00:00:00Z'));
  assert.deepEqual(list.map((m) => m.title), ['Sync, weekly', 'Local', 'Long title']);
  assert.equal(list[1].start, at('2026-10-30T10:00:00Z'), 'IST converted to UTC');
  assert.equal(list[0].link, 'https://meet.google.com/abc-defg-hij');
});

test('ics: recurrence', () => {
  const week = ['BEGIN:VEVENT', 'UID:w', 'SUMMARY:Standup', 'DTSTART:20261005T090000Z', 'DTEND:20261005T091500Z', 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR'];
  const from = at('2026-10-26T00:00:00Z');
  const to = at('2026-11-02T00:00:00Z');
  assert.equal(meetingsBetween(ICS([...week, 'END:VEVENT']), from, to).length, 3);

  const fortnight = ['BEGIN:VEVENT', 'UID:f', 'SUMMARY:Review', 'DTSTART:20261005T090000Z', 'RRULE:FREQ=WEEKLY;INTERVAL=2', 'END:VEVENT'];
  assert.equal(meetingsBetween(ICS(fortnight), at('2026-10-12T00:00:00Z'), at('2026-10-18T00:00:00Z')).length, 0);
  assert.equal(meetingsBetween(ICS(fortnight), at('2026-10-19T00:00:00Z'), at('2026-10-25T00:00:00Z')).length, 1);

  const limited = ['BEGIN:VEVENT', 'UID:c', 'SUMMARY:Three', 'DTSTART:20261001T090000Z', 'RRULE:FREQ=DAILY;COUNT=3', 'END:VEVENT'];
  assert.equal(meetingsBetween(ICS(limited), at('2026-10-01T00:00:00Z'), at('2026-10-10T00:00:00Z')).length, 3);

  const ended = ['BEGIN:VEVENT', 'UID:u', 'SUMMARY:Ended', 'DTSTART:20261001T090000Z', 'RRULE:FREQ=DAILY;UNTIL=20261003T235959Z', 'END:VEVENT'];
  assert.equal(meetingsBetween(ICS(ended), at('2026-10-02T00:00:00Z'), at('2026-10-10T00:00:00Z')).length, 2);

  const skipped = [...week, 'EXDATE:20261028T090000Z', 'END:VEVENT'];
  assert.equal(meetingsBetween(ICS(skipped), from, to).length, 2);

  const moved = ICS([...week, 'END:VEVENT', 'BEGIN:VEVENT', 'UID:w', 'SUMMARY:Standup moved', 'RECURRENCE-ID:20261028T090000Z', 'DTSTART:20261028T140000Z', 'END:VEVENT']);
  const list = meetingsBetween(moved, from, to);
  assert.equal(list.length, 3);
  assert.ok(list.some((m) => m.title === 'Standup moved'));

  const monthly = ['BEGIN:VEVENT', 'UID:m', 'SUMMARY:Second Tuesday', 'DTSTART:20261013T090000Z', 'RRULE:FREQ=MONTHLY;BYDAY=2TU', 'END:VEVENT'];
  const nov = meetingsBetween(ICS(monthly), at('2026-11-01T00:00:00Z'), at('2026-12-01T00:00:00Z'));
  assert.equal(nov[0].start, at('2026-11-10T09:00:00Z'));
});

test('ics: garbage input gives no meetings', () => {
  for (const text of ['', 'nonsense', 'BEGIN:VEVENT', 'BEGIN:VEVENT\nDTSTART:bad\nEND:VEVENT']) assert.deepEqual(meetingsBetween(text, 0, 1e13), []);
});

test('timeTheme: light 7 AM to before 7 PM', () => {
  const at = (h, m = 0) => timeTheme(new Date(2026, 9, 30, h, m));
  assert.deepEqual([at(6, 59), at(7), at(18, 59), at(19), at(0)], ['dark', 'light', 'light', 'dark', 'dark']);
});

test('addClip without a link stores only the text', () => {
  const data = { notes: [], tasks: [] };
  const base = { title: 'Page', day: '2026-10-30', heading: 'What I learned, 30 Oct', now: 5 };
  addClip(data, 'note', { ...base, id: '1', text: 'Plain' });
  assert.equal(data.notes[0].body, 'Plain');
  addClip(data, 'learned', { ...base, id: '2', text: 'Fact' });
  assert.match(data.notes[1].body, /- Fact\n$/);
});

test('addSection: goes after text sections, same name reuses it', () => {
  const links = [{ id: 'bookmarks', title: 'Bookmarks', style: 'text', items: [] }, { id: 'workspace', title: 'Google Workspace', items: [] }];
  const first = addSection(links, ' Certificates ', 'a');
  assert.deepEqual(links.map((g) => g.id), ['bookmarks', 'a', 'workspace']);
  assert.equal(first.title, 'Certificates');
  assert.equal(addSection(links, 'certificates', 'b'), first);
  addSection(links, 'Documents', 'c');
  assert.deepEqual(links.map((g) => g.id), ['bookmarks', 'a', 'c', 'workspace']);
});

test('validBackup', () => {
  assert.ok(validBackup({ notes: [{ id: '1', body: '' }], tasks: [], links: [{ id: 'b', items: [] }] }));
  for (const bad of [null, {}, { notes: [], tasks: [] }, { notes: [{}], tasks: [], links: [] }]) {
    assert.equal(validBackup(bad), false);
  }
});

test('parseDoc', () => {
  const doc = (url) => parseDoc(url, 'Plan - Google Docs');
  assert.deepEqual(doc('https://docs.google.com/document/d/abc/edit'), { id: 'abc', title: 'Plan', url: 'https://docs.google.com/document/d/abc/edit', icon: 'docs.png' });
  assert.equal(doc('https://docs.google.com/document/u/1/d/abc/edit').id, 'abc');
  assert.equal(doc('https://docs.google.com/a/example.com/document/d/abc/edit').id, 'abc');
  assert.equal(doc('https://docs.google.com/forms/d/e/1FAI/viewform').id, '1FAI');
  assert.deepEqual(
    parseDoc('https://drive.google.com/file/d/xyz/view', 'dk.png - Google Drive'),
    { id: 'xyz', title: 'dk.png', url: 'https://drive.google.com/file/d/xyz/view', icon: 'drive.svg' },
  );
  for (const skip of ['https://docs.google.com/document/u/0/', 'https://drive.google.com/drive/folders/abc', 'https://evil.com/docs.google.com/document/d/abc']) {
    assert.equal(doc(skip), null);
  }
  assert.equal(parseDoc('https://docs.google.com/document/d/abc/edit', ''), null);
});

test('timeAgo', () => {
  const now = 1e12;
  assert.equal(timeAgo(now - 30e3, now), 'Just now');
  assert.equal(timeAgo(now - 5 * 60e3, now), '5m ago');
  assert.equal(timeAgo(now - 3 * 36e5, now), '3h ago');
  assert.equal(timeAgo(now - 2 * 864e5, now), '2d ago');
});

test('importLinks', () => {
  const links = defaultLinks();
  let n = 0;
  const result = importLinks(links, [
    { url: 'example.com' },
    { name: ' Hub ', url: 'https://github.com/', section: 'Work' },
    { name: 'Again', url: 'https://github.com/', section: 'work' },
    { url: 'javascript:alert(1)', section: 'Bad' },
    { name: 'No address' },
    null,
  ], () => `id${++n}`);
  assert.deepEqual(result, { added: 2, existing: 1, skipped: 3 });
  assert.deepEqual(links.find((g) => g.id === 'bookmarks').items, [{ name: 'example.com', url: 'https://example.com/' }]);
  const work = links.find((g) => g.title === 'Work');
  assert.deepEqual(work.items, [{ name: 'Hub', url: 'https://github.com/' }]);
  assert.equal(links.some((g) => g.title === 'Bad'), false);
  for (const bad of [null, {}, 'x']) assert.equal(importLinks(links, bad, () => 'x'), null);
});

test('rankFind', () => {
  const items = [
    { title: 'Note', sub: 'Note', body: 'call the gym' },
    { title: 'Big gym plan' },
    { title: 'Algymra' },
    { title: 'Gym' },
    { title: 'Other' },
  ];
  assert.deepEqual(rankFind(items, ' GYM ', 8).map((i) => i.title), ['Gym', 'Big gym plan', 'Algymra', 'Note']);
  assert.equal(rankFind(items, 'gym', 2).length, 2);
});

test('webTarget', () => {
  assert.equal(webTarget('github.com/x').url, 'https://github.com/x');
  assert.equal(webTarget('a b&c').url, 'https://www.google.com/search?q=a%20b%26c');
  assert.match(webTarget('node.js tutorial').url, /google/);
});

test('moveLink', () => {
  const make = () => [
    { id: 'a', items: [{ url: 'https://1.io' }, { url: 'https://2.io' }, { url: 'https://3.io' }] },
    { id: 'b', custom: true, items: [{ url: 'https://4.io' }] },
  ];
  const order = (g) => g.items.map((i) => i.url.slice(8, 9)).join('');
  let links = make();
  assert.ok(moveLink(links, 'a', 0, 'a', 2));
  assert.equal(order(links[0]), '213');
  links = make();
  assert.ok(moveLink(links, 'a', 2, 'a', 0));
  assert.equal(order(links[0]), '312');
  links = make();
  assert.ok(moveLink(links, 'a', 0, 'a', Infinity));
  assert.equal(order(links[0]), '231');
  links = make();
  assert.equal(moveLink(links, 'a', 1, 'a', 1), false);
  assert.equal(moveLink(links, 'a', 1, 'a', 2), false);
  assert.ok(moveLink(links, 'b', 0, 'a', 1));
  assert.equal(order(links[0]), '1423');
  assert.equal(links.length, 1);
  links = make();
  links[1].items.push({ url: 'https://1.io' });
  assert.equal(moveLink(links, 'a', 0, 'b', 0), false);
});
