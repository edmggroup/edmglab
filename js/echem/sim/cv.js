/**
 * EDMGLAB — CV simulator (Instrumentation spec §20, §27)
 *
 * Pure mathematics — no DOM.
 *
 * ══════════════════════════════════════════════════════════════════════
 *  READ THIS BEFORE TRUSTING ANY SHAPE THIS PRODUCES.
 *
 *  This is a PHENOMENOLOGICAL TEACHING MODEL, not a simulation of
 *  electrochemistry. It does NOT solve the diffusion equations, it has no
 *  Butler–Volmer kinetics, no mass transport, and no double-layer physics.
 *  It draws a curve with the right qualitative FEATURES so a student can see
 *  how those features respond to scan rate:
 *
 *     i(E) = i_capacitive + i_faradaic
 *
 *     i_capacitive = C_dl · v                    (the rectangle; ∝ v)
 *     i_faradaic   = i_p · exp[ −((E − E_p)/w)² ] (a peak envelope; i_p ∝ v^b)
 *
 *  A real CV of a real material will not look like this in detail. What
 *  transfers is the RELATIONSHIP: the capacitive box scales with v, the peaks
 *  scale with v^b, and the two therefore separate as you change scan rate.
 *  That relationship is what b-value analysis exploits, which is why the
 *  model is built around it.
 * ══════════════════════════════════════════════════════════════════════
 *
 * SIGN CONVENTION: anodic (oxidation) current positive, IUPAC convention.
 * Much of the battery and supercapacitor literature uses the opposite
 * convention, so always check the axis before comparing published figures.
 */

export const DEFAULTS = {
  eStart: -0.2,     // V — initial potential
  eVertex: 0.8,     // V — switching potential
  scanRate: 50,     // mV/s
  cycles: 2,
  cdl: 0.8,         // mF — double-layer capacitance (sets the rectangle)
  peaks: true,
  ipCoeff: 1.2,     // arbitrary scaling for the peak envelope
  bValue: 0.5,      // 0.5 → diffusion-controlled, 1.0 → surface-controlled
  eHalf: 0.30,      // V — midpoint between the two peaks
  peakSep: 0.14,    // V — separation between anodic and cathodic peaks
  peakWidth: 0.075, // V — Gaussian width
  points: 400       // samples per half-sweep
};

/**
 * Generate a cyclic voltammogram.
 * @returns {{ points:{x,y}[], meta:object }}
 *   points.x = potential (V), points.y = current (mA, anodic positive)
 */
export function generate(p = {}) {
  const o = { ...DEFAULTS, ...p };
  const v = o.scanRate / 1000;                    // mV/s → V/s
  const eLo = Math.min(o.eStart, o.eVertex);
  const eHi = Math.max(o.eStart, o.eVertex);

  // Capacitive current: proportional to scan rate (i = C dV/dt).
  const iCap = o.cdl * v * 1000;                  // mF·V/s → mA

  // Peak height scaling. b = 0.5 reproduces the square-root dependence
  // expected of a diffusion-controlled response; b = 1 the linear
  // dependence expected of a surface-confined or capacitive one.
  const iPeak = o.peaks ? o.ipCoeff * Math.pow(v, o.bValue) * 10 : 0;

  const epa = o.eHalf + o.peakSep / 2;
  const epc = o.eHalf - o.peakSep / 2;
  const gauss = (E, Ep) => Math.exp(-Math.pow((E - Ep) / o.peakWidth, 2));

  const pts = [];
  for (let cyc = 0; cyc < o.cycles; cyc++) {
    // Forward (anodic) sweep
    for (let k = 0; k <= o.points; k++) {
      const E = eLo + (eHi - eLo) * (k / o.points);
      pts.push({ x: +E.toFixed(5), y: +(iCap + iPeak * gauss(E, epa)).toFixed(6) });
    }
    // Reverse (cathodic) sweep
    for (let k = 0; k <= o.points; k++) {
      const E = eHi - (eHi - eLo) * (k / o.points);
      pts.push({ x: +E.toFixed(5), y: +(-iCap - iPeak * gauss(E, epc)).toFixed(6) });
    }
  }

  return {
    points: pts,
    meta: {
      capacitiveCurrent: iCap,
      peakCurrent: iPeak,
      epa, epc,
      peakSeparation: o.peakSep,
      window: [eLo, eHi],
      scanRate: o.scanRate
    }
  };
}

/**
 * Peak current against scan rate — the data a b-value analysis is built from.
 * Because the model DEFINES i_p ∝ v^b, fitting this recovers exactly the b
 * that was put in. That is the point: it shows what the analysis does, in a
 * case where the right answer is known. On real data the fit is the question,
 * not a check.
 */
export function scanRateSeries(p = {}, rates = [5, 10, 20, 50, 100, 200]) {
  const o = { ...DEFAULTS, ...p };
  return rates.map((r) => {
    const v = r / 1000;
    return {
      scanRate: r,
      peakCurrent: o.ipCoeff * Math.pow(v, o.bValue) * 10,
      capacitiveCurrent: o.cdl * v * 1000,
      logV: Math.log10(v),
      logIp: Math.log10(o.ipCoeff * Math.pow(v, o.bValue) * 10)
    };
  });
}

export const BASIS = {
  model: 'Phenomenological CV envelope — capacitive rectangle plus Gaussian peak pair',
  equations: [
    'i(E) = i_cap + i_far',
    'i_cap = C_dl · v                              (rectangle, proportional to scan rate)',
    'i_far = i_p · exp[ −((E − E_p)/w)² ]          (peak envelope)',
    'i_p   ∝ v^b        b = 0.5 diffusion-controlled · b = 1 surface-controlled'
  ],
  assumptions: [
    'NOT a solution of the diffusion equations. There is no Butler–Volmer kinetics, no mass transport and no real double-layer model here.',
    'Peaks are drawn as symmetric Gaussians. Real peaks are asymmetric, and their shape carries information this model cannot represent.',
    'Peak separation is a parameter you set, not a result. In a real system it reflects electron-transfer kinetics and uncompensated resistance.',
    'No ohmic (iR) distortion, no adsorption, no coupled chemical reactions, no background from the electrolyte.',
    'Currents are in arbitrary units scaled for legibility. They describe no real electrode, material or electrolyte.'
  ],
  note: 'Real CV interpretation depends on electrode material, electrolyte, concentration, geometry, scan rate, cell configuration and background current. This model exists to show how the capacitive and faradaic contributions scale differently with scan rate — the relationship b-value analysis is built on — and nothing beyond that.'
};
