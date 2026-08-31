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
| `export-review.mjs` | Not an audit — the review pack. Writes one Word document per module plus a cover sheet, every entry with its full text, its id and a tick box, in the order worth reviewing them. Shares `js/lib/review-units.js` with the review page so the document and the app can never disagree about what there is |
| `access-live-test.mjs` | 27 assertions on the live access endpoint. Stands up a mock implementing the same contract as `AccessControl.gs` and drives the real admin page against it: add, suspend, restore, remove, toggle, and every one of those with a wrong key. Two of the assertions exist only to stop a regression that would be invisible otherwise — **no four-digit PIN may appear in any request body**, and **the admin key must not reach browser storage** |
| `materials-test.mjs` | 80 assertions on the electrode-materials data: that **no capacity is stored** anywhere in `materials.json`, that every derived capacity matches what the field quotes, that every standard potential resolves to a citation, and that the water window comes out at 1.229 V by three independent routes. Also checks the pathway's inputs: every `mechanismId` resolves, a null mechanism carries its reason, and every material note on a technique or a symptom names a real material **and** has the matching `relatedIds` entry — without which the note renders nowhere and the pathway silently reports a content gap instead of a broken link. It also checks that a row citing a source which names no upstream reference carries a visible caution. No browser, no server |

All of them but `pwa-audit.mjs`, `analysis-test.mjs` and `materials-test.mjs` walk every route the app actually renders — 131 of them — rather than a list somebody maintains by hand.

## The one that will fail first

`perf-audit.mjs`, on the shell-payload row. It has now fired twice. The second time, adding endpoint-reading code to `access.js` — which `app.js` imports statically — took the shell from 146.8 KB to 150.4 KB, and the fix was the same one that created `access-gate.js`: move it into a module imported only when it is needed. A module imported statically by `app.js` is downloaded on **every** visit, however rarely its function is called — three of them were, costing 41 KB, before anyone measured. When you add an import to `app.js`, run this.

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
