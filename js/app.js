/**
 * EDMGLAB — Application boot
 * (Architecture v0.2 §A.5)
 *
 * Boot order matters and is deliberate:
 *   1. Theme and mode are applied by an inline script in index.html BEFORE
 *      first paint, so there is no flash of the wrong theme. This file only
 *      wires the toggles.
 *   2. Shell chrome (sidebar, bottom nav) renders from the single nav model.
 *   3. Routes register; the router resolves the current hash.
 *   4. Core data loads in the background and feeds the search index.
 *   5. The service worker registers last — never blocking first paint.
 */

import * as nav from './nav.js';
import * as router from './router.js';
import * as store from './lib/storage.js';
import * as data from './data.js';
import { search, renderResults } from './search.js';
import { requireAccess } from './lib/access.js';
/* charts.js and anim-engine.js are NOT imported here.
   Between them they are 26 KB, and app.js wants one function from each: one
   to re-theme live charts when the theme is toggled, one to stop animations
   when the tab is hidden. Neither can matter until a view has actually drawn
   a chart or mounted a scene — and that view imports the module itself. So
   they are reached through the module cache when they are already loaded and
   skipped entirely when they are not. A student reading concept pages never
   downloads either. (Architecture §I.2: "Chart.js never downloads for a
   student who only reads concept pages" — the WRAPPERS were still doing so.)
   loadedModule() below returns the module only when a view has already
   imported it, and null otherwise. */
import { trap } from './lib/focus-trap.js';
import { warmOnIdle } from './lib/offline.js';

const root = document.documentElement;
const app = document.querySelector('.app');

/**
 * Reach a module ONLY if something else has already loaded it.
 *
 * A bare dynamic import would fetch it, which is exactly what we are avoiding.
 * A module that has been imported once is in the module map, so a second
 * import() of the same specifier resolves from memory without a request — but
 * there is no way to ask "is it there?" without starting that import. The flag
 * is set by the modules themselves on first evaluation, which costs each of
 * them one line and makes the question answerable.
 */
function loadedModule(flag, path) {
  return window[flag] ? import(path) : null;
}

/* ══════════════════════════════════════════════════════════
   0 · Optional PIN gate
   ══════════════════════════════════════════════════════════
   Resolves immediately when the gate is off (the default). When it is on,
   this awaits the PIN screen before the shell is revealed, and switches
   storage to that person's namespace so progress stays separate on a
   shared lab machine.

   NOTE: this is a soft gate, not security — see the header of
   js/lib/access.js. It never gates the DATA, only the interface. */

const access = await requireAccess().catch((e) => {
  console.warn('[app] access check failed, continuing ungated', e);
  return { gated: false, user: null };
});

root.classList.remove('booting');

if (access.user) {
  // Re-apply preferences from the now-correct per-user namespace.
  const t = store.get('theme');
  if (t === 'light' || t === 'dark') root.setAttribute('data-theme', t);
  const m = store.get('mode');
  if (m === 'learn' || m === 'research') root.setAttribute('data-mode', m);
}

/* ══════════════════════════════════════════════════════════
   1 · Shell chrome
   ══════════════════════════════════════════════════════════ */

nav.renderSidebar(document.getElementById('app-sidebar'));
nav.renderBottomNav(document.getElementById('app-bottomnav'));

/* ── Mobile / tablet nav drawer ──
   The drawer is modal over the content, so while it is open the rest of the
   shell must be unreachable — by Tab and by a screen reader alike. That is
   what focus-trap.js does; without it a keyboard user tabs out of the open
   drawer into links they cannot see. */
const navToggle = document.getElementById('nav-toggle');
const scrim = document.getElementById('sidebar-scrim');
const sidebar = document.getElementById('app-sidebar');
let releaseNav = null;

function setNav(open, restoreTo) {
  const was = app.classList.contains('nav-open');
  app.classList.toggle('nav-open', open);
  navToggle.setAttribute('aria-expanded', String(open));
  scrim.hidden = !open;

  if (open && !was) {
    /* Only trap when the drawer is actually overlaying content. At desktop
       width the sidebar is permanent furniture, not a dialog, and trapping
       focus in it would strand the user. The scrim is the reliable tell:
       responsive.css hides it above 1024px. */
    if (getComputedStyle(scrim).display !== 'none') {
      releaseNav = trap(sidebar, { also: [navToggle, scrim], onEscape: () => setNav(false) });
    }
  } else if (!open && was) {
    releaseNav?.(restoreTo);
    releaseNav = null;
  }
}
navToggle.addEventListener('click', () => setNav(!app.classList.contains('nav-open')));
scrim.addEventListener('click', () => setNav(false));
/* Any navigation closes the drawer — otherwise it hangs open over the new
   view. Focus goes to <main> rather than back to the hamburger: the user
   asked for a new page, so that is where a screen reader should land. */
window.addEventListener('hashchange', () => setNav(false, document.getElementById('main')));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && app.classList.contains('nav-open')) setNav(false);
});

/* ══════════════════════════════════════════════════════════
   2 · Theme and mode
   ══════════════════════════════════════════════════════════ */

document.getElementById('theme-btn').addEventListener('click', () => {
  const next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  root.setAttribute('data-theme', next);
  store.set('theme', next);
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    'content', next === 'light' ? '#f6f8fa' : '#0e1116');
  // Only when a chart actually exists to re-theme.
  loadedModule('__edmglabCharts', './lib/charts.js')?.then((m) => m.retheme());
});

document.querySelectorAll('[data-mode-set]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const mode = btn.dataset.modeSet;
    root.setAttribute('data-mode', mode);
    store.set('mode', mode);
  });
});

/* ══════════════════════════════════════════════════════════
   3 · Routes
   ══════════════════════════════════════════════════════════
   Only Phase 0 views exist today. Every other module route falls through
   to the placeholder, which states which roadmap phase builds it — an
   honest empty state rather than a 404.                                   */

router.route('/',       () => import('./views/dashboard.js'), { title: 'Dashboard' });
router.route('/demo',   () => import('./views/demo.js'),      { title: 'Engine Demo' });
router.route('/health', () => import('./views/health.js'),    { title: 'Data Health Check' });
router.route('/menu',   () => import('./views/menu.js'),      { title: 'Menu' });
router.route('/admin',  () => import('./views/admin.js'),     { title: 'Access Control' });

// ── Battery Tester (Stage 1B) ──
router.route('/battery-tester',          () => import('./battery-tester/index.js'), { title: 'Battery Tester' });
router.route('/battery-tester/:section', () => import('./battery-tester/index.js'), { title: 'Battery Tester' });

// ── Electrochemical Workstation (Stage 1B) ──
router.route('/workstation',          () => import('./echem/index.js'), { title: 'Electrochemical Workstation' });
router.route('/workstation/:section', () => import('./echem/index.js'), { title: 'Electrochemical Workstation' });

// One route serves methods from BOTH modules — techniques are looked up by
// name, not by which instrument happens to own them.
router.route('/method/:id', () => import('./views/method.js'), { title: 'Method' });

// Troubleshooting: ONE engine over both modules' symptom libraries, because a
// student with a symptom does not know which module it belongs to.
router.route('/troubleshooting',     () => import('./views/troubleshooting.js'), { title: 'Troubleshooting' });
router.route('/troubleshooting/:id', () => import('./views/troubleshooting.js'), { title: 'Troubleshooting' });

/* ── Formulas and calculators (Roadmap P1, P2) ──
   Two views over ONE data file. The library is reference-first (what does this
   equation mean, where is it valid); the workbench is measurement-first (I have
   a discharge curve, what can I get from it). Neither duplicates the other's
   arithmetic — both call js/lib/expr.js. */
router.route('/formulas',    () => import('./views/formulas.js'),    { title: 'Formula Library' });
router.route('/formula/:id', () => import('./views/formula.js'),     { title: 'Formula' });
router.route('/calculators', () => import('./views/calculators.js'), { title: 'Calculation Workbench' });

/* ── Data import (Roadmap P4) ──
   The only place in EDMGLAB that handles the user's own measured data. Parsing
   runs in a Web Worker so a long cycling export cannot freeze the interface. */
router.route('/import', () => import('./views/import.js'), { title: 'Data Import' });

/* ── Electrode preparation and characterisation (Roadmap P9) ──
   The PREPARATION and CHARACTERISATION stages of the pathway. Both are
   methodology rather than measured values: what each choice or technique can
   and — the field that matters — cannot tell you. */
router.route('/preparation',            () => import('./views/preparation.js'),    { title: 'Electrode Preparation' });
router.route('/preparation/:section',   () => import('./views/preparation.js'),    { title: 'Electrode Preparation' });
router.route('/characterization',       () => import('./views/characterization.js'), { title: 'Characterisation' });
router.route('/characterization/:id',   () => import('./views/characterization.js'), { title: 'Characterisation' });

/* ── Storage chemistry (Roadmap P8) ──
   The CHEMISTRY/PHYSICS stage. One differential-capacitance model generates
   both the voltammogram and the discharge curve, so "capacitor-like" and
   "battery-like" read as one continuum rather than two theories. */
router.route('/chemistry',          () => import('./chemistry/index.js'), { title: 'Storage Chemistry' });
router.route('/chemistry/:section', () => import('./chemistry/index.js'), { title: 'Storage Chemistry' });

/* ── Fundamentals (Roadmap P1) ──
   The CONCEPT stage and the entry point of the pathway. Every record carries a
   Learn and a Research version of the same idea, so the two cannot drift. */
router.route('/fundamentals',          () => import('./views/fundamentals.js'), { title: 'Fundamentals' });
router.route('/fundamentals/:section', () => import('./views/fundamentals.js'), { title: 'Fundamentals' });

/* ── Learning check and glossary (Roadmap P12) ──
   The quiz tests judgement rather than recall: which quantity is valid, and
   what a result does not license. Every option explains itself, including the
   wrong ones, and "you cannot tell from this alone" is often the right answer. */
router.route('/learning', () => import('./views/quiz.js'),     { title: 'Learning Check' });
router.route('/glossary', () => import('./views/glossary.js'), { title: 'Glossary' });

/* ── Corrections (Roadmap P14) ──
   The one route that takes a query string: `#/suggest?about=#/formula/c_rate`
   arrives from the footer of the page being corrected. */
router.route('/suggest', () => import('./views/suggest.js'), { title: 'Suggest a correction' });

/* ── Scan-rate analysis (Roadmap P6) ──
   b-value and Dunn deconvolution, on a simulated series whose decomposition is
   known in advance and on the user's own voltammograms. */
router.route('/analysis', () => import('./views/analysis.js'), { title: 'Scan-rate Analysis' });

/* ── Our instruments (Architecture §E.5) ──
   The one view whose content this platform will never write. */
router.route('/instruments', () => import('./views/instruments.js'), { title: 'Our Instruments' });

router.start(document.getElementById('view-outlet'));

/* ══════════════════════════════════════════════════════════
   4 · Search
   ══════════════════════════════════════════════════════════ */

const overlay = document.getElementById('search-overlay');
const panel = overlay.querySelector('.overlay-panel');
const input = document.getElementById('search-input');
const results = document.getElementById('search-results');
let releaseSearch = null;

function openSearch() {
  if (!overlay.hidden) return;
  overlay.hidden = false;
  input.value = '';
  renderResults(results, [], '');
  // aria-modal alone does not stop Tab. The trap does, and it also restores
  // focus to the search button on close instead of dropping it to the top
  // of the document.
  releaseSearch = trap(panel, { onEscape: closeSearch });
  input.focus();
}
function closeSearch(restoreTo) {
  if (overlay.hidden) return;
  overlay.hidden = true;
  releaseSearch?.(restoreTo);
  releaseSearch = null;
}

document.getElementById('search-btn').addEventListener('click', openSearch);
document.getElementById('search-close').addEventListener('click', () => closeSearch());
overlay.addEventListener('click', (e) => { if (e.target === overlay) closeSearch(); });
// Following a result is a navigation: land on the new view, not back on the
// search button the user has finished with.
overlay.addEventListener('click', (e) => {
  if (e.target.closest('.result-item')) closeSearch(document.getElementById('main'));
});

let searchTimer = null;
input.addEventListener('input', () => {
  clearTimeout(searchTimer);
  // 90 ms is below the threshold where typing feels laggy, but enough to
  // avoid re-ranking on every keystroke of a fast typist.
  searchTimer = setTimeout(() => {
    renderResults(results, search(input.value), input.value);
  }, 90);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !overlay.hidden) { closeSearch(); return; }   // belt and braces: the trap also handles this
  // "/" opens search, but never while the user is typing in a field.
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
  if (e.key === '/' && !typing && overlay.hidden) { e.preventDefault(); openSearch(); }
});

/* ══════════════════════════════════════════════════════════
   5 · Background data warm-up
   ══════════════════════════════════════════════════════════
   Core files load in parallel after first paint so search works immediately
   without delaying the initial render. A failure here is non-fatal: content
   files are authored progressively and may legitimately not exist yet.     */

data.loadCore().catch((e) => console.warn('[app] core data warm-up failed', e));

/* Once the page is quiet, pull the REST of the content and the plot libraries
   into the cache so the platform is usable offline in full — not just on the
   pages this visit happened to open. Skipped on a metered connection; see
   js/lib/offline.js. */
warmOnIdle();

/* ══════════════════════════════════════════════════════════
   6 · Housekeeping
   ══════════════════════════════════════════════════════════ */

// Stop every animation when the tab is hidden — no point burning a phone
// battery drawing frames nobody is looking at.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  loadedModule('__edmglabAnim', './lib/anim-engine.js')?.then((m) => m.pauseAll());
});

/* ══════════════════════════════════════════════════════════
   7 · Service worker
   ══════════════════════════════════════════════════════════
   Registered last, and never on the critical path. The update banner is the
   important part: without it, a fix can sit behind a stale cache on
   someone's phone for a long time (Architecture §K.2).                     */

if ('serviceWorker' in navigator) {
  const registerSW = () => {
    navigator.serviceWorker.register(new URL('../service-worker.js', import.meta.url), { scope: './' })
      .then((reg) => {
        reg.addEventListener('updatefound', () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener('statechange', () => {
            // A worker that reaches "installed" while one is already in
            // control means a NEW version is waiting.
            if (sw.state === 'installed' && navigator.serviceWorker.controller) showUpdateBanner(reg);
          });
        });
      })
      .catch((e) => console.warn('[app] service worker registration failed', e));
  };

  /* Must handle BOTH cases. This module has a top-level `await` for the PIN
     gate, so by the time execution reaches here the window `load` event may
     already have fired — and a listener added after the fact never runs,
     which would silently disable offline support entirely. */
  if (document.readyState === 'complete') registerSW();
  else window.addEventListener('load', registerSW, { once: true });
}

function showUpdateBanner(reg) {
  const banner = document.getElementById('update-banner');
  if (!banner) return;
  banner.hidden = false;
  document.getElementById('update-reload').addEventListener('click', () => {
    reg.waiting?.postMessage({ type: 'SKIP_WAITING' });
    location.reload();
  });
}
