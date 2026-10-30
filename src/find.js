// Quick search: one box for links, recent docs, notes, actions and the web.

import { state } from './store.js';
import { rankFind, safeUrl, webTarget } from './lib.js';
import { faviconUrl } from './favicon.js';
import { recentDocs } from './agenda.js';
import { openNote } from './notes.js';

const SHOWN = 8;
const dialog = document.getElementById('find-dialog');
const input = document.getElementById('find-input');
const list = document.getElementById('find-list');
let actions = [];
let rows = [];
let at = 0;

const noteTitle = (body) => body.trim().split('\n')[0].replace(/^[#>*\-\s]+/, '').slice(0, 80) || 'Note';

const docItems = () => recentDocs().map((d) => ({ title: d.title, sub: 'Recent doc', icon: `assets/icons/${d.icon}`, url: d.url }));

function searchable() {
  const links = state.links.flatMap((g) =>
    g.items.flatMap((i) => {
      const url = safeUrl(i.url);
      return url ? [{ title: i.name, sub: g.title, icon: i.icon || i.favicon || faviconUrl(url), url }] : [];
    }),
  );
  const notes = state.notes
    .filter((n) => n.body.trim())
    .map((n) => ({ title: noteTitle(n.body), sub: 'Note', body: n.body, symbol: 'i-note', run: () => openNote(n.id) }));
  return [...docItems(), ...links, ...notes, ...actions];
}

function marked(text, query) {
  const span = document.createElement('span');
  const hit = query ? text.toLowerCase().indexOf(query) : -1;
  if (hit < 0) {
    span.textContent = text;
    return span;
  }
  const mark = document.createElement('mark');
  mark.textContent = text.slice(hit, hit + query.length);
  span.append(text.slice(0, hit), mark, text.slice(hit + query.length));
  return span;
}

function paintActive() {
  [...list.children].forEach((el, i) => {
    el.classList.toggle('is-on', i === at);
    el.setAttribute('aria-selected', i === at);
  });
  input.setAttribute('aria-activedescendant', `find-${at}`);
  list.children[at]?.scrollIntoView({ block: 'nearest' });
}

function rowEl(item, i, query) {
  const el = document.createElement('div');
  el.className = 'find-row';
  el.id = `find-${i}`;
  el.setAttribute('role', 'option');
  if (item.icon) {
    const img = document.createElement('img');
    img.src = item.icon;
    img.alt = '';
    el.append(img);
  } else {
    el.insertAdjacentHTML('beforeend', `<svg><use href="#${item.symbol}"/></svg>`);
  }
  const sub = document.createElement('small');
  sub.textContent = item.sub;
  el.append(marked(item.title, query), sub);
  el.onpointermove = () => {
    at = i;
    paintActive();
  };
  el.onclick = (e) => go(item, e.ctrlKey || e.metaKey);
  return el;
}

function paint() {
  const query = input.value.trim().toLowerCase();
  rows = query
    ? [...rankFind(searchable(), query, SHOWN - 1), { ...webTarget(input.value.trim()), sub: 'Web', symbol: 'i-search' }]
    : [...docItems(), ...actions].slice(0, SHOWN);
  at = 0;
  list.replaceChildren(...rows.map((item, i) => rowEl(item, i, query)));
  paintActive();
}

function go(item, newTab) {
  dialog.close();
  if (item.run) item.run();
  else if (newTab) window.open(item.url, '_blank', 'noopener');
  else location.href = item.url;
}

export function openFind() {
  input.value = '';
  paint();
  dialog.showModal();
}

export function initFind(list) {
  actions = list.map((a) => ({ ...a, sub: 'Action' }));
}

input.addEventListener('input', paint);
input.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    at = (at + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
    paintActive();
  } else if (e.key === 'Enter' && rows[at]) {
    e.preventDefault();
    go(rows[at], e.ctrlKey || e.metaKey);
  }
});
