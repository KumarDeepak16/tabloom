import './compat.js';
// Save window: the toolbar popup, or a small window opened by the right-click menu with ?url=&title=.

import { defaultLinks } from './defaults.js';
import { faviconUrl, saveFavicon } from './favicon.js';
import { addSection, addToGroup, safeUrl } from './lib.js';

const NEW_SECTION = 'new';
const $ = (id) => document.getElementById(id);

const params = new URLSearchParams(location.search);
const [tab] = params.has('url')
  ? [{ url: params.get('url'), title: params.get('title') }]
  : await chrome.tabs.query({ active: true, currentWindow: true });
const url = safeUrl(tab?.url);
const { links: saved } = await chrome.storage.local.get('links');
const links = saved ?? defaultLinks();
let target = 'bookmarks';

function fail(message, input) {
  $('error').textContent = message;
  $('error').hidden = false;
  input?.focus();
}

function chip(id, label) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn is-small';
  btn.dataset.id = id;
  btn.textContent = label;
  btn.onclick = () => {
    target = id;
    paint();
    if (id === NEW_SECTION) $('section-name').focus();
  };
  $('groups').append(btn);
}

function paint() {
  for (const btn of $('groups').children) btn.setAttribute('aria-pressed', btn.dataset.id === target);
  $('section-row').hidden = target !== NEW_SECTION;
}

if (!url) {
  $('form').hidden = true;
  $('blocked').hidden = false;
} else {
  $('name').value = (tab.title || new URL(url).hostname).slice(0, 60);
  $('fav').src = faviconUrl(url);
  links.forEach((group) => chip(group.id, group.title));
  chip(NEW_SECTION, 'New section');
  paint();

  $('name').select();
  $('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('name').value.trim();
    const section = $('section-name').value.trim();
    if (!name) return fail('Enter a name for this link.', $('name'));
    if (target === NEW_SECTION && !section) return fail('Enter a name for the new section.', $('section-name'));
    try {
      const favicon = await saveFavicon(url);
      // Re-read so a save from a new tab a moment ago is not overwritten.
      const { links: latest } = await chrome.storage.local.get('links');
      const next = latest ?? links;
      const groupId = target === NEW_SECTION ? addSection(next, section, crypto.randomUUID()).id : target;
      addToGroup(next, groupId, { name, url, favicon });
      await chrome.storage.local.set({ links: next });
      $('save').textContent = 'Saved';
      setTimeout(close, 650);
    } catch {
      fail('Could not save this link. Try again.');
    }
  });
}
