// Background image. A link is kept in settings; an upload goes to IndexedDB, which handles
// large files, and settings.photo holds "upload:<time>" so other open tabs notice the change.

import { state, save } from './store.js';
import { safeUrl } from './lib.js';
import { toast } from './ui.js';

const MAX_BYTES = 15 * 1024 * 1024;
const DB = 'tabula';
const STORE = 'files';
const KEY = 'background';

const box = document.getElementById('photo');
const img = box.querySelector('img');
let objectUrl = '';
let shown = '';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(mode, action) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = action(tx.objectStore(STORE));
    tx.oncomplete = () => {
      db.close();
      resolve(req.result);
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });
}

function clear() {
  box.hidden = true;
  img.removeAttribute('src');
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = '';
  shown = '';
}

export function applyPhotoLook() {
  const { blur, dim } = state.settings;
  box.style.setProperty('--photo-blur', `${blur}px`);
  box.style.setProperty('--photo-dim', dim / 100);
}

export async function applyPhoto() {
  const { photo } = state.settings;
  applyPhotoLook();
  if (photo === shown) return;
  clear();
  if (!photo) return;

  if (photo.startsWith('upload:')) {
    const blob = await run('readonly', (s) => s.get(KEY)).catch(() => null);
    // A restored backup can point at an upload this browser does not have.
    if (!blob) return;
    objectUrl = URL.createObjectURL(blob);
    img.src = objectUrl;
  } else {
    const url = safeUrl(photo);
    if (!url) return;
    img.src = url;
  }
  shown = photo;
  box.hidden = false;
}

img.addEventListener('error', () => {
  if (!img.getAttribute('src')) return;
  clear();
  toast('That image could not be loaded. Check the link.');
});

export async function uploadPhoto(file) {
  if (!file.type.startsWith('image/')) return toast('Choose an image file.');
  if (file.size > MAX_BYTES) return toast('Choose an image under 15 MB.');
  try {
    await run('readwrite', (s) => s.put(file, KEY));
  } catch {
    return toast('Could not save that image. Try a smaller file.');
  }
  state.settings.photo = `upload:${Date.now()}`;
  save('settings');
  applyPhoto();
}

export function setPhotoLink(raw) {
  const url = safeUrl(raw);
  if (!url) return toast('Enter a full image address that starts with https://.');
  state.settings.photo = url;
  save('settings');
  applyPhoto();
}

export async function removePhoto() {
  state.settings.photo = '';
  save('settings');
  await run('readwrite', (s) => s.delete(KEY)).catch(() => {});
  applyPhoto();
}
