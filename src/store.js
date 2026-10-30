import { defaultLinks, defaultSettings } from './defaults.js';

export const state = {
  notes: [],
  tasks: [],
  links: [],
  settings: defaultSettings(),
  streak: { days: 0, last: '' },
  bloom: { days: 0, last: '' },
  work: [],
  meetings: { at: 0, list: [] },
};

const timers = {};
const remote = new Set();
const failed = new Set();

export async function load() {
  const saved = await chrome.storage.local.get(['notes', 'tasks', 'links', 'settings', 'streak', 'bloom', 'work', 'meetings']);
  Object.assign(state, saved);
  state.links = saved.links ?? defaultLinks();
  state.settings = { ...defaultSettings(), ...saved.settings };
}

function write(key) {
  delete timers[key];
  chrome.storage.local.set({ [key]: state[key] }).catch((e) => failed.forEach((fn) => fn(e)));
}

export function save(key) {
  clearTimeout(timers[key]);
  timers[key] = setTimeout(write, 250, key);
}

export function flush() {
  for (const key of Object.keys(timers)) {
    clearTimeout(timers[key]);
    write(key);
  }
}

export const onRemote = (fn) => remote.add(fn);
export const onSaveFailed = (fn) => failed.add(fn);

// shortcut: per-key last write wins across tabs, fine for one person; upgrade to per-note merge if two tabs edit one note.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  for (const [key, { newValue }] of Object.entries(changes)) {
    if (!(key in state) || key in timers) continue;
    if (JSON.stringify(newValue) === JSON.stringify(state[key])) continue;
    state[key] = newValue ?? state[key];
    remote.forEach((fn) => fn(key));
  }
});
