/**
 * EDMGLAB — scan-rate series with a KNOWN answer (Roadmap P6)
 *
 * Pure mathematics — no DOM.
 *
 * ══════════════════════════════════════════════════════════════════════
 *  This is not a simulation of an electrode. It is a generator for data
 *  whose decomposition is known in advance, built so that the analysis in
 *  js/echem/analysis.js can be run against a case where the right answer is
 *  not in doubt.
 *
 *  The forward sweep is constructed as exactly the equation Dunn's method
 *  assumes:
 *
 *      i(E, v) = k₁(E)·v + k₂(E)·√v
 *
 *  so a correct implementation recovers k₁ and k₂ to numerical precision.
 *  That is the point of the clean case: it shows the method working where
 *  it cannot be wrong.
 *
 *  The confounders below then break the assumption in three ways that
 *  happen constantly in real measurements — and the method keeps returning
 *  a confident percentage, now of something else. That is the point of the
 *  whole module.
 * ══════════════════════════════════════════════════════════════════════
 */

export const DEFAULTS = {
  eLo: -0.2,          // V     window
  eHi: 0.8,           // V
  points: 320,        // samples per branch

  cdl: 1.6,           // mA/(V/s)   k₁ plateau — the capacitive term
  ipk: 0.9,           // mA/√(V/s)  k₂ peak height — the √v term
  ePeak: 0.34,        // V          anodic peak position
  peakSep: 0.13,      // V          anodic to cathodic separation
  peakWidth: 0.085,   // V          Gaussian width
  edge: 0.05,         // V          how sharply the capacitive plateau turns on

  /* ── confounders, all off by default ── */
  ru: 0,              // Ω    uncompensated resistance: E_measured = E − i·Ru
  third: 0,           // mA/(V/s)^0.75  a process the two-term model has no bin for
  thirdExp: 0.75,     // its exponent — deliberately between the two the model knows
  drift: 0            // V per decade of scan rate: peak potential moves with rate
};

/** Smooth 0→1 turn-on, so the capacitive plateau has rounded ends like a real one. */
const soft = (x, w) => 1 / (1 + Math.exp(-x / Math.max(w, 1e-6)));

/** k₁(E) — the capacitive coefficient: a plateau across the window. */
export function k1At(E, o) {
  return o.cdl * soft(E - o.eLo - 2 * o.edge, o.edge) * soft(o.eHi - 2 * o.edge - E, o.edge);
}

/** k₂(E) — the √v coefficient: a Gaussian at the peak potential. */
export function k2At(E, o, ePeak) {
  const z = (E - ePeak) / o.peakWidth;
  return o.ipk * Math.exp(-z * z);
}

/**
 * One voltammogram.
 * @returns {{scanRate, points:{x,y}[], truth:{k1:Function,k2:Function}}}
 */
export function generate(scanRate, params = {}) {
  const o = { ...DEFAULTS, ...params };
  const v = scanRate / 1000;                                  // mV/s → V/s
  // A peak that moves with rate — the thing that quietly invalidates a
  // b-value fitted "at the peak".
  const shift = o.drift * Math.log10(Math.max(scanRate, 1e-9) / 50);
  const ePa = o.ePeak + shift;
  const ePc = o.ePeak - o.peakSep - shift;

  const pts = [];
  const push = (E, i) => {
    // Uncompensated resistance moves the potential the cell actually sees, by
    // an amount proportional to the current — so the distortion grows with
    // scan rate, which is exactly why high rates bend a log–log fit.
    pts.push({ x: E - (i / 1000) * o.ru, y: i });
  };

  // Forward (anodic) branch — the one the analysis reads.
  for (let n = 0; n < o.points; n++) {
    const E = o.eLo + ((o.eHi - o.eLo) * n) / (o.points - 1);
    let i = k1At(E, o) * v + k2At(E, o, ePa) * Math.sqrt(v);
    if (o.third) i += o.third * k2At(E, o, ePa) / o.ipk * Math.pow(v, o.thirdExp);
    push(E, i);
  }
  // Reverse (cathodic) branch — drawn so the figure is a voltammogram rather
  // than half of one. The analysis skips it; see interpolateAt().
  for (let n = 0; n < o.points; n++) {
    const E = o.eHi - ((o.eHi - o.eLo) * n) / (o.points - 1);
    let i = -(k1At(E, o) * v + k2At(E, o, ePc) * Math.sqrt(v));
    if (o.third) i -= o.third * k2At(E, o, ePc) / o.ipk * Math.pow(v, o.thirdExp);
    push(E, i);
  }

  return { scanRate, points: pts };
}

/** The whole series. */
export function series(rates = [5, 10, 20, 50, 100, 200], params = {}) {
  return rates.map((r) => generate(r, params));
}

/**
 * The answer, computed from the parameters rather than from the data.
 *
 * Only meaningful when no confounder is switched on: with `third`, `ru` or
 * `drift` non-zero there is no longer a true two-term decomposition to
 * recover, which is the whole lesson.
 */
export function trueCapacitiveFraction(scanRateMvS, params = {}) {
  const o = { ...DEFAULTS, ...params };
  const v = scanRateMvS / 1000;
  let cap = 0, dif = 0;
  const N = 400;
  for (let n = 0; n < N; n++) {
    const E = o.eLo + ((o.eHi - o.eLo) * n) / (N - 1);
    cap += Math.abs(k1At(E, o) * v);
    dif += Math.abs(k2At(E, o, o.ePeak) * Math.sqrt(v));
  }
  return cap + dif > 0 ? cap / (cap + dif) : NaN;
}

export const BASIS = {
  model: 'Two-term scan-rate model, constructed so the answer is known before the analysis runs',
  equations: [
    'forward branch:  i(E, v) = k₁(E)·v + k₂(E)·√v',
    'k₁(E) = C · plateau(E)                      the capacitive coefficient',
    'k₂(E) = i_pk · exp[ −((E − E_p)/w)² ]        the √v coefficient',
    'confounders:  E_measured = E − i·R_u  ·  + k₃(E)·v^0.75  ·  E_p = E_p(v)'
  ],
  assumptions: [
    'NOT a solution of the diffusion equations. There is no Butler–Volmer kinetics, no mass transport, no real double layer.',
    'The forward branch IS the model Dunn analysis assumes, by construction. That is deliberate: it makes the clean case a test of the implementation rather than a claim about electrochemistry.',
    'The reverse branch is drawn so the figure reads as a voltammogram. The analysis uses the forward branch only.',
    'Currents are in milliamps on an arbitrary scale. They describe no real electrode, material or electrolyte.',
    'Once any confounder is switched on there is no true two-term decomposition left to recover, and the "true fraction" reported for the clean case no longer applies.'
  ],
  note: 'This exists to show what the analysis does when its assumption holds, and what it still reports when the assumption does not. Nothing here is measured, and no number from it describes any material.'
};
