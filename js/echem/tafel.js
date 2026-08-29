/**
 * EDMGLAB — Tafel analysis (Instrumentation spec §29)
 *
 * The page is deliberately ordered so the first question is whether Tafel
 * analysis applies at all, and only then what the slope is. Spec §29 lists
 * misapplication as the dominant failure mode of this technique, and putting
 * the calculator first would teach the opposite habit.
 *
 * ── WHAT MAKES THIS MORE THAN A CALCULATOR ──
 * The fitted slope is shown NEXT TO the slope the underlying model actually
 * contains. Drag the fitting window into the mass-transport-limited region and
 * the fit returns roughly double the true slope while R² stays above 0.98.
 * Switch the system to a purely resistive (non-kinetic) electrode and the fit
 * returns a perfectly plausible ~118 mV/dec in one window and ~700 mV/dec in
 * another — from a system that has no Tafel behaviour at all.
 *
 * That is the point: the fit always returns a number, and the fit statistics
 * never reveal that the window was unsuitable. Only the physics does.
 */

import { esc, callout } from '../ui.js';
import * as data from '../data.js';
import { simWrap } from '../lib/sim-label.js';
import { chartCard } from '../lib/charts.js';
import * as T from './sim/tafel.js';

export async function render(host) {
  const p = await data.load('ec/tafel');
  const state = { ...T.DEFAULTS };
  let cTafel = null, cPol = null;

  host.innerHTML = `
    ${callout(`<strong>A Tafel slope is only meaningful inside a genuinely kinetically-controlled region.</strong>
      A straight line fitted anywhere else is still a straight line, and still returns a number. Neither the
      number nor the quality of the fit tells you whether the region was suitable — that judgement comes from
      the physics of the region, and has to be made before the fit, not after it.`, 'warn')}

    ${p.preamble ? `<p class="small" style="max-width:74ch;margin:1rem 0 1.5rem">${esc(p.preamble)}</p>` : ''}

    ${p.validity ? `
    <section class="section">
      <div class="section-head"><h2>${esc(p.validity.title)}</h2>
        <span class="section-note">${esc(p.validity.note || '')}</span></div>
      <div class="chk-grid">
        ${(p.validity.checks || []).map((ch, i) => `
          <div class="chk">
            <div class="chk-n">${i + 1}</div>
            <div>
              <h3>${esc(ch.q)}</h3>
              <p class="small" style="margin:.3rem 0 .45rem">${esc(ch.why)}</p>
              <p class="xsmall" style="margin:0;color:var(--text-muted)">
                <strong>Fails when:</strong> ${esc(ch.failsWhen)}</p>
            </div>
          </div>`).join('')}
      </div>
    </section>` : ''}

    <section class="section">
      <div class="section-head"><h2>What the window does to the answer</h2>
        <span class="section-note">§29 · the fitted slope against the model's own slope</span></div>
      <p class="small" style="max-width:74ch;margin-bottom:1rem">
        The parameters below define the response, so the Tafel slope it contains is known exactly. Move the
        fitting window and compare. That comparison is available here only because the answer was set in
        advance — on real data the fitted number is the only number there is.
      </p>

      <div class="sim-grid">
        <div class="stack-sm">
          <div class="panel"><div class="panel-head">System</div>
            <div class="panel-body">
              <div class="seg" role="radiogroup" aria-label="System type">
                <button type="button" class="seg-b is-active" data-sys="kinetic">Kinetically controlled</button>
                <button type="button" class="seg-b" data-sys="resistive">Purely resistive electrode</button>
              </div>
              <p class="xsmall muted" style="margin:.55rem 0 0" id="tf-sysnote"></p>
            </div></div>

          <div class="panel"><div class="panel-head">Fitting window</div>
            <div class="panel-body"><div class="ctl" id="tf-win"></div>
              <div class="seg" role="radiogroup" aria-label="Branch" style="margin-top:.7rem">
                <button type="button" class="seg-b is-active" data-br="anodic">Anodic</button>
                <button type="button" class="seg-b" data-br="cathodic">Cathodic</button>
              </div></div></div>

          <div class="panel"><div class="panel-head">Response parameters</div>
            <div class="panel-body"><div class="ctl" id="tf-ctl"></div></div></div>
        </div>

        <div class="stack">
          <div class="panel"><div class="panel-head">Result of the fit</div>
            <div class="panel-body" id="tf-read"></div></div>
          <div id="tf-chart"></div>
          <div id="tf-pol"></div>
        </div>
      </div>
    </section>

    ${(p.pitfalls || []).length ? `
    <section class="section">
      <div class="section-head"><h2>How a Tafel slope goes wrong</h2>
        <span class="section-note">${p.pitfalls.length} failure modes · each with a check</span></div>
      <div class="pit-grid">
        ${p.pitfalls.map((x) => `
          <div class="pit">
            <h3>${esc(x.name)}</h3>
            <div class="pit-row"><span class="k">What happens</span><span>${esc(x.what)}</span></div>
            <div class="pit-row"><span class="k">How it shows</span><span>${esc(x.shows)}</span></div>
            <div class="pit-row ok"><span class="k">Diagnostic check</span><span>${esc(x.check)}</span></div>
          </div>`).join('')}
      </div>
    </section>` : ''}

    ${p.reporting ? `
    <section class="section">
      <div class="section-head"><h2>${esc(p.reporting.title)}</h2>
        <span class="section-note">${esc(p.reporting.note || '')}</span></div>
      <div class="panel"><div class="panel-body">
        <ul class="lim-list">${(p.reporting.items || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      </div></div>
    </section>` : ''}

    ${p.closing ? callout(esc(p.closing), 'warn') : ''}

    <style>
      /* Fixed column counts that divide the item count exactly. auto-fit
         leaves a half-empty final row, which reads as a rendering fault
         rather than as the end of a list. 4 checks and 6 pitfalls both
         divide by 2. */
      .chk-grid, .pit-grid { display:grid; gap:.75rem; grid-template-columns:1fr; }
      @media (min-width:940px) { .chk-grid, .pit-grid { grid-template-columns:1fr 1fr; } }
      .chk { display:flex; gap:.7rem; border:1px solid var(--border); border-radius:var(--r-md);
        background:var(--surface); padding:.85rem 1rem; }
      .chk-n { flex:none; width:26px; height:26px; border-radius:50%; display:grid; place-items:center;
        background:var(--accent-wash); color:var(--accent-strong); font-family:var(--font-mono);
        font-size:var(--fs-xs); font-weight:700; }
      .chk h3 { font-size:var(--fs-base); margin:0; }
      .pit { border:1px solid var(--border); border-left:3px solid var(--series-5);
        border-radius:var(--r-md); background:var(--surface); padding:.85rem 1rem; }
      .pit h3 { font-size:var(--fs-base); margin:0 0 .5rem; }
      .pit-row { display:grid; gap:1px; margin-bottom:.5rem; font-size:var(--fs-sm); color:var(--text-2); }
      .pit-row .k { font-size:var(--fs-xs); text-transform:uppercase; letter-spacing:.06em;
        color:var(--text-muted); font-weight:650; }
      .pit-row.ok { border-top:1px solid var(--border); padding-top:.5rem; margin-bottom:0; }
      .pit-row.ok .k { color:var(--accent-strong); }
      .tf-cmp { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:.6rem;
        margin-bottom:.8rem; }
      .tf-c { border:1px solid var(--border); border-radius:var(--r-sm); background:var(--surface-2);
        padding:.55rem .7rem; }
      .tf-c .k { display:block; font-size:var(--fs-xs); color:var(--text-muted); text-transform:uppercase;
        letter-spacing:.06em; font-weight:650; }
      .tf-c .v { font-family:var(--font-mono); font-size:var(--fs-md); color:var(--text); }
      .tf-c.bad .v { color:var(--danger); }
      .tf-c.good .v { color:var(--accent-strong); }
    </style>`;

  /* ── Controls ──────────────────────────────────────────── */

  const winDefs = [
    { key: 'winMin', label: 'Window lower edge', unit: 'log₁₀|j|', min: -4, max: 1, step: 0.05 },
    { key: 'winMax', label: 'Window upper edge', unit: 'log₁₀|j|', min: -4, max: 1, step: 0.05 }
  ];

  const kineticDefs = [
    { key: 'j0',     label: 'j₀ — exchange current density', unit: 'mA/cm²', min: 0.0001, max: 0.05, step: 0.0001 },
    /* Symbols written exactly as they appear in the model equations shown
       under "About this model" — αa, αc, j_lim — so the control panel and
       the stated model can be read against each other without translation. */
    { key: 'alphaA', label: 'αa — anodic transfer coefficient', unit: '', min: 0.2, max: 0.9, step: 0.05 },
    { key: 'alphaC', label: 'αc — cathodic transfer coefficient', unit: '', min: 0.2, max: 0.9, step: 0.05 },
    { key: 'jLim',   label: 'j_lim — limiting current density', unit: 'mA/cm²', min: 0.5, max: 50, step: 0.5 },
    { key: 'Ru',     label: 'Ru — uncompensated resistance', unit: 'Ω', min: 0, max: 100, step: 1 },
    { key: 'jBg',    label: 'Background current density', unit: 'mA/cm²', min: 0, max: 0.02, step: 0.0005 },
    { key: 'T',      label: 'Temperature', unit: 'K', min: 273, max: 353, step: 1 }
  ];

  const resistiveDefs = [
    { key: 'Rp',  label: 'Leakage resistance', unit: 'Ω', min: 10, max: 1000, step: 10 },
    { key: 'Ru',  label: 'Ru — uncompensated resistance', unit: 'Ω', min: 0, max: 100, step: 1 },
    { key: 'jBg', label: 'Background current density', unit: 'mA/cm²', min: 0, max: 0.02, step: 0.0005 }
  ];

  function sliders(box, defs) {
    box.innerHTML = defs.map((d) => `
      <label><span class="field-label">${esc(d.label)}${d.unit ? ` (${esc(d.unit)})` : ''}</span>
      <div class="row2"><input type="range" data-k="${d.key}" min="${d.min}" max="${d.max}"
        step="${d.step}" value="${state[d.key]}">
      <span class="val" data-v="${d.key}">${fmt(state[d.key])}</span></div></label>`).join('');
    box.querySelectorAll('[data-k]').forEach((inp) => inp.addEventListener('input', () => {
      state[inp.dataset.k] = parseFloat(inp.value);
      box.querySelector(`[data-v="${inp.dataset.k}"]`).textContent = fmt(state[inp.dataset.k]);
      redraw();
    }));
  }

  host.querySelectorAll('[data-sys]').forEach((b) => b.addEventListener('click', () => {
    state.system = b.dataset.sys;
    host.querySelectorAll('[data-sys]').forEach((x) => x.classList.toggle('is-active', x === b));
    sliders(host.querySelector('#tf-ctl'), state.system === 'resistive' ? resistiveDefs : kineticDefs);
    redraw();
  }));

  host.querySelectorAll('[data-br]').forEach((b) => b.addEventListener('click', () => {
    state.branch = b.dataset.br;
    host.querySelectorAll('[data-br]').forEach((x) => x.classList.toggle('is-active', x === b));
    redraw();
  }));

  /* ── Draw ──────────────────────────────────────────────── */

  async function redraw() {
    const rows = T.generate(state);
    const fit = T.fitWindow(rows, state);
    const flags = T.diagnoseWindow(rows, fit, state);
    const trueB = T.trueSlope(state) * 1000;                  // mV/decade

    host.querySelector('#tf-sysnote').textContent = state.system === 'resistive'
      ? 'An ohmic leakage response, as an EDLC-type electrode gives at steady state. There is no faradaic reaction and therefore no Tafel region — fit it anyway and watch what comes back.'
      : 'A single electron-transfer reaction with a mass-transport limit, an uncompensated resistance and an optional background current.';

    const fitted = fit ? fit.slope * 1000 : null;
    const err = fit && state.system === 'kinetic' && trueB !== 0
      ? ((Math.abs(fitted) - Math.abs(trueB)) / Math.abs(trueB)) * 100 : null;
    const bad = err !== null && Math.abs(err) > 15;

    host.querySelector('#tf-read').innerHTML = `
      <div class="tf-cmp">
        <div class="tf-c"><span class="k">Fitted slope</span>
          <span class="v">${fit ? `${fitted.toFixed(1)} mV/dec` : '—'}</span></div>
        ${state.system === 'kinetic' ? `
          <div class="tf-c"><span class="k">Slope in the model</span>
            <span class="v">${trueB.toFixed(1)} mV/dec</span></div>
          <div class="tf-c ${bad ? 'bad' : 'good'}"><span class="k">Error</span>
            <span class="v">${err === null ? '—' : `${err >= 0 ? '+' : ''}${err.toFixed(0)} %`}</span></div>`
        : `<div class="tf-c bad"><span class="k">Slope in the model</span>
            <span class="v">none</span></div>
           <div class="tf-c bad"><span class="k">Meaning</span>
            <span class="v">none</span></div>`}
        <div class="tf-c"><span class="k">R² of the fit</span>
          <span class="v">${fit ? fit.r2.toFixed(4) : '—'}</span></div>
      </div>

      ${fit ? `<div class="readout">
        <div class="rw"><span>Points fitted</span><span class="rv">${fit.n}</span></div>
        <div class="rw"><span>Window actually spanned</span>
          <span class="rv">${(fit.logMax - fit.logMin).toFixed(2)} decades</span></div>
        <div class="rw"><span>Apparent j₀ from extrapolation</span>
          <span class="rv">${Number.isFinite(fit.jFit) ? fit.jFit.toExponential(2) + ' mA/cm²' : '—'}</span></div>
        ${state.system === 'kinetic' ? `<div class="rw"><span>j₀ in the model</span>
          <span class="rv">${state.j0.toExponential(2)} mA/cm²</span></div>` : ''}
      </div>` : `<div class="callout callout-warn">
        No points fall inside this window on the ${esc(state.branch)} branch. Move the window, or switch branch.</div>`}

      <div style="margin-top:.8rem;display:grid;gap:.5rem">
        ${flags.map((f) => `<div class="callout ${f.sev === 'danger' ? 'callout-danger'
          : f.sev === 'warn' ? 'callout-warn' : 'callout-ok'}">${esc(f.text)}</div>`).join('')}
      </div>

      ${fit && fit.r2 > 0.99 && (bad || state.system === 'resistive') ? `
        <div class="callout callout-danger" style="margin-top:.6rem">
          <strong>Note the R² above.</strong> The fitted line describes these points very well, and the number
          it produced is ${state.system === 'resistive' ? 'not a kinetic quantity at all'
            : `wrong by ${Math.abs(err).toFixed(0)}%`}. A good fit statistic says the points are collinear;
          it says nothing about whether they should have been fitted.
        </div>` : ''}`;

    /* ── Tafel plot ── */
    const branchRows = rows.filter((r) => Number.isFinite(r.logAbsJ) &&
      (state.branch === 'cathodic' ? r.j < 0 : r.j > 0));

    const h1 = host.querySelector('#tf-chart');
    h1.innerHTML = '';
    cTafel?.destroy?.();
    const { body: b1 } = simWrap(h1, { simulationBasis: T.BASIS });
    cTafel = await chartCard(b1, {
      title: `Tafel plot — ${state.branch} branch`,
      xLabel: 'log₁₀ |j|   (j in mA/cm²)',
      yLabel: 'Recorded overpotential  η  (V)',
      datasets: [
        { label: 'response', data: branchRows.map((r) => ({ x: r.logAbsJ, y: r.etaMeas })) },
        ...(fit ? [
          { label: 'points in the window',
            data: fit.points.map((r) => ({ x: r.logAbsJ, y: r.etaMeas })),
            color: 'var(--series-5)', showLine: false, pointRadius: 3 },
          { label: `fit: ${fitted.toFixed(1)} mV/dec`, data: T.fitLine(fit),
            color: 'var(--series-4)', dashed: true, borderWidth: 2 }
        ] : [])
      ],
      hint: 'The highlighted points are the ones being fitted. Drag the window sliders and watch the slope move.'
    });

    /* ── Polarisation curve, so the window can be located on the raw data ── */
    const h2 = host.querySelector('#tf-pol');
    h2.innerHTML = '';
    cPol?.destroy?.();
    const { body: b2 } = simWrap(h2, { simulationBasis: T.BASIS });
    cPol = await chartCard(b2, {
      title: 'The same response as a polarisation curve',
      xLabel: 'Recorded overpotential  η  (V)',
      yLabel: 'Current density  j  (mA/cm²)',
      datasets: [
        { label: 'j(η)', data: rows.map((r) => ({ x: r.etaMeas, y: r.j })), color: 'var(--series-3)' },
        ...(fit ? [{ label: 'fitting window',
          data: fit.points.map((r) => ({ x: r.etaMeas, y: r.j })),
          color: 'var(--series-5)', showLine: false, pointRadius: 3 }] : [])
      ],
      hint: 'The window shown on the linear curve — a window that looks small here can still dominate the log plot'
    });
  }

  sliders(host.querySelector('#tf-win'), winDefs);
  sliders(host.querySelector('#tf-ctl'), kineticDefs);
  await redraw();

  return { destroy() { cTafel?.destroy?.(); cPol?.destroy?.(); } };
}

function fmt(v) {
  if (typeof v !== 'number') return String(v);
  if (v !== 0 && Math.abs(v) < 0.01) return v.toExponential(1);
  return String(+v.toFixed(3));
}
