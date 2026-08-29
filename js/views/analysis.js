/**
 * EDMGLAB — Scan-rate analysis (Roadmap P6)
 *
 * ── WHAT MAKES THIS MORE THAN TWO CALCULATORS ──
 *
 * b-value analysis and Dunn deconvolution are the two most quoted numbers in
 * the supercapacitor literature, and both are routinely reported as though
 * they identified a mechanism. This page runs them, and shows the two things
 * a paper never shows you.
 *
 * ONE. Fitting b over 5–50 mV/s and over 50–500 mV/s gives DIFFERENT
 * exponents from the SAME data, with no confounder present and nothing wrong.
 * That is not noise: the current is k₁v + k₂√v, a SUM of two power laws, which
 * is not itself a power law. A single fitted exponent is a weighted average of
 * 0.5 and 1 over whichever rates were chosen. Change the rates, change the
 * average, change the conclusion.
 *
 * TWO. Dunn's capacitive fraction is stable across ranges when its two-term
 * model is actually the truth — and moves by up to nine points once a peak
 * drifts, a third process exists, or there is uncompensated resistance.
 * Nothing in its output distinguishes those two situations.
 *
 * The numbers in the simulated case are checked in tools/analysis-test.mjs
 * against a generator that plants the answer in advance: 39 assertions, and
 * the clean case recovers k₁(E) and k₂(E) to 1e-9.
 */

import { esc, pageHead, callout } from '../ui.js';
import { simWrap } from '../lib/sim-label.js';
import { chartCard } from '../lib/charts.js';
import * as A from '../echem/analysis.js';
import * as S from '../echem/sim/scanrate.js';
import * as csv from '../lib/csv.js';
import * as csvCore from '../lib/csv-core.js';
import * as data from '../data.js';

const RANGES = [
  { id: 'low', label: '5 – 50 mV/s', rates: [5, 10, 20, 50] },
  { id: 'high', label: '50 – 500 mV/s', rates: [50, 100, 200, 500] },
  { id: 'all', label: 'all seven rates', rates: [5, 10, 20, 50, 100, 200, 500] }
];

const CASES = [
  { id: 'clean', label: 'Nothing wrong', params: {},
    note: 'The forward branch IS i = k₁v + k₂√v, by construction. Dunn’s assumption is exactly true here, so this is the control.' },
  { id: 'third', label: 'A third process', params: { third: 1.6 },
    note: 'A process scaling as v^0.75 — between the two exponents the model knows. It has no bin, so the fit divides it between the two it has.' },
  { id: 'ir', label: 'Uncompensated resistance', params: { ru: 60 },
    note: '60 Ω between the reference and the working electrode. The potential the cell sees is shifted by i·R_u, so the distortion grows with scan rate.' },
  { id: 'drift', label: 'A drifting peak', params: { drift: 0.12 },
    note: 'The peak potential moves 120 mV per decade of scan rate — so a b fitted "at the peak" is comparing different points on different processes.' }
];

const REF_RATE = 50;   // the rate every reported fraction is quoted at

export async function render(outlet) {
  const state = { caseId: 'clean', rangeId: 'all', own: null };
  let cSeries = null, cLog = null, cDunn = null;

  outlet.innerHTML = `
    ${pageHead('Scan-rate analysis',
      'b-value and Dunn deconvolution, run on a series where the answer is known — and on your own.')}

    ${callout(`<strong>Neither of these analyses identifies a mechanism.</strong> b describes how current
      scales with scan rate; the Dunn fraction is the share of current a two-term model assigns to its
      first term. Both return a confident number from data that does not support one, and neither the
      value nor its R² will tell you when that has happened. What follows is built to show you when.`, 'warn')}

    <section class="section">
      <div class="section-head"><h2>The series</h2>
        <span class="section-note">seven scan rates · forward branch is what the analysis reads</span></div>
      <div class="an-grid">
        <div class="stack-sm">
          <div class="panel"><div class="panel-head">What is going on in this electrode</div>
            <div class="panel-body">
              <div class="seg an-seg" role="radiogroup" aria-label="Confounder">
                ${CASES.map((c) => `<button type="button" class="seg-b${c.id === 'clean' ? ' is-active' : ''}"
                  data-case="${c.id}" role="radio" aria-checked="${c.id === 'clean'}">${esc(c.label)}</button>`).join('')}
              </div>
              <p class="xsmall muted" style="margin:.6rem 0 0" id="an-casenote"></p>
            </div></div>

          <div class="panel"><div class="panel-head">Scan rates used for the fit</div>
            <div class="panel-body">
              <div class="seg an-seg" role="radiogroup" aria-label="Fitting range">
                ${RANGES.map((r) => `<button type="button" class="seg-b${r.id === 'all' ? ' is-active' : ''}"
                  data-range="${r.id}" role="radio" aria-checked="${r.id === 'all'}">${esc(r.label)}</button>`).join('')}
              </div>
              <p class="xsmall muted" style="margin:.6rem 0 0">Every rate is measured. This chooses which
                of them the fits are allowed to see — the choice a person makes silently, and never reports.</p>
            </div></div>
        </div>
        <div id="an-series"></div>
      </div>
    </section>

    <section class="section">
      <div class="section-head"><h2>b-value</h2>
        <span class="section-note">log|i<sub>p</sub>| against log v, at the anodic peak</span></div>
      <div class="an-grid">
        <div id="an-log"></div>
        <div id="an-bpanel" class="stack-sm"></div>
      </div>
    </section>

    <section class="section">
      <div class="section-head"><h2>Dunn deconvolution</h2>
        <span class="section-note">i(v) = k₁v + k₂√v solved at every potential</span></div>
      <div class="an-grid">
        <div id="an-dunnplot"></div>
        <div id="an-dunnpanel" class="stack-sm"></div>
      </div>
    </section>

    <section class="section" id="an-diag"></section>

    <section class="section">
      <div class="section-head"><h2>What these numbers do not license</h2>
        <span class="section-note">to be read before writing either of them down</span></div>
      <div class="cols">
        <div class="panel"><div class="panel-head">b-value</div><div class="panel-body">
          <ul class="lim-list warn">${A.LIMITS.bValue.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
        </div></div>
        <div class="panel"><div class="panel-head">Dunn capacitive fraction</div><div class="panel-body">
          <ul class="lim-list warn">${A.LIMITS.dunn.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
        </div></div>
      </div>
    </section>

    <section class="section" id="an-own"></section>

    <style>
      .an-grid { display:grid; gap:1rem; grid-template-columns:1fr; align-items:start; }
      @media (min-width:1000px){ .an-grid { grid-template-columns:minmax(0,1.35fr) minmax(0,1fr); } }
      @media (min-width:1000px){ #an-series, #an-log, #an-dunnplot { order:2; } }
      .an-seg { flex-wrap:wrap; }
      .an-num { font-family:var(--font-mono); font-size:var(--fs-xl); font-weight:700; line-height:1.1; }
      .an-num.mut { color:var(--text-muted); }
      .an-sub { font-size:var(--fs-xs); color:var(--text-muted); margin-top:.15rem; }
      .an-rows { display:grid; gap:.5rem; }
      .an-row { display:flex; gap:.6rem; align-items:baseline; justify-content:space-between;
                padding:.45rem .6rem; border-radius:var(--r-sm); background:var(--surface-2); }
      .an-row.is-on { background:var(--accent-wash); border:1px solid var(--accent); }
      .an-row .l { font-size:var(--fs-sm); }
      .an-row .v { font-family:var(--font-mono); font-weight:700; }
      .an-spread { font-family:var(--font-mono); font-weight:700; color:var(--warn); }
      .an-drop { border:2px dashed var(--border); border-radius:var(--r-md); background:var(--surface);
                 padding:1.5rem 1.25rem; text-align:center; cursor:pointer; margin:1rem 0;
                 transition:border-color var(--dur-fast), background var(--dur-fast); }
      .an-drop:hover, .an-drop.is-over { border-color:var(--accent); background:var(--accent-wash); }
      .an-drop:focus-visible { border-color:var(--accent); background:var(--accent-wash);
                               outline:2px solid var(--accent); outline-offset:3px; }
      .an-files { display:grid; gap:.5rem; margin-top:1rem; }
      .an-file { display:flex; gap:.6rem; align-items:center; flex-wrap:wrap;
                 padding:.5rem .65rem; background:var(--surface-2); border-radius:var(--r-sm); }
      .an-file .nm { font-size:var(--fs-sm); flex:1 1 12rem; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .an-file input { width:7rem; font-family:var(--font-mono); font-size:var(--fs-sm);
                       background:var(--surface); color:var(--text); border:1px solid var(--border);
                       border-radius:var(--r-sm); padding:.3rem .45rem; min-height:34px; }
      .an-issue { display:grid; gap:.25rem; padding:.7rem .85rem; border-left:3px solid var(--border);
                  background:var(--surface-2); border-radius:0 var(--r-sm) var(--r-sm) 0; }
      .an-issue.error { border-left-color:var(--danger); }
      .an-issue.warn  { border-left-color:var(--warn); }
      .an-issue h3 { font-size:var(--fs-sm); margin:0; }
      .an-issue p { font-size:var(--fs-xs); color:var(--text-2); margin:0; max-width:74ch; }
    </style>`;

  const $ = (s) => outlet.querySelector(s);

  /* ── controls ── */
  outlet.querySelectorAll('[data-case]').forEach((b) => b.addEventListener('click', () => {
    state.caseId = b.dataset.case;
    outlet.querySelectorAll('[data-case]').forEach((x) => {
      const on = x === b;
      x.classList.toggle('is-active', on);
      x.setAttribute('aria-checked', String(on));
    });
    draw();
  }));
  outlet.querySelectorAll('[data-range]').forEach((b) => b.addEventListener('click', () => {
    state.rangeId = b.dataset.range;
    outlet.querySelectorAll('[data-range]').forEach((x) => {
      const on = x === b;
      x.classList.toggle('is-active', on);
      x.setAttribute('aria-checked', String(on));
    });
    draw();
  }));

  await renderOwn(outlet, () => draw());
  await draw();

  /* ══════════════════════════════════════════════════════
     One pass: generate (or take) the series, analyse, render
     ══════════════════════════════════════════════════════ */
  async function draw() {
    const kase = CASES.find((c) => c.id === state.caseId);
    const range = RANGES.find((r) => r.id === state.rangeId);
    $('#an-casenote').textContent = kase.note;

    const measured = state.own;                       // the user's files, if any
    const curves = measured
      ? measured.curves
      : S.series(range.rates, kase.params);
    const fitCurves = measured
      ? measured.curves
      : S.series(range.rates, kase.params);

    /* ── series plot ── */
    const host = $('#an-series');
    host.innerHTML = '';
    /* simWrap paints the "Simulated" banner and the model's own assumptions,
       and REFUSES to render a simulator that does not declare them. The user's
       own data is not simulated, so it is mounted directly — and the plot title
       below is the only thing that changes, deliberately: a reader must never
       have to work out which of the two they are looking at. */
    const wrap = measured
      ? host
      : simWrap(host, { simulationBasis: S.BASIS }).body;
    cSeries = await chartCard(wrap, {
      title: measured ? 'Your voltammograms' : 'Simulated series',
      xLabel: 'Potential  E  (V)',
      yLabel: 'Current  i  (mA)',
      hint: 'The analysis reads the forward (left-to-right) branch only — a potential is passed twice, and averaging the two is meaningless.',
      datasets: curves.map((c) => ({ label: `${c.scanRate} mV/s`, data: c.points, borderWidth: 1.6 }))
    });

    /* ── b-value ── */
    const peakPts = fitCurves.map((c) => {
      const pk = A.peaks(c.points).anodic;
      return { scanRate: c.scanRate, current: pk ? pk.current : NaN };
    });
    const fit = A.bValue(peakPts);

    const lh = $('#an-log');
    lh.innerHTML = '';
    const logPts = peakPts.filter((p) => Number.isFinite(p.current) && p.current > 0)
      .map((p) => ({ x: Math.log10(p.scanRate), y: Math.log10(Math.abs(p.current)) }));
    const lineX = logPts.length ? [Math.min(...logPts.map((p) => p.x)), Math.max(...logPts.map((p) => p.x))] : [0, 1];
    cLog = await chartCard(lh, {
      title: 'Peak current against scan rate',
      xLabel: 'log₁₀ v   (v in mV/s)',
      yLabel: 'log₁₀ |i_p|   (i_p in mA)',
      hint: 'A power law is a straight line here. Curvature means no single exponent describes this electrode over this range.',
      datasets: [
        { label: 'peak current', data: logPts, showLine: false, pointRadius: 4 },
        ...(fit.usable ? [{
          label: `fit, b = ${fit.b.toFixed(3)}`,
          data: lineX.map((x) => ({ x, y: fit.b * x + Math.log10(fit.a) })),
          color: 'var(--series-5)', dashed: true, borderWidth: 2
        }] : [])
      ]
    });

    // b across ALL THREE ranges — the demonstration, always visible.
    const bAcross = measured ? null : RANGES.map((r) => {
      const cs = S.series(r.rates, kase.params);
      const f = A.bValue(cs.map((c) => {
        const pk = A.peaks(c.points).anodic;
        return { scanRate: c.scanRate, current: pk ? pk.current : NaN };
      }));
      return { id: r.id, label: r.label, b: f.b };
    });
    const bSpread = bAcross ? Math.max(...bAcross.map((x) => x.b)) - Math.min(...bAcross.map((x) => x.b)) : 0;

    $('#an-bpanel').innerHTML = `
      <div class="panel"><div class="panel-head">Fitted exponent</div><div class="panel-body">
        <div class="an-num">b = ${fit.usable ? fit.b.toFixed(3) : '—'}${
          Number.isFinite(fit.seB) ? ` <span class="an-num mut" style="font-size:var(--fs-md)">± ${fit.seB.toFixed(3)}</span>` : ''}</div>
        <div class="an-sub">R² = ${Number.isFinite(fit.r2) ? fit.r2.toFixed(4) : '—'} ·
          ${fit.n} rate${fit.n === 1 ? '' : 's'} · ${fit.decades.toFixed(2)} decades</div>
        <p class="xsmall muted" style="margin:.7rem 0 0">
          0.5 is what semi-infinite diffusion gives. 1.0 is what a current proportional to scan rate gives —
          double-layer charging, surface-confined redox, or a response limited by resistance. Anything between
          is a mixture, a regime change, or an artefact, and this number cannot tell you which.</p>
      </div></div>

      ${bAcross ? `
      <div class="panel"><div class="panel-head">The same data, three defensible ranges</div><div class="panel-body">
        <div class="an-rows">
          ${bAcross.map((x) => `<div class="an-row${x.id === state.rangeId ? ' is-on' : ''}">
            <span class="l">${esc(x.label)}</span><span class="v">b = ${x.b.toFixed(3)}</span></div>`).join('')}
        </div>
        <p class="xsmall" style="margin:.75rem 0 0">
          Spread: <span class="an-spread">${bSpread.toFixed(3)}</span>.
          ${bSpread > 0.05 ? `Nothing changed but which scan rates the fit was allowed to see. The peak current is
            k₁v + k₂√v — a <em>sum</em> of two power laws, which is not itself a power law — so a single exponent
            is a weighted average of 0.5 and 1 over the range chosen. This happens with nothing wrong at all.`
            : 'Narrow here, which is what a single-process electrode looks like.'}</p>
      </div></div>` : ''}`;

    /* ── Dunn ── */
    const sweep = A.dunnSweep(fitCurves, { samples: 140 });
    const dh = $('#an-dunnplot');
    dh.innerHTML = '';

    let fracHere = NaN, dunnAcross = null, dSpread = 0;
    if (sweep) {
      fracHere = windowFraction(sweep, REF_RATE);
      const shown = fitCurves.find((c) => c.scanRate === REF_RATE) || fitCurves[Math.floor(fitCurves.length / 2)];
      cDunn = await chartCard(dh, {
        title: `Separation at ${shown.scanRate} mV/s`,
        xLabel: 'Potential  E  (V)',
        yLabel: 'Current  i  (mA)',
        hint: 'The shaded line is the current the model assigns to its v-term. It is a model output, not a measured curve.',
        datasets: [
          { label: `measured, ${shown.scanRate} mV/s`, data: shown.points, borderWidth: 1.6 },
          { label: 'model total', data: sweep.modelAt(shown.scanRate), color: 'var(--series-3)', dashed: true, borderWidth: 2 },
          { label: 'k₁·v  (the "capacitive" term)', data: sweep.atRate(shown.scanRate), color: 'var(--series-5)', borderWidth: 2 }
        ]
      });

      if (!measured) {
        dunnAcross = RANGES.map((r) => {
          const sw = A.dunnSweep(S.series(r.rates, kase.params), { samples: 100 });
          return { id: r.id, label: r.label, f: sw ? windowFraction(sw, REF_RATE) : NaN };
        });
        const fs = dunnAcross.map((x) => x.f).filter(Number.isFinite);
        dSpread = fs.length ? Math.max(...fs) - Math.min(...fs) : 0;
      }
    } else {
      dh.innerHTML = callout('At least three scan rates are needed to solve for k₁ and k₂.', 'warn');
    }

    $('#an-dunnpanel').innerHTML = !sweep ? '' : `
      <div class="panel"><div class="panel-head">Reported capacitive fraction</div><div class="panel-body">
        <div class="an-num">${(100 * fracHere).toFixed(1)}%</div>
        <div class="an-sub">quoted at ${REF_RATE} mV/s, over
          ${sweep.window[0].toFixed(2)} to ${sweep.window[1].toFixed(2)} V</div>
        <p class="xsmall muted" style="margin:.7rem 0 0">
          This is the share of current that i = k₁v + k₂√v assigns to k₁v. It is arithmetic on a fitted model,
          not a measurement of a double layer — and the model has exactly two bins for however many processes
          the electrode has.</p>
      </div></div>

      ${dunnAcross ? `
      <div class="panel"><div class="panel-head">The same data, three defensible ranges</div><div class="panel-body">
        <div class="an-rows">
          ${dunnAcross.map((x) => `<div class="an-row${x.id === state.rangeId ? ' is-on' : ''}">
            <span class="l">${esc(x.label)}</span>
            <span class="v">${Number.isFinite(x.f) ? (100 * x.f).toFixed(1) + '%' : '—'}</span></div>`).join('')}
        </div>
        <p class="xsmall" style="margin:.75rem 0 0">
          Spread: <span class="an-spread">${(100 * dSpread).toFixed(1)} points</span>.
          ${state.caseId === 'clean'
            ? `Almost nothing — because here the two-term model is <em>exactly</em> the truth. This is what the
               method looks like when its assumption holds. Now switch on any of the other three cases above.`
            : `The assumption behind the model is not true in this case, so the fitted k₁ and k₂ depend on which
               rates went into them — and the percentage quoted at a fixed ${REF_RATE} mV/s moves with a choice
               nobody reports. Nothing in the output distinguishes this from the clean case.`}</p>
      </div></div>` : ''}`;

    /* ── diagnostics ── */
    const issues = A.diagnose({ fit, curves: fitCurves, sweep });
    $('#an-diag').innerHTML = `
      <div class="section-head"><h2>Diagnostics</h2>
        <span class="section-note">${issues.length ? `${issues.length} to consider` : 'nothing flagged'}</span></div>
      ${issues.length
        ? `<div class="an-rows">${issues.map((i) => `
            <div class="an-issue ${esc(i.level)}">
              <h3>${esc(i.title)}</h3>
              <p>${esc(i.detail)}</p>
            </div>`).join('')}</div>`
        : callout(`<strong>Nothing flagged.</strong> Every check passed — enough scan rates, a wide enough range,
            a power law that holds, a stationary peak, and a two-term fit that does not contradict itself.
            That makes the numbers <em>reportable</em>. It does not make them a mechanism.`, 'ok')}`;
  }

  /* ── the user's own files ── */
  async function renderOwn(root, onChange) {
    const sec = root.querySelector('#an-own');
    sec.innerHTML = `
      <div class="section-head"><h2>Your own scan-rate series</h2>
        <span class="section-note">several CV exports at once · nothing leaves this browser tab</span></div>
      <p class="small" style="max-width:76ch">
        Select or drop the voltammograms from one series — one file per scan rate. The scan rate is read from
        the file name when it contains something like <code>50mVs</code>; correct any it gets wrong before
        analysing. Every plot and every number above then comes from your data instead of the simulation.
      </p>
      <div class="an-drop" id="an-drop" tabindex="0" role="button"
           aria-label="Choose voltammogram files, or drop them here">
        <strong>Drop your CV files here</strong><br>
        <span class="small muted">or click to choose · one file per scan rate</span>
      </div>
      <input type="file" id="an-input" accept=".csv,.tsv,.txt,.dat,text/csv,text/plain" multiple hidden>
      <div class="an-files" id="an-list"></div>`;

    const drop = sec.querySelector('#an-drop');
    const input = sec.querySelector('#an-input');
    const list = sec.querySelector('#an-list');

    drop.addEventListener('click', () => input.click());
    drop.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
    });
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => {
      e.preventDefault(); drop.classList.add('is-over');
    }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('is-over')));
    drop.addEventListener('drop', (e) => { e.preventDefault(); take([...e.dataTransfer.files]); });
    input.addEventListener('change', () => take([...input.files]));

    async function take(files) {
      if (!files.length) return;
      list.innerHTML = `<div class="loading-row"><span class="spinner"></span> Reading ${files.length} file(s)…</div>`;
      const profiles = await data.load('import-profiles').catch(() => ({}));
      const loaded = [];
      for (const f of files) {
        try {
          const text = await csv.readFile(f);
          const det = await csv.parse(text, profiles);
          const pts = pointsFrom(det);
          loaded.push({ name: f.name, scanRate: rateFromName(f.name), points: pts, rows: pts.length });
        } catch (err) {
          loaded.push({ name: f.name, error: err.message });
        }
      }
      state.pending = loaded;
      paint();
    }

    function paint() {
      const L = state.pending || [];
      list.innerHTML = `
        ${L.map((f, i) => `
          <div class="an-file">
            <span class="nm">${esc(f.name)}</span>
            ${f.error
              ? `<span class="small" style="color:var(--danger)">${esc(f.error)}</span>`
              : `<span class="small muted">${f.rows} points</span>
                 <label class="xsmall muted" for="an-r${i}">scan rate, mV/s</label>
                 <input id="an-r${i}" type="number" min="0" step="any" data-i="${i}"
                        value="${f.scanRate ?? ''}" placeholder="?">`}
          </div>`).join('')}
        <div class="sg-actions" style="display:flex;gap:.6rem;flex-wrap:wrap;align-items:center;margin-top:.4rem">
          <button type="button" class="btn btn-primary" id="an-use">Analyse these</button>
          <button type="button" class="btn" id="an-clear">Back to the simulation</button>
          <span class="small muted" id="an-own-msg"></span>
        </div>`;

      list.querySelectorAll('input[data-i]').forEach((inp) => inp.addEventListener('input', () => {
        const v = parseFloat(inp.value);
        state.pending[+inp.dataset.i].scanRate = Number.isFinite(v) ? v : null;
      }));

      list.querySelector('#an-use').addEventListener('click', () => {
        const good = (state.pending || []).filter((f) => !f.error && f.points.length > 3 &&
                                                          Number.isFinite(f.scanRate) && f.scanRate > 0);
        const msg = list.querySelector('#an-own-msg');
        if (good.length < 3) {
          msg.style.color = 'var(--danger)';
          msg.textContent = `${good.length} usable file(s). Three scan rates is the minimum to solve for k₁ and k₂, and four is the minimum worth reporting.`;
          return;
        }
        good.sort((a, b) => a.scanRate - b.scanRate);
        state.own = { curves: good.map((f) => ({ scanRate: f.scanRate, points: f.points })) };
        msg.style.color = '';
        msg.textContent = `Analysing ${good.length} files. Everything above is now your data.`;
        onChange();
        root.querySelector('#an-series')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });

      list.querySelector('#an-clear').addEventListener('click', () => {
        state.own = null; state.pending = null; list.innerHTML = ''; input.value = ''; onChange();
      });
    }
  }

  return {
    destroy() {
      [cSeries, cLog, cDunn].forEach((c) => { try { c?.destroy?.(); } catch { /* already gone */ } });
    }
  };
}

/* ── helpers ─────────────────────────────────────────────── */

/** The window-averaged capacitive share the model assigns, at one scan rate. */
function windowFraction(sweep, rate) {
  const v = rate / 1000;
  let cap = 0, dif = 0;
  for (let i = 0; i < sweep.potentials.length; i++) {
    if (!Number.isFinite(sweep.k1[i]) || !Number.isFinite(sweep.k2[i])) continue;
    cap += Math.abs(sweep.k1[i] * v);
    dif += Math.abs(sweep.k2[i] * Math.sqrt(v));
  }
  return cap + dif > 0 ? cap / (cap + dif) : NaN;
}

/**
 * Pull the scan rate out of a file name.
 * Recognises 50mVs, 50_mV_s, 100 mV-s⁻¹, scan50, v50 — and returns null rather
 * than a guess when it finds nothing, because a wrong scan rate silently
 * corrupts every number on this page.
 */
export function rateFromName(name) {
  const n = String(name);
  const m = n.match(/(\d+(?:[.,]\d+)?)\s*[_-]?\s*m\s*v\s*[\/_ -]?\s*s/i)
         || n.match(/(?:^|[^a-z0-9])(?:v|scan|sr)[_-]?(\d+(?:[.,]\d+)?)(?:[^0-9]|$)/i);
  if (!m) return null;
  const v = parseFloat(m[1].replace(',', '.'));
  return Number.isFinite(v) && v > 0 ? v : null;
}

/**
 * Potential and current columns out of a parsed CSV.
 *
 * Goes through csv-core's own `series()` so the unit factors that the importer
 * detected are applied here too — a column labelled mA and a column labelled A
 * differ by a thousand, and a scan-rate analysis run on the wrong one produces
 * a k₁ that is wrong by the same factor while looking entirely normal.
 * `series()` returns SI, so amps; converted to mA to match the axis label and
 * the simulated case.
 */
function pointsFrom(det) {
  const cols = det.columns || [];
  const E = cols.find((c) => c.role === 'voltage');
  const I = cols.find((c) => c.role === 'current');
  if (!E || !I) {
    throw new Error('no potential and current columns recognised — map them by hand in Data Import first');
  }
  const s = csvCore.series(E, I, E.unit, I.unit);
  return s.points.map((p) => ({ x: p.x, y: p.y * 1000 }));   // A → mA
}
