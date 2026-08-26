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

  const stages = PATHWAY.map((s, i) => {
    const mod = MODULES.find((m) => m.id === s.module);
    const ready = !!mod?.view;
    return `<a class="pw-stage${ready ? '' : ' is-pending'}" href="${esc(mod?.route || '#/')}"
              title="${ready ? 'Open ' + esc(mod.label) : esc(mod?.label || s.label) + ' — arrives in phase ' + (mod?.phase ?? '?')}">
              <span class="pw-n">${String(i + 1).padStart(2, '0')}</span>
              <span class="pw-l">${esc(s.label)}</span>
            </a>`;
  }).join('<span class="pw-arrow" aria-hidden="true">→</span>');

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
      .pathway { display:flex; flex-wrap:wrap; align-items:stretch; gap:.4rem; }
      .pw-stage { display:flex; flex-direction:column; gap:2px; min-width:104px; flex:1 1 104px;
        padding:.55rem .7rem; background:var(--surface); border:1px solid var(--border);
        border-radius:var(--r-md); color:var(--text); text-decoration:none;
        transition:border-color var(--dur-fast) var(--ease), background var(--dur-fast) var(--ease); }
      .pw-stage:hover { border-color:var(--accent); background:var(--surface-2); text-decoration:none; }
      .pw-stage.is-pending { opacity:.55; }
      .pw-n { font-family:var(--font-mono); font-size:.68rem; color:var(--accent); font-weight:600; }
      .pw-l { font-size:var(--fs-sm); font-weight:550; line-height:1.25; }
      .pw-arrow { display:flex; align-items:center; color:var(--text-muted); font-size:.85rem; }
      @media (max-width:600px){ .pw-arrow{ display:none; } .pw-stage{ flex:1 1 calc(50% - .4rem); } }
    </style>`;

  return { destroy() {} };
}

const DESCRIPTIONS = {
  dashboard: 'This page — the research pathway and current build status.',
  demo: 'Proves the shared animation engine, diagram engine, simulation labelling and chart layer.',
  health: 'Validates every data file: schemas, cross-references, provenance and troubleshooting rules.'
};

const NEXT_UP = [
  { phase: 1, label: 'Fundamentals + Formula Library', adds: 'Concept and equation records with Learn/Research modes' },
  { phase: 2, label: 'Calculator engine',              adds: 'Input → Equation → Substitution → Result → Interpretation' },
  { phase: 3, label: 'Battery Tester',                 adds: 'Instrument concepts, step language, protocol builder' },
  { phase: 4, label: 'Data import + charting',         adds: 'Drag in a cycler CSV; get plots and calculations' },
  { phase: 5, label: 'Electrochemical Workstation',    adds: 'Potentiostat/galvanostat, three-electrode system, methods' }
];
