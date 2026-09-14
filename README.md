# devarshbagla.github.io

Personal site for [Devarsh Bagla](https://devarshbagla.github.io).

## What this is

A static portfolio: work, projects (including a live DeskPulse haptic demo), research with a custom SVG metrics chart, teaching timeline, an interactive workbench loop, contact, a Cmd/Ctrl+K command palette, and a Konami-code terminal easter egg.

## No build step

Plain HTML, CSS, and vanilla JavaScript ES modules. No framework, no bundler, no npm scripts.

**Why:** the site is small enough that a build pipeline would only add friction. Absolute clarity about what ships — open a file, read the source, serve it. GitHub Pages serves the repo as-is.

## File structure

```
index.html          page markup
404.html            branded not-found page
.nojekyll           disable Jekyll on GitHub Pages
assets/
  favicon.svg       amber waveform glyph
css/
  tokens.css        colour, type, space
  base.css          reset + defaults
  layout.css        shell / container
  components.css    header, nav, buttons
  sections.css      section layouts + interactive UI
js/
  main.js           boot
  theme.js          light / dark
  scope.js          hero oscilloscope
  reveal.js         scroll reveal + progress
  deskpulse.js      DeskPulse audio demo
  chart.js          research SVG chart
  workbench.js      build-loop diagram
  palette.js        command palette
  terminal.js       fake shell + Konami
  contact.js        copy-email control
```

## Run locally

Any static file server works. From the repo root:

```bash
python3 -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000).

You can also open `index.html` directly for a CSS-only glance, but **ES modules will not load over `file://` in Chromium** (CORS). Use a static server for the interactive layer.

## Deploy

Push to `main`. GitHub Pages serves the root of this repository. `.nojekyll` is present so paths are not filtered by Jekyll.
