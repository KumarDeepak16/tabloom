// Extra background modes. Each is a quiet loop with one small thing to notice.

const mod = (value, size) => ((value % size) + size) % size;

// Stable pseudo-random numbers per index, so scenes stay put between frames.
const seeded = (i) => {
  const seed = (i * 2654435761) % 4294967296;
  return [(seed % 1000) / 1000, ((seed >>> 10) % 1000) / 1000, ((seed >>> 20) % 1000) / 1000];
};

const STARS = 44;
const LINK = 150;

// Stars drift forever; the nearest ones reach for the cursor.
export function drawConstellation({ ctx, t, w, h, pointer, sprites }) {
  const spanX = w + 120;
  const spanY = h + 120;
  const stars = [];
  for (let i = 0; i < STARS; i++) {
    const [a, b, c] = seeded(i + 1);
    stars.push({
      x: mod(a * spanX + t * (2 + c * 5), spanX) - 60,
      y: mod(b * spanY + t * (1 + a * 3), spanY) - 60,
      hue: i % 5,
      size: 1.2 + c * 1.6,
    });
  }
  ctx.strokeStyle = '#e8894a';
  ctx.lineWidth = 1;
  const line = (ax, ay, bx, by, alpha) => {
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  };
  for (let i = 0; i < STARS; i++) {
    const s = stars[i];
    for (let k = i + 1; k < STARS; k++) {
      const d = Math.hypot(s.x - stars[k].x, s.y - stars[k].y);
      if (d < LINK) line(s.x, s.y, stars[k].x, stars[k].y, (1 - d / LINK) * 0.3);
    }
    const near = Math.hypot(s.x - pointer.x, s.y - pointer.y);
    if (near < LINK * 1.3) line(s.x, s.y, pointer.x, pointer.y, (1 - near / (LINK * 1.3)) * 0.6);
    ctx.globalAlpha = 0.8;
    ctx.drawImage(sprites[s.hue], s.x - s.size, s.y - s.size, s.size * 2, s.size * 2);
  }
}

const BUBBLES = 15;
const POP_TIME = 0.45;
const popped = new Map(); // bubble index → time it popped, for the current trip up the screen
let pops = 0;

export const popCount = () => pops;

// Bubbles rise forever. Touch one with the cursor and it pops.
export function drawBubbles({ ctx, t, w, h, pointer, sprites }) {
  const span = h + 160;
  ctx.lineWidth = 1.5;
  for (let i = 0; i < BUBBLES; i++) {
    const [a, b, c] = seeded(i + 3);
    const speed = 12 + c * 20;
    const travel = t * speed + b * span;
    const trip = Math.floor(travel / span);
    const y = span - mod(travel, span) - 80;
    const x = a * w + Math.sin(t * 0.3 + i) * 26;
    const r = 11 + c * 20;
    const key = `${i}:${trip}`;
    const color = ['#ffb020', '#ff8a3d', '#ff6a55', '#ff5c8a', '#d66bd6'][i % 5];

    if (popped.has(key)) {
      const age = t - popped.get(key);
      if (age > POP_TIME) continue;
      const k = age / POP_TIME;
      ctx.globalAlpha = (1 - k) * 0.8;
      for (let d = 0; d < 7; d++) {
        const angle = (d / 7) * Math.PI * 2 + a;
        const reach = r + k * 34;
        const size = 2.4 * (1 - k) + 0.6;
        ctx.drawImage(sprites[i % 5], x + Math.cos(angle) * reach - size, y + Math.sin(angle) * reach - size, size * 2, size * 2);
      }
      continue;
    }
    if (Math.hypot(x - pointer.x, y - pointer.y) < r + 3) {
      popped.set(key, t);
      pops++;
      if (popped.size > 200) popped.clear();
      continue;
    }
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.09;
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.68, Math.PI * 1.1, Math.PI * 1.45);
    ctx.stroke();
  }
}

const SNAKE_STEP = 0.2; // seconds per cell
const SNAKE_MIN = 5;
const SNAKE_MAX = 26;
const snake = { body: [], food: null, tick: 0, length: SNAKE_MIN, flash: 0 };

function newFood(cols, rows) {
  snake.food = { c: Math.floor(Math.random() * cols), r: Math.floor(Math.random() * rows) };
}

// A snake plays itself on the dot grid. It grows with each dot, then sheds and starts again.
export function drawSnake({ ctx, t, w, h, step, sprites, glows }) {
  const cell = step * 2;
  const cols = Math.ceil(w / cell);
  const rows = Math.ceil(h / cell);
  if (!snake.body.length) snake.body = [{ c: 2, r: Math.floor(rows / 2) }];
  if (!snake.food || snake.food.c >= cols || snake.food.r >= rows) newFood(cols, rows);

  for (let guard = 0; guard < 6 && t - snake.tick > SNAKE_STEP; guard++) {
    snake.tick = t - snake.tick > 2 ? t : snake.tick + SNAKE_STEP;
    const head = snake.body[0];
    const { food } = snake;
    // Shortest way round, because the field wraps at every edge.
    const dc = mod(food.c - head.c + cols / 2, cols) - cols / 2;
    const dr = mod(food.r - head.r + rows / 2, rows) - rows / 2;
    const across = Math.abs(dc) >= Math.abs(dr) ? Math.sign(dc) : 0;
    const down = across ? 0 : Math.sign(dr);
    snake.body.unshift({ c: mod(head.c + across, cols), r: mod(head.r + down, rows) });
    if (snake.body[0].c === food.c && snake.body[0].r === food.r) {
      snake.length = snake.length >= SNAKE_MAX ? SNAKE_MIN : snake.length + 1;
      snake.flash = t;
      newFood(cols, rows);
    }
    snake.body.length = Math.min(snake.body.length, snake.length);
  }

  const beat = 0.7 + 0.3 * Math.sin(t * 3);
  ctx.globalAlpha = beat;
  const foodSize = 7;
  ctx.drawImage(glows[3], snake.food.c * cell + cell / 2 - foodSize, snake.food.r * cell + cell / 2 - foodSize, foodSize * 2, foodSize * 2);

  const lit = Math.max(0, 1 - (t - snake.flash) * 2.5);
  snake.body.forEach(({ c, r }, i) => {
    const k = 1 - i / snake.body.length;
    const size = 2 + k * 3 + lit;
    ctx.globalAlpha = 0.25 + k * 0.7;
    ctx.drawImage(sprites[i % 5], c * cell + cell / 2 - size, r * cell + cell / 2 - size, size * 2, size * 2);
  });
}
