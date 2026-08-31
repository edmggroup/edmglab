/**
 * EDMGLAB — materials and potentials, checked without a browser.
 *
 * The electrode-materials module makes two claims that are easy to state and
 * easy to quietly break:
 *
 *   1. NO CAPACITY IS STORED. Every number the module shows is computed from
 *      declared stoichiometry, so there is nothing to be wrong. The moment
 *      somebody pastes a value from a paper into materials.json, that claim is
 *      false and the module is lying about itself.
 *
 *   2. EVERY NUMBER THE MODULE DID NOT COMPUTE CARRIES A CITATION. That is the
 *      whole of potentials.json, and a sourceId pointing at nothing is worse
 *      than no citation at all, because it looks like one.
 *
 * Both are checked here. The arithmetic is also re-derived against
 * independently known figures — not to prove the code works, but to catch a
 * wrong formula unit or electron count in the DATA, which is where an error
 * would actually come from.
 *
 * Run:  node tools/materials-test.mjs      (no server, no browser)
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p) => JSON.parse(readFileSync(join(HERE, '..', p), 'utf8'));

const materials = read('data/materials.json');
const potentials = read('data/potentials.json');

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name + (detail ? '  ' + detail : '')); }
  else { fail++; console.log('  ✗ ' + name + (detail ? '  ' + detail : '')); }
};
const head = (s) => console.log('\n' + s);

/* ── The atomic weights, duplicated on purpose ──
   This table is a SECOND, independent copy of the one in js/views/materials.js.
   If it were imported, a typo in the weights would agree with itself and every
   test below would pass. Two copies that must produce the same answer is the
   only arrangement that can catch that. */
const W = {
  H: 1.008, Li: 6.94, C: 12.011, N: 14.007, O: 15.999, Na: 22.990, Mg: 24.305,
  Al: 26.982, Si: 28.085, P: 30.974, S: 32.06, K: 39.098, Ti: 47.867,
  V: 50.942, Mn: 54.938, Fe: 55.845, Co: 58.933, Ni: 58.693, Cu: 63.546,
  Zn: 65.38, Pb: 207.2
};
const F = 96485.332;
const molarMass = (c) => Object.entries(c).reduce((s, [el, n]) => s + W[el] * n, 0);
const capacity = (c, n) => (n * F) / (3.6 * molarMass(c));

/* ══════════════════════════════════════════════════════════
   1 · No stored capacities
   ══════════════════════════════════════════════════════════ */
head('No capacity is stored anywhere in materials.json');

const STORED = [];
(function walk(node, path) {
  if (node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) return node.forEach((v, i) => walk(v, `${path}[${i}]`));
  // A value object anywhere under a material is a stored measurement.
  if ('value' in node && typeof node.value === 'number' && 'unit' in node) {
    STORED.push(`${path} = ${node.value} ${node.unit}`);
    return;
  }
  for (const [k, v] of Object.entries(node)) {
    if (k.startsWith('_')) continue;
    walk(v, path ? `${path}.${k}` : k);
  }
})(materials.items, '');

ok('no value objects in any material record', STORED.length === 0,
  STORED.length ? '\n      ' + STORED.join('\n      ') : `(${materials.items.length} records)`);

ok('every reportedCapacity is null',
  materials.items.every((m) => m.reportedCapacity === null),
  materials.items.filter((m) => m.reportedCapacity !== null).map((m) => m.id).join(', '));

/* ══════════════════════════════════════════════════════════
   2 · The arithmetic, against independently known figures
   ══════════════════════════════════════════════════════════
   These are the numbers the field quotes. They are NOT stored in the app and
   are not used by it — they exist here only so that a wrong formula unit or a
   wrong electron count in the data shows up as a failing test rather than as a
   plausible-looking number on a page. Tolerance is 1 mAh/g, which is far
   tighter than any disagreement between atomic-weight tables. */
head('Derived capacities match what the field quotes (±1 mAh/g)');

const EXPECTED = {
  'material.graphite': 372, 'material.graphite_k': 279, 'material.li_metal': 3862,
  'material.na_metal': 1166, 'material.zn_metal': 820, 'material.silicon': 3579,
  'material.lto': 175, 'material.lifepo4': 170, 'material.lco': 274,
  'material.nmc111': 278, 'material.lmo': 148, 'material.nafepo4': 154,
  'material.mno2': 308, 'material.ltp': 138, 'material.ntp': 133,
  'material.pba_nafe': 171, 'material.ni_oh2': 289, 'material.pb': 259,
  'material.pbo2': 224, 'material.v2o5': 295, 'material.sulfur': 1672
};

for (const [id, want] of Object.entries(EXPECTED)) {
  const m = materials.items.find((x) => x.id === id);
  if (!m) { ok(id, false, 'record not found'); continue; }
  const got = capacity(m.composition, m.electrons);
  ok(`${id.replace('material.', '').padEnd(12)} ${got.toFixed(1)} mAh/g`,
    Math.abs(got - want) < 1, `(expected ~${want})`);
}

head('Materials with no formula unit compute nothing, deliberately');
for (const m of materials.items) {
  if (m.composition !== null && m.electrons !== null) continue;
  ok(`${m.id} declares no theoretical capacity`,
    m.composition === null && m.electrons === null && !!m.capacityBasis);
}

/* ══════════════════════════════════════════════════════════
   3 · Citations
   ══════════════════════════════════════════════════════════ */
head('Every potential carries a resolvable citation');

const SOURCES = new Set(Object.keys(potentials.sources || {}));
ok('the file declares at least one source', SOURCES.size > 0, [...SOURCES].join(', '));

for (const p of potentials.items) {
  const e = p.e0 || {};
  const cited = e.source || (e.sourceId && SOURCES.has(e.sourceId));
  ok(`${p.id.replace('potential.', '').padEnd(14)} ${String(e.printed ?? e.value).padStart(8)}`,
    Boolean(cited) && e.provenance === 'literature' && typeof e.value === 'number',
    cited ? '' : `UNCITED (sourceId=${e.sourceId ?? 'none'})`);
}

/* Not every citation is equally good, and a file that pretends otherwise is
   only half honest. A source marked `unsourced` cites nothing upstream, so it
   cannot be chased to a measurement — every row that leans on one has to say
   so where a reader will see it. */
head('Rows citing an unchaseable source carry a caution');

const WEAK = new Set(Object.entries(potentials.sources || {})
  .filter(([, s]) => s.unsourced).map(([k]) => k));
ok(`${WEAK.size} source(s) marked as citing nothing upstream`, true,
  WEAK.size ? [...WEAK].join(', ') : 'none — every source names its own references');
for (const p of potentials.items) {
  if (!WEAK.has(p.e0?.sourceId)) continue;
  ok(`${p.id.replace('potential.', '')} carries a caution`, Boolean(p.e0.caution),
    p.e0.caution ? '' : 'a value from an uncitable table MUST say so on the row');
}

ok('every e0.printed agrees with e0.value',
  potentials.items.every((p) => {
    if (!p.e0?.printed) return false;
    const n = parseFloat(p.e0.printed.replace('−', '-').replace('+', ''));
    return Math.abs(n - p.e0.value) < 1e-9;
  }),
  'a printed string that disagrees with its own number is the worst kind of typo');

/* ══════════════════════════════════════════════════════════
   4 · The water window, three independent ways
   ══════════════════════════════════════════════════════════
   The whole aqueous/non-aqueous half of the module rests on this one number,
   so it is checked against two tabulated pairs AND against thermochemistry. */
head('The water window is 1.229 V by three independent routes');

const E = (id) => potentials.items.find((p) => p.id === id)?.e0.value;
const acid = E('potential.o2_acid') - E('potential.h_acid');
const alkali = E('potential.o2_alkaline') - E('potential.h_alkaline');
const dG = -237.1e3;                       // J/mol, CRC 84th ed. via LibreTexts
const thermo = (-2 * dG) / (4 * F);

ok(`acid pair    O₂/H₂O − H⁺/H₂     = ${acid.toFixed(4)} V`, Math.abs(acid - 1.229) < 5e-4);
ok(`alkaline pair O₂/OH⁻ − H₂O/H₂   = ${alkali.toFixed(4)} V`, Math.abs(alkali - 1.229) < 5e-4);
ok(`thermochemistry −ΔG/nF          = ${thermo.toFixed(4)} V`, Math.abs(thermo - 1.229) < 1e-3);
ok('all three agree to within 1 mV',
  Math.max(acid, alkali, thermo) - Math.min(acid, alkali, thermo) < 1e-3);

head('The Nernst slope is derived, not quoted');
const R = 8.314462618, T = 298.15;
const slope = (Math.log(10) * R * T) / F;
ok(`2.303·R·T/F = ${slope.toFixed(5)} V/pH`,
  Math.abs(slope - potentials.constants.nernstSlope.value) < 1e-4);

head('Zinc crosses the hydrogen line inside the pH scale');
const znPH = (E('potential.h_acid') - E('potential.zn')) / slope;
ok(`Zn²⁺/Zn crosses at pH ${znPH.toFixed(2)}`, znPH > 0 && znPH < 14,
  'if this ever leaves 0–14 the panel’s central demonstration is silently gone');

/* ══════════════════════════════════════════════════════════
   5 · Cross-references
   ══════════════════════════════════════════════════════════ */
head('Cross-references between the two files resolve');

const ids = new Set([...materials.items, ...potentials.items].map((x) => x.id));
const dangling = [];
for (const rec of [...materials.items, ...potentials.items]) {
  for (const r of rec.relatedIds || []) {
    // Ids into other content files are checked by the in-app health page,
    // which loads all of them. Here we can only check the two we hold.
    if (/^(material|potential)\./.test(r) && !ids.has(r)) dangling.push(`${rec.id} → ${r}`);
  }
  for (const r of rec.fullCell?.pairedWith || []) {
    if (!ids.has(r)) dangling.push(`${rec.id}.fullCell.pairedWith → ${r}`);
  }
}
ok('no dangling material/potential references', dangling.length === 0,
  dangling.length ? '\n      ' + dangling.join('\n      ') : '');

head('Every material states its electrolyte context');
const missing = materials.items.filter((m) =>
  !Array.isArray(m.electrolyteContext) || !m.electrolyteContext.length);
ok('all records have electrolyteContext', missing.length === 0,
  missing.map((m) => m.id).join(', '));

const badViable = materials.items.flatMap((m) =>
  (m.electrolyteContext || []).filter((c) => !['yes', 'no', 'conditional'].includes(c.viable))
    .map((c) => `${m.id}: ${c.viable}`));
ok('every context declares viable as yes/no/conditional', badViable.length === 0,
  badViable.join(', '));

/* ══════════════════════════════════════════════════════════
   6 · The pathway's inputs
   ══════════════════════════════════════════════════════════
   #/pathway derives everything it shows from these fields. The failure mode is
   silent: a mechanismId pointing at nothing, or a materialNotes key naming a
   material that has been renamed, does not throw — the stage simply goes quiet
   and reports itself as "generic", which reads as a content gap rather than as
   a broken link. Nothing but this catches that. */
head('Every material declares a storage mechanism, or says why it cannot');

const mechIds = new Set(
  JSON.parse(readFileSync(join(HERE, '..', 'data/electrochemistry.json'), 'utf8'))
    .items.map((m) => m.id));

for (const m of materials.items) {
  if (m.mechanismId === undefined) { ok(m.id, false, 'no mechanismId field at all'); continue; }
  if (m.mechanismId === null) {
    ok(`${m.id.replace('material.', '').padEnd(12)} no mechanism, with a stated reason`,
      Boolean(m.mechanismNote), 'a null mechanism MUST carry a mechanismNote');
    continue;
  }
  ok(`${m.id.replace('material.', '').padEnd(12)} ${m.mechanismId.replace('mechanism.', '')}`,
    mechIds.has(m.mechanismId), mechIds.has(m.mechanismId) ? '' : 'NOT A REAL MECHANISM ID');
}

head('Material notes on techniques and symptoms point at real materials');

const noteFiles = ['data/characterization.json',
  'data/battery-tester/troubleshooting.json', 'data/echem/troubleshooting.json'];
const ids2 = new Set(materials.items.map((m) => m.id));
const orphanNotes = [];
let noteCount = 0;
for (const f of noteFiles) {
  for (const rec of read(f).items || []) {
    for (const key of Object.keys(rec.materialNotes || {})) {
      noteCount++;
      if (!ids2.has(key)) orphanNotes.push(`${f} · ${rec.id} → ${key}`);
      // A note without the matching relatedIds entry never renders anywhere else.
      else if (!(rec.relatedIds || []).includes(key)) {
        orphanNotes.push(`${f} · ${rec.id} has a note for ${key} but no relatedIds entry`);
      }
    }
  }
}
ok(`${noteCount} material notes all resolve and are cross-linked`, orphanNotes.length === 0,
  orphanNotes.length ? '\n      ' + orphanNotes.join('\n      ') : '');

head('The pathway has something specific to say about every material');
/* Mirrors the view's own rule for the four stages that read straight from a
   record. If a material ever falls to zero here the pathway page for it is an
   empty shell, and that should fail loudly rather than render. */
const thin = materials.items.filter((m) => {
  const n = [
    Boolean(m.mechanismId) || Boolean(m.mechanismNote),
    Boolean(m.summary && m.reaction),
    Boolean(m.halfCell?.whatItMeasures),
    Boolean((m.cannotTell || []).length)
  ].filter(Boolean).length;
  return n < 4;
});
ok('all 24 materials fill the four record-driven stages', thin.length === 0,
  thin.map((m) => m.id).join(', '));

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
