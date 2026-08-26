/**
 * EDMGLAB — Engine demonstration (Phase 0 exit criteria)
 *
 * Not a content page. This exists to prove the four shared services work
 * before sixteen Stage-1B deliverables are built on top of them:
 *
 *   1. anim-engine.js + anim-components.js — a real scene with the full
 *      control set, reduced-motion handling and enforced labelling
 *   2. diagram.js — a clickable block diagram driven entirely by JSON
 *   3. sim-label.js — simulated output that cannot lose its label
 *   4. charts.js — zoom, pan, point inspection and reset
 *
 * The animation here is a conceptual charge/discharge scene, which also
 * becomes spec §7 items 4 and 5 in Stage 1B — so it is a genuine target
 * rather than a throwaway.
 */

import { pageHead, section, callout } from '../ui.js';
import { createScene, mountScene } from '../lib/anim-engine.js';
import * as C from '../lib/anim-components.js';
import { renderDiagram } from '../lib/diagram.js';
import { simWrap } from '../lib/sim-label.js';
import { chartCard, downsampleLTTB } from '../lib/charts.js';
import * as data from '../data.js';

export async function render(outlet) {
  const handles = [];

  outlet.innerHTML = `
    ${pageHead('Engine demo',
      'Phase 0 verification — the shared animation engine, diagram engine, simulation labelling and chart layer, all working.')}
    ${callout(`Everything below is driven by the shared services in <code>js/lib/</code>. No module content
      is hard-coded here: the diagram comes from a JSON file, and the scene is composed from the
      primitive library.`, 'info')}

    ${section('1 · Animation engine + primitive library',
      `<div id="anim-mount"></div>
       <p class="small muted" style="margin-top:.75rem">
         Play, Pause, Reset, Speed, Explanation and Labels are built by the engine, not by the scene —
         so no animation can ship missing them. Try switching your system to “reduce motion”: the scene
         becomes a still frame automatically. Scroll it off screen and it stops consuming CPU.
       </p>`)}

    ${section('2 · Diagram engine',
      `<div id="diagram-mount"></div>
       <p class="small muted" style="margin-top:.75rem">
         Rendered from <code>data/battery-tester/instrument.json</code>. Click a block, or focus one and use
         the arrow keys to walk the signal chain. Solid outlines mark controlled quantities, dashed
         outlines measured ones — the distinction spec §1 asks to be made everywhere.
       </p>`)}

    ${section('3 · Simulation labelling + chart layer',
      `<div id="sim-mount"></div>
       <p class="small muted" style="margin-top:.75rem">
         The banner is painted by <code>sim-label.js</code>, not by the caller. A simulator that fails to
         declare its governing model is refused rather than drawn unlabelled — try it in the console.
         No noise or scatter is added to simulated curves.
       </p>`)}`;

  /* ── 1 · Animation ───────────────────────────────────── */
  handles.push(mountScene(outlet.querySelector('#anim-mount'), buildCellScene()));

  /* ── 2 · Diagram ─────────────────────────────────────── */
  const dgData = await data.load('bt/instrument');
  const spec = (dgData.items || [])[0];
  handles.push(renderDiagram(outlet.querySelector('#diagram-mount'),
    spec || { blocks: [], title: 'Battery tester channel' }));

  /* ── 3 · Simulation + chart ──────────────────────────── */
  await buildSimDemo(outlet.querySelector('#sim-mount'), handles);

  return {
    destroy() { handles.forEach((h) => h?.destroy?.()); }
  };
}

/* ════════════════════════════════════════════════════════════
   Conceptual charge / discharge scene
   ════════════════════════════════════════════════════════════
   Layout (viewBox 640 × 300):
     external circuit along the top, cell body below.
     Left electrode = negative, right electrode = positive.

   During CHARGE    cations move right → left (towards the negative electrode)
                    and electrons travel right → left in the external circuit.
   During DISCHARGE both reverse.

   Ions and electrons therefore always travel in the same overall direction —
   one through the electrolyte, one through the external circuit. That is the
   single most useful thing this picture teaches, so the labels say it. */
function buildCellScene() {
  const L = {
    wireY: 46,
    cellY: 96, cellH: 150,
    negX: 88,  negW: 86,
    posX: 466, posW: 86,
    elyteX: 174, elyteW: 292,
    sepX: 310, sepW: 18,
    collL: 70, collR: 552, collW: 14
  };
  const N_IONS = 7, N_ELECTRONS = 6;

  return createScene({
    id: 'demo.cell-transport',
    title: 'Conceptual ion and electron transport during charge and discharge',
    // Height leaves room below the cell for the collector labels and the
    // ion-direction indicator — anything drawn past the viewBox is clipped.
    viewBox: '0 0 640 344',
    duration: 11000,
    loop: true,
    conceptual: true,
    staticAt: 0.25,
    steps: [
      { at: 0.00, label: 'Charging',    text: 'An external supply drives electrons through the outside circuit towards the negative electrode. Inside the cell, cations move the same way through the electrolyte to balance the charge.' },
      { at: 0.44, label: 'Transition',  text: 'The direction reverses. In a real experiment this is where the tester switches step, and where a rest period is usually inserted so the cell can relax.' },
      { at: 0.52, label: 'Discharging', text: 'Electrons now flow out through the load, and the cations travel back towards the positive electrode. The two motions are always coupled — charge cannot accumulate anywhere.' }
    ],

    setup(svg, ctx) {
      // ── Static scenery ──
      svg.appendChild(C.electrolyte({ x: L.elyteX, y: L.cellY, w: L.elyteW, h: L.cellH, label: 'Electrolyte' }));
      svg.appendChild(C.currentCollector({ x: L.collL, y: L.cellY, w: L.collW, h: L.cellH }));
      svg.appendChild(C.currentCollector({ x: L.collR, y: L.cellY, w: L.collW, h: L.cellH }));
      svg.appendChild(C.electrode({ x: L.negX, y: L.cellY, w: L.negW, h: L.cellH, role: 'negative', label: 'Negative electrode' }));
      svg.appendChild(C.electrode({ x: L.posX, y: L.cellY, w: L.posW, h: L.cellH, role: 'positive', label: 'Positive electrode' }));
      svg.appendChild(C.porousCarbon({ x: L.negX + 6, y: L.cellY + 8, w: L.negW - 12, h: L.cellH - 16, cols: 3, rows: 5 }));
      svg.appendChild(C.separator({ x: L.sepX, y: L.cellY, w: L.sepW, h: L.cellH, label: 'Separator' }));

      // External circuit
      svg.appendChild(C.wire(
        `M ${L.collL + L.collW / 2} ${L.cellY} L ${L.collL + L.collW / 2} ${L.wireY} L ${L.collR + L.collW / 2} ${L.wireY} L ${L.collR + L.collW / 2} ${L.cellY}`
      ));
      svg.appendChild(C.label(320, L.wireY - 12, 'External circuit', { anchor: 'middle', size: 11 }));

      svg.appendChild(C.label(L.collL - 4, L.cellY + L.cellH + 20, 'Current collector', { size: 10 }));
      svg.appendChild(C.label(L.collR + L.collW + 4, L.cellY + L.cellH + 20, 'Current collector', { anchor: 'end', size: 10 }));

      // ── Moving parts ──
      ctx.ions = [];
      for (let i = 0; i < N_IONS; i++) {
        const g = C.ion('Li');
        svg.appendChild(g);
        ctx.ions.push(g);
      }
      ctx.electrons = [];
      for (let i = 0; i < N_ELECTRONS; i++) {
        const g = C.electron();
        svg.appendChild(g);
        ctx.electrons.push(g);
      }

      // Direction arrows and the live phase readout
      ctx.ionArrow = C.arrow(288, 306, 352, 306, { stroke: 'var(--series-1)' });
      svg.appendChild(ctx.ionArrow);
      svg.appendChild(C.label(320, 328, 'ion motion inside the cell', { anchor: 'middle', size: 10, fill: 'var(--series-1)' }));

      ctx.phaseText = C.readout(320, 22, { anchor: 'middle', size: 14 });
      svg.appendChild(ctx.phaseText);
    },

    render(t, ctx) {
      // Two halves: 0–0.5 charging, 0.5–1 discharging.
      const charging = t < 0.5;
      const local = charging ? t / 0.5 : (t - 0.5) / 0.5;
      const dir = charging ? -1 : 1;      // +1 = left→right

      ctx.phaseText.textContent = charging ? 'CHARGE' : 'DISCHARGE';
      ctx.phaseText.setAttribute('fill', charging ? 'var(--series-1)' : 'var(--series-2)');

      // Ions traverse the electrolyte, entering and leaving at the electrodes.
      const ionFrom = charging ? L.elyteX + L.elyteW - 14 : L.elyteX + 14;
      const ionTo   = charging ? L.elyteX + 14 : L.elyteX + L.elyteW - 14;

      ctx.ions.forEach((g, i) => {
        const p = C.staggered(local, i, N_IONS, 0.9);
        const x = C.lerp(ionFrom, ionTo, p);
        // Spread vertically so they read as a population, not a single file.
        const lane = (i % 5) / 4;                       // 0 … 1
        const y = L.cellY + 24 + lane * (L.cellH - 48);
        // Fade in and out at the ends rather than popping.
        const fade = Math.min(1, Math.min(p, 1 - p) * 8);
        C.at(g, x, y, { opacity: fade });
      });

      // Electrons travel the external circuit in the same overall direction.
      const wireFrom = charging ? L.collR + L.collW / 2 : L.collL + L.collW / 2;
      const wireTo   = charging ? L.collL + L.collW / 2 : L.collR + L.collW / 2;

      ctx.electrons.forEach((g, i) => {
        const p = C.staggered(local, i, N_ELECTRONS, 0.95);
        const x = C.lerp(wireFrom, wireTo, p);
        const fade = Math.min(1, Math.min(p, 1 - p) * 10);
        C.at(g, x, L.wireY, { opacity: fade });
      });

      // Flip the ion-direction arrow with the phase.
      const AY = 306;
      const ax1 = dir > 0 ? 288 : 352, ax2 = dir > 0 ? 352 : 288;
      ctx.ionArrow._line.setAttribute('x1', ax1);
      ctx.ionArrow._line.setAttribute('x2', ax2);
      const ang = dir > 0 ? 0 : Math.PI;
      ctx.ionArrow._head.setAttribute('d',
        `M ${ax2} ${AY} L ${ax2 - 7 * Math.cos(ang - 0.4)} ${AY - 7 * Math.sin(ang - 0.4)} L ${ax2 - 7 * Math.cos(ang + 0.4)} ${AY - 7 * Math.sin(ang + 0.4)} Z`);
    }
  });
}

/* ════════════════════════════════════════════════════════════
   Simulation + chart demonstration
   ════════════════════════════════════════════════════════════
   A first-order RC discharge, chosen deliberately: it is a stated equation
   with no free interpretation, it produces no numbers that could be mistaken
   for a measurement of any real material, and it exercises the whole
   sim-label → chart path that the CV, GCD and EIS simulators will use in
   Stage 1B.                                                                */
async function buildSimDemo(mount, handles) {
  const { body } = simWrap(mount, {
    simulationBasis: {
      model: 'First-order RC discharge',
      equations: [
        'V(t) = V0 · exp( −t / (R·C) )',
        'I(t) = V(t) / R'
      ],
      assumptions: [
        'A single ideal resistor and a single ideal capacitor in series — no distributed or porous-electrode behaviour',
        'R and C are constant with time, potential and state of charge',
        'No self-discharge, no faradaic side reactions, no temperature dependence',
        'Values below are arbitrary illustrative parameters, not measurements of any material or device'
      ],
      note: 'A real electrode almost never behaves as a single ideal RC element. This curve is here to demonstrate the plotting pipeline, not to represent a measurement.'
    }
  });

  // Generate at high density to prove downsampling; calculations would use
  // the full array, only the PLOT is reduced.
  const V0 = 1.0, R = 12, Cf = 1.5, tau = R * Cf;
  const full = [];
  for (let i = 0; i <= 20000; i++) {
    const t = (i / 20000) * 5 * tau;
    full.push({ x: t, y: V0 * Math.exp(-t / tau) });
  }
  const plotted = downsampleLTTB(full, 1200);

  const h = await chartCard(body, {
    title: 'Illustrative RC discharge',
    xLabel: 'Time  (s)',
    yLabel: 'Voltage  (V)',
    datasets: [{ label: 'V(t)', data: plotted }],
    hint: `Scroll or pinch to zoom · drag to pan · ${full.length.toLocaleString()} points generated, ${plotted.length.toLocaleString()} plotted (shape-preserving downsample)`
  });
  handles.push(h);
}
