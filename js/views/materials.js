/**
 * EDMGLAB — Electrode materials (Roadmap P7)
 *
 * ── WHY THIS MODULE HAS NO REPORTED CAPACITIES IN IT ──
 *
 * The group asked for a materials database. What a materials database usually
 * contains is a column of capacities from the literature, and that column is
 * the one thing this platform must not contain without citations somebody has
 * read. So this is built the other way round.
 *
 * Every capacity here is COMPUTED, live, from two things the record declares:
 * the formula unit the capacity is quoted per, and how many electrons that
 * unit transfers. Q = n·F / (3.6·M), with M summed from the atomic weights
 * below. There is no stored number to be wrong, and the derivation is printed
 * next to the answer so anyone can check it in their head.
 *
 * That also makes the module's demonstration possible, which is the real
 * reason it exists:
 *
 *   THE SAME PAIR OF MATERIALS GIVES THREE DIFFERENT "CAPACITIES", ALL
 *   CORRECT, ROUTINELY QUOTED AS IF THEY WERE THE SAME NUMBER.
 *
 *     · the half-cell electrode capacity — what a paper reports
 *     · the balanced full-cell capacity per gram of both actives
 *     · the cell-level figure once everything that is not active material
 *       is counted
 *
 * The gap between the first and the last is usually a factor of three or more,
 * and nothing about the material changes across it.
 *
 * WHAT IS DELIBERATELY ABSENT: reported capacity, first-cycle efficiency, rate
 * performance, cycle life, and cell voltage. The first four need citations.
 * The fifth is a user input here, clearly marked, because supplying one would
 * be asserting a value this platform has not verified.
 *
 * ── THE AQUEOUS / NON-AQUEOUS HALF OF THE MODULE ──
 *
 * data/potentials.json is the one file here holding numbers this module did not
 * compute — standard electrode potentials are measured thermodynamic data, not
 * derivable from a formula. Every row there carries a citation, and the water
 * stability window built from them is the reason the aqueous question has an
 * answer rather than a rule of thumb:
 *
 *   Water is stable over 1.229 V, at EVERY pH. The window slides down 59.16 mV
 *   per pH unit and never widens. An electrode outside it is not forbidden —
 *   lead-acid sits outside at both ends and has been in production since the
 *   1860s — but it is then living on kinetics, and kinetics can be taken away
 *   by an impurity or a warm afternoon.
 *
 * The panel is deliberately NOT a general Pourbaix diagram. Only couples whose
 * written reaction contains no H⁺, OH⁻ or H₂O are drawn flat across the pH
 * axis; the rest appear as a single point at the pH their tabulated value is
 * defined for. Drawing a proton-carrying couple flat is the standard way these
 * plots go wrong, and it puts electrodes on the wrong side of the window.
 */

import { esc, pageHead, callout } from '../ui.js';
import * as data from '../data.js';
import { addEnlargeControl } from '../lib/anim-fullscreen.js';

/**
 * IUPAC conventional standard atomic weights, g/mol.
 *
 * The ONE place any mass in this module comes from. They are quoted to the
 * precision IUPAC publishes for the conventional values; the fourth figure
 * never matters at the precision a capacity is useful to, but rounding them
 * in the records instead of here would scatter the same constant across
 * sixteen files.
 */
export const ATOMIC_WEIGHTS = {
  H: 1.008, Li: 6.94, C: 12.011, N: 14.007, O: 15.999, Na: 22.990, Mg: 24.305,
  Al: 26.982, Si: 28.085, P: 30.974, S: 32.06, K: 39.098, Ti: 47.867,
  V: 50.942, Mn: 54.938, Fe: 55.845, Co: 58.933, Ni: 58.693, Cu: 63.546,
  Zn: 65.38, Pb: 207.2
};
const ATOMIC_WEIGHTS_SOURCE =
  'IUPAC conventional standard atomic weights. Values are definitional reference data, not measurements of any sample.';

const FARADAY = 96485.332;   // C/mol — the same constant js/lib/expr.js uses

/** Molar mass of a declared composition, and the terms that made it. */
export function molarMass(composition) {
  if (!composition) return null;
  const terms = [];
  let M = 0;
  for (const [el, n] of Object.entries(composition)) {
    const w = ATOMIC_WEIGHTS[el];
    if (w === undefined) return null;          // unknown element — refuse, do not guess
    M += w * n;
    terms.push({ el, n, w, sub: w * n });
  }
  return { M, terms };
}

/**
 * Theoretical specific capacity in mAh/g.
 * Q = n·F / M  coulombs per gram → divide by 3.6 for mAh.
 */
export function theoreticalCapacity(composition, electrons) {
  const mm = molarMass(composition);
  if (!mm || !Number.isFinite(electrons) || electrons <= 0) return null;
  return { Q: (electrons * FARADAY) / (3.6 * mm.M), M: mm.M, terms: mm.terms };
}

const CHEM = {
  Li: 'Lithium', Na: 'Sodium', K: 'Potassium', Zn: 'Zinc',
  Mg: 'Magnesium', Al: 'Aluminium', Pb: 'Lead', Ni: 'Nickel',
  Cu: 'Copper', Fe: 'Iron', H2O: 'Water itself'
};

export async function render(outlet, ctx) {
  /* potentials.json is optional to the page: if it is absent the capacity half
     of the module still works and the water-window panel simply does not
     appear. A missing reference file must never blank a working view. */
  const [payload, pot] = await Promise.all([
    data.load('materials'),
    data.load('potentials').catch(() => ({}))
  ]);
  const items = Array.isArray(payload.items) ? payload.items : [];
  const one = ctx?.params?.id ? items.find((m) => m.id === matId(ctx.params.id)) : null;

  if (!items.length) {
    outlet.innerHTML = `${pageHead('Electrode materials', '')}
      ${callout('<strong>No materials are recorded yet.</strong> See <code>data/materials.json</code>.', 'warn')}`;
    return { destroy() {} };
  }

  outlet.innerHTML = one ? detail(one, items) : index(items, pot);
  let stopWindow = null;
  if (!one) { wireDemo(outlet, items); stopWindow = wireWindow(outlet, pot); }
  return { destroy() { stopWindow?.(); } };
}

/** Accept both `#/materials/lifepo4` and `#/materials/material.lifepo4`.
 *  The cards link with the short form; cross-references elsewhere in the
 *  platform use full record ids, and both have to land on the same page. */
function matId(raw) {
  return String(raw).startsWith('material.') ? String(raw) : `material.${raw}`;
}

/* ══════════════════════════════════════════════════════════
   The index: the demonstration, then the materials
   ══════════════════════════════════════════════════════════ */

function index(items, pot) {
  const anodes = items.filter((m) => m.role === 'anode');
  const cathodes = items.filter((m) => m.role === 'cathode');
  const byChem = {};
  for (const m of items) for (const c of m.chemistry || []) (byChem[c] ||= []).push(m);

  return `
    ${pageHead('Electrode materials',
      'Theoretical capacity, derived rather than quoted — and the three different numbers the same pair of materials produces.')}

    ${callout(`<strong>There is not one reported capacity in this module, and that is deliberate.</strong>
      Every number here is computed from stoichiometry, with the arithmetic shown. Measured capacities,
      first-cycle efficiencies, rate performance and cycle life are absent because they vary by more than an
      order of magnitude with synthesis and testing conditions — a number without those conditions is not
      information, and a number without a citation is not evidence.`, 'warn')}

    <section class="section">
      <div class="section-head"><h2>Half cell, full cell, and the cell you would actually build</h2>
        <span class="section-note">one pair of materials · three capacities · all correct</span></div>
      <p class="small" style="max-width:78ch">
        A half-cell capacity is a property of one electrode measured against a counter electrode holding far
        more lithium (or sodium, or zinc) than it needs. It is the number papers report. It is not the number
        a device delivers, and the distance between them is not a detail — pick a pair below and watch it.
      </p>
      <div class="mt-grid">
        <div class="stack-sm" id="mt-controls"></div>
        <div id="mt-result"></div>
      </div>
    </section>

    ${windowSection(pot)}

    ${Object.entries(byChem).map(([c, list]) => `
      <section class="section">
        <div class="section-head"><h2>${esc(CHEM[c] || c)}</h2>
          <span class="section-note">${list.length} material${list.length === 1 ? '' : 's'}</span></div>
        <div class="mt-cards">${list.map(card).join('')}</div>
      </section>`).join('')}

    <section class="section">
      <div class="section-head"><h2>What every number on this page is</h2></div>
      <div class="panel"><div class="panel-body">
        <p class="small">Each capacity is <code>Q = n·F / (3.6·M)</code>, where <code>n</code> is the
        electrons per formula unit that the record declares, <code>F</code> is the Faraday constant
        (${FARADAY.toLocaleString('en-GB')} C/mol) and <code>M</code> is the molar mass of the stated
        formula unit, summed from ${esc(ATOMIC_WEIGHTS_SOURCE)}</p>
        <p class="small" style="margin-bottom:0"><strong>It is an upper bound on an upper bound.</strong> It
        assumes the stated reaction goes to completion, that the formula unit is the right one, and that the
        electron count is the accessible one. Three of the records here exist mainly to show where one of
        those assumptions fails: hard carbon has no formula unit at all, MnO₂ has a contested electron count,
        and NaFePO₄ has two polymorphs with the same composition and completely different behaviour.</p>
      </div></div>
    </section>

    ${STYLE}`;
}

function card(m) {
  const t = theoreticalCapacity(m.composition, m.electrons);
  const sys = (m.electrolyteContext || [])
    .filter((c) => c.viable === 'yes').map((c) => c.system === 'aqueous' ? 'aq' : 'non-aq');
  return `<a class="mt-card" href="#/materials/${esc(m.id.replace(/^material\./, ''))}">
    <h3>${esc(m.name)}</h3>
    <div class="mt-sub">${esc(m.role)} · ${esc(m.family)}</div>
    <div style="margin-top:.5rem">
      ${t ? `<span class="mt-q">${t.Q.toFixed(0)}</span> <span class="mt-sub">mAh/g theoretical</span>`
          : '<span class="mt-q none">no theoretical capacity exists</span>'}
    </div>
    <div class="mt-chips">
      ${(m.chemistry || []).map((c) => `<span class="chip">${esc(c)}</span>`).join('')}
      ${sys.map((s) => `<span class="chip chip-ok">${esc(s)}</span>`).join('')}
    </div>
  </a>`;
}

/* ══════════════════════════════════════════════════════════
   The water stability window
   ══════════════════════════════════════════════════════════
   Everything drawn here comes from data/potentials.json, which is the only
   file in this module holding numbers the app did not compute — and every one
   of them carries a citation. Nothing is hard-coded in this function except
   the geometry.

   GEOMETRY. Fixed viewBox, width:100%, height:auto. The plot therefore scales
   to its column and can never need a scrollbar, which is the group's standing
   requirement that a graph stays inside its window. Axis limits are fixed too:
   an auto-scaled y-axis here would let the water band change height as
   couples are added, and the whole point is that the band NEVER changes
   height.                                                                  */

const WW = {
  w: 760, h: 470,
  x0: 78, x1: 612,       /* plot area. x1 stops well short of the viewBox edge
                            because the couple labels are written to its RIGHT:
                            at 690 the long ones ("Mg²⁺/Mg", "Ni(OH)₂/Ni") ran
                            past 760 and were clipped by the viewBox, which
                            crops silently rather than overflowing. */
  y0: 24, y1: 396,
  eTop: 2.1, eBot: -3.35 // volts vs SHE, top and bottom of the axis
};

/**
 * Text inside a scaled viewBox is NOT the size it is declared.
 *
 * A 15px label in a 760-unit viewBox rendered into a 360px phone column comes
 * out at 7px, which is under the type floor and unreadable — and no amount of
 * editing the stylesheet fixes it, because the browser scales the whole
 * drawing. So the font sizes are computed the other way round: pick the size
 * the reader should SEE, and convert it to viewBox units using the measured
 * width. `scale` is >1 on a narrow column and ≈1 on a wide one.
 *
 * Below NARROW the per-couple labels are dropped entirely rather than drawn
 * huge: the table beside the plot lists every couple with its value and its
 * verdict, so nothing is lost, and a plot crowded with 30px text is worse than
 * a clean one. The Enlarge control is the way to see them on a phone.
 */
const NARROW = 520;
function metrics(el) {
  const px = el?.clientWidth || WW.w;
  const scale = WW.w / px;
  const u = (renderedPx) => +(renderedPx * scale).toFixed(1);
  return { px, scale, u, crowded: px < NARROW };
}
const pxX = (pH) => WW.x0 + (pH / 14) * (WW.x1 - WW.x0);
const pxY = (E) => WW.y0 + ((WW.eTop - E) / (WW.eTop - WW.eBot)) * (WW.y1 - WW.y0);

/** U+2212 MINUS SIGN, not a hyphen. The tabulated values in potentials.json
 *  are printed with it, and a table that mixes the two glyphs in one column
 *  looks like two different kinds of number. */
const sign = (v) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(3);

/**
 * Push stacked axis labels apart so none is written over another.
 *
 * K⁺/K and Li⁺/Li are 0.11 V apart, which at this scale is 7 px — the two
 * labels landed on top of each other and neither was readable. The LINES stay
 * where the data puts them; only the text moves, so nothing here misrepresents
 * a value. Labels are laid out top-down and each is pushed below the previous
 * one when it would collide.
 */
function declutter(labels, minGap = 16) {
  const sorted = [...labels].sort((a, b) => a.y - b.y);
  let last = -Infinity;
  for (const t of sorted) {
    t.y = Math.max(t.y, last + minGap);
    last = t.y;
  }
  return sorted;
}

/** The pH at which a pH-independent couple crosses the hydrogen line.
 *  E_couple = E_H(0) − slope·pH  ⇒  pH = (E_H(0) − E_couple) / slope.
 *  Computed so the prose cannot drift away from the plot beside it. */
function znCrossing(eCouple, eH0, slope) {
  if (![eCouple, eH0, slope].every(Number.isFinite)) return '—';
  return (((eH0 ?? 0) - eCouple) / slope).toFixed(1);
}

function windowSection(pot) {
  const items = Array.isArray(pot?.items) ? pot.items : [];
  if (!items.length) return '';

  const src = pot.sources?.libretexts_p1;
  const slope = pot.constants?.nernstSlope?.value ?? 0.05916;
  const width = pot.constants?.waterWindow?.value ?? 1.229;

  return `
    <section class="section">
      <div class="section-head"><h2>Why some of these work in water and some do not</h2>
        <span class="section-note">the window is ${width}&nbsp;V wide at every pH · it slides, it never widens</span></div>

      <p class="small" style="max-width:78ch">
        Water is only stable over a ${width}&nbsp;V range of potential. Below the lower line it is reduced to
        hydrogen; above the upper line it is oxidised to oxygen. Both lines fall by
        ${slope.toFixed(5)}&nbsp;V per pH unit — <strong>the same rate</strong> — so raising the pH moves the
        window down without making it any wider. That single fact decides which of the materials above can
        be used in an aqueous cell, and it is why zinc works in alkali and lithium works nowhere near water.
      </p>

      <div class="ww-grid">
        <div class="ww-plot" id="ww-plot"></div>
        <div>
          <div class="stack-sm" id="ww-controls"></div>
          <div id="ww-rows" class="ww-rows" style="margin-top:.8rem"></div>
        </div>
      </div>

      <div class="panel" style="margin-top:1rem"><div class="panel-body">
        <p class="small"><strong>Outside the window does not mean impossible.</strong> It means the
          electrode is thermodynamically able to destroy the solvent, and that only kinetics are stopping
          it. The lead-acid battery sits outside the window at <em>both</em> ends — its negative below the
          hydrogen line, its positive above the oxygen line — and has been manufactured since the 1860s.
          It works because hydrogen evolution on lead and oxygen evolution on lead dioxide are both very
          slow, and it gasses because they are not infinitely slow. Never read this plot as a prediction of
          what will happen; read it as what is <em>allowed</em> to happen.</p>
        <p class="small" style="margin-bottom:0"><strong>The lines are standard potentials.</strong>
          25&nbsp;°C, unit activity, 1&nbsp;bar. A real electrode is at none of those, sits at whatever
          overpotential its current demands, and in a non-aqueous cell is on a different reference scale
          entirely. Treat this as a floor plan, not as a meter reading.</p>
      </div></div>

      ${src ? `<p class="xsmall muted" style="margin-top:.6rem">
        Potentials from <a href="${esc(src.url)}" target="_blank" rel="noopener">${esc(src.title)}</a>,
        ${esc(src.publisher)}, retrieved ${esc(src.retrieved)}, which cites ${esc(src.citesInTurn)}
        The ${width}&nbsp;V width is confirmed independently from
        ΔfG°(H₂O,&nbsp;l)&nbsp;=&nbsp;−237.1&nbsp;kJ/mol: E&nbsp;=&nbsp;474200&nbsp;/&nbsp;(4&nbsp;×&nbsp;96485.33)
        =&nbsp;1.2287&nbsp;V.</p>` : ''}
    </section>`;
}

/* The reference scales a student's own measurement might be on. The value is
   the potential of that reference couple on the SHE scale, so
   E(SHE) = E(measured) + offset. */
const SCALES = [
  { id: 'she', label: 'V vs SHE (already on this scale)', offset: 0, warn: false },
  { id: 'li', label: 'V vs Li/Li⁺', from: 'potential.li', warn: true },
  { id: 'na', label: 'V vs Na/Na⁺', from: 'potential.na', warn: true },
  { id: 'k', label: 'V vs K/K⁺', from: 'potential.k', warn: true },
  { id: 'zn', label: 'V vs Zn/Zn²⁺', from: 'potential.zn', warn: true }
];

function wireWindow(outlet, pot) {
  const plot = outlet.querySelector('#ww-plot');
  const controls = outlet.querySelector('#ww-controls');
  const rowsEl = outlet.querySelector('#ww-rows');
  if (!plot || !controls || !rowsEl) return;

  const items = Array.isArray(pot?.items) ? pot.items : [];
  const byId = Object.fromEntries(items.map((p) => [p.id, p]));
  const slope = pot.constants?.nernstSlope?.value ?? 0.05916;

  const E0 = (id) => byId[id]?.e0?.value;
  const hLine = (pH) => (E0('potential.h_acid') ?? 0) - slope * pH;
  const oLine = (pH) => (E0('potential.o2_acid') ?? 1.229) - slope * pH;

  const couples = items.filter((p) => p.kind !== 'solventLimit');
  const state = { pH: 7, scale: 'she', measured: '' };

  controls.innerHTML = `
    <div class="mt-field">
      <label class="field-label" for="ww-ph">pH of the electrolyte — <span id="ww-phv">7.0</span></label>
      <input id="ww-ph" type="range" min="0" max="14" step="0.5" value="7">
      <span class="xsmall muted">Drag it. Zinc crosses the hydrogen line at
        <strong>pH ${znCrossing(E0('potential.zn'), E0('potential.h_acid'), slope)}</strong> — computed from
        the two cited potentials and the Nernst slope, not looked up. Below that pH an aqueous zinc cell is
        surviving on a hydrogen-evolution overpotential; above it, zinc is thermodynamically safe in water.
        That single crossing is why alkaline zinc cells have been manufactured for a century and mildly
        acidic ones are a research problem.</span>
    </div>
    <div class="mt-field">
      <label class="field-label" for="ww-scale">Put your own electrode on the plot</label>
      <select id="ww-scale">${SCALES.map((s) =>
        `<option value="${s.id}">${esc(s.label)}</option>`).join('')}</select>
    </div>
    <div class="mt-field">
      <label class="field-label" for="ww-e">Potential you measured, V</label>
      <input id="ww-e" type="number" step="0.01" placeholder="e.g. 3.4">
      <span class="xsmall muted" id="ww-conv">EDMGLAB supplies no operating potentials. This is your
        measurement, converted with a cited constant — nothing here is asserted on your behalf.</span>
    </div>`;

  const phIn = controls.querySelector('#ww-ph');
  const phOut = controls.querySelector('#ww-phv');
  const scaleIn = controls.querySelector('#ww-scale');
  const eIn = controls.querySelector('#ww-e');

  phIn.addEventListener('input', () => { state.pH = Number(phIn.value); draw(); });
  scaleIn.addEventListener('change', () => { state.scale = scaleIn.value; draw(); });
  eIn.addEventListener('input', () => { state.measured = eIn.value; draw(); });

  /* The font sizes are computed from the MEASURED width, so a resize (or a
     rotation, or the enlarge overlay opening) has to redraw or the labels are
     sized for the old column. Debounced, and disconnected when the view goes. */
  let raf = 0;
  const ro = new ResizeObserver(() => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(draw);
  });
  ro.observe(plot);

  draw();
  return () => { ro.disconnect(); cancelAnimationFrame(raf); };

  function yourPotential() {
    const v = parseFloat(state.measured);
    if (!Number.isFinite(v)) return null;
    const s = SCALES.find((x) => x.id === state.scale) || SCALES[0];
    const off = s.from ? E0(s.from) : 0;
    if (off === undefined) return null;
    return { she: v + off, raw: v, scale: s, off };
  }

  function draw() {
    phOut.textContent = state.pH.toFixed(1);

    const lo = hLine(state.pH);
    const hi = oLine(state.pH);
    const you = yourPotential();

    /* ── the plot ── */
    const gridV = [2, 1, 0, -1, -2, -3];
    const gridPH = [0, 2, 4, 6, 8, 10, 12, 14];

    const band = `M ${pxX(0)} ${pxY(oLine(0))} L ${pxX(14)} ${pxY(oLine(14))}
                  L ${pxX(14)} ${pxY(hLine(14))} L ${pxX(0)} ${pxY(hLine(0))} Z`;

    const flat = couples.filter((p) => p.pHIndependent);
    const spot = couples.filter((p) => !p.pHIndependent && p.definedAtPH !== undefined);

    /* Sizes in viewBox units that render at a constant size on screen. See
       metrics() — this is what keeps the labels above the type floor in a
       narrow column instead of shrinking with the drawing. */
    const M = metrics(plot);
    const fAx = M.u(14), fLbl = M.u(14), fAxt = M.u(15), fSym = M.u(13.5);
    const showSymbols = !M.crowded;

    plot.innerHTML = `
      <svg viewBox="0 0 ${WW.w} ${WW.h}" role="img"
           aria-label="Potential against pH. The stability window of water, ${(hi - lo).toFixed(3)} volts wide,
             lies between ${lo.toFixed(3)} and ${hi.toFixed(3)} volts versus SHE at pH ${state.pH.toFixed(1)}.
             Electrode couples are drawn as horizontal lines; those inside the window are solid.
             Every couple and its verdict is also listed in the table beside this plot.">
        ${gridV.map((v) => `
          <line class="ww-gl" x1="${WW.x0}" y1="${pxY(v)}" x2="${WW.x1}" y2="${pxY(v)}"/>
          <text class="ww-ax" style="font-size:${fAx}px" x="${WW.x0 - 10}" y="${pxY(v) + fAx * 0.35}"
                text-anchor="end">${v > 0 ? '+' : ''}${v}</text>`).join('')}
        ${gridPH.map((p) => `
          <text class="ww-ax" style="font-size:${fAx}px" x="${pxX(p)}" y="${WW.y1 + fAx * 1.7}"
                text-anchor="middle">${p}</text>`).join('')}

        <path class="ww-safe" d="${band}"/>
        <path class="ww-line" d="M ${pxX(0)} ${pxY(oLine(0))} L ${pxX(14)} ${pxY(oLine(14))}"/>
        <path class="ww-line" d="M ${pxX(0)} ${pxY(hLine(0))} L ${pxX(14)} ${pxY(hLine(14))}"/>
        <!-- Anchored at pH 5, which is the one part of the interior no dot
             label ever occupies (the spot couples sit at pH 0 and pH 14).
             Text over a dashed couple line is still readable; text over other
             text is not. -->
        <text class="ww-lbl" style="font-size:${fLbl}px" x="${pxX(showSymbols ? 4.6 : 0.4)}"
              y="${pxY(oLine(showSymbols ? 4.6 : 0.4)) - fLbl * 0.7}">O₂ / H₂O — oxidises above</text>
        <text class="ww-lbl" style="font-size:${fLbl}px" x="${pxX(showSymbols ? 4.6 : 0.4)}"
              y="${pxY(hLine(showSymbols ? 4.6 : 0.4)) + fLbl * 1.5}">H⁺ / H₂ — reduces below</text>

        ${flat.map((p) => {
          const E = p.e0.value;
          const inside = E > lo && E < hi;
          return `<line class="ww-couple ${inside ? 'inside' : ''}"
                    x1="${WW.x0}" y1="${pxY(E)}" x2="${WW.x1}" y2="${pxY(E)}"/>`;
        }).join('')}

        ${showSymbols ? declutter(flat.map((p) => ({ y: pxY(p.e0.value), label: p.symbol })), fSym * 1.2)
          .map((t) => `<text class="ww-lbl" x="${WW.x1 + 5}" y="${t.y + fSym * 0.35}"
                        style="font-size:${fSym}px">${esc(t.label)}</text>`).join('') : ''}

        ${spot.map((p) => {
          const E = p.e0.value;
          const x = pxX(p.definedAtPH);
          const right = p.definedAtPH < 7;
          /* Lifted above the dot rather than sitting beside it: at pH 14 the
             Ni(OH)₂/Ni dot is 0.04 V from the Zn²⁺/Zn line, so a label level
             with the dot ran straight into Zn's axis label. */
          return `<circle class="ww-dot" cx="${x}" cy="${pxY(E)}" r="${M.u(4)}"/>
                  ${showSymbols ? `<text class="ww-lbl" x="${right ? x + 10 : x - 10}"
                        y="${pxY(E) - fSym}" text-anchor="${right ? 'start' : 'end'}"
                        style="font-size:${fSym}px">${esc(p.symbol)}</text>` : ''}`;
        }).join('')}

        <line class="ww-ph" x1="${pxX(state.pH)}" y1="${WW.y0}" x2="${pxX(state.pH)}" y2="${WW.y1}"/>

        ${you && you.she < WW.eTop && you.she > WW.eBot ? `
          <line class="ww-you" x1="${WW.x0}" y1="${pxY(you.she)}" x2="${WW.x1}" y2="${pxY(you.she)}"/>
          <text class="ww-lbl" x="${WW.x0 + 8}" y="${pxY(you.she) - fLbl * 0.5}"
                style="font-size:${fLbl}px;fill:var(--warn);font-weight:700">your electrode</text>` : ''}

        <line class="ww-gl" x1="${WW.x0}" y1="${WW.y0}" x2="${WW.x0}" y2="${WW.y1}"/>
        <line class="ww-gl" x1="${WW.x0}" y1="${WW.y1}" x2="${WW.x1}" y2="${WW.y1}"/>
        <text class="ww-axt" style="font-size:${fAxt}px" x="${(WW.x0 + WW.x1) / 2}"
              y="${WW.h - fAxt * 1.4}" text-anchor="middle">pH</text>
        <text class="ww-axt" style="font-size:${fAxt}px" x="${fAxt}"
              y="${(WW.y0 + WW.y1) / 2}" text-anchor="middle"
              transform="rotate(-90 ${fAxt} ${(WW.y0 + WW.y1) / 2})">Potential, V vs SHE</text>
      </svg>
      ${M.crowded ? `<p class="xsmall muted" style="margin:.5rem .3rem 0">Couple labels are hidden at this
        width so nothing is drawn too small to read — every couple, its value and its verdict are in the
        list below. Use <strong>Enlarge</strong> to see the plot labelled on the long edge.</p>` : ''}`;

    /* The audit's own rule: a diagram whose in-column labels get small must
       offer a way OUT of the column. Re-added after every redraw because
       innerHTML above removes it. */
    addEnlargeControl(plot, 'Water stability window');

    /* ── the conversion note under the input ── */
    const conv = controls.querySelector('#ww-conv');
    if (you && you.scale.warn) {
      conv.innerHTML = `<strong>${you.raw} V vs ${esc(you.scale.label.replace('V vs ', ''))}
        → ${sign(you.she)} V vs SHE</strong>, by adding the cited standard potential
        (${esc(byId[you.scale.from]?.e0?.printed ?? String(you.off))}). <strong style="color:var(--warn)">This is an orientation, not a measurement.</strong>
        Standard potentials are defined against SHE in <em>water</em>; a potential measured against lithium
        in a carbonate electrolyte is on a different scale, and the two are not strictly interconvertible.
        Expect the true position to differ by tens to hundreds of millivolts. Use it to see roughly where
        your electrode falls, never to report a number.`;
    } else if (you) {
      conv.innerHTML = `Plotted at ${sign(you.she)} V vs SHE, as entered.`;
    } else {
      conv.textContent = 'EDMGLAB supplies no operating potentials. This is your measurement, converted '
        + 'with a cited constant — nothing here is asserted on your behalf.';
    }

    /* ── the table ── */
    rowsEl.innerHTML = `
      <div class="ww-row" style="background:transparent;font-weight:600">
        <span>At pH ${state.pH.toFixed(1)} the window is</span>
        <span class="ww-e">${sign(lo)} to ${sign(hi)}</span>
        <span class="xsmall muted">${(hi - lo).toFixed(3)} V</span>
      </div>
      ${couples.map((p) => {
        const E = p.e0.value;
        const applies = p.pHIndependent || p.definedAtPH === undefined
          || Math.abs(p.definedAtPH - state.pH) < 0.75;
        const inside = E > lo && E < hi;
        const verdict = !p.pHIndependent && !applies
          ? `<span class="chip">only at pH ${p.definedAtPH}</span>`
          : inside ? '<span class="chip chip-ok">inside</span>'
                   : `<span class="chip chip-warn">${E <= lo ? 'below' : 'above'}</span>`;
        /* A caution on a value has to reach the reader, not sit in the data
           file being technically present. One of these rows comes from a
           course table that cites nothing upstream, and the row says so. */
        return `<div class="ww-row${p.e0.caution ? ' has-caution' : ''}">
          <span>${esc(p.symbol)}</span>
          <span class="ww-e">${esc(p.e0.printed ?? String(E))}</span>
          ${verdict}
          ${p.e0.caution
            ? `<p class="ww-caution">⚠ ${esc(p.e0.caution)}</p>` : ''}
        </div>`;
      }).join('')}
      <p class="xsmall muted" style="margin:.5rem 0 0">
        Couples whose written reaction contains H⁺, OH⁻ or H₂O move with pH and are shown only at the pH
        their tabulated value is defined for — drawing those flat across a plot like this is the standard
        way it goes wrong, and it puts electrodes on the wrong side of the window.</p>`;
  }
}

/* ══════════════════════════════════════════════════════════
   The demonstration
   ══════════════════════════════════════════════════════════ */

function wireDemo(outlet, items) {
  const anodes = items.filter((m) => m.role === 'anode' && theoreticalCapacity(m.composition, m.electrons));
  const cathodes = items.filter((m) => m.role === 'cathode' && theoreticalCapacity(m.composition, m.electrons));
  const ctl = outlet.querySelector('#mt-controls');

  const state = {
    a: anodes.find((m) => m.id === 'material.graphite')?.id || anodes[0].id,
    c: cathodes.find((m) => m.id === 'material.lifepo4')?.id || cathodes[0].id,
    np: 1.1,
    voltage: 3.2,
    activeFrac: 0.45
  };

  ctl.innerHTML = `
    <div class="panel"><div class="panel-head">The pair</div><div class="panel-body">
      <div class="mt-field"><label class="field-label" for="mt-a">Anode</label>
        <select id="mt-a">${anodes.map((m) => `<option value="${esc(m.id)}"${m.id === state.a ? ' selected' : ''}>${esc(m.name)}</option>`).join('')}</select></div>
      <div class="mt-field"><label class="field-label" for="mt-c">Cathode</label>
        <select id="mt-c">${cathodes.map((m) => `<option value="${esc(m.id)}"${m.id === state.c ? ' selected' : ''}>${esc(m.name)}</option>`).join('')}</select></div>
      <p class="xsmall muted" style="margin:0">Only materials with a defined formula unit appear here. Hard
        carbon is excluded because it has no theoretical capacity to pair with.</p>
    </div></div>

    <div class="panel"><div class="panel-head">The cell you would build</div><div class="panel-body">
      <div class="mt-field"><label class="field-label" for="mt-np">N/P ratio — anode capacity ÷ cathode capacity</label>
        <input id="mt-np" type="number" min="0.8" max="2" step="0.05" value="${state.np}">
        <p class="xsmall muted" style="margin:0">Above 1 so the anode is never the limiting electrode.
          Every point above 1 is anode mass carried for safety and never discharged.</p></div>

      <div class="mt-field"><label class="field-label" for="mt-v">Average cell voltage, V</label>
        <input id="mt-v" type="number" min="0.5" max="5" step="0.1" value="${state.voltage}">
        <p class="xsmall muted" style="margin:0"><strong>You set this.</strong> EDMGLAB does not supply cell
          voltages — that would be asserting a value it has not verified. Take it from your own measurement
          or a source you have read.</p></div>

      <div class="mt-field"><label class="field-label" for="mt-f">Active material as a fraction of cell mass</label>
        <input id="mt-f" type="number" min="0.1" max="1" step="0.01" value="${state.activeFrac}">
        <p class="xsmall muted" style="margin:0">Everything else — binder, conductive additive, current
          collectors, separator, electrolyte, casing, tabs. Also yours to set: it depends entirely on the
          format you are building.</p></div>
    </div></div>`;

  const bind = (id, key, num = true) => {
    const el = ctl.querySelector(id);
    el.addEventListener('input', () => {
      const v = num ? parseFloat(el.value) : el.value;
      if (num && !Number.isFinite(v)) return;
      state[key] = v; draw();
    });
    el.addEventListener('change', () => { state[key] = num ? parseFloat(el.value) : el.value; draw(); });
  };
  bind('#mt-a', 'a', false); bind('#mt-c', 'c', false);
  bind('#mt-np', 'np'); bind('#mt-v', 'voltage'); bind('#mt-f', 'activeFrac');
  draw();

  function draw() {
    const A = items.find((m) => m.id === state.a);
    const C = items.find((m) => m.id === state.c);
    const qa = theoreticalCapacity(A.composition, A.electrons).Q;
    const qc = theoreticalCapacity(C.composition, C.electrons).Q;
    const r = Math.max(0.1, state.np);

    /* Balanced pairing. The cathode is the limiting electrode at N/P > 1, so
       the cell's capacity is the cathode's — but it is now shared over the mass
       of BOTH electrodes, and the anode mass is set by the ratio. */
    const massRatio = (r * qc) / qa;                 // g anode per g cathode
    const qPair = qc / (1 + massRatio);              // mAh per gram of both actives
    const qCell = qPair * Math.min(1, Math.max(0.01, state.activeFrac));
    /* mAh/g × V = mWh/g, and 1 mWh/g IS 1 Wh/kg — the two milli/kilo factors
       cancel exactly. No division. (This line divided by 1000 at first and
       printed "0 Wh/kg" for a perfectly ordinary LFP cell, which is the useful
       thing about a demonstration whose output a reader can sanity-check.) */
    const wh = qCell * state.voltage;                // Wh/kg = mAh/g × V

    const drop1 = qa > 0 ? (1 - qPair / qa) * 100 : 0;
    const drop2 = qa > 0 ? (1 - qCell / qa) * 100 : 0;

    outlet.querySelector('#mt-result').innerHTML = `
      <div class="panel"><div class="panel-head">The same two materials, three ways</div>
      <div class="panel-body" style="display:grid;gap:.6rem">

        <div class="mt-step">
          <div style="display:flex;justify-content:space-between;gap:.75rem;align-items:baseline;flex-wrap:wrap">
            <span class="l"><strong>1 · Half-cell capacity</strong> — ${esc(A.name)} against ${esc(A.halfCell?.against || 'metal')}</span>
            <span class="v">${qa.toFixed(0)} mAh/g</span></div>
          <div class="w">The anode's own theoretical capacity, per gram of anode active material. This is the
            number a paper reports and the number a supplier quotes.</div>
        </div>

        <div class="mt-step drop">
          <div style="display:flex;justify-content:space-between;gap:.75rem;align-items:baseline;flex-wrap:wrap">
            <span class="l"><strong>2 · Balanced full cell</strong> — per gram of anode <em>and</em> cathode</span>
            <span class="v">${qPair.toFixed(0)} mAh/g</span></div>
          <div class="w">Pairing ${esc(A.name)} with ${esc(C.name)} at N/P = ${r.toFixed(2)} needs
            ${massRatio.toFixed(2)} g of anode per gram of cathode. The cathode limits the cell, and its
            capacity is now spread over both. <strong>${drop1.toFixed(0)}% lower than step 1</strong>, and
            nothing about either material has changed.</div>
        </div>

        <div class="mt-step drop">
          <div style="display:flex;justify-content:space-between;gap:.75rem;align-items:baseline;flex-wrap:wrap">
            <span class="l"><strong>3 · Per gram of cell</strong> — everything included</span>
            <span class="v">${qCell.toFixed(0)} mAh/g</span></div>
          <div class="w">At ${(100 * state.activeFrac).toFixed(0)}% active material, the rest being binder,
            additive, collectors, separator, electrolyte and casing.
            <strong>${drop2.toFixed(0)}% lower than step 1.</strong></div>
        </div>

        <div class="mt-step">
          <div style="display:flex;justify-content:space-between;gap:.75rem;align-items:baseline;flex-wrap:wrap">
            <span class="l"><strong>Specific energy</strong> at ${state.voltage} V</span>
            <span class="v">${wh.toFixed(0)} Wh/kg</span></div>
          <div class="w">Capacity alone cannot be compared between chemistries that operate at different
            voltages — this is why. The voltage is the one you entered; EDMGLAB does not supply it.</div>
        </div>

        ${callout(`All four numbers are correct, and all four get called "capacity" in conversation.
          <strong>${qa.toFixed(0)} and ${qCell.toFixed(0)} differ by a factor of
          ${(qa / Math.max(qCell, 1e-9)).toFixed(1)}</strong> — before a single measurement has been made,
          and before anything has gone wrong. Whenever you read a capacity, the first question is which of
          these it is.`, 'info')}
      </div></div>`;
  }
}

/* ══════════════════════════════════════════════════════════
   One material
   ══════════════════════════════════════════════════════════ */

function detail(m, items) {
  const t = theoreticalCapacity(m.composition, m.electrons);
  const link = (id) => {
    const x = items.find((y) => y.id === id);
    return x ? `<a href="#/materials/${esc(id.replace(/^material\./, ''))}">${esc(x.name)}</a>` : `<code>${esc(id)}</code>`;
  };

  return `<div class="mt-detail">
    <p style="margin-bottom:1rem"><a class="btn btn-sm" href="#/materials">← All materials</a></p>
    ${pageHead(m.name, m.summary)}

    <div class="mt-grid" style="margin-bottom:1.5rem">
      <div class="panel"><div class="panel-head">Theoretical specific capacity</div><div class="panel-body">
        ${t ? `
          <div class="mt-num">${t.Q.toFixed(1)} <span class="mt-sub" style="font-size:var(--fs-sm)">mAh/g</span></div>
          <p class="xsmall muted" style="margin:.3rem 0 .8rem">${esc(m.capacityBasis || '')}</p>
          <div class="mt-deriv">M(${esc(m.basisFormula || '')}) = ${t.terms.map((x) =>
            `${x.n === 1 ? '' : x.n % 1 ? x.n.toFixed(4) + '×' : x.n + '×'}${x.el}(${x.w})`).join(' + ')}
       = ${t.M.toFixed(3)} g/mol

Q = n·F / (3.6·M)
  = ${m.electrons} × ${FARADAY} / (3.6 × ${t.M.toFixed(3)})
  = ${t.Q.toFixed(1)} mAh/g</div>
          <p class="xsmall muted" style="margin:.6rem 0 0">Computed, not quoted. Change the electron count or
            the formula unit in <code>data/materials.json</code> and this number changes with it.</p>`
        : `${callout(`<strong>No theoretical capacity exists for this material.</strong>
            ${esc(m.capacityBasis || '')}`, 'warn')}`}
      </div></div>

      <div class="panel"><div class="panel-head">Electrode reaction</div><div class="panel-body">
        <p class="eqn" style="font-size:var(--fs-md);margin:0 0 .6rem">${esc(m.reaction)}</p>
        <div class="in-kv" style="display:grid;gap:.35rem">
          <div style="display:flex;justify-content:space-between;gap:.6rem;padding:.35rem .55rem;background:var(--surface-2);border-radius:var(--r-sm)">
            <span class="small">Role</span><span class="small">${esc(m.role)}</span></div>
          <div style="display:flex;justify-content:space-between;gap:.6rem;padding:.35rem .55rem;background:var(--surface-2);border-radius:var(--r-sm)">
            <span class="small">Family</span><span class="small">${esc(m.family)}</span></div>
          <div style="display:flex;justify-content:space-between;gap:.6rem;padding:.35rem .55rem;background:var(--surface-2);border-radius:var(--r-sm)">
            <span class="small">Chemistry</span><span class="small">${(m.chemistry || []).map((c) => esc(CHEM[c] || c)).join(', ')}</span></div>
          <div style="display:flex;justify-content:space-between;gap:.6rem;padding:.35rem .55rem;background:var(--surface-2);border-radius:var(--r-sm)">
            <span class="small">Reported capacity</span><span class="small" style="color:var(--warn)">not recorded</span></div>
        </div>
        <p class="xsmall muted" style="margin:.6rem 0 0">A measured capacity belongs with its electrolyte,
          voltage window, rate, mass loading and cell configuration. None of those are here, so neither is it.</p>
      </div></div>
    </div>

    <section class="section">
      <div class="section-head"><h2>Half cell and full cell</h2>
        <span class="section-note">the same material, two configurations, two meanings</span></div>
      <div class="mt-hc">
        <div class="panel"><div class="panel-head">In a half cell${m.halfCell?.against ? ` — against ${esc(m.halfCell.against)}` : ''}</div>
          <div class="panel-body">
            <p class="small"><strong>What it measures.</strong> ${esc(m.halfCell?.whatItMeasures || '—')}</p>
            <p class="small" style="margin-bottom:0"><strong>What it hides.</strong> ${esc(m.halfCell?.whatItHides || '—')}</p>
          </div></div>
        <div class="panel"><div class="panel-head">In a full cell</div>
          <div class="panel-body">
            <p class="small">${esc(m.fullCell?.whatChanges || '—')}</p>
            ${(m.fullCell?.pairedWith || []).length ? `<p class="small" style="margin-bottom:0">
              <strong>Paired with.</strong> ${m.fullCell.pairedWith.map(link).join(' · ')}</p>` : ''}
          </div></div>
      </div>
    </section>

    <section class="section">
      <div class="section-head"><h2>What this number does not tell you</h2></div>
      <div class="panel"><div class="panel-body">
        <ul class="lim-list warn">${(m.cannotTell || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      </div></div>
    </section>

    ${electrolyteSection(m)}

    ${m.notes ? `<section class="section"><div class="panel"><div class="panel-body">
      <p class="small" style="margin:0">${esc(m.notes)}</p></div></div></section>` : ''}

    ${STYLE}
  </div>`;
}

/* ══════════════════════════════════════════════════════════
   Aqueous vs non-aqueous, per material
   ══════════════════════════════════════════════════════════
   The user asked for half cell and full cell across sodium, lithium and zinc
   "in aqueous and non-aqueous systems in wide range". This is that axis. It is
   PROSE and not numbers, on purpose: the operating potential of a given
   material in a given electrolyte is a measured quantity, and none of those
   were verifiable against a source in the session that wrote this module. What
   IS here is the reasoning and the cited window it rests on, which is the part
   a student can apply to a material that is not in this file at all.        */

const VIABLE = {
  yes: { label: 'Works', cls: 'yes' },
  no: { label: 'Does not work', cls: 'no' },
  conditional: { label: 'Conditional', cls: 'conditional' }
};

function electrolyteSection(m) {
  const ctx = m.electrolyteContext;
  if (!Array.isArray(ctx) || !ctx.length) return '';
  return `
    <section class="section">
      <div class="section-head"><h2>In aqueous and in non-aqueous electrolyte</h2>
        <span class="section-note">the electrolyte is not a background condition</span></div>
      <div class="mt-el">
        ${ctx.map((c) => {
          const v = VIABLE[c.viable] || { label: c.viable || '—', cls: 'conditional' };
          /* h3, not h4: the section head above is an h2, and skipping a level
             is what a screen reader reports as a broken outline. */
          return `<div class="mt-elc ${v.cls}">
            <h3>${esc(c.system === 'aqueous' ? 'Aqueous' : 'Non-aqueous')} —
              <span class="mt-sub" style="font-size:var(--fs-sm)">${esc(v.label)}</span></h3>
            <p class="typ">${esc(c.typical || '')}</p>
            <p>${esc(c.whatChanges || '')}</p>
            ${c.watch && c.watch !== '—'
              ? `<p class="wch"><strong>Watch:</strong> ${esc(c.watch)}</p>` : ''}
          </div>`;
        }).join('')}
      </div>
    </section>`;
}

/* ══════════════════════════════════════════════════════════
   ONE stylesheet for the whole module
   ══════════════════════════════════════════════════════════
   The index and the detail page used to carry their own <style> blocks, and
   both defined .mt-grid, .mt-num, .mt-sub and .mt-deriv — with DIFFERENT
   values. That works only because one view is ever on screen at a time, which
   is a coincidence rather than a design, and it is the same defect that has
   already bitten this codebase five times: one class, two definitions, no
   check. There is now one block; the two places that genuinely differ are
   scoped under .mt-detail, which detail() puts on its wrapper.             */
const STYLE = `
    <style>
      .mt-grid { display:grid; gap:1rem; grid-template-columns:1fr; align-items:start; }
      @media (min-width:1000px){ .mt-grid { grid-template-columns:minmax(0,1fr) minmax(0,1.25fr); } }
      .mt-detail .mt-grid { grid-template-columns:1fr; }
      @media (min-width:1000px){ .mt-detail .mt-grid { grid-template-columns:1fr 1fr; } }
      .mt-cards { display:grid; gap:.85rem; grid-template-columns:repeat(auto-fill,minmax(270px,1fr)); }
      .mt-card { display:block; border:1px solid var(--border); border-radius:var(--r-lg);
                 background:var(--surface); padding:.9rem 1rem; color:inherit; }
      .mt-card:hover { border-color:var(--accent); text-decoration:none; color:inherit; }
      .mt-card h3 { font-size:var(--fs-base); margin:0 0 .15rem; }
      .mt-q { font-family:var(--font-mono); font-size:var(--fs-lg); font-weight:700; color:var(--accent-strong); }
      .mt-q.none { font-size:var(--fs-sm); color:var(--warn); font-weight:600; }
      .mt-sub { font-size:var(--fs-2xs); color:var(--text-muted); font-family:var(--font-mono); }
      .mt-chips { display:flex; flex-wrap:wrap; gap:.3rem; margin-top:.5rem; }
      .mt-num { font-family:var(--font-mono); font-size:var(--fs-xl); font-weight:700; line-height:1.15; }
      .mt-detail .mt-num { font-size:var(--fs-2xl); color:var(--accent-strong); line-height:1.1; }
      .mt-step { display:grid; gap:.2rem; padding:.6rem .75rem; border-radius:var(--r-sm);
                 background:var(--surface-2); }
      .mt-step .l { font-size:var(--fs-sm); }
      .mt-step .v { font-family:var(--font-mono); font-weight:700; font-size:var(--fs-md); }
      .mt-step .w { font-size:var(--fs-xs); color:var(--text-2); max-width:60ch; }
      .mt-step.drop { border-left:3px solid var(--warn); }
      .mt-field { display:grid; gap:.3rem; margin-bottom:.8rem; }
      .mt-field select, .mt-field input {
        width:100%; font:inherit; font-size:var(--fs-sm); background:var(--surface-2); color:var(--text);
        border:1px solid var(--border); border-radius:var(--r-sm); padding:.45rem .55rem; min-height:38px; }
      .mt-deriv { font-family:var(--font-mono); font-size:var(--fs-xs); color:var(--text-2);
                  background:var(--surface-2); border-radius:var(--r-sm); padding:.7rem .85rem;
                  overflow-x:auto; white-space:pre-wrap; word-break:break-word; }
      .mt-hc { display:grid; gap:1rem; grid-template-columns:1fr; }
      @media (min-width:820px){ .mt-hc { grid-template-columns:1fr 1fr; } }

      /* ── electrolyte context ── */
      .mt-el { display:grid; gap:1rem; grid-template-columns:1fr; }
      @media (min-width:820px){ .mt-el { grid-template-columns:1fr 1fr; } }
      .mt-elc { border:1px solid var(--border); border-radius:var(--r-lg);
                background:var(--surface); padding:.9rem 1rem; }
      .mt-elc.yes { border-left:4px solid var(--ok); }
      .mt-elc.no { border-left:4px solid var(--danger, var(--warn)); }
      .mt-elc.conditional { border-left:4px solid var(--warn); }
      .mt-elc h3 { margin:0 0 .1rem; font-size:var(--fs-base); }
      .mt-elc .typ { font-size:var(--fs-xs); color:var(--text-muted); font-family:var(--font-mono);
                     margin:0 0 .6rem; }
      .mt-elc p { font-size:var(--fs-sm); margin:0 0 .5rem; }
      .mt-elc .wch { font-size:var(--fs-xs); color:var(--text-2); margin:0;
                     border-top:1px solid var(--border); padding-top:.5rem; }

      /* ── water window ──
         The SVG has a fixed viewBox and width:100%, so it scales to whatever
         column it is given and NEVER needs a scrollbar of its own — the
         standing requirement that a graph stays inside its window. Nothing
         here sets overflow:auto, deliberately. */
      .ww-grid { display:grid; gap:1rem; grid-template-columns:1fr; align-items:start; }
      @media (min-width:1040px){ .ww-grid { grid-template-columns:minmax(0,1.55fr) minmax(0,1fr); } }
      .ww-plot { background:var(--surface); border:1px solid var(--border);
                 border-radius:var(--r-lg); padding:.5rem; }
      .ww-plot svg { display:block; width:100%; height:auto; }
      .ww-ax { fill:var(--text-muted); font-size:15px; font-family:var(--font-mono); }
      .ww-axt { fill:var(--text-2); font-size:16px; }
      .ww-lbl { fill:var(--text); font-size:15px; font-family:var(--font-mono); }
      .ww-safe { fill:var(--accent); opacity:.13; }
      .ww-line { stroke:var(--accent-strong); stroke-width:2.5; fill:none; }
      .ww-gl { stroke:var(--border); stroke-width:1; }
      .ww-couple { stroke:var(--text-muted); stroke-width:1.5; stroke-dasharray:5 4; }
      .ww-couple.inside { stroke:var(--ok); stroke-dasharray:none; stroke-width:2.5; }
      .ww-dot { fill:var(--warn); }
      .ww-you { stroke:var(--warn); stroke-width:3; }
      .ww-ph { stroke:var(--text-2); stroke-width:1.5; stroke-dasharray:3 3; }
      .ww-rows { display:grid; gap:.3rem; }
      .ww-row { display:grid; grid-template-columns:1fr auto auto; gap:.5rem; align-items:center;
                padding:.4rem .6rem; border-radius:var(--r-sm); background:var(--surface-2);
                font-size:var(--fs-sm); }
      .ww-e { font-family:var(--font-mono); font-weight:700; }
      .ww-row.has-caution { grid-template-columns:1fr auto auto; }
      .ww-caution { grid-column:1 / -1; margin:.35rem 0 0; font-size:var(--fs-xs);
                    color:var(--chip-warn-fg); }
    </style>`;
