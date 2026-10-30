// Bloom: a small plant that grows one step for every day Tabloom is used.

import { state, save } from './store.js';
import { bloomStage, localDay, nextBloom } from './lib.js';
import { ripple } from './dots.js';

const GREEN_RIPPLE = 6;
const PETALS = ['#ff6a55', '#ff5c8a', '#ffb020', '#d66bd6', '#ff8a3d'];
const FULL_AT = 30;

const $ = (id) => document.getElementById(id);
const art = $('bloom-art');

const LEAF = 'M0 0C6-9 18-9 25 0C18 6 6 6 0 0Z';

function leaf(x, y, side, size) {
  return `<g transform="translate(${x} ${y}) scale(${side * size} ${size}) rotate(-24)">
    <path d="${LEAF}" fill="#46a302" transform="translate(0 1.6)"/><path d="${LEAF}" fill="#58cc02"/></g>`;
}

function petals(count, r, color, spread = 360, offset = 0) {
  let out = '';
  for (let i = 0; i < count; i++) {
    const angle = offset + (spread / (spread === 360 ? count : Math.max(1, count - 1))) * i;
    out += `<ellipse cx="0" cy="${-r * 1.15}" rx="${r * 0.56}" ry="${r * 0.72}" fill="${color}" transform="rotate(${angle})"/>`;
  }
  return out;
}

function face(r) {
  const eye = Math.max(2.1, r * 0.17);
  const ex = r * 0.38;
  return `<g id="bloom-eyes"><g id="bloom-lids">
      <circle cx="${-ex}" cy="${-r * 0.1}" r="${eye}" fill="#2a1a0e"/><circle cx="${ex}" cy="${-r * 0.1}" r="${eye}" fill="#2a1a0e"/>
      <circle cx="${-ex + eye * 0.35}" cy="${-r * 0.1 - eye * 0.35}" r="${eye * 0.34}" fill="#fff"/>
      <circle cx="${ex + eye * 0.35}" cy="${-r * 0.1 - eye * 0.35}" r="${eye * 0.34}" fill="#fff"/>
    </g></g>
    <ellipse cx="${-r * 0.66}" cy="${r * 0.26}" rx="${r * 0.17}" ry="${r * 0.11}" fill="#ff5c8a" opacity=".5"/>
    <ellipse cx="${r * 0.66}" cy="${r * 0.26}" rx="${r * 0.17}" ry="${r * 0.11}" fill="#ff5c8a" opacity=".5"/>
    <path d="M${-r * 0.2} ${r * 0.24}Q0 ${r * 0.5} ${r * 0.2} ${r * 0.24}" fill="none" stroke="#2a1a0e" stroke-width="1.8" stroke-linecap="round"/>`;
}

function head(days, r) {
  const color = PETALS[Math.floor(days / 7) % PETALS.length];
  if (days >= 14) {
    const count = Math.min(12, 6 + Math.floor((days - 14) / 3));
    const ring = days >= FULL_AT ? `<g transform="rotate(${180 / count})">${petals(count, r * 1.12, PETALS[(Math.floor(days / 7) + 2) % PETALS.length])}</g>` : '';
    return `${ring}${petals(count, r, color)}<circle r="${r}" fill="#ffc800"/>`;
  }
  if (days >= 7) return `${petals(5, r * 0.82, color, 100, -50)}<circle r="${r}" fill="#8fdc4e"/>`;
  return `<g transform="translate(0 ${-r * 0.86}) scale(.42)">${leaf(0, 0, 1, 1)}${leaf(0, 0, -1, 1)}</g><circle r="${r}" fill="#8fdc4e"/>`;
}

export function plantSvg(days) {
  const growth = Math.min(days, FULL_AT) / FULL_AT;
  const ease = 1 - (1 - growth) ** 2;
  const height = 12 + 72 * ease;
  const r = 11 + 5 * ease;
  const topX = 60 + 4 * ease;
  const topY = 118 - height;
  const midX = 60 - 7 * ease;

  let leaves = '';
  const count = Math.min(6, Math.floor(days / 3));
  for (let i = 0; i < count; i++) {
    const t = 0.2 + (0.62 * i) / Math.max(1, count);
    leaves += leaf(60 + (midX - 60) * Math.sin(t * Math.PI), 118 - height * t, i % 2 ? -1 : 1, 0.6 + 0.3 * ease);
  }

  return `<svg viewBox="0 0 120 150" aria-hidden="true">
    <g class="bloom-plant">
      <path d="M60 120Q${midX} ${118 - height / 2} ${topX} ${topY}" fill="none" stroke="#46a302" stroke-width="4.5" stroke-linecap="round"/>
      ${leaves}
      <g id="bloom-head" transform="translate(${topX} ${topY})">${head(days, r)}${face(r)}</g>
    </g>
    <path d="M40 124L44 145Q45 149 50 149L70 149Q75 149 76 145L80 124Z" fill="#ff8a3d"/>
    <path d="M42 136L44 145Q45 149 50 149L70 149Q75 149 76 145L78 136Q60 141 42 136Z" fill="#e0691f"/>
    <rect x="35" y="115" width="50" height="11" rx="5" fill="#e0691f"/>
    <rect x="35" y="113" width="50" height="9.500" rx="4.750" fill="#ff9d5c"/>
  </svg>`;
}

export function renderBloom(grew = false) {
  const { days } = state.bloom;
  const stage = bloomStage(days);
  art.innerHTML = plantSvg(days);
  art.setAttribute('aria-label', `Bloom, ${stage.name}, day ${days}`);
  $('bloom-stage').textContent = stage.name;
  $('bloom-day').textContent = `Day ${days}`;
  $('bloom-next').textContent = stage.next
    ? `${stage.next} ${stage.daysLeft === 1 ? 'tomorrow' : `in ${stage.daysLeft} days`}`
    : 'Grown. Colors change weekly.';
  $('bloom-fill').style.transform = `translateX(${Math.round(stage.progress * 100) - 100}%)`;
  if (grew) art.firstElementChild.animate(
    [{ transform: 'scale(0.86)' }, { transform: 'scale(1.06)' }, { transform: 'none' }],
    { duration: 620, easing: 'cubic-bezier(0.3, 1.5, 0.5, 1)' },
  );
}

export function growBloom() {
  const next = nextBloom(state.bloom, localDay());
  if (next === state.bloom) return false;
  state.bloom = next;
  save('bloom');
  return true;
}

export function celebrate() {
  art.firstElementChild?.animate(
    [{ transform: 'none' }, { transform: 'translateY(-8%) scale(1.05)' }, { transform: 'none' }],
    { duration: 460, easing: 'cubic-bezier(0.3, 1.5, 0.5, 1)' },
  );
  const box = art.getBoundingClientRect();
  ripple(box.left, box.top + box.height / 2, GREEN_RIPPLE);
}

function blink() {
  const lids = $('bloom-lids');
  if (lids && !document.hidden) {
    lids.animate([{ transform: 'scaleY(1)' }, { transform: 'scaleY(0.08)' }, { transform: 'scaleY(1)' }], { duration: 170 });
  }
  setTimeout(blink, 2800 + Math.random() * 4200);
}

// Eyes follow the cursor by a pixel or two.
function watchPointer() {
  let frame = 0;
  addEventListener('pointermove', (e) => {
    frame ||= requestAnimationFrame(() => {
      frame = 0;
      const eyes = $('bloom-eyes');
      if (!eyes) return;
      const box = eyes.getBoundingClientRect();
      const dx = e.clientX - (box.left + box.width / 2);
      const dy = e.clientY - (box.top + box.height / 2);
      const d = Math.hypot(dx, dy) || 1;
      eyes.setAttribute('transform', `translate(${((dx / d) * 1.5).toFixed(2)} ${((dy / d) * 1.5).toFixed(2)})`);
    });
  }, { passive: true });
}

export function initBloom() {
  art.onclick = celebrate;
  watchPointer();
  setTimeout(blink, 2400);
}
