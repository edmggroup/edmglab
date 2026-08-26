/**
 * EDMGLAB — Battery Tester animations (Instrumentation spec §7)
 *
 * Four scenes, all built on the shared engine (js/lib/anim-engine.js) and the
 * shared primitive library. No timing, no controls and no rAF logic here —
 * each scene is just geometry plus a render function.
 *
 *   ccScene()      §7.1  constant current — current held, voltage responds
 *   cvScene()      §7.2  constant voltage — voltage held, current responds
 *   ccCvScene()    §7.3  the CC→CV transition and the decaying CV current
 *   cellScene()    §7.4/§7.5  conceptual ion and electron transport
 *
 * ── A NOTE ON THE CURVE SHAPES ──
 * These are SCHEMATIC. The voltage rise during a constant-current step is
 * drawn as a generic monotonic curve; it is not the response of any real
 * chemistry, and a graphite, LFP or hard-carbon cell would each look quite
 * different. The engine stamps every scene here as "Conceptual representation".
 *
 * Deliberately, the axes carry NO numeric ticks — only symbolic markers
 * (V_max, I_set, I_cutoff). Putting numbers on a schematic invites a student
 * to read them as data, which spec §40 forbids. What the scenes teach is the
 * SHAPE and, above all, which quantity is controlled and which is measured.
 */

import { createScene } from '../lib/anim-engine.js';
import * as C from '../lib/anim-components.js';

/* ── Shared plot geometry ────────────────────────────────── */

const P = { x0: 84, x1: 600, y0: 50, y1: 236 };
const W = P.x1 - P.x0;
const H = P.y1 - P.y0;

const px = (u) => P.x0 + u * W;              // u: 0..1 along time
const pyV = (v) => P.y1 - v * H;             // v: 0..1 normalised voltage
const pyI = (i) => P.y1 - i * H;             // i: 0..1 normalised current

const N = 260;                               // samples per curve

/** Build the axis furniture every step scene shares. */
function buildAxes(svg, o = {}) {
  // Frame
  svg.appendChild(C.n('rect', {
    x: P.x0, y: P.y0, width: W, height: H,
    fill: 'var(--bg)', stroke: 'var(--border)', 'stroke-width': 1
  }));

  // Horizontal guides
  for (let k = 1; k < 4; k++) {
    svg.appendChild(C.n('line', {
      x1: P.x0, y1: P.y0 + (H / 4) * k, x2: P.x1, y2: P.y0 + (H / 4) * k,
      stroke: 'var(--grid)', 'stroke-width': 1
    }));
  }

  svg.appendChild(C.label(P.x0 + W / 2, P.y1 + 30, 'Time', { anchor: 'middle', size: 11 }));

  // Left axis — voltage. Right axis — current. Colour-coded to the traces so
  // the student never has to guess which axis a curve belongs to.
  const vl = C.label(0, 0, 'Voltage', { anchor: 'middle', size: 11, fill: 'var(--series-1)' });
  vl.setAttribute('transform', `translate(${P.x0 - 34} ${P.y0 + H / 2}) rotate(-90)`);
  svg.appendChild(vl);

  const il = C.label(0, 0, 'Current', { anchor: 'middle', size: 11, fill: 'var(--series-2)' });
  il.setAttribute('transform', `translate(${P.x1 + 40} ${P.y0 + H / 2}) rotate(90)`);
  svg.appendChild(il);

  if (o.vMax) {
    svg.appendChild(C.n('line', {
      x1: P.x0, y1: pyV(o.vMax), x2: P.x1, y2: pyV(o.vMax),
      stroke: 'var(--series-1)', 'stroke-width': 1, 'stroke-dasharray': '4 3', 'stroke-opacity': 0.65
    }));
    svg.appendChild(C.label(P.x0 - 8, pyV(o.vMax) + 4, 'V_max', { anchor: 'end', size: 10, mono: true, fill: 'var(--series-1)' }));
  }
  if (o.iSet) {
    svg.appendChild(C.label(P.x1 + 8, pyI(o.iSet) + 4, 'I_set', { size: 10, mono: true, fill: 'var(--series-2)' }));
  }
  if (o.iCut) {
    svg.appendChild(C.n('line', {
      x1: P.x0, y1: pyI(o.iCut), x2: P.x1, y2: pyI(o.iCut),
      stroke: 'var(--series-2)', 'stroke-width': 1, 'stroke-dasharray': '3 3', 'stroke-opacity': 0.6
    }));
    svg.appendChild(C.label(P.x1 + 8, pyI(o.iCut) + 4, 'I_cutoff', { size: 10, mono: true, fill: 'var(--series-2)' }));
  }
}

/** Legend row stating what is controlled and what is measured — the single
 *  most important thing these three scenes teach (spec §1). */
function buildLegend(svg, controlled, measured) {
  const y = 22;
  const item = (x, colour, text, tag) => {
    svg.appendChild(C.n('line', {
      x1: x, y1: y - 4, x2: x + 16, y2: y - 4,
      stroke: colour, 'stroke-width': 2.5, 'stroke-linecap': 'round'
    }));
    const t = C.label(x + 22, y, text, { size: 11.5, fill: 'var(--text)' });
    svg.appendChild(t);
    const badge = C.label(x + 22 + text.length * 6.6 + 8, y, tag, {
      size: 9.5, mono: true, weight: 700,
      fill: tag === 'CONTROLLED' ? 'var(--accent-strong)' : 'var(--warn)'
    });
    svg.appendChild(badge);
  };
  item(P.x0, controlled.colour, controlled.name, 'CONTROLLED');
  item(P.x0 + 250, measured.colour, measured.name, 'MEASURED');
}

/** A trace revealed progressively. Returns {el, pts, show(n)}. */
function progressiveTrace(svg, colour, opts = {}) {
  const el = C.n('polyline', {
    points: '', fill: 'none', stroke: colour,
    'stroke-width': opts.width || 2.4,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    'stroke-dasharray': opts.dashed ? '5 4' : null
  });
  svg.appendChild(el);
  return {
    el,
    pts: [],
    show(n) {
      const k = Math.max(2, Math.round(n));
      el.setAttribute('points', this.pts.slice(0, k).map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' '));
    }
  };
}

/**
 * A faint full-length copy of a curve, drawn under the animated trace.
 *
 * Without it, a scene sitting paused at t=0 shows an empty plot — which is
 * the first thing a student sees, and reads as "broken" rather than "ready".
 * The ghost also helps while playing: you can see where the curve is heading,
 * which is what makes the CC→CV transition legible before it arrives.
 */
function ghostTrace(svg, colour, pts) {
  svg.appendChild(C.n('polyline', {
    points: pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' '),
    fill: 'none', stroke: colour, 'stroke-width': 1.4,
    'stroke-opacity': 0.22, 'stroke-linecap': 'round', 'stroke-linejoin': 'round'
  }));
}

/** Compute both curves up front so the ghosts can be drawn before the traces. */
function computeCurves(fnV, fnI) {
  const v = [], i = [];
  for (let k = 0; k <= N; k++) {
    const f = k / N;
    v.push([px(f), pyV(fnV(f))]);
    i.push([px(f), pyI(fnI(f))]);
  }
  return { v, i };
}

/** A dot that rides the end of a trace. */
function head(svg, colour) {
  const g = C.group();
  g.appendChild(C.n('circle', { r: 4.5, fill: colour, stroke: 'var(--bg)', 'stroke-width': 1.5 }));
  svg.appendChild(g);
  return g;
}

/* ── Curve shapes (schematic — see file header) ───────────── */

const V_LO = 0.16, V_HI = 0.86, IR = 0.06;

/** Voltage during a constant-current step: a generic monotonic rise with a
 *  small step at the start (the IR jump) and mild upward curvature as the
 *  cutoff is approached. Shape only — not any particular chemistry. */
function vDuringCC(f) {
  return V_LO + IR + (V_HI - V_LO - IR) * Math.pow(f, 0.82);
}

/** Current during a constant-voltage hold: monotonic decay towards zero. */
function iDuringCV(f, tau = 0.26) {
  return Math.exp(-f / tau);
}

/* ════════════════════════════════════════════════════════════
   §7.1 — CONSTANT CURRENT
   ════════════════════════════════════════════════════════════ */

export function ccScene() {
  return createScene({
    id: 'bt.cc',
    title: 'Constant current: the tester holds the current, the cell voltage responds',
    viewBox: '0 0 660 300',
    duration: 8000,
    loop: true,
    conceptual: true,
    staticAt: 0.75,
    steps: [
      { at: 0.00, label: 'Constant current begins', text: 'The tester forces a fixed current through the cell. The instant current starts flowing, the voltage jumps by I×R — the IR drop — before any charge storage happens at all.' },
      { at: 0.20, label: 'Current is held flat', text: 'The feedback loop continuously corrects the drive to keep the current on its setpoint. The current trace is flat because the instrument is MAKING it flat, not because the cell chose to behave that way.' },
      { at: 0.55, label: 'Voltage is the response', text: 'Voltage is measured, not imposed. Its shape is what the cell has to say — the plateaus, slopes and curvature carry the chemistry.' },
      { at: 0.88, label: 'Cutoff reached', text: 'The step ends when the measured voltage reaches its limit. In a CC-only protocol the cell stops here; in CC-CV the tester now switches to holding the voltage.' }
    ],

    setup(svg, ctx) {
      buildAxes(svg, { vMax: V_HI, iSet: 1.0 });
      buildLegend(svg,
        { name: 'Current', colour: 'var(--series-2)' },
        { name: 'Voltage', colour: 'var(--series-1)' });

      const cur = computeCurves(vDuringCC, () => 1.0);
      ghostTrace(svg, 'var(--series-1)', cur.v);
      ghostTrace(svg, 'var(--series-2)', cur.i);
      ctx.tV = progressiveTrace(svg, 'var(--series-1)');
      ctx.tI = progressiveTrace(svg, 'var(--series-2)');
      ctx.tV.pts = cur.v; ctx.tI.pts = cur.i;
      ctx.hV = head(svg, 'var(--series-1)');
      ctx.hI = head(svg, 'var(--series-2)');

      // IR-drop annotation
      ctx.irMark = C.group();
      ctx.irMark.appendChild(C.n('line', {
        x1: px(0), y1: pyV(V_LO), x2: px(0), y2: pyV(V_LO + IR),
        stroke: 'var(--danger)', 'stroke-width': 2
      }));
      const t = C.label(px(0) + 8, pyV(V_LO + IR / 2) + 4, 'IR drop', { size: 10, fill: 'var(--danger)' });
      ctx.irMark.appendChild(t);
      svg.appendChild(ctx.irMark);
    },

    render(t, ctx) {
      const n = Math.max(2, Math.round(t * N));
      ctx.tV.show(n); ctx.tI.show(n);
      const pv = ctx.tV.pts[n - 1], pi = ctx.tI.pts[n - 1];
      C.at(ctx.hV, pv[0], pv[1]);
      C.at(ctx.hI, pi[0], pi[1]);
      ctx.irMark.setAttribute('opacity', t < 0.05 ? t / 0.05 : 1);
    }
  });
}

/* ════════════════════════════════════════════════════════════
   §7.2 — CONSTANT VOLTAGE
   ════════════════════════════════════════════════════════════ */

export function cvScene() {
  return createScene({
    id: 'bt.cv',
    title: 'Constant voltage: the tester holds the voltage, the current responds',
    viewBox: '0 0 660 300',
    duration: 8000,
    loop: true,
    conceptual: true,
    staticAt: 0.6,
    steps: [
      { at: 0.00, label: 'Voltage is clamped', text: 'The roles swap. Now the instrument holds the VOLTAGE at a fixed value and lets the current become whatever the cell demands.' },
      { at: 0.25, label: 'Current decays', text: 'As the cell approaches equilibrium at this potential, the driving force falls and the current decays towards zero. Nothing imposes that decay — it is the cell responding.' },
      { at: 0.70, label: 'Termination', text: 'The step usually ends on a current threshold rather than a time: hold until the current falls below I_cutoff. A time limit is set as a backstop in case that threshold is never reached.' }
    ],

    setup(svg, ctx) {
      buildAxes(svg, { vMax: V_HI, iSet: 1.0, iCut: 0.08 });
      buildLegend(svg,
        { name: 'Voltage', colour: 'var(--series-1)' },
        { name: 'Current', colour: 'var(--series-2)' });

      const cur = computeCurves(() => V_HI, (f) => iDuringCV(f));
      ghostTrace(svg, 'var(--series-1)', cur.v);
      ghostTrace(svg, 'var(--series-2)', cur.i);
      ctx.tV = progressiveTrace(svg, 'var(--series-1)');
      ctx.tI = progressiveTrace(svg, 'var(--series-2)');
      ctx.tV.pts = cur.v; ctx.tI.pts = cur.i;
      ctx.hV = head(svg, 'var(--series-1)');
      ctx.hI = head(svg, 'var(--series-2)');
    },

    render(t, ctx) {
      const n = Math.max(2, Math.round(t * N));
      ctx.tV.show(n); ctx.tI.show(n);
      C.at(ctx.hV, ctx.tV.pts[n - 1][0], ctx.tV.pts[n - 1][1]);
      C.at(ctx.hI, ctx.tI.pts[n - 1][0], ctx.tI.pts[n - 1][1]);
    }
  });
}

/* ════════════════════════════════════════════════════════════
   §7.3 — CC-CV
   ════════════════════════════════════════════════════════════ */

const SPLIT = 0.52;

export function ccCvScene() {
  return createScene({
    id: 'bt.cccv',
    title: 'CC-CV: constant current to the voltage limit, then constant voltage while the current decays',
    viewBox: '0 0 660 300',
    duration: 12000,
    loop: true,
    conceptual: true,
    staticAt: 0.75,
    steps: [
      { at: 0.00, label: '1 · Constant current', text: 'Charging begins under constant current. Current flat (controlled), voltage rising (measured).' },
      { at: 0.42, label: '2 · Approaching the limit', text: 'The voltage is climbing towards the upper cutoff. Continuing at this current past the limit would drive the cell outside its safe window.' },
      { at: 0.54, label: '3 · Transition to CV', text: 'At V_max the roles swap. The tester now holds the voltage there and releases control of the current. Nothing about the cell changed at this instant — the INSTRUMENT changed what it is controlling.' },
      { at: 0.66, label: '4 · Current decays', text: 'Holding the voltage, the current falls away as the cell fills. This tail is where a substantial part of the capacity often arrives, which is why a CC-only charge and a CC-CV charge are not comparable.' },
      { at: 0.90, label: '5 · Termination', text: 'The step ends when the current falls below I_cutoff — commonly something like C/10 to C/20, though the value is protocol-dependent and must be reported alongside any capacity derived from it.' }
    ],

    setup(svg, ctx) {
      buildAxes(svg, { vMax: V_HI, iSet: 1.0, iCut: 0.09 });
      buildLegend(svg,
        { name: 'Voltage', colour: 'var(--series-1)' },
        { name: 'Current', colour: 'var(--series-2)' });

      const cur = computeCurves(
        (f) => (f < SPLIT ? vDuringCC(f / SPLIT) : V_HI),
        (f) => (f < SPLIT ? 1.0 : iDuringCV((f - SPLIT) / (1 - SPLIT), 0.30))
      );
      ghostTrace(svg, 'var(--series-1)', cur.v);
      ghostTrace(svg, 'var(--series-2)', cur.i);
      ctx.tV = progressiveTrace(svg, 'var(--series-1)');
      ctx.tI = progressiveTrace(svg, 'var(--series-2)');
      ctx.tV.pts = cur.v; ctx.tI.pts = cur.i;
      ctx.hV = head(svg, 'var(--series-1)');
      ctx.hI = head(svg, 'var(--series-2)');

      // Transition marker
      ctx.split = C.group();
      ctx.split.appendChild(C.n('line', {
        x1: px(SPLIT), y1: P.y0, x2: px(SPLIT), y2: P.y1,
        stroke: 'var(--accent)', 'stroke-width': 1.5, 'stroke-dasharray': '5 4'
      }));
      ctx.split.appendChild(C.label(px(SPLIT), P.y0 - 6, 'CC → CV', {
        anchor: 'middle', size: 10.5, mono: true, weight: 700, fill: 'var(--accent-strong)'
      }));
      svg.appendChild(ctx.split);

      // Phase banners
      ctx.phaseCC = C.label(px(SPLIT / 2), P.y1 + 50, 'CONSTANT CURRENT', {
        anchor: 'middle', size: 11, mono: true, weight: 700, fill: 'var(--text-muted)' });
      ctx.phaseCV = C.label(px(SPLIT + (1 - SPLIT) / 2), P.y1 + 50, 'CONSTANT VOLTAGE', {
        anchor: 'middle', size: 11, mono: true, weight: 700, fill: 'var(--text-muted)' });
      svg.append(ctx.phaseCC, ctx.phaseCV);
    },

    render(t, ctx) {
      const n = Math.max(2, Math.round(t * N));
      ctx.tV.show(n); ctx.tI.show(n);
      C.at(ctx.hV, ctx.tV.pts[n - 1][0], ctx.tV.pts[n - 1][1]);
      C.at(ctx.hI, ctx.tI.pts[n - 1][0], ctx.tI.pts[n - 1][1]);

      const inCC = t < SPLIT;
      ctx.phaseCC.setAttribute('fill', inCC ? 'var(--accent-strong)' : 'var(--text-muted)');
      ctx.phaseCV.setAttribute('fill', inCC ? 'var(--text-muted)' : 'var(--accent-strong)');
      ctx.split.setAttribute('opacity', t > SPLIT - 0.06 ? 1 : 0.28);
    }
  });
}

/* ════════════════════════════════════════════════════════════
   §7.4 / §7.5 — CONCEPTUAL CHARGE AND DISCHARGE
   ════════════════════════════════════════════════════════════
   Ion transport inside the cell and electron transport in the external
   circuit, always coupled and always in the same overall direction. */

export function cellScene() {
  const L = {
    wireY: 46, cellY: 96, cellH: 150,
    negX: 88, negW: 86, posX: 466, posW: 86,
    elyteX: 174, elyteW: 292, sepX: 310, sepW: 18,
    collL: 70, collR: 552, collW: 14
  };
  const N_IONS = 7, N_E = 6;

  return createScene({
    id: 'bt.cell-transport',
    title: 'Conceptual ion and electron transport during charge and discharge',
    viewBox: '0 0 640 344',
    duration: 11000,
    loop: true,
    conceptual: true,
    staticAt: 0.25,
    steps: [
      { at: 0.00, label: 'Charging', text: 'An external supply drives electrons through the outside circuit towards the negative electrode. Inside the cell, cations move the same way through the electrolyte to balance the charge.' },
      { at: 0.44, label: 'Transition', text: 'The direction reverses. In a real experiment this is where the tester switches step, and where a rest period is usually inserted so the cell can relax.' },
      { at: 0.52, label: 'Discharging', text: 'Electrons now flow out through the load, and the cations travel back towards the positive electrode. The two motions are always coupled — charge cannot accumulate anywhere.' }
    ],

    setup(svg, ctx) {
      svg.appendChild(C.electrolyte({ x: L.elyteX, y: L.cellY, w: L.elyteW, h: L.cellH, label: 'Electrolyte' }));
      svg.appendChild(C.currentCollector({ x: L.collL, y: L.cellY, w: L.collW, h: L.cellH }));
      svg.appendChild(C.currentCollector({ x: L.collR, y: L.cellY, w: L.collW, h: L.cellH }));
      svg.appendChild(C.electrode({ x: L.negX, y: L.cellY, w: L.negW, h: L.cellH, role: 'negative', label: 'Negative electrode' }));
      svg.appendChild(C.electrode({ x: L.posX, y: L.cellY, w: L.posW, h: L.cellH, role: 'positive', label: 'Positive electrode' }));
      svg.appendChild(C.porousCarbon({ x: L.negX + 6, y: L.cellY + 8, w: L.negW - 12, h: L.cellH - 16, cols: 3, rows: 5 }));
      svg.appendChild(C.separator({ x: L.sepX, y: L.cellY, w: L.sepW, h: L.cellH, label: 'Separator' }));

      svg.appendChild(C.wire(
        `M ${L.collL + L.collW / 2} ${L.cellY} L ${L.collL + L.collW / 2} ${L.wireY} L ${L.collR + L.collW / 2} ${L.wireY} L ${L.collR + L.collW / 2} ${L.cellY}`));
      svg.appendChild(C.label(320, L.wireY - 12, 'External circuit', { anchor: 'middle', size: 11 }));
      svg.appendChild(C.label(L.collL - 4, L.cellY + L.cellH + 20, 'Current collector', { size: 10 }));
      svg.appendChild(C.label(L.collR + L.collW + 4, L.cellY + L.cellH + 20, 'Current collector', { anchor: 'end', size: 10 }));

      ctx.ions = [];
      for (let i = 0; i < N_IONS; i++) { const g = C.ion('Li'); svg.appendChild(g); ctx.ions.push(g); }
      ctx.electrons = [];
      for (let i = 0; i < N_E; i++) { const g = C.electron(); svg.appendChild(g); ctx.electrons.push(g); }

      ctx.ionArrow = C.arrow(288, 306, 352, 306, { stroke: 'var(--series-1)' });
      svg.appendChild(ctx.ionArrow);
      svg.appendChild(C.label(320, 328, 'ion motion inside the cell', { anchor: 'middle', size: 10, fill: 'var(--series-1)' }));

      ctx.phaseText = C.readout(320, 22, { anchor: 'middle', size: 14 });
      svg.appendChild(ctx.phaseText);
      ctx.L = L;
    },

    render(t, ctx) {
      const L = ctx.L;
      const charging = t < 0.5;
      const local = charging ? t / 0.5 : (t - 0.5) / 0.5;
      const dir = charging ? -1 : 1;

      ctx.phaseText.textContent = charging ? 'CHARGE' : 'DISCHARGE';
      ctx.phaseText.setAttribute('fill', charging ? 'var(--series-1)' : 'var(--series-2)');

      const ionFrom = charging ? L.elyteX + L.elyteW - 14 : L.elyteX + 14;
      const ionTo = charging ? L.elyteX + 14 : L.elyteX + L.elyteW - 14;
      ctx.ions.forEach((g, i) => {
        const p = C.staggered(local, i, N_IONS, 0.9);
        const lane = (i % 5) / 4;
        C.at(g, C.lerp(ionFrom, ionTo, p), L.cellY + 24 + lane * (L.cellH - 48),
          { opacity: Math.min(1, Math.min(p, 1 - p) * 8) });
      });

      const wFrom = charging ? L.collR + L.collW / 2 : L.collL + L.collW / 2;
      const wTo = charging ? L.collL + L.collW / 2 : L.collR + L.collW / 2;
      ctx.electrons.forEach((g, i) => {
        const p = C.staggered(local, i, N_E, 0.95);
        C.at(g, C.lerp(wFrom, wTo, p), L.wireY, { opacity: Math.min(1, Math.min(p, 1 - p) * 10) });
      });

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
