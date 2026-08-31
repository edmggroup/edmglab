/**
 * EDMGLAB — Offline warm-up
 *
 * THE PROBLEM THIS EXISTS TO FIX
 *
 * The service worker precaches the app shell, so "works offline" was true in
 * the narrow sense: the interface opened. But content files and the chart
 * library are fetched on first use, which means they were only in the cache
 * for pages somebody had already opened. Install EDMGLAB on a phone in the
 * office, walk into a basement lab, open the CV simulator for the first time
 * — no chart library, no method records, an empty page. That is precisely the
 * situation this platform is meant to be useful in.
 *
 * So after boot, and only once the page has gone quiet, the app asks the
 * service worker to fetch the rest: every registered content file and the
 * three vendor scripts. Together that is under a megabyte, which is a few
 * seconds on campus wifi and nothing at all on a second visit.
 *
 * WHY THE WORKER DOES THE FETCHING
 * The page owns the LIST (it comes from data.js, the one registry). The
 * worker owns the CACHES and their names. Passing the list across a message
 * channel keeps both facts in one place each, instead of the page having to
 * hard-code a cache name that the worker is free to change.
 *
 * WHEN IT DOES NOT RUN
 * Never on a metered or data-saver connection, and never when the browser
 * reports 2g. Someone on a phone plan should not have a megabyte spent for
 * them without asking; the health page has a button for that case.
 */

import { cacheableUrls } from '../data.js';

/** The plot libraries. Large, lazily loaded, and useless if absent offline. */
const VENDOR = ['chart.umd.min.js', 'chartjs-plugin-zoom.min.js', 'hammer.min.js']
  .map((f) => new URL(`../../vendor/${f}`, import.meta.url).href);

/* Configuration files. Not content, so they are not in data.js's registry —
   but both fail soft rather than loudly, which means that offline without
   them the PIN gate silently disables itself and corrections silently lose
   the repository they were going to. Warm them so neither happens quietly. */
const CONFIG = ['access.json', 'feedback.json', 'review.json']
  .map((f) => new URL(`../../data/${f}`, import.meta.url).href);

function urls() { return [...cacheableUrls(), ...CONFIG, ...VENDOR]; }

/** Ask the active worker something and wait for its reply. */
function ask(message, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const sw = navigator.serviceWorker?.controller;
    if (!sw) { reject(new Error('no active service worker')); return; }
    const ch = new MessageChannel();
    const timer = setTimeout(() => reject(new Error('service worker did not reply')), timeoutMs);
    ch.port1.onmessage = (e) => { clearTimeout(timer); resolve(e.data); };
    sw.postMessage(message, [ch.port2]);
  });
}

/** True when the browser says the connection should not be spent freely. */
export function shouldHoldBack() {
  const c = navigator.connection;
  if (!c) return false;
  return Boolean(c.saveData) || /^(slow-2g|2g)$/.test(c.effectiveType || '');
}

/**
 * Fetch everything that is not already cached.
 * @returns {Promise<{cached:number,fetched:number,failed:string[],total:number}>}
 */
export function warm() {
  return ask({ type: 'WARM', urls: urls() });
}

/**
 * What is actually in the cache right now — the honest answer to "is this
 * available offline?", which is not the same as "did we intend to cache it".
 * @returns {Promise<{shell:{have:number,total:number,missing:string[]},
 *                    content:{have:number,total:number,missing:string[]},
 *                    vendor:{have:number,total:number,missing:string[]},
 *                    version:string}>}
 */
export function status() {
  return ask({ type: 'CACHE_STATUS', urls: urls(), vendor: VENDOR }, 20000);
}

/**
 * Run the warm-up once per session, after the page has gone quiet.
 * Failure is silent by design: the app still works, it is just not yet fully
 * offline-capable, and the health page reports that plainly.
 */
export function warmOnIdle() {
  if (!('serviceWorker' in navigator)) return;
  if (shouldHoldBack()) {
    console.info('[offline] warm-up skipped — the browser reports a metered or slow connection.');
    return;
  }
  const go = () => {
    navigator.serviceWorker.ready
      .then(() => warm())
      .then((r) => {
        if (r?.failed?.length) console.warn('[offline] warm-up incomplete', r.failed);
        else console.info(`[offline] ready — ${r.cached + r.fetched}/${r.total} files cached`);
      })
      .catch((e) => console.info('[offline] warm-up unavailable:', e.message));
  };
  // 3 s after load, and only when the browser is idle: first paint, first
  // route and the core data fetch all matter more than this does.
  const start = () => (window.requestIdleCallback
    ? requestIdleCallback(go, { timeout: 8000 })
    : setTimeout(go, 3000));
  if (document.readyState === 'complete') setTimeout(start, 3000);
  else window.addEventListener('load', () => setTimeout(start, 3000), { once: true });
}
