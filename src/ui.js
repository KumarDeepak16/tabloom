// Shared bits: toast, tooltip, right-click menu.

let toastEl;
let toastTimer;

export function toast(message, action) {
  toastEl?.remove();
  clearTimeout(toastTimer);
  toastEl = document.createElement('div');
  toastEl.className = 'toast';
  toastEl.setAttribute('role', 'status');
  toastEl.textContent = message;
  if (action) {
    const btn = document.createElement('button');
    btn.className = 'btn is-small yellow';
    btn.textContent = action.label;
    btn.onclick = () => {
      toastEl.remove();
      action.run();
    };
    toastEl.append(btn);
  }
  // An open modal sits in the top layer, above anything in body.
  (document.querySelector('dialog[open]') ?? document.body).append(toastEl);
  toastTimer = setTimeout(() => toastEl.remove(), action ? 6000 : 2600);
}

export function initTooltips() {
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.setAttribute('aria-hidden', 'true');
  document.body.append(tip);

  document.addEventListener('pointerover', (e) => {
    const target = e.target.closest?.('[data-tip]');
    if (!target) return tip.classList.remove('on');
    tip.textContent = target.dataset.tip;
    const box = target.getBoundingClientRect();
    const width = tip.offsetWidth;
    const x = Math.min(box.left + box.width / 2 - width / 2, innerWidth - width - 8);
    tip.style.transform = `translate(${Math.max(8, x)}px, ${box.bottom + 8}px)`;
    tip.classList.add('on');
  });
}

// Shows one line at a time, each fading out as the next fades in. Returns a repaint function.
export function rotate(el, getLines, every) {
  const calm = matchMedia('(prefers-reduced-motion: reduce)');
  let index = 0;
  const paint = () => {
    const lines = getLines();
    if (index >= lines.length) index = 0;
    el.textContent = lines[index] ?? '';
  };
  setInterval(async () => {
    const count = getLines().length;
    if (document.hidden || count < 2) return paint();
    index = (index + 1) % count;
    if (calm.matches) return paint();
    const leaving = el.animate(
      [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-0.4em)' }],
      { duration: 280, easing: 'ease-in', fill: 'forwards' },
    );
    await leaving.finished;
    paint();
    leaving.cancel();
    el.animate(
      [{ opacity: 0, transform: 'translateY(0.4em)' }, { opacity: 1, transform: 'none' }],
      { duration: 380, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' },
    );
  }, every);
  paint();
  return paint;
}

let menuEl;

export function closeMenu() {
  menuEl?.remove();
  menuEl = null;
}

export function openMenu(x, y, items) {
  closeMenu();
  menuEl = document.createElement('div');
  menuEl.className = 'menu';
  menuEl.setAttribute('role', 'menu');
  for (const { label, run } of items) {
    const btn = document.createElement('button');
    btn.className = 'btn is-small';
    btn.setAttribute('role', 'menuitem');
    btn.textContent = label;
    btn.onclick = () => {
      closeMenu();
      run();
    };
    menuEl.append(btn);
  }
  document.body.append(menuEl);
  menuEl.style.left = `${Math.min(x, innerWidth - menuEl.offsetWidth - 8)}px`;
  menuEl.style.top = `${Math.min(y, innerHeight - menuEl.offsetHeight - 8)}px`;
  menuEl.querySelector('button').focus();
}

document.addEventListener('pointerdown', (e) => {
  if (menuEl && !menuEl.contains(e.target)) closeMenu();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeMenu();
});

export function downloadJson(name, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
