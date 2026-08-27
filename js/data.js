/**
 * EDMGLAB — Data service (Architecture v0.2 §D.6, §D.7, §I.2)
 *
 * The ONLY file in the app that knows where content comes from. Every view
 * asks this module; none of them fetch. That seam is what lets a future
 * Google Apps Script source be added by changing this file alone.
 *
 * Loading strategy (§I.2):
 *   - CORE files load at boot, in parallel. GitHub Pages serves over HTTP/2,
 *     which multiplexes requests over one connection, so three small files
 *     cost about the same as one combined file — we keep them separate for
 *     maintainability and lose nothing in speed.
 *   - Module files load on first visit to their view, then stay in memory.
 */

const BASE = new URL('../data/', import.meta.url).href;

/** Loaded at boot — small, needed almost everywhere. */
export const CORE = ['concepts', 'formulas', 'glossary'];

/** Everything else, loaded on demand. Path is relative to /data/. */
const REGISTRY = {
  concepts:              'concepts.json',
  formulas:              'formulas.json',
  glossary:              'glossary.json',
  calculators:           'calculators.json',
  materials:             'materials.json',
  troubleshooting:       'troubleshooting.json',
  quiz:                  'quiz.json',
  characterization:      'characterization.json',
  electrochemistry:      'electrochemistry.json',
  'bt/concepts':         'battery-tester/concepts.json',
  'bt/instrument':       'battery-tester/instrument.json',
  'bt/cells':            'battery-tester/cells.json',
  'bt/workflow':         'battery-tester/workflow.json',
  'bt/methods':          'battery-tester/methods.json',
  'bt/protocols':        'battery-tester/protocols.json',
  'bt/troubleshooting':  'battery-tester/troubleshooting.json',
  'bt/safety':           'battery-tester/safety.json',
  'ec/concepts':         'echem/concepts.json',
  'ec/potentiostat':     'echem/potentiostat.json',
  'ec/electrodes':       'echem/electrodes.json',
  'ec/methods':          'echem/methods.json',
  'ec/circuits':         'echem/circuits.json',
  'ec/tafel':            'echem/tafel.json',
  'ec/troubleshooting':  'echem/troubleshooting.json',
  'shared/instrument-choice':    'shared/instrument-choice.json',
  'shared/method-decision-tree': 'shared/method-decision-tree.json'
};

const cache = new Map();     // key -> parsed, migrated payload
const inflight = new Map();  // key -> Promise (dedupes concurrent requests)
const missing = new Set();   // keys that 404'd — not yet authored

/** Current schema version this build understands. */
export const SCHEMA_VERSION = 1;

/**
 * Migrate an older payload forward. One place for every historical variant,
 * so no view ever needs to know about a past schema (§D.6).
 */
function migrate(key, payload) {
  const v = payload.schemaVersion ?? 0;
  if (v === SCHEMA_VERSION) return payload;
  if (v > SCHEMA_VERSION) {
    console.warn(`[data] ${key} is schemaVersion ${v}; this build understands ${SCHEMA_VERSION}. Reading it as-is.`);
    return payload;
  }
  // v < SCHEMA_VERSION — add migration steps here as the schema evolves.
  // Example shape for the future:
  //   if (v < 1) { payload.items.forEach(migrateV0toV1); payload.schemaVersion = 1; }
  console.warn(`[data] ${key} has no schemaVersion; assuming ${SCHEMA_VERSION}.`);
  payload.schemaVersion = SCHEMA_VERSION;
  return payload;
}

/**
 * Load one registered data file.
 * A file that does not exist yet resolves to an EMPTY payload rather than
 * throwing — content is authored progressively, and a view must render
 * cleanly against content that has not been written (Integration report §6.4).
 */
export async function load(key) {
  if (cache.has(key)) return cache.get(key);
  if (missing.has(key)) return emptyPayload(key);
  if (inflight.has(key)) return inflight.get(key);

  const file = REGISTRY[key];
  if (!file) throw new Error(`[data] unknown data key "${key}"`);

  const p = (async () => {
    let res;
    try {
      res = await fetch(BASE + file, { cache: 'no-cache' });
    } catch (e) {
      console.warn(`[data] network failure for ${file}`, e);
      missing.add(key);
      return emptyPayload(key);
    }
    if (!res.ok) {
      if (res.status === 404) {
        // Expected during incremental authoring.
        missing.add(key);
        return emptyPayload(key);
      }
      throw new Error(`[data] ${file} → HTTP ${res.status}`);
    }
    let json;
    try {
      json = await res.json();
    } catch (e) {
      // A malformed JSON file is an authoring error worth shouting about,
      // but it must not take the whole app down.
      console.error(`[data] ${file} is not valid JSON`, e);
      missing.add(key);
      return emptyPayload(key, `Invalid JSON: ${e.message}`);
    }
    const payload = migrate(key, json);
    cache.set(key, payload);
    inflight.delete(key);
    return payload;
  })();

  inflight.set(key, p);
  return p;
}

function emptyPayload(key, error = null) {
  return { schemaVersion: SCHEMA_VERSION, key, items: [], _empty: true, _error: error };
}

/** Load several keys in parallel. */
export async function loadAll(keys) {
  const out = {};
  await Promise.all(keys.map(async (k) => { out[k] = await load(k); }));
  return out;
}

/** Load the boot set (§I.2). */
export function loadCore() {
  return loadAll(CORE);
}

/** Flat array of items from one file. */
export async function items(key) {
  const p = await load(key);
  return Array.isArray(p.items) ? p.items : [];
}

/** Find one record by id within a file. */
export async function byId(key, id) {
  return (await items(key)).find((r) => r.id === id) || null;
}

/**
 * Resolve an id from ANY loaded file — the mechanism behind relatedIds
 * cross-referencing (§A.4). Only searches what is already in memory, so it
 * is synchronous and cheap; call after the relevant files are loaded.
 */
export function resolveLoaded(id) {
  for (const [key, payload] of cache) {
    if (!Array.isArray(payload.items)) continue;
    const hit = payload.items.find((r) => r.id === id);
    if (hit) return { key, record: hit };
  }
  return null;
}

/** Every file currently in memory — used by the health check. */
export function loadedFiles() {
  return Array.from(cache.entries()).map(([key, payload]) => ({ key, payload }));
}

/** All registered keys — used by the health check to load everything at once. */
export function allKeys() {
  return Object.keys(REGISTRY);
}

/** Which keys were requested but not found (not yet authored). */
export function missingKeys() {
  return Array.from(missing);
}
