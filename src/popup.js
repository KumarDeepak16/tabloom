import { defaultLinks } from './defaults.js';
import { faviconUrl, saveFavicon } from './favicon.js';
import { addToGroup, safeUrl } from './lib.js';

const $ = (id) => document.getElementById(id);

const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
const url = safeUrl(tab?.url);
const { links: saved } = await chrome.storage.local.get('links');
const links = saved ?? defaultLinks();
let target = 'bookmarks';

if (!url) {
  $('form').hidden = true;
  $('blocked').hidden = false;
} else {
  $('name').value = (tab.title || new URL(url).hostname).slice(0, 60);
  $('fav').src = faviconUrl(url);

  const paint = () => {
    for (const btn of $('groups').children) btn.setAttribute('aria-pressed', btn.dataset.id === target);
  };
  for (const group of links) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn is-small';
    btn.dataset.id = group.id;
    btn.textContent = group.title;
    btn.onclick = () => {
      target = group.id;
      paint();
    };
    $('groups').append(btn);
  }
  paint();

  $('name').select();
  $('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('name').value.trim();
    if (!name) {
      $('error').textContent = 'Enter a name for this link.';
      $('error').hidden = false;
      return;
    }
    try {
      const favicon = await saveFavicon(url);
      // Re-read so a save from a new tab a moment ago is not overwritten.
      const { links: latest } = await chrome.storage.local.get('links');
      const next = latest ?? links;
      addToGroup(next, target, { name, url, favicon });
      await chrome.storage.local.set({ links: next });
      $('save').textContent = 'Saved';
      setTimeout(close, 650);
    } catch {
      $('error').textContent = 'Could not save this link. Try again.';
      $('error').hidden = false;
    }
  });
}
