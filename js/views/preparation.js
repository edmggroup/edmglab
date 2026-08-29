/**
 * EDMGLAB — Electrode preparation (Roadmap P9)
 *
 * ────────────────────────────────────────────────────────────────────────
 *  A DECISION GUIDE, NOT AN SOP.
 * ────────────────────────────────────────────────────────────────────────
 *
 * Same framing as the safety page, for the same reason: a web page cannot be
 * a laboratory procedure. It gives no quantities, temperatures or times —
 * those belong to the group's own written method for its own materials, and
 * copying them from here is how a procedure stops being traceable.
 *
 * What it does say is which choices change the answer, and — the field that
 * makes this module worth building — what each choice looks like once the cell
 * is on test. "Rate capability falls while low-rate capacity is unchanged" is
 * a transport signature, and knowing it comes from over-calendering is the
 * difference between a fixed electrode and a fortnight blaming the material.
 *
 * The step chain reuses the workflow layout from the battery-tester module,
 * because it is the same kind of object: an ordered process where each step
 * has a purpose, a controlled quantity and a consequence downstream.
 */

import { esc, pageHead, callout, notAuthored } from '../ui.js';
import * as data from '../data.js';

const PHASE = {
  formulate: { label: 'Formulate', colour: 'var(--series-3)' },
  form:      { label: 'Form',      colour: 'var(--series-1)' },
  finish:    { label: 'Finish',    colour: 'var(--series-5)' }
};

const SECTIONS = [
  { id: 'chain',       label: 'The chain' },
  { id: 'formulation', label: 'Formulation' },
  { id: 'decisions',   label: 'Decisions' }
];

export async function render(outlet, ctx) {
  const p = await data.load('preparation');
  if (!p.steps?.length) {
    outlet.innerHTML = pageHead('Electrode preparation', '') + notAuthored('The electrode preparation content');
    return { destroy() {} };
  }

  const active = SECTIONS.some((s) => s.id === ctx?.params?.section) ? ctx.params.section : 'chain';

  outlet.innerHTML = `
    ${pageHead('Electrode preparation',
      'What each choice does, and how it shows up later in the electrochemistry.')}

    ${callout(`<strong>Most results reported as properties of a material are properties of an electrode.</strong>
      ${esc(p.preamble || '')}`, 'warn')}

    <nav class="tabbar" role="tablist" aria-label="Preparation sections">
      ${SECTIONS.map((s) => `<a class="tab${s.id === active ? ' is-active' : ''}" role="tab"
        aria-selected="${s.id === active}" href="#/preparation/${s.id}">${esc(s.label)}</a>`).join('')}
    </nav>

    <div id="pr-body"></div>

    ${p.closing ? callout(esc(p.closing), 'warn') : ''}

    <style>${CSS}</style>`;

  const host = outlet.querySelector('#pr-body');
  if (active === 'formulation') paintFormulation(host, p);
  else if (active === 'decisions') paintDecisions(host, p);
  else paintChain(host, p);

  return { destroy() {} };
}

/* ── The step chain ─────────────────────────────────────── */

function paintChain(host, p) {
  const steps = p.steps;

  host.innerHTML = `
    <p class="small" style="max-width:76ch;margin-bottom:1rem">
      The order a powder passes through on its way to being a tested electrode. Select any step. The
      <strong>record</strong> line on each one is what has to be written down — an electrode whose
      preparation was not recorded cannot be reproduced, and a result from it cannot be defended.
    </p>

    <div class="wf-rail" role="tablist" aria-label="Preparation steps">
      ${steps.map((s, i) => {
        const ph = PHASE[s.phase] || PHASE.formulate;
        return `<button type="button" class="wf-step${i === 0 ? ' is-active' : ''}"
          role="tab" aria-selected="${i === 0}" data-step="${esc(s.id)}" style="--ph:${ph.colour}">
          <span class="wf-n">${s.n}</span>
          <span class="wf-name">${esc(s.name)}</span>
          <span class="wf-cm">${s.controlled === '—' ? '—' : 'ctrl: ' + esc(String(s.controlled).split(',')[0])}</span>
        </button>`;
      }).join('')}
    </div>

    <div id="pr-detail"></div>`;

  const detail = host.querySelector('#pr-detail');

  function select(id) {
    const s = steps.find((x) => x.id === id) || steps[0];
    host.querySelectorAll('[data-step]').forEach((b) => {
      const on = b.dataset.step === s.id;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', String(on));
    });

    detail.innerHTML = `
      <div class="cbar">
        <div class="cb ctrl"><span class="cbk">Controlled</span><span class="cbv">${esc(s.controlled)}</span></div>
        <div class="cb meas"><span class="cbk">Measured</span><span class="cbv">${esc(s.measured)}</span></div>
        <div class="cb"><span class="cbk">Stage</span><span class="cbv">${esc((PHASE[s.phase] || {}).label || s.phase)}</span></div>
      </div>

      <div class="mv-block">
        <div class="mv-head"><h2>${s.n}. ${esc(s.name)}</h2><span>purpose</span></div>
        <div class="mv-body"><p>${esc(s.purpose)}</p></div>
      </div>

      <div class="mv-block">
        <div class="mv-head"><h2>What good looks like</h2></div>
        <div class="mv-body"><p>${esc(s.expected)}</p></div>
      </div>

      <div class="pr-two">
        ${s.considerations?.length ? `<div class="panel"><div class="panel-head">What matters here</div>
          <div class="panel-body"><ul class="lim-list">${s.considerations.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div></div>` : ''}
        ${s.mistakes?.length ? `<div class="panel"><div class="panel-head">Common mistakes</div>
          <div class="panel-body"><ul class="lim-list warn">${s.mistakes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div></div>` : ''}
      </div>

      ${s.shows ? `<div class="callout callout-warn" style="margin-top:1rem">
        <strong>How a mistake here shows up on test.</strong> ${esc(s.shows)}</div>` : ''}

      <div class="mv-block" style="margin-top:1.25rem">
        <div class="mv-head"><h2>Record this</h2><span>the minimum for reproducibility</span></div>
        <div class="mv-body"><p>${esc(s.record)}</p>
          ${s.calculator ? `<p style="margin-top:.5rem"><a href="${esc(s.calculator)}">Open the related calculator →</a></p>` : ''}
        </div>
      </div>`;
  }

  host.querySelectorAll('[data-step]').forEach((b) =>
    b.addEventListener('click', () => select(b.dataset.step)));
  select(steps[0].id);
}

/* ── Formulation ────────────────────────────────────────── */

function paintFormulation(host, p) {
  const f = p.formulation || {};
  host.innerHTML = `
    <section class="section">
      <div class="section-head"><h2>${esc(f.title || 'Formulation')}</h2>
        ${f.note ? `<span class="section-note">${esc(f.note)}</span>` : ''}</div>
      <div class="pr-comp">
        ${(f.components || []).map((c) => `
          <div class="pr-c">
            <h3>${esc(c.name)}</h3>
            <p class="pr-role">${esc(c.role)}</p>
            <div class="pr-tradeoff">
              <div class="up"><span class="k">More of it</span><span class="v">${esc(c.increasing)}</span></div>
              <div class="dn"><span class="k">The cost</span><span class="v">${esc(c.cost)}</span></div>
            </div>
            <p class="pr-watch"><strong>Watch:</strong> ${esc(c.watch)}</p>
          </div>`).join('')}
      </div>
    </section>`;
}

/* ── Decisions ──────────────────────────────────────────── */

function paintDecisions(host, p) {
  const d = p.decisions || {};
  host.innerHTML = `
    <section class="section">
      <div class="section-head"><h2>${esc(d.title || 'Decisions')}</h2>
        ${d.note ? `<span class="section-note">${esc(d.note)}</span>` : ''}</div>
      <div class="table-wrap"><table class="stackable">
        <thead><tr><th>Choice</th><th>Raising it</th><th>The cost</th><th>How it shows in your data</th><th>Report</th></tr></thead>
        <tbody>${(d.rows || []).map((r) => `<tr>
          <td data-label="Choice"><strong>${esc(r.choice)}</strong></td>
          <td data-label="Raising it">${esc(r.raise)}</td>
          <td data-label="The cost">${esc(r.cost)}</td>
          <td data-label="How it shows in your data">${esc(r.inData)}</td>
          <td data-label="Report">${esc(r.report)}</td>
        </tr>`).join('')}</tbody>
      </table></div>
    </section>`;
}

const CSS = `
  .wf-rail { display:grid; gap:.4rem; grid-template-columns:repeat(auto-fill,minmax(150px,1fr));
    margin-bottom:1.25rem; }
  .wf-step { text-align:left; padding:.55rem .7rem; background:var(--surface);
    border:1px solid var(--border); border-left:3px solid var(--ph);
    border-radius:var(--r-sm); cursor:pointer; font:inherit; color:var(--text);
    display:grid; gap:1px; transition:background var(--dur-fast), border-color var(--dur-fast); }
  .wf-step:hover { background:var(--surface-2); }
  .wf-step.is-active { background:var(--accent-wash); border-color:var(--accent); border-left-color:var(--ph); }
  .wf-n { font-family:var(--font-mono); font-size:var(--fs-xs); color:var(--ph); font-weight:700; }
  .wf-name { font-size:var(--fs-sm); font-weight:600; line-height:1.25; }
  .pr-two { display:grid; gap:1rem; grid-template-columns:1fr; }
  @media (min-width:900px){ .pr-two { grid-template-columns:1fr 1fr; } }
  .pr-comp { display:grid; gap:.85rem; grid-template-columns:1fr; }
  @media (min-width:900px){ .pr-comp { grid-template-columns:1fr 1fr; } }
  .pr-c { border:1px solid var(--border); border-radius:var(--r-md); background:var(--surface);
    padding:.9rem 1rem; }
  .pr-c h3 { font-size:var(--fs-base); margin:0 0 .35rem; }
  .pr-role { font-size:var(--fs-sm); color:var(--text-2); margin:0 0 .7rem; }
  .pr-tradeoff { display:grid; gap:.5rem; margin-bottom:.7rem; }
  .pr-tradeoff .k { display:block; font-size:var(--fs-xs); text-transform:uppercase;
    letter-spacing:.05em; font-weight:650; }
  .pr-tradeoff .up .k { color:var(--accent-strong); }
  .pr-tradeoff .dn .k { color:var(--warn); }
  .pr-tradeoff .v { font-size:var(--fs-sm); color:var(--text-2); }
  .pr-watch { font-size:var(--fs-sm); color:var(--text-2); margin:0;
    border-top:1px solid var(--border); padding-top:.6rem; }
`;
