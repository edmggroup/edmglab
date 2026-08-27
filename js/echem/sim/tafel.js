/**
 * EDMGLAB — Tafel analysis (Instrumentation spec §29)
 *
 * Pure mathematics. No DOM.
 *
 * ── THE MODEL ──
 * A single electron-transfer reaction described by Butler–Volmer kinetics,
 * with three additions that are the usual reasons a real Tafel fit goes wrong:
 *
 *   j_k = j₀ [ exp(αa·F·η/RT) − exp(−αc·F·η/RT) ]      interfacial kinetics
 *   j   = j_k / ( 1 + |j_k| / j_lim )                   mass-transport limit
 *   η_meas = η + (j·A/1000)·Ru                          uncompensated resistance
 *   j   = j + j_bg                                      constant background
 *
 * η is the TRUE interfacial overpotential and is swept as the independent
 * variable; η_meas is what the instrument records. In a real experiment only
 * η_meas is available, which is precisely why an uncorrected Tafel slope is
 * biased.
 *
 * ── WHY THIS IS BUILT AS A FITTING EXERCISE ──
 * The governing parameters are known here, so the fitted slope can be compared
 * against the slope the model actually contains. On real data that comparison
 * is impossible: the fitted number is the only number there is. Being able to
 * see a fit return 168 mV/dec from a system whose true slope is 118 mV/dec,
 * with R² = 0.999, is the entire lesson — and it cannot be taught from data
 * where the answer is unknown.
 */

const F = 96485;      // C/mol
const Rgas = 8.314;   // J/(mol·K)

export const DEFAULTS = {
  system: 'kinetic',  // 'kinetic' | 'resistive'
  j0: 0.001,          // exchange current density, mA/cm²
  alphaA: 0.5,
  alphaC: 0.5,
  jLim: 5,            // limiting current density, mA/cm²
  Ru: 20,             // uncompensated resistance, Ω
  area: 1,            // cm²
  T: 298.15,          // K
  jBg: 0,             // constant background current density, mA/cm²
  Rp: 100,            // leakage resistance for the non-kinetic system, Ω
  branch: 'anodic',   // which branch to fit
  winMin: -2.5,       // fitting window, in log10|j|
  winMax: -1.5,
  etaMax: 0.6,
  points: 801
};

/** Tafel slope contained in the model, in V/decade. */
export function trueSlope(p = {}) {
  const { T, alphaA, alphaC, branch } = { ...DEFAULTS, ...p };
  const a = branch === 'cathodic' ? alphaC : alphaA;
  const b = (2.302585 * Rgas * T) / (a * F);
  return branch === 'cathodic' ? -b : b;
}

/**
 * Generate the polarisation response.
 * @returns {{eta,etaMeas,j,logAbsJ}[]}  eta is the TRUE interfacial
 *          overpotential; etaMeas is what an instrument would record.
 */
export function generate(p = {}) {
  const o = { ...DEFAULTS, ...p };
  const out = [];
  const RT = Rgas * o.T;

  for (let i = 0; i < o.points; i++) {
    const eta = -o.etaMax + (2 * o.etaMax * i) / (o.points - 1);

    let j;
    if (o.system === 'resistive') {
      // A purely ohmic leakage response — the situation on an EDLC-type
      // electrode at steady state. There is no kinetic region here at all.
      j = (eta / (o.Rp * o.area)) * 1000;
    } else {
      const jk = o.j0 * (Math.exp((o.alphaA * F * eta) / RT) - Math.exp((-o.alphaC * F * eta) / RT));
      j = o.jLim > 0 ? jk / (1 + Math.abs(jk) / o.jLim) : jk;
    }

    j += o.jBg;

    const etaMeas = eta + ((j * o.area) / 1000) * o.Ru;
    out.push({ eta, etaMeas, j, logAbsJ: Math.log10(Math.abs(j)) });
  }
  return out;
}

/**
 * Least-squares fit of η against log10|j| inside the chosen window.
 * @returns {null|{slope,intercept,r2,n,jFit,points}} slope in V/decade
 */
export function fitWindow(rows, p = {}) {
  const o = { ...DEFAULTS, ...p };
  const lo = Math.min(o.winMin, o.winMax);
  const hi = Math.max(o.winMin, o.winMax);

  const sel = rows.filter((r) => {
    if (!Number.isFinite(r.logAbsJ)) return false;
    if (r.logAbsJ < lo || r.logAbsJ > hi) return false;
    return o.branch === 'cathodic' ? r.j < 0 : r.j > 0;
  });

  if (sel.length < 3) return null;

  let sx = 0, sy = 0;
  for (const r of sel) { sx += r.logAbsJ; sy += r.etaMeas; }
  const mx = sx / sel.length, my = sy / sel.length;

  let sxy = 0, sxx = 0, syy = 0;
  for (const r of sel) {
    const dx = r.logAbsJ - mx, dy = r.etaMeas - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  if (sxx === 0) return null;

  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  const r2 = syy === 0 ? 1 : (sxy * sxy) / (sxx * syy);

  // Extrapolate the fitted line to η = 0 to recover an apparent exchange
  // current density — the standard construction, shown here so its
  // sensitivity to the window is visible.
  const jFit = slope !== 0 ? Math.pow(10, -intercept / slope) : NaN;

  return {
    slope, intercept, r2, n: sel.length, jFit,
    logMin: Math.min(...sel.map((r) => r.logAbsJ)),
    logMax: Math.max(...sel.map((r) => r.logAbsJ)),
    points: sel
  };
}

/** The fitted straight line, for drawing across the window only. */
export function fitLine(fit) {
  if (!fit) return [];
  const a = fit.logMin, b = fit.logMax;
  return [
    { x: a, y: fit.slope * a + fit.intercept },
    { x: b, y: fit.slope * b + fit.intercept }
  ];
}

/**
 * Where the model stops being kinetically controlled. Used to tell the user
 * — after they have looked — which parts of their window were unsuitable.
 */
export function diagnoseWindow(rows, fit, p = {}) {
  const o = { ...DEFAULTS, ...p };
  if (!fit) return [];
  const flags = [];

  const sel = fit.points;
  const fracOfLim = sel.reduce((m, r) => Math.max(m, Math.abs(r.j) / o.jLim), 0);
  const maxIrShare = sel.reduce((m, r) => {
    const ir = Math.abs(((r.j * o.area) / 1000) * o.Ru);
    const tot = Math.abs(r.etaMeas);
    return tot > 0 ? Math.max(m, ir / tot) : m;
  }, 0);
  const bgShare = sel.reduce((m, r) => Math.max(m, o.jBg > 0 ? o.jBg / Math.abs(r.j) : 0), 0);

  if (o.system === 'resistive') {
    flags.push({ sev: 'danger', text:
      'This system has no Tafel region at all. The response is ohmic, so the local slope of η against log|j| is 2.303·η — it grows with overpotential and takes a different value in every window. The fitted number below is arithmetic, not a kinetic parameter.' });
  }
  if (o.system === 'kinetic' && fracOfLim > 0.1) {
    flags.push({ sev: 'warn', text:
      `The window reaches ${(fracOfLim * 100).toFixed(0)}% of the limiting current density. Mass transport is contributing there, so the region is not purely kinetically controlled.` });
  }
  if (maxIrShare > 0.05) {
    flags.push({ sev: 'warn', text:
      `Up to ${(maxIrShare * 100).toFixed(0)}% of the recorded overpotential in this window is iR drop across the uncompensated resistance, not interfacial overpotential. Correct for it before fitting.` });
  }
  if (bgShare > 0.05) {
    flags.push({ sev: 'warn', text:
      `The background current is up to ${(bgShare * 100).toFixed(0)}% of the total current in this window, so part of what is being fitted is not the reaction of interest.` });
  }
  /* 0.95 rather than 1.0: the span is measured from the points that actually
     fell inside the window, which is always a fraction of a step short of the
     requested width. Flagging a 0.98-decade window as too narrow would be the
     check misreading its own sampling. */
  if (fit.logMax - fit.logMin < 0.95) {
    flags.push({ sev: 'warn', text:
      `The window spans ${(fit.logMax - fit.logMin).toFixed(2)} decades. A Tafel region is conventionally expected to be linear over at least one full decade of current; a narrower window will look linear almost regardless of the underlying behaviour.` });
  }
  if (!flags.length) {
    flags.push({ sev: 'ok', text:
      'This window sits in the kinetically-controlled region of the model, spans at least a decade, and is not dominated by iR drop or background. The fitted slope should be close to the value the model contains — compare them above.' });
  }
  return flags;
}

export const BASIS = {
  model: 'Butler–Volmer kinetics for a single electron-transfer step, with a mass-transport limit, an uncompensated series resistance and a constant background current',
  equations: [
    'j_k   = j₀ [ exp(αa·F·η/RT) − exp(−αc·F·η/RT) ]',
    'j     = j_k / ( 1 + |j_k| / j_lim )   +   j_bg',
    'η_meas = η + (j·A)·Ru                  the instrument records η_meas, not η',
    'Tafel slope contained in the model:  b = 2.303·R·T / (α·F)'
  ],
  assumptions: [
    'ONE electron-transfer step, with no adsorbed intermediates and no coupled chemical reaction. Multi-step mechanisms and adsorption change the expected slope, which is why a measured slope does not by itself identify a mechanism.',
    'Transfer coefficients independent of potential, and a reaction order of one.',
    'A single lumped limiting current density stands in for all mass transport. Real convection and diffusion are geometry-dependent.',
    'The electrode area used for normalisation is the geometric area. A porous or rough electrode has a much larger real area, and current densities normalised to geometric area are not comparable between electrodes of different roughness.',
    'No double-layer charging term: this is a steady-state treatment, so it does not describe a fast sweep.',
    'All parameter values are yours to choose. They describe no real reaction, catalyst or electrolyte.'
  ],
  note: 'The fitted slope is compared here against the slope the model actually contains. That comparison is available only because the answer is known in advance. On real data the fit returns a number whatever region it is applied to, and nothing in the fit statistics reveals whether the region was suitable.'
};
