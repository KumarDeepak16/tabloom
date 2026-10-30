// Background motion, all on one canvas: flowing dots, grid lines or fireflies.
// Dots pan forever through a world that never repeats: color and wave come from world position,
// so wrapping the screen grid is invisible. Aurora is CSS only and Still draws nothing.
// Capped at 30 fps, 15 after 20 s without input, stopped while hidden or a note is open.

import { drawBubbles, drawConstellation, drawSnake, popCount } from './motion.js';

export { popCount };

const WARM = ['#ffb020', '#ff8a3d', '#ff6a55', '#ff5c8a', '#d66bd6', '#ff6a55'];
const GREEN = '#58cc02';
const HUES = [...WARM, GREEN];
const IDLE_AFTER = 20000;
const CURSOR_REACH = 170;
const RIPPLE_SPEED = 560;
const RIPPLE_LIFE = 1.1;
const PAN_X = 7; // px per second
const PAN_Y = 4;
const CLOTH = 4; // how far dots drift off the grid, in px
const PULSES = 10;
const FIREFLIES = 70;

const canvas = document.getElementById('dots');
const ctx = canvas.getContext('2d', { alpha: true });
const calm = matchMedia('(prefers-reduced-motion: reduce)');

const sprites = HUES.map((hue) => {
  const s = document.createElement('canvas');
  s.width = s.height = 24;
  const c = s.getContext('2d');
  c.fillStyle = hue;
  c.arc(12, 12, 12, 0, Math.PI * 2);
  c.fill();
  return s;
});

const glows = HUES.map((hue) => {
  const s = document.createElement('canvas');
  s.width = s.height = 48;
  const c = s.getContext('2d');
  const g = c.createRadialGradient(24, 24, 1, 24, 24, 24);
  g.addColorStop(0, '#fff');
  g.addColorStop(0.18, hue);
  g.addColorStop(1, `${hue}00`);
  c.fillStyle = g;
  c.fillRect(0, 0, 48, 48);
  return s;
});

let mode = 'dots';
let xs = new Float32Array(0);
let ys = new Float32Array(0);
let step = 24;
let boardTop = 0;
let raf = 0;
let last = 0;
let lastMove = 0;
let paused = false;
const pointer = { x: -9999, y: -9999 };
let ripples = [];

function layout() {
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  const width = Math.round(innerWidth * dpr);
  const height = Math.round(innerHeight * dpr);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  step = parseFloat(getComputedStyle(document.documentElement).fontSize) * 1.75;
  boardTop = document.getElementById('board').getBoundingClientRect().top;

  // One spare row and column on each side, so panning never exposes an edge.
  // Cells fully under a panel are skipped: nobody can see them.
  const panels = [...document.querySelectorAll('.side, .deck')].map((el) => el.getBoundingClientRect());
  const covered = (x, y) =>
    panels.some((r) => x > r.left + step && x < r.right - step * 2 && y > r.top + step && y < r.bottom - step * 2);
  const cells = [];
  for (let r = -1; r <= Math.ceil(innerHeight / step) + 1; r++) {
    for (let c = -1; c <= Math.ceil(innerWidth / step) + 1; c++) {
      if (!covered(c * step, r * step)) cells.push(c * step, r * step);
    }
  }
  xs = new Float32Array(cells.length / 2);
  ys = new Float32Array(cells.length / 2);
  for (let i = 0; i < xs.length; i++) {
    xs[i] = cells[i * 2];
    ys[i] = cells[i * 2 + 1];
  }
  draw(performance.now());
}

const mod = (value, size) => ((value % size) + size) % size;

// Fine lines pan forever while bright pulses run along them.
function drawGrid(now) {
  const t = now / 1000;
  const gap = step * 2;
  const panX = t * PAN_X;
  const panY = t * PAN_Y;
  const shiftX = -(panX % gap);
  const shiftY = -(panY % gap);
  ctx.clearRect(0, 0, innerWidth, innerHeight);

  ctx.globalAlpha = 0.13;
  ctx.strokeStyle = '#d98a3d';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = shiftX; x < innerWidth; x += gap) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, innerHeight);
  }
  for (let y = shiftY; y < innerHeight; y += gap) {
    ctx.moveTo(0, y);
    ctx.lineTo(innerWidth, y);
  }
  ctx.stroke();

  // Wrap on a whole number of cells so a pulse always stays on a line.
  const spanX = (Math.ceil(innerWidth / gap) + 2) * gap;
  const spanY = (Math.ceil(innerHeight / gap) + 2) * gap;
  for (let i = 0; i < PULSES; i++) {
    const across = i % 2 === 0;
    const speed = 70 + (i * 37) % 80;
    const line = (i * 7 + 3) * gap;
    const run = t * speed + i * 311;
    for (let k = 0; k < 12; k++) {
      const trail = run - k * 9;
      const x = across ? mod(trail, innerWidth + 200) - 100 : mod(line - panX, spanX) - gap;
      const y = across ? mod(line - panY, spanY) - gap : mod(trail, innerHeight + 200) - 100;
      const size = 2.6 - k * 0.14;
      ctx.globalAlpha = 0.85 * (1 - k / 12);
      ctx.drawImage(sprites[i % WARM.length], x - size, y - size, size * 2, size * 2);
    }
  }
}

// Soft lights rising without end.
function drawFireflies(now) {
  const t = now / 1000;
  const w = innerWidth + 80;
  const h = innerHeight + 80;
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  for (let i = 0; i < FIREFLIES; i++) {
    const seed = (i * 2654435761) % 4294967296;
    const a = (seed % 1000) / 1000;
    const b = ((seed >>> 10) % 1000) / 1000;
    const c = ((seed >>> 20) % 1000) / 1000;
    const x = mod(a * w + Math.sin(t * (0.1 + c * 0.2) + a * 9) * 46 + t * 3, w) - 40;
    const y = mod(b * h - t * (5 + c * 15), h) - 40;
    const glow = 0.5 + 0.5 * Math.sin(t * (0.5 + b) + c * 12);
    const size = 5 + c * 7 + glow * 3;
    ctx.globalAlpha = 0.25 + glow * 0.6;
    ctx.drawImage(glows[i % WARM.length], x - size, y - size, size * 2, size * 2);
  }
}

const scene = (paint) => (now) => {
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  paint({ ctx, t: now / 1000, w: innerWidth, h: innerHeight, step, pointer, sprites, glows });
};

const painters = {
  dots: drawDots,
  grid: drawGrid,
  fireflies: drawFireflies,
  constellation: scene(drawConstellation),
  bubbles: scene(drawBubbles),
  snake: scene(drawSnake),
};

function draw(now) {
  painters[mode]?.(now);
}

function drawDots(now) {
  const t = now / 1000;
  const panX = t * PAN_X;
  const panY = t * PAN_Y;
  const shiftX = -(panX % step);
  const shiftY = -(panY % step);
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  ripples = ripples.filter((r) => (now - r.start) / 1000 < RIPPLE_LIFE);

  for (let i = 0; i < xs.length; i++) {
    const gridX = xs[i] + shiftX;
    const gridY = ys[i] + shiftY;
    const wx = gridX + panX;
    const wy = gridY + panY;

    // Like cloth in a slow wind: dots sway off the grid while crests roll across it.
    const x = gridX + Math.sin(wy * 0.012 + t * 0.4) * CLOTH;
    const y = gridY + Math.cos(wx * 0.01 - t * 0.3) * CLOTH;
    const wave = 0.5 + 0.5 * Math.sin(wx * 0.0095 + t * 0.55 + Math.sin(wy * 0.012 - t * 0.35) * 1.7);
    const crest = wave * wave * wave;
    let alpha = 0.18 + crest * 0.66;
    let radius = 1 + crest * 1.6;
    let hue = Math.floor(mod(wx * 0.0011 + wy * 0.0017 + t * 0.02, 1) * WARM.length);

    const dx = x - pointer.x;
    const dy = y - pointer.y;
    const near = dx * dx + dy * dy;
    if (near < CURSOR_REACH * CURSOR_REACH) {
      const k = 1 - Math.sqrt(near) / CURSOR_REACH;
      alpha += k * 0.7;
      radius += k * k * 2;
    }

    for (const ripple of ripples) {
      const age = (now - ripple.start) / 1000;
      const distance = Math.hypot(x - ripple.x, y - ripple.y);
      const k = Math.max(0, 1 - Math.abs(distance - age * RIPPLE_SPEED) / 54) * (1 - age / RIPPLE_LIFE);
      if (k > 0) {
        alpha += k;
        radius += k * 2.6;
        hue = ripple.hue;
      }
    }

    // Quieter behind the clock so its text stays easy to read.
    const clear = y < boardTop ? 0.5 : Math.min(1, 0.5 + ((y - boardTop) / 70) * 0.5);
    ctx.globalAlpha = Math.min(alpha, 1) * clear;
    ctx.drawImage(sprites[hue], x - radius, y - radius, radius * 2, radius * 2);
  }
}

function frame(now) {
  raf = requestAnimationFrame(frame);
  if (now - last < (now - lastMove > IDLE_AFTER ? 66 : 33)) return;
  last = now;
  draw(now);
}

function sync() {
  cancelAnimationFrame(raf);
  raf = 0;
  if (painters[mode] && !document.hidden && !paused && !calm.matches) raf = requestAnimationFrame(frame);
}

export function pauseDots(value) {
  paused = value;
  document.documentElement.classList.toggle('bg-paused', value);
  sync();
}

export function setMotion(kind) {
  mode = kind in painters || kind === 'aurora' || kind === 'still' ? kind : 'dots';
  document.documentElement.dataset.motion = mode;
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  draw(performance.now());
  sync();
}

// hue indexes HUES; pass nothing to get a random warm one. Only the dot field ripples.
export function ripple(x, y, hue = Math.floor(Math.random() * WARM.length)) {
  if (calm.matches || mode !== 'dots') return;
  ripples.push({ x, y, hue, start: performance.now() });
  lastMove = performance.now();
}

export function initDots() {
  lastMove = performance.now();
  layout();
  sync();
  canvas.classList.add('on');
  // Debounced: the sidebar toggle resizes the board on every frame of its slide.
  let wait;
  new ResizeObserver(() => {
    clearTimeout(wait);
    wait = setTimeout(layout, 120);
  }).observe(document.getElementById('board'));
  addEventListener('resize', layout);
  document.addEventListener('visibilitychange', sync);
  calm.addEventListener('change', sync);
  addEventListener('pointermove', (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    lastMove = performance.now();
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => (pointer.x = -9999));
}
