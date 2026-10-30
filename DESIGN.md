# Tabloom design system

Playful like a language app, precise like Apple, and quiet enough to work in. Color lives in objects you touch; the page around them stays clean.

## Principles

1. **Everything you press is a physical key.** It has a top face and a lower edge. It rises on hover and sinks on press.
2. **Color means object, not decoration.** Notes, tiles, buttons and dots carry color. Panels and backgrounds do not.
3. **The background answers you.** Dots glow near the cursor. Dropping a note or finishing a task sends a ripple through them. The field pans forever and never reaches an edge.
4. **Fast beats fancy.** This page opens hundreds of times a day, so nothing plays on load except a short fade of the dots.

## Scale

One root size drives every measure, so type, icons and spacing all shrink together.

```css
font-size: clamp(13px, min(0.42vw + 7.9px, 0.74vh + 9.2px), 20px);
```

| Screen | Viewport | Root | Tile |
| --- | --- | --- | --- |
| 14" laptop | 1366 × 625 | 13.6px | 35px |
| 14" at 125% | 1536 × 730 | 14.4px | 37px |
| Full HD | 1920 × 950 | 16px | 42px |
| 1440p | 2560 × 1300 | 18.7px | 49px |

Use `rem` for every size. Fifteen bookmarks, 38 tiles and all five sections fit from 1280 × 600 upward without scrolling.

## Color

| Token | Hex | Edge | Used for |
| --- | --- | --- | --- |
| `--blue` | `#1cb0f6` | `#1192d1` | Selected state, focus, time |
| `--green` | `#58cc02` | `#46a302` | New, save, done |
| `--yellow` | `#ffc800` | `#dda600` | Today |
| `--orange` | `#ff9600` | `#d97e00` | Streak |
| `--pink` | `#ff5c8a` | `#dc3d6d` | Overdue, errors |
| `--purple` | `#a970ff` | `#8a4fe0` | Learning |

Rule: text on any bright color or paper is always `--on-color` (`#2a1a0e`), never white, so contrast holds on every hue.

Sticky paper comes in six tints (`--paper-*`) with matching edges. Paper looks the same in both themes.

| Surface | Light | Dark |
| --- | --- | --- |
| `--bg` | `#fdf5ea` | `#1b1410` |
| `--surface` | `#fffdf9` | `#261d16` |
| `--sunken` | `#f8efe2` | `#1e1611` |
| `--ink` | `#2c2017` | `#f8efe4` |
| `--muted` | `#7c6a5a` | `#b5a392` |
| `--line` | `#f0e4d3` | `#3c2f25` |

The page sits on warm cream or espresso, with two soft glows (`--glow-a`, `--glow-b`) in opposite corners. Background dots use a warm-only run of amber, coral, rose and orchid.

## Type

One family: **Nunito** variable, bundled locally. Rounded and friendly, still clear at small sizes.

| Role | Size | Weight |
| --- | --- | --- |
| Clock | 4.7rem | 900 |
| Panel title | 1.5rem | 900 |
| Dialog title | 1.25rem | 900 |
| Editor text | 1.12rem | 600 |
| Body, tasks | 0.93rem | 700 |
| Buttons, bookmarks | 0.86–0.9rem | 800 |
| Meta | 0.72–0.82rem | 800 |

Sentence case everywhere. No all-caps labels.

## The button

There is one button, `.btn`. Shape, type and press behavior never change. Only its hue and size do.

```html
<button class="btn">Tidy</button>
<button class="btn green">New note</button>
<button class="btn is-small">Import file</button>
<button class="btn is-square" aria-label="Delete"><svg>…</svg></button>
```

- Hues: `green`, `blue`, `yellow`, `purple`, `orange`, `pink`, or none for neutral.
- `aria-pressed="true"` means "this option is on": it sinks and turns blue.
- Inside the note editor the button sits on paper, so it stays white, and a pressed one turns ink.
- Never add a second button style. A choice between options is a row of `.btn`.

## Other parts

| Part | Class | Rule |
| --- | --- | --- |
| Icon keycap | `.tile` | Always light, even in dark theme, like an app icon |
| Text bookmark | `.mark` | Half the sidebar wide, tinted by position. Scrolls past eight rows |
| Sticky | `.note` + `.{hue}-note` | 13.5 × 11.25rem, slight tilt, lower edge. Floats only without the calendar |
| Field | `.field` | Sunken until focused |
| Task check | `.check` | Round, draws its tick, bounces once |
| Progress | `.meter` | Thick bar with a gloss strip |
| Rich text | `.md` | Sized in `em`, so it fits a sticky or a full page |
| Earlier tasks | `.earlier` | Peach paper tucked under Today, slides up over it |
| Plant | `.bloom` | Pot stays put, plant sways, eyes follow the cursor |
| Sidebar rail | `:root[data-side='min']` | 4.1rem wide, icons only |
| Today rail | `:root[data-today='min']` | 4.1rem wide: progress, streak, Bloom |
| Calendar | `.calendar` | 3:2 sheet, Monday first, no grid lines; dates are soft keys |
| Day path | `.arc` | Sun walks 6 AM to 10 PM; dots mark timed work |
| Icon key | `.dock .btn` + `.fold` | Icon only, opens on hover to show its name |
| Rotating line | `rotate()` in ui.js | One line at a time, 280ms out, 380ms in. Under the clock and in the Today rail |
| Coming up | `.agenda` | Below the to-dos, hidden when empty |
| Paper fan | `.cal-papers` | Tiny sheets on a date, one per note in its color |
| Day view | `.day` | The clicked date grows into it; note cards pop in one after another |
| Work bar | `.cal-bar` + `.{hue}-note` | Paper colors with a thin lower edge; flat ends mean it continues into the next week |
| Work chip | `.cal-chip` | Strip below the month: name, day count, days left |

Radii: `--r-s` 0.6rem for small parts, `--r-m` 0.85rem for buttons and fields, `--r-l` 1.35rem for panels, and 28% on tiles.

## Motion

| Name | Curve | For |
| --- | --- | --- |
| `--spring` | `cubic-bezier(0.3, 1.5, 0.5, 1)` | Presses, pops, anything small that reacts |
| `--glide` | `cubic-bezier(0.32, 0.72, 0, 1)` | Things that travel: notes, the page morph |

| Moment | Duration |
| --- | --- |
| Button press | 140ms |
| Menu, dialog | 160–260ms |
| Sticky grows to full page | 380ms |
| Date grows into day view | 400ms |
| Note slides into place | 420ms |
| Earlier card slides up | 420ms |
| Sidebar collapses | 300ms |
| Clock digit changes | 340ms |

Animate `transform` and `opacity` only, apart from the short color and shadow changes on press and the sidebar width. `prefers-reduced-motion` turns motion off and draws one still frame of dots.

## Background budget

The background is the only continuous animation, so it stays on a budget. Dots is the default, and Settings offers Grid lines, Aurora, Fireflies, Stars, Bubbles, Snake and Still. Each has one small thing to notice: Stars reach for the cursor, Bubbles pop on touch, Snake plays itself and grows.

- 30 fps, 15 fps after 20 seconds without input.
- Stopped while the tab is hidden or a note is open.
- Cells under the panels are skipped. Dots dim to 30% behind the clock so text stays clear.
- Pixel density capped at 1.5.

Measured at 1366 × 625 in software rendering, share of one core while active: Dots 19%, Grid lines 11%, Fireflies 12%, Aurora 2%, Still 2%.

## Writing

Say what happens, in plain words. A button says "Save link", the result says "Saved". Empty states say what to do next. Errors say how to fix it and never apologize.
