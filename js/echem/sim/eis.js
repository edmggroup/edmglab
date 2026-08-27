/**
 * EDMGLAB — EIS simulator (Instrumentation spec §25, §26, §27)
 *
 * Pure mathematics. No DOM, no chart code — so the model can be read,
 * reviewed and unit-checked on its own.
 *
 * ── THE MODEL ──
 * A modified Randles circuit:
 *
 *        ┌──── CPE ────┐
 *   Rs ──┤             ├──
 *        └── Rct — W ──┘
 *
 *   Z_CPE = 1 / ( Q·(jω)^n )        n = 1 → ideal capacitor, n < 1 → non-ideal
 *   Z_W   = σ·ω^(-1/2)·(1 − j)      semi-infinite (Warburg) diffusion
 *   Z     = Rs + ( Z_CPE ∥ (Rct + Z_W) )
 *
 * This is an exact evaluation of THAT circuit — the arithmetic is not
 * approximate. What is a modelling choice is the circuit itself.
 *
 * ── WHY THAT MATTERS (spec §26) ──
 * An equivalent circuit is a MODEL, not a picture of the physical system.
 * The same spectrum can very often be fitted by more than one circuit, and
 * agreement with the data is not evidence that the elements correspond to
 * real physical processes. This simulator is here to build intuition for
 * which feature of a spectrum each element controls — nothing more.
 */

/* Complex arithmetic lives in ./complex.js so this file and the equivalent-
   circuit explorer share one implementation. */
import { c, add, mul, div, abs } from './complex.js';

/** Impedance of a constant phase element at angular frequency ω.
 *  Z = 1/(Q(jω)^n);  (jω)^n = ω^n · (cos(nπ/2) + j sin(nπ/2)) */
function zCPE(w, Q, n) {
  const m = Math.pow(w, n);
  const ang = (n * Math.PI) / 2;
  return div(c(1, 0), c(Q * m * Math.cos(ang), Q * m * Math.sin(ang)));
}

/** Semi-infinite Warburg impedance: Z = σω^(-1/2)(1 − j). */
function zWarburg(w, sigma) {
  const t = sigma / Math.sqrt(w);
  return c(t, -t);
}

export const DEFAULTS = { Rs: 5, Rct: 60, Q: 2e-4, n: 0.88, sigma: 12, fMin: 0.01, fMax: 100000, ppd: 10 };

/**
 * Evaluate the circuit across a log-spaced frequency sweep.
 * @returns {{f,w,zRe,zIm,mag,phase}[]}  zIm is the raw imaginary part (negative
 *          for capacitive behaviour); the Nyquist helper negates it for plotting.
 */
export function sweep(p = {}) {
  const { Rs, Rct, Q, n, sigma, fMin, fMax, ppd } = { ...DEFAULTS, ...p };
  const decades = Math.log10(fMax / fMin);
  const N = Math.max(10, Math.round(decades * ppd));
  const out = [];

  for (let k = 0; k <= N; k++) {
    const f = fMin * Math.pow(10, (k / N) * decades);
    const w = 2 * Math.PI * f;

    const branch = add(c(Rct, 0), sigma > 0 ? zWarburg(w, sigma) : c(0, 0));
    const cpe = zCPE(w, Q, n);
    const par = div(mul(cpe, branch), add(cpe, branch));
    const z = add(c(Rs, 0), par);

    out.push({
      f, w,
      zRe: z.re,
      zIm: z.im,
      mag: abs(z),
      phase: (Math.atan2(z.im, z.re) * 180) / Math.PI
    });
  }
  return out;
}

/** Nyquist series: −Z″ against Z′, the conventional presentation. */
export function nyquist(rows) {
  return rows.map((r) => ({ x: r.zRe, y: -r.zIm }));
}

/** Bode magnitude: |Z| against frequency (log x handled by the chart). */
export function bodeMagnitude(rows) {
  return rows.map((r) => ({ x: r.f, y: r.mag }));
}

/** Bode phase: phase angle against frequency. */
export function bodePhase(rows) {
  return rows.map((r) => ({ x: r.f, y: r.phase }));
}

/**
 * Landmarks a student is normally asked to read off a Nyquist plot.
 * Returned so the interface can point at them — with the caveat that these
 * are exact for THIS circuit and only approximate for a real spectrum.
 */
export function landmarks(p = {}) {
  const { Rs, Rct } = { ...DEFAULTS, ...p };
  return {
    highFrequencyIntercept: Rs,
    semicircleDiameter: Rct,
    lowFrequencyIntercept: Rs + Rct
  };
}

export const BASIS = {
  model: 'Modified Randles circuit — Rs in series with [CPE ∥ (Rct + Warburg)]',
  equations: [
    'Z_CPE = 1 / ( Q·(jω)^n )          n = 1 ideal capacitor, n < 1 non-ideal',
    'Z_W   = σ·ω^(−1/2)·(1 − j)        semi-infinite diffusion',
    'Z     = Rs + ( Z_CPE ∥ (Rct + Z_W) )'
  ],
  assumptions: [
    'One charge-transfer process only. Real electrodes frequently show several, and a porous electrode is not well described by a single interfacial element at all.',
    'Semi-infinite diffusion — no finite-length or bounded diffusion behaviour.',
    'The system is linear, stationary over the measurement, and causal. A real spectrum must be checked against these (a Kramers–Kronig test) before it is interpreted.',
    'No cable inductance, so no inductive tail at high frequency.',
    'Parameter values here are yours to choose. They describe no real material, electrode or cell.'
  ],
  note: 'An equivalent circuit is a model, not a photograph of the physical system. More than one circuit can usually fit the same spectrum, and a good fit is not evidence that the elements correspond to real processes. Use this to learn which feature each element controls, then test any real interpretation against independent evidence.'
};
