// Classic script in <head>: sets theme and sidebar before first paint, so nothing flashes or jumps.
try {
  const theme = localStorage.getItem('tabula-theme');
  const hour = new Date().getHours();
  const shown = theme === 'time' ? (hour >= 7 && hour < 19 ? 'light' : 'dark') : theme; // same hours as timeTheme in lib.js
  if (shown === 'light' || shown === 'dark') document.documentElement.dataset.theme = shown;
  if (localStorage.getItem('tabula-side') === 'min') document.documentElement.dataset.side = 'min';
  if (localStorage.getItem('tabula-today') === 'min') document.documentElement.dataset.today = 'min';
} catch {}
