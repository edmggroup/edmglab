/**
 * EDMGLAB — Client state (Architecture v0.2 §D.7)
 *
 * ONE namespaced, versioned localStorage key holds every preference and
 * piece of progress. Versioning it the same way as the content files means
 * a future format change can be migrated deliberately instead of silently
 * breaking for returning users.
 *
 * Every read and write is wrapped: localStorage throws in private windows,
 * in some embedded webviews, and when a browser blocks site data. The app
 * must work perfectly with storage completely unavailable.
 */

const BASE_KEY = 'edmglab.state.v1';

/**
 * Per-user state on a shared machine.
 *
 * When the optional PIN gate runs in per-user mode (js/lib/access.js), each
 * lab member's progress, calculator history and preferences are namespaced by
 * their slug. Without a user, everything shares one key exactly as before.
 *
 * This is the genuinely useful half of the PIN feature: on a shared lab PC,
 * two students no longer overwrite each other's quiz progress.
 */
let KEY = BASE_KEY;
let currentUser = null;

/** Switch to a user's namespace. Called by access.js BEFORE the app boots. */
export function setUser(slug) {
  const next = slug ? `${BASE_KEY}__${slug}` : BASE_KEY;
  if (next === KEY) return;
  KEY = next;
  currentUser = slug || null;
  cache = null;               // force a re-read from the new namespace
}

export function getUser() { return currentUser; }

const DEFAULTS = {
  version: 1,
  theme: null,          // null = follow the OS setting
  mode: 'learn',        // 'learn' | 'research'
  recent: [],           // recently viewed route entries
  quiz: {},             // conceptId -> progress
  calcHistory: [],      // recent calculator inputs
  importProfiles: {}    // saved CSV column mappings
};

let cache = null;

function read() {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    cache = { ...DEFAULTS };
  }
  return cache;
}

function write() {
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* Storage full or blocked — the app continues, preferences just
       won't persist to the next visit. Never surface this as an error. */
  }
}

export function get(key) {
  const s = read();
  return key === undefined ? s : s[key];
}

export function set(key, value) {
  read();
  cache[key] = value;
  write();
  return value;
}

export function update(key, fn) {
  return set(key, fn(get(key)));
}

/** Push an item onto a capped most-recent-first list. */
export function pushRecent(entry, cap = 12) {
  return update('recent', (list) => {
    const next = [entry, ...(list || []).filter((r) => r.route !== entry.route)];
    return next.slice(0, cap);
  });
}

/** Wipe all stored state. Exposed for the settings view. */
export function clearAll() {
  try { localStorage.removeItem(KEY); } catch { /* nothing to do */ }
  cache = { ...DEFAULTS };
}
