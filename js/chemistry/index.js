/**
 * EDMGLAB — Storage chemistry (Roadmap P8)
 *
 * The CHEMISTRY/PHYSICS stage of the pathway: what actually happens when an
 * electrode stores charge, and what follows from it.
 *
 * ────────────────────────────────────────────────────────────────────────
 *  THE ARGUMENT THIS MODULE MAKES
 * ────────────────────────────────────────────────────────────────────────
 * "Capacitor-like" and "battery-like" are not two mechanisms with two
 * theories. They are one quantity — the differential capacitance dQ/dV —
 * being flat in one case and peaked in the other. The Signatures section
 * demonstrates that by generating the voltammogram AND the discharge curve
 * from the same function, side by side, from one set of parameters.
 *
 * The Quantity section then does the thing this module exists for. Applying
 * C = I·Δt/ΔV to a battery-type curve returns a number, and that number
 * depends entirely on the voltage window chosen — because there is no constant
 * capacitance to find. The page slides the window and shows the answer
 * changing by a factor of fifty, next to a real capacitor where it does not
 * change at all. Reporting F/g for a material with plateaus is the most
 * consequential reporting error in this field, and this is the demonstration
 * that makes it obvious rather than merely asserted.
 */

import { esc, pageHead, callout, notAuthored } from '../ui.js';
import * as data from '../data.js';
import { simWrap } from '../lib/sim-label.js';
import { chartCard } from '../lib/charts.js';
import { renderTree } from '../lib/decision-tree.js';
import { sig } from '../lib/expr.js';
import * as M from './sim/mechanism.js';

const SECTIONS = [
  { id: 'overview',   label: 'Overview' },
  { id: 'signatures', label: 'One model, both plots' },
  { id: 'quantity',   label: 'Capacitance or capacity?' },
  { id: 'mechanisms', label: 'Mechanisms' },
  { id: 'devices',    label: 'Devices' }
];

export async function render(outlet, ctx) {
  const payload = await data.load('electrochemistry');
  const items = payload.items || [];

  if (!items.length) {
    outlet.innerHTML = pageHead('Storage chemistry', '') + notAuthored('The storage chemistry content');
    return { destroy() {} };
  }

  const active = SECTIONS.some((s) => s.id === ctx?.params?.section) ? ctx.params.section : 'overview';
  let child = null;

  outlet.innerHTML = `
    ${pageHead('Storage chemistry',
      'What happens when an electrode stores charge, how each mechanism shows itself, and which quantity is valid to report.')}

    <nav class="tabbar" role="tablist" aria-label="Storage chemistry sections">
      ${SECTIONS.map((s) => `<a class="tab${s.id === active ? ' is-active' : ''}" role="tab"
        aria-selected="${s.id === active}" href="#/chemistry/${s.id}">${esc(s.label)}</a>`).join('')}
    </nav>

    <div id="cx-body"></div>
    <style>${CSS}</style>`;

  const host = outlet.querySelector('#cx-body');
  switch (active) {
    case 'signatures': child = await sectionSignatures(host); break;
    case 'quantity':   child = await sectionQuantity(host); break;
    case 'mechanisms': child = sectionMechanisms(host, items); break;
    case 'devices':    child = sectionDevices(host, payload); break;
    default:           child = await sectionOverview(host, payload, items); break;
  }

  return { destroy() { child?.destroy?.(); } };
}

/* ════════════════════════════════════════════════════════════
   Overview
   ════════════════════════════════════════════════════════════ */

async function sectionOverview(host, payload, items) {
  host.innerHTML = `
    ${callout(`<strong>Mechanisms are a continuum, not a set of boxes.</strong>
      ${esc(payload.preamble || '')}`, 'info')}

    <section class="section" style="margin-top:1.25rem">
      <div class="section-head"><h2>The spectrum</h2>
        <span class="section-note">ordered by how peaked dQ/dV is</span></div>
      <div class="cx-spectrum">
        ${items.map((m, i) => `<a class="cx-sp" href="#/chemistry/mechanisms" data-jump="${esc(m.id)}"
           style="--i:${i}">
          <span class="cx-sp-f">${esc(m.family)}</span>
          <span class="cx-sp-n">${esc(m.short || m.name)}</span>
          <span class="cx-sp-d">${esc(m.dQdV)}</span>
        </a>`).join('')}
      </div>
      <p class="xsmall muted" style="margin-top:.75rem">
        Left to right: flat differential capacitance to sharply peaked. The electrochemistry, the
        rate behaviour, the degradation route and the quantity you may report all follow from where a
        material sits on this axis.
      </p>
    </section>

    <section class="section">
      <div class="section-head"><h2>Why it decides what you may report</h2></div>
      <div class="table-wrap"><table class="stackable">
        <thead><tr><th>Mechanism</th><th>Discharge curve</th><th>Report</th></tr></thead>
        <tbody>${items.map((m) => `<tr>
          <td data-label="Mechanism"><strong>${esc(m.short || m.name)}</strong></td>
          <td data-label="Discharge curve">${esc(m.inGCD)}</td>
          <td data-label="Report">${esc(m.quantityToReport)}</td>
        </tr>`).join('')}</tbody>
      </table></div>
    </section>

    ${callout(`<strong>See it for yourself.</strong>
      <a href="#/chemistry/signatures">One model generates both the voltammogram and the discharge curve</a> —
      and <a href="#/chemistry/quantity">the same model shows what happens when you report a capacitance
      for something that does not have one</a>.`, 'ok')}`;
  return { destroy() {} };
}

/* ════════════════════════════════════════════════════════════
   Signatures — one model, both plots
   ════════════════════════════════════════════════════════════ */

async function sectionSignatures(host) {
  let preset = 'edlc';
  const custom = { ...clone(M.PRESETS.edlc) };
  let cDC = null, cCV = null, cGCD = null;

  host.innerHTML = `
    <section class="section">
      <div class="section-head"><h2>One model, both plots</h2>
        <span class="section-note">the rectangle and the plateau are the same object</span></div>
      <p class="small" style="max-width:78ch;margin-bottom:1rem">
        All three plots below come from a single function — the differential capacitance dQ/dV. The
        voltammogram is that function multiplied by the scan rate; the discharge curve is its integral
        divided by the current. Change the shape of dQ/dV and watch both observables follow. Nothing is
        adjusted independently, because in a real electrode nothing is.
      </p>

      <div class="cx-presets" role="radiogroup" aria-label="Mechanism">
        ${Object.entries(M.PRESETS).map(([k, v]) => `<button type="button"
          class="cx-preset${k === preset ? ' is-on' : ''}" role="radio"
          aria-checked="${k === preset}" data-preset="${esc(k)}">
          <span class="pl">${esc(v.label)}</span><span class="pn">${esc(v.note)}</span></button>`).join('')}
      </div>

      <div class="sim-grid" style="margin-top:1rem">
        <div class="panel"><div class="panel-head">Shape of dQ/dV</div>
          <div class="panel-body"><div class="ctl" id="cx-ctl"></div>
            <div style="margin-top:1rem;padding-top:.8rem;border-top:1px solid var(--border)" id="cx-read"></div>
          </div></div>
        <div class="stack"><div id="cx-dc"></div><div id="cx-cv"></div><div id="cx-gcd"></div></div>
      </div>
    </section>

    <style>
      .sim-grid { display:grid; gap:1rem; grid-template-columns:1fr; align-items:start; }
      @media (min-width:1000px){ .sim-grid { grid-template-columns:minmax(260px,340px) 1fr; } }
      .ctl { display:grid; gap:.7rem; }
      .ctl label { display:grid; gap:.25rem; }
      .ctl .row2 { display:flex; align-items:center; gap:.5rem; }
      .ctl input[type=range] { width:100%; accent-color:var(--accent); }
      .ctl .val { font-family:var(--font-mono); font-size:var(--fs-xs); color:var(--accent-strong);
        min-width:56px; text-align:right; }
      .readout { display:grid; gap:.4rem; font-size:var(--fs-sm); }
      .readout .rw { display:flex; justify-content:space-between; gap:.75rem;
        padding:.3rem 0; border-bottom:1px dashed var(--border); }
      .readout .rw:last-child { border-bottom:0; }
      .readout .rv { font-family:var(--font-mono); color:var(--text); }
    </style>`;

  function defs() {
    const d = [{ key: 'cdl', label: 'C_dl — double-layer capacitance', unit: 'F', min: 0, max: 0.2, step: 0.005 }];
    custom.couples.forEach((c, i) => {
      const n = custom.couples.length > 1 ? ` ${i + 1}` : '';
      d.push({ key: `Q${i}`, label: `Q${n} — charge in the couple`, unit: 'C', min: 0, max: 0.2, step: 0.005 });
      d.push({ key: `k${i}`, label: `k${n} — width of the couple`, unit: 'V', min: 0.012, max: 0.3, step: 0.002 });
      d.push({ key: `V${i}`, label: `V${n} — where it sits`, unit: 'V', min: 0.05, max: 0.95, step: 0.01 });
    });
    return d;
  }

  function get(key) {
    if (key === 'cdl') return custom.cdl;
    const i = Number(key.slice(1));
    return custom.couples[i][key[0]];
  }
  function set(key, v) {
    if (key === 'cdl') { custom.cdl = v; return; }
    const i = Number(key.slice(1));
    custom.couples[i][key[0]] = v;
  }

  function paintControls() {
    const box = host.querySelector('#cx-ctl');
    box.innerHTML = defs().map((d) => `
      <label><span class="field-label">${esc(d.label)} (${esc(d.unit)})</span>
      <div class="row2"><input type="range" data-k="${d.key}" min="${d.min}" max="${d.max}"
        step="${d.step}" value="${get(d.key)}">
      <span class="val" data-v="${d.key}">${fmt(get(d.key))}</span></div></label>`).join('');
    box.querySelectorAll('[data-k]').forEach((inp) => inp.addEventListener('input', () => {
      set(inp.dataset.k, parseFloat(inp.value));
      box.querySelector(`[data-v="${inp.dataset.k}"]`).textContent = fmt(get(inp.dataset.k));
      draw();
    }));
  }

  host.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
    preset = b.dataset.preset;
    const src = clone(M.PRESETS[preset]);
    custom.cdl = src.cdl; custom.couples = src.couples;
    host.querySelectorAll('[data-preset]').forEach((x) => {
      const on = x === b;
      x.classList.toggle('is-on', on);
      x.setAttribute('aria-checked', String(on));
    });
    paintControls(); draw();
  }));

  async function draw() {
    const g = M.generate(custom);
    const w = M.windowScan(custom, { windowWidth: 0.2 });

    host.querySelector('#cx-read').innerHTML = readout([
      ['Peak dQ/dV', `${sig(g.meta.peakDQdV, 3)} F`],
      ['Flattest dQ/dV', `${sig(g.meta.minDQdV, 3)} F`],
      ['Peak / flat ratio', `${sig(g.meta.peakDQdV / g.meta.minDQdV, 3)}`],
      ['Total charge stored', `${sig(g.meta.totalCharge, 3)} C`],
      ['Discharge time', `${sig(g.meta.dischargeTime, 3)} s`]
    ]) + `<div class="callout ${w.spread < 1.2 ? 'callout-ok' : w.spread < 3 ? 'callout-warn' : 'callout-danger'}"
        style="margin-top:.8rem">
      A single capacitance describes this electrode to within a factor of
      <strong>${sig(w.spread, 3)}</strong> across the window.
      ${w.spread < 1.2
        ? 'That is flat enough for a capacitance to be a property of the electrode rather than of the measurement.'
        : `That means a reported capacitance is mostly a statement about which voltage window you chose.
           <a href="#/chemistry/quantity">See what that does to the number →</a>`}
    </div>`;

    const mk = async (sel, prev, opts) => {
      const h = host.querySelector(sel);
      h.innerHTML = '';
      prev?.destroy?.();
      const { body } = simWrap(h, { simulationBasis: M.BASIS });
      return chartCard(body, opts);
    };

    cDC = await mk('#cx-dc', cDC, {
      title: 'Differential capacitance — the one function everything comes from',
      xLabel: 'Potential  (V)', yLabel: 'dQ/dV  (F)',
      datasets: [{ label: 'dQ/dV', data: g.dc, color: 'var(--series-5)' }],
      hint: 'Flat means capacitor-like. Peaked means battery-like. Everything below is this plot, transformed.'
    });
    cCV = await mk('#cx-cv', cCV, {
      title: 'The voltammogram — dQ/dV multiplied by the scan rate',
      xLabel: 'Potential  (V)', yLabel: 'Current  (A, anodic positive)',
      datasets: [{ label: 'i(E)', data: g.cv }],
      hint: 'Same shape as the plot above, scaled. This model has no kinetics, so the two branches are exact mirrors — a real electrode’s are not, and that difference is information.'
    });
    cGCD = await mk('#cx-gcd', cGCD, {
      title: 'The discharge curve — dQ/dV integrated, divided by the current',
      xLabel: 'Time  (s)', yLabel: 'Potential  (V)',
      datasets: [{ label: 'V(t)', data: g.gcd, color: 'var(--series-3)' }],
      hint: 'A peak in dQ/dV is a plateau here. That is the whole relationship between the two pictures.'
    });
  }

  paintControls();
  await draw();
  return { destroy() { cDC?.destroy?.(); cCV?.destroy?.(); cGCD?.destroy?.(); } };
}

/* ════════════════════════════════════════════════════════════
   Quantity — capacitance or capacity?
   ════════════════════════════════════════════════════════════ */

async function sectionQuantity(host) {
  const state = { preset: 'battery', width: 0.2, lo: 0.4 };
  let cScan = null, cGcd = null;

  host.innerHTML = `
    <section class="section">
      <div class="section-head"><h2>Capacitance or capacity?</h2>
        <span class="section-note">the most consequential reporting decision in this field</span></div>

      ${callout(`<strong>C = I·Δt/ΔV always returns a number.</strong> Whether that number is a property
        of the electrode, or a property of the voltage window you happened to choose, depends entirely on
        whether dQ/dV is flat. For a real capacitor the answer is the same for every window. For a
        battery-type electrode it is not — and nothing in the arithmetic tells you which case you are in.`, 'warn')}

      <div class="cx-presets" style="margin-top:1rem" role="radiogroup" aria-label="Mechanism">
        ${Object.entries(M.PRESETS).map(([k, v]) => `<button type="button"
          class="cx-preset${k === state.preset ? ' is-on' : ''}" role="radio"
          aria-checked="${k === state.preset}" data-q="${esc(k)}">
          <span class="pl">${esc(v.label)}</span></button>`).join('')}
      </div>

      <div class="sim-grid" style="margin-top:1rem">
        <div class="stack-sm">
          <div class="panel"><div class="panel-head">Your voltage window</div>
            <div class="panel-body"><div class="ctl" id="q-ctl"></div></div></div>
          <div class="panel"><div class="panel-head">What C = I·Δt/ΔV returns</div>
            <div class="panel-body" id="q-read"></div></div>
        </div>
        <div class="stack"><div id="q-scan"></div><div id="q-gcd"></div></div>
      </div>
    </section>

    <style>
      .sim-grid { display:grid; gap:1rem; grid-template-columns:1fr; align-items:start; }
      @media (min-width:1000px){ .sim-grid { grid-template-columns:minmax(280px,360px) 1fr; } }
      .ctl { display:grid; gap:.7rem; }
      .ctl label { display:grid; gap:.25rem; }
      .ctl .row2 { display:flex; align-items:center; gap:.5rem; }
      .ctl input[type=range] { width:100%; accent-color:var(--accent); }
      .ctl .val { font-family:var(--font-mono); font-size:var(--fs-xs); color:var(--accent-strong);
        min-width:56px; text-align:right; }
      .readout { display:grid; gap:.4rem; font-size:var(--fs-sm); }
      .readout .rw { display:flex; justify-content:space-between; gap:.75rem;
        padding:.3rem 0; border-bottom:1px dashed var(--border); }
      .readout .rw:last-child { border-bottom:0; }
      .readout .rv { font-family:var(--font-mono); color:var(--text); }
      .q-big { font-family:var(--font-mono); font-size:var(--fs-2xl); color:var(--accent-strong); }
      .q-big.bad { color:var(--danger); }
    </style>`;

  const defs = [
    { key: 'lo', label: 'Window lower edge', unit: 'V', min: 0, max: 0.9, step: 0.01 },
    { key: 'width', label: 'Window width', unit: 'V', min: 0.05, max: 1, step: 0.01 }
  ];

  function paintControls() {
    const box = host.querySelector('#q-ctl');
    box.innerHTML = defs.map((d) => `
      <label><span class="field-label">${esc(d.label)} (${esc(d.unit)})</span>
      <div class="row2"><input type="range" data-k="${d.key}" min="${d.min}" max="${d.max}"
        step="${d.step}" value="${state[d.key]}">
      <span class="val" data-v="${d.key}">${fmt(state[d.key])}</span></div></label>`).join('');
    box.querySelectorAll('[data-k]').forEach((inp) => inp.addEventListener('input', () => {
      state[inp.dataset.k] = parseFloat(inp.value);
      box.querySelector(`[data-v="${inp.dataset.k}"]`).textContent = fmt(state[inp.dataset.k]);
      draw();
    }));
  }

  host.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => {
    state.preset = b.dataset.q;
    host.querySelectorAll('[data-q]').forEach((x) => {
      const on = x === b;
      x.classList.toggle('is-on', on);
      x.setAttribute('aria-checked', String(on));
    });
    draw();
  }));

  async function draw() {
    const m = M.PRESETS[state.preset];
    const hi = Math.min(1, state.lo + state.width);
    const C = M.windowCapacitance(m, state.lo, hi);
    const scan = M.windowScan(m, { windowWidth: state.width });
    const g = M.generate(m);
    const full = M.windowCapacitance(m, 0, 1);

    const bad = scan.spread > 1.2;
    host.querySelector('#q-read').innerHTML = `
      <div style="margin-bottom:.6rem">
        <span class="field-label">Apparent capacitance in your window</span>
        <div class="q-big${bad ? ' bad' : ''}">${sig(C, 4)} F</div>
      </div>
      ${readout([
        ['Window', `${state.lo.toFixed(2)} – ${hi.toFixed(2)} V`],
        ['Over the whole window (0–1 V)', `${sig(full, 4)} F`],
        ['Lowest this window width can give', `${sig(scan.min, 4)} F`],
        ['Highest this window width can give', `${sig(scan.max, 4)} F`],
        ['Ratio highest : lowest', `${sig(scan.spread, 4)}`]
      ])}
      <div class="callout ${bad ? 'callout-danger' : 'callout-ok'}" style="margin-top:.8rem">
        ${bad
          ? `Sliding a window of this width across the range changes the answer by a factor of
             <strong>${sig(scan.spread, 3)}</strong>. There is no single capacitance here to measure —
             the number is a property of your window, not of the electrode.
             <strong>Report capacity, in mAh/g.</strong>`
          : `Sliding the window changes the answer by a factor of ${sig(scan.spread, 3)}. That is flat
             enough for a capacitance to be a property of the electrode. <strong>Capacitance is a
             defensible quantity for this material.</strong>`}
      </div>`;

    const mk = async (sel, prev, opts) => {
      const h = host.querySelector(sel);
      h.innerHTML = '';
      prev?.destroy?.();
      const { body } = simWrap(h, { simulationBasis: M.BASIS });
      return chartCard(body, opts);
    };

    cScan = await mk('#q-scan', cScan, {
      title: `Apparent capacitance against where the ${state.width.toFixed(2)} V window sits`,
      xLabel: 'Centre of the window  (V)', yLabel: 'C = I·Δt/ΔV  (F)',
      datasets: [
        { label: 'apparent C', data: scan.points, color: 'var(--series-4)' },
        { label: 'your window', data: [{ x: state.lo + state.width / 2, y: C }],
          color: 'var(--series-5)', showLine: false, pointRadius: 6 }
      ],
      hint: 'A flat line here means the capacitance is real. A line that moves means the number depends on the window.'
    });
    cGcd = await mk('#q-gcd', cGcd, {
      title: 'The discharge curve this came from',
      xLabel: 'Time  (s)', yLabel: 'Potential  (V)',
      datasets: [{ label: 'V(t)', data: g.gcd, color: 'var(--series-3)' }],
      hint: 'Straight line → one capacitance describes it. Plateau → it does not.'
    });
  }

  paintControls();
  await draw();
  return { destroy() { cScan?.destroy?.(); cGcd?.destroy?.(); } };
}

/* ════════════════════════════════════════════════════════════
   Mechanisms and devices
   ════════════════════════════════════════════════════════════ */

function sectionMechanisms(host, items) {
  host.innerHTML = `
    <p class="small" style="max-width:78ch;margin-bottom:1rem">
      Each record states how to tell the mechanism apart from its neighbours. That field is required —
      the health check refuses a mechanism record without it — because no single curve identifies a
      mechanism, and a page that implies one does teaches the mistake it is trying to prevent.
    </p>
    ${items.map(mechanismCard).join('')}`;
  return { destroy() {} };
}

function mechanismCard(m) {
  return `<div class="cx-mech" id="${esc(m.id)}">
    <details${m.id.endsWith('.edl') ? ' open' : ''}>
      <summary>
        <span class="cx-fam cx-fam-${esc(m.family)}">${esc(m.family)}</span>
        <span class="cx-mn">${esc(m.name)}</span>
        <span class="cx-ms">${esc(m.summary)}</span>
      </summary>
      <div class="cx-body">
        <div class="cbar">
          <div class="cb ctrl"><span class="cbk">In a voltammogram</span><span class="cbv">${esc(m.inCV)}</span></div>
          <div class="cb meas"><span class="cbk">In a discharge curve</span><span class="cbv">${esc(m.inGCD)}</span></div>
          <div class="cb"><span class="cbk">dQ/dV</span><span class="cbv">${esc(m.dQdV)}</span></div>
        </div>

        <div class="mv-block">
          <div class="mv-head"><h2>What physically happens</h2></div>
          <div class="mv-body"><p>${esc(m.whatHappens)}</p>
            <p><strong>Where the charge goes.</strong> ${esc(m.whereChargeGoes)}</p></div>
        </div>

        <div class="cx-two">
          <div class="panel"><div class="panel-head">Rate behaviour</div>
            <div class="panel-body"><p class="small" style="margin:0">${esc(m.rateBehaviour)}</p></div></div>
          <div class="panel"><div class="panel-head">How it degrades</div>
            <div class="panel-body"><p class="small" style="margin:0">${esc(m.degradation)}</p></div></div>
        </div>

        <div class="callout callout-info" style="margin-top:1rem">
          <strong>What to report.</strong> ${esc(m.quantityToReport)}
        </div>

        <div class="panel panel-cant" style="margin-top:1rem">
          <div class="panel-head">How to tell it from its neighbours</div>
          <div class="panel-body"><ul class="lim-list">
            ${(m.distinguishFrom || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
        </div>

        ${(m.misread || []).length ? `<div class="panel" style="margin-top:.75rem">
          <div class="panel-head">Commonly misreported</div>
          <div class="panel-body"><ul class="lim-list warn">
            ${m.misread.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div></div>` : ''}
      </div>
    </details>
  </div>`;
}

function sectionDevices(host, payload) {
  const d = payload.devices || {};
  host.innerHTML = `
    <section class="section">
      <div class="section-head"><h2>${esc(d.title || 'Devices')}</h2>
        ${d.note ? `<span class="section-note">${esc(d.note)}</span>` : ''}</div>
      <!-- Cards, not a table. Six fields per device is a record rather than a
           row, and a six-column table needs a horizontal scrollbar on anything
           narrower than a laptop — which the standing requirement rules out. -->
      <div class="cx-dev-grid">
        ${(d.rows || []).map((r) => `<div class="cx-dev">
          <h3>${esc(r.device)}</h3>
          <div class="cx-dev-kv"><span class="k">The two electrodes</span><span class="v">${esc(r.electrodes)}</span></div>
          <div class="cx-dev-kv"><span class="k">Where the window comes from</span><span class="v">${esc(r.window)}</span></div>
          <div class="cx-dev-kv"><span class="k">Curve shape</span><span class="v">${esc(r.curve)}</span></div>
          <div class="cx-dev-kv rep"><span class="k">Report</span><span class="v">${esc(r.report)}</span></div>
          <div class="cx-dev-kv watch"><span class="k">Watch</span><span class="v">${esc(r.watch)}</span></div>
        </div>`).join('')}
      </div>
    </section>
    ${payload.closing ? callout(esc(payload.closing), 'warn') : ''}`;
  return { destroy() {} };
}

/* ── helpers ─────────────────────────────────────────────── */

function clone(o) { return JSON.parse(JSON.stringify(o)); }
function fmt(v) {
  if (typeof v !== 'number') return String(v);
  if (v !== 0 && Math.abs(v) < 0.01) return v.toExponential(1);
  return String(+v.toFixed(3));
}
function readout(rows) {
  return `<div class="readout">${rows.map(([k, v]) =>
    `<div class="rw"><span>${esc(k)}</span><span class="rv">${esc(v)}</span></div>`).join('')}</div>`;
}

const CSS = `
  .cx-spectrum { display:grid; gap:.5rem; grid-template-columns:1fr; }
  @media (min-width:700px){ .cx-spectrum { grid-template-columns:repeat(3,1fr); } }
  @media (min-width:1100px){ .cx-spectrum { grid-template-columns:repeat(6,1fr); } }
  .cx-sp { display:grid; gap:.2rem; align-content:start; padding:.6rem .7rem; color:inherit;
    background:var(--surface); border:1px solid var(--border);
    border-top:3px solid color-mix(in srgb, var(--accent) calc(100% - var(--i) * 16%), var(--danger));
    border-radius:var(--r-sm); }
  .cx-sp:hover { text-decoration:none; background:var(--surface-2); border-color:var(--accent); }
  .cx-sp-f { font-size:var(--fs-xs); text-transform:uppercase; letter-spacing:.05em;
    color:var(--text-muted); font-weight:650; }
  .cx-sp-n { font-size:var(--fs-sm); font-weight:600; color:var(--text); }
  .cx-sp-d { font-size:var(--fs-xs); color:var(--text-2); line-height:1.4; }

  .cx-presets { display:grid; gap:.4rem; grid-template-columns:1fr; }
  @media (min-width:760px){ .cx-presets { grid-template-columns:repeat(4,1fr); } }
  .cx-preset { text-align:left; display:grid; gap:.2rem; padding:.55rem .7rem; cursor:pointer;
    background:var(--surface); color:var(--text-2); border:1px solid var(--border);
    border-radius:var(--r-sm); font:inherit; }
  .cx-preset:hover { background:var(--surface-2); color:var(--text); }
  .cx-preset.is-on { background:var(--accent-wash); border-color:var(--accent); color:var(--text); }
  .cx-preset .pl { font-size:var(--fs-sm); font-weight:600; }
  .cx-preset .pn { font-size:var(--fs-xs); color:var(--text-muted); line-height:1.35; }

  .cx-mech { margin-bottom:.6rem; }
  .cx-mech details { border:1px solid var(--border); border-radius:var(--r-md); background:var(--surface); }
  .cx-mech summary { padding:.75rem 1rem; cursor:pointer; display:grid; gap:.2rem; }
  .cx-mech summary::marker { color:var(--accent); }
  .cx-fam { font-size:var(--fs-xs); text-transform:uppercase; letter-spacing:.05em; font-weight:700; }
  .cx-fam-capacitive { color:var(--accent-strong); }
  .cx-fam-pseudocapacitive { color:var(--series-5); }
  .cx-fam-battery { color:var(--warn); }
  .cx-mn { font-size:var(--fs-md); font-weight:600; color:var(--text); }
  .cx-ms { font-size:var(--fs-sm); color:var(--text-2); }
  .cx-body { padding:0 1rem 1rem; }
  .cx-two { display:grid; gap:1rem; grid-template-columns:1fr; align-items:start; }
  @media (min-width:900px){ .cx-two { grid-template-columns:1fr 1fr; } }
  .panel-cant { border-left:3px solid var(--accent); }

  .cx-dev-grid { display:grid; gap:.85rem; grid-template-columns:1fr; }
  @media (min-width:900px){ .cx-dev-grid { grid-template-columns:1fr 1fr; } }
  .cx-dev { border:1px solid var(--border); border-radius:var(--r-md);
    background:var(--surface); padding:.9rem 1rem; }
  .cx-dev h3 { font-size:var(--fs-base); margin:0 0 .6rem; }
  .cx-dev-kv { display:grid; gap:.1rem; margin-bottom:.55rem; }
  .cx-dev-kv:last-child { margin-bottom:0; }
  .cx-dev-kv .k { font-size:var(--fs-xs); text-transform:uppercase; letter-spacing:.05em;
    color:var(--text-muted); font-weight:650; }
  .cx-dev-kv .v { font-size:var(--fs-sm); color:var(--text-2); }
  .cx-dev-kv.rep { border-top:1px solid var(--border); padding-top:.55rem; }
  .cx-dev-kv.rep .k { color:var(--accent-strong); }
  .cx-dev-kv.watch .k { color:var(--warn); }
`;
