/**
 * EDMGLAB — Generic formula renderer and calculator
 * (Architecture v0.2 §D.4 · Instrumentation spec §40)
 *
 * ONE renderer for every formula in the library, and one calculator generated
 * from the record itself. There is no per-formula code anywhere in the app.
 *
 * ── THE ORDER ON THE PAGE IS THE ARGUMENT ──
 * Valid context comes FIRST, above the equation and well above the calculator.
 * A student arriving to compute a specific capacitance meets the question of
 * which configuration they are in before they meet an input box. That ordering
 * is the whole reason this platform exists rather than a spreadsheet: the
 * spreadsheet will happily apply a three-electrode equation to a symmetric
 * device and return a number four times too large, and nothing about the
 * number will look wrong.
 *
 * ── WHAT THE RESULT IS ALLOWED TO CLAIM ──
 * A computed value is labelled `userEntered` — derived from numbers the user
 * typed, by an equation whose assumptions are listed beside it. It is never
 * presented as a measurement, and the assumptions are on the page rather than
 * behind a link.
 */

import { esc } from '../ui.js';
import { computeFormula, findUnit, sig, compile } from './expr.js';

/* ════════════════════════════════════════════════════════════
   Small pieces
   ════════════════════════════════════════════════════════════ */

const DOMAIN_LABEL = {
  supercapacitor: 'Supercapacitor',
  battery: 'Battery',
  kinetics: 'Kinetics & electrochemistry',
  shared: 'Shared / electrode'
};

const SOURCE_LABEL = {
  GCD: 'a charge–discharge curve',
  CV: 'a cyclic voltammogram',
  EIS: 'an impedance spectrum',
  cycling: 'a cycling run',
  GITT: 'a GITT run',
  geometry: 'bench measurements',
  literature: 'reference values'
};

export function domainLabel(d) { return DOMAIN_LABEL[d] || 'Other'; }
export function sourceLabel(s) { return SOURCE_LABEL[s] || s; }

/** The valid-context block. Deliberately the first thing on the page. */
export function contextBlock(f) {
  const c = f.validContext || {};
  return `<div class="fx-context">
    <div class="fx-ctx-head">Valid for</div>
    <div class="fx-ctx-grid">
      <div><span class="k">Cell type</span><span class="v">${esc(c.cellType || '—')}</span></div>
      <div><span class="k">Configuration</span><span class="v">${esc(c.deviceConfig || '—')}</span></div>
      <div><span class="k">Performance level</span><span class="v">${esc(c.performanceLevel || '—')}</span></div>
      ${f.normalizationBasis ? `<div><span class="k">Normalisation</span><span class="v">${esc(f.normalizationBasis)}</span></div>` : ''}
    </div>
    ${c.note ? `<p class="fx-ctx-note">${esc(c.note)}</p>` : ''}
  </div>`;
}

/* ════════════════════════════════════════════════════════════
   The calculator
   ════════════════════════════════════════════════════════════ */

/**
 * Build a working calculator for one formula record.
 * @param {HTMLElement} host
 * @param {object} f  formula record
 * @param {object} [opts] {compact:boolean}
 */
export function renderCalculator(host, f, opts = {}) {
  if (!f.expression) {
    host.innerHTML = `<div class="callout">This formula is a reference entry — it has no computable form here.</div>`;
    return { destroy() {} };
  }

  // Confirm the expression parses before offering a calculator at all. A
  // record with a broken expression must fail visibly, not silently return
  // nothing when the user presses a key.
  try { compile(f.expression); }
  catch (e) {
    host.innerHTML = `<div class="callout callout-danger"><strong>This formula cannot be computed.</strong>
      Its expression did not parse: ${esc(e.message)}. Please report this — it is a content error.</div>`;
    return { destroy() {} };
  }

  const state = {};
  for (const v of f.variables || []) state[v.symbol] = { value: v.default ?? '', unit: v.units?.[0]?.u };
  state.__resultUnit = f.result?.units?.[0]?.u;

  host.innerHTML = `
    <div class="fx-calc">
      <div class="fx-inputs">
        ${(f.variables || []).map((v) => `
          <label class="fx-in">
            <span class="fx-sym">${esc(v.symbol)}</span>
            <span class="fx-nm">${esc(v.name)}</span>
            <span class="fx-row">
              <input type="number" data-sym="${esc(v.symbol)}" value="${esc(String(v.default ?? ''))}"
                     step="any" inputmode="decimal" autocomplete="off">
              ${v.units?.length > 1
                ? `<select data-unit="${esc(v.symbol)}">${v.units.map((u) =>
                    `<option value="${esc(u.u)}">${esc(u.u)}</option>`).join('')}</select>`
                : `<span class="fx-unit">${esc(v.units?.[0]?.u || '')}</span>`}
            </span>
            ${v.note ? `<span class="fx-note">${esc(v.note)}</span>` : ''}
          </label>`).join('')}
      </div>

      <div class="fx-out" id="fx-out"></div>
    </div>`;

  const out = host.querySelector('#fx-out');

  function recompute() {
    const r = computeFormula(f, state);

    if (!r.ok) {
      out.innerHTML = r.missing
        ? `<div class="fx-result pending"><span class="fx-rlabel">Result</span>
             <span class="fx-rvalue">—</span>
             <span class="fx-rnote">Enter ${r.missing.map((s) => `<code>${esc(s)}</code>`).join(', ')} to compute.</span></div>`
        : `<div class="callout callout-danger">${esc(r.error)}</div>`;
      return;
    }

    const undefined_ = !Number.isFinite(r.value);

    out.innerHTML = `
      <div class="fx-result${undefined_ ? ' pending' : ''}">
        <span class="fx-rlabel">${esc(f.result?.name || 'Result')}</span>
        <span class="fx-rvalue">${esc(sig(r.value, 5))}
          ${f.result?.units?.length > 1
            ? `<select id="fx-runit" class="fx-runit" aria-label="Unit for the result">${f.result.units.map((u) =>
                `<option value="${esc(u.u)}"${u.u === state.__resultUnit ? ' selected' : ''}>${esc(u.u)}</option>`).join('')}</select>`
            : `<span class="fx-runit-static">${esc(r.unit)}</span>`}
        </span>
        ${undefined_ ? `<span class="fx-rnote">Undefined — check for a zero in a denominator.</span>` : ''}
      </div>

      <div class="fx-prov">
        <span class="badge badge-unverified">Computed</span>
        Derived from the values you entered, using the equation above. Not a measurement, and only
        as good as the assumptions listed below.
      </div>

      <details class="fx-work">
        <summary>Show the working, in SI</summary>
        <div class="fx-work-body">
          <p class="xsmall muted" style="margin:0 0 .5rem">Everything is converted to SI before the
          equation is evaluated. That conversion, not the arithmetic, is where results usually go wrong.</p>
          <table class="fx-wtable"><tbody>
            ${(f.variables || []).map((v) => {
              const got = state[v.symbol];
              const u = findUnit(v.units, got?.unit);
              const si = r.scope[v.symbol];
              return `<tr><td><code>${esc(v.symbol)}</code></td>
                <td class="num">${esc(String(got?.value ?? '—'))} ${esc(u?.u || '')}</td>
                <td class="arrow">→</td>
                <td class="num">${esc(sig(si, 5))} ${esc(v.siUnit || '')}</td></tr>`;
            }).join('')}
            <tr class="fx-wres"><td><code>=</code></td><td colspan="2">${esc(f.plainText || f.expression)}</td>
              <td class="num">${esc(sig(r.si, 5))} ${esc(f.result?.siUnit || '')}</td></tr>
          </tbody></table>
        </div>
      </details>`;

    const rsel = out.querySelector('#fx-runit');
    if (rsel) rsel.addEventListener('change', () => { state.__resultUnit = rsel.value; recompute(); });
  }

  host.querySelectorAll('[data-sym]').forEach((inp) => {
    inp.addEventListener('input', () => {
      const raw = inp.value.trim();
      state[inp.dataset.sym].value = raw === '' ? '' : parseFloat(raw);
      recompute();
    });
  });
  host.querySelectorAll('[data-unit]').forEach((sel) => {
    sel.addEventListener('change', () => {
      state[sel.dataset.unit].unit = sel.value;
      recompute();
    });
  });

  recompute();
  return { destroy() {}, state, recompute };
}

/* ════════════════════════════════════════════════════════════
   Full formula page
   ════════════════════════════════════════════════════════════ */

export function renderFormulaDetail(host, f, opts = {}) {
  if (!f) {
    host.innerHTML = `<div class="callout callout-warn">That formula is not in the library.</div>`;
    return { destroy() {} };
  }

  host.innerHTML = `
    ${opts.backHref ? `<a class="btn btn-sm" href="${esc(opts.backHref)}" style="margin-bottom:1rem">← Formula library</a>` : ''}

    <header class="page-head">
      <h1>${esc(f.name)}</h1>
      ${f.derivedFrom ? `<p class="page-lede">Computed from ${esc(sourceLabel(f.derivedFrom))}.</p>` : ''}
    </header>

    ${contextBlock(f)}

    <div class="fx-eq">
      <code>${esc(f.plainText || f.expression)}</code>
      ${f.result?.siUnit ? `<span class="fx-eq-unit">result in ${esc(f.result.siUnit)}</span>` : ''}
    </div>

    ${f.interactive?.route ? `<div class="callout callout-info" style="margin-bottom:1.25rem">
      <strong>Interactive.</strong>
      <a href="${esc(f.interactive.route)}">${esc(f.interactive.label || 'Open the interactive page')} →</a>
    </div>` : ''}

    <section class="section">
      <div class="section-head"><h2>Calculate</h2>
        <span class="section-note">values you enter · never stored or sent anywhere</span></div>
      <div id="fx-calc-host"></div>
    </section>

    <section class="section">
      <div class="section-head"><h2>Symbols</h2></div>
      <div class="table-wrap"><table class="stackable">
        <thead><tr><th>Symbol</th><th>Quantity</th><th>SI unit</th></tr></thead>
        <tbody>${(f.variables || []).map((v) => `<tr>
          <td data-label="Symbol"><code>${esc(v.symbol)}</code></td>
          <td data-label="Quantity">${esc(v.name)}${v.note ? `<br><span class="xsmall muted">${esc(v.note)}</span>` : ''}</td>
          <td data-label="SI unit"><code>${esc(v.siUnit || '')}</code></td></tr>`).join('')}
        </tbody></table></div>
    </section>

    <div class="fx-two">
      ${f.assumptions?.length ? `<div class="panel"><div class="panel-head">This equation assumes</div>
        <div class="panel-body"><ul class="lim-list">${f.assumptions.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div></div>` : ''}
      ${f.limitations?.length ? `<div class="panel"><div class="panel-head">What it cannot tell you</div>
        <div class="panel-body"><ul class="lim-list warn">${f.limitations.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div></div>` : ''}
    </div>

    <div id="fx-links"></div>

    <div class="callout callout-warn" style="margin-top:1.5rem">
      <strong>Draft content.</strong> Written to be scientifically defensible, but pending review by the
      research group before it is treated as teaching material.
    </div>`;

  const calc = renderCalculator(host.querySelector('#fx-calc-host'), f);
  return { destroy() { calc.destroy?.(); } };
}

/** Related links, resolved against whatever is loaded (see data.resolveLoaded). */
export function relatedHtml(f, resolve) {
  const groups = [];
  const push = (label, ids, hrefFor) => {
    const rows = (ids || []).map((id) => {
      const hit = resolve(id);
      return hit ? `<a class="chip" href="${esc(hrefFor(id))}">${esc(hit.record.name || hit.record.title || id)}</a>` : '';
    }).filter(Boolean);
    if (rows.length) groups.push(`<div class="fx-rel"><span class="k">${esc(label)}</span><div>${rows.join(' ')}</div></div>`);
  };

  push('Related formulas', f.relatedFormulaIds, (id) => `#/formula/${id.split('.').slice(1).join('.')}`);
  push('Measured by', f.measuredBy, (id) => `#/method/${id.split('.').slice(1).join('.')}`);
  push('See also', f.relatedIds, (id) => {
    const ns = id.split('.')[0], tail = id.split('.').slice(1).join('.');
    if (ns === 'troubleshooting') return `#/troubleshooting/${tail}`;
    if (ns === 'method') return `#/method/${tail}`;
    return `#/formulas`;
  });

  return groups.length
    ? `<section class="section"><div class="section-head"><h2>Connected to</h2></div>
       <div class="fx-rels">${groups.join('')}</div></section>`
    : '';
}

/* ════════════════════════════════════════════════════════════
   Shared styles — injected once, used by both formula views
   ════════════════════════════════════════════════════════════ */

export const FORMULA_CSS = `
  .fx-context { border:1px solid var(--border); border-left:3px solid var(--accent);
    border-radius:var(--r-md); background:var(--surface); padding:.85rem 1rem; margin-bottom:1.25rem; }
  .fx-ctx-head { font-size:var(--fs-xs); text-transform:uppercase; letter-spacing:.06em;
    color:var(--accent-strong); font-weight:700; margin-bottom:.5rem; }
  .fx-ctx-grid { display:grid; gap:.6rem; grid-template-columns:1fr; }
  @media (min-width:760px){ .fx-ctx-grid { grid-template-columns:1fr 1fr; } }
  @media (min-width:1100px){ .fx-ctx-grid { grid-template-columns:repeat(4,1fr); } }
  .fx-ctx-grid .k { display:block; font-size:var(--fs-xs); color:var(--text-muted);
    text-transform:uppercase; letter-spacing:.05em; font-weight:650; }
  .fx-ctx-grid .v { font-size:var(--fs-sm); color:var(--text); }
  .fx-ctx-note { font-size:var(--fs-sm); color:var(--text-2); margin:.7rem 0 0;
    border-top:1px solid var(--border); padding-top:.6rem; }

  .fx-eq { display:flex; flex-wrap:wrap; align-items:baseline; gap:.75rem;
    background:var(--surface-2); border:1px solid var(--border); border-radius:var(--r-md);
    padding:.9rem 1.1rem; margin-bottom:1.25rem; }
  .fx-eq code { font-family:var(--font-mono); font-size:var(--fs-md); color:var(--text);
    background:none; border:0; padding:0; overflow-wrap:anywhere; }
  .fx-eq-unit { font-size:var(--fs-xs); color:var(--text-muted); font-family:var(--font-mono); }

  .fx-calc { display:grid; gap:1rem; grid-template-columns:1fr; align-items:start; }
  @media (min-width:900px){ .fx-calc { grid-template-columns:minmax(300px,1fr) minmax(280px,360px); } }
  .fx-inputs { display:grid; gap:.7rem; grid-template-columns:1fr; }
  @media (min-width:560px){ .fx-inputs { grid-template-columns:1fr 1fr; } }
  .fx-in { display:grid; gap:.2rem; border:1px solid var(--border); border-radius:var(--r-sm);
    background:var(--surface); padding:.55rem .7rem; }
  .fx-sym { font-family:var(--font-mono); font-size:var(--fs-sm); font-weight:700; color:var(--accent-strong); }
  .fx-nm { font-size:var(--fs-xs); color:var(--text-2); line-height:1.3; }
  .fx-row { display:flex; gap:.4rem; align-items:center; margin-top:.25rem; }
  .fx-row input { flex:1 1 auto; min-width:0; background:var(--surface-2); color:var(--text);
    border:1px solid var(--border); border-radius:var(--r-sm); padding:.35rem .5rem; min-height:34px;
    font-family:var(--font-mono); font-size:var(--fs-sm); }
  .fx-row select { flex:0 0 auto; background:var(--surface-2); color:var(--text);
    border:1px solid var(--border); border-radius:var(--r-sm); padding:.35rem .35rem; min-height:34px;
    font-family:var(--font-mono); font-size:var(--fs-xs); max-width:9.5rem; }
  .fx-unit { font-family:var(--font-mono); font-size:var(--fs-xs); color:var(--text-muted); }
  .fx-note { font-size:var(--fs-xs); color:var(--text-muted); line-height:1.35; margin-top:.25rem; }

  .fx-out { display:grid; gap:.7rem; align-content:start; }
  .fx-result { border:1px solid var(--accent); background:var(--accent-wash);
    border-radius:var(--r-md); padding:.85rem 1rem; display:grid; gap:.25rem; }
  .fx-result.pending { border-color:var(--border); background:var(--surface-2); }
  .fx-rlabel { font-size:var(--fs-xs); text-transform:uppercase; letter-spacing:.06em;
    color:var(--text-muted); font-weight:650; }
  .fx-rvalue { font-family:var(--font-mono); font-size:var(--fs-xl); color:var(--text);
    display:flex; align-items:baseline; gap:.5rem; flex-wrap:wrap; }
  .fx-runit { background:var(--surface); color:var(--text-2); border:1px solid var(--border);
    border-radius:var(--r-sm); font-family:var(--font-mono); font-size:var(--fs-sm); padding:.15rem .3rem; }
  .fx-runit-static { font-size:var(--fs-md); color:var(--text-2); }
  .fx-rnote { font-size:var(--fs-xs); color:var(--text-muted); }
  .fx-prov { font-size:var(--fs-xs); color:var(--text-muted); line-height:1.45; }
  .fx-work summary { cursor:pointer; font-size:var(--fs-sm); color:var(--text-2);
    min-height:24px; display:flex; align-items:center; }
  .fx-work-body { padding-top:.6rem; }
  .fx-wtable { width:100%; border-collapse:collapse; font-size:var(--fs-xs); }
  .fx-wtable td { padding:.25rem .35rem; border-bottom:1px solid var(--border); }
  .fx-wtable .arrow { color:var(--text-muted); }
  .fx-wtable .fx-wres td { border-bottom:0; border-top:1px solid var(--accent); color:var(--text); }

  .fx-two { display:grid; gap:1rem; grid-template-columns:1fr; }
  @media (min-width:900px){ .fx-two { grid-template-columns:1fr 1fr; } }
  .fx-rels { display:grid; gap:.7rem; }
  .fx-rel { display:grid; gap:.3rem; }
  .fx-rel .k { font-size:var(--fs-xs); text-transform:uppercase; letter-spacing:.05em;
    color:var(--text-muted); font-weight:650; }
`;
