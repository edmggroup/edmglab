# EDMGLAB

**Energy Devices and Materials Group — Research & Learning Platform**

An interactive platform for supercapacitors, batteries, electrode materials, characterisation and electrochemical analysis. Built for undergraduate researchers through to postdocs joining the group.

> **Build status: Stage 2 complete — both instrument modules are built.**
>
> The **Battery Tester** module covers the instrument, methods, cell formats and configurations, the twelve-step testing workflow, the protocol builder, troubleshooting and safety. The **Electrochemical Workstation** module covers the potentiostat and galvanostat, the three-electrode cell, the method library, CV / GCD / EIS simulators, the equivalent-circuit element explorer, Tafel analysis, method selection and troubleshooting.
>
> The **Formula library** and **Calculation workbench** are built: 28 formulas, each with the configuration it is valid for, and a calculator generated from the record itself. The workbench is organised by what you measured — enter a discharge curve's numbers once and everything that measurement supports is computed from them.
>
> **Fundamentals** is the entry point: 13 core quantities, each with a plain version and a research version of the SAME record so the two cannot drift. Its "Better than what?" page puts two electrodes on six normalisation bases at once and shows the ranking flip three-all — both authors can write "outperforms" truthfully about the same pair.
>
> **Storage chemistry** builds every mechanism from one quantity — the differential capacitance dQ/dV — and generates the voltammogram and the discharge curve from it side by side, so "capacitor-like" and "battery-like" read as one continuum. Its Quantity page slides a voltage window across a battery-type electrode and shows C = I·Δt/ΔV changing by a factor of fifty-nine, next to a real capacitor where it does not move at all.
>
> **Electrode preparation** explains what each formulation and processing choice does — and, the part that matters, how a mistake at each step shows up once the cell is on test. **Characterisation** covers eleven techniques, each leading with what it CANNOT tell you.
>
> **Data import** reads exports from your battery tester and workstation — comma, tab, semicolon or pipe separated, including European decimal-comma files and instrument metadata preambles — parses them in a Web Worker, reports exactly what was read before it draws anything, and plots them. Your file never leaves the browser tab.
>
> **Learning check** asks 18 judgement questions — which quantity is valid, what a result does not license — where every option explains itself, including the wrong ones, and "you cannot tell from this alone" is frequently the right answer. The **glossary** gives 35 terms as a definition plus the trap.
>
> The shared foundation — application shell, animation engine, diagram engine, enforced simulation labelling, chart layer, expression/unit engine, CSV parser and data health check — is in place. One module remains unbuilt: **Electrode Materials**, marked `P7` in the sidebar. It needs literature values with citations, and it stays unbuilt until the group supplies them.
>
> **All scientific content is draft**, marked as such in the interface, and pending review by the research group. The safety section should be reviewed with your safety officer before anyone treats it as guidance.

---

## Running it locally

You need a local web server. Double-clicking `index.html` will **not** work — browsers block `fetch()` of local JSON files opened directly from disk, so the app would load with no content.

```bash
python3 -m http.server 8000
```

Then open **http://localhost:8000**.

Any static server works equally well (`npx serve`, VS Code's Live Server, and so on). No build step, no `npm install`, no bundler.

## Deploying

Push to the `main` branch. GitHub Pages rebuilds automatically, usually within a minute. There is nothing else to configure.

**Whenever you change a file in the app shell** (anything in `/css`, `/js`, or `index.html`), bump `CACHE_VERSION` in `service-worker.js`. Otherwise returning visitors keep the old cached version until their browser decides otherwise.

## Adding content

You do not need to install anything, or even leave your browser. Open the relevant file under `/data/` in GitHub's web editor, add your entry, commit. The site updates itself.

See **[CONTRIBUTING.md](CONTRIBUTING.md)** for the walkthrough, and run the **Data Health Check** (in the sidebar, or `#/health`) before you tell anyone the new content is ready.

---

## How it is put together

A **single-page application**: one `index.html`, loaded once, after which navigation swaps content in place. No page reloads, so module switching is effectively instant, and the whole platform works offline after the first visit.

```
index.html              The only HTML file — shell and mount points
manifest.json           PWA manifest       ┐ both MUST stay at the root:
service-worker.js       Offline caching    ┘ a service worker only controls its own folder

/css
  tokens.css            EVERY colour, spacing step and font size. Change the look here.
  style.css             Base styles and components
  responsive.css        Breakpoints: <600 mobile · 600–1023 tablet · ≥1024 desktop
  animations.css        UI motion + the reduced-motion block

/js
  app.js                Boot: theme, nav, routes, search, service worker
  router.js             Hash router with lazy view loading
  nav.js                THE navigation model — one array drives sidebar AND bottom bar
  data.js               The only file that knows where content comes from
  search.js             Universal in-memory search
  ui.js                 Shared renderers: cards, tables, badges, provenance
  /lib
    anim-engine.js      Shared animation engine — one rAF loop, all controls
    anim-components.js  SVG primitives: ions, electrons, electrodes, separators…
    diagram.js          Clickable block diagrams, driven by JSON
    sim-label.js        Enforced "Illustrative simulation" labelling
    charts.js           Chart.js wrapper: zoom, pan, inspect, reset, downsampling
    expr.js             Safe expression parser + SI unit engine (never eval)
    csv-core.js         Instrument-export parser: sniffing, roles, units
    csv.js              Import service — owns the worker, falls back safely
    csv-worker.js       Parses off the main thread
    formula-view.js     One renderer + one calculator for every formula
    method-view.js      The five-layer method record renderer
    decision-tree.js    Guided trees that always state what they cannot tell you
    storage.js          localStorage, namespaced and versioned
  /views                One file per screen, loaded on first visit

/data                   All content, as JSON. This is the database and the CMS.
/vendor                 Chart.js + zoom plugin, self-hosted (never a CDN)
/pwa/icons              App icons, including maskable
```

### Why single-page

Navigation never reloads the page, so switching modules is a DOM update (target: under 100 ms) rather than a full page load (400–800 ms on campus wifi). One shell file also makes offline caching far more robust than fifteen would be. Deep links still work and are shareable — `#/material/hard_carbon` is a real, bookmarkable URL.

### Why the content is JSON

Adding a formula, material or troubleshooting entry is a data edit, not a code change. That is what keeps the platform maintainable by a working scientist rather than a software team — and it means a content change arrives as a readable diff that a co-author can check for accuracy before it merges.

### Vendor libraries are self-hosted

Chart.js and its zoom plugin live in `/vendor/`, not on a CDN. A campus network's route to an international CDN is often slower than to our own origin; self-hosting also means the app works offline from the very first load, with no third-party availability or DNS dependency. They are loaded only on views that plot something.

---

## Optional PIN gate

EDMGLAB ships with a **4-digit PIN gate that is off by default**. Turn it on from the admin panel at `#/admin` (also in the sidebar under Support): set a PIN, generate the configuration, and commit it to `data/access.json`. Turn it off again by flipping `"enabled": false` in that file.

Two modes:

- **One shared PIN** for the whole group.
- **A PIN per person** — which also namespaces each person's saved progress, calculator history and preferences. On a shared lab PC, two students no longer overwrite each other's quiz progress.

### Be clear about what it is

> **This is a soft gate, not security — and it cannot be anything else on a static site.**
>
> There is no server here deciding who may receive a file. Anyone who knows the URL can open `data/formulas.json` directly and read it without ever seeing the PIN prompt. The gate stops someone casually opening EDMGLAB on a shared or unattended lab machine, signals that this is an internal tool, and keeps individual progress separate. It protects nothing.
>
> **The two-tier rule is unchanged: everything committed to this repository must still be safe to be public.** Turning the gate on is never permission to commit unpublished results, NDA material, personal data or credentials.
>
> If real access control is ever needed, it has to come from a server that can refuse the request — for this project that means serving restricted content from a Google Apps Script Web App behind institutional Google sign-in (`docs/ARCHITECTURE.md` §J), not a PIN in the browser.

The PIN itself is never written to the repository. What is stored is a PBKDF2-SHA256 derivation with a random salt and 150,000 iterations — not to protect the site, but to protect **the PIN**, since people reuse four-digit numbers on phones and bank cards. There are only 10,000 possible 4-digit PINs, so someone with the config file can eventually recover it; the iteration count makes that take real time rather than being instant. **Choose a PIN you do not use anywhere else.**

---

## Scientific rules the code enforces

These are not conventions someone has to remember. They are built into the system.

| Rule | Enforced by |
|---|---|
| Every numeric value declares where it came from | `ui.js` renders an **Unverified** badge for any value without a `provenance` |
| Literature and datasheet values cite a source | Health check raises an **error** if missing |
| Every formula states the configuration it is valid for | Health check requires `validContext` |
| A troubleshooting entry offers **multiple** possible causes | Health check **errors** on a single-cause entry — one symptom must never be presented as proving one cause |
| Simulated output is never mistakable for data | `sim-label.js` paints the banner itself and **refuses to render** a simulator that does not declare its governing model |
| Conceptual animations say they are conceptual | The animation engine paints the caption; a scene cannot omit it |
| No instrument specification is invented | `instruments.json` ships as an empty template — the group fills it from your own manuals |
| Reduced motion is respected | The engine renders a still frame; no scene can override it |
| The PIN gate never claims to be security | The disclaimer is on the gate screen itself and in the admin panel, not buried in documentation |

---

## Documentation

- `docs/ARCHITECTURE.md` — full system architecture (v0.2)
- `docs/INSTRUMENTATION-INTEGRATION.md` — the Battery Tester and Electrochemical Workstation module plan
- `CONTRIBUTING.md` — how to add content

## Browser support

Any current version of Chrome, Edge, Firefox or Safari, desktop or mobile. Uses ES modules, CSS custom properties, `IntersectionObserver` and service workers — all long-standing baseline features.
