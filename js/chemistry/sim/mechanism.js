/**
 * EDMGLAB — Storage-mechanism model (Roadmap P8)
 *
 * Pure mathematics. No DOM.
 *
 * ────────────────────────────────────────────────────────────────────────
 *  ONE FUNCTION PRODUCES BOTH THE VOLTAMMOGRAM AND THE DISCHARGE CURVE.
 * ────────────────────────────────────────────────────────────────────────
 *
 * Everything here is built on a single quantity: the DIFFERENTIAL CAPACITANCE
 * dQ/dV — how much charge the electrode takes on for each additional volt.
 *
 *     dQ/dV(V) = C_dl  +  Σ  Q_i · x_i(1 − x_i) / k_i
 *
 * where x_i is the fractional occupancy of redox couple i, which for an ideal
 * (Nernstian, non-interacting) couple is the logistic function
 *
 *     x_i(V) = 1 / ( 1 + exp( −(V − V_i)/k_i ) )
 *
 * That is not a curve-fitting convenience. Inverting the logistic gives back
 * the Nernst equation, V = V_i + k_i·ln(x/(1−x)), with k_i = RT/(nF) for an
 * ideal one-electron couple; larger k_i is the usual empirical stand-in for
 * interactions and site-energy dispersion, which broaden a real couple.
 *
 * From that one function BOTH observables follow directly:
 *
 *     CV:   i(V) = v · dQ/dV            current is scan rate × differential capacitance
 *     GCD:  t(V) = ΔQ(V) / I            time is accumulated charge ÷ current
 *
 * So the rectangle and the plateau are not two behaviours. They are the same
 * object seen through two experiments — a flat dQ/dV gives a rectangular CV
 * AND a linear discharge; a peaked dQ/dV gives a peaked CV AND a plateau. A
 * student who sees one control both stops treating "capacitor-like" and
 * "battery-like" as categories and starts treating them as a spectrum, which
 * is what they are.
 *
 * ── WHAT THIS MODEL IS NOT ──
 * It contains no kinetics, no transport and no resistance. Every curve here is
 * the thermodynamic limit: infinitely slow, perfectly reversible. Real
 * electrodes deviate from it, and the ways they deviate are what the rest of
 * the platform is about. Nothing here describes any real material.
 */

const F = 96485.332;      // C/mol
const Rgas = 8.314462618; // J/(mol·K)

/** k = RT/(nF): the Nernstian width of an ideal n-electron couple, in volts. */
export function nernstWidth(n = 1, T = 298.15) {
  return (Rgas * T) / (n * F);
}

/* ════════════════════════════════════════════════════════════
   Presets — three points on one spectrum, not three categories
   ════════════════════════════════════════════════════════════ */

export const PRESETS = {
  edlc: {
    label: 'Electrical double layer',
    note: 'Charge stored electrostatically. No redox couple, so the differential capacitance is flat.',
    cdl: 0.10,                       // F
    couples: []
  },
  pseudo: {
    label: 'Surface pseudocapacitance',
    note: 'A redox couple broadened by site-energy dispersion until its contribution is nearly flat — which is why it looks capacitive despite being faradaic.',
    cdl: 0.04,
    couples: [{ V: 0.5, Q: 0.09, k: 0.16 }]
  },
  battery: {
    label: 'Battery-type intercalation',
    note: 'A narrow couple. The differential capacitance is a sharp peak, which is a plateau in the discharge curve.',
    cdl: 0.01,
    couples: [{ V: 0.5, Q: 0.12, k: 0.025 }]
  },
  twoStage: {
    label: 'Two-stage intercalation',
    note: 'Two narrow couples — two peaks in the voltammogram and two plateaus in the discharge.',
    cdl: 0.01,
    couples: [{ V: 0.35, Q: 0.06, k: 0.02 }, { V: 0.68, Q: 0.06, k: 0.02 }]
  }
};

export const DEFAULTS = { vMin: 0, vMax: 1, current: 0.005, scanRate: 0.005, points: 801 };

/* ════════════════════════════════════════════════════════════
   The model
   ════════════════════════════════════════════════════════════ */

/** Fractional occupancy of one ideal couple at potential V. */
const occupancy = (V, c) => 1 / (1 + Math.exp(-(V - c.V) / c.k));

/** Differential capacitance dQ/dV at potential V, in farads. */
export function dQdV(V, m) {
  let d = m.cdl || 0;
  for (const c of m.couples || []) {
    const x = occupancy(V, c);
    d += (c.Q * x * (1 - x)) / c.k;
  }
  return d;
}

/** Charge stored between vMin and V, in coulombs. Exact for this model. */
export function chargeTo(V, m, vMin) {
  let q = (m.cdl || 0) * (V - vMin);
  for (const c of m.couples || []) {
    q += c.Q * (occupancy(V, c) - occupancy(vMin, c));
  }
  return q;
}

/**
 * The two observables, from the one function.
 *
 * @returns {{ dc, cv, gcd, meta }}
 *   dc  — differential capacitance against potential
 *   cv  — current against potential (both sweep directions)
 *   gcd — potential against time, for a constant-current discharge
 */
export function generate(m, p = {}) {
  const o = { ...DEFAULTS, ...p };
  const dc = [], cvUp = [], cvDown = [], gcd = [];

  const qTotal = chargeTo(o.vMax, m, o.vMin);

  for (let i = 0; i < o.points; i++) {
    const V = o.vMin + ((o.vMax - o.vMin) * i) / (o.points - 1);
    const d = dQdV(V, m);

    dc.push({ x: V, y: d });

    // i = v · dQ/dV. Anodic positive on the up-sweep, cathodic negative on the
    // way back. With no kinetics in the model the two branches are mirror
    // images — a real electrode's are not, and that difference is information.
    cvUp.push({ x: V, y: o.scanRate * d });
    cvDown.push({ x: V, y: -o.scanRate * d });

    // Discharge from vMax downward at constant current: the time to reach V is
    // the charge still above it, divided by the current.
    const t = (qTotal - chargeTo(V, m, o.vMin)) / o.current;
    gcd.push({ x: t, y: V });
  }

  return {
    dc,
    cv: [...cvUp, ...cvDown.slice().reverse()],
    gcd: gcd.slice().reverse(),          // ascending in time
    meta: {
      totalCharge: qTotal,
      dischargeTime: qTotal / o.current,
      meanCapacitance: qTotal / (o.vMax - o.vMin),
      peakDQdV: dc.reduce((a, b) => Math.max(a, b.y), 0),
      minDQdV: dc.reduce((a, b) => Math.min(a, b.y), Infinity)
    }
  };
}

/* ════════════════════════════════════════════════════════════
   Is a single capacitance a meaningful description?
   ════════════════════════════════════════════════════════════

   C = I·Δt/ΔV is, for this model, exactly the charge stored across the window
   divided by the width of the window:

       C_apparent(V_low, V_high) = [Q(V_high) − Q(V_low)] / (V_high − V_low)

   For a genuine capacitor dQ/dV is constant, so that ratio is the SAME for
   every window. That window-independence is what makes a capacitance a
   property of the electrode rather than of the measurement.

   For a battery-type electrode dQ/dV is a peak, so the ratio depends entirely
   on where the window sits — a window on the plateau returns an enormous
   "capacitance", one off the plateau returns almost nothing, and neither
   number describes the material. The quantity being reported does not exist.

   This function computes that dependence directly, so the point is
   demonstrated from the model's own arithmetic rather than asserted.        */

export function windowCapacitance(m, vLow, vHigh) {
  if (!(vHigh > vLow)) return NaN;
  return (chargeTo(vHigh, m, 0) - chargeTo(vLow, m, 0)) / (vHigh - vLow);
}

/**
 * Apparent capacitance for a sliding window of fixed width across the range.
 * The spread of these values is the answer to "is a single capacitance
 * meaningful for this electrode?"
 */
export function windowScan(m, p = {}) {
  const o = { ...DEFAULTS, ...p };
  const width = o.windowWidth ?? 0.2;
  const out = [];
  const steps = 120;

  for (let i = 0; i <= steps; i++) {
    const lo = o.vMin + ((o.vMax - o.vMin - width) * i) / steps;
    out.push({ x: lo + width / 2, y: windowCapacitance(m, lo, lo + width) });
  }

  const ys = out.map((q) => q.y).filter(Number.isFinite);
  const min = Math.min(...ys), max = Math.max(...ys);
  return {
    points: out,
    min, max,
    /** max/min — 1.00 means a single capacitance describes the electrode
     *  exactly; large values mean the number you report is a property of the
     *  window you chose. */
    spread: min > 0 ? max / min : Infinity
  };
}

export const BASIS = {
  model: 'Ideal (Nernstian) redox couples in parallel with a constant double-layer capacitance, at thermodynamic equilibrium',
  equations: [
    'x_i(V) = 1 / ( 1 + exp( −(V − V_i)/k_i ) )          fractional occupancy of couple i',
    'dQ/dV  = C_dl + Σ Q_i · x_i(1 − x_i) / k_i          differential capacitance',
    'i(V)   = v · dQ/dV                                   the voltammogram',
    't(V)   = [ Q(V_max) − Q(V) ] / I                     the discharge curve',
    'k_i    = RT/(n F) for an ideal couple; larger k stands in for interactions and site-energy dispersion'
  ],
  assumptions: [
    'Thermodynamic equilibrium at every point — infinitely slow, perfectly reversible. There is no kinetics, no transport and no resistance anywhere in this model.',
    'Non-interacting sites within each couple. Real intercalation hosts have interactions, staging and phase transitions that this does not describe.',
    'The two sweep directions are exact mirror images, because nothing here is irreversible. On a real electrode they are not, and the difference between them is information this model cannot show you.',
    'Parameter values are yours to choose. They describe no real material, electrode or device.'
  ],
  note: 'The point of one model producing both plots is that "capacitor-like" and "battery-like" are not two mechanisms with two theories. They are one differential-capacitance function that is flat in one case and peaked in the other, and every experimental signature follows from that.'
};
