/**
 * EDMGLAB — Placeholder for modules not yet built.
 *
 * A module that exists in the navigation but has no view yet renders THIS,
 * not a 404. Being honest about what is not built — and naming the phase
 * that builds it — is better than an error page that implies something is
 * broken, and better than hiding the module until it is ready.
 */

import { esc, pageHead, callout } from '../ui.js';

const PHASE_NOTES = {
  1:  'Concept and formula records, generic detail renderers, Learn/Research toggle.',
  2:  'The generic calculator engine and the first six calculators.',
  3:  'Battery tester concepts, the schedule step language, and the protocol builder.',
  4:  'CSV import in a Web Worker, column mapping, and automatic plotting.',
  5:  'Potentiostat and galvanostat principles, the three-electrode system, and the method library.',
  6:  'CV and EIS import, b-value analysis, Dunn deconvolution, Nyquist and Bode plots.',
  7:  'The provenance-tagged material database with browse, filter and detail views.',
  8:  'Supercapacitor, lithium-ion, sodium-ion and ion-capacitor knowledge structures.',
  9:  'Electrode preparation SOPs and the characterisation techniques.',
  10: 'The symptom-based troubleshooting engine, linked from calculators and imports.',
  11: 'Interactive concept animations built on the shared engine.',
  12: 'The quiz engine, progress tracking and the aggregated glossary.'
};

export function render(outlet, { module }) {
  const note = PHASE_NOTES[module.phase] || '';
  outlet.innerHTML = `
    ${pageHead(module.label, 'This module has not been built yet.')}

    ${callout(`<strong>Arrives in Phase ${module.phase}.</strong> ${esc(note)}`, 'info')}

    <div class="panel" style="margin-top:1.5rem">
      <div class="panel-head">Why you are seeing this</div>
      <div class="panel-body">
        <p class="small">EDMGLAB is built in phases, and every phase ends with a working,
        deployable application rather than a half-finished one. This module is already
        wired into navigation, routing and the data layer — only its content and view
        are still to come.</p>
        <p class="small muted" style="margin-bottom:0">Modules with a
        <span class="nav-phase" style="position:static">P<em>n</em></span> marker in the
        sidebar are in the same state.</p>
      </div>
    </div>

    <p style="margin-top:1.5rem"><a class="btn" href="#/">Back to dashboard</a></p>`;

  return { destroy() {} };
}
