/**
 * EDMGLAB — Dashboard (Architecture v0.2 §C.7)
 *
 * Deliberately not a marketing homepage. The centrepiece is the research
 * pathway itself, rendered as clickable stages — the literal, navigable form
 * of the core philosophy, rather than a diagram in a document.
 *
 * Nothing here blocks on a network call, so it opens instantly, including
 * offline. The one section that reads a file fills itself in afterwards.
 *
 * ── WHY THIS FILE WAS WRONG FOR MONTHS ──
 *
 * Every other module got revisited as the project grew. The landing page did
 * not, and it quietly kept telling visitors it was a "Phase 0 build" whose
 * content "arrives module by module", under a Coming next table listing five
 * modules that had been finished for weeks. Fourteen module cards read
 * "Phase undefined", because the phase numbers they printed had been removed
 * from the nav model as each one shipped.
 *
 * All three were the same defect this project keeps meeting: A HAND-MAINTAINED
 * LIST THAT NOTHING CHECKS. So the fix is not to correct the lists — it is to
 * derive them, and to make the one that cannot be derived fail a test when it
 * falls behind. tools/dashboard-test.mjs is that test.
 */

import { MODULES } from '../nav.js';
import { esc, pageHead, section, card, cardGrid, callout } from '../ui.js';
import * as store from '../lib/storage.js';

/**
 * The research pathway. Each stage maps to the module that teaches it.
 * `ready` is derived from the module registry, so stages light up
 * automatically as phases land — no separate list to keep in sync.
 */
const PATHWAY = [
  { label: 'Concept',            module: 'fundamentals' },
  { label: 'Chemistry',          module: 'chemistry' },
  { label: 'Material',           module: 'materials' },
  { label: 'Preparation',        module: 'preparation' },
  { label: 'Characterisation',   module: 'characterization' },
  { label: 'Electrode',          module: 'preparation' },
  { label: 'Instrument',         module: 'battery-tester' },
  { label: 'Testing',            module: 'workstation' },
  { label: 'Calculation',        module: 'calculators' },
  { label: 'Data analysis',      module: 'import' },
  { label: 'Interpretation',     module: 'formulas' },
  { label: 'Troubleshooting',    module: 'troubleshooting' }
];

export function render(outlet) {
  const built = MODULES.filter((m) => m.view);
  const pending = MODULES.filter((m) => !m.view);
  const recent = store.get('recent') || [];

  // A grid rather than a row of boxes joined by arrows: arrows break badly
  // when the sequence wraps, and the numerals already carry the order.
  const stages = PATHWAY.map((s, i) => {
    const mod = MODULES.find((m) => m.id === s.module);
    const ready = !!mod?.view;
    return `<a class="pw-stage${ready ? '' : ' is-pending'}" href="${esc(mod?.route || '#/')}"
              title="${ready ? 'Open ' + esc(mod.label) : esc(mod?.label || s.label) + ' — arrives in phase ' + (mod?.phase ?? '?')}">
              <span class="pw-n">${String(i + 1).padStart(2, '0')}</span>
              <span class="pw-l">${esc(s.label)}</span>
            </a>`;
  }).join('');

  outlet.innerHTML = `
    ${pageHead('EDMGLAB',
      'Energy Devices and Materials Group — an interactive research and learning platform for supercapacitors, batteries, electrode materials and electrochemical analysis.')}

    ${pending.length
      ? callout(`<strong>${pending.length} module${pending.length === 1 ? '' : 's'} still to build.</strong>
          Anything marked <span class="nav-phase" style="position:static">P<em>n</em></span> in the sidebar
          says which roadmap phase builds it.`, 'info')
      : callout(`<strong>Every module is built, and none of the content has been reviewed.</strong>
          The platform says so under every page and will keep saying so until somebody who knows the field
          says otherwise. <a href="#/review">Content Review</a> is where that gets recorded — start with the
          safety section, with your safety officer.`, 'warn')}

    ${section('The research pathway',
      `<div class="pathway">${stages}</div>
       <p class="small muted" style="margin-top:.9rem">
         Every stage is a module, and every module cross-links to the others through the
         shared knowledge graph. A student can enter at any point and follow the chain
         forwards to a result or backwards to a cause.
       </p>`)}

    ${section('Available now',
      cardGrid(built.map((m) => card({
        href: m.route,
        title: m.label,
        sub: DESCRIPTIONS[m.id] || ''
        /* No phase chip. It printed "Phase undefined" on fourteen cards,
           because a module's phase number is deleted from the nav model when
           it ships — and on the ten that still had one it was answering a
           question nobody on a finished platform is asking. */
      }))))}

    ${recent.length ? section('Continue where you left off',
      cardGrid(recent.slice(0, 4).map((r) => card({ href: r.route, title: r.title, sub: r.sub || '' })))
    ) : ''}

    ${section('What still needs doing',
      `<div id="dash-todo" class="stack-sm">
         ${pending.length ? pending.map((m) => todoRow(
             `Build ${esc(m.label)}`, `Roadmap phase ${m.phase ?? '?'}.`, m.route)).join('') : ''}
       </div>`,
      'derived, not a list somebody remembers to update')}

    <style>
      /* Column counts are fixed to divisors of 12 rather than auto-fill.
         auto-fill leaves ragged empty cells on the last row — which read as
         a rendering fault, not a design. 12 = 6x2 = 4x3 = 3x4 = 2x6. */
      .pathway {
        display:grid; gap:1px;
        grid-template-columns:repeat(6, 1fr);
        background:var(--border); border:1px solid var(--border);
        border-radius:var(--r-md); overflow:hidden;
      }
      @media (max-width:1180px){ .pathway { grid-template-columns:repeat(4, 1fr); } }
      @media (max-width:820px) { .pathway { grid-template-columns:repeat(3, 1fr); } }
      /* 1px gaps over a border-coloured background give clean hairline rules
         between tiles without doubling borders where they meet. */
      .pw-stage {
        display:flex; flex-direction:column; gap:3px;
        padding:.6rem .75rem; background:var(--surface);
        color:var(--text); text-decoration:none; position:relative;
        transition:background var(--dur-fast) var(--ease);
      }
      .pw-stage:hover { background:var(--surface-2); text-decoration:none; }
      .pw-stage:hover .pw-l { color:var(--accent-strong); }
      .pw-stage::after {
        content:""; position:absolute; left:0; top:0; bottom:0; width:2px;
        background:var(--accent); opacity:0;
        transition:opacity var(--dur-fast) var(--ease);
      }
      .pw-stage:hover::after { opacity:1; }
      .pw-stage.is-pending { background:color-mix(in srgb, var(--surface) 72%, var(--bg)); }
      .pw-stage.is-pending .pw-n { color:var(--text-muted); }
      .pw-stage.is-pending .pw-l { color:var(--text-muted); }
      .pw-n { font-family:var(--font-mono); font-size:var(--fs-2xs); color:var(--accent);
        font-weight:650; letter-spacing:.06em; }
      .pw-l { font-size:.8125rem; font-weight:550; line-height:1.3; }
      @media (max-width:560px){ .pathway { grid-template-columns:repeat(2, 1fr); } }
      .dash-todo-row { display:flex; justify-content:space-between; align-items:center; gap:1rem;
        padding:.7rem .85rem; background:var(--surface); border:1px solid var(--border);
        border-radius:var(--r-md); }
      .dash-todo-row .xsmall { max-width:72ch; margin-top:.15rem; }
    </style>`;

  fillTodo(outlet.querySelector('#dash-todo'));

  return { destroy() {} };
}

/**
 * One line per module, and EVERY built module needs one.
 *
 * This is the one list here that cannot be derived — a description is written,
 * not computed. So tools/dashboard-test.mjs fails when a module in the nav
 * model has no entry, which is what stops this going the way of the roadmap
 * table above it. Twenty modules were rendering a blank subtitle before that
 * check existed.
 */
const DESCRIPTIONS = {
  dashboard: 'This page — the research pathway and what is left to do.',
  pathway: 'The eleven stages of an experiment, walked for one material at a time, saying where the platform holds nothing.',

  fundamentals: 'The quantities themselves — charge, potential, capacitance versus capacity, and what "specific" is per.',
  chemistry: 'How charge is actually stored: the seven mechanisms, and how to tell them apart from a curve.',
  glossary: '35 terms, each as a definition plus the misreading it invites.',
  learning: '18 judgement questions where every option explains itself, including the wrong ones.',

  materials: '24 electrode materials across Li, Na, K, Mg, Zn, Pb and Ni. No capacity is stored — each is computed from stoichiometry with the arithmetic shown.',
  preparation: 'Formulation to punched electrode, with the decisions at each step that change a result.',
  characterization: 'Eleven techniques, each stating what it cannot tell you as clearly as what it can.',
  'battery-tester': 'Cell formats, the step language a cycler actually speaks, and a protocol builder.',
  workstation: 'Potentiostat and galvanostat, the three-electrode cell, and the methods that run on it.',
  protocols: 'Assemble a schedule from step structures — formation, rate ladder, long-term cycling.',
  instruments: 'Your own machines. Ships empty: specifications come from your manuals, quirks from your benches.',
  'which-instrument': 'A decision tree from the question you have to the method that answers it.',

  formulas: '28 equations, each stating the cell configuration it is valid in.',
  calculators: 'Input, equation, substitution, result, interpretation — the working shown at every step.',
  import: 'Drag in a cycler or workstation CSV and get plots and calculations. The file never leaves this tab.',
  analysis: 'b-value and Dunn deconvolution, on a simulated series whose answer is known in advance and on your own voltammograms.',
  troubleshooting: 'Symptom first, several possible causes, and the diagnostic that separates them.',

  demo: 'Proves the shared animation engine, diagram engine, simulation labelling and chart layer.',
  health: 'Validates every data file: schemas, cross-references, provenance and troubleshooting rules.',
  review: 'Record a verdict on any of the 285 draft entries. Open to everyone in the group.',
  admin: 'Optional 4-digit PIN gate for shared lab machines. Off by default — and a soft gate, not security.',
  suggest: 'Report something wrong on any page; it already knows which page and which record.'
};

/** One row in "what still needs doing". */
function todoRow(title, detail, href) {
  return `<div class="dash-todo-row">
    <div><strong>${title}</strong><div class="xsmall muted">${detail}</div></div>
    ${href ? `<a class="btn btn-sm" href="${href}">Open</a>` : ''}
  </div>`;
}

/**
 * The rows that need a file read. Appended after render so the page never
 * waits on them — both files are small and service-worker cached, but the
 * dashboard is the landing page and should paint before anything else.
 *
 * Every row here is DERIVED. If somebody fills in instruments.json, that row
 * disappears on its own; nobody has to remember to delete it.
 */
async function fillTodo(el) {
  if (!el) return;
  const rows = [];
  const read = async (f) => {
    try {
      const res = await fetch(new URL(`../../data/${f}`, import.meta.url).href, { cache: 'no-cache' });
      return res.ok ? await res.json() : null;
    } catch { return null; }
  };

  const [review, instruments] = await Promise.all([read('review.json'), read('instruments.json')]);

  const signedOff = (review?.finalised || []).length;
  rows.push(todoRow(
    signedOff ? `Review the rest of the content` : 'Review the content',
    signedOff
      ? `${signedOff} entr${signedOff === 1 ? 'y is' : 'ies are'} signed off. Everything else is still draft.`
      : 'None of the 285 entries has been checked by anyone in the group. Start with the safety section.',
    '#/review'));

  const machine = (instruments?.items || [])[0];
  const specsFilled = Object.values(machine?.specs || {})
    .filter((v) => v && typeof v === 'object' && v.value !== null && v.value !== undefined).length;
  if (machine && (!machine.model || specsFilled === 0)) {
    rows.push(todoRow('Fill in your instruments',
      `${machine.vendor || 'The workstation'} is recorded, but the model, the specifications and the quirks `
      + 'are not. Those come from your manuals and your benches — nothing else can supply them.',
      '#/instruments'));
  }

  el.insertAdjacentHTML('beforeend', rows.join(''));
}

