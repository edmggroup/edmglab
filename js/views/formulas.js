/**
 * EDMGLAB — Formula library index (Roadmap P1)
 *
 * A browsable index of every formula, grouped by domain, with the valid
 * context visible on the card rather than one click away. Someone scanning
 * for "specific capacitance" should see, without opening anything, that there
 * are two records and that the difference is the cell configuration.
 */

import { esc, pageHead, callout, notAuthored } from '../ui.js';
import * as data from '../data.js';
import { domainLabel, sourceLabel, FORMULA_CSS } from '../lib/formula-view.js';

const DOMAIN_ORDER = ['supercapacitor', 'battery', 'kinetics', 'shared'];

export async function render(outlet) {
  const items = await data.items('formulas');

  if (!items.length) {
    outlet.innerHTML = pageHead('Formula library', 'Every equation with its valid context.') +
      notAuthored('The formula library');
    return { destroy() {} };
  }

  const domains = DOMAIN_ORDER.filter((d) => items.some((f) => (f.domain || 'shared') === d));

  outlet.innerHTML = `
    ${pageHead('Formula library',
      'Every equation with the configuration it is valid for, its assumptions, and a calculator that works in whatever units you measured in.')}

    ${callout(`<strong>Every formula here is also a calculator.</strong> Open one and the inputs are
      generated from the record itself — enter mA and mg if that is what you measured, and the conversion
      to SI is shown alongside the answer. For a full worksheet from one measurement, use the
      <a href="#/calculators">calculation workbench</a>.`, 'info')}

    <div class="fl-bar">
      <input type="search" id="fl-q" placeholder="Filter by name, symbol or tag…" autocomplete="off"
             aria-label="Filter formulas">
      <div class="fl-chips" role="group" aria-label="Filter by domain">
        <button type="button" class="chip is-on" data-dom="all">All ${items.length}</button>
        ${domains.map((d) => `<button type="button" class="chip" data-dom="${esc(d)}">${esc(domainLabel(d))}</button>`).join('')}
      </div>
    </div>

    <div id="fl-list">
      ${domains.map((d) => `
        <section class="section fl-sec" data-sec="${esc(d)}">
          <div class="section-head"><h2>${esc(domainLabel(d))}</h2>
            <span class="section-note">${items.filter((f) => (f.domain || 'shared') === d).length} formulas</span></div>
          <div class="fl-grid">
            ${items.filter((f) => (f.domain || 'shared') === d).map(card).join('')}
          </div>
        </section>`).join('')}
    </div>

    <p id="fl-none" class="small muted" hidden>Nothing matches that filter.</p>

    <style>
      ${FORMULA_CSS}
      .fl-bar { display:flex; flex-wrap:wrap; gap:.6rem; align-items:center; margin:1.25rem 0 .5rem; }
      .fl-bar input { flex:1 1 240px; min-width:0; background:var(--surface-2); color:var(--text);
        border:1px solid var(--border); border-radius:var(--r-sm); padding:.45rem .7rem;
        min-height:38px; font:inherit; font-size:var(--fs-sm); }
      .fl-chips { display:flex; flex-wrap:wrap; gap:.3rem; }
      .fl-chips .chip { cursor:pointer; font:inherit; }
      .fl-chips .chip.is-on { background:var(--accent-wash); border-color:var(--accent); color:var(--accent-strong); }
      .fl-grid { display:grid; gap:.75rem; grid-template-columns:1fr; }
      @media (min-width:820px){ .fl-grid { grid-template-columns:1fr 1fr; } }
      .fl-card { display:block; border:1px solid var(--border); border-radius:var(--r-md);
        background:var(--surface); padding:.85rem 1rem; color:inherit;
        transition:border-color var(--dur-fast), background var(--dur-fast); }
      .fl-card:hover { text-decoration:none; border-color:var(--accent); background:var(--surface-2); }
      .fl-card h3 { font-size:var(--fs-base); margin:0 0 .4rem; color:var(--text); }
      .fl-eq2 { font-family:var(--font-mono); font-size:var(--fs-sm); color:var(--accent-strong);
        background:var(--surface-2); border:1px solid var(--border); border-radius:var(--r-sm);
        padding:.35rem .5rem; margin-bottom:.55rem; overflow-wrap:anywhere; }
      .fl-meta { display:flex; flex-wrap:wrap; gap:.3rem; }
      .fl-meta .chip { font-size:var(--fs-xs); }
    </style>`;

  function card(f) {
    const c = f.validContext || {};
    return `<a class="fl-card" href="#/formula/${esc(idTail(f.id))}"
       data-hay="${esc(hay(f))}" data-dom="${esc(f.domain || 'shared')}">
      <h3>${esc(f.name)}</h3>
      <div class="fl-eq2">${esc(f.plainText || f.expression || '')}</div>
      <div class="fl-meta">
        ${c.cellType ? `<span class="chip">${esc(c.cellType)}</span>` : ''}
        ${c.performanceLevel ? `<span class="chip">${esc(c.performanceLevel)}</span>` : ''}
        ${f.derivedFrom ? `<span class="chip">from ${esc(sourceLabel(f.derivedFrom))}</span>` : ''}
      </div>
    </a>`;
  }

  /* ── Filtering ── */
  const q = outlet.querySelector('#fl-q');
  const none = outlet.querySelector('#fl-none');
  let dom = 'all';

  function apply() {
    const term = q.value.trim().toLowerCase();
    let shown = 0;
    outlet.querySelectorAll('.fl-card').forEach((el) => {
      const ok = (dom === 'all' || el.dataset.dom === dom) &&
                 (!term || el.dataset.hay.includes(term));
      el.hidden = !ok;
      if (ok) shown++;
    });
    outlet.querySelectorAll('.fl-sec').forEach((sec) => {
      sec.hidden = !sec.querySelector('.fl-card:not([hidden])');
    });
    none.hidden = shown > 0;
  }

  q.addEventListener('input', apply);
  outlet.querySelectorAll('[data-dom]').forEach((b) => {
    if (b.tagName !== 'BUTTON') return;
    b.addEventListener('click', () => {
      dom = b.dataset.dom;
      outlet.querySelectorAll('.fl-chips .chip').forEach((x) => x.classList.toggle('is-on', x === b));
      apply();
    });
  });

  return { destroy() {} };
}

function hay(f) {
  return [f.name, f.plainText, ...(f.aliases || []), ...(f.tags || []),
          ...(f.variables || []).map((v) => `${v.symbol} ${v.name}`)]
    .join(' ').toLowerCase();
}

export function idTail(id) { return String(id).split('.').slice(1).join('.'); }
