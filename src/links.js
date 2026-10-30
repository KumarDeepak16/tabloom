import { state, save, flush } from './store.js';
import { allBookmarks, defaultLinks } from './defaults.js';
import { faviconUrl, remoteFavicon, saveFavicon } from './favicon.js';
import { addToGroup, importLinks, localDay, moveLink, safeUrl } from './lib.js';
import { downloadJson, openMenu, toast } from './ui.js';

const HUES = ['pink', 'blue', 'green', 'orange', 'purple', 'yellow'];
const groupsEl = document.getElementById('groups');
const dialog = document.getElementById('link-dialog');
const form = document.getElementById('link-form');
const fields = {
  title: document.getElementById('link-title'),
  name: document.getElementById('link-name'),
  url: document.getElementById('link-url'),
  icon: document.getElementById('link-icon'),
  iconRow: document.getElementById('link-icon-row'),
  error: document.getElementById('link-error'),
};
let editing = null;

function button(label, onclick) {
  const btn = document.createElement('button');
  btn.className = 'btn is-small is-square';
  btn.setAttribute('aria-label', label);
  btn.dataset.tip = label;
  btn.innerHTML = '<svg><use href="#i-plus"/></svg>';
  btn.onclick = onclick;
  return btn;
}

function iconImg(item, url) {
  const img = document.createElement('img');
  img.src = item.icon || item.favicon || (url ? faviconUrl(url) : '');
  img.alt = '';
  img.decoding = 'async';
  img.onerror = () => {
    if (!url) return;
    if (img.src !== faviconUrl(url)) img.src = faviconUrl(url);
    else img.src = remoteFavicon(url);
  };
  return img;
}

function linkEl(group, item, index) {
  const url = safeUrl(item.url);
  const a = document.createElement('a');
  if (url) a.href = url;
  a.draggable = true;
  a.oncontextmenu = (e) => {
    e.preventDefault();
    showMenu(e.clientX, e.clientY, group, item);
  };

  if (group.style === 'text') {
    a.className = 'mark';
    a.style.setProperty('--hue', `var(--${HUES[index % HUES.length]}-edge)`);
    a.title = item.name;
    const label = document.createElement('span');
    label.textContent = item.name;
    a.append(iconImg(item, url), label);
    return a;
  }

  a.className = 'tile';
  a.dataset.tip = item.name;
  a.setAttribute('aria-label', item.name);
  a.append(iconImg(item, url));
  return a;
}

function showMenu(x, y, group, item) {
  const items = [];
  if (safeUrl(item.new)) items.push({ label: item.newLabel, run: () => (location.href = safeUrl(item.new)) });
  const at = group.items.indexOf(item);
  if (at > 0) items.push({ label: 'Move earlier', run: () => move(group.id, at, group.id, at - 1) });
  if (at < group.items.length - 1) items.push({ label: 'Move later', run: () => move(group.id, at, group.id, at + 2) });
  items.push({ label: 'Edit', run: () => openDialog(group, item) });
  items.push({ label: 'Remove', run: () => removeItem(group, item) });
  openMenu(x, y, items);
}

function move(fromId, from, toId, at) {
  if (moveLink(state.links, fromId, from, toId, at)) commit();
  else if (fromId !== toId) toast('That link is already in this section');
}

function removeItem(group, item) {
  const at = group.items.indexOf(item);
  if (at < 0) return;
  const position = state.links.indexOf(group);
  group.items.splice(at, 1);
  // A section the user made goes away with its last link.
  if (group.custom && !group.items.length) state.links.splice(position, 1);
  commit();
  toast(`${item.name} removed`, {
    label: 'Undo',
    run: () => {
      if (!state.links.includes(group)) state.links.splice(position, 0, group);
      group.items.splice(at, 0, item);
      commit();
    },
  });
}

// Written at once: the service worker and popup also write links, and a delayed write here would undo theirs.
function commit() {
  save('links');
  flush();
  renderLinks();
}

export function renderLinks() {
  groupsEl.replaceChildren(
    ...state.links.map((group) => {
      const section = document.createElement('section');
      section.className = `group${group.id === 'ai' ? ' push' : ''}`;
      section.dataset.group = group.id;
      section.style.setProperty('--hue', `var(--${group.hue}-edge)`);

      const head = document.createElement('div');
      head.className = 'group-head';
      const title = document.createElement('h2');
      title.textContent = group.title;
      head.append(title, button(`Add to ${group.title}`, () => openDialog(group)));

      const list = document.createElement('ul');
      list.className = group.style === 'text' ? 'marks' : 'tiles';
      group.items.forEach((item, i) => {
        const li = document.createElement('li');
        li.dataset.at = i;
        li.append(linkEl(group, item, i));
        list.append(li);
      });

      section.append(head);
      if (group.style === 'text' && !group.items.length) {
        const empty = document.createElement('p');
        empty.className = 'marks-empty';
        empty.textContent = 'Add links with the plus, or save any site with Alt+Shift+S.';
        section.append(empty);
      } else {
        section.append(list);
      }
      return section;
    }),
  );
}

// Drag a link to reorder it or carry it to another section.
let dragged = null;

function clearDrop() {
  groupsEl.querySelectorAll('.drop-here, .is-dragging').forEach((el) => el.classList.remove('drop-here', 'is-dragging'));
}

groupsEl.addEventListener('dragstart', (e) => {
  const li = e.target.closest('li[data-at]');
  if (!li) return;
  dragged = { group: li.closest('.group').dataset.group, at: Number(li.dataset.at) };
  e.dataTransfer.effectAllowed = 'move';
  // Next frame, so the drag picture keeps full color.
  requestAnimationFrame(() => li.classList.add('is-dragging'));
});

groupsEl.addEventListener('dragover', (e) => {
  const section = e.target.closest('.group');
  if (!dragged || !section) return;
  e.preventDefault();
  const spot = e.target.closest('li[data-at]') ?? section;
  if (spot.classList.contains('drop-here')) return;
  groupsEl.querySelectorAll('.drop-here').forEach((el) => el.classList.remove('drop-here'));
  spot.classList.add('drop-here');
});

groupsEl.addEventListener('drop', (e) => {
  const section = e.target.closest('.group');
  if (!dragged || !section) return;
  e.preventDefault();
  const li = e.target.closest('li[data-at]');
  move(dragged.group, dragged.at, section.dataset.group, li ? Number(li.dataset.at) : Infinity);
  dragged = null;
  clearDrop();
});

groupsEl.addEventListener('dragend', () => {
  dragged = null;
  clearDrop();
});

function openDialog(group, item) {
  editing = { group, item };
  fields.title.textContent = item ? `Edit ${item.name}` : `Add to ${group.title}`;
  fields.name.value = item?.name ?? '';
  fields.url.value = item?.url ?? '';
  fields.icon.value = item?.icon?.startsWith('http') ? item.icon : '';
  fields.iconRow.hidden = group.style === 'text';
  fields.error.hidden = true;
  dialog.showModal();
  fields.name.focus();
}

function fail(message, input) {
  fields.error.textContent = message;
  fields.error.hidden = false;
  input.focus();
}

async function storeFavicon(item) {
  const favicon = await saveFavicon(item.url);
  item.favicon = favicon;
  commit();
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = fields.name.value.trim();
  const url = safeUrl(fields.url.value);
  const rawIcon = fields.icon.value.trim();
  const icon = rawIcon ? safeUrl(rawIcon) : '';
  if (!name) return fail('Enter a name for this link.', fields.name);
  if (!url) return fail('Enter a full web address, like example.com.', fields.url);
  if (rawIcon && !icon) return fail('Enter an icon address that starts with https://.', fields.icon);

  const { group, item } = editing;
  let saved = item;
  if (item) {
    const moved = safeUrl(item.url) !== url;
    item.name = name;
    item.url = url;
    if (icon) item.icon = icon;
    else if (item.icon?.startsWith('http')) delete item.icon;
    if (moved) delete item.favicon;
  } else {
    addToGroup(state.links, group.id, { name, url, icon });
    saved = group.items.find((i) => safeUrl(i.url) === url);
  }
  dialog.close();
  commit();
  if (!saved.icon?.startsWith('assets/') && !saved.favicon) storeFavicon(saved);
});

document.getElementById('link-cancel').onclick = () => dialog.close();

// Links saved before favicons were kept get theirs once, in the background.
export async function backfillFavicons() {
  const missing = state.links.flatMap((g) => g.items).filter((i) => !i.icon && !('favicon' in i) && safeUrl(i.url));
  for (const item of missing) item.favicon = await saveFavicon(item.url);
  if (missing.length) commit();
}

// Adds back anything removed, keeps everything the user added.
export function restoreLinks() {
  defaultLinks().forEach((fresh, at) => {
    const group = state.links.find((g) => g.id === fresh.id);
    if (!group) state.links.splice(at, 0, fresh);
    else for (const item of fresh.items) if (!group.items.some((i) => i.url === item.url)) group.items.push(item);
  });
  commit();
  toast('Default links restored');
}

const LINKS_FORMAT = [
  { name: 'Tabloom', url: 'https://tabloom.1619.in/', section: 'Bookmarks' },
  { name: 'GitHub', url: 'https://github.com/', section: 'Work' },
  { name: 'MDN', url: 'https://developer.mozilla.org/', section: 'Work' },
  { url: 'https://www.wikipedia.org/' },
];

const linksFile = document.getElementById('links-file');
document.getElementById('links-format').onclick = () => downloadJson('tabloom-links-format.json', LINKS_FORMAT);
document.getElementById('links-import').onclick = () => linksFile.click();
document.getElementById('links-export').onclick = () => {
  const rows = state.links.flatMap((g) => g.items.map((i) => ({ name: i.name, url: i.url, section: g.title })));
  downloadJson(`tabloom-links-${localDay()}.json`, rows);
};

async function readRows(file) {
  const text = await file.text();
  if (/\.html?$/i.test(file.name)) {
    // A browser's bookmarks export. All of it lands in Bookmarks: a section per folder would flood the sidebar.
    const anchors = new DOMParser().parseFromString(text, 'text/html').querySelectorAll('a[href]');
    return [...anchors].map((a) => ({ name: a.textContent, url: a.getAttribute('href') }));
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

linksFile.onchange = async () => {
  const [file] = linksFile.files;
  linksFile.value = '';
  if (!file) return;
  const before = structuredClone(state.links);
  const result = importLinks(state.links, await readRows(file), () => crypto.randomUUID());
  if (!result) return toast('That file is not a list of links. Use Download format to see the layout.');
  const { added, existing, skipped } = result;
  const parts = [`${added} ${added === 1 ? 'link' : 'links'} added`];
  if (existing) parts.push(`${existing} already here`);
  if (skipped) parts.push(`${skipped} without a valid address`);
  commit();
  const undo = { label: 'Undo', run: () => { state.links = before; commit(); } };
  toast(parts.join(', '), added ? undo : undefined);
  backfillFavicons();
};

// Browser bookmark picker
const pickDialog = document.getElementById('pick-dialog');
const pickFilter = document.getElementById('pick-filter');
const pickList = document.getElementById('pick-list');
const pickAdd = document.getElementById('pick-add');
const pickAll = document.getElementById('pick-all');
let pickable = [];
const picked = new Set();

function paintPickCount() {
  pickAdd.textContent = picked.size === 1 ? 'Add 1 bookmark' : `Add ${picked.size} bookmarks`;
  pickAdd.disabled = picked.size === 0;
}

function pickMatches() {
  const q = pickFilter.value.trim().toLowerCase();
  return pickable.filter((b) => !q || `${b.name} ${b.url} ${b.folder}`.toLowerCase().includes(q));
}

function paintPicks() {
  const matches = pickMatches();
  pickAll.textContent = matches.length && matches.every((b) => picked.has(b.url)) ? 'Clear all' : 'Select all';
  pickAll.disabled = matches.length === 0;
  // shortcut: draws the first 200 rows only, Select all still covers every match; virtualize if lists get huge.
  const rows = matches
    .slice(0, 200)
    .map((b) => {
      const row = document.createElement('label');
      row.className = 'pick';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = picked.has(b.url);
      box.onchange = () => {
        if (box.checked) picked.add(b.url);
        else picked.delete(b.url);
        paintPickCount();
        paintPicks();
      };
      const img = document.createElement('img');
      img.src = faviconUrl(b.url, 32);
      img.alt = '';
      img.loading = 'lazy';
      const name = document.createElement('span');
      name.textContent = b.name;
      const folder = document.createElement('small');
      folder.textContent = b.folder;
      row.append(box, img, name, folder);
      return row;
    });
  if (rows.length) return pickList.replaceChildren(...rows);
  const empty = document.createElement('p');
  empty.className = 'hint';
  empty.textContent = pickable.length ? 'No bookmarks match that search.' : 'No new bookmarks to add from this browser.';
  pickList.replaceChildren(empty);
}

export async function openPicker() {
  const have = new Set(state.links.find((g) => g.id === 'bookmarks').items.map((i) => safeUrl(i.url)));
  pickable = (await allBookmarks()).filter((b) => safeUrl(b.url) && !have.has(safeUrl(b.url)));
  picked.clear();
  pickFilter.value = '';
  paintPicks();
  paintPickCount();
  pickDialog.showModal();
  pickFilter.focus();
}

pickFilter.addEventListener('input', paintPicks);
pickAll.onclick = () => {
  const matches = pickMatches();
  const clearing = matches.every((b) => picked.has(b.url));
  for (const b of matches) {
    if (clearing) picked.delete(b.url);
    else picked.add(b.url);
  }
  paintPicks();
  paintPickCount();
};
document.getElementById('pick-cancel').onclick = () => pickDialog.close();
pickAdd.onclick = async () => {
  const chosen = pickable.filter((b) => picked.has(b.url));
  pickDialog.close();
  chosen.forEach((b) => addToGroup(state.links, 'bookmarks', b));
  commit();
  toast(chosen.length === 1 ? 'Bookmark added' : `${chosen.length} bookmarks added`);
  backfillFavicons();
};
