/**
 * EDMGLAB — live access management
 *
 * Talks to the AccessControl.gs Web App so an admin can add or suspend a
 * person from #/admin without editing a file and pushing a commit. Loaded only
 * when data/access.json names an endpoint, so a group that has not deployed
 * the script never downloads this.
 *
 * ── THE ADMIN KEY IS NOT STORED, ANYWHERE, EVER ──
 *
 * It is read from the input at the moment of the request and passed straight
 * to fetch. It is not written to localStorage, not to sessionStorage, not to
 * a module-level variable that survives the call, and not into any log. A
 * static site cannot keep a secret — anything it stores is readable by anyone
 * with the same browser, and anything in its source is readable by everyone.
 * The key is safe only for as long as it exists nowhere but in the admin's
 * head and in Script Properties on Google's servers.
 *
 * That is why every action asks for it again. The friction is the feature.
 *
 * ── WHY THE PIN NEVER LEAVES THE BROWSER ──
 *
 * PBKDF2 runs here, on the admin's machine, and only { salt, hash, iterations }
 * is sent. The script never sees a PIN, so no PIN appears in a Google Cloud
 * log, in an execution transcript, or in the audit tab. The server could not
 * reveal a PIN if it were compelled to, because it was never told one.
 */

import { ITERATIONS, randomSalt, derive } from './access-gate.js';
import { slugify } from './access.js';

/** Apps Script is slow to wake. This is an admin action with a spinner on it,
 *  not a boot-path fetch, so it can afford to wait properly. */
const TIMEOUT_MS = 20000;

/**
 * POST an action to the endpoint.
 *
 * `Content-Type: text/plain` is not a mistake and must not be "fixed" to
 * application/json. Apps Script Web Apps do not answer the CORS preflight
 * that application/json triggers, so a JSON content-type fails in the browser
 * while the identical request succeeds from curl. text/plain is a simple
 * request, needs no preflight, and the script parses the body itself. The
 * same reasoning is written out in js/lib/feedback.js — it has cost this
 * project an hour once already.
 */
async function post(endpoint, payload) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow',
      signal: ctl.signal
    });
  } catch (e) {
    throw new Error(e.name === 'AbortError'
      ? 'The script did not answer within 20 seconds. Apps Script is slow on its first call after a while — try once more.'
      : 'Could not reach the endpoint: ' + e.message);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) throw new Error(`The script replied ${res.status}.`);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    // A 200 carrying HTML is Apps Script's own error page, and it is the
    // symptom of exactly one mistake often enough to name it.
    throw new Error('The script did not return JSON. Check it is deployed with access set to "Anyone".');
  }
  if (body.ok !== true) throw new Error(body.error || 'The script reported a failure.');
  return body;
}

/** Read the live list. No key needed — it holds no secrets. */
export async function fetchConfig(endpoint) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(endpoint, { cache: 'no-store', redirect: 'follow', signal: ctl.signal });
    if (!res.ok) throw new Error(`The script replied ${res.status}.`);
    const body = await res.json();
    if (body.ok !== true) throw new Error(body.error || 'The script reported a failure.');
    return { config: body.config, updated: body.updated || null };
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'The endpoint did not answer in time.' : e.message);
  } finally {
    clearTimeout(timer);
  }
}

/** Derive a PIN into { salt, hash, iterations }. The PIN itself stops here. */
export async function credentialFor(pin) {
  if (!/^\d{4}$/.test(String(pin))) throw new Error('A PIN must be exactly four digits.');
  const salt = randomSalt();
  const hash = await derive(String(pin), salt, ITERATIONS);
  return { salt, hash, iterations: ITERATIONS };
}

export async function addPerson(endpoint, adminKey, { name, pin, role = 'member', by = '' }) {
  const clean = String(name || '').trim();
  if (!clean) throw new Error('Give the person a name.');
  return post(endpoint, {
    action: 'addUser', adminKey, by,
    name: clean, slug: slugify(clean), role,
    credential: await credentialFor(pin)
  });
}

export function removePerson(endpoint, adminKey, slug, by = '') {
  return post(endpoint, { action: 'removeUser', adminKey, slug, by });
}

export function setPersonEnabled(endpoint, adminKey, slug, enabled, by = '') {
  return post(endpoint, { action: 'setUserEnabled', adminKey, slug, enabled, by });
}

export function setGate(endpoint, adminKey, settings, by = '') {
  return post(endpoint, { action: 'setGate', adminKey, by, ...settings });
}

export async function setSharedPin(endpoint, adminKey, pin, by = '') {
  return post(endpoint, { action: 'setSharedPin', adminKey, by, pin: await credentialFor(pin) });
}

/** Push a whole configuration — used to move an existing data/access.json to
 *  the endpoint in one step, and to roll back from the audit tab. */
export function replaceAll(endpoint, adminKey, config, by = '') {
  return post(endpoint, { action: 'replaceAll', adminKey, by, config });
}
