/**
 * EDMGLAB — Fundamentals (Roadmap P1)
 *
 * The CONCEPT stage: the quantities every other module is built from, and the
 * entry point for someone who has just joined the group.
 *
 * ────────────────────────────────────────────────────────────────────────
 *  "BETTER THAN WHAT?" — THE DEMONSTRATION THIS MODULE EXISTS FOR
 * ────────────────────────────────────────────────────────────────────────
 *
 * "Specific" is the most abused word in this field, because it means "divided
 * by something" and the something is almost never stated. Two electrodes are
 * set up side by side and the same measurement is expressed on six bases —
 * device, per gram of active material, per gram of electrode, per square
 * centimetre, per cubic centimetre, per gram of device. The ranking between
 * them FLIPS between bases, from geometry alone, with no difference in the
 * material.
 *
 * That is not a subtlety. It is the mechanism behind a large fraction of the
 * "record-breaking" claims in the supercapacitor literature: a very thin, very
 * light coating maximises the gravimetric number while making the areal and
 * volumetric numbers unremarkable. Nobody has lied; a basis was chosen.
 *
 * The arithmetic here is trivial — that is the point. Nothing is modelled,
 * nothing is simulated, and the numbers are whatever the user types. What the
 * page contributes is putting all six divisions on screen at once, where the
 * rank flip is impossible to miss.
 */

import { esc, pageHead, callout, notAuthored } from '../ui.js';
import * as data from '../data.js';
import { sig } from '../lib/expr.js';

const SECTIONS = [
  { id: 'concepts',  label: 'The quantities' },
  { id: 'compare',   label: 'Better than what?' },
  { id: 'reference', label: 'Quick reference' }
];

export async function render(outlet, ctx) {
  const payload = await data.load('concepts');
  const items = payload.items || [];

  if (!items.length) {
    outlet.innerHTML = pageHead('Fundamentals', '') + notAuthored('The fundamentals content');
    return { destroy() {} };
  }

  const active = SECTIONS.some((s) => s.id === ctx?.params?.section) ? ctx.params.section : 'concepts';

  outlet.innerHTML = `
    ${pageHead('Fundamentals',
      'The quantities everything else is built from — each one in a plain version and a research version of the same record.')}

    <nav class="tabbar" role="tablist" aria-label="Fundamentals sections">
      ${SECTIONS.map((s) => `<a class="tab${s.id === active ? ' is-active' : ''}" role="tab"
        aria-selected="${s.id === active}" href="#/fundamentals/${s.id}">${esc(s.label)}</a>`).join('')}
    </nav>

    <div id="fd-body"></div>
    <style>${CSS}</style>`;

  const host = outlet.querySelector('#fd-body');
  if (active === 'compare') sectionCompare(host);
  else if (active === 'reference') sectionReference(host, items, payload);
  else sectionConcepts(host, items, payload);

  return { destroy() {} };
}

/* ════════════════════════════════════════════════════════════
   The quantities
   ════════════════════════════════════════════════════════════ */

function sectionConcepts(host, items, payload) {
  const cats = payload.categories || [];

  host.innerHTML = `
    ${callout(`<strong>Two versions of every record, one switch.</strong> The
      <em>Learn</em> / <em>Research</em> control in the header chooses which version of each concept
      below is shown. They are the same record rather than two pages, so they cannot drift apart —
      and switching mid-read is the fastest way to see how a plain statement and a rigorous one
      relate to each other.`, 'info')}

    ${cats.map((c) => {
      const list = items.filter((x) => x.category === c.id);
      if (!list.length) return '';
      return `<section class="section">
        <div class="section-head"><h2>${esc(c.label)}</h2>
          <span class="section-note">${list.length} concept${list.length === 1 ? '' : 's'}</span></div>
        <div class="concept-list">${list.map(conceptCard).join('')}</div>
      </section>`;
    }).join('')}

    ${payload.closing ? callout(esc(payload.closing), 'warn') : ''}`;
}

function conceptCard(c) {
  const l = c.learnMode || {}, r = c.researchMode || {};
  return `<div class="concept"><details>
    <summary>
      <span class="fd-sym">${esc(c.symbol || '')}</span>
      <span class="fd-t">${esc(c.title)}</span>
      ${c.siUnit ? `<span class="fd-u">${esc(c.siUnit)}</span>` : ''}
    </summary>
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
        ${r.limitations?.length ? `<div><h4>Limitations</h4><ul class="lim-list warn">${r.limitations.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
        ${r.researchConsiderations?.length ? `<div><h4>Research considerations</h4><ul class="lim-list">${r.researchConsiderations.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
      </div>
      ${c.interactive?.route ? `<div class="callout callout-info" style="margin-top:.5rem">
        <strong>Interactive.</strong>
        <a href="${esc(c.interactive.route)}">${esc(c.interactive.label)} →</a></div>` : ''}
    </div>
  </details></div>`;
}

/* ════════════════════════════════════════════════════════════
   "Better than what?" — the normalisation comparison
   ════════════════════════════════════════════════════════════ */

/* Two electrodes, chosen to make the point rather than to describe anything:
   A is the thin, light coating that maximises the gravimetric number;
   B is the thicker, heavier one that wins on area and volume. */
const START = {
  A: { name: 'Electrode A — thin coating', C: 0.10, mAct: 0.4, frac: 0.8, area: 1.0, thick: 8 },
  B: { name: 'Electrode B — thick, calendered coating', C: 1.10, mAct: 6.0, frac: 0.8, area: 1.0, thick: 80 }
};

/** Every basis is the same measurement divided by something different. */
const BASES = [
  { id: 'device', label: 'Cell capacitance', unit: 'F',
    calc: (e) => e.C,
    good: 'What the device actually does. Normalised to nothing, so it cannot be gamed — and cannot be compared between different sizes.' },
  { id: 'grav', label: 'Per gram of ACTIVE material', unit: 'F/g',
    calc: (e) => e.C / (e.mAct / 1000),
    good: 'The material figure of merit, and the one most often quoted. Rewards thin, light coatings — which is exactly why it is the one most often quoted.' },
  { id: 'gravE', label: 'Per gram of the whole electrode', unit: 'F/g',
    calc: (e) => e.C / (e.mAct / e.frac / 1000),
    good: 'Includes binder and conductive additive. Always lower than the active-only figure, and closer to what a device would see.' },
  { id: 'areal', label: 'Per square centimetre', unit: 'mF/cm²',
    calc: (e) => (e.C / e.area) * 1000,
    good: 'What matters for a footprint-limited device — a wearable, a microdevice, anything with fixed area. Rewards thick coatings.' },
  { id: 'vol', label: 'Per cubic centimetre of coating', unit: 'F/cm³',
    calc: (e) => e.C / (e.area * (e.thick / 10000)),
    good: 'What matters when space is the constraint. Rewards density, and punishes the porosity that gravimetric numbers reward.' },
  { id: 'gravDev', label: 'Per gram of both electrodes', unit: 'F/g',
    calc: (e) => e.C / ((e.mAct / e.frac / 1000) * 2),
    good: 'A crude device-level estimate that still ignores electrolyte, separator, collectors and packaging — so it remains optimistic by a wide margin.' }
];

function sectionCompare(host) {
  const st = JSON.parse(JSON.stringify(START));

  host.innerHTML = `
    <section class="section">
      <div class="section-head"><h2>Better than what?</h2>
        <span class="section-note">the same two electrodes, six ways</span></div>

      ${callout(`<strong>"Specific" means "divided by something", and the something is almost never
        stated.</strong> Below are two electrodes and one measurement each, expressed on six bases.
        Watch the ranking flip. Nothing about the materials changes between columns — only what the
        measurement was divided by.`, 'warn')}

      <div class="fd-inputs" id="fd-in"></div>
      <div id="fd-out"></div>
    </section>`;

  const defs = [
    { key: 'C', label: 'Measured cell capacitance', unit: 'F', step: 0.01, min: 0.001 },
    { key: 'mAct', label: 'Active material mass', unit: 'mg', step: 0.1, min: 0.01 },
    { key: 'frac', label: 'Active fraction of the coating', unit: '0–1', step: 0.05, min: 0.1, max: 1 },
    { key: 'area', label: 'Electrode area', unit: 'cm²', step: 0.1, min: 0.01 },
    { key: 'thick', label: 'Coating thickness', unit: 'µm', step: 1, min: 1 }
  ];

  const inHost = host.querySelector('#fd-in');
  inHost.innerHTML = ['A', 'B'].map((k) => `
    <div class="panel"><div class="panel-head">${esc(st[k].name)}</div>
      <div class="panel-body"><div class="fd-fields">
        ${defs.map((d) => `<label class="fd-f">
          <span class="field-label">${esc(d.label)} (${esc(d.unit)})</span>
          <input type="number" data-e="${k}" data-k="${d.key}" value="${st[k][d.key]}"
            step="${d.step}" min="${d.min}" ${d.max ? `max="${d.max}"` : ''} inputmode="decimal">
        </label>`).join('')}
      </div></div></div>`).join('');

  inHost.querySelectorAll('[data-k]').forEach((inp) => inp.addEventListener('input', () => {
    const v = parseFloat(inp.value);
    if (Number.isFinite(v) && v > 0) { st[inp.dataset.e][inp.dataset.k] = v; draw(); }
  }));

  function draw() {
    const out = host.querySelector('#fd-out');
    const rows = BASES.map((b) => {
      const a = b.calc(st.A), c = b.calc(st.B);
      return { b, a, c, winner: a > c ? 'A' : c > a ? 'B' : '—', ratio: Math.max(a, c) / Math.min(a, c) };
    });
    const winsA = rows.filter((r) => r.winner === 'A').length;
    const winsB = rows.filter((r) => r.winner === 'B').length;

    out.innerHTML = `
      <div class="table-wrap" style="margin-top:1rem"><table class="stackable fd-cmp">
        <thead><tr><th>Basis</th><th>Electrode A</th><th>Electrode B</th><th>Better</th></tr></thead>
        <tbody>${rows.map((r) => `<tr>
          <td data-label="Basis"><strong>${esc(r.b.label)}</strong>
            <div class="xsmall muted">${esc(r.b.good)}</div></td>
          <td data-label="Electrode A" class="num ${r.winner === 'A' ? 'win' : ''}">${sig(r.a, 3)} ${esc(r.b.unit)}</td>
          <td data-label="Electrode B" class="num ${r.winner === 'B' ? 'win' : ''}">${sig(r.c, 3)} ${esc(r.b.unit)}</td>
          <td data-label="Better"><span class="fd-w fd-w-${esc(r.winner)}">${esc(r.winner)}</span>
            <span class="xsmall muted">${sig(r.ratio, 3)}×</span></td>
        </tr>`).join('')}</tbody>
      </table></div>

      <div class="callout ${winsA && winsB ? 'callout-danger' : 'callout-ok'}" style="margin-top:1rem">
        ${winsA && winsB
          ? `<strong>Electrode A wins on ${winsA} bases and Electrode B on ${winsB}.</strong>
             Both authors can write "outperforms" truthfully about the same pair of electrodes, and
             both would be right. The question "which is better?" has no answer until the application
             names the constraint — mass, footprint, or volume. A paper that reports only the basis it
             wins on has not lied, and has not told you anything either.`
          : `<strong>One electrode currently wins on every basis.</strong> Change the thickness or the
             loading and watch the ranking break apart — a thin, light coating maximises the gravimetric
             figure while making the areal and volumetric figures unremarkable, and the reverse.`}
      </div>

      <div class="callout" style="margin-top:.6rem">
        <strong>Nothing here is modelled.</strong> These are six divisions of numbers you typed.
        The page contributes only putting them on screen together — which is the one thing a paper
        reporting a single basis cannot do for you.
      </div>

      <p class="small" style="margin-top:1rem;max-width:76ch">
        Reporting practice that follows from this: state the basis every time, report the mass loading
        alongside every gravimetric number, and give two or three bases rather than the flattering one.
        See <a href="#/formula/mass_loading">mass loading</a> and
        <a href="#/formulas">the formula library</a>, where every record states the normalisation it uses.
      </p>`;
  }

  draw();
}

/* ════════════════════════════════════════════════════════════
   Quick reference
   ════════════════════════════════════════════════════════════ */

function sectionReference(host, items, payload) {
  const cats = payload.categories || [];
  host.innerHTML = `
    <p class="small" style="max-width:76ch;margin-bottom:1rem">
      Symbols and SI units for every quantity in this module. Everything in EDMGLAB is evaluated in SI
      internally, whatever units you type into a calculator — which is what stops mA being read as A.
    </p>
    <div class="table-wrap"><table class="stackable">
      <thead><tr><th>Quantity</th><th>Symbol</th><th>SI unit</th><th>Group</th></tr></thead>
      <tbody>${items.map((c) => `<tr>
        <td data-label="Quantity"><a href="#/fundamentals/concepts">${esc(c.title)}</a></td>
        <td data-label="Symbol"><code>${esc(c.symbol || '—')}</code></td>
        <td data-label="SI unit"><code>${esc(c.siUnit || '—')}</code></td>
        <td data-label="Group">${esc((cats.find((x) => x.id === c.category) || {}).label || c.category || '')}</td>
      </tr>`).join('')}</tbody>
    </table></div>`;
}

const CSS = `
  .fd-sym { font-family:var(--font-mono); font-size:var(--fs-sm); font-weight:700;
    color:var(--accent-strong); margin-right:.5rem; }
  .fd-t { font-weight:600; }
  .fd-u { font-family:var(--font-mono); font-size:var(--fs-xs); color:var(--text-muted);
    margin-left:.5rem; }
  .fd-inputs { display:grid; gap:1rem; grid-template-columns:1fr; margin-top:1rem; }
  @media (min-width:900px){ .fd-inputs { grid-template-columns:1fr 1fr; } }
  .fd-fields { display:grid; gap:.6rem; grid-template-columns:1fr; }
  @media (min-width:560px){ .fd-fields { grid-template-columns:1fr 1fr; } }
  .fd-f { display:grid; gap:.2rem; }
  .fd-f input { background:var(--surface-2); color:var(--text); border:1px solid var(--border);
    border-radius:var(--r-sm); padding:.35rem .5rem; min-height:34px; width:100%;
    font-family:var(--font-mono); font-size:var(--fs-sm); }
  .fd-cmp td.num { font-family:var(--font-mono); }
  .fd-cmp td.win { color:var(--accent-strong); font-weight:650; }
  .fd-w { display:inline-block; font-family:var(--font-mono); font-weight:700; margin-right:.4rem; }
  .fd-w-A { color:var(--series-1); }
  .fd-w-B { color:var(--series-5); }
`;
