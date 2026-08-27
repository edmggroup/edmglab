/**
 * EDMGLAB — Equivalent-circuit elements (Instrumentation spec §26)
 *
 * Pure mathematics. No DOM. Each element is evaluated exactly from its
 * defining expression — what is a modelling choice is which element you
 * decided to use, never the arithmetic.
 *
 * ── THE POINT OF THIS FILE ──
 * §26 requires that the platform never assume one equivalent circuit is
 * universally correct. Two things here make that concrete rather than a
 * disclaimer:
 *
 *   1. ELEMENTS ARE SHOWN ALONE. Each element's own Nyquist and Bode
 *      signature is plotted on its own, so "which feature does this element
 *      control" is answered by looking rather than by being told.
 *
 *   2. NON-UNIQUENESS IS DEMONSTRATED, NOT ASSERTED. `degeneratePair()`
 *      returns two DIFFERENT circuits whose impedance is identical at every
 *      frequency — not similar, identical to machine precision. The mapping
 *      is exact algebra (derived below), so the demonstration cannot be
 *      dismissed as a coincidence of the parameters chosen.
 */

import { c, add, mul, div, abs, argDeg, par, sqrt, tanh, coth } from './complex.js';

/* ════════════════════════════════════════════════════════════
   Element impedances
   ════════════════════════════════════════════════════════════ */

/**
 * Impedance of a single element at angular frequency ω.
 * @param {string} kind  r | c | l | cpe | w | ws | wo
 * @param {object} p     element parameters
 */
export function zElement(kind, p, w) {
  switch (kind) {
    case 'r':
      return c(p.R, 0);

    case 'c':
      // Z = 1/(jωC) = −j/(ωC)
      return c(0, -1 / (w * p.C));

    case 'l':
      // Z = jωL
      return c(0, w * p.L);

    case 'cpe': {
      // Z = 1/(Q(jω)^n);  (jω)^n = ω^n(cos(nπ/2) + j sin(nπ/2))
      const m = Math.pow(w, p.n);
      const a = (p.n * Math.PI) / 2;
      return div(c(1, 0), c(p.Q * m * Math.cos(a), p.Q * m * Math.sin(a)));
    }

    case 'w': {
      // Semi-infinite (classical) Warburg: Z = σω^(−1/2)(1 − j)
      const t = p.sigma / Math.sqrt(w);
      return c(t, -t);
    }

    case 'ws': {
      // Finite-length, TRANSMISSIVE ("short") diffusion:
      //   Z = (Rd / √(jωτ))·tanh(√(jωτ))
      const s = sqrt(c(0, w * p.tau));
      return mul(div(c(p.Rd, 0), s), tanh(s));
    }

    case 'wo': {
      // Finite-space, REFLECTIVE ("open") diffusion:
      //   Z = (Rd / √(jωτ))·coth(√(jωτ))
      const s = sqrt(c(0, w * p.tau));
      return mul(div(c(p.Rd, 0), s), coth(s));
    }

    default:
      throw new Error(`[circuits] unknown element kind "${kind}"`);
  }
}

/** Sensible starting values, chosen so each element's signature is visible
 *  on the shared 10 mHz – 100 kHz sweep. They describe no real system. */
export const ELEMENT_DEFAULTS = {
  r:   { R: 50 },
  c:   { C: 1e-4 },
  l:   { L: 1e-5 },
  cpe: { Q: 2e-4, n: 0.8 },
  w:   { sigma: 20 },
  ws:  { Rd: 60, tau: 5 },
  wo:  { Rd: 60, tau: 5 }
};

export const SWEEP = { fMin: 0.01, fMax: 100000, ppd: 12 };

/** Log-spaced frequency list shared by every plot on the page. */
export function frequencies(s = SWEEP) {
  const decades = Math.log10(s.fMax / s.fMin);
  const N = Math.max(10, Math.round(decades * s.ppd));
  const out = [];
  for (let k = 0; k <= N; k++) out.push(s.fMin * Math.pow(10, (k / N) * decades));
  return out;
}

/**
 * Sweep one element on its own.
 * @returns {{f,zRe,zIm,mag,phase}[]}
 */
export function sweepElement(kind, p, s = SWEEP) {
  return frequencies(s).map((f) => {
    const w = 2 * Math.PI * f;
    const z = zElement(kind, p, w);
    return { f, zRe: z.re, zIm: z.im, mag: abs(z), phase: argDeg(z) };
  });
}

export const nyquist = (rows) => rows.map((r) => ({ x: r.zRe, y: -r.zIm }));
export const logMag  = (rows) => rows.map((r) => ({ x: r.f, y: Math.log10(r.mag) }));
export const phase   = (rows) => rows.map((r) => ({ x: r.f, y: r.phase }));

/* ════════════════════════════════════════════════════════════
   Non-uniqueness: two circuits, one spectrum
   ════════════════════════════════════════════════════════════

   CIRCUIT A — the reading everyone reaches for first:
       Rs in series with (Rp ∥ C)
       Z_A = Rs + Rp/(1 + jωRpC)
           = [ (Rs+Rp) + jω·Rs·Rp·C ] / [ 1 + jω·Rp·C ]

   CIRCUIT B — a different topology entirely:
       Ra in parallel with (Rb in series with Cb)
       Z_B = [ Ra + jω·Ca·Ra·Rb ] / [ 1 + jω·Cb·(Ra+Rb) ]

   Matching numerator and denominator term by term gives an EXACT mapping:

       Ra = Rs + Rp
       Cb = Rp²·C / (Rs + Rp)²
       Rb = Rs·(Rs + Rp) / Rp

   Both circuits then have identical impedance at EVERY frequency — not a
   close fit, the same complex number. Yet the physical stories differ
   completely: circuit A says "electrolyte resistance Rs, then one interfacial
   process of resistance Rp"; circuit B says "a resistance Ra shunted by a
   resistor-capacitor branch". Fitting cannot choose between them, because
   there is nothing in the data to choose with.

   This is the concrete form of the rule that an equivalent circuit is a
   model, not a photograph of the physical system. */

export const PAIR_DEFAULTS = { Rs: 5, Rp: 60, C: 1e-3 };

export function degeneratePair(p = {}) {
  const { Rs, Rp, C } = { ...PAIR_DEFAULTS, ...p };

  const Ra = Rs + Rp;
  const Cb = (Rp * Rp * C) / ((Rs + Rp) * (Rs + Rp));
  const Rb = (Rs * (Rs + Rp)) / Rp;

  const rowsA = [], rowsB = [];
  let maxRelDev = 0;

  for (const f of frequencies()) {
    const w = 2 * Math.PI * f;

    // A: Rs — (Rp ∥ C)
    const zA = add(c(Rs, 0), par(c(Rp, 0), zElement('c', { C }, w)));

    // B: Ra ∥ (Rb — Cb)
    const zB = par(c(Ra, 0), add(c(Rb, 0), zElement('c', { C: Cb }, w)));

    rowsA.push({ f, zRe: zA.re, zIm: zA.im, mag: abs(zA), phase: argDeg(zA) });
    rowsB.push({ f, zRe: zB.re, zIm: zB.im, mag: abs(zB), phase: argDeg(zB) });

    const dev = abs({ re: zA.re - zB.re, im: zA.im - zB.im }) / abs(zA);
    if (dev > maxRelDev) maxRelDev = dev;
  }

  return {
    rowsA, rowsB,
    A: { Rs, Rp, C },
    B: { Ra, Rb, Cb },
    /** Largest relative difference between the two spectra across the sweep.
     *  Should be at the level of double-precision rounding — if this is ever
     *  visibly non-zero, the algebra above has been broken. */
    maxRelDev
  };
}

/* ════════════════════════════════════════════════════════════
   Declared model bases (sim-label.js will not render without these)
   ════════════════════════════════════════════════════════════ */

export function elementBasis(label, equation, extra = []) {
  return {
    model: `A single ${label}, evaluated alone`,
    equations: [equation],
    assumptions: [
      'The element is shown in isolation, connected to nothing. In a real cell it is always one term inside a larger circuit, and its signature is combined with — and often hidden by — the others.',
      'Parameter values are yours to choose. They describe no real material, electrode or cell.',
      'Ideal behaviour: the expression is evaluated exactly, with no instrument bandwidth limit, no cable inductance and no stray capacitance.',
      ...extra
    ],
    note: 'Recognising an element\'s signature is a starting point for reading a spectrum, never a proof that the process it is named after is present.'
  };
}

export const PAIR_BASIS = {
  model: 'Two different circuits with an exact algebraic mapping between them',
  equations: [
    'A:  Z = Rs + ( Rp ∥ C )',
    'B:  Z = Ra ∥ ( Rb + Cb )',
    'Ra = Rs + Rp        Cb = Rp²·C /(Rs+Rp)²        Rb = Rs·(Rs+Rp)/Rp'
  ],
  assumptions: [
    'Both curves are evaluated exactly from their own circuit expression. They are not fitted to one another — the parameter mapping is derived algebraically, so the agreement is a property of the mathematics, not of the values chosen.',
    'Ideal capacitors, no distributed elements, no inductance.',
    'The values describe no real system.'
  ],
  note: 'The two circuits are indistinguishable in impedance data at every frequency, yet describe different physical arrangements. No fit quality, error estimate or statistical criterion can separate them. Choosing between circuits therefore requires evidence from outside the impedance measurement.'
};
