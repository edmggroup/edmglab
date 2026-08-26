/**
 * EDMGLAB — GCD simulator (Instrumentation spec §24)
 *
 * Pure mathematics — no DOM.
 *
 * ── THE MODEL ──
 * An ideal capacitor in series with an ohmic resistance:
 *
 *   Charge:    V(t) = V_min + I·R_s + (I/C)·t     until V_max
 *   Discharge: V(t) = V_max − I·R_s − (I/C)·t     until V_min
 *
 * At every current reversal the voltage steps by 2·I·R_s — the IR drop.
 *
 * ── WHY THIS SIMPLE MODEL IS WORTH SIMULATING ──
 * Because it makes one of the most consequential conventions in the field
 * visible and checkable. The specific capacitance formula
 *
 *   C = I·Δt / ΔV
 *
 * gives a DIFFERENT answer depending on whether the IR drop is included in
 * ΔV. Here the true capacitance is known (you set it), so a student can
 * compute C both ways and see which one recovers the value that went in —
 * and by how much the other one is wrong. That is a lesson a real dataset
 * cannot teach, because with real data nobody knows the true answer.
 *
 * A real electrode is not an ideal capacitor: pseudocapacitive and
 * battery-type materials give sloping or plateaued curves that a single
 * capacitance value does not describe at all.
 */

export const DEFAULTS = {
  current: 1.0,   // mA
  cap: 0.5,       // F — the TRUE capacitance of the model
  rs: 2.0,        // Ω — series resistance
  vMin: 0.0,      // V
  vMax: 1.0,      // V
  cycles: 3,
  points: 240
};

/**
 * Generate a galvanostatic charge–discharge curve.
 * @returns {{ points:{x,y}[], meta:object }}  x = time (s), y = voltage (V)
 */
export function generate(p = {}) {
  const o = { ...DEFAULTS, ...p };
  const I = o.current / 1000;                 // mA → A
  const dV = o.vMax - o.vMin;
  const irDrop = I * o.rs;                    // V

  /* The instrument cycles between MEASURED voltage limits, and the measured
     voltage is the capacitor voltage plus (charge) or minus (discharge) I·Rs.
     In steady state that means the capacitor itself only ever traverses
     (ΔV − 2·I·Rs), not the full window — the rest is dropped across Rs and
     never stored. This is the whole reason the IR convention changes the
     answer, so getting it right here is the point of the model. */
  const capSpan = dV - 2 * irDrop;

  // If the ohmic drop consumes the whole window the cell cannot cycle at all.
  if (capSpan <= 0) {
    return {
      points: [],
      meta: {
        trueCapacitance: o.cap, irDrop, dischargeTime: 0, current: I,
        windowFull: dV, windowExcludingIR: capSpan,
        capacitanceExcludingIR: NaN, capacitanceIncludingIR: NaN,
        impossible: true
      }
    };
  }

  const tHalf = (o.cap * capSpan) / I;        // s — time for one half cycle

  const pts = [];
  let t = 0;

  for (let cyc = 0; cyc < o.cycles; cyc++) {
    // ── Charge: measured voltage runs from (V_min + 2·IR) up to V_max ──
    for (let k = 0; k <= o.points; k++) {
      const dt = (tHalf * k) / o.points;
      pts.push({ x: +(t + dt).toFixed(4), y: +(o.vMin + 2 * irDrop + (I / o.cap) * dt).toFixed(5) });
    }
    t += tHalf;

    // ── Discharge: the current reverses, so the measured voltage steps down
    //    by 2·I·Rs, then falls to V_min ──
    for (let k = 0; k <= o.points; k++) {
      const dt = (tHalf * k) / o.points;
      pts.push({ x: +(t + dt).toFixed(4), y: +(o.vMax - 2 * irDrop - (I / o.cap) * dt).toFixed(5) });
    }
    t += tHalf;
  }

  return {
    points: pts,
    meta: {
      trueCapacitance: o.cap,
      irDrop,
      dischargeTime: tHalf,
      current: I,
      windowFull: dV,
      windowExcludingIR: capSpan,
      /* C = I·Δt/ΔV computed both ways.
         Excluding the IR step from ΔV recovers the true capacitance exactly.
         Including it inflates ΔV, so the result UNDERSTATES the capacitance —
         by 2·I·Rs/ΔV as a fraction. */
      capacitanceExcludingIR: (I * tHalf) / capSpan,
      capacitanceIncludingIR: (I * tHalf) / dV
    }
  };
}

/** Percentage error introduced by leaving the IR drop inside ΔV. */
export function irConventionError(meta) {
  return ((meta.capacitanceIncludingIR - meta.trueCapacitance) / meta.trueCapacitance) * 100;
}

export const BASIS = {
  model: 'Ideal capacitor in series with an ohmic resistance',
  equations: [
    'Charge:     V(t) = V_min + I·R_s + (I/C)·t',
    'Discharge:  V(t) = V_max − I·R_s − (I/C)·t',
    'IR step at each current reversal = 2·I·R_s',
    'C = I·Δt / ΔV                (the value recovered depends on how ΔV is defined)'
  ],
  assumptions: [
    'The electrode is treated as a single ideal capacitance — constant with potential, state of charge and time.',
    'A single frequency-independent series resistance. Real cells show distributed and porous-electrode behaviour that no single resistor captures.',
    'No self-discharge, no faradaic side reactions, no temperature dependence, no ageing.',
    'Perfectly linear charge and discharge. Pseudocapacitive and battery-type materials are not described by this model at all.',
    'Parameter values are yours to choose and describe no real material or device.'
  ],
  note: 'The purpose here is the IR convention. Because the true capacitance is known, you can compute C = I·Δt/ΔV with the IR drop excluded and included, and see which one recovers it. On real data nobody knows the true value — which is exactly why the convention has to be stated whenever a capacitance is reported.'
};
