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
import { retheme } from './lib/charts.js';
import { pauseAll } from './lib/anim-engine.js';
import { requireAccess } from './lib/access.js';

const root = document.documentElement;
const app = document.querySelector('.app');

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

/* ── Mobile / tablet nav drawer ── */
const navToggle = document.getElementById('nav-toggle');
const scrim = document.getElementById('sidebar-scrim');

function setNav(open) {
  app.classList.toggle('nav-open', open);
  navToggle.setAttribute('aria-expanded', String(open));
  scrim.hidden = !open;
}
navToggle.addEventListener('click', () => setNav(!app.classList.contains('nav-open')));
scrim.addEventListener('click', () => setNav(false));
// Any navigation closes the drawer — otherwise it hangs open over the new view.
window.addEventListener('hashchange', () => setNav(false));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setNav(false); });

/* ══════════════════════════════════════════════════════════
   2 · Theme and mode
   ══════════════════════════════════════════════════════════ */

document.getElementById('theme-btn').addEventListener('click', () => {
  const next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  root.setAttribute('data-theme', next);
  store.set('theme', next);
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    'content', next === 'light' ? '#f6f8fa' : '#0e1116');
  retheme();   // live charts pick up the new palette
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

router.start(document.getElementById('view-outlet'));

/* ══════════════════════════════════════════════════════════
   4 · Search
   ══════════════════════════════════════════════════════════ */

const overlay = document.getElementById('search-overlay');
const input = document.getElementById('search-input');
const results = document.getElementById('search-results');

function openSearch() {
  overlay.hidden = false;
  input.value = '';
  renderResults(results, [], '');
  input.focus();
}
function closeSearch() { overlay.hidden = true; }

document.getElementById('search-btn').addEventListener('click', openSearch);
document.getElementById('search-close').addEventListener('click', closeSearch);
overlay.addEventListener('click', (e) => { if (e.target === overlay) closeSearch(); });
overlay.addEventListener('click', (e) => { if (e.target.closest('.result-item')) closeSearch(); });

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
  if (e.key === 'Escape' && !overlay.hidden) { closeSearch(); return; }
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

/* ══════════════════════════════════════════════════════════
   6 · Housekeeping
   ══════════════════════════════════════════════════════════ */

// Stop every animation when the tab is hidden — no point burning a phone
// battery drawing frames nobody is looking at.
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseAll(); });

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
