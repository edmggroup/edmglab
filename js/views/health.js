/**
 * EDMGLAB — Data health check (Architecture v0.2 §D.5)
 *
 * Loads every registered data file and validates it in the browser. No build
 * tooling, no CI, no installation — open the page, read the result.
 *
 * This exists because cross-references are hand-maintained strings in JSON and
 * they rot silently: a material gets renamed, and a troubleshooting entry keeps
 * pointing at a formula that no longer exists. Nothing breaks visibly, so
 * nobody notices for months.
 *
 * Several checks here enforce SCIENTIFIC rules rather than technical ones —
 * they are the machine-readable form of the accuracy requirements in the spec:
 *
 *   §40  every numeric value must declare its provenance
 *   §40  literature and datasheet values must cite a source
 *   §40  a formula must state the configuration it is valid for
 *   §11/§33  a troubleshooting entry must offer MULTIPLE possible causes —
 *            one symptom must never be presented as proving one cause
 */

import * as data from '../data.js';
import { esc, pageHead, callout } from '../ui.js';
import { compile } from '../lib/expr.js';

const SEV = { error: 'error', warn: 'warning', info: 'info' };

export async function render(outlet) {
  outlet.innerHTML = `${pageHead('Data health check',
    'Validates every content file against the schema and the scientific-accuracy rules.')}
    <div class="loading-row"><span class="spinner"></span> Loading all data files…</div>`;

  const keys = data.allKeys();
  await Promise.all(keys.map((k) => data.load(k).catch(() => null)));

  const files = data.loadedFiles();
  const missing = data.missingKeys();
  const issues = [];
  const allIds = new Map();     // id -> file key
  let recordCount = 0;

  /* ── Pass 1: per-record structural and scientific checks ── */
  for (const { key, payload } of files) {
    if (payload.schemaVersion === undefined) {
      issues.push(mk('warn', key, '(file)', 'No schemaVersion — future migrations cannot be applied safely.'));
    }

    /* Not every data file is a content collection. A decision tree is a graph
       of nodes, not a list of records, and demanding an `items` array of it
       would be the checker misunderstanding the file rather than the file
       being wrong. Such files declare `_kind` and are structurally exempt. */
    if (payload._kind && payload._kind !== 'content') continue;

    if (!Array.isArray(payload.items)) {
      issues.push(mk('error', key, '(file)', 'Missing an "items" array.'));
      continue;
    }

    for (const rec of payload.items) {
      recordCount++;

      if (!rec.id) {
        issues.push(mk('error', key, '(no id)', 'Record has no id — it cannot be cross-referenced.'));
        continue;
      }
      if (!/^[a-z]+\.[a-z0-9_.]+$/.test(rec.id)) {
        issues.push(mk('warn', key, rec.id,
          'id is not namespaced as "type.name" (e.g. concept.specific_capacitance).'));
      }
      if (allIds.has(rec.id)) {
        issues.push(mk('error', key, rec.id, `Duplicate id — also defined in ${allIds.get(rec.id)}.`));
      } else {
        allIds.set(rec.id, key);
      }

      checkProvenance(rec, key, rec.id, issues);

      // Formulas must state where they are valid (§40, Architecture §D.4).
      if (rec.id.startsWith('formula.')) {
        if (!rec.validContext) {
          issues.push(mk('error', key, rec.id,
            'Formula has no validContext — a formula must state the cell configuration and performance level it applies to.'));
        }
        if (!rec.variables?.length) {
          issues.push(mk('warn', key, rec.id, 'Formula lists no variables.'));
        }
        if (!rec.assumptions?.length) {
          issues.push(mk('warn', key, rec.id, 'Formula states no assumptions.'));
        }
        if (!rec.limitations?.length) {
          issues.push(mk('warn', key, rec.id, 'Formula states no limitations — every equation has conditions it fails under.'));
        }

        /* A formula that offers a CALCULATOR is a stronger claim than one that
           only prints an equation: somebody will act on the number. These
           checks are the machine-readable form of that responsibility. */
        if (rec.expression) {
          let fn = null;
          try {
            fn = compile(rec.expression);
          } catch (e) {
            issues.push(mk('error', key, rec.id,
              `Expression does not parse (${e.message}) — the calculator would be broken.`));
          }
          if (fn) {
            const declared = new Set((rec.variables || []).map((v) => v.symbol));
            for (const s of fn.symbols) {
              if (!declared.has(s)) {
                issues.push(mk('error', key, rec.id,
                  `Expression uses "${s}", which is not declared in variables. The calculator would ask for a value it cannot label, or silently compute with nothing.`));
              }
            }
            for (const v of rec.variables || []) {
              if (!fn.symbols.includes(v.symbol)) {
                issues.push(mk('warn', key, rec.id,
                  `Variable "${v.symbol}" is declared but never used by the expression.`));
              }
              if (!v.units?.length) {
                issues.push(mk('error', key, rec.id,
                  `Variable "${v.symbol}" declares no units. Every input must state what it converts to SI by — unit errors are the most common way a calculated result is wrong.`));
              }
            }
            if (!rec.result?.units?.length) {
              issues.push(mk('error', key, rec.id,
                'Computable formula has no result units — the answer would be a bare number.'));
            }
          }
        }
      }

      // Troubleshooting must never present one symptom as proving one cause.
      if (rec.id.startsWith('troubleshooting.') || rec.symptom) {
        const causes = rec.causes || [];
        if (causes.length === 0) {
          issues.push(mk('error', key, rec.id, 'Troubleshooting entry lists no possible causes.'));
        } else if (causes.length === 1) {
          issues.push(mk('error', key, rec.id,
            'Only ONE possible cause. Spec §11/§33: always offer multiple candidate causes — a single symptom must not be presented as proving a single cause.'));
        }
        if (!(rec.diagnostics || []).length) {
          issues.push(mk('warn', key, rec.id, 'No diagnostic checks suggested.'));
        }
      }

      // Method records must state their limitations (§6, §18 field lists).
      if (rec.id.startsWith('method.')) {
        if (!(rec.limitations || []).length) {
          issues.push(mk('warn', key, rec.id, 'Method record states no limitations.'));
        }
        if (!rec.instrument?.controls || !rec.instrument?.measures) {
          issues.push(mk('warn', key, rec.id,
            'Method does not declare what is controlled and what is measured — the §34 distinction.'));
        }
      }

      /* A characterisation technique must state what it CANNOT tell you.
         Nearly every characterisation mistake in this field is a technique
         applied outside the question it can answer — BET area presented as
         electrochemically accessible area, Scherrer size as particle size,
         a bulk claim from a surface technique — and the wrong answer still
         looks like a result. A technique page without that list teaches the
         confidence that causes the mistake. */
      if (rec.id.startsWith('technique.')) {
        const cant = rec.cannotTell || [];
        if (cant.length === 0) {
          issues.push(mk('error', key, rec.id,
            'Technique record does not state what it CANNOT tell you. That field is required — a technique page without its limits teaches over-confidence.'));
        } else if (cant.length < 2) {
          issues.push(mk('warn', key, rec.id,
            'Only one stated limit. Most techniques are blind to several things worth naming.'));
        }
        if (!(rec.answers || []).length) {
          issues.push(mk('warn', key, rec.id, 'Technique states nothing it can answer.'));
        }
        if (!rec.sample) {
          issues.push(mk('warn', key, rec.id,
            'Technique does not describe what the sample has to be, or what preparation does to it.'));
        }
        if (!(rec.reportWith || []).length) {
          issues.push(mk('warn', key, rec.id,
            'Technique does not say what must be reported alongside the result.'));
        }
      }

      /* A storage-mechanism record must say how to tell it from its
         neighbours. Mechanisms sit on a continuum, and every curve shape on
         one of these pages is shared with at least one neighbouring mechanism
         — a near-rectangular voltammogram is double-layer OR broad surface
         redox; a plateau is intercalation OR a side reaction holding a
         voltage. A record that lists a signature without saying what else
         produces it teaches exactly the identification error the page exists
         to prevent. */
      if (rec.id.startsWith('mechanism.')) {
        const d = rec.distinguishFrom || [];
        if (d.length === 0) {
          issues.push(mk('error', key, rec.id,
            'Mechanism record does not say how to distinguish it from its neighbours. Required — no single curve identifies a mechanism, and a page that implies one does teaches the mistake.'));
        } else if (d.length < 2) {
          issues.push(mk('warn', key, rec.id,
            'Only one distinguishing test given. Most mechanisms are confusable with more than one neighbour.'));
        }
        if (!rec.quantityToReport) {
          issues.push(mk('warn', key, rec.id,
            'Mechanism does not state which quantity may be reported for it — the practical consequence of the mechanism.'));
        }
        for (const f of ['inCV', 'inGCD', 'dQdV']) {
          if (!rec[f]) {
            issues.push(mk('warn', key, rec.id, `Mechanism does not describe its "${f}" signature.`));
          }
        }
      }

      /* A concept record exists to be read in two registers. One with neither
         filled in renders as a title and nothing else, which is worse than not
         listing the concept at all. */
      if (rec.id.startsWith('concept.')) {
        const l = rec.learnMode || {}, r = rec.researchMode || {};
        const hasLearn = !!(l.simpleDefinition || l.physicalMeaning || l.example);
        const hasResearch = !!(r.scientificDefinition || r.mathematicalTreatment || r.experimentalInterpretation);
        if (!hasLearn && !hasResearch) {
          issues.push(mk('error', key, rec.id,
            'Concept has neither a Learn nor a Research version — it would render as a heading with nothing under it.'));
        } else if (!hasLearn) {
          issues.push(mk('warn', key, rec.id, 'Concept has no Learn version; it disappears in Learn mode.'));
        } else if (!hasResearch) {
          issues.push(mk('warn', key, rec.id, 'Concept has no Research version; it disappears in Research mode.'));
        }
      }

      /* A quiz question that only explains its correct answer teaches nothing
         about the trap. The wrong options are the trap, so each one has to say
         why it is plausible and why it fails. */
      if (rec.id.startsWith('quiz.')) {
        const opts = rec.options || [];
        const correct = opts.filter((o) => o.correct).length;
        if (opts.length < 2) {
          issues.push(mk('error', key, rec.id, 'Quiz question has fewer than two options.'));
        }
        if (correct !== 1) {
          issues.push(mk('error', key, rec.id,
            `Quiz question has ${correct} correct options — it must have exactly one.`));
        }
        const unexplained = opts.filter((o) => !o.why).length;
        if (unexplained) {
          issues.push(mk('error', key, rec.id,
            `${unexplained} option(s) carry no explanation. Every option must say why it is right or why it is wrong — the wrong ones are where the teaching is.`));
        }
        if (!rec.explanation) {
          issues.push(mk('warn', key, rec.id, 'Quiz question has no overall explanation.'));
        }
      }

      // Anything that plots a model must declare that model.
      if (rec.simulation && !rec.simulationBasis) {
        issues.push(mk('error', key, rec.id,
          'Simulated content without a simulationBasis — the governing model and its assumptions must be stated.'));
      }
    }
  }

  /* ── Pass 2: cross-reference integrity ── */
  const REF_FIELDS = ['relatedIds', 'equationIds', 'relatedFormulaIds', 'feedsFormulaIds',
                      'troubleshootingIds', 'relatedTechniqueIds', 'measuredBy'];
  for (const { key, payload } of files) {
    for (const rec of payload.items || []) {
      for (const field of REF_FIELDS) {
        for (const ref of rec[field] || []) {
          if (!allIds.has(ref)) {
            issues.push(mk('error', key, rec.id, `${field} → "${ref}" does not resolve to any record.`));
          }
        }
      }
      if (rec.calculatorId && !allIds.has(rec.calculatorId)) {
        issues.push(mk('error', key, rec.id, `calculatorId → "${rec.calculatorId}" does not resolve.`));
      }
    }
  }

  /* ── Render ── */
  const errors = issues.filter((i) => i.sev === 'error');
  const warns = issues.filter((i) => i.sev === 'warn');
  const authored = files.filter((f) => (f.payload.items || []).length).length;

  outlet.innerHTML = `
    ${pageHead('Data health check',
      'Validates every content file against the schema and the scientific-accuracy rules.')}

    <div class="health-summary">
      <div class="health-stat"><span class="hs-num">${authored}</span><span class="hs-lbl">Files with content</span></div>
      <div class="health-stat"><span class="hs-num">${recordCount}</span><span class="hs-lbl">Records</span></div>
      <div class="health-stat ${errors.length ? 'err' : 'ok'}"><span class="hs-num">${errors.length}</span><span class="hs-lbl">Errors</span></div>
      <div class="health-stat ${warns.length ? 'warn' : 'ok'}"><span class="hs-num">${warns.length}</span><span class="hs-lbl">Warnings</span></div>
    </div>

    ${recordCount === 0
      ? callout(`<strong>No content authored yet.</strong> This is expected in Phase 0 — the data layer,
         schema versioning and every check below are in place and will run against content as it is written.
         Content files that do not exist yet are treated as empty rather than as errors.`, 'info')
      : errors.length === 0
        ? callout('<strong>No errors.</strong> Every cross-reference resolves and every record passes the required checks.', 'ok')
        : callout(`<strong>${errors.length} error${errors.length === 1 ? '' : 's'} found.</strong>
           Fix these before merging content changes — each one means something is broken or scientifically unsafe.`, 'danger')}

    ${issues.length ? `
      <section class="section" style="margin-top:1.5rem">
        <div class="section-head"><h2>Issues</h2>
          <span class="section-note">errors first</span></div>
        <div class="panel">
          ${[...errors, ...warns].map(issueRow).join('')}
        </div>
      </section>` : ''}

    <section class="section">
      <div class="section-head"><h2>Files</h2>
        <span class="section-note">${missing.length} not yet authored</span></div>
      ${missing.length ? `<p class="small muted" style="margin-bottom:.8rem">
        This page deliberately probes every registered data file, so files that have not been written yet
        produce <code>404</code> entries in the browser console. That is expected here and nowhere else —
        ordinary pages only request the files they need.</p>` : ''}
      <div class="table-wrap"><table class="stackable">
        <thead><tr><th>Data key</th><th>Records</th><th>Schema</th><th>Status</th></tr></thead>
        <tbody>
          ${keys.map((k) => {
            const f = files.find((x) => x.key === k);
            const count = f ? (f.payload.items || []).length : 0;
            const isMissing = missing.includes(k);
            /* A file that declares a non-content `_kind` holds a tree, a
               diagram set or a grouped document rather than a record list.
               Reporting it as "empty" would read as missing content when the
               file is in fact full — say what shape it is instead. */
            const kind = f && !isMissing && f.payload._kind && f.payload._kind !== 'content'
              ? f.payload._kind : null;
            return `<tr>
              <td data-label="Data key"><code>${esc(k)}</code></td>
              <td data-label="Records" class="num">${isMissing ? '—' : kind ? 'n/a' : count}</td>
              <td data-label="Schema" class="num">${f && !isMissing ? esc(f.payload.schemaVersion ?? '—') : '—'}</td>
              <td data-label="Status">${isMissing
                ? '<span class="chip">not yet authored</span>'
                : kind ? `<span class="badge badge-literature">loaded</span> <span class="chip">${esc(kind)}</span>`
                : count ? '<span class="badge badge-literature">loaded</span>'
                        : '<span class="chip">empty</span>'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table></div>
    </section>

    <section class="section">
      <div class="section-head"><h2>What this checks</h2></div>
      <div class="panel"><div class="panel-body">
        <ul class="small" style="margin:0;padding-left:1.1rem;display:grid;gap:.35rem">
          <li>Every record has a unique, namespaced <code>id</code>.</li>
          <li>Every cross-reference (<code>relatedIds</code>, <code>equationIds</code>, <code>calculatorId</code>…) resolves to a real record.</li>
          <li>Every numeric value declares a <code>provenance</code>; literature and datasheet values cite a <code>source</code>.</li>
          <li>Every formula declares a <code>validContext</code> — the configuration it is valid for.</li>
          <li>Every computable formula's <code>expression</code> parses, uses only declared variables, and gives every input and its result a unit.</li>
          <li>Every troubleshooting entry offers <strong>more than one</strong> possible cause.</li>
          <li>Every characterisation technique states what it <strong>cannot</strong> tell you.</li>
          <li>Every storage mechanism states how to <strong>distinguish it from its neighbours</strong>.</li>
          <li>Every concept has both a <strong>Learn</strong> and a <strong>Research</strong> version, so neither mode shows an empty page.</li>
          <li>Every quiz question has exactly <strong>one</strong> correct option, and every option — right or wrong — explains itself.</li>
          <li>Every method record declares what is <em>controlled</em> and what is <em>measured</em>, and states its limitations.</li>
          <li>Any simulated content declares the model it is based on.</li>
        </ul>
      </div></div>
    </section>`;

  return { destroy() {} };
}

/** Recursively find numeric value objects and check their provenance. */
function checkProvenance(node, key, id, issues, path = '', depth = 0) {
  if (depth > 6 || node === null || typeof node !== 'object') return;

  if (Array.isArray(node)) {
    node.forEach((v, i) => checkProvenance(v, key, id, issues, `${path}[${i}]`, depth + 1));
    return;
  }

  // A value object is anything with a numeric `value` and a `unit`.
  const looksLikeValue = 'value' in node && typeof node.value === 'number' && 'unit' in node;
  if (looksLikeValue) {
    if (!node.provenance) {
      issues.push(mk('error', key, id,
        `${path || 'value'} has a number and a unit but no provenance — it would render as "Unverified".`));
    } else if ((node.provenance === 'literature' || node.provenance === 'datasheet') && !node.source) {
      issues.push(mk('error', key, id,
        `${path} is marked "${node.provenance}" but cites no source. Spec §40 requires a citation.`));
    } else if (node.provenance === 'measured' && !node.date) {
      issues.push(mk('warn', key, id, `${path} is marked "measured" but has no date.`));
    }
    return;
  }

  for (const [k, v] of Object.entries(node)) {
    if (k.startsWith('_')) continue;
    checkProvenance(v, key, id, issues, path ? `${path}.${k}` : k, depth + 1);
  }
}

function mk(sev, file, id, message) { return { sev, file, id, message }; }

function issueRow(i) {
  const badge = i.sev === 'error'
    ? '<span class="badge badge-unverified">Error</span>'
    : '<span class="badge badge-measured">Warning</span>';
  return `<div class="issue">
    <div style="flex:none">${badge}</div>
    <div>
      <div>${esc(i.message)}</div>
      <div class="i-file">${esc(i.file)} · ${esc(i.id)}</div>
    </div>
  </div>`;
}
