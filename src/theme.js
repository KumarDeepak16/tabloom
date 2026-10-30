// Classic script in <head>: sets theme and sidebar before first paint, so nothing flashes or jumps.
try {
  const theme = localStorage.getItem('tabula-theme');
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  if (localStorage.getItem('tabula-side') === 'min') document.documentElement.dataset.side = 'min';
  if (localStorage.getItem('tabula-today') === 'min') document.documentElement.dataset.today = 'min';
} catch {}
