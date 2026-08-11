# AGENTS.md

Guidance for AI agents working on RecordU (Chrome MV3 extension).

## Product

RecordU captures reading notes and vocabulary while browsing, with in-page highlights and a review page (queue / words / quizzes / settings). Prefer small, focused diffs. Do not rewrite unrelated modules.

## Design system (0.10.0+)

Visual language: **Bauhaus** — white ground, thick black frames, red/yellow/blue primaries, zero radius, zero gradients, zero shadows, heavy uppercase sans.

Reference mock (do not ship as product UI): [`demo/bauhaus-ui.html`](demo/bauhaus-ui.html).

### Source of truth

| Surface | File |
| --- | --- |
| Popup / review / modal tokens + CSS | [`styles/tokens.css`](styles/tokens.css) + modules under [`styles/`](styles/); review loads [`styles.css`](styles.css) aggregator |
| In-page float bar / capture overlay / highlights | [`shared/capture-theme.js`](shared/capture-theme.js) |

**Keep capture theme in sync with `styles/tokens.css`.** Any token or capture-chrome color change must update both.

New UI CSS goes into the matching file under `styles/` (e.g. quiz UI → `styles/quiz.css`). Do not grow a monolithic `styles.css`; it is only an `@import` aggregator for `review.html`. `popup.html` links `tokens` + `base` + `popup` only.

Default highlight colors live in [`shared/settings.js`](shared/settings.js) and the「包豪斯」preset in [`review/settings-view.js`](review/settings-view.js).

### Palette

Only these hues. Use CSS variables (`--ru-*` / `--rv-*`). Do not invent grays, beiges, greens, or Apple-system-blue.

| Role | Token | Value |
| --- | --- | --- |
| Page wash / panel | `--ru-paper`, `--ru-surface`, `--ru-surface-2` | `#ffffff` |
| Ink / secondary / tertiary | `--ru-ink`, `--ru-sumi`, `--ru-thin` | `#000000` |
| Hairline / border | `--ru-line` | `#000000` |
| Accent (blue) | `--ru-accent`, `--ru-focus` | `#0000ff` |
| Accent soft (selected/hover fill) | `--ru-accent-soft` | `#ffcc00` (yellow) |
| Danger (red) | `--ru-vermilion` | `#ff0000` |
| Warm / ready | `--ru-warm` | `#ffcc00` |
| OK / learned / correct | `--ru-ok` | `#2e7d32` — green, user-specified; the only allowed off-palette hue |
| 已完成 / 答对 (quiz) | `--ru-done` | `#2e7d32` (same green as `--ru-ok`) |
| Idea highlight default | settings | `#ffcc00` |
| Word highlight default | settings | `#0000ff` |

Alpha variants of these hues are allowed (e.g. `rgba(0,0,255,0.12)`, black overlays for masks). No shadows: `--ru-shadow: none`, `--ru-shadow-float: none`.

### Shape

- All radii `0` (`--radius: 0`, `--radius-lg: 0`); only pure circles (`border-radius: 50%`) and CSS-border triangles allowed as geometry.
- Thick frames: `3px`/`4px` black borders for cards, panels, buttons, modals; `1px` black hairlines for dense list separators.
- No gradients, no shadows, no glass, no `background-clip: text`, no text-shadow.

### Typography

| Use | Font | Notes |
| --- | --- | --- |
| Everything | `--ru-sans` (Helvetica Neue / Arial / PingFang SC / Heiti SC …) | `--ru-serif` aliased to sans — serif is banned |

Rules:

- Headings, buttons, labels, nav: `font-weight: 900` + `text-transform: uppercase` + letter-spacing.
- Notes / body prose: `font-weight: 700`, `font-synthesis: none`; line length capped ~70 chars.
- Hierarchy via weight/size/uppercase — never gray text.

### Layout habits

- White ground; panels separated by thick black frames, lists by `1px` black hairlines.
- Selected nav / rail / cards: solid fills — yellow `--ru-accent-soft` for selection/hover, black bg + white text for strongest state (focused card, done quiz).
- Primary CTAs: black bg white text; save = black, learn/ok = blue, danger/wrong = red bg white text (user preference over AA — do not use red-bg black-text fills)
- Focus rings: `0 0 0 3px var(--*-accent-soft)` (yellow) or `3px` black outline.
- Motion: `150–200ms ease-out` flips and shifts only; no ease-in-out, no `duration-500+`; respect `prefers-reduced-motion`.

### Forbidden (regressions)

- Any color outside the palette (gray text, green ok, beige, cream, purple, gradients)
- `border-radius` on any non-circle element (chips, cards, buttons, inputs, badges)
- Shadows / glows / glassmorphism / gradient text
- Serif fonts anywhere
- Side-stripe accents (`border-left`/`border-right` > 1px) — use full-fill states instead
- Soft slow easing (`ease-in-out`, long durations)
- Hardcoded one-off colors when a token exists

## Versioning

Bump [`manifest.json`](manifest.json) `version` and add a [`README.md`](README.md) changelog section when shipping user-visible changes.

## Code norms

- Vanilla JS modules under `shared/`, `review/`; content script themes are classic scripts.
- Escape user content with existing `escapeHtml` helpers.
- Prefer extending existing modal/review patterns over new UI frameworks.
