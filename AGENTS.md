# AGENTS.md

Guidance for AI agents working on RecordU (Chrome MV3 extension).

## Product

RecordU captures reading notes and vocabulary while browsing, with in-page highlights and a review page (queue / words / quizzes / settings). Prefer small, focused diffs. Do not rewrite unrelated modules.

## Design system (0.8.0+)

Visual language: **Apple × 日系扁平** — cool gray-white, flat surfaces, quiet indigo accent, restrained motion.

Reference mock (do not ship as product UI): [`demo/apple-flat-ui.html`](demo/apple-flat-ui.html).

### Source of truth

| Surface | File |
| --- | --- |
| Popup / review / modal tokens + CSS | [`styles/tokens.css`](styles/tokens.css) + modules under [`styles/`](styles/); review loads [`styles.css`](styles.css) aggregator |
| In-page float bar / capture overlay / highlights | [`shared/capture-theme.js`](shared/capture-theme.js) |

**Keep capture theme in sync with `styles/tokens.css`.** Any token or capture-chrome color change must update both.

New UI CSS goes into the matching file under `styles/` (e.g. quiz UI → `styles/quiz.css`). Do not grow a monolithic `styles.css`; it is only an `@import` aggregator for `review.html`. `popup.html` links `tokens` + `base` + `popup` only.

Default highlight colors live in [`shared/settings.js`](shared/settings.js) and the「和紙」preset in [`review/settings-view.js`](review/settings-view.js).

### Palette

Use CSS variables (`--ru-*` / `--rv-*`). Do not invent one-off warm beige or Apple-system-blue.

| Role | Token | Value |
| --- | --- | --- |
| Page wash | `--ru-paper` | `#f5f5f7` (cold gray-white, **not** cream/washi yellow) |
| Panel | `--ru-surface` | `#ffffff` |
| Panel secondary | `--ru-surface-2` | `#fbfbfd` |
| Ink | `--ru-ink` | `#1d1d1f` |
| Secondary text | `--ru-sumi` | `#6e6e73` |
| Tertiary | `--ru-thin` | `#86868b` |
| Hairline | `--ru-line` | `#e5e5ea` |
| Accent (藍) | `--ru-accent` | `#3f5f8a` |
| Accent press | `--ru-accent-press` | `#355278` |
| Accent soft | `--ru-accent-soft` | `rgba(63, 95, 138, 0.1)` |
| Danger (朱) | `--ru-vermilion` | `#c45c4a` |
| OK | `--ru-ok` | `#5a8f6b` |
| Idea highlight default | settings | `#c4923a` |
| Word highlight default | settings | `#3f5f8a` |

Shadows: neutral black alpha only (`rgba(0,0,0,…)`). No brown-tint shadows (`rgba(60,54,42,…)`).

### Shape

- `--radius: 6px` for controls, chips, inputs
- `--radius-lg: 10px` for cards, modals, split shells
- Prefer soft rectangles over full pills (except tiny badges / toggles)
- Flat: light hairlines + minimal shadow; no heavy glass stacks

### Typography

| Use | Font | Notes |
| --- | --- | --- |
| UI body, lists, notes, buttons | `--ru-sans` (Hiragino Sans / PingFang SC …) | Default for almost everything |
| Brand title only (e.g. `.rv-brand`, `.popup-title`) | `--ru-serif` (Mincho / Songti) | Sparse use |

Rules:

- **Do not** use serif for rail lists, word cards, or long note bodies — small CJK Mincho looks uneven (some glyphs appear larger/heavier).
- Body/UI weight **400**; avoid `font-weight: 500+` on CJK serif (fake-bold looks blotchy).
- Prefer `font-synthesis: none` on note text.
- Primary buttons and selected nav: **accent blue**, not ink fill.

### Layout habits

- Page background = cold paper wash; interactive content sits on **white** surface panels with `1px` line border.
- Selected nav / rail: accent soft fill + accent border (not ink underline only).
- Focus rings: accent border + `0 0 0 3px var(--*-accent-soft)`.
- Motion: short opacity/transform only; respect `prefers-reduced-motion`.

### Forbidden (regressions)

- Warm cream / washi yellow page fills (`#f2f0eb`, `#f3f1ec`, `#f7f6f3`, beige gradients)
- Purple / neon AI gradients
- Pure Apple `#0071e3` as brand accent (use 藍 `#3f5f8a`)
- Ink-black primary buttons as the default CTA
- Serif for dense list previews
- Hardcoded one-off colors when a token exists

## Versioning

Bump [`manifest.json`](manifest.json) `version` and add a [`README.md`](README.md) changelog section when shipping user-visible changes.

## Code norms

- Vanilla JS modules under `shared/`, `review/`; content script themes are classic scripts.
- Escape user content with existing `escapeHtml` helpers.
- Prefer extending existing modal/review patterns over new UI frameworks.
