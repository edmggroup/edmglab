/**
 * EDMGLAB — Protocol builder (Instrumentation spec §10) + voltage–time graph (§8)
 *
 * "BUILD YOUR TEST PROTOCOL" — assemble REST → CHARGE → CV → REST → DISCHARGE
 * → REST → LOOP, set the parameters, and see the resulting schedule as a
 * timeline, a structured summary and a schematic voltage–time preview.
 *
 * ── WHAT THIS IS AND IS NOT ──
 * Spec §10 requires this to be labelled an EDUCATIONAL PROTOCOL SIMULATOR, and
 * that requirement is taken seriously here rather than parked in a footnote:
 *
 *   · The voltage–time preview is drawn from a schematic shape, not from any
 *     model of a real cell. It goes through sim-label.js, so it can never
 *     appear without the "Illustrative simulation" banner.
 *   · Step durations are ARITHMETIC ESTIMATES from the C-rate (a 1C step
 *     nominally takes one hour), not predictions. A real cell will differ.
 *   · A generated protocol is NOT automatically appropriate for any given
 *     chemistry, electrode, cell design or voltage window. The voltage limits
 *     in particular must come from the chemistry you are actually working on.
 */

import { esc } from '../ui.js';
import { simWrap } from '../lib/sim-label.js';
import { chartCard } from '../lib/charts.js';

/* ── Step catalogue ──────────────────────────────────────── */

const STEP_TYPES = {
  rest: {
    label: 'Rest', short: 'REST', colour: 'var(--text-muted)',
    purpose: 'No current flows. The cell relaxes towards its equilibrium potential.',
    params: [{ key: 'minutes', label: 'Duration', unit: 'min', def: 30, min: 0 }]
  },
  cc_charge: {
    label: 'CC charge', short: 'CC ↑', colour: 'var(--series-1)',
    purpose: 'Constant current until the upper voltage limit is reached.',
    params: [
      { key: 'rate', label: 'C-rate', unit: 'C', def: 0.1, min: 0.001, step: 0.01 },
      { key: 'vMax', label: 'Upper limit', unit: 'V', def: 1.0, step: 0.01 },
      { key: 'timeLimit', label: 'Time limit', unit: 'min', def: 900, min: 1 }
    ]
  },
  cv_hold: {
    label: 'CV hold', short: 'CV', colour: 'var(--series-3)',
    purpose: 'Hold the voltage and let the current decay to a threshold.',
    params: [
      { key: 'vHold', label: 'Hold at', unit: 'V', def: 1.0, step: 0.01 },
      { key: 'iCut', label: 'Cutoff current', unit: 'C', def: 0.01, min: 0.0001, step: 0.001 },
      { key: 'timeLimit', label: 'Time limit', unit: 'min', def: 120, min: 1 }
    ]
  },
  cc_discharge: {
    label: 'CC discharge', short: 'CC ↓', colour: 'var(--series-2)',
    purpose: 'Constant current until the lower voltage limit is reached.',
    params: [
      { key: 'rate', label: 'C-rate', unit: 'C', def: 0.1, min: 0.001, step: 0.01 },
      { key: 'vMin', label: 'Lower limit', unit: 'V', def: 0.0, step: 0.01 },
      { key: 'timeLimit', label: 'Time limit', unit: 'min', def: 900, min: 1 }
    ]
  }
};

/** The §5 workflow sequence, preloaded so the page is useful immediately. */
const DEFAULT_STEPS = [
  { type: 'rest' },
  { type: 'cc_charge' },
  { type: 'cv_hold' },
  { type: 'rest', minutes: 10 },
  { type: 'cc_discharge' },
  { type: 'rest', minutes: 10 }
];

function withDefaults(s) {
  const spec = STEP_TYPES[s.type];
  const out = { type: s.type };
  for (const p of spec.params) out[p.key] = s[p.key] ?? p.def;
  return out;
}

/** Arithmetic duration estimate in minutes. NOT a prediction. */
function estimateMinutes(step) {
  switch (step.type) {
    case 'rest': return Math.max(0, step.minutes);
    // A step at rate C nominally moves the full nominal capacity in 1/C hours.
    // Real steps end early on a voltage limit, so this is an upper bound.
    case 'cc_charge':
    case 'cc_discharge': return Math.min(step.timeLimit, (1 / Math.max(step.rate, 1e-6)) * 60);
    case 'cv_hold': return step.timeLimit;
    default: return 0;
  }
}

/* ── View ────────────────────────────────────────────────── */

export function render(mount) {
  let steps = DEFAULT_STEPS.map(withDefaults);
  let cycles = 3;
  let tempLimit = 45;
  let chartHandle = null;

  mount.innerHTML = `
    <div class="callout callout-warn" style="margin-bottom:1rem">
      <strong>Educational protocol simulator.</strong> This builds and visualises a schedule so you can
      see how the steps fit together. It does <em>not</em> validate it: a protocol generated here is not
      automatically suitable for any particular chemistry, electrode, cell design or voltage window.
      Voltage limits especially must come from the system you are actually working on.
    </div>

    <div class="pb-grid">
      <div class="panel">
        <div class="panel-head">Steps<span style="flex:1"></span>
          <span class="xsmall muted" id="pb-count"></span></div>
        <div class="panel-body">
          <div id="pb-steps" class="stack-sm"></div>

          <div class="pb-add">
            <span class="field-label" style="width:100%">Add a step</span>
            ${Object.entries(STEP_TYPES).map(([k, v]) =>
              `<button type="button" class="btn btn-sm" data-add="${k}">+ ${esc(v.label)}</button>`).join('')}
          </div>

          <div class="pb-global">
            <label class="field">
              <span class="field-label">Repeat whole sequence <span class="muted">(LOOP)</span></span>
              <input type="number" id="pb-cycles" min="1" max="9999" value="${cycles}">
            </label>
            <label class="field">
              <span class="field-label">Temperature limit</span>
              <input type="number" id="pb-temp" min="0" max="200" value="${tempLimit}">
            </label>
          </div>
          <p class="xsmall muted" style="margin:.6rem 0 0">
            A temperature limit is a safety cutoff, not a target. Every step should also carry a time
            limit as a backstop in case its own condition is never met.
          </p>
        </div>
      </div>

      <div class="stack">
        <div class="panel">
          <div class="panel-head">Timeline — one cycle</div>
          <div class="panel-body">
            <div id="pb-timeline" class="pb-timeline"></div>
            <div id="pb-legend" class="pb-legend"></div>
          </div>
        </div>
        <div id="pb-chart"></div>
      </div>
    </div>

    <section class="section" style="margin-top:1.5rem">
      <div class="section-head"><h3 style="margin:0;font-size:var(--fs-md)">Protocol summary</h3>
        <span class="section-note">what you would enter into the instrument</span></div>
      <div id="pb-summary"></div>
    </section>

    <style>
      .pb-grid { display:grid; gap:1rem; grid-template-columns:minmax(300px,1fr) minmax(320px,1.15fr); align-items:start; }
      @media (max-width:900px){ .pb-grid { grid-template-columns:1fr; } }
      .pb-step { border:1px solid var(--border); border-radius:var(--r-md); background:var(--surface-2); overflow:hidden; }
      .pb-step-head { display:flex; align-items:center; gap:.5rem; padding:.45rem .6rem; border-bottom:1px solid var(--border); }
      .pb-dot { width:9px; height:9px; border-radius:2px; flex:none; }
      .pb-step-name { font-size:var(--fs-sm); font-weight:600; flex:1; }
      .pb-step-body { display:grid; gap:.5rem; grid-template-columns:repeat(auto-fit,minmax(96px,1fr)); padding:.55rem .6rem; }
      .pb-step-body .field-label { font-size:var(--fs-2xs); }
      .pb-step-body input { padding:.3rem .45rem; min-height:30px; font-family:var(--font-mono); font-size:var(--fs-sm);
        background:var(--surface); color:var(--text); border:1px solid var(--border); border-radius:var(--r-sm); width:100%; }
      /* 24×24 is the WCAG 2.2 AA minimum target size, and these three sit
         side by side — an 18px reorder button next to a delete button is a
         mis-tap waiting to happen on a phone at the bench. */
      .pb-mini { background:none; border:0; color:var(--text-muted); cursor:pointer; font-size:1rem; line-height:1;
        min-width:26px; min-height:26px; display:inline-flex; align-items:center; justify-content:center;
        padding:2px 5px; border-radius:var(--r-sm); }
      .pb-mini:hover { background:var(--surface-3); color:var(--text); }
      .pb-mini:disabled { opacity:.3; cursor:not-allowed; }
      .pb-add { display:flex; flex-wrap:wrap; gap:.4rem; margin-top:.8rem; padding-top:.8rem; border-top:1px solid var(--border); }
      .pb-global { display:grid; gap:.7rem; grid-template-columns:1fr 1fr; margin-top:.9rem; padding-top:.9rem; border-top:1px solid var(--border); }
      .pb-global input { background:var(--surface-2); color:var(--text); border:1px solid var(--border);
        border-radius:var(--r-sm); padding:.4rem .5rem; min-height:34px; font-family:var(--font-mono); width:100%; }
      .pb-timeline { display:flex; height:40px; border-radius:var(--r-sm); overflow:hidden; border:1px solid var(--border); background:var(--bg); }
      .pb-seg { display:flex; align-items:center; justify-content:center; min-width:2px;
        font-size:var(--fs-2xs); font-family:var(--font-mono); font-weight:700; color:var(--bg); overflow:hidden; white-space:nowrap; }
      .pb-legend { display:flex; flex-wrap:wrap; gap:.35rem .9rem; margin-top:.6rem; font-size:var(--fs-xs); color:var(--text-muted); }
      .pb-legend span { display:inline-flex; align-items:center; gap:.35rem; }
      .pb-empty { padding:1.2rem; text-align:center; color:var(--text-muted); font-size:var(--fs-sm); }
    </style>`;

  const $ = (s) => mount.querySelector(s);

  /* ── Steps list ── */
  function drawSteps() {
    const host = $('#pb-steps');
    $('#pb-count').textContent = `${steps.length} step${steps.length === 1 ? '' : 's'}`;
    if (!steps.length) {
      host.innerHTML = `<div class="pb-empty">No steps yet. Add one below.</div>`;
      return;
    }
    host.innerHTML = steps.map((s, i) => {
      const spec = STEP_TYPES[s.type];
      return `<div class="pb-step">
        <div class="pb-step-head">
          <span class="pb-dot" style="background:${spec.colour}"></span>
          <span class="pb-step-name">${i + 1}. ${esc(spec.label)}</span>
          <button type="button" class="pb-mini" data-up="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button>
          <button type="button" class="pb-mini" data-down="${i}" ${i === steps.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button>
          <button type="button" class="pb-mini" data-del="${i}" aria-label="Remove">✕</button>
        </div>
        <div class="pb-step-body">
          ${spec.params.map((p) => `
            <label class="field">
              <span class="field-label">${esc(p.label)} (${esc(p.unit)})</span>
              <input type="number" data-i="${i}" data-k="${p.key}"
                     value="${s[p.key]}" ${p.min !== undefined ? `min="${p.min}"` : ''}
                     step="${p.step ?? 1}">
            </label>`).join('')}
        </div>
      </div>`;
    }).join('');

    host.querySelectorAll('input[data-k]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const v = parseFloat(inp.value);
        if (!Number.isNaN(v)) { steps[+inp.dataset.i][inp.dataset.k] = v; redraw(); }
      });
    });
    host.querySelectorAll('[data-del]').forEach((b) =>
      b.addEventListener('click', () => { steps.splice(+b.dataset.del, 1); drawSteps(); redraw(); }));
    host.querySelectorAll('[data-up]').forEach((b) =>
      b.addEventListener('click', () => { const i = +b.dataset.up; [steps[i - 1], steps[i]] = [steps[i], steps[i - 1]]; drawSteps(); redraw(); }));
    host.querySelectorAll('[data-down]').forEach((b) =>
      b.addEventListener('click', () => { const i = +b.dataset.down; [steps[i + 1], steps[i]] = [steps[i], steps[i + 1]]; drawSteps(); redraw(); }));
  }

  mount.querySelectorAll('[data-add]').forEach((b) =>
    b.addEventListener('click', () => { steps.push(withDefaults({ type: b.dataset.add })); drawSteps(); redraw(); }));

  $('#pb-cycles').addEventListener('input', (e) => { cycles = Math.max(1, +e.target.value || 1); redraw(); });
  $('#pb-temp').addEventListener('input', (e) => { tempLimit = +e.target.value || 0; redraw(); });

  /* ── Timeline ── */
  function drawTimeline() {
    const durations = steps.map(estimateMinutes);
    const total = durations.reduce((a, b) => a + b, 0) || 1;
    $('#pb-timeline').innerHTML = steps.map((s, i) => {
      const spec = STEP_TYPES[s.type];
      const pct = (durations[i] / total) * 100;
      return `<div class="pb-seg" style="width:${pct}%;background:${spec.colour}"
               title="${esc(spec.label)} — about ${fmtMin(durations[i])}">${pct > 9 ? esc(spec.short) : ''}</div>`;
    }).join('') || '<div class="pb-empty" style="width:100%">No steps</div>';

    const seen = new Set();
    $('#pb-legend').innerHTML = steps.filter((s) => !seen.has(s.type) && seen.add(s.type))
      .map((s) => `<span><i class="pb-dot" style="background:${STEP_TYPES[s.type].colour}"></i>${esc(STEP_TYPES[s.type].label)}</span>`).join('')
      + `<span class="muted">one cycle ≈ ${fmtMin(total)} · ${cycles} cycle${cycles === 1 ? '' : 's'} ≈ ${fmtMin(total * cycles)}</span>`;
  }

  /* ── Summary ── */
  function drawSummary() {
    if (!steps.length) { $('#pb-summary').innerHTML = '<div class="pb-empty">Add a step to see the summary.</div>'; return; }
    const rows = steps.map((s, i) => {
      const spec = STEP_TYPES[s.type];
      const params = spec.params.map((p) => `${p.label} = ${s[p.key]} ${p.unit}`).join(' · ');
      const ctrl = s.type === 'rest' ? '—' : s.type === 'cv_hold' ? 'Voltage' : 'Current';
      const meas = s.type === 'rest' ? 'Voltage (OCV)' : s.type === 'cv_hold' ? 'Current' : 'Voltage';
      const end = s.type === 'rest' ? 'Time elapsed'
        : s.type === 'cv_hold' ? 'Current below cutoff, or time limit'
        : `Voltage limit reached, or time limit`;
      return `<tr>
        <td data-label="#" class="num">${i + 1}</td>
        <td data-label="Step"><strong>${esc(spec.label)}</strong><div class="xsmall muted">${esc(spec.purpose)}</div></td>
        <td data-label="Settings"><code class="xsmall">${esc(params)}</code></td>
        <td data-label="Controlled">${ctrl}</td>
        <td data-label="Measured">${meas}</td>
        <td data-label="Ends when">${esc(end)}</td>
      </tr>`;
    }).join('');

    $('#pb-summary').innerHTML = `
      <div class="table-wrap"><table class="stackable">
        <thead><tr><th>#</th><th>Step</th><th>Settings</th><th>Controlled</th><th>Measured</th><th>Ends when</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <div class="callout" style="margin-top:.8rem">
        <strong>Loop:</strong> repeat steps 1–${steps.length} × <strong>${cycles}</strong>.
        <strong>Safety:</strong> temperature limit ${tempLimit} °C.
        <br><span class="xsmall muted">C-rates are defined against the nominal capacity you enter on the instrument.
        If that value is wrong, every current in this table is wrong by the same factor — and so is every
        specific capacity you calculate afterwards.</span>
      </div>`;
  }

  /* ── Schematic V–t preview (§8) ── */
  async function drawChart() {
    const host = $('#pb-chart');
    host.innerHTML = '';
    if (!steps.length) return;
    if (chartHandle) { chartHandle.destroy?.(); chartHandle = null; }

    const { body } = simWrap(host, {
      simulationBasis: {
        model: 'Schematic voltage–time envelope for a step sequence',
        equations: [
          'CC step:  V rises (charge) or falls (discharge) monotonically between the limits, with an initial I·R offset',
          'CV hold:  V held constant; current decays towards the cutoff',
          'Rest:     V relaxes towards an equilibrium value'
        ],
        assumptions: [
          'The curve shapes are generic. They are NOT derived from any chemistry, electrode or cell model.',
          'Step durations are arithmetic estimates from the C-rate (a step at rate C nominally takes 1/C hours) and assume the step runs to completion.',
          'Real steps usually terminate early on their voltage or current condition, so the true timeline is shorter.',
          'No temperature effects, no ageing, no rate limitation, no polarisation beyond a single fixed I·R offset.'
        ],
        note: 'This preview exists to show the SHAPE of a schedule — where the plateaus, transitions and rests fall. It cannot predict what your cell will do.'
      }
    });

    const series = buildEnvelope(steps, cycles);
    chartHandle = await chartCard(body, {
      title: 'Schematic voltage vs time',
      xLabel: 'Time  (min, estimated)',
      yLabel: 'Voltage  (V)',
      datasets: [{ label: 'V (schematic)', data: series }],
      hint: 'Scroll or pinch to zoom · drag to pan · shape only, not a prediction'
    });
  }

  function redraw() { drawTimeline(); drawSummary(); drawChart(); }

  drawSteps();
  redraw();

  return {
    destroy() { chartHandle?.destroy?.(); }
  };
}

/* ── Envelope generation ─────────────────────────────────── */

function buildEnvelope(steps, cycles) {
  const pts = [];
  let t = 0;
  // Cap the preview so a 500-cycle protocol does not generate a useless
  // hairball — show the first few cycles and say so in the axis label.
  const shown = Math.min(cycles, 4);

  // A resting cell settles somewhere between the limits; the exact value is
  // chemistry-dependent, so the schematic just relaxes part-way.
  let v = lowerOf(steps);

  for (let c = 0; c < shown; c++) {
    for (const s of steps) {
      const mins = estimateMinutes(s);
      const n = Math.max(6, Math.min(90, Math.round(mins / 3)));
      for (let k = 0; k <= n; k++) {
        const f = k / n;
        let vv = v;
        if (s.type === 'cc_charge') {
          const lo = v, hi = s.vMax;
          vv = lo + 0.05 * (hi - lo) + (hi - lo) * 0.95 * Math.pow(f, 0.82);
        } else if (s.type === 'cv_hold') {
          vv = s.vHold;
        } else if (s.type === 'cc_discharge') {
          const hi = v, lo = s.vMin;
          vv = hi - 0.05 * (hi - lo) - (hi - lo) * 0.95 * Math.pow(f, 0.82);
        } else if (s.type === 'rest') {
          // Relax a little way back towards mid-window.
          const mid = (upperOf(steps) + lowerOf(steps)) / 2;
          vv = v + (mid - v) * 0.25 * f;
        }
        pts.push({ x: +(t + f * mins).toFixed(3), y: +vv.toFixed(4) });
      }
      t += mins;
      v = pts.length ? pts[pts.length - 1].y : v;
    }
  }
  return pts;
}

function upperOf(steps) {
  const vals = steps.map((s) => s.vMax ?? s.vHold).filter((x) => x !== undefined);
  return vals.length ? Math.max(...vals) : 1;
}
function lowerOf(steps) {
  const vals = steps.map((s) => s.vMin).filter((x) => x !== undefined);
  return vals.length ? Math.min(...vals) : 0;
}

function fmtMin(m) {
  if (m < 1) return '<1 min';
  if (m < 90) return `${Math.round(m)} min`;
  const h = m / 60;
  if (h < 48) return `${h.toFixed(1)} h`;
  return `${(h / 24).toFixed(1)} d`;
}
