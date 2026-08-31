/**
 * EDMGLAB — what there is to review
 *
 * ONE definition of a reviewable unit, imported by both the Word export
 * (tools/export-review.mjs, in Node) and the review page (js/views/review.js,
 * in the browser). Two copies of this logic would drift within a week, and the
 * symptom would be the worst kind: a reviewer approves 223 things, the export
 * lists 231, and nobody can tell which set is right.
 *
 * So this file is pure — no DOM, no fetch, no imports. It takes a parsed JSON
 * payload and returns units. Both callers do their own loading.
 *
 * ── WHAT COUNTS AS A UNIT ──
 *
 * Most files are collections: `items[]`, each with an id. Those are one unit
 * per record, and the id is the record's own.
 *
 * Eight files are not collections — they declare `_kind` and hold a document:
 * the preparation chain, the safety notes, the cell formats, the decision
 * trees. Their prose still needs reviewing, and the safety file needs it more
 * than anything else in the platform. So they are broken into units too, one
 * per object in each top-level array, plus one for any standalone prose block.
 * Their ids are SYNTHESISED and therefore prefixed `doc.` so they can never be
 * confused with a real record id.
 *
 * Underscore keys are documentation for whoever edits the file, not content
 * for anyone to review, and are skipped everywhere.
 */

/** Keys that are notes to the editor rather than content. */
const isNote = (k) => k.startsWith('_');

/** Keys that carry no prose and would only pad a review document. */
const SKIP_FIELDS = new Set([
  'id', 'schemaVersion', 'relatedIds', 'tags', 'aliases', 'slug',
  'salt', 'hash', 'iterations', 'icon', 'colour', 'color'
]);

/** Standalone prose blocks that appear at the top level of a document file. */
const PROSE_KEYS = ['preamble', 'closing', 'intro', 'note', 'summary'];

/**
 * Files with nothing for a scientific reviewer to read.
 *
 * `import-profiles` is a table of instrument column names — "Voltage(V)" maps
 * to the voltage role. It is configuration, and putting twenty-three rows of
 * it in front of somebody checking scientific claims wastes their attention on
 * the one thing in the platform where being wrong shows up immediately as a
 * failed import. It is reviewed by using it.
 */
const NOT_FOR_REVIEW = new Set(['import-profiles']);

/** A decision tree is a map of id → node, not an array, so the generic walker
 *  sees one enormous object. Split it per node: each question and its hint is
 *  a claim somebody should read on its own. */
const TREE_MAPS = ['nodes'];

/**
 * Flatten a record into readable [label, text] pairs, in the order the file
 * declares them — which is the order somebody thought about when writing it.
 * Nested objects and arrays are walked rather than JSON-dumped, because a
 * reviewer should never be asked to read a brace.
 */
export function fieldsOf(record, prefix = '') {
  const out = [];
  for (const [k, v] of Object.entries(record || {})) {
    if (isNote(k) || SKIP_FIELDS.has(k)) continue;
    const label = prefix ? `${prefix} → ${humanise(k)}` : humanise(k);
    push(out, label, v);
  }
  return out;
}

function push(out, label, v) {
  if (v === null || v === undefined || v === '') return;

  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
    out.push([label, String(v)]);
    return;
  }

  if (Array.isArray(v)) {
    // An array of plain values reads as a list; an array of objects is walked.
    if (v.every((x) => x === null || typeof x !== 'object')) {
      const items = v.filter((x) => x !== null && x !== '');
      if (items.length) out.push([label, items.map((x) => '• ' + x).join('\n')]);
      return;
    }
    /* An array of objects becomes a SUB-HEADING per entry, then that entry's
       own fields with plain labels. Threading the path into every label
       instead produced things like "Items 1: 1 → Hazard", which is a data
       structure rather than a sentence, and a reviewer should never be asked
       to parse one. A null text marks a sub-heading. */
    v.forEach((x, i) => {
      const name = (x && (x.name || x.title || x.term || x.hazard || x.id)) || `${i + 1}`;
      out.push([`${label} ${i + 1} — ${name}`, null]);
      for (const [l, t] of fieldsOf(x)) out.push(['   ' + l, t]);
    });
    return;
  }

  /* A value object — { value, unit, provenance } — is one line, not four.
     Splitting it would bury the number a reviewer is checking. */
  if ('value' in v && 'unit' in v) {
    const prov = v.provenance ? ` [${v.provenance}${v.source ? ': ' + v.source : ''}]` : '';
    out.push([label, `${v.value} ${v.unit}${prov}`]);
    return;
  }

  for (const [l, t] of fieldsOf(v, label)) out.push([l, t]);
}

function humanise(k) {
  return k
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());
}

/** A short, human title for a record, whatever shape it is. */
export function titleOf(rec, fallback) {
  return rec.name || rec.title || rec.term || rec.symptom || rec.couple
    || rec.question || rec.label || fallback || rec.id || '(untitled)';
}

/**
 * Every reviewable unit in one payload.
 * @param {string} key   the data.js registry key, e.g. 'materials'
 * @param {object} payload  the parsed JSON
 * @returns {Array<{id,key,title,kind,fields:Array<[string,string]>,words:number}>}
 */
export function unitsIn(key, payload) {
  if (!payload || typeof payload !== 'object' || NOT_FOR_REVIEW.has(key)) return [];
  const units = [];

  const add = (id, title, source, kind) => {
    let fields = fieldsOf(source);
    if (!fields.length) return;
    /* Two different kinds of stutter, and they need opposite treatment.
       ── A label that repeats the heading ("Preamble" under "Preamble") is
          noise, but its TEXT is the whole content of the block. Blank the
          label; never drop the field. Doing the latter emptied every prose
          block in the safety document, which is exactly the file that could
          least afford it.
       ── A name/title field whose VALUE is already in the heading is pure
          duplication and goes. */
    const t0 = String(title).trim().toLowerCase();
    fields = fields
      .filter(([l, t]) => !(t !== null && /^\s*(name|title|term)$/i.test(l)
        && t0.includes(String(t).trim().toLowerCase())))
      .map(([l, t]) => (t !== null && l.trim().toLowerCase() === t0 ? ['', t] : [l, t]));
    units.push({
      id, key, title, kind, fields,
      words: fields.reduce((n, [, t]) => n + (String(t || '').match(/[A-Za-z']+/g) || []).length, 0)
    });
  };

  // ── Collections ──
  if (Array.isArray(payload.items) && payload.items.length) {
    for (const rec of payload.items) {
      if (!rec || !rec.id) continue;
      add(rec.id, titleOf(rec), rec, rec.id.split('.')[0]);
    }
    return units;
  }

  // ── Documents ──
  const docKind = payload._kind || 'document';
  for (const pk of PROSE_KEYS) {
    if (typeof payload[pk] === 'string' && payload[pk].trim()) {
      add(`doc.${key}.${pk}`, humanise(pk), { [pk]: payload[pk] }, docKind);
    }
  }
  for (const [field, val] of Object.entries(payload)) {
    if (isNote(field) || PROSE_KEYS.includes(field) || field === 'schemaVersion' || field === 'items') continue;

    if (Array.isArray(val)) {
      val.forEach((entry, i) => {
        if (!entry || typeof entry !== 'object') return;
        const slug = entry.id || slugish(entry.name || entry.title || String(i + 1));
        add(`doc.${key}.${field}.${slug}`,
          `${humanise(field)} — ${titleOf(entry, String(i + 1))}`, entry, docKind);
      });
    } else if (val && typeof val === 'object') {
      if (TREE_MAPS.includes(field)) {
        for (const [nodeId, node] of Object.entries(val)) {
          if (!node || typeof node !== 'object') continue;
          add(`doc.${key}.${field}.${nodeId}`,
            `${humanise(field)} — ${titleOf(node, nodeId)}`, node, docKind);
        }
      } else {
        add(`doc.${key}.${field}`, humanise(field), val, docKind);
      }
    }
  }
  return units;
}

function slugish(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
}

/** A readable name for a data-registry key, for headings and filenames. */
export function moduleName(key) {
  return ({
    concepts: 'Fundamentals — concepts',
    formulas: 'Formula library',
    glossary: 'Glossary',
    materials: 'Electrode materials',
    potentials: 'Standard potentials',
    quiz: 'Learning check',
    characterization: 'Characterisation techniques',
    electrochemistry: 'Storage mechanisms',
    instruments: 'Our instruments',
    preparation: 'Electrode preparation',
    'import-profiles': 'Data import profiles',
    'bt/concepts': 'Battery tester — concepts',
    'bt/instrument': 'Battery tester — instrument',
    'bt/cells': 'Battery tester — cell formats',
    'bt/workflow': 'Battery tester — workflow',
    'bt/methods': 'Battery tester — methods',
    'bt/troubleshooting': 'Battery tester — troubleshooting',
    'bt/safety': 'Battery tester — SAFETY',
    'ec/concepts': 'Workstation — concepts',
    'ec/methods': 'Workstation — methods',
    'ec/circuits': 'Workstation — circuit elements',
    'ec/electrodes': 'Workstation — electrodes',
    'ec/potentiostat': 'Workstation — potentiostat',
    'ec/tafel': 'Workstation — Tafel analysis',
    'ec/troubleshooting': 'Workstation — troubleshooting',
    'shared/characterization-tree': 'Decision tree — characterisation',
    'shared/method-decision-tree': 'Decision tree — methods'
  })[key] || key;
}

/** Units whose review matters most, and why — shown at the top of the review
 *  page so nobody starts with the glossary. Safety is first for one reason. */
export const PRIORITY = [
  ['bt/safety', 'A safety officer has to read this before anyone treats it as guidance. Nothing else on this list outranks it.'],
  ['materials', 'The newest module, and the one making the most claims about what a measurement does and does not establish.'],
  ['formulas', 'Every entry states where it is valid. A wrong validity claim is worse than a wrong formula, because it looks careful.'],
  ['potentials', 'Sixteen cited values and one from a weak source. Check the citations resolve to what they say they do.'],
  ['electrochemistry', 'The mechanism vocabulary the rest of the platform uses. If a distinction here is wrong, it is wrong everywhere.'],
  ['characterization', 'What each technique cannot tell you is the load-bearing half of these records.']
];
