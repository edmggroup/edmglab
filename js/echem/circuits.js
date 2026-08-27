/**
 * EDMGLAB — Equivalent-circuit components (Instrumentation spec §26)
 *
 * Two things happen on this page, and the order matters.
 *
 *  1. EACH ELEMENT ON ITS OWN. Selecting an element plots the impedance of
 *     that element alone — Nyquist, magnitude and phase. Learning that a
 *     capacitor is −90° at every frequency, that a CPE is −n·90°, that a
 *     Warburg is −45°, is far easier from three plots than from three
 *     sentences. Each record also states what the element is commonly
 *     ASSOCIATED with and, separately, what that association does not license.
 *
 *  2. NON-UNIQUENESS, DEMONSTRATED. Two different circuits are plotted
 *     together whose impedance is identical at every frequency to within
 *     double-precision rounding. The parameter mapping is exact algebra, set
 *     out in sim/circuits.js — so this is not "circuits can look similar", it
 *     is "these two circuits ARE the same spectrum, and no fit can separate
 *     them".
 *
 * That second demonstration is the reason the page exists. Spec §38: do not
 * assume one equivalent circuit is universally correct.
 */

import { esc, callout, notAuthored } from '../ui.js';
import * as data from '../data.js';
import { simWrap } from '../lib/sim-label.js';
import { chartCard } from '../lib/charts.js';
import * as Sim from './sim/circuits.js';

/* Control definitions per element kind. Kept here rather than in the JSON:
   they describe the SIMULATOR's input ranges, which is code, not content. */
const CONTROLS = {
  r:   [{ key: 'R', label: 'R', unit: 'Ω', min: 1, max: 200, step: 1 }],
  c:   [{ key: 'C', label: 'C', unit: 'F', min: 0.00001, max: 0.001, step: 0.00001 }],
  l:   [{ key: 'L', label: 'L', unit: 'H', min: 0.000001, max: 0.0001, step: 0.000001 }],
  cpe: [{ key: 'Q', label: 'Q', unit: 'S·sⁿ', min: 0.00001, max: 0.001, step: 0.00001 },
        { key: 'n', label: 'n', unit: '', min: 0, max: 1, step: 0.01 }],
  w:   [{ key: 'sigma', label: 'σ', unit: 'Ω·s^−½', min: 1, max: 80, step: 1 }],
  ws:  [{ key: 'Rd', label: 'R_d', unit: 'Ω', min: 5, max: 200, step: 5 },
        { key: 'tau', label: 'τ', unit: 's', min: 0.1, max: 50, step: 0.1 }],
  wo:  [{ key: 'Rd', label: 'R_d', unit: 'Ω', min: 5, max: 200, step: 5 },
        { key: 'tau', label: 'τ', unit: 's', min: 0.1, max: 50, step: 0.1 }]
};

export async function render(host) {
  const payload = await data.load('ec/circuits');
  const elements = payload.items || [];

  if (!elements.length) {
    host.innerHTML = notAuthored('The equivalent-circuit element library');
    return { destroy() {} };
  }

  let sel = elements[0];
  let params = { ...Sim.ELEMENT_DEFAULTS[sel.sim] };
  let cNyq = null, cMag = null, cPha = null, cPair = null;

  host.innerHTML = `
    ${callout(`<strong>An equivalent circuit is a model, not a photograph of the physical system.</strong>
      Every element below has an exact impedance and a recognisable signature. None of them <em>is</em> the
      process it is named after — the name records what the element is conventionally taken to represent.
      A fit that agrees with the data is not evidence that the elements correspond to real processes.`, 'warn')}

    ${payload.preamble ? `<p class="small" style="max-width:74ch;margin:1rem 0 1.25rem">${esc(payload.preamble)}</p>` : ''}

    <section class="section">
      <div class="section-head"><h2>Element explorer</h2>
        <span class="section-note">each element plotted alone</span></div>

      <div class="el-chips" role="tablist" aria-label="Circuit elements">
        ${elements.map((e, i) => `<button type="button" class="el-chip${i === 0 ? ' is-active' : ''}"
          role="tab" aria-selected="${i === 0}" data-el="${esc(e.id)}">
          <span class="el-sym">${esc(e.symbol)}</span>
          <span class="el-nm">${esc(e.name)}</span></button>`).join('')}
      </div>

      <div class="sim-grid" style="margin-top:1rem">
        <div class="stack-sm">
          <div class="panel"><div class="panel-head" id="el-head">Element</div>
            <div class="panel-body">
              <div id="el-eqn"></div>
              <div class="ctl" id="el-ctl" style="margin-top:.9rem"></div>
              <div id="el-sig" style="margin-top:.9rem"></div>
            </div></div>
          <div class="panel"><div class="panel-head">Commonly associated with</div>
            <div class="panel-body" id="el-assoc"></div></div>
          <div class="panel panel-warn"><div class="panel-head">What that does <em>not</em> license</div>
            <div class="panel-body" id="el-not"></div></div>
        </div>
        <div class="stack">
          <div id="el-nyq"></div>
          <div id="el-mag"></div>
          <div id="el-pha"></div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="section-head"><h2>Two circuits, one spectrum</h2>
        <span class="section-note">§26 · why a good fit proves nothing on its own</span></div>
      <p class="small" style="max-width:74ch;margin-bottom:1rem">
        The curves below come from two <em>different</em> circuits. They are not fitted to each other —
        each is evaluated from its own expression, and the parameter mapping between them is exact algebra.
        Change the values on the left and the two spectra stay identical, because they are the same complex
        number at every frequency. No fit quality, residual or statistical criterion can tell them apart.
      </p>
      <div class="sim-grid">
        <div class="panel"><div class="panel-head">Circuit A parameters</div>
          <div class="panel-body">
            <div class="ctl" id="pair-ctl"></div>
            <div style="margin-top:1rem;padding-top:.8rem;border-top:1px solid var(--border)" id="pair-read"></div>
          </div></div>
        <div id="pair-chart"></div>
      </div>
    </section>

    <section class="section">
      <div class="section-head"><h2>Common circuits, and what each cannot represent</h2>
        <span class="section-note">${(payload.topologies || []).length} models</span></div>
      <div class="topo-grid">
        ${(payload.topologies || []).map(topoCard).join('')}
      </div>
    </section>

    ${payload.closing ? callout(`<strong>Fit quality does not select a circuit.</strong>
      ${esc(payload.closing).replace(/^Fit quality does not select a circuit\.\s*/, '')}`, 'warn') : ''}

    <style>
      .el-chips { display:flex; flex-wrap:wrap; gap:.4rem; }
      .el-chip { display:grid; gap:1px; text-align:left; padding:.45rem .7rem; cursor:pointer;
        background:var(--surface); color:var(--text-2); border:1px solid var(--border);
        border-radius:var(--r-sm); font:inherit; transition:background var(--dur-fast), border-color var(--dur-fast); }
      .el-chip:hover { background:var(--surface-2); color:var(--text); }
      .el-chip.is-active { background:var(--accent-wash); border-color:var(--accent); color:var(--text); }
      .el-sym { font-family:var(--font-mono); font-size:var(--fs-sm); font-weight:700; color:var(--accent-strong); }
      .el-nm { font-size:var(--fs-xs); }
      .panel-warn { border-left:3px solid var(--warn, var(--series-5)); }
      /* Two fixed columns for four topologies — auto-fit would give three
         across and leave a lone card on a second row. */
      .topo-grid { display:grid; gap:.85rem; grid-template-columns:1fr; }
      @media (min-width:940px) { .topo-grid { grid-template-columns:1fr 1fr; } }
      .topo { border:1px solid var(--border); border-radius:var(--r-md); background:var(--surface); padding:.9rem 1rem; }
      .topo h3 { font-size:var(--fs-base); margin:0 0 .4rem; }
      .topo .sk { font-family:var(--font-mono); font-size:var(--fs-sm); color:var(--accent-strong);
        background:var(--surface-2); border:1px solid var(--border); border-radius:var(--r-sm);
        padding:.35rem .5rem; margin-bottom:.6rem; overflow-wrap:anywhere; }
      .eq-line { font-family:var(--font-mono); font-size:var(--fs-sm); color:var(--text);
        background:var(--surface-2); border:1px solid var(--border); border-radius:var(--r-sm);
        padding:.45rem .6rem; overflow-wrap:anywhere; }
    </style>`;

  /* ── Element explorer ─────────────────────────────────── */

  function paintStatic() {
    host.querySelector('#el-head').textContent = `${sel.symbol} — ${sel.name}`;
    host.querySelector('#el-eqn').innerHTML =
      `<div class="eq-line">${esc(sel.impedance)}</div>
       <p class="xsmall muted" style="margin:.45rem 0 0">${esc(sel.param)}</p>`;
    host.querySelector('#el-sig').innerHTML =
      `<p class="small" style="margin:0 0 .5rem"><strong>Phase signature.</strong> ${esc(sel.phaseSignature)}</p>
       <p class="small" style="margin:0"><strong>In a spectrum.</strong> ${esc(sel.inTheSpectrum)}</p>`;
    host.querySelector('#el-assoc').innerHTML =
      `<ul class="lim-list">${(sel.oftenAssociatedWith || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
    host.querySelector('#el-not').innerHTML =
      `<ul class="lim-list warn">${(sel.butNot || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
       ${(sel.misreadAs || []).length ? `<p class="xsmall muted" style="margin:.7rem 0 .3rem">
         <strong>Commonly misread as:</strong></p>
         <ul class="lim-list" style="margin:0">${sel.misreadAs.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}`;
  }

  function paintControls() {
    const defs = CONTROLS[sel.sim] || [];
    const box = host.querySelector('#el-ctl');
    box.innerHTML = defs.map((d) => `
      <label><span class="field-label">${esc(d.label)}${d.unit ? ` (${esc(d.unit)})` : ''}</span>
      <div class="row2"><input type="range" data-p="${d.key}" min="${d.min}" max="${d.max}"
        step="${d.step}" value="${params[d.key]}">
      <span class="val" data-pv="${d.key}">${fmt(params[d.key])}</span></div></label>`).join('');
    box.querySelectorAll('[data-p]').forEach((inp) => {
      inp.addEventListener('input', () => {
        params[inp.dataset.p] = parseFloat(inp.value);
        box.querySelector(`[data-pv="${inp.dataset.p}"]`).textContent = fmt(params[inp.dataset.p]);
        drawElement();
      });
    });
  }

  async function drawElement() {
    const rows = Sim.sweepElement(sel.sim, params);
    const basis = Sim.elementBasis(sel.name.toLowerCase(), sel.impedance);

    const mk = async (selector, prev, opts) => {
      const h = host.querySelector(selector);
      h.innerHTML = '';
      prev?.destroy?.();
      const { body } = simWrap(h, { simulationBasis: basis });
      return chartCard(body, opts);
    };

    /* Equal axis scaling exists so an ANGLE is trustworthy — the 45° Warburg
       line, the arc of a semicircle. A purely reactive element (C, L) has no
       real part at all, so there is no angle to preserve and forcing equal
       scaling would stretch the x-axis across an empty frame to match a
       160 kΩ imaginary range. Apply it only where the locus has real width. */
    const nyq = Sim.nyquist(rows);
    const xr = Math.max(...nyq.map((q) => q.x)) - Math.min(...nyq.map((q) => q.x));
    const yr = Math.max(...nyq.map((q) => q.y)) - Math.min(...nyq.map((q) => q.y));
    const equal = xr > 0.02 * yr && xr > 0;

    cNyq = await mk('#el-nyq', cNyq, {
      title: `Nyquist — ${sel.symbol} alone`,
      xLabel: 'Z′  (Ω)', yLabel: '−Z″  (Ω)',
      datasets: [{ label: sel.symbol, data: nyq, pointRadius: 2 }],
      equalAspect: equal,
      hint: equal
        ? 'Equally scaled axes — an angle is only an angle when they are'
        : 'This element has no real part: the locus is a vertical line on the imaginary axis'
    });
    cMag = await mk('#el-mag', cMag, {
      title: 'Magnitude',
      xLabel: 'Frequency  (Hz)', yLabel: 'log₁₀ |Z|  (Ω)',
      datasets: [{ label: '|Z|', data: Sim.logMag(rows), color: 'var(--series-3)' }],
      logX: true,
      hint: 'Slope on this plot: −1 for a capacitor, +1 for an inductor, −n for a CPE, −½ for a Warburg'
    });
    cPha = await mk('#el-pha', cPha, {
      title: 'Phase',
      xLabel: 'Frequency  (Hz)', yLabel: 'Phase  (°)',
      datasets: [{ label: 'phase', data: Sim.phase(rows), color: 'var(--series-2)' }],
      logX: true,
      hint: '0° resistive · −90° ideal capacitive · +90° inductive · −45° Warburg'
    });
  }

  host.querySelectorAll('[data-el]').forEach((b) => b.addEventListener('click', () => {
    sel = elements.find((e) => e.id === b.dataset.el) || elements[0];
    params = { ...Sim.ELEMENT_DEFAULTS[sel.sim] };
    host.querySelectorAll('[data-el]').forEach((x) => {
      const on = x.dataset.el === sel.id;
      x.classList.toggle('is-active', on);
      x.setAttribute('aria-selected', String(on));
    });
    paintStatic(); paintControls(); drawElement();
  }));

  /* ── Non-uniqueness demonstration ─────────────────────── */

  const pair = { ...Sim.PAIR_DEFAULTS };

  const pairDefs = [
    { key: 'Rs', label: 'Rs — series resistance', unit: 'Ω', min: 1, max: 40, step: 1 },
    { key: 'Rp', label: 'Rp — parallel resistance', unit: 'Ω', min: 10, max: 200, step: 5 },
    { key: 'C',  label: 'C — capacitance', unit: 'F', min: 0.0001, max: 0.005, step: 0.0001 }
  ];

  function paintPairControls() {
    const box = host.querySelector('#pair-ctl');
    box.innerHTML = pairDefs.map((d) => `
      <label><span class="field-label">${esc(d.label)} (${esc(d.unit)})</span>
      <div class="row2"><input type="range" data-q="${d.key}" min="${d.min}" max="${d.max}"
        step="${d.step}" value="${pair[d.key]}">
      <span class="val" data-qv="${d.key}">${fmt(pair[d.key])}</span></div></label>`).join('');
    box.querySelectorAll('[data-q]').forEach((inp) => {
      inp.addEventListener('input', () => {
        pair[inp.dataset.q] = parseFloat(inp.value);
        box.querySelector(`[data-qv="${inp.dataset.q}"]`).textContent = fmt(pair[inp.dataset.q]);
        drawPair();
      });
    });
  }

  async function drawPair() {
    const r = Sim.degeneratePair(pair);

    host.querySelector('#pair-read').innerHTML = `
      <div class="readout">
        <div class="rw"><span><strong>Circuit A</strong> — Rs + (Rp ∥ C)</span><span class="rv"></span></div>
        <div class="rw"><span>Rs</span><span class="rv">${r.A.Rs.toFixed(2)} Ω</span></div>
        <div class="rw"><span>Rp</span><span class="rv">${r.A.Rp.toFixed(2)} Ω</span></div>
        <div class="rw"><span>C</span><span class="rv">${sci(r.A.C)} F</span></div>
        <div class="rw"><span><strong>Circuit B</strong> — Ra ∥ (Rb + Cb)</span><span class="rv"></span></div>
        <div class="rw"><span>Ra</span><span class="rv">${r.B.Ra.toFixed(2)} Ω</span></div>
        <div class="rw"><span>Rb</span><span class="rv">${r.B.Rb.toFixed(2)} Ω</span></div>
        <div class="rw"><span>Cb</span><span class="rv">${sci(r.B.Cb)} F</span></div>
        <div class="rw"><span>Largest relative difference</span>
          <span class="rv">${r.maxRelDev.toExponential(1)}</span></div>
      </div>
      <div class="callout callout-warn" style="margin-top:.8rem">
        The two spectra differ by ${r.maxRelDev.toExponential(1)} — that is double-precision rounding, not a
        physical difference. Circuit A reads as "${r.A.Rs.toFixed(1)} Ω of series resistance and one
        interfacial process of ${r.A.Rp.toFixed(1)} Ω". Circuit B reads as something else entirely.
        <strong>Both are equally consistent with the data.</strong>
      </div>`;

    const h = host.querySelector('#pair-chart');
    h.innerHTML = '';
    cPair?.destroy?.();
    const { body } = simWrap(h, { simulationBasis: Sim.PAIR_BASIS });
    cPair = await chartCard(body, {
      title: 'Nyquist — circuit A and circuit B superimposed',
      xLabel: 'Z′  (Ω)', yLabel: '−Z″  (Ω)',
      datasets: [
        { label: 'A: Rs + (Rp ∥ C)', data: Sim.nyquist(r.rowsA), borderWidth: 3 },
        { label: 'B: Ra ∥ (Rb + Cb)', data: Sim.nyquist(r.rowsB), color: 'var(--series-4)',
          showLine: false, pointRadius: 3 }
      ],
      equalAspect: true,
      hint: 'B is drawn as points on top of A. Every point lands on the line — there is no second curve to see.'
    });
  }

  paintStatic();
  paintControls();
  paintPairControls();
  await drawElement();
  await drawPair();

  return {
    destroy() {
      cNyq?.destroy?.(); cMag?.destroy?.(); cPha?.destroy?.(); cPair?.destroy?.();
    }
  };
}

function topoCard(t) {
  return `<div class="topo">
    <h3>${esc(t.name)}</h3>
    <div class="sk">${esc(t.sketch)}</div>
    <p class="small" style="margin:0 0 .5rem">${esc(t.describes)}</p>
    <p class="small" style="margin:0 0 .6rem"><strong>Produces.</strong> ${esc(t.produces)}</p>
    <p class="xsmall muted" style="margin:0 0 .3rem"><strong>Cannot represent:</strong></p>
    <ul class="lim-list warn" style="margin:0">${(t.cannotRepresent || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
  </div>`;
}

function fmt(v) {
  if (typeof v !== 'number') return String(v);
  if (v !== 0 && Math.abs(v) < 0.01) return v.toExponential(1);
  return String(+v.toFixed(3));
}

function sci(v) { return v.toExponential(3); }
