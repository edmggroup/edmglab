/**
 * EDMGLAB — reading the live access list
 *
 * Split out of access.js for one measured reason: access.js is imported
 * statically by app.js and therefore downloaded on EVERY visit, while this
 * code is useful only to groups that have deployed the Apps Script endpoint.
 * Inlining it pushed the shell payload from 146.8 KB to 150.4 KB and broke the
 * §I.1 budget — the same trap that took `access-gate.js` out of access.js, and
 * the same fix.
 *
 * access.js reads data/access.json (which it must do anyway), and imports this
 * module only if that file names an endpoint. A group that has not deployed
 * one never downloads a byte of it.
 */

/** How long to wait before giving up and using what we already have.
 *  This runs BEFORE the app shell renders, so it is a startup cost on every
 *  visit — 2.5 s is the most that can be spent without the app feeling broken
 *  on a slow connection. */
const TIMEOUT_MS = 2500;

/** Where the last good answer is kept, so a lab that loses its wifi gets the
 *  gate it had this morning rather than no gate at all. */
const CACHE_KEY = 'edmglab.access.live';

/**
 * GET the live config. Returns null on ANY failure — the caller decides what
 * that means, because "unreachable" and "explicitly disabled" must not end up
 * looking the same.
 */
export async function fetchLive(endpoint) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(endpoint, { cache: 'no-store', redirect: 'follow', signal: ctl.signal });
    if (!res.ok) return null;
    const body = await res.json();
    /* Apps Script answers with its own HTML on some failures, and a 200
       carrying the wrong shape is worse than an error because it looks like
       an answer. Insist on the envelope. */
    if (!body || body.ok !== true || !body.config) return null;
    return body.config;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function cacheLive(cfg) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), cfg })); }
  catch { /* private browsing, or a full quota — the gate still works */ }
}

export function readCachedLive() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { cfg } = JSON.parse(raw);
    return cfg && typeof cfg === 'object' ? cfg : null;
  } catch { return null; }
}
