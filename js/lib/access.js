/**
 * EDMGLAB — Optional 4-digit PIN gate
 *
 * ═══════════════════════════════════════════════════════════════════════
 *  READ THIS BEFORE RELYING ON IT.
 *
 *  THIS IS NOT SECURITY. It cannot be, on a static site.
 *
 *  EDMGLAB is served as static files from GitHub Pages. There is no server
 *  deciding who may receive a file. By the time this gate draws anything,
 *  the browser has already downloaded the page — and anyone can request
 *  /data/formulas.json (or any other file) directly and read it without
 *  ever seeing a PIN prompt.
 *
 *  What this gate ACTUALLY does, honestly:
 *    ✓ Stops someone casually opening the site on a shared or unattended
 *      lab machine
 *    ✓ Signals "this is the group's internal tool, not a public website"
 *    ✓ Identifies WHICH lab member is using a shared computer, so progress,
 *      calculator history and preferences stay separate per person
 *    ✓ Makes accidental sharing of the URL less immediately useful
 *
 *  What it DOES NOT do:
 *    ✗ Protect any file from anyone who knows how to open a URL
 *    ✗ Encrypt anything
 *    ✗ Make it safe to commit unpublished results, NDA material, personal
 *      data or credentials to this repository
 *
 *  THE TWO-TIER RULE FROM THE ARCHITECTURE STILL APPLIES UNCHANGED:
 *  anything committed to this repository must be safe to be public.
 *  Turning this gate on does not change that, and must never be treated
 *  as permission to relax it.
 *
 *  If real access control is ever needed, it has to come from a server
 *  that can refuse the request — for this project that means serving the
 *  restricted content from a Google Apps Script Web App behind institutional
 *  Google sign-in (Architecture §J), not from a PIN in the browser.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * WHY THE PIN IS HASHED ANYWAY
 * The stored value is a PBKDF2-SHA256 derivation, not the PIN. That is not
 * to protect the site — it is to protect the PIN. People reuse four-digit
 * numbers on phones, lockers and bank cards, and a plaintext PIN sitting in
 * a public repository would leak a number that someone uses elsewhere.
 * A four-digit space is only 10,000 possibilities, so a determined person
 * with the config file can still recover the PIN; the iteration count makes
 * that take real time rather than being instant. Choose a PIN you do not
 * use for anything else.
 *
 * ── This file is the BOOT-PATH half ──
 * It answers one question as cheaply as possible: is the gate on? The gate
 * ships off, so for almost every visit the answer is no and nothing else is
 * needed. The crypto, the lockout and the gate screen live in
 * js/lib/access-gate.js and are imported only when the answer is yes.
 */

import * as store from './storage.js';

const CONFIG_URL = new URL('../../data/access.json', import.meta.url).href;

/** Storage keys, shared with access-gate.js so neither file invents its own. */
export const CONFIG_KEYS = {
  SESSION_KEY: 'edmglab.access.session',
  ACTIVE_USER_KEY: 'edmglab.activeUser'
};
const { SESSION_KEY, ACTIVE_USER_KEY } = CONFIG_KEYS;

/* ── Config ──────────────────────────────────────────────── */

/**
 * Load the access configuration.
 *
 * TWO SOURCES, IN ORDER:
 *   1. data/access.json — committed, always present. If it names an
 *      `endpoint`, it is a POINTER rather than the answer.
 *   2. That endpoint — the live list, which an admin can change from #/admin
 *      without a git commit. See docs/apps-script/AccessControl.gs.
 *
 * FAILS OPEN, and the reasoning has not changed: a missing, malformed or
 * unreachable config means the gate is OFF. That is correct here precisely
 * BECAUSE this is not security — failing closed would lock the group out of a
 * site whose content is public anyway, trading real usability for imaginary
 * protection.
 *
 * The endpoint gets one refinement on that rule. If it cannot be reached but a
 * previous answer is cached, the CACHED one is used rather than falling all
 * the way open: a lab losing its wifi should keep the gate it had this
 * morning. The consequence is stated plainly on the admin page — someone
 * removed from the list keeps access on a device that is offline until it
 * reconnects, which is a soft gate behaving like a soft gate.
 */
export async function loadConfig() {
  let file = {};
  try {
    const res = await fetch(CONFIG_URL, { cache: 'no-cache' });
    if (!res.ok) return { enabled: false, _reason: `no config (HTTP ${res.status})` };
    file = await res.json();
  } catch (e) {
    return { enabled: false, _reason: 'config unreachable: ' + e.message };
  }

  const endpoint = String(file.endpoint || '').trim();
  if (endpoint) {
    /* Loaded ONLY when an endpoint is configured. access.js is on the boot
       path of every visit; the endpoint code is useful to a minority of
       deployments, and inlining it broke the shell-payload budget once
       already. js/lib/access-remote.js has the full reasoning. */
    const { fetchLive, cacheLive, readCachedLive } = await import('./access-remote.js');
    const live = await fetchLive(endpoint);
    if (live) {
      cacheLive(live);
      return live.enabled === true ? { ...live, _source: 'endpoint' }
                                   : { enabled: false, _reason: 'disabled at the endpoint', _source: 'endpoint' };
    }
    const cached = readCachedLive();
    if (cached) {
      return cached.enabled === true
        ? { ...cached, _source: 'cache', _reason: 'endpoint unreachable — using the last known list' }
        : { enabled: false, _reason: 'endpoint unreachable; last known list had the gate off', _source: 'cache' };
    }
    // No live answer and nothing cached: fall through to the committed file,
    // which is the honest last resort rather than an invented state.
  }

  if (!file || file.enabled !== true) return { enabled: false, _reason: 'disabled in config' };
  return { ...file, _source: 'file' };
}

/** Read the endpoint URL without loading the whole config. Used by the admin
 *  page, which needs to know whether live management is even possible. */
export async function endpointUrl() {
  try {
    const res = await fetch(CONFIG_URL, { cache: 'no-cache' });
    if (!res.ok) return '';
    const file = await res.json();
    return String(file.endpoint || '').trim();
  } catch { return ''; }
}

export function signOut() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(ACTIVE_USER_KEY);
  } catch { /* ignore */ }
  location.reload();
}

export function activeUser() {
  try { return localStorage.getItem(ACTIVE_USER_KEY) || null; } catch { return null; }
}

export function slugify(s) {
  return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
}

/* ── The gate ────────────────────────────────────────────── */

/**
 * Resolve once access is granted. Returns immediately when the gate is off.
 * Called by app.js BEFORE the shell renders.
 * @returns {Promise<{gated:boolean, user:?string, label:?string}>}
 */
export async function requireAccess() {
  const cfg = await loadConfig();

  if (!cfg.enabled) {
    // Still honour a previously chosen identity so progress stays separate
    // on a shared machine even after the gate is switched off.
    const u = activeUser();
    if (u) store.setUser(u);
    return { gated: false, user: u, label: null };
  }

  // Only now is the heavy half worth downloading.
  const { runGate } = await import('./access-gate.js');
  const result = await runGate(cfg);
  if (result.user) store.setUser(result.user);
  return result;
}
