# Slidedecks

Homebase for [reveal.js](https://revealjs.com/) presentations — one folder per conference talk, a shared signature theme, and GitHub Pages publishing.

## Quick start

```bash
npm install
npm start
```

Open [http://127.0.0.1:8080](http://127.0.0.1:8080) for the deck index, or go directly to a talk:

```text
http://127.0.0.1:8080/decks/2026-06-example-conf-talk/
```

Port **8080** is used by default to avoid conflicts with other local tools on 8000 (e.g. Python/FastAPI). Override with `DEV_PORT=9000 npm start`.

## Create a new deck

```bash
npm run new -- 2026-09-my-conf-talk
```

This copies `template/` into `decks/2026-09-my-conf-talk/`. Edit the title slide in `index.html` — each field is marked with an HTML comment:

| Comment | Field |
| --- | --- |
| `PRESENTATION_TITLE` | Talk title (also used in `<title>`) |
| `CONFERENCE` | Conference or event name |
| `DATE` | Date |
| `AUTHOR` | Your name |
| `AFFILIATION` | Institutional affiliation |
| `EMAIL` | Contact email (closing slide) |

The closing slide also carries monochrome Bluesky and GitHub icon links (inline SVGs in the markup — edit the `href`s there).

Logos are shared from `assets/logos/` and styled in the theme.

Naming convention: `YYYY-MM-short-conf-or-topic-name` (lowercase, hyphens).

## Presenting

- **Navigate**: arrow keys, space, swipe
- **Overview**: `Esc`
- **Speaker notes**: press `S` to open the speaker view in a second window
- **Fullscreen**: `F`

## Export to PDF

1. Open the deck with `?print-pdf` appended to the URL:

   ```text
   http://127.0.0.1:8080/decks/my-talk/?print-pdf
   ```

2. Print from the browser (Chrome recommended)
3. Destination: **Save as PDF**
4. Layout: **Landscape**
5. Margins: **None**
6. Enable **Background graphics**

## Customize the theme

The signature theme lives in [`theme/source/wouter.scss`](theme/source/wouter.scss). It follows the official reveal.js Sass theme structure:

1. Override variables in `@use 'template/settings' with (...)`
2. Import the base template with `@use 'template/theme'`
3. Add custom styles below

Compile after changes:

```bash
npm run build:theme
```

**Current look:** warm light default (`#faf8f5` paper background, `#1c1917` ink text, `#b5341c` rubric vermilion accent — the red medieval scribes used for emphasis). **Fraunces** for headings, **Source Sans 3** for body, **JetBrains Mono** for code. Slides are left-aligned. Syntax highlighting uses [`theme/highlight-wouter.css`](theme/highlight-wouter.css).

Fonts are loaded via `<link>` tags in each deck's `<head>` (not via CSS `@import` — Sass can't hoist an import above the compiled theme output, which makes it invalid CSS).

Signature details baked into the theme:

- **Title slide** (`class="title-slide"`): editorial layout — vermilion accent bar, uppercase conference/date eyebrow, large serif title, and a bottom footer row with presenter info (left) and monochrome Princeton + CDH logos (right).
- **Closing slide** (`class="closing-slide"`): mirrors the title slide — accent bar, "Thank you" eyebrow, italic serif heading, email + Bluesky/GitHub icons, same footer.
- **Section breaks** (`class="section-slide"` + `data-background-color="#2a2420"`): numbered kicker in mono, large italic serif heading.
- `<em>` renders in Fraunces italic, list markers and link underlines pick up the accent.
- Decks run with `center: false` so headings sit at the same height on every slide.

> **Load-bearing rule — do not remove.** The theme pins `.reveal .slides > section { top: 0 }`. With `center: false`, reveal leaves `top: auto` on absolutely positioned sections, and because the full-bleed slides (title/section/closing, `height: 100%`, `display: flex !important`) stay in layout even when hidden (reveal hides past/future slides with `opacity: 0`, not `display: none`), later sections resolve their static position *below* them — content lands a full slide-height off-screen. Symptom if removed: slides 2+ show only their background at normal zoom. Caveat: the rule covers horizontal slides only; vertical stacks (`section > section`) would need the same treatment.

### Accent palettes

Paper and ink stay constant; the accent swaps per deck via `<body data-palette="...">`:

| Palette | Accent | On dark slides |
| --- | --- | --- |
| `rubric` (default) | `#b5341c` vermilion | `#eda584` |
| `lapis` | `#2e4fa3` ultramarine | `#a3b6e8` |
| `verdigris` | `#1d7368` copper green | `#8fd0c6` |
| `tyrian` | `#6d597a` murex purple | `#cbbfd4` |
| `archive` | `#4662ac` Prosody Archive blue | `#9eb0dc` |

The first four are historic pigments/manuscript inks; `archive` matches the Princeton Prosody Archive branding. The palette drives the accent bar, eyebrows, links, list markers, `<strong>`, progress bar, controls, and syntax-highlight keywords — all via the `--w-accent` / `--w-accent-light` CSS custom properties. Archive decks use `#262b3c` (PPA blue mixed into ink) as `data-background-color` on section-break slides instead of the default warm brown `#2a2420` — `data-background-color` can't read CSS variables, so the hex is set per slide.

### Animated title slide (floating verses)

The poetic-canon deck ([`decks/2026-06-poetic-canon/`](decks/2026-06-poetic-canon/index.html)) has a title slide with verse "clippings" drifting up the right side, driven by Matter.js physics ([`assets/scripts/floating-verses.js`](assets/scripts/floating-verses.js) + `plugins/matter/matter.min.js`). To reuse it in another deck:

1. Add `title-slide--animated` to the title slide and `<div class="title-slide__zone" aria-hidden="true"></div>` as its first child.
2. Load `matter.min.js` and `floating-verses.js`, then copy the lifecycle script block from the poetic-canon deck.

How the pieces fit (the contract future-you will forget):

- **Verses**: `FloatingVerses.start(zone)` / `.stop()` — the deck starts it on the title slide and stops it on every navigation. Falls back to a static scatter for `prefers-reduced-motion` and `?print-pdf`. Tuning knobs live in `CONFIG`, the quote pool in `LINES` (max two verse lines per slip; attribution = poet name only, `Virgil (transl. Dryden)` for translations; slips tinted with the PPA tricolor, never the same hue twice in a row).
- **Scrims**: the paper-colored gradients that dim slips behind the title/logos are gated by the `title-slide--scrims` class, which the deck JS adds only *after* the slide transition ends (`slidetransitionend` + a fallback timer that must match reveal's transition durations: 800/400/1200&nbsp;ms). Off-states have `transition: none` on purpose — any scrim opacity during a cross-fade paints a cream ghost box over the next slide. The fade-in lives only on the on-state, which never runs mid-transition.
- `reveal.is-transitioning` (added/removed by the same deck JS) hides scrims and the zone during cross-fades as a belt-and-braces layer.

All theme variables are also exposed as CSS custom properties (`--r-background-color`, `--r-link-color`, etc.) for per-deck tweaks in HTML.

## Plugins

Vendored chart/diagram libraries live in `plugins/` and are demoed in [`decks/2026-06-plugin-showcase/`](decks/2026-06-plugin-showcase/index.html). The template has a commented block showing how to enable each one.

| Library | Use for | How it loads |
| --- | --- | --- |
| [Chart.js](https://www.chartjs.org/) | Bar/line/etc. charts on `<canvas>` | Plain script; draw on a `data-state` event |
| [reveal.js-mermaid-plugin](https://www.npmjs.com/package/reveal.js-mermaid-plugin) | Flowcharts/diagrams from text | Reveal plugin (`RevealMermaid`) |
| [reveal.js-d3](https://github.com/gcalmettes/reveal.js-d3) | d3 figures animated by fragments | Reveal plugin (`Reveald3`) + `d3.min.js`; figure lives in its own HTML file with a `_transitions` array |
| [reveal-wordcloud](https://gitlab.com/andersjohansson/reveal-wordcloud) | Word clouds from weighted word lists | Plain script **after** `Reveal.initialize()` (patched to resolve wordcloud2.js relative to itself) |
| [railroad-diagrams](https://github.com/tabatkins/railroad-diagrams) | Syntax/grammar diagrams | ES module, import in `<script type="module">` + its CSS |

Chart.js, d3, and the mermaid plugin come from npm and are copied into `plugins/` by `npm run sync-vendor`; the other three are committed directly in `plugins/`.

## Upgrade reveal.js

```bash
npm update reveal.js
npm run sync-reveal
```

This copies the latest `dist/` from `node_modules/reveal.js` into `reveal/dist/` so all decks keep working offline and on GitHub Pages.

## GitHub Pages

The workflow in [`.github/workflows/pages.yml`](.github/workflows/pages.yml) deploys on push to `main`/`master`.

1. Enable **GitHub Pages** in repo settings → Source: **GitHub Actions**
2. Push to `main`

Each deck is published at:

```text
https://<username>.github.io/slidedecks/decks/<deck-name>/
```

The homepage lists all decks at:

```text
https://<username>.github.io/slidedecks/
```

## Repository layout

```text
slidedecks/
├── reveal/dist/          # reveal.js runtime (synced from npm)
├── plugins/              # vendored chart/diagram libraries (see Plugins)
├── theme/
│   ├── source/wouter.scss
│   └── wouter.css
├── assets/
│   ├── logos/            # curated SVGs referenced by decks
│   ├── brand/            # raw Princeton + CDH brand archives (not deployed)
│   └── scripts/          # shared deck scripts (floating-verses.js)
├── template/             # starter deck for new talks
├── decks/                # one folder per conference talk
├── experiments/          # prototypes (superseded; see folder READMEs)
├── scripts/              # build/dev tooling (node)
├── index.html            # homepage (auto-generated)
└── package.json
```

## Scripts

| Command | Description |
| --- | --- |
| `npm start` | Build everything and serve on port 8080 |
| `npm run new -- <name>` | Create a new deck from the template |
| `npm run build:theme` | Compile Sass theme to CSS |
| `npm run build:index` | Regenerate the homepage deck list |
| `npm run sync-reveal` | Copy reveal.js dist from node_modules |
| `npm run sync-vendor` | Copy Chart.js, d3, Matter.js, and mermaid plugin into plugins/ |
| `npm run build` | Full build (sync + vendor + theme + index) |
