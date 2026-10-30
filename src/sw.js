import { barBookmarks, defaultLinks, upgradeLinks, welcomeNote } from './defaults.js';
import { saveFavicon } from './favicon.js';
import { addClip, addToGroup, localDay } from './lib.js';

const LINKS_VERSION = 3;
const CLIP_MENU = [['note', 'Notes'], ['learned', 'What I learned'], ['todo', 'To-do']];

chrome.runtime.onInstalled.addListener(async () => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'tabloom', title: 'Add to Tabloom', contexts: ['selection'] });
    for (const [id, title] of CLIP_MENU) chrome.contextMenus.create({ id, parentId: 'tabloom', title, contexts: ['selection'] });
  });

  const { links, notes, linksVersion = 1 } = await chrome.storage.local.get(['links', 'notes', 'linksVersion']);
  if (!links) {
    const seeded = defaultLinks();
    for (const item of await barBookmarks().catch(() => [])) addToGroup(seeded, 'bookmarks', item);
    await chrome.storage.local.set({ links: seeded, notes: notes ?? [welcomeNote()], linksVersion: LINKS_VERSION });
    return;
  }
  // A stored marker, not the install reason, because it holds however the extension was reloaded.
  if (linksVersion < LINKS_VERSION) {
    await chrome.storage.local.set({ links: upgradeLinks(links, linksVersion), linksVersion: LINKS_VERSION });
  }
});

// A file import fires onCreated once per bookmark, so ignore those.
let importing = false;
chrome.bookmarks.onImportBegan.addListener(() => (importing = true));
chrome.bookmarks.onImportEnded.addListener(() => (importing = false));

async function mirror(node) {
  const { settings } = await chrome.storage.local.get('settings');
  if (settings?.mirror === false) return;
  const favicon = await saveFavicon(node.url);
  const { links } = await chrome.storage.local.get('links');
  const next = links ?? defaultLinks();
  if (addToGroup(next, 'bookmarks', { name: node.title || new URL(node.url).hostname, url: node.url, favicon })) {
    await chrome.storage.local.set({ links: next });
  }
}

// One at a time: each save reads then writes the whole list, so overlapping saves would drop bookmarks.
let queue = Promise.resolve();

async function clip(kind, info, tab) {
  const { notes = [], tasks = [] } = await chrome.storage.local.get(['notes', 'tasks']);
  const now = new Date();
  const heading = `What I learned, ${new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(now)}`;
  const added = addClip({ notes, tasks }, kind, {
    text: info.selectionText ?? '',
    url: info.pageUrl,
    title: tab?.title,
    day: localDay(now),
    heading,
    now: now.getTime(),
    id: crypto.randomUUID(),
  });
  if (!added) return;
  await chrome.storage.local.set({ notes, tasks });
  if (tab?.id == null) return;
  // A small tick on the toolbar icon is the only confirmation: the page stays untouched.
  await chrome.action.setBadgeBackgroundColor({ color: '#46a302', tabId: tab.id });
  await chrome.action.setBadgeText({ text: '✓', tabId: tab.id });
  setTimeout(() => chrome.action.setBadgeText({ text: '', tabId: tab.id }).catch(() => {}), 2200);
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!CLIP_MENU.some(([id]) => id === info.menuItemId)) return;
  queue = queue.then(() => clip(info.menuItemId, info, tab)).catch(() => {});
});

chrome.bookmarks.onCreated.addListener((_id, node) => {
  if (importing || !node.url) return;
  queue = queue.then(() => mirror(node)).catch(() => {});
});
