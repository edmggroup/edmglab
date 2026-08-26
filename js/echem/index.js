/**
 * EDMGLAB — Electrochemical Workstation module (Instrumentation spec §13–§30)
 *
 * Stage 1B scope, per spec §42:
 *   1 landing page · 2 potentiostat block diagram · 3 galvanostat block diagram
 *   4 three-electrode interactive diagram · 5 CV simulation · 6 GCD simulation
 *   7 EIS simulation · 8 method-selection decision tree
 *
 * Kept deliberately separate from the Battery Tester module (spec: "Do not
 * merge them into a generic electrochemistry module"). The two share the
 * animation engine, diagram engine, chart layer, simulation labelling and the
 * formula library — and nothing else.
 *
 * Every simulator here computes a STATED model and renders through
 * sim-label.js, which paints the "Illustrative simulation" banner itself and
 * refuses to render anything that does not declare its governing model.
 */

import { esc, pageHead, callout, notAuthored } from '../ui.js';
import * as data from '../data.js';
import { renderDiagram } from '../lib/diagram.js';
import { simWrap } from '../lib/sim-label.js';
import { chartCard } from '../lib/charts.js';
import { renderTree } from '../lib/decision-tree.js';
import * as SimCV from './sim/cv.js';
import * as SimGCD from './sim/gcd.js';
import * as SimEIS from './sim/eis.js';

const SECTIONS = [
  { id: 'overview',     label: 'Overview' },
  { id: 'potentiostat', label: 'Potentiostat' },
  { id: 'galvanostat',  label: 'Galvanostat' },
  { id: 'electrodes',   label: 'Three-electrode cell' },
  { id: 'cv',           label: 'CV' },
  { id: 'gcd',          label: 'GCD' },
  { id: 'eis',          label: 'EIS' },
  { id: 'choose',       label: 'Which method?' }
];

export async function render(outlet, ctx) {
  const active = SECTIONS.some((s) => s.id === ctx.params.section) ? ctx.params.section : 'overview';
  let child = null;

  outlet.innerHTML = `
    ${pageHead('Electrochemical Workstation',
      'What a potentiostat/galvanostat controls, what it measures, why three electrodes are used, and how to read what comes back.')}

    <nav class="tabbar" role="tablist" aria-label="Workstation sections">
      ${SECTIONS.map((s) => `
        <a class="tab${s.id === active ? ' is-active' : ''}" role="tab"
           aria-selected="${s.id === active}"
           href="#/workstation/${s.id}">${esc(s.label)}</a>`).join('')}
    </nav>

    <div id="ec-section"></div>

    <style>
      .sim-grid { display:grid; gap:1rem; grid-template-columns:minmax(240px,300px) minmax(320px,1fr); align-items:start; }
      @media (max-width:900px){ .sim-grid { grid-template-columns:1fr; } }
      .ctl { display:grid; gap:.7rem; }
      .ctl label { display:grid; gap:.25rem; }
      .ctl .row2 { display:flex; align-items:center; gap:.5rem; }
      .ctl input[type=number] { background:var(--surface-2); color:var(--text); border:1px solid var(--border);
        border-radius:var(--r-sm); padding:.35rem .5rem; min-height:34px; width:100%;
        font-family:var(--font-mono); font-size:var(--fs-sm); }
      .ctl input[type=range] { width:100%; accent-color:var(--accent); }
      .ctl .val { font-family:var(--font-mono); font-size:var(--fs-xs); color:var(--accent-strong);
        min-width:56px; text-align:right; }
      .readout { display:grid; gap:.4rem; font-size:var(--fs-sm); }
      .readout .rw { display:flex; justify-content:space-between; gap:.75rem;
        padding:.3rem 0; border-bottom:1px dashed var(--border); }
      .readout .rw:last-child { border-bottom:0; }
      .readout .rv { font-family:var(--font-mono); color:var(--text); }
    </style>`;

  child = await mountSection(active, outlet.querySelector('#ec-section'));
  return { destroy() { child?.destroy?.(); } };
}

async function mountSection(id, host) {
  switch (id) {
    case 'potentiostat': return diagramSection(host, 'diagram.potentiostat',
      'The instrument cannot set the working electrode\'s potential directly. It drives the counter electrode and watches the WE–RE difference until the two match — that loop is the whole idea.');
    case 'galvanostat':  return diagramSection(host, 'diagram.galvanostat',
      'The same loop with the roles exchanged. Recognising that symmetry is most of what there is to understand about the difference.');
    case 'electrodes':   return sectionElectrodes(host);
    case 'cv':           return sectionCV(host);
    case 'gcd':          return sectionGCD(host);
    case 'eis':          return sectionEIS(host);
    case 'choose':       return sectionChoose(host);
    default:             return sectionOverview(host);
  }
}

/* ════════════════════════════════════════════════════════════
   Overview (§13)
   ════════════════════════════════════════════════════════════ */

async function sectionOverview(host) {
  const concepts = await data.items('ec/concepts');

  host.innerHTML = `
    ${callout(`<strong>Your instrument: OrigaLys.</strong> OrigaMaster prefixes every technique with
      <code>Pot.</code> or <code>Gal.</code> — potentiostatic or galvanostatic. That is not a naming quirk;
      it is the single most important distinction in this module, printed on your own screen.
      Where a technique here has an OrigaMaster name, it is recorded as a search alias so the term on the
      instrument finds the right page.`, 'info')}

    <section class="section" style="margin-top:1.25rem">
      <div class="section-head"><h2>Instrument vs cell vs data</h2>
        <span class="section-note">the §34 separation</span></div>
      <p class="small" style="max-width:72ch">
        Keeping these apart is what makes electrochemical data interpretable. Most confused
        interpretations come from attributing something to the material that actually belongs to the
        instrument or to the processing.
      </p>
      <div class="table-wrap"><table class="stackable">
        <thead><tr><th>Layer</th><th>What it is</th><th>Example of something that belongs here</th></tr></thead>
        <tbody>
          <tr><td data-label="Layer"><strong>Instrument</strong></td>
              <td data-label="What">What the workstation controls and measures</td>
              <td data-label="Example">Current-range switching glitches; compliance limits</td></tr>
          <tr><td data-label="Layer"><strong>Cell</strong></td>
              <td data-label="What">What physically happens at the electrodes and in the electrolyte</td>
              <td data-label="Example">Charge transfer, diffusion, electrolyte decomposition</td></tr>
          <tr><td data-label="Layer"><strong>Applied signal</strong></td>
              <td data-label="What">What you impose</td>
              <td data-label="Example">A triangular potential sweep at a chosen scan rate</td></tr>
          <tr><td data-label="Layer"><strong>Response</strong></td>
              <td data-label="What">What comes back</td>
              <td data-label="Example">The current–potential curve</td></tr>
          <tr><td data-label="Layer"><strong>Processing</strong></td>
              <td data-label="What">How raw measurements become parameters</td>
              <td data-label="Example">Baseline choice; peak integration limits</td></tr>
          <tr><td data-label="Layer"><strong>Interpretation</strong></td>
              <td data-label="What">What it might mean, and what it cannot</td>
              <td data-label="Example">Calling a response "capacitive" from a b-value alone</td></tr>
        </tbody>
      </table></div>
    </section>

    <section class="section">
      <div class="section-head"><h2>Fundamentals</h2>
        <span class="section-note">${concepts.length} topic${concepts.length === 1 ? '' : 's'} · switch Learn/Research in the header</span></div>
      ${concepts.length ? `<div class="concept-list">${concepts.map(conceptCard).join('')}</div>`
                        : notAuthored('The fundamentals content')}
    </section>`;
  return { destroy() {} };
}

function conceptCard(c) {
  const l = c.learnMode || {}, r = c.researchMode || {};
  return `<div class="concept"><details>
    <summary>${esc(c.title)}</summary>
    <div class="concept-body">
      <div data-mode-only="learn">
        ${l.simpleDefinition ? `<p>${esc(l.simpleDefinition)}</p>` : ''}
        ${l.physicalMeaning ? `<div><h4>What it means in practice</h4><p style="margin:0">${esc(l.physicalMeaning)}</p></div>` : ''}
        ${l.example ? `<div><h4>Example</h4><p style="margin:0">${esc(l.example)}</p></div>` : ''}
      </div>
      <div data-mode-only="research">
        ${r.scientificDefinition ? `<p>${esc(r.scientificDefinition)}</p>` : ''}
        ${r.mathematicalTreatment ? `<div><h4>Mathematical treatment</h4><p style="margin:0">${esc(r.mathematicalTreatment)}</p></div>` : ''}
        ${r.experimentalInterpretation ? `<div><h4>Experimental interpretation</h4><p style="margin:0">${esc(r.experimentalInterpretation)}</p></div>` : ''}
        ${r.limitations?.length ? `<div><h4>Limitations</h4><ul>${r.limitations.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
        ${r.researchConsiderations?.length ? `<div><h4>Research considerations</h4><ul>${r.researchConsiderations.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
      </div>
    </div>
  </details></div>`;
}

/* ════════════════════════════════════════════════════════════
   Block diagrams (§14, §15)
   ════════════════════════════════════════════════════════════ */

async function diagramSection(host, id, lede) {
  const payload = await data.load('ec/potentiostat');
  const spec = (payload.items || []).find((x) => x.id === id);

  host.innerHTML = `
    <section class="section">
      <div class="section-head"><h2>${esc(spec?.title || 'Block diagram')}</h2>
        <span class="section-note">select any block</span></div>
      <p class="small" style="max-width:72ch;margin-bottom:1rem">${esc(lede)}</p>
      <div id="ec-diagram"></div>
    </section>`;

  const h = renderDiagram(host.querySelector('#ec-diagram'), spec || { blocks: [] });
  return { destroy() { h.destroy?.(); } };
}

/* ════════════════════════════════════════════════════════════
   Three-electrode cell (§16, §17)
   ════════════════════════════════════════════════════════════ */

async function sectionElectrodes(host) {
  host.innerHTML = `
    <section class="section">
      <div class="section-head"><h2>The three-electrode system</h2>
        <span class="section-note">§16 · potential path vs current path</span></div>
      <p class="small" style="max-width:72ch;margin-bottom:1rem">
        Potential is measured between WE and RE. Current flows between WE and CE. Separating those two
        jobs is the entire reason a third electrode exists — use the buttons to look at each path on
        its own, then select any part of the cell for detail.
      </p>
      <div id="ec-electrodes"></div>
    </section>`;

  const mod = await import('./electrodes.js');
  return mod.render(host.querySelector('#ec-electrodes'));
}

/* ════════════════════════════════════════════════════════════
   Shared control helper
   ════════════════════════════════════════════════════════════ */

function buildControls(host, defs, state, onChange) {
  host.innerHTML = defs.map((d) => {
    if (d.type === 'check') {
      return `<label class="row2" style="cursor:pointer">
        <input type="checkbox" data-k="${d.key}" ${state[d.key] ? 'checked' : ''} style="width:18px;height:18px">
        <span class="field-label" style="text-transform:none;font-size:var(--fs-sm)">${esc(d.label)}</span></label>`;
    }
    if (d.type === 'range') {
      return `<label>
        <span class="field-label">${esc(d.label)}${d.unit ? ` (${esc(d.unit)})` : ''}</span>
        <div class="row2"><input type="range" data-k="${d.key}" min="${d.min}" max="${d.max}"
          step="${d.step}" value="${state[d.key]}">
        <span class="val" data-val="${d.key}">${fmtVal(state[d.key])}</span></div></label>`;
    }
    return `<label>
      <span class="field-label">${esc(d.label)}${d.unit ? ` (${esc(d.unit)})` : ''}</span>
      <input type="number" data-k="${d.key}" value="${state[d.key]}"
        ${d.min !== undefined ? `min="${d.min}"` : ''} ${d.max !== undefined ? `max="${d.max}"` : ''}
        step="${d.step ?? 1}"></label>`;
  }).join('');

  host.querySelectorAll('[data-k]').forEach((inp) => {
    const ev = inp.type === 'range' ? 'input' : 'change';
    inp.addEventListener(ev, () => {
      state[inp.dataset.k] = inp.type === 'checkbox' ? inp.checked : parseFloat(inp.value);
      const v = host.querySelector(`[data-val="${inp.dataset.k}"]`);
      if (v) v.textContent = fmtVal(state[inp.dataset.k]);
      onChange();
    });
  });
}

function fmtVal(v) {
  if (typeof v !== 'number') return String(v);
  if (v !== 0 && Math.abs(v) < 0.001) return v.toExponential(1);
  return String(+v.toFixed(4));
}

function readoutRows(rows) {
  return `<div class="readout">${rows.map(([k, v]) =>
    `<div class="rw"><span>${esc(k)}</span><span class="rv">${esc(v)}</span></div>`).join('')}</div>`;
}

/* ════════════════════════════════════════════════════════════
   CV simulator (§20, §27)
   ════════════════════════════════════════════════════════════ */

function sectionCV(host) {
  const state = { ...SimCV.DEFAULTS };
  let chart = null, bChart = null;

  host.innerHTML = `
    <section class="section">
      <div class="section-head"><h2>Cyclic voltammetry</h2>
        <span class="section-note">§20 · teaching model</span></div>
      <div class="sim-grid">
        <div class="panel"><div class="panel-head">Parameters</div>
          <div class="panel-body"><div class="ctl" id="cv-ctl"></div>
            <div style="margin-top:1rem;padding-top:.8rem;border-top:1px solid var(--border)"
                 id="cv-read"></div>
          </div></div>
        <div class="stack"><div id="cv-chart"></div><div id="cv-b"></div></div>
      </div>
    </section>`;

  const defs = [
    { key: 'eStart',  label: 'Initial potential',  unit: 'V', type: 'number', step: 0.05 },
    { key: 'eVertex', label: 'Vertex potential',   unit: 'V', type: 'number', step: 0.05 },
    { key: 'scanRate', label: 'Scan rate', unit: 'mV/s', type: 'range', min: 5, max: 500, step: 5 },
    { key: 'cycles',  label: 'Cycles', type: 'number', min: 1, max: 5, step: 1 },
    { key: 'cdl',     label: 'Double-layer capacitance', unit: 'mF', type: 'range', min: 0, max: 4, step: 0.1 },
    { key: 'peaks',   label: 'Include faradaic peaks', type: 'check' },
    { key: 'bValue',  label: 'b-value', type: 'range', min: 0.5, max: 1, step: 0.05 },
    { key: 'peakSep', label: 'Peak separation', unit: 'V', type: 'range', min: 0.02, max: 0.4, step: 0.01 }
  ];

  async function redraw() {
    const { points, meta } = SimCV.generate(state);

    host.querySelector('#cv-read').innerHTML = readoutRows([
      ['Capacitive current', `${meta.capacitiveCurrent.toFixed(3)} mA`],
      ['Peak current', meta.peakCurrent ? `${meta.peakCurrent.toFixed(3)} mA` : '—'],
      ['Peak separation', `${meta.peakSeparation.toFixed(3)} V`],
      ['b-value (as set)', state.bValue.toFixed(2)]
    ]) + `<p class="xsmall muted" style="margin:.7rem 0 0">
      b = 0.5 is the scaling expected of a diffusion-controlled response; b = 1 that of a
      surface-controlled or capacitive one. Change the scan rate and watch the rectangle and the peaks
      grow at different rates — that difference is what b-value analysis measures.</p>`;

    const cvHost = host.querySelector('#cv-chart');
    cvHost.innerHTML = '';
    chart?.destroy?.();
    const { body } = simWrap(cvHost, { simulationBasis: SimCV.BASIS });
    chart = await chartCard(body, {
      title: `Cyclic voltammogram — ${state.scanRate} mV/s`,
      xLabel: 'Potential  E  (V)',
      yLabel: 'Current  i  (mA, anodic positive)',
      datasets: [{ label: 'i(E)', data: points }],
      hint: 'Scroll or pinch to zoom · drag to pan · anodic current plotted positive (IUPAC convention)'
    });

    // Peak current vs scan rate, log–log: the b-value relationship made visible.
    const series = SimCV.scanRateSeries(state);
    const bHost = host.querySelector('#cv-b');
    bHost.innerHTML = '';
    bChart?.destroy?.();
    const { body: b2 } = simWrap(bHost, {
      simulationBasis: {
        model: 'Peak current vs scan rate, from the same CV model',
        equations: ['i_p ∝ v^b', 'log(i_p) = b·log(v) + constant   → the slope IS b'],
        assumptions: [
          'The model DEFINES i_p ∝ v^b, so fitting this line returns exactly the b that was set. That is the point of showing it — the analysis is demonstrated in a case where the answer is known.',
          'On real data the slope is the question, not a check, and it holds only over the scan-rate window actually measured.',
          'A b-value is an empirical descriptor, not a mechanism.'
        ],
        note: 'Reporting a b-value without stating the scan-rate window and the potential at which it was evaluated makes it uninterpretable.'
      }
    });
    bChart = await chartCard(b2, {
      title: 'log(peak current) vs log(scan rate)',
      xLabel: 'log₁₀ v  (V/s)',
      yLabel: 'log₁₀ i_p',
      datasets: [{ label: `slope = b = ${state.bValue.toFixed(2)}`,
        data: series.map((s) => ({ x: s.logV, y: s.logIp })), pointRadius: 4 }],
      hint: 'The slope of this line is the b-value'
    });
  }

  buildControls(host.querySelector('#cv-ctl'), defs, state, redraw);
  redraw();
  return { destroy() { chart?.destroy?.(); bChart?.destroy?.(); } };
}

/* ════════════════════════════════════════════════════════════
   GCD simulator (§24)
   ════════════════════════════════════════════════════════════ */

function sectionGCD(host) {
  const state = { ...SimGCD.DEFAULTS };
  let chart = null;

  host.innerHTML = `
    <section class="section">
      <div class="section-head"><h2>Galvanostatic charge–discharge</h2>
        <span class="section-note">§24 · why the IR convention matters</span></div>
      <div class="sim-grid">
        <div class="panel"><div class="panel-head">Parameters</div>
          <div class="panel-body"><div class="ctl" id="gcd-ctl"></div></div></div>
        <div class="stack"><div id="gcd-chart"></div>
          <div class="panel"><div class="panel-head">Capacitance recovered from the curve</div>
            <div class="panel-body" id="gcd-read"></div></div>
        </div>
      </div>
    </section>`;

  const defs = [
    { key: 'current', label: 'Current', unit: 'mA', type: 'range', min: 0.1, max: 10, step: 0.1 },
    { key: 'cap',     label: 'True capacitance', unit: 'F', type: 'range', min: 0.05, max: 3, step: 0.05 },
    { key: 'rs',      label: 'Series resistance', unit: 'Ω', type: 'range', min: 0, max: 50, step: 0.5 },
    { key: 'vMin',    label: 'Lower limit', unit: 'V', type: 'number', step: 0.05 },
    { key: 'vMax',    label: 'Upper limit', unit: 'V', type: 'number', step: 0.05 },
    { key: 'cycles',  label: 'Cycles', type: 'number', min: 1, max: 6, step: 1 }
  ];

  async function redraw() {
    const { points, meta } = SimGCD.generate(state);
    const err = SimGCD.irConventionError(meta);

    const h = host.querySelector('#gcd-chart');
    h.innerHTML = '';
    chart?.destroy?.();
    const { body } = simWrap(h, { simulationBasis: SimGCD.BASIS });
    chart = await chartCard(body, {
      title: 'Charge–discharge curve',
      xLabel: 'Time  (s)',
      yLabel: 'Voltage  (V)',
      datasets: [{ label: 'V(t)', data: points }],
      hint: `IR drop at each reversal = ${(meta.irDrop * 1000).toFixed(1)} mV · scroll to zoom`
    });

    host.querySelector('#gcd-read').innerHTML = readoutRows([
      ['True capacitance (set by you)', `${meta.trueCapacitance.toFixed(4)} F`],
      ['C = I·Δt/ΔV, IR excluded from ΔV', `${meta.capacitanceExcludingIR.toFixed(4)} F`],
      ['C = I·Δt/ΔV, IR included in ΔV', `${meta.capacitanceIncludingIR.toFixed(4)} F`],
      ['Error from including IR', `${err >= 0 ? '+' : ''}${err.toFixed(1)} %`],
      ['IR drop per reversal', `${(meta.irDrop * 1000).toFixed(1)} mV`],
      ['Discharge time', `${meta.dischargeTime.toFixed(1)} s`]
    ]) + `<div class="callout ${Math.abs(err) > 10 ? 'callout-warn' : ''}" style="margin-top:.8rem">
      Excluding the IR drop from ΔV recovers the capacitance that went in. Including it
      ${Math.abs(err) < 0.05 ? 'makes no difference here — raise the series resistance or the current and watch that change.'
        : `understates it by <strong>${Math.abs(err).toFixed(1)}%</strong>.`}
      With real data nobody knows the true value, which is exactly why the convention has to be stated
      alongside every reported capacitance.</div>`;
  }

  buildControls(host.querySelector('#gcd-ctl'), defs, state, redraw);
  redraw();
  return { destroy() { chart?.destroy?.(); } };
}

/* ════════════════════════════════════════════════════════════
   EIS simulator (§25, §26, §27)
   ════════════════════════════════════════════════════════════ */

function sectionEIS(host) {
  const state = { ...SimEIS.DEFAULTS };
  let cN = null, cM = null, cP = null;

  host.innerHTML = `
    <section class="section">
      <div class="section-head"><h2>Impedance spectroscopy</h2>
        <span class="section-note">§25 · Randles circuit</span></div>
      ${callout(`<strong>An equivalent circuit is a model, not a photograph of the system.</strong>
        More than one circuit can usually fit the same spectrum, and a good fit is not evidence that the
        elements correspond to real physical processes. Use this to learn which feature each element
        controls — then test any real interpretation against independent evidence.`, 'warn')}
      <div class="sim-grid" style="margin-top:1rem">
        <div class="panel"><div class="panel-head">Circuit parameters</div>
          <div class="panel-body"><div class="ctl" id="eis-ctl"></div>
            <div style="margin-top:1rem;padding-top:.8rem;border-top:1px solid var(--border)" id="eis-read"></div>
          </div></div>
        <div class="stack"><div id="eis-nyq"></div><div id="eis-mag"></div><div id="eis-ph"></div></div>
      </div>
    </section>`;

  const defs = [
    { key: 'Rs',    label: 'Rs — series resistance', unit: 'Ω', type: 'range', min: 0, max: 50, step: 0.5 },
    { key: 'Rct',   label: 'Rct — charge transfer', unit: 'Ω', type: 'range', min: 1, max: 300, step: 1 },
    { key: 'Q',     label: 'Q — CPE magnitude', unit: 'S·sⁿ', type: 'range', min: 0.00001, max: 0.002, step: 0.00001 },
    { key: 'n',     label: 'n — CPE exponent', type: 'range', min: 0.5, max: 1, step: 0.01 },
    { key: 'sigma', label: 'σ — Warburg coefficient', type: 'range', min: 0, max: 60, step: 1 }
  ];

  async function redraw() {
    const rows = SimEIS.sweep(state);
    const lm = SimEIS.landmarks(state);

    host.querySelector('#eis-read').innerHTML = readoutRows([
      ['High-frequency intercept', `${lm.highFrequencyIntercept.toFixed(2)} Ω`],
      ['Semicircle diameter', `${lm.semicircleDiameter.toFixed(2)} Ω`],
      ['Low-frequency intercept', `${lm.lowFrequencyIntercept.toFixed(2)} Ω`],
      ['CPE exponent n', state.n.toFixed(2) + (state.n > 0.98 ? '  (ideal C)' : '  (non-ideal)')],
      ['Frequency range', `${state.fMin} Hz – ${(state.fMax / 1000).toFixed(0)} kHz`]
    ]) + `<p class="xsmall muted" style="margin:.7rem 0 0">
      These landmarks are exact for <em>this</em> circuit. On a real spectrum they are approximations,
      and reading Rct off a depressed or overlapping semicircle by eye can be badly wrong. Set n below 1
      to see the semicircle depress — that is what a CPE does.</p>`;

    const mk = async (sel, prev, opts) => {
      const h = host.querySelector(sel);
      h.innerHTML = '';
      prev?.destroy?.();
      const { body } = simWrap(h, { simulationBasis: SimEIS.BASIS });
      return chartCard(body, opts);
    };

    cN = await mk('#eis-nyq', cN, {
      title: 'Nyquist',
      xLabel: "Z′  (Ω)", yLabel: '−Z″  (Ω)',
      datasets: [{ label: 'Z', data: SimEIS.nyquist(rows), pointRadius: 2 }],
      equalAspect: true,
      hint: 'Axes are equally scaled — a semicircle is only a semicircle, and a Warburg line only 45°, when they are'
    });
    cM = await mk('#eis-mag', cM, {
      title: 'Bode — magnitude',
      xLabel: 'Frequency  (Hz)', yLabel: '|Z|  (Ω)',
      datasets: [{ label: '|Z|', data: SimEIS.bodeMagnitude(rows) }],
      logX: true, hint: 'Logarithmic frequency axis'
    });
    cP = await mk('#eis-ph', cP, {
      title: 'Bode — phase',
      xLabel: 'Frequency  (Hz)', yLabel: 'Phase  (°)',
      datasets: [{ label: 'phase', data: SimEIS.bodePhase(rows), color: 'var(--series-2)' }],
      logX: true, hint: '−90° is ideal capacitive behaviour; 0° is purely resistive'
    });
  }

  buildControls(host.querySelector('#eis-ctl'), defs, state, redraw);
  redraw();
  return { destroy() { cN?.destroy?.(); cM?.destroy?.(); cP?.destroy?.(); } };
}

/* ════════════════════════════════════════════════════════════
   Method-selection assistant (§30)
   ════════════════════════════════════════════════════════════ */

async function sectionChoose(host) {
  const tree = await data.load('shared/method-decision-tree');

  host.innerHTML = `
    <section class="section">
      <div class="section-head"><h2>Which method should I use?</h2>
        <span class="section-note">§30 · every answer states its limits</span></div>
      <p class="small" style="max-width:72ch;margin-bottom:1rem">
        Start from the question you actually have. Each answer says both what the technique can tell you
        and what it cannot — a recommendation without its limits is how methods get applied outside the
        conditions where they mean anything.
      </p>
      <div id="ec-tree"></div>
    </section>`;

  const h = renderTree(host.querySelector('#ec-tree'), tree);
  return { destroy() { h.destroy?.(); } };
}
