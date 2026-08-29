/**
 * EDMGLAB — Corrections (Architecture v0.2 §J, Roadmap Phase 14)
 *
 * THE PROBLEM
 *
 * Fifty-five thousand words of draft science need reading by the group, and
 * the people best placed to spot an error — the person who actually runs that
 * measurement — are the least likely to open a JSON file on GitHub to fix it.
 * A reader who notices something wrong currently has nowhere to put it, so it
 * stays in their head and the error stays on the page.
 *
 * WHAT THIS DOES NOT DO
 *
 * It does not edit content. A static site cannot write to its own repository,
 * and a "submit" button that quietly discards what someone typed would be
 * worse than no button at all. So this module's whole job is to be honest
 * about where a correction goes, and to make sure it goes somewhere.
 *
 * THREE DESTINATIONS, IN ORDER OF PREFERENCE
 *
 *   github    A pre-filled GitHub issue. Needs NO setup: on GitHub Pages the
 *             repository is derivable from the URL the site is served from.
 *             One click, the form opens already filled in, and the correction
 *             lands next to the code it is about with a thread for discussion.
 *
 *   endpoint  A Google Apps Script Web App writing to a Sheet — §J, and the
 *             Phase 14 exit criterion. Optional, because it needs somebody to
 *             deploy it. Better than GitHub for people without an account.
 *
 *   none      Neither is available (a custom domain with no config, or
 *             localhost). The correction is kept locally and the interface
 *             says so plainly, with a copy button and a download, so the
 *             reader can send it by hand rather than losing it.
 *
 * Anything that fails to send is queued and stays queued. The one thing this
 * module will never do is tell someone their correction was submitted when it
 * was not.
 */

import * as store from './storage.js';

const CONFIG_URL = new URL('../../data/feedback.json', import.meta.url).href;
const QUEUE_KEY = 'feedback.queue.v1';

/* GitHub rejects a URL beyond roughly 8 KB. Stay well under it and say so
   when the body has been trimmed, rather than producing a dead link. */
const MAX_BODY = 5800;

let cfg = null;

/**
 * Work out which repository this build is served from.
 *
 * GitHub Pages URLs are structured enough to read:
 *   owner.github.io/repo/…  → owner/repo          (project site)
 *   owner.github.io/…       → owner/owner.github.io  (user or org site)
 *
 * Anything else — a custom domain, a local server — is not derivable, and
 * guessing would produce a link to somebody else's repository. Returns null.
 */
export function repoFromLocation(loc = window.location) {
  const m = /^([a-z0-9-]+)\.github\.io$/i.exec(loc.hostname);
  if (!m) return null;
  const owner = m[1];
  const seg = loc.pathname.split('/').filter(Boolean)[0];
  return seg ? `${owner}/${seg}` : `${owner}/${owner}.github.io`;
}

/** Load the optional configuration. A missing file is the normal case. */
export async function config() {
  if (cfg) return cfg;
  let file = {};
  try {
    const res = await fetch(CONFIG_URL, { cache: 'no-cache' });
    if (res.ok) file = await res.json();
  } catch { /* no config — defaults stand */ }

  const repo = file.repo || repoFromLocation();
  const endpoint = (file.endpoint || '').trim();
  let mode = file.mode || 'auto';
  if (mode === 'auto') mode = endpoint ? 'endpoint' : (repo ? 'github' : 'none');
  if (mode === 'endpoint' && !endpoint) mode = repo ? 'github' : 'none';
  if (mode === 'github' && !repo) mode = 'none';

  cfg = {
    mode,
    repo,
    endpoint,
    labels: file.issueLabels || ['content'],
    categories: file.categories || DEFAULT_CATEGORIES,
    derivedRepo: !file.repo && !!repo
  };
  return cfg;
}

export const DEFAULT_CATEGORIES = [
  { id: 'wrong', label: 'Something is scientifically wrong',
    hint: 'A definition, a number, an equation or a claim that is not correct.' },
  { id: 'missing_source', label: 'A value needs a source',
    hint: 'A number is presented without a citation, or the citation does not support it.' },
  { id: 'misleading', label: 'Correct but misleading',
    hint: 'True as written, but a reader would draw the wrong conclusion.' },
  { id: 'unclear', label: 'Unclear or hard to follow',
    hint: 'The science is right; the explanation is not doing its job.' },
  { id: 'missing', label: 'Something is missing',
    hint: 'A technique, a failure mode, a caveat that should be here.' },
  { id: 'broken', label: 'Something is broken',
    hint: 'A link, a calculator, a plot or a page that does not work.' }
];

/* ── The correction itself ────────────────────────────────── */

/**
 * @typedef {object} Correction
 * @property {string} category   one of config().categories[].id
 * @property {string} page       the route it is about, e.g. "#/formula/c_rate"
 * @property {string} [recordId] the record id, when the page names one
 * @property {string} problem    what is wrong
 * @property {string} [suggested] what it should say instead
 * @property {string} [source]   a citation supporting the correction
 * @property {string} [who]      who is reporting it
 * @property {string} at         ISO timestamp
 */

export function newCorrection(fields = {}) {
  return {
    category: 'wrong', page: '', recordId: '', problem: '',
    suggested: '', source: '', who: '',
    at: new Date().toISOString(),
    ...fields
  };
}

function catLabel(c, categories) {
  return (categories.find((x) => x.id === c.category) || {}).label || c.category;
}

/** The human-readable body, shared by every destination. */
export function formatBody(c, categories = DEFAULT_CATEGORIES) {
  const L = [];
  L.push(`**Page:** ${c.page || '(not stated)'}`);
  if (c.recordId) L.push(`**Record:** \`${c.recordId}\``);
  L.push(`**Kind:** ${catLabel(c, categories)}`);
  L.push('');
  L.push('### What is wrong');
  L.push(c.problem || '(not stated)');
  if (c.suggested) { L.push(''); L.push('### What it should say'); L.push(c.suggested); }
  if (c.source) { L.push(''); L.push('### Source'); L.push(c.source); }
  L.push('');
  L.push('---');
  L.push(`Reported${c.who ? ` by ${c.who}` : ''} on ${new Date(c.at).toLocaleString()} from EDMGLAB.`);
  return L.join('\n');
}

export function formatTitle(c, categories = DEFAULT_CATEGORIES) {
  const where = c.recordId || c.page.replace(/^#\//, '') || 'content';
  const first = (c.problem || '').split('\n')[0].trim();
  const gist = first.length > 60 ? first.slice(0, 57).trimEnd() + '…' : first;
  return `[${catLabel(c, categories)}] ${where}${gist ? ` — ${gist}` : ''}`.slice(0, 120);
}

/**
 * The pre-filled GitHub issue URL.
 * @returns {{url:string, truncated:boolean}}
 */
export function issueUrl(c, conf) {
  const body = formatBody(c, conf.categories);
  const truncated = body.length > MAX_BODY;
  const use = truncated
    ? body.slice(0, MAX_BODY) + '\n\n…truncated. The full text is on the clipboard.'
    : body;
  const q = new URLSearchParams({ title: formatTitle(c, conf.categories), body: use });
  for (const l of conf.labels) q.append('labels', l);
  return { url: `https://github.com/${conf.repo}/issues/new?${q}`, truncated };
}

/* ── The local queue ──────────────────────────────────────────
   Everything written is queued FIRST and only marked sent once a destination
   has actually accepted it. A tab closed mid-submission loses nothing, and an
   endpoint that is down does not silently swallow a correction. */

export function queue() {
  const q = store.get(QUEUE_KEY);
  return Array.isArray(q) ? q : [];
}

export function enqueue(c) {
  const item = { ...c, id: `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`, sent: false };
  store.set(QUEUE_KEY, [...queue(), item]);
  return item;
}

export function markSent(id, how) {
  store.set(QUEUE_KEY, queue().map((x) => (x.id === id ? { ...x, sent: true, how, sentAt: new Date().toISOString() } : x)));
}

export function remove(id) {
  store.set(QUEUE_KEY, queue().filter((x) => x.id !== id));
}

export function pending() { return queue().filter((x) => !x.sent); }

/**
 * POST to the Apps Script Web App.
 *
 * `Content-Type: text/plain` is not a mistake. Apps Script Web Apps do not
 * answer the CORS preflight that application/json triggers, so a JSON
 * content-type fails in the browser while the identical request succeeds from
 * curl — a confusing hour for whoever debugs it next. text/plain is a
 * "simple request" and needs no preflight; the script parses the body itself.
 */
export async function postToEndpoint(c, conf) {
  const res = await fetch(conf.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...c, title: formatTitle(c, conf.categories) }),
    redirect: 'follow'
  });
  if (!res.ok) throw new Error(`the script replied ${res.status}`);
  const text = await res.text();
  // Apps Script returns its own HTML on some failures; only JSON means success.
  try {
    const j = JSON.parse(text);
    if (j.ok === false) throw new Error(j.error || 'the script reported a failure');
  } catch (e) {
    if (e instanceof SyntaxError) throw new Error('the script did not return JSON — check it is deployed with access "Anyone"');
    throw e;
  }
  return true;
}

/** Everything queued, as a file the reader can send by hand. */
export function asMarkdown(items, categories = DEFAULT_CATEGORIES) {
  return items.map((c) =>
    `## ${formatTitle(c, categories)}\n\n${formatBody(c, categories)}\n`).join('\n---\n\n');
}
