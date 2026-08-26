/**
 * EDMGLAB — Universal search (Architecture v0.2 §C.9)
 *
 * ONE search across every loaded content file, not a box per module. The
 * index is built in memory from what data.js has already fetched, so results
 * appear in well under 50 ms and work fully offline.
 *
 * At the group's content scale this is fast enough by a wide margin. If the
 * library ever grows past a few thousand records, the fix is a pre-generated
 * search-index.json — with no change to how the UI calls this module.
 */

import { loadedFiles } from './data.js';
import { MODULES } from './nav.js';
import { esc } from './ui.js';

/** Human labels for each data file, used to group results. */
const TYPE_LABEL = {
  concepts: 'Concepts', formulas: 'Formulas', glossary: 'Glossary',
  materials: 'Materials', calculators: 'Calculators',
  troubleshooting: 'Troubleshooting', quiz: 'Quiz',
  characterization: 'Characterisation', electrochemistry: 'Electrochemistry',
  'bt/concepts': 'Battery Tester', 'bt/methods': 'Battery Tester · Methods',
  'bt/protocols': 'Protocols', 'bt/troubleshooting': 'Battery Tester · Troubleshooting',
  'ec/concepts': 'Workstation', 'ec/methods': 'Workstation · Methods',
  'ec/troubleshooting': 'Workstation · Troubleshooting'
};

/** Fields worth searching, in priority order. */
const FIELDS = ['title', 'name', 'term', 'label', 'symptom', 'plainText', 'aliases', 'tags', 'shortDef'];

function haystack(rec) {
  const bits = [];
  for (const f of FIELDS) {
    const v = rec[f];
    if (!v) continue;
    bits.push(Array.isArray(v) ? v.join(' ') : String(v));
  }
  return bits.join(' ').toLowerCase();
}

function displayTitle(rec) {
  return rec.title || rec.name || rec.term || rec.label || rec.symptom || rec.id || 'Untitled';
}

/** Route for a record, derived from its id namespace. */
function routeFor(key, rec) {
  const id = String(rec.id || '');
  const [ns, rest] = id.split('.');
  const map = {
    concept: '#/concept/', formula: '#/formula/', material: '#/material/',
    calculator: '#/calculator/', method: '#/method/', protocol: '#/protocol/',
    technique: '#/technique/', instrument: '#/instrument/', troubleshooting: '#/troubleshooting/'
  };
  if (map[ns] && rest) return map[ns] + rest;
  const mod = MODULES.find((m) => key.startsWith(m.id));
  return mod ? mod.route : '#/';
}

/**
 * Search everything currently in memory.
 * @returns {Array<{key,label,items:Array}>} grouped results
 */
export function search(query, limitPerGroup = 6) {
  const q = String(query || '').trim().toLowerCase();
  if (q.length < 2) return [];

  const terms = q.split(/\s+/);
  const groups = [];

  for (const { key, payload } of loadedFiles()) {
    if (!Array.isArray(payload.items) || !payload.items.length) continue;

    const hits = [];
    for (const rec of payload.items) {
      const hay = haystack(rec);
      if (!hay) continue;
      // All terms must appear — a simple AND is the right behaviour when
      // someone types "specific capacitance" and means both words.
      if (!terms.every((t) => hay.includes(t))) continue;

      // Rank: exact title match first, then title prefix, then anything.
      const title = displayTitle(rec).toLowerCase();
      const score = title === q ? 0 : title.startsWith(q) ? 1 : title.includes(q) ? 2 : 3;
      hits.push({ rec, score });
    }
    if (!hits.length) continue;

    hits.sort((a, b) => a.score - b.score);
    groups.push({
      key,
      label: TYPE_LABEL[key] || key,
      items: hits.slice(0, limitPerGroup).map((h) => ({
        title: displayTitle(h.rec),
        sub: h.rec.shortDef || h.rec.plainText || h.rec.summary || h.rec.id || '',
        route: routeFor(key, h.rec)
      }))
    });
  }

  return groups;
}

/** Render grouped results into the overlay body. */
export function renderResults(el, groups, query) {
  if (!query || query.trim().length < 2) {
    el.innerHTML = `<div class="empty-state">Type at least two characters.<br>
      <span class="xsmall">Search covers concepts, formulas, methods, materials and troubleshooting.</span></div>`;
    return;
  }
  if (!groups.length) {
    el.innerHTML = `<div class="empty-state">No matches for “${esc(query)}”.<br>
      <span class="xsmall">Much of the content library is still being written — see the roadmap phases in the sidebar.</span></div>`;
    return;
  }
  const total = groups.reduce((s, g) => s + g.items.length, 0);
  el.innerHTML =
    `<div class="result-group-title">${total} result${total === 1 ? '' : 's'}</div>` +
    groups.map((g) => `
      <div class="result-group-title">${esc(g.label)}</div>
      ${g.items.map((it) => `
        <a class="result-item" href="${esc(it.route)}">
          <div class="r-title">${esc(it.title)}</div>
          ${it.sub ? `<div class="r-sub">${esc(String(it.sub).slice(0, 110))}</div>` : ''}
        </a>`).join('')}
    `).join('');
}
