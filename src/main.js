import './compat.js';
import { state, load, save, flush, onRemote, onSaveFailed } from './store.js';
import { localDay, safeUrl, timeTheme, validBackup } from './lib.js';
import { initDots, setMotion } from './dots.js';
import { applyPhoto, applyPhotoLook, removePhoto, setPhotoLink, uploadPhoto } from './photo.js';
import { downloadJson, initTooltips, toast } from './ui.js';
import { backfillFavicons, openPicker, renderLinks, restoreLinks } from './links.js';
import { closeNote, isEditing, learnedNote, newNote, renderBoard, syncNotes, tidyNotes, todayNote } from './notes.js';
import { activeDay, closeDay, initCalendar, renderCalendar } from './calendar.js';
import { afterTasks, initRail, renderTasks, rollDay } from './today.js';
import { initHeader, paintHeader } from './header.js';
import { loadDocs, renderAgenda, setCalendarFeed, setDocs, syncMeetings } from './agenda.js';
import { growBloom, initBloom, renderBloom } from './bloom.js';
import { initFind, openFind } from './find.js';

const $ = (id) => document.getElementById(id);
const BACKUP_EVERY = 7 * 864e5;

function setDigits(text) {
  const box = $('clock-digits');
  box.setAttribute('aria-label', text);
  [...text].forEach((char, i) => {
    let cell = box.children[i];
    if (!cell) cell = box.appendChild(document.createElement('span'));
    if (cell.textContent === char) return;
    cell.textContent = char;
    if (box.dataset.ready) {
      cell.animate(
        [{ transform: 'translateY(0.28em)', opacity: 0 }, { transform: 'none', opacity: 1 }],
        { duration: 340, easing: 'cubic-bezier(0.3, 1.5, 0.5, 1)' },
      );
    }
  });
  while (box.children.length > text.length) box.lastChild.remove();
  box.dataset.ready = '1';
}

function paintClock(now = new Date()) {
  const h24 = now.getHours();
  const mm = String(now.getMinutes()).padStart(2, '0');
  const { hour12 } = state.settings;
  setDigits(`${hour12 ? h24 % 12 || 12 : String(h24).padStart(2, '0')}:${mm}`);
  $('clock-ampm').textContent = hour12 ? (h24 < 12 ? 'AM' : 'PM') : '';
}

let shownDay = '';

function tick() {
  const now = new Date();
  paintClock(now);
  if (localDay(now) !== shownDay) {
    const firstPaint = !shownDay;
    shownDay = localDay(now);
    rollDay();
    renderTasks();
    const grew = growBloom();
    renderBloom(grew && !firstPaint);
    renderCalendar();
  }
  if (state.settings.theme === 'time') applyTheme();
  paintHeader();
  renderAgenda();
  syncMeetings();
  // Wake once a minute, on the minute.
  setTimeout(tick, 60000 - (now.getSeconds() * 1000 + now.getMilliseconds()) + 20);
}

const THEME_KEY = {
  light: ['i-sun', 'Light'],
  dark: ['i-moon', 'Dark'],
  time: ['i-time', 'Day and night'],
  auto: ['i-time', 'System'],
};

function applyTheme() {
  const { theme } = state.settings;
  const shown = theme === 'time' ? timeTheme() : theme;
  if (shown === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = shown;
  const [icon, label] = THEME_KEY[theme] ?? THEME_KEY.auto;
  $('theme-icon').setAttribute('href', `#${icon}`);
  $('theme-label').textContent = label;
  $('toggle-theme').setAttribute('aria-label', `Theme: ${label}`);
  try {
    localStorage.setItem('tabula-theme', theme);
  } catch {}
}

// Header key: Light, Dark, then Day and night. System stays available in Settings.
function cycleTheme() {
  const { theme } = state.settings;
  const current = theme === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;
  const order = ['light', 'dark', 'time'];
  state.settings.theme = order[(order.indexOf(current) + 1) % order.length];
  save('settings');
  applyTheme();
  $('toggle-theme').querySelector('svg').animate(
    [{ transform: 'rotate(-90deg) scale(0.6)' }, { transform: 'none' }],
    { duration: 360, easing: 'cubic-bezier(0.3, 1.5, 0.5, 1)' },
  );
}

function applySide() {
  const { sideMin } = state.settings;
  if (sideMin) document.documentElement.dataset.side = 'min';
  else delete document.documentElement.dataset.side;
  const label = sideMin ? 'Open sidebar' : 'Collapse sidebar';
  $('toggle-side').setAttribute('aria-label', label);
  $('toggle-side').setAttribute('aria-expanded', !sideMin);
  $('toggle-side').dataset.tip = label;
  try {
    localStorage.setItem('tabula-side', sideMin ? 'min' : 'open');
  } catch {}
}

function toggleSide() {
  state.settings.sideMin = !state.settings.sideMin;
  save('settings');
  // Fade while the layout swaps between grid and rail, so tiles never visibly jump.
  $('groups').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'ease-out' });
  applySide();
}

function applyToday() {
  const { todayMin } = state.settings;
  if (todayMin) document.documentElement.dataset.today = 'min';
  else delete document.documentElement.dataset.today;
  const label = todayMin ? 'Open Today panel' : 'Collapse Today panel';
  $('toggle-today').setAttribute('aria-label', label);
  $('toggle-today').setAttribute('aria-expanded', !todayMin);
  $('toggle-today').dataset.tip = label;
  try {
    localStorage.setItem('tabula-today', todayMin ? 'min' : 'open');
  } catch {}
}

function toggleToday() {
  state.settings.todayMin = !state.settings.todayMin;
  save('settings');
  applyToday();
}

function applyCalendar() {
  const on = state.settings.calendar;
  $('calendar').hidden = !on;
  document.documentElement.dataset.cal = on ? 'on' : 'off';
  if (!on) closeDay();
  $('toggle-calendar').setAttribute('aria-pressed', on);
  renderCalendar();
  renderBoard();
}

function toggleCalendar() {
  state.settings.calendar = !state.settings.calendar;
  save('settings');
  applyCalendar();
}

function paintPortfolio() {
  const a = $('portfolio');
  const url = safeUrl(state.settings.portfolio);
  if (url) {
    a.href = url;
    delete a.dataset.tip;
  } else {
    a.removeAttribute('href');
    a.dataset.tip = 'Add your link in Settings';
  }
}

function pressed(row, value) {
  for (const btn of $(row).children) btn.setAttribute('aria-pressed', btn.dataset.v === value);
}

function showSection(name) {
  pressed('set-nav', name);
  for (const pane of document.querySelectorAll('[data-pane]')) pane.hidden = pane.dataset.pane !== name;
}

function paintSettings() {
  const s = state.settings;
  pressed('set-theme', s.theme);
  pressed('set-clock', s.hour12 ? '12' : '24');
  pressed('set-mirror', s.mirror ? 'on' : 'off');
  pressed('set-motion', s.motion);
  pressed('set-calendar', s.calendar ? 'on' : 'off');
  $('photo-link').value = /^https?:/.test(s.photo) ? s.photo : '';
  $('photo-remove').disabled = !s.photo;
  $('photo-blur').value = s.blur;
  $('photo-dim').value = s.dim;
  $('set-name').value = s.name;
  $('set-portfolio').value = s.portfolio;
  $('set-portfolio-error').hidden = true;
  $('set-ical').value = s.ical;
  $('set-ical-error').hidden = true;
  pressed('set-docs', s.docs ? 'on' : 'off');
}

function bindChoice(row, apply) {
  $(row).addEventListener('click', (e) => {
    const value = e.target.closest('[data-v]')?.dataset.v;
    if (!value) return;
    apply(value);
    save('settings');
    paintSettings();
  });
}

// Empty clears the link. A bad address is flagged and never stored.
function savePortfolio(input, error) {
  const raw = input.value.trim();
  const url = safeUrl(raw);
  error.hidden = !raw || !!url;
  if (raw && !url) return false;
  state.settings.portfolio = url ?? '';
  save('settings');
  paintPortfolio();
  return true;
}

function exportData() {
  const { notes, tasks, links, streak, bloom, work } = state;
  state.settings.backupAt = Date.now();
  save('settings');
  // The calendar address is a secret, so it never goes into a file.
  const settings = { ...state.settings, ical: '' };
  downloadJson(`tabula-backup-${localDay()}.json`, { notes, tasks, links, settings, streak, bloom, work });
}

async function importData(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    data = null;
  }
  if (!validBackup(data)) return toast('That file is not a Tabloom backup');
  if (!$('hello-dialog').open && !confirm('Replace your current notes, tasks, links and settings with this backup?')) return;
  Object.assign(state, {
    notes: data.notes,
    tasks: data.tasks,
    links: data.links,
    settings: { ...state.settings, ...data.settings, onboarded: true },
    streak: data.streak ?? state.streak,
    bloom: data.bloom ?? state.bloom,
    work: data.work ?? state.work,
  });
  ['notes', 'tasks', 'links', 'settings', 'streak', 'bloom', 'work'].forEach(save);
  flush();
  applyTheme();
  applySide();
  applyToday();
  setMotion(state.settings.motion);
  applyPhoto();
  applyCalendar();
  renderAll();
  paintSettings();
  paintPortfolio();
  paintClock();
  if ($('hello-dialog').open) $('hello-dialog').close();
  toast('Backup restored');
}

// The clock starts on the first visit, so a new install is left alone for a week.
function remindBackup() {
  const { backupAt } = state.settings;
  if (Date.now() - backupAt < BACKUP_EVERY) return;
  state.settings.backupAt = Date.now();
  save('settings');
  if (backupAt) toast('No backup for a week. Your notes live only in this browser.', { label: 'Export', run: exportData });
}

function renderAll() {
  renderLinks();
  renderBoard();
  renderTasks();
  renderBloom();
}

function showWelcome() {
  const dialog = $('hello-dialog');
  dialog.addEventListener('cancel', (e) => e.preventDefault());
  dialog.showModal();
  $('hello-name').focus();
}

function bindWelcome() {
  $('hello-restore').onclick = () => $('import-file').click();
  $('hello-picker').onclick = openPicker;
  $('hello-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('hello-name').value.trim();
    if (!name) {
      $('hello-error').textContent = 'Enter your name to continue.';
      $('hello-error').hidden = false;
      return $('hello-name').focus();
    }
    if (!savePortfolio($('hello-portfolio'), $('hello-portfolio-error'))) return $('hello-portfolio').focus();
    Object.assign(state.settings, { name, onboarded: true });
    save('settings');
    flush();
    paintClock();
    $('hello-dialog').close();
  });
}

function bindUi() {
  $('new-note').onclick = () => newNote(activeDay());
  $('today-note').onclick = todayNote;
  $('learned-note').onclick = learnedNote;
  $('tidy').onclick = tidyNotes;
  $('toggle-side').onclick = toggleSide;
  $('toggle-today').onclick = toggleToday;
  $('rail-open').onclick = toggleToday;
  $('toggle-calendar').onclick = toggleCalendar;
  $('toggle-theme').onclick = cycleTheme;

  const openSettings = () => {
    paintSettings();
    showSection('general');
    $('settings-dialog').showModal();
  };
  $('set-nav').addEventListener('click', (e) => {
    const value = e.target.closest('[data-v]')?.dataset.v;
    if (value) showSection(value);
  });
  $('open-settings').onclick = openSettings;
  $('open-find').onclick = openFind;
  initFind([
    { title: 'New note', symbol: 'i-plus', run: () => newNote(activeDay()) },
    { title: "Today's note", symbol: 'i-note', run: todayNote },
    { title: 'What I learned', symbol: 'i-bulb', run: learnedNote },
    { title: 'Show or hide calendar', symbol: 'i-cal', run: toggleCalendar },
    { title: 'Switch theme', symbol: 'i-sun', run: cycleTheme },
    { title: 'Open settings', symbol: 'i-gear', run: openSettings },
  ]);
  $('portfolio').onclick = (e) => {
    if ($('portfolio').href) return;
    e.preventDefault();
    openSettings();
    $('set-portfolio').focus();
  };
  $('settings-close').onclick = $('settings-x').onclick = () => $('settings-dialog').close();
  $('set-name').addEventListener('input', (e) => {
    state.settings.name = e.target.value.trim();
    save('settings');
    paintClock();
  });
  $('set-portfolio').addEventListener('input', (e) => savePortfolio(e.target, $('set-portfolio-error')));
  bindChoice('set-theme', (v) => {
    state.settings.theme = v;
    applyTheme();
  });
  bindChoice('set-clock', (v) => {
    state.settings.hour12 = v === '12';
    paintClock();
    renderTasks();
  });
  bindChoice('set-mirror', (v) => (state.settings.mirror = v === 'on'));
  $('set-docs').addEventListener('click', async (e) => {
    const value = e.target.closest('[data-v]')?.dataset.v;
    if (!value) return;
    await setDocs(value === 'on');
    paintSettings();
  });
  $('set-ical').addEventListener('change', (e) => {
    $('set-ical-error').hidden = setCalendarFeed(e.target.value);
  });
  bindChoice('set-calendar', (v) => {
    state.settings.calendar = v === 'on';
    applyCalendar();
  });
  bindChoice('set-motion', (v) => {
    state.settings.motion = v;
    setMotion(v);
  });

  $('photo-upload').onclick = () => $('photo-file').click();
  $('photo-file').onchange = async (e) => {
    const [file] = e.target.files;
    e.target.value = '';
    if (file) await uploadPhoto(file);
    paintSettings();
  };
  $('photo-link').addEventListener('change', (e) => {
    if (e.target.value.trim()) setPhotoLink(e.target.value);
    paintSettings();
  });
  $('photo-remove').onclick = async () => {
    await removePhoto();
    paintSettings();
  };
  for (const key of ['blur', 'dim']) {
    $(`photo-${key}`).addEventListener('input', (e) => {
      state.settings[key] = Number(e.target.value);
      save('settings');
      applyPhotoLook();
    });
  }

  $('import-picker').onclick = openPicker;
  $('restore-links').onclick = restoreLinks;
  $('export-data').onclick = exportData;
  $('import-data').onclick = () => $('import-file').click();
  $('import-file').onchange = (e) => {
    const [file] = e.target.files;
    if (file) importData(file);
    e.target.value = '';
  };

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.querySelector('dialog[open], .menu')) {
      if (isEditing()) closeNote();
      else closeDay();
    }
    const typing = e.target.closest?.('input, textarea, dialog');
    if (typing || isEditing() || e.ctrlKey || e.metaKey || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === 'n') {
      e.preventDefault();
      newNote(activeDay());
    } else if (key === 'b') {
      toggleSide();
    } else if (key === 'c') {
      toggleCalendar();
    } else if (key === 't') {
      toggleToday();
    } else if (key === 's') {
      openSettings();
    } else if (key === '/') {
      e.preventDefault();
      openFind();
    }
  });

  addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => (document.hidden ? flush() : loadDocs()));
}

await load();
applyTheme();
applySide();
applyToday();
setMotion(state.settings.motion);
applyPhoto();
bindUi();
bindWelcome();
paintPortfolio();
renderLinks();
initCalendar();
applyCalendar();
afterTasks(paintHeader);
initHeader();
initRail();
tick();
loadDocs();
initBloom();
initTooltips();
initDots();
if (!state.settings.onboarded) showWelcome();
else setTimeout(remindBackup, 2000);
setTimeout(backfillFavicons, 1500);

onRemote((key) => {
  if (key === 'links') renderLinks();
  if (key === 'notes') syncNotes();
  if (key === 'tasks' || key === 'streak') renderTasks();
  if (key === 'bloom') renderBloom();
  if (key === 'work') renderCalendar();
  if (key === 'meetings') renderAgenda();
  if (key === 'settings') {
    applyTheme();
    applySide();
    applyToday();
    setMotion(state.settings.motion);
    applyPhoto();
    applyCalendar();
    paintPortfolio();
    paintClock();
    renderTasks();
  }
});
onSaveFailed(() => toast('Could not save. Export a backup from Settings.'));
