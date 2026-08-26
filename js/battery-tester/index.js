/**
 * EDMGLAB — Battery Tester module (Instrumentation spec §1–§10)
 *
 * Stage 1B scope, per spec §42:
 *   1 landing page · 2 instrument block diagram · 3 CC animation
 *   4 CV animation · 5 CC-CV animation · 6 charge/discharge animation
 *   7 protocol builder · 8 voltage–time graph
 *
 * Structure: one module with linkable sub-sections (#/battery-tester/principles),
 * so a supervisor can send a student straight to the part they need. Each
 * section mounts lazily and is torn down on leaving, so animations and charts
 * never accumulate.
 *
 * Content comes from data/battery-tester/*.json. Nothing scientific is
 * hard-coded here — this file is composition only.
 */

import { esc, pageHead, callout, notAuthored } from '../ui.js';
import * as data from '../data.js';
import { mountScene } from '../lib/anim-engine.js';
import { renderDiagram } from '../lib/diagram.js';
import { ccScene, cvScene, ccCvScene, cellScene } from './animations.js';
import { renderMethodList } from '../lib/method-view.js';

const SECTIONS = [
  { id: 'overview',   label: 'Overview' },
  { id: 'instrument', label: 'Instrument' },
  { id: 'methods',    label: 'Methods' },
  { id: 'principles', label: 'CC · CV · CC-CV' },
  { id: 'transport',  label: 'Inside the cell' },
  { id: 'protocol',   label: 'Protocol builder' }
];

export async function render(outlet, ctx) {
  const active = SECTIONS.some((s) => s.id === ctx.params.section) ? ctx.params.section : 'overview';
  let child = null;

  outlet.innerHTML = `
    ${pageHead('Battery Tester',
      'What a battery cycler controls, what it measures, how to design a schedule, and how to read what comes back.')}

    <nav class="tabbar" role="tablist" aria-label="Battery Tester sections">
      ${SECTIONS.map((s) => `
        <a class="tab${s.id === active ? ' is-active' : ''}" role="tab"
           aria-selected="${s.id === active}"
           href="#/battery-tester/${s.id}">${esc(s.label)}</a>`).join('')}
    </nav>

    <div id="bt-section"></div>

    <!-- Tab bar, concept accordions and animation blocks are styled in css/style.css,
         because BOTH instrument modules use them. -->`;

  const host = outlet.querySelector('#bt-section');
  child = await mountSection(active, host);

  return {
    destroy() { child?.destroy?.(); }
  };
}

async function mountSection(id, host) {
  switch (id) {
    case 'instrument': return sectionInstrument(host);
    case 'methods':    return sectionMethods(host);
    case 'principles': return sectionPrinciples(host);
    case 'transport':  return sectionTransport(host);
    case 'protocol':   return sectionProtocol(host);
    default:           return sectionOverview(host);
  }
}

/* ════════════════════════════════════════════════════════════
   Overview (§1)
   ════════════════════════════════════════════════════════════ */

async function sectionOverview(host) {
  const concepts = await data.items('bt/concepts');

  host.innerHTML = `
    <section class="section">
      <div class="section-head"><h2>Cycler or workstation?</h2>
        <span class="section-note">two instruments, two jobs</span></div>
      <p class="small" style="max-width:72ch">
        Both push current through a cell and measure the response, so students often treat them as
        interchangeable. They are not. Knowing which one a question belongs to is usually the first
        real decision in designing an experiment.
      </p>
      <div class="table-wrap"><table class="stackable">
        <thead><tr><th></th><th>Battery cycler</th><th>Electrochemical workstation</th></tr></thead>
        <tbody>
          <tr><td data-label="">Optimised for</td>
              <td data-label="Cycler">Many channels, long constant-current cycling</td>
              <td data-label="Workstation">Precise potential control and small signals</td></tr>
          <tr><td data-label="">Typical use</td>
              <td data-label="Cycler">Formation, rate capability, thousands of cycles</td>
              <td data-label="Workstation">CV, EIS, mechanistic studies</td></tr>
          <tr><td data-label="">Cell configuration</td>
              <td data-label="Cycler">Usually two-electrode (whole device)</td>
              <td data-label="Workstation">Two-, three- or four-electrode</td></tr>
          <tr><td data-label="">Current resolution</td>
              <td data-label="Cycler">Coarser; suited to larger currents</td>
              <td data-label="Workstation">Fine, down to very small currents</td></tr>
          <tr><td data-label="">Timescale</td>
              <td data-label="Cycler">Days to months</td>
              <td data-label="Workstation">Minutes to hours</td></tr>
        </tbody>
      </table></div>
      <p class="xsmall muted" style="margin-top:.7rem">
        Capabilities vary by manufacturer and model — some cyclers offer EIS, some workstations have
        multi-channel cycling units. Check your own instrument rather than assuming from this table.
      </p>
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
        ${r.experimentalInterpretation ? `<div><h4>Experimental interpretation</h4><p style="margin:0">${esc(r.experimentalInterpretation)}</p></div>` : ''}
        ${r.limitations?.length ? `<div><h4>Limitations</h4><ul>${r.limitations.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
        ${r.researchConsiderations?.length ? `<div><h4>Research considerations</h4><ul>${r.researchConsiderations.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
      </div>
    </div>
  </details></div>`;
}

/* ════════════════════════════════════════════════════════════
   Instrument block diagram (§3)
   ════════════════════════════════════════════════════════════ */

async function sectionInstrument(host) {
  const payload = await data.load('bt/instrument');
  const spec = (payload.items || [])[0];

  host.innerHTML = `
    <section class="section">
      <div class="section-head"><h2>Channel architecture</h2>
        <span class="section-note">select any block</span></div>
      <p class="small" style="max-width:72ch;margin-bottom:1rem">
        The signal chain inside one channel. Solid outlines mark blocks that <strong>control</strong> a
        quantity; dashed outlines mark blocks that <strong>measure</strong> one. Select a block — or focus
        one and use the arrow keys — to see what it does, what commonly goes wrong there, and how that
        failure shows up in your data.
      </p>
      <div id="bt-diagram"></div>
    </section>`;

  const h = renderDiagram(host.querySelector('#bt-diagram'),
    spec || { blocks: [], title: 'Battery tester channel' });
  return { destroy() { h.destroy?.(); } };
}

/* ════════════════════════════════════════════════════════════
   Operating principles — CC / CV / CC-CV (§2, §7)
   ════════════════════════════════════════════════════════════ */

function sectionPrinciples(host) {
  host.innerHTML = `
    ${callout(`These are <strong>schematic</strong> curves. The axes deliberately carry no numbers —
      what they teach is the shape, and above all which quantity the instrument is holding and which one
      the cell is deciding. A real cell's voltage curve depends entirely on its chemistry.`, 'info')}

    <div class="anim-block" style="margin-top:1.25rem">
      <h3>1 · Constant current (CC)</h3>
      <p class="lede">The tester holds the current on its setpoint and records whatever the voltage does.</p>
      <div id="a-cc"></div>
    </div>

    <div class="anim-block">
      <h3>2 · Constant voltage (CV)</h3>
      <p class="lede">The roles swap: voltage is held, and the current becomes the measured response.</p>
      <div id="a-cv"></div>
    </div>

    <div class="anim-block">
      <h3>3 · CC-CV</h3>
      <p class="lede">The two joined together — constant current up to the voltage limit, then constant
        voltage while the current decays to its cutoff. Watch the moment the instrument swaps which
        quantity it controls.</p>
      <div id="a-cccv"></div>
    </div>`;

  const handles = [
    mountScene(host.querySelector('#a-cc'), ccScene()),
    mountScene(host.querySelector('#a-cv'), cvScene()),
    mountScene(host.querySelector('#a-cccv'), ccCvScene())
  ];
  return { destroy() { handles.forEach((h) => h?.destroy?.()); } };
}

/* ════════════════════════════════════════════════════════════
   Inside the cell (§7.4, §7.5)
   ════════════════════════════════════════════════════════════ */

function sectionTransport(host) {
  host.innerHTML = `
    <div class="anim-block">
      <h3>Charge and discharge</h3>
      <p class="lede">Ions moving through the electrolyte and electrons moving through the external
        circuit — always coupled, always in the same overall direction. Charge cannot accumulate
        anywhere, which is why the two motions can never be considered separately.</p>
      <div id="a-cell"></div>
    </div>
    ${callout(`This is a <strong>conceptual representation</strong>, not a simulation. Ion sizes,
      spacing and speeds are chosen for legibility; nothing here is to scale, and no real material
      behaves exactly like this picture.`, 'warn')}`;

  const h = mountScene(host.querySelector('#a-cell'), cellScene());
  return { destroy() { h?.destroy?.(); } };
}

/* ════════════════════════════════════════════════════════════
   Protocol builder (§10) + voltage–time graph (§8)
   ════════════════════════════════════════════════════════════ */

async function sectionProtocol(host) {
  host.innerHTML = `
    <section class="section">
      <div class="section-head"><h2>Build your test protocol</h2>
        <span class="section-note">educational simulator</span></div>
      <div id="bt-builder"></div>
    </section>`;
  const mod = await import('./protocol-builder.js');
  return mod.render(host.querySelector('#bt-builder'));
}


/* ════════════════════════════════════════════════════════════
   Method library (§6)
   ════════════════════════════════════════════════════════════ */

async function sectionMethods(host) {
  const methods = await data.items('bt/methods');
  host.innerHTML = `
    <section class="section">
      <div class="section-head"><h2>Battery testing methods</h2>
        <span class="section-note">§6 · ${methods.length} methods</span></div>
      <p class="small" style="max-width:72ch;margin-bottom:1rem">
        Every method states what the instrument <strong>controls</strong> and what it
        <strong>measures</strong> before anything else, then what happens in the cell, what you set,
        what comes back, how it is processed, and — always — what it cannot tell you.
      </p>
      <div id="bt-methods"></div>
    </section>`;
  return renderMethodList(host.querySelector('#bt-methods'), methods,
    { emptyMessage: 'The battery testing method library' });
}
