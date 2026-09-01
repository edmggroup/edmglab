/**
 * EDMGLAB — Service worker (Architecture v0.2 §K.2)
 *
 * MUST live at the site root. A service worker's default control scope is the
 * directory it is served from, so one served from /pwa/ could only control
 * /pwa/*. The scope can be widened with a Service-Worker-Allowed header, but
 * GitHub Pages cannot set custom headers — hence the root.
 *
 * Two strategies, because treating all files alike is the most common PWA
 * mistake:
 *
 *   APP SHELL (HTML, CSS, JS, vendor libs, icons) — CACHE FIRST.
 *     Precached on install. Opens instantly and works fully offline.
 *
 *   DATA (/data/*.json) — STALE WHILE REVALIDATE.
 *     Serve the cached copy immediately so the app is fast, then quietly
 *     fetch a fresh copy for next time. Content updates therefore reach
 *     students without them getting stuck behind a long cache lifetime.
 *
 * ── BUMP CACHE_VERSION WHENEVER SHELL FILES CHANGE ──
 * Old caches are deleted on activate, and app.js shows an "Update available"
 * banner when a new worker is waiting. Skipping this step is the single most
 * common reason a PWA keeps serving stale content on someone's phone long
 * after a fix has shipped.
 */

const CACHE_VERSION = 'edmglab-v31';
const DATA_CACHE = 'edmglab-data-v1';

/* Paths are RELATIVE so the app works both at a domain root and at a
   GitHub Pages project path such as /EDMGLAB/. */
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/tokens.css',
  './css/style.css',
  './css/responsive.css',
  './css/animations.css',
  './js/app.js',
  './js/router.js',
  './js/nav.js',
  './js/data.js',
  './js/ui.js',
  './js/search.js',
  './js/lib/storage.js',
  './js/lib/focus-trap.js',
  './js/lib/offline.js',
  './js/lib/access.js',
  './js/lib/access-gate.js',
  './js/lib/access-live.js',
  './js/lib/access-remote.js',
  './js/lib/anim-engine.js',
  './js/lib/anim-fullscreen.js',
  './js/lib/anim-components.js',
  './js/lib/diagram.js',
  './js/lib/sim-label.js',
  './js/lib/charts.js',
  './js/lib/expr.js',
  './js/lib/formula-view.js',
  './js/lib/csv-core.js',
  './js/lib/csv.js',
  './js/lib/csv-worker.js',
  './js/views/import.js',
  './js/views/preparation.js',
  './js/views/characterization.js',
  './js/views/fundamentals.js',
  './js/views/quiz.js',
  './js/views/glossary.js',
  './js/views/suggest.js',
  './js/views/analysis.js',
  './js/views/instruments.js',
  './js/views/materials.js',
  './js/views/pathway.js',
  './js/views/review.js',
  './js/lib/review-units.js',
  './js/lib/review-live.js',
  './js/lib/finalised.js',
  './js/echem/analysis.js',
  './js/echem/sim/scanrate.js',
  './js/lib/feedback.js',
  './js/chemistry/index.js',
  './js/chemistry/sim/mechanism.js',
  './js/views/formulas.js',
  './js/views/formula.js',
  './js/views/calculators.js',
  './js/views/dashboard.js',
  './js/views/placeholder.js',
  './js/views/menu.js',
  './js/views/health.js',
  './js/views/demo.js',
  './js/views/admin.js',
  './js/battery-tester/index.js',
  './js/battery-tester/animations.js',
  './js/battery-tester/protocol-builder.js',
  './js/battery-tester/cells.js',
  './js/battery-tester/workflow.js',
  './js/lib/decision-tree.js',
  './js/lib/method-view.js',
  './js/views/method.js',
  './js/views/troubleshooting.js',
  './js/echem/index.js',
  './js/echem/electrodes.js',
  './js/echem/circuits.js',
  './js/echem/tafel.js',
  './js/echem/sim/complex.js',
  './js/echem/sim/cv.js',
  './js/echem/sim/gcd.js',
  './js/echem/sim/eis.js',
  './js/echem/sim/circuits.js',
  './js/echem/sim/tafel.js',
  './pwa/icons/icon-192.png',
  './pwa/icons/icon-512.png'
];

/* Vendor libraries and content files are NOT precached: the install must stay
   small enough that a first visit on campus wifi is quick. They are pulled in
   a few seconds later by the WARM message below, once the app has painted and
   the browser is idle — so the platform is fully offline-capable within
   seconds of a first visit, not only for the pages somebody happened to open.
   js/lib/offline.js has the full reasoning. */

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(async (cache) => {
      // addAll() rejects the whole batch if ANY file 404s, which would leave
      // the app with no cache at all. Add individually and log failures.
      await Promise.all(SHELL.map((url) =>
        cache.add(url).catch((e) => console.warn('[sw] precache skipped', url, e.message))
      ));
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k !== CACHE_VERSION && k !== DATA_CACHE)
          .map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

/* ══════════════════════════════════════════════════════════════════
   Messages from the page
   ══════════════════════════════════════════════════════════════════
   The page owns the LIST of content files (js/data.js is the one registry).
   This worker owns the CACHES. Neither needs to know the other's business,
   so the list arrives by message rather than being duplicated here — which
   is what would rot the moment somebody adds a data file.               */

self.addEventListener('message', (event) => {
  const msg = event.data || {};

  // Sent by app.js when the user clicks "Refresh" on the update banner.
  if (msg.type === 'SKIP_WAITING') { self.skipWaiting(); return; }

  /* ── WARM ──
     Fetch everything the app will need offline that is not already held.
     Called after boot on a connection the browser has not flagged as
     metered, and on demand from the health page. */
  if (msg.type === 'WARM') {
    const port = event.ports[0];
    event.waitUntil((async () => {
      const result = { cached: 0, fetched: 0, failed: [], total: (msg.urls || []).length };
      for (const url of msg.urls || []) {
        const cache = await caches.open(cacheFor(url));
        try {
          if (await cache.match(url)) { result.cached++; continue; }
          const res = await fetch(url, { cache: 'no-cache' });
          // A 404 here is a registered file nobody has written yet. That is
          // an authoring state, not a cache failure — do not store it, and
          // do not report it as an error the user can act on.
          if (res.ok) { await cache.put(url, res.clone()); result.fetched++; }
          else if (res.status !== 404) result.failed.push(`${short(url)} → ${res.status}`);
        } catch (e) {
          result.failed.push(`${short(url)} → ${e.message}`);
        }
      }
      port?.postMessage(result);
    })());
    return;
  }

  /* ── CACHE_STATUS ──
     What is REALLY in the cache. The health page reports this rather than
     the SHELL list, because the list is only an intention. */
  if (msg.type === 'CACHE_STATUS') {
    const port = event.ports[0];
    const vendorSet = new Set(msg.vendor || []);
    event.waitUntil((async () => {
      const shell = await group(SHELL.map((p) => new URL(p, self.location).href), CACHE_VERSION);
      const content = await group((msg.urls || []).filter((u) => !vendorSet.has(u)), DATA_CACHE);
      const vendor = await group([...vendorSet], CACHE_VERSION);
      port?.postMessage({ shell, content, vendor, version: CACHE_VERSION });
    })());
  }
});

/** Vendor libraries belong with the shell; content goes to the data cache. */
function cacheFor(url) {
  return url.includes('/data/') ? DATA_CACHE : CACHE_VERSION;
}

function short(url) {
  try { return new URL(url).pathname.replace(/^.*\/(?=[^/]+\/[^/]+$)/, ''); }
  catch { return url; }
}

async function group(urls, cacheName) {
  const cache = await caches.open(cacheName);
  const missing = [];
  let have = 0;
  for (const u of urls) {
    if (await cache.match(u)) have++;
    else missing.push(short(u));
  }
  return { have, total: urls.length, missing };
}

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Never touch anything but same-origin GETs.
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  /* ── Access config: NETWORK FIRST ──
     access.json is the one data file where a stale copy has a visible
     consequence: an admin turning the PIN gate on or off would not take
     effect until someone's second visit. Network first (with a cache
     fallback so it still works offline) makes the change apply immediately. */
  if (url.pathname.endsWith('/data/access.json')) {
    event.respondWith((async () => {
      const cache = await caches.open(DATA_CACHE);
      try {
        const res = await fetch(req, { cache: 'no-store' });
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch {
        return (await cache.match(req)) || new Response('{"enabled":false}', {
          headers: { 'Content-Type': 'application/json' }
        });
      }
    })());
    return;
  }

  // ── Data: stale-while-revalidate ──
  if (url.pathname.includes('/data/') && url.pathname.endsWith('.json')) {
    event.respondWith((async () => {
      const cache = await caches.open(DATA_CACHE);
      const cached = await cache.match(req);
      const network = fetch(req).then((res) => {
        if (res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => null);
      // Serve cache immediately if we have it; otherwise wait for the network.
      return cached || (await network) || new Response('{"items":[]}', {
        headers: { 'Content-Type': 'application/json' }
      });
    })());
    return;
  }

  // ── Everything else: cache first, fall back to network, then cache it ──
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res.ok && (url.pathname.includes('/vendor/') || url.pathname.includes('/assets/'))) {
        const cache = await caches.open(CACHE_VERSION);
        cache.put(req, res.clone());
      }
      return res;
    } catch {
      // Offline and not cached. For a navigation, hand back the shell —
      // the SPA router will render the right view from the hash.
      if (req.mode === 'navigate') {
        const shell = await caches.match('./index.html');
        if (shell) return shell;
      }
      return new Response('Offline and not cached.', { status: 503, statusText: 'Offline' });
    }
  })());
});
