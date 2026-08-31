/**
 * EDMGLAB — talking to the review endpoint
 *
 * Loaded only by the review page, which is itself only reachable when
 * data/review.json names an endpoint. A group that has not deployed Review.gs
 * downloads none of this.
 *
 * The review key is shared with the whole group, so unlike the admin key it IS
 * remembered on the device — a reviewer working through ninety entries should
 * not retype it ninety times. That is a deliberate difference in treatment and
 * it follows from a deliberate difference in consequence: the worst a leaked
 * review key allows is junk verdicts, which are appended rather than
 * overwritten and can be voted over. The admin key can lock the group out, so
 * it is never stored anywhere.
 *
 * The reviewer's NAME is also remembered, for the same reason and with no
 * downside — it is written into every row they submit anyway.
 */

const TIMEOUT_MS = 20000;
const KEY_STORE = 'edmglab.review.key';
const NAME_STORE = 'edmglab.review.name';

/** `text/plain` avoids the CORS preflight Apps Script cannot answer. The full
 *  reasoning is in js/lib/feedback.js; it has cost this project an hour once. */
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
      ? 'The script did not answer within 20 seconds. Apps Script is slow on its first call after a while — try again.'
      : 'Could not reach the endpoint: ' + e.message);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`The script replied ${res.status}.`);
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); }
  catch { throw new Error('The script did not return JSON. Check it is deployed with access "Anyone".'); }
  if (body.ok !== true) throw new Error(body.error || 'The script reported a failure.');
  return body;
}

/** Everyone's verdicts, keyed by unit id. */
export async function fetchReviews(endpoint) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(endpoint, { cache: 'no-store', redirect: 'follow', signal: ctl.signal });
    if (!res.ok) throw new Error(`The script replied ${res.status}.`);
    const body = await res.json();
    if (body.ok !== true) throw new Error(body.error || 'The script reported a failure.');
    return body.reviews || {};
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'The endpoint did not answer in time.' : e.message);
  } finally {
    clearTimeout(timer);
  }
}

export function submit(endpoint, { reviewKey, reviewer, entries }) {
  return post(endpoint, { reviewKey, reviewer, entries });
}

/* ── Remembered on this device ── */

export const remembered = {
  key: () => read(KEY_STORE),
  name: () => read(NAME_STORE),
  save(key, name) { write(KEY_STORE, key); write(NAME_STORE, name); },
  forget() { write(KEY_STORE, ''); write(NAME_STORE, ''); }
};

function read(k) { try { return localStorage.getItem(k) || ''; } catch { return ''; } }
function write(k, v) { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { /* ignore */ } }
