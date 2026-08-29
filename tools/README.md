# Audit tools

**Nothing here is needed to run, edit or deploy EDMGLAB.** The platform is
still plain HTML, CSS and JavaScript with no build step. These are four
scripts that check things a person cannot reliably check by looking, across
130 routes, two themes and three screen widths.

They exist because every requirement they test had already been agreed and
then quietly broken somewhere: a link colour that was fine on the page and
failed inside a callout, a label at 10px that was legible on the monitor it
was drawn on, an offline mode that only worked for pages you had already
opened.

## Running them

You need Node and one package:

```bash
npm install playwright
python3 -m http.server 8000     # in the repository root, in another terminal
node tools/verify.mjs
```

| Script | What it proves |
|---|---|
| `verify.mjs` | Every route renders, no console errors, every sidebar link reaches a real view, the health check is clean, the sidebar fits at five widths |
| `a11y-audit.mjs` | Accessible names, visible focus, heading order, form labels, WCAG AA contrast **measured on the real rendered background**, 24×24 targets, focus containment in both overlays |
| `standing-audit.mjs` | The three standing requirements: nothing scrolls sideways, every chart stays inside its box (including with pinned axes), no text below the type floor |
| `offline-audit.mjs` | Install, visit **only the home page**, cut the network, then walk all 130 routes — the scenario the platform is actually for |
| `perf-audit.mjs` | Every row of the §I.1 performance budget: throttled first load, offline repeat load, view switches, search, a real 50,000-row CSV import, and the uncompressed shell payload |
| `pwa-audit.mjs` | Chrome's own install criteria, via `Page.getAppManifest` — plus the six things that decide whether Android shows the rich install dialog or the bar people dismiss |
| `analysis-test.mjs` | 41 numerical assertions on the scan-rate engine. Needs no browser and no server: `node tools/analysis-test.mjs` |

All of them but `pwa-audit.mjs` walk every route the app actually renders — 131 of them — rather than a list somebody maintains by hand.

## The one that will fail first

`perf-audit.mjs`, on the shell-payload row. A module imported statically by `app.js` is downloaded on **every** visit, however rarely its function is called — three of them were, costing 41 KB, before anyone measured. When you add an import to `app.js`, run this.

## Three notes on how they measure

**Colour is resolved by painting it.** `color-mix()`, `color(srgb …)` and
translucent washes reach computed style in forms a regular expression gets
wrong, and a wrong background invents failures that send you off adjusting
colours that were fine. The audit fills a 1×1 canvas and reads the pixel
back, then composites stacked translucent layers the way the eye does.

**Text inside a drawn symbol is not body text.** The charge on an ion disc,
the V in a voltmeter, the W on a Warburg element: those are sized by the
symbol that contains them and cannot be enlarged without redrawing it. They
are reported separately rather than counted as failures. Diagram labels on a
phone are reported separately too — the answer there is the Enlarge control,
and the audit checks that every diagram carrying text actually offers one.
