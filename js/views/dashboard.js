/**
 * EDMGLAB — Dashboard (Architecture v0.2 §C.7)
 *
 * Deliberately not a marketing homepage. The centrepiece is the research
 * pathway itself, rendered as clickable stages — the literal, navigable form
 * of the core philosophy, rather than a diagram in a document.
 *
 * Nothing here needs a network call beyond already-cached JSON, so it opens
 * instantly, including offline.
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

    ${callout(`<strong>Phase 0 build.</strong> The application shell, animation engine, diagram engine and
      data layer are in place. Scientific content arrives module by module — each item in the sidebar marked
      <span class="nav-phase" style="position:static">P<em>n</em></span> shows which roadmap phase builds it.
      Try <a href="#/demo">Engine Demo</a> to see the foundation working.`, 'info')}

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
        sub: DESCRIPTIONS[m.id] || '',
        chips: ['Phase ' + m.phase]
      }))))}

    ${recent.length ? section('Continue where you left off',
      cardGrid(recent.slice(0, 4).map((r) => card({ href: r.route, title: r.title, sub: r.sub || '' })))
    ) : ''}

    ${section('Coming next',
      `<div class="table-wrap"><table class="stackable">
        <thead><tr><th>Phase</th><th>Module</th><th>What it adds</th></tr></thead>
        <tbody>${NEXT_UP.map((r) => `<tr>
          <td data-label="Phase"><span class="chip">P${r.phase}</span></td>
          <td data-label="Module"><strong>${esc(r.label)}</strong></td>
          <td data-label="What it adds">${esc(r.adds)}</td>
        </tr>`).join('')}</tbody>
      </table></div>`,
      'from the development roadmap')}

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
      .pw-n { font-family:var(--font-mono); font-size:.65rem; color:var(--accent);
        font-weight:650; letter-spacing:.06em; }
      .pw-l { font-size:.8125rem; font-weight:550; line-height:1.3; }
      @media (max-width:560px){ .pathway { grid-template-columns:repeat(2, 1fr); } }
    </style>`;

  return { destroy() {} };
}

const DESCRIPTIONS = {
  dashboard: 'This page — the research pathway and current build status.',
  demo: 'Proves the shared animation engine, diagram engine, simulation labelling and chart layer.',
  health: 'Validates every data file: schemas, cross-references, provenance and troubleshooting rules.',
  admin: 'Optional 4-digit PIN gate for shared lab machines. Off by default — and a soft gate, not security.'
};

const NEXT_UP = [
  { phase: 1, label: 'Fundamentals + Formula Library', adds: 'Concept and equation records with Learn/Research modes' },
  { phase: 2, label: 'Calculator engine',              adds: 'Input → Equation → Substitution → Result → Interpretation' },
  { phase: 3, label: 'Battery Tester',                 adds: 'Instrument concepts, step language, protocol builder' },
  { phase: 4, label: 'Data import + charting',         adds: 'Drag in a cycler CSV; get plots and calculations' },
  { phase: 5, label: 'Electrochemical Workstation',    adds: 'Potentiostat/galvanostat, three-electrode system, methods' }
];
