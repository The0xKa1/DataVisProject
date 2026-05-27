# v0 INTERFACE Design System → MisBot Dashboard

## Overview
- **Source template:** v0 INTERFACE — `docs/design-references/interface.zip`
- **Approach:** keep static HTML/CSS/JS + d3 + three (no build step requirement from course brief), apply v0 design language as a CSS-first refactor with one small JS addition (side-nav IntersectionObserver).
- **Why not Next.js port:** course requires TA to run in ~15 min; existing d3+three logic works; the value of the template is the design language (color/type/layout/motion), not the React shell.

## Design Tokens (extracted from `app/globals.css`)

### Color (was light; switch to dark)
| Token       | v0 value (oklch)        | Hex equivalent | Role                       |
|-------------|-------------------------|----------------|----------------------------|
| background  | `oklch(0.08 0 0)`       | `#0a0a0a`      | page bg                    |
| card        | `oklch(0.12 0 0)`       | `#1a1a1a`      | panel surface              |
| foreground  | `oklch(0.95 0 0)`       | `#ededed`      | primary text               |
| muted-fg    | `oklch(0.55 0 0)`       | `#7a7a7a`      | captions, eyebrows         |
| border      | `oklch(0.25 0 0)`       | `#333333`      | rule lines                 |
| accent      | `oklch(0.7 0.2 45)`     | `#e96a2c`      | the orange — bright/warm   |
| destructive | `oklch(0.577 0.245 27)` | `#c43d1f`      | (unused)                   |

Map to existing token names: `--bg`→bg, `--surface`→card, `--ink`→fg, `--muted`→muted-fg, `--rule`→border, `--hot`→accent. Keep `--cool` (`#5c7c9e`) for non-bot interaction line — it stays as a secondary blue against the dark.

### Typography
- `--font-sans: "IBM Plex Sans"` (was Inter)
- `--font-mono: "IBM Plex Mono"` (was JetBrains Mono)
- `--font-display: "Bebas Neue"` (NEW — for panel h2 and hero wordmark)
- All headlines uppercase, tight tracking; mono captions use `tracking-[0.3em] text-[10px] uppercase`.

### Radius
- `--radius: 0` — sharp corners (existing project already does this via `* { border-radius: 0 !important }`).

### Patterns
- **Grid background:** 60px × 60px lines at `oklch(0.2 0 0)` opacity 0.3, on `<body>`, fixed.
- **Noise overlay:** SVG fractalNoise, opacity 0.03, fixed full-screen, `pointer-events: none`, `z-index: 1000`.
- **::selection:** accent bg, dark fg.

## Layout patterns to adopt

1. **Fixed left side-nav** (`SideNav` component): w-16/20, full height, dot indicator per section, IntersectionObserver scrolls active dot to accent color. Adapt to dashboard sections (METRICS, TIMELINE, NETWORK, ORBIT, KEYWORDS, ACTORS, PHRASES, EVIDENCE).
2. **Editorial numbered eyebrows:** existing `<span class="num">02</span><span class="sep">·</span>` becomes `01 / TIMELINE` style with accent-colored leading number.
3. **Big display headings:** `.panel-head h2` swaps Inter 700/22px → Bebas Neue 32–44px uppercase.
4. **Bordered ghost buttons** with `border-foreground/20 hover:border-accent hover:text-accent` — existing `.ghost-btn` already structured this way, just retunes colors.

## d3 / three.js color updates required
- COLORS object in `app.js`: ink → `#ededed`, surface → `#1a1a1a`, bg → `#0a0a0a`, muted → `#7a7a7a`, real → `#ededed`, line → `rgba(237,237,237,0.18)`, accent (cool) stays.
- Three.js: scene bg should be transparent (panel CSS provides), grid color → `0x333333`, ambient/directional lights stay white.
- Timeline brush selection fill → `rgba(237,237,237,0.10)`.
- Tooltip surface → dark.

## Side-nav sections (mapping to dashboard panels)
1. INDEX (top / metrics)
2. TIMELINE (panel 02)
3. NETWORK (panel 03)
4. ORBIT (panel 04)
5. KEYWORDS / ACTORS (panels 05–06)
6. PHRASES / EVIDENCE (panels 07–08)

## Out of scope (course context)
- Split-flap animation, scramble text, GSAP scroll-triggered translate/opacity — these are content-marketing flourishes that would distract from a data-viz audit dashboard. Adopt the *static* visual language, skip the kinetic landing-page chrome.
- React migration — not justified for a 15-min-to-run course project.

## File deltas
- `index.html` — add side-nav markup, swap Google Fonts link to IBM Plex + Bebas Neue, add noise SVG overlay div.
- `src/styles/tokens.css` — dark palette + IBM Plex + Bebas Neue + accent.
- `src/styles/base.css` — body bg grid at darker grid color, noise overlay rule.
- `src/styles/topbar.css` — keep brand layout but Bebas Neue wordmark, shift padding for side-nav.
- `src/styles/panels.css` — dark surface, Bebas Neue h2 in panel head, recolor d3 axis/grid CSS classes.
- `src/styles/controls.css` — dark input bg, accent focus ring.
- `src/styles.css` — add new `sidenav.css` import.
- NEW `src/styles/sidenav.css` — fixed left rail with dot indicators.
- `src/app.js` — update COLORS object + three GridHelper color.
- NEW small block in `app.js` — IntersectionObserver wiring active section to side-nav dots.
