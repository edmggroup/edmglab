/**
 * EDMGLAB — Calculation workbench (Roadmap P2)
 *
 * ────────────────────────────────────────────────────────────────────────
 *  NOT a list of calculators. A worksheet organised by what you MEASURED.
 * ────────────────────────────────────────────────────────────────────────
 *
 * The formula library answers "what does this equation mean?". This page
 * answers the question a student actually arrives with: "I have a discharge
 * curve — what can I get out of it?" Pick the measurement, enter what you read
 * off it ONCE, and every quantity that measurement supports is computed from
 * the same inputs.
 *
 * ── THE CONFIGURATION QUESTION COMES FIRST ──
 * Before anything is computed the page asks which configuration you measured
 * in, and where you read the IR drop. Those two answers select between
 * equations that differ by a factor of four and a factor of two respectively.
 * The equations your answer rules OUT are still shown — greyed, with the
 * reason. Hiding them would teach that only one equation ever existed; showing
 * them disabled teaches that the measurement chose between them.
 *
 * ── CHAINING ──
 * Some quantities are inputs to others: specific capacitance feeds specific
 * energy, which feeds specific power. A formula whose input is another
 * formula's `provides` value is fed automatically and marked as chained, so it
 * is always visible that the number rests on the one above it — including its
 * assumptions.
 */

import { esc, pageHead, callout, notAuthored } from '../ui.js';
import * as data from '../data.js';
import { computeFormula, findUnit, sig } from '../lib/expr.js';
import { sourceLabel, FORMULA_CSS } from '../lib/formula-view.js';
import { idTail } from './formulas.js';

export async function render(outlet) {
  const payload = await data.load('formulas');
  const all = payload.items || [];
  const wb = payload._workbench;

  if (!all.length || !wb) {
    outlet.innerHTML = pageHead('Calculation workbench', '') + notAuthored('The formula library');
    return { destroy() {} };
  }

  const sources = wb.sources.filter((s) => all.some((f) => f.derivedFrom === s.id && f.expression));
  let activeSource = sources[0].id;

  // One answer per choice group, defaulting to the first option.
  const choice = {};
  for (const g of wb.groups) choice[g.id] = g.options[0].id;

  // Values are keyed by SYMBOL, shared across every formula on the sheet —
  // that sharing is the whole point: I, Δt and m are entered once.
  const vals = {};

  outlet.innerHTML = `
    ${pageHead('Calculation workbench',
      'Start from what you measured. Enter it once; everything that measurement supports is computed from the same numbers.')}

    <nav class="tabbar" role="tablist" aria-label="Measurement">
      ${sources.map((s) => `<button type="button" class="tab${s.id === activeSource ? ' is-active' : ''}"
        role="tab" aria-selected="${s.id === activeSource}" data-src="${esc(s.id)}">${esc(s.label)}</button>`).join('')}
    </nav>

    <div id="wb-body"></div>

    <style>
      ${FORMULA_CSS}
      .tabbar .tab { background:none; border:0; border-bottom:2px solid transparent;
        cursor:pointer; font:inherit; font-size:var(--fs-sm); font-weight:550; }
      .wb-choice { border:1px solid var(--border); border-left:3px solid var(--accent);
        border-radius:var(--r-md); background:var(--surface); padding:.85rem 1rem; margin-bottom:.75rem; }
      .wb-choice h2 { font-size:var(--fs-base); margin:0 0 .2rem; }
      .wb-why { font-size:var(--fs-sm); color:var(--text-2); margin:0 0 .6rem; }
      .wb-opts { display:grid; gap:.4rem; grid-template-columns:1fr; }
      @media (min-width:760px){ .wb-opts { grid-template-columns:1fr 1fr; } }
      .wb-opt { text-align:left; display:grid; gap:.15rem; padding:.55rem .7rem; cursor:pointer;
        background:var(--surface-2); color:var(--text-2); border:1px solid var(--border);
        border-radius:var(--r-sm); font:inherit; }
      .wb-opt:hover { color:var(--text); }
      .wb-opt.is-on { background:var(--accent-wash); border-color:var(--accent); color:var(--text); }
      .wb-opt .ol { font-size:var(--fs-sm); font-weight:600; }
      .wb-opt .on2 { font-size:var(--fs-xs); color:var(--text-muted); line-height:1.35; }
      .wb-grid { display:grid; gap:1rem; grid-template-columns:1fr; align-items:start; }
      @media (min-width:1000px){ .wb-grid { grid-template-columns:minmax(280px,360px) 1fr; } }
      .wb-res { display:grid; gap:.6rem; }
      .wb-r { border:1px solid var(--border); border-radius:var(--r-md); background:var(--surface);
        padding:.7rem .9rem; display:grid; gap:.3rem; }
      .wb-r.off { opacity:.55; border-style:dashed; background:none; }
      .wb-rtop { display:flex; flex-wrap:wrap; align-items:baseline; gap:.5rem; }
      .wb-rname { font-size:var(--fs-sm); font-weight:600; color:var(--text); }
      .wb-rname a { color:inherit; }
      .wb-rval { margin-left:auto; font-family:var(--font-mono); font-size:var(--fs-lg); color:var(--accent-strong); }
      .wb-r.off .wb-rval { color:var(--text-muted); font-size:var(--fs-sm); }
      .wb-runit { background:var(--surface-2); color:var(--text-2); border:1px solid var(--border);
        border-radius:var(--r-sm); font-family:var(--font-mono); font-size:var(--fs-xs); padding:.1rem .25rem; }
      .wb-rctx { font-size:var(--fs-xs); color:var(--text-muted); line-height:1.4; }
      .wb-tag { display:inline-block; font-size:var(--fs-xs); font-family:var(--font-mono);
        background:var(--surface-2); border:1px solid var(--border); border-radius:3px;
        padding:0 .3rem; color:var(--text-muted); }
      .wb-chain { color:var(--accent-strong); }
      .wb-off-why { font-size:var(--fs-xs); color:var(--warn); }
    </style>`;

  const body = outlet.querySelector('#wb-body');

  outlet.querySelectorAll('[data-src]').forEach((b) => b.addEventListener('click', () => {
    activeSource = b.dataset.src;
    outlet.querySelectorAll('[data-src]').forEach((x) => {
      const on = x === b;
      x.classList.toggle('is-active', on);
      x.setAttribute('aria-selected', String(on));
    });
    paint();
  }));

  /* ── Which formulas belong to this sheet, and which are ruled out ── */

  function sheet() {
    const group = all.filter((f) => f.derivedFrom === activeSource && f.expression);
    return group.map((f) => {
      const v = f.variant;
      const off = v && choice[v.group] !== undefined && choice[v.group] !== v.option;
      let why = '';
      if (off) {
        const g = wb.groups.find((x) => x.id === v.group);
        const chosen = g?.options.find((o) => o.id === choice[v.group]);
        const mine = g?.options.find((o) => o.id === v.option);
        why = `Ruled out by your answer: this is the "${mine?.label || v.option}" form, and you selected "${chosen?.label || choice[v.group]}".`;
      }
      return { f, off, why };
    });
  }

  /** Symbols the user must supply: everything used by an ENABLED formula that
   *  is not produced by another enabled formula on the same sheet. */
  function inputPlan(rows) {
    const provided = new Map();
    for (const { f, off } of rows) if (!off && f.provides) provided.set(f.provides, f);

    const need = new Map();   // symbol -> variable definition (first wins)
    for (const { f, off } of rows) {
      if (off) continue;
      for (const v of f.variables || []) {
        if (provided.has(v.symbol)) continue;      // chained, not typed
        if (!need.has(v.symbol)) need.set(v.symbol, v);
      }
    }
    return { need, provided };
  }

  function paint() {
    const src = wb.sources.find((s) => s.id === activeSource);
    const rows = sheet();
    // Only ask a question if this sheet actually contains both of its answers.
    const groups = wb.groups.filter((g) => rows.some((r) => r.f.variant?.group === g.id));

    body.innerHTML = `
      <p class="small" style="max-width:76ch;margin-bottom:1rem">${esc(src.lede)}</p>

      ${groups.map((g) => `
        <div class="wb-choice">
          <h2>${esc(g.question)}</h2>
          <p class="wb-why">${esc(g.why)}</p>
          <div class="wb-opts" role="radiogroup" aria-label="${esc(g.question)}">
            ${g.options.map((o) => `<button type="button" class="wb-opt${choice[g.id] === o.id ? ' is-on' : ''}"
               role="radio" aria-checked="${choice[g.id] === o.id}" data-g="${esc(g.id)}" data-o="${esc(o.id)}">
               <span class="ol">${esc(o.label)}</span><span class="on2">${esc(o.note)}</span></button>`).join('')}
          </div>
        </div>`).join('')}

      <div class="wb-grid" style="margin-top:1rem">
        <div class="panel"><div class="panel-head">What you measured</div>
          <div class="panel-body"><div class="fx-inputs" id="wb-in" style="grid-template-columns:1fr"></div>
            <p class="xsmall muted" style="margin:.8rem 0 0">Entered values stay in this browser tab.
            Nothing is stored or sent anywhere.</p></div></div>
        <div><div class="wb-res" id="wb-res"></div></div>
      </div>`;

    body.querySelectorAll('[data-g]').forEach((b) => b.addEventListener('click', () => {
      choice[b.dataset.g] = b.dataset.o;
      paint();
    }));

    const { need } = inputPlan(rows);
    const inHost = body.querySelector('#wb-in');

    inHost.innerHTML = Array.from(need.values()).map((v) => {
      if (vals[v.symbol] === undefined) vals[v.symbol] = { value: v.default ?? '', unit: v.units?.[0]?.u };
      return `<label class="fx-in">
        <span class="fx-sym">${esc(v.symbol)}</span>
        <span class="fx-nm">${esc(v.name)}</span>
        <span class="fx-row">
          <input type="number" data-sym="${esc(v.symbol)}" value="${esc(String(vals[v.symbol].value))}"
                 step="any" inputmode="decimal" autocomplete="off">
          ${v.units?.length > 1
            ? `<select data-unit="${esc(v.symbol)}">${v.units.map((u) =>
                `<option value="${esc(u.u)}"${u.u === vals[v.symbol].unit ? ' selected' : ''}>${esc(u.u)}</option>`).join('')}</select>`
            : `<span class="fx-unit">${esc(v.units?.[0]?.u || '')}</span>`}
        </span>
        ${v.note ? `<span class="fx-note">${esc(v.note)}</span>` : ''}
      </label>`;
    }).join('');

    inHost.querySelectorAll('[data-sym]').forEach((inp) => inp.addEventListener('input', () => {
      const raw = inp.value.trim();
      vals[inp.dataset.sym].value = raw === '' ? '' : parseFloat(raw);
      results(rows);
    }));
    inHost.querySelectorAll('[data-unit]').forEach((sel) => sel.addEventListener('change', () => {
      vals[sel.dataset.unit].unit = sel.value;
      results(rows);
    }));

    results(rows);
  }

  /**
   * Compute every enabled formula. Runs repeatedly until no new value appears,
   * so a chain of any depth resolves without the data having to declare an
   * order — and a circular dependency simply stops rather than looping.
   */
  function results(rows) {
    const host = body.querySelector('#wb-res');
    const computed = new Map();     // symbol -> {si, formula}
    const out = new Map();          // formula id -> result

    const enabled = rows.filter((r) => !r.off).map((r) => r.f);

    for (let pass = 0; pass < enabled.length + 1; pass++) {
      let progressed = false;
      for (const f of enabled) {
        if (out.has(f.id) && out.get(f.id).ok) continue;
        const inputs = {};
        for (const v of f.variables || []) {
          if (vals[v.symbol] !== undefined) { inputs[v.symbol] = vals[v.symbol]; continue; }
          const chained = computed.get(v.symbol);
          // A chained value is already in SI, so hand it over with a unit of
          // factor 1 rather than converting it a second time.
          if (chained) inputs[v.symbol] = { value: chained.si, unit: '__si__' };
        }
        inputs.__resultUnit = vals[`__u_${f.id}`] ?? f.result?.units?.[0]?.u;
        const r = computeFormula(withSiUnits(f, inputs), inputs);
        const had = out.get(f.id)?.ok;
        out.set(f.id, r);
        if (r.ok && !had) {
          progressed = true;
          if (f.provides) computed.set(f.provides, { si: r.si, formula: f });
        }
      }
      if (!progressed) break;
    }

    host.innerHTML = rows.map(({ f, off, why }) => {
      if (off) {
        return `<div class="wb-r off">
          <div class="wb-rtop"><span class="wb-rname">${esc(f.name)}</span>
            <span class="wb-rval">not used</span></div>
          <div class="wb-off-why">${esc(why)}</div>
          <div class="wb-rctx"><code>${esc(f.plainText || '')}</code></div>
        </div>`;
      }
      const r = out.get(f.id);
      const chainedFrom = (f.variables || [])
        .filter((v) => vals[v.symbol] === undefined && computed.has(v.symbol))
        .map((v) => computed.get(v.symbol).formula.name);
      const c = f.validContext || {};

      return `<div class="wb-r">
        <div class="wb-rtop">
          <span class="wb-rname"><a href="#/formula/${esc(idTail(f.id))}">${esc(f.name)}</a></span>
          <span class="wb-rval">${r?.ok ? esc(sig(r.value, 5)) : '—'}
            ${f.result?.units?.length > 1
              ? `<select class="wb-runit" data-ru="${esc(f.id)}" aria-label="Unit for the result of ${esc(f.title || f.id)}">${f.result.units.map((u) =>
                  `<option value="${esc(u.u)}"${u.u === (vals[`__u_${f.id}`] ?? f.result.units[0].u) ? ' selected' : ''}>${esc(u.u)}</option>`).join('')}</select>`
              : `<span class="wb-tag">${esc(f.result?.units?.[0]?.u || '')}</span>`}
          </span>
        </div>
        <div class="wb-rctx">
          ${tag(c.performanceLevel)}${tag(c.cellType)}
          ${chainedFrom.length ? `<span class="wb-chain">chained from ${esc(chainedFrom.join(', '))}</span>` : ''}
          ${r && !r.ok && r.missing ? ` · needs ${r.missing.map((s) => `<code>${esc(s)}</code>`).join(', ')}` : ''}
          ${r && !r.ok && r.error ? ` · ${esc(r.error)}` : ''}
        </div>
      </div>`;
    }).join('') + `
      <div class="fx-prov" style="margin-top:.4rem">
        <span class="badge badge-unverified">Computed</span>
        Every value above is derived from the numbers you entered. Open any formula to see the
        assumptions it rests on — a chained result carries the assumptions of everything above it too.
      </div>`;

    host.querySelectorAll('[data-ru]').forEach((sel) => sel.addEventListener('change', () => {
      vals[`__u_${sel.dataset.ru}`] = sel.value;
      results(rows);
    }));
  }

  paint();
  return { destroy() {} };
}

/**
 * A context chip. Some validContext fields are a full sentence, which turned
 * the result row into a wall of monospace. Truncate for the chip and keep the
 * whole thing in the tooltip — the formula page always has it in full.
 */
function tag(text) {
  if (!text) return '<span class="wb-tag">—</span>';
  const s = String(text);
  const short = s.length > 34 ? s.slice(0, 33).replace(/[\s—,–-]+$/, '') + '…' : s;
  return `<span class="wb-tag" title="${esc(s)}">${esc(short)}</span>`;
}

/**
 * Chained values arrive already in SI. Give the formula a variable definition
 * whose unit list contains a pass-through entry, so the shared compute path
 * does not have to know about chaining at all.
 */
function withSiUnits(f, inputs) {
  const needsPass = Object.entries(inputs).some(([, v]) => v && v.unit === '__si__');
  if (!needsPass) return f;
  return {
    ...f,
    variables: (f.variables || []).map((v) =>
      inputs[v.symbol]?.unit === '__si__'
        ? { ...v, units: [{ u: '__si__', f: 1 }] }
        : v)
  };
}
