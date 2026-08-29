/**
 * EDMGLAB — Testing workflow (§5) and safety (§12)
 *
 * §5 asks for a clickable workflow where every step exposes purpose,
 * controlled and measured parameters, expected result, considerations,
 * common mistakes, safety concerns and the data it produces.
 *
 * The controlled/measured pair is shown on the step chip itself, not only in
 * the expanded detail — walking the chain and watching which quantity the
 * instrument is holding at each stage is most of what the workflow teaches.
 *
 * ── ON THE SAFETY SECTION ──
 * It is deliberately framed as ORIENTATION, not procedure. It explains what
 * each hazard is, how it shows up in data, and what the instrument can and
 * cannot protect against — and gives no handling instructions for damaged,
 * leaking, swollen or shorted cells. That has to come from the institution's
 * own written procedure and training, not from a web page.
 */

import { esc } from '../ui.js';
import * as data from '../data.js';

const PHASE = {
  prepare:   { label: 'Prepare',   colour: 'var(--text-muted)' },
  settle:    { label: 'Settle',    colour: 'var(--series-3)' },
  condition: { label: 'Condition', colour: 'var(--series-5)' },
  cycle:     { label: 'Cycle',     colour: 'var(--series-1)' }
};

export async function renderWorkflow(host) {
  const steps = await data.items('bt/workflow');
  if (!steps.length) {
    host.innerHTML = `<div class="callout callout-warn">The workflow has not been authored yet.</div>`;
    return { destroy() {} };
  }

  host.innerHTML = `
    <p class="small" style="max-width:74ch;margin-bottom:1rem">
      The order a cell actually passes through, from assembly to a completed cycling run. Select any
      step. Notice how the <strong>controlled</strong> quantity changes along the chain — that swap is
      the instrument changing its job, not the cell changing its behaviour.
    </p>

    <div class="wf-rail" role="tablist" aria-label="Workflow steps">
      ${steps.map((s, i) => {
        const ph = PHASE[s.phase] || PHASE.prepare;
        return `<button type="button" class="wf-step${i === 0 ? ' is-active' : ''}"
          role="tab" aria-selected="${i === 0}" data-step="${esc(s.id)}"
          style="--ph:${ph.colour}">
          <span class="wf-n">${s.n}</span>
          <span class="wf-name">${esc(s.name)}</span>
          <span class="wf-cm">${s.controlled === '—' ? 'no current' : 'ctrl: ' + esc(s.controlled.split(' ')[0])}</span>
        </button>`;
      }).join('')}
    </div>

    <div id="wf-detail"></div>

    <style>
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
          .wf-grid { display:grid; gap:1rem; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); }
    </style>`;

  const detail = host.querySelector('#wf-detail');

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
        <div class="cb"><span class="cbk">Phase</span><span class="cbv">${esc((PHASE[s.phase] || {}).label || s.phase)}</span></div>
      </div>

      <div class="mv-block">
        <div class="mv-head"><h2>${s.n}. ${esc(s.name)}</h2><span>purpose</span></div>
        <div class="mv-body"><p>${esc(s.purpose)}</p></div>
      </div>

      <div class="mv-block">
        <div class="mv-head"><h2>Expected result</h2></div>
        <div class="mv-body"><p>${esc(s.expected)}</p></div>
      </div>

      <div class="wf-grid">
        ${s.considerations?.length ? `<div class="panel"><div class="panel-head">Important considerations</div>
          <div class="panel-body"><ul class="lim-list">${s.considerations.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div></div>` : ''}
        ${s.mistakes?.length ? `<div class="panel"><div class="panel-head">Common mistakes</div>
          <div class="panel-body"><ul class="lim-list warn">${s.mistakes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div></div>` : ''}
      </div>

      ${s.safety?.length ? `<div class="callout callout-danger" style="margin-top:1rem">
        <strong>Safety.</strong>
        <ul class="lim-list" style="margin-top:.35rem">${s.safety.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      </div>` : ''}

      <div class="mv-block" style="margin-top:1.25rem">
        <div class="mv-head"><h2>Data this step produces</h2></div>
        <div class="mv-body"><p>${esc(s.dataOutput)}</p></div>
      </div>`;
  }

  host.querySelectorAll('[data-step]').forEach((b) =>
    b.addEventListener('click', () => select(b.dataset.step)));
  select(steps[0].id);

  return { destroy() {} };
}

/* ════════════════════════════════════════════════════════════
   Safety (§12)
   ════════════════════════════════════════════════════════════ */

export async function renderSafety(host) {
  const p = await data.load('bt/safety');
  const groups = p.groups || [];

  if (!groups.length) {
    host.innerHTML = `<div class="callout callout-warn">The safety content has not been authored yet.</div>`;
    return { destroy() {} };
  }

  host.innerHTML = `
    <div class="callout callout-danger" style="margin-bottom:1.25rem">
      <strong>This page is orientation, not procedure.</strong> It explains what each hazard is, how it
      shows up in your data, and what the instrument can and cannot protect against. It deliberately gives
      no instructions for handling damaged, leaking, swollen or shorted cells — that must come from your
      institution's written safety procedure and from training.
    </div>

    ${p.preamble ? `<p class="small" style="max-width:74ch;margin-bottom:1.5rem">${esc(p.preamble)}</p>` : ''}

    ${groups.map((g) => `
      <section class="section">
        <div class="section-head"><h2>${esc(g.title)}</h2>
          ${g.note ? `<span class="section-note">${esc(g.note)}</span>` : ''}</div>
        <div class="sf-grid">
          ${(g.items || []).map(safetyCard).join('')}
        </div>
      </section>`).join('')}

    ${p.closing ? `<div class="callout callout-warn">${esc(p.closing)}</div>` : ''}

    <style>
      .sf-grid { display:grid; gap:.75rem; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); }
      .sf-card { border:1px solid var(--border); border-left:3px solid var(--danger);
        border-radius:var(--r-md); background:var(--surface); padding:.85rem 1rem; }
      .sf-card h3 { font-size:var(--fs-base); margin:0 0 .5rem; color:var(--text); }
      .sf-row { margin-bottom:.5rem; font-size:var(--fs-sm); }
      .sf-row .k { font-size:var(--fs-xs); text-transform:uppercase; letter-spacing:.06em;
        color:var(--text-muted); font-weight:650; display:block; }
      .sf-row .v { color:var(--text-2); }
      .sf-note { font-size:var(--fs-sm); color:var(--text-2); border-top:1px solid var(--border);
        padding-top:.5rem; margin-top:.6rem; }
    </style>`;

  return { destroy() {} };
}

function safetyCard(i) {
  return `<div class="sf-card">
    <h3>${esc(i.hazard)}</h3>
    <div class="sf-row"><span class="k">What it is</span><span class="v">${esc(i.what)}</span></div>
    <div class="sf-row"><span class="k">How it shows in the data</span><span class="v">${esc(i.inData)}</span></div>
    <div class="sf-row"><span class="k">Instrument limit</span><span class="v">${esc(i.limit)}</span></div>
    ${i.note ? `<div class="sf-note">${esc(i.note)}</div>` : ''}
  </div>`;
}
