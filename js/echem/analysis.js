/**
 * EDMGLAB — Scan-rate analysis (Roadmap P6)
 *
 * Pure mathematics — no DOM, no data loading.
 *
 * Two analyses live here, and they are among the most misused in the whole
 * field. Both take a set of voltammograms recorded at different scan rates and
 * return a confident-looking number. Neither identifies a mechanism.
 *
 *   b-VALUE          i = a·v^b, fitted as log|i| = b·log v + log a
 *                    at ONE fixed potential across the series.
 *
 *   DUNN             i(v) = k1·v + k2·√v, solved at EACH potential,
 *                    linearised as  i/√v = k1·√v + k2.
 *                    Slope k1, intercept k2.
 *
 * WHAT THE NUMBERS DO NOT MEAN
 *
 * b = 1 is routinely written up as "capacitive". It is not. b = 1 says the
 * current scales linearly with scan rate, which is true of double-layer
 * charging, of surface-confined redox, and of a system whose response is
 * limited by uncompensated resistance. Three different explanations, one
 * exponent. b = 0.5 likewise says "scales with √v", which semi-infinite
 * diffusion produces and so do several other things.
 *
 * Dunn's "capacitive fraction" is worse, because it looks like a measurement.
 * It is the fraction of current that a TWO-TERM MODEL assigns to its v-term.
 * If the electrode has a third process, or ohmic distortion, or finite
 * diffusion, the model has nowhere to put it and divides it between the two
 * bins it has. The percentage still comes out, and it still looks precise.
 *
 * So every function here returns its diagnostics alongside its number, and
 * the view is built to show them together. `diagnose()` is not decoration.
 */

/* ── Least squares ───────────────────────────────────────── */

/**
 * Ordinary least-squares fit of y = m·x + c.
 * Returns the standard error on the slope as well, because the whole question
 * in a b-value analysis is whether the fitted exponent is far enough from its
 * neighbours to mean anything.
 */
export function fitLine(xs, ys) {
  const n = xs.length;
  if (n < 2) return { m: NaN, c: NaN, r2: NaN, seM: NaN, n };
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) ** 2;
    sxy += (xs[i] - mx) * (ys[i] - my);
    syy += (ys[i] - my) ** 2;
  }
  const m = sxx === 0 ? NaN : sxy / sxx;
  const c = my - m * mx;
  const r2 = syy === 0 ? 1 : (sxy * sxy) / (sxx * syy);
  // Residual standard error, then the standard error on the slope.
  let ss = 0;
  for (let i = 0; i < n; i++) ss += (ys[i] - (m * xs[i] + c)) ** 2;
  const seM = n > 2 && sxx > 0 ? Math.sqrt(ss / (n - 2) / sxx) : NaN;
  return { m, c, r2, seM, n };
}

/* ── b-value ─────────────────────────────────────────────── */

/**
 * Fit i = a·v^b.
 * @param {{scanRate:number, current:number}[]} pts  scanRate in mV/s, current in any consistent unit
 * @returns {{b, a, r2, seB, n, decades, usable}}
 */
export function bValue(pts) {
  const good = pts.filter((p) => Number.isFinite(p.scanRate) && p.scanRate > 0 &&
                                 Number.isFinite(p.current) && Math.abs(p.current) > 0);
  if (good.length < 2) return { b: NaN, a: NaN, r2: NaN, seB: NaN, n: good.length, decades: 0, usable: false };
  const xs = good.map((p) => Math.log10(p.scanRate));
  const ys = good.map((p) => Math.log10(Math.abs(p.current)));
  const f = fitLine(xs, ys);
  return {
    b: f.m,
    a: Math.pow(10, f.c),
    r2: f.r2,
    seB: f.seM,
    n: good.length,
    decades: Math.max(...xs) - Math.min(...xs),
    usable: Number.isFinite(f.m)
  };
}

/* ── Dunn ────────────────────────────────────────────────── */

/**
 * Solve i(v) = k1·v + k2·√v at ONE potential.
 *
 * Linearised as i/√v = k1·√v + k2, which is the form everyone uses: a
 * straight line whose slope is k1 and whose intercept is k2.
 *
 * @param {{scanRate:number, current:number}[]} pts  scanRate mV/s → converted to V/s here
 */
export function dunnAt(pts) {
  const good = pts.filter((p) => Number.isFinite(p.scanRate) && p.scanRate > 0 && Number.isFinite(p.current));
  if (good.length < 3) return { k1: NaN, k2: NaN, r2: NaN, n: good.length, opposedSigns: false };
  const xs = good.map((p) => Math.sqrt(p.scanRate / 1000));
  const ys = good.map((p) => p.current / Math.sqrt(p.scanRate / 1000));
  const f = fitLine(xs, ys);
  return {
    k1: f.m,
    k2: f.c,
    r2: f.r2,
    n: good.length,
    /* k1 and k2 pulling in opposite directions means one "contribution" is
       NEGATIVE — a process removing current. That is not a decomposition, it
       is the model being forced onto data it does not describe. */
    opposedSigns: Number.isFinite(f.m) && Number.isFinite(f.c) && f.m * f.c < 0
  };
}

/** The capacitive share the model assigns at a given scan rate. */
export function capacitiveFraction({ k1, k2 }, scanRateMvS) {
  const v = scanRateMvS / 1000;
  const cap = Math.abs(k1 * v);
  const dif = Math.abs(k2 * Math.sqrt(v));
  const tot = cap + dif;
  return tot > 0 ? cap / tot : NaN;
}

/**
 * Dunn across a whole potential window.
 *
 * @param {{scanRate:number, points:{x:number,y:number}[]}[]} curves
 *        one voltammogram per scan rate; x = potential (V), y = current
 * @param {object} [opts]
 * @param {number} [opts.samples=120]  potentials to solve at
 * @returns {{potentials, k1, k2, r2, opposed, window:[lo,hi], atRate}}
 */
export function dunnSweep(curves, opts = {}) {
  const samples = opts.samples || 120;
  const usable = curves.filter((c) => c.points && c.points.length > 3);
  if (usable.length < 3) return null;

  /* Only the potential range every curve actually covers. Extrapolating one
     curve into a window another never reached would invent current. */
  const lo = Math.max(...usable.map((c) => Math.min(...c.points.map((p) => p.x))));
  const hi = Math.min(...usable.map((c) => Math.max(...c.points.map((p) => p.x))));
  if (!(hi > lo)) return null;

  const potentials = [];
  const k1 = [], k2 = [], r2 = [], opposed = [];
  for (let i = 0; i < samples; i++) {
    const E = lo + ((hi - lo) * i) / (samples - 1);
    const pts = usable.map((c) => ({ scanRate: c.scanRate, current: interpolateAt(c.points, E) }))
                      .filter((p) => Number.isFinite(p.current));
    const d = dunnAt(pts);
    potentials.push(E); k1.push(d.k1); k2.push(d.k2); r2.push(d.r2); opposed.push(d.opposedSigns);
  }
  return {
    potentials, k1, k2, r2, opposed,
    window: [lo, hi],
    /** The modelled capacitive current across the window at one scan rate. */
    atRate(scanRateMvS) {
      const v = scanRateMvS / 1000;
      return potentials.map((E, i) => ({ x: E, y: k1[i] * v }));
    },
    /** Total modelled current, for comparison against the measured curve. */
    modelAt(scanRateMvS) {
      const v = scanRateMvS / 1000;
      return potentials.map((E, i) => ({ x: E, y: k1[i] * v + k2[i] * Math.sqrt(v) }));
    }
  };
}

/**
 * Current at a potential on ONE sweep direction.
 *
 * A voltammogram passes each potential twice, so a naive lookup mixes the
 * forward and reverse branches into one meaningless average. This takes the
 * forward (increasing-potential) branch, which is the convention for the
 * anodic analysis, and interpolates linearly within it.
 */
export function interpolateAt(points, E) {
  let best = null;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (b.x <= a.x) continue;                       // reverse branch — skip
    if ((E >= a.x && E <= b.x)) {
      const t = (E - a.x) / (b.x - a.x);
      const y = a.y + t * (b.y - a.y);
      if (best === null) best = y;
    }
  }
  return best === null ? NaN : best;
}

/** Anodic and cathodic peaks of one voltammogram. */
export function peaks(points) {
  let hi = null, lo = null;
  for (const p of points) {
    if (!Number.isFinite(p.y)) continue;
    if (hi === null || p.y > hi.y) hi = p;
    if (lo === null || p.y < lo.y) lo = p;
  }
  return {
    anodic: hi ? { potential: hi.x, current: hi.y } : null,
    cathodic: lo ? { potential: lo.x, current: lo.y } : null
  };
}

/* ── Diagnostics ─────────────────────────────────────────── */

/**
 * Everything that makes these numbers untrustworthy, checked rather than
 * remembered. Each entry says what is wrong and what it does to the result;
 * `level` is 'error' when the number should not be reported at all.
 *
 * @param {object} arg
 * @param {object} arg.fit        result of bValue()
 * @param {object[]} arg.curves   the series, for peak-shift checking
 * @param {object} [arg.sweep]    result of dunnSweep()
 */
export function diagnose({ fit, curves = [], sweep = null }) {
  const out = [];
  const add = (level, title, detail) => out.push({ level, title, detail });

  /* ── how much of a series is this ── */
  if (fit.n < 4) {
    add('error', `Only ${fit.n} scan rate${fit.n === 1 ? '' : 's'}`,
      'A power law fitted through three points or fewer will pass through them almost regardless of what the electrode is doing. Four is a bare minimum; five or six across the range below is what makes the exponent mean something.');
  }
  if (fit.decades < 1) {
    add('error', `Scan rates span ${fit.decades.toFixed(2)} decades`,
      'The exponent is the slope of a line on log axes, so a short x-range gives a slope with almost no leverage. Below one decade — say 10 to 100 mV/s — b is barely constrained by the data. Two decades is a comfortable series.');
  } else if (fit.decades < 1.3) {
    add('warn', `Scan rates span ${fit.decades.toFixed(2)} decades`,
      'Enough to fit, not enough to be confident. Widening the range is usually cheaper than any other improvement to this analysis.');
  }

  /* ── does the power law actually hold ── */
  if (Number.isFinite(fit.r2)) {
    if (fit.r2 < 0.98) {
      add('error', `R² = ${fit.r2.toFixed(4)} — the power law does not hold`,
        'i = a·v^b is a straight line on log–log axes. If the points are not on a line, no single b describes this electrode over this range, and quoting one hides a change of regime rather than reporting it. Look at the log–log plot for curvature: it usually means the high rates are distorted, or two processes are trading places.');
    } else if (fit.r2 < 0.995) {
      add('warn', `R² = ${fit.r2.toFixed(4)}`,
        'Acceptable, but check the residuals for a systematic bend rather than scatter. A bend is a regime change; scatter is noise.');
    }
  }

  /* ── is b far enough from its neighbours to distinguish anything ── */
  if (Number.isFinite(fit.seB)) {
    const lo = fit.b - 1.96 * fit.seB, hi = fit.b + 1.96 * fit.seB;
    const spans = (t) => lo <= t && t <= hi;
    if (spans(0.5) && spans(1.0)) {
      add('error', `b = ${fit.b.toFixed(3)} ± ${fit.seB.toFixed(3)}, and the interval covers both 0.5 and 1.0`,
        'The fit cannot tell the two limiting behaviours apart. Whatever this electrode is doing, this series does not establish it.');
    } else if (spans(0.5) || spans(1.0)) {
      add('warn', `b = ${fit.b.toFixed(3)} ± ${fit.seB.toFixed(3)} — the interval reaches ${spans(0.5) ? '0.5' : '1.0'}`,
        'The value is not distinguishable from that limit at the 95% level. Report the uncertainty with the number, not the number alone.');
    }
  }

  /* ── is the peak in the same place at every rate ── */
  const ps = curves.map((c) => ({ v: c.scanRate, p: peaks(c.points).anodic }))
                   .filter((x) => x.p);
  if (ps.length >= 2) {
    const shift = Math.max(...ps.map((x) => x.p.potential)) - Math.min(...ps.map((x) => x.p.potential));
    if (shift > 0.05) {
      add('error', `The anodic peak moves ${(shift * 1000).toFixed(0)} mV across the series`,
        'A b-value is fitted at ONE potential across all the scan rates. If the peak has moved, the currents being compared are no longer from the same point on the same process — and a peak that shifts with rate is itself evidence of kinetic or ohmic limitation. Fit at a fixed potential on the rising edge instead, and say which potential you used.');
    } else if (shift > 0.02) {
      add('warn', `The anodic peak moves ${(shift * 1000).toFixed(0)} mV across the series`,
        'Small, but state the potential the fit was taken at. "At the peak" is not reproducible when the peak moves.');
    }
  }

  /* ── does the two-term model hold together ── */
  if (sweep) {
    const bad = sweep.opposed.filter(Boolean).length;
    if (bad > sweep.opposed.length * 0.05) {
      add('error', `k₁ and k₂ have opposite signs at ${Math.round((100 * bad) / sweep.opposed.length)}% of potentials`,
        'One of the two "contributions" is negative there — a process that removes current. That is not a decomposition of the measurement; it is the two-term model being forced onto data it does not describe. The percentages computed from it are arithmetic, not physics.');
    } else if (bad) {
      add('warn', `k₁ and k₂ have opposite signs at ${bad} of ${sweep.opposed.length} potentials`,
        'Usually at the window edges where both terms are small. Check that the reported fraction is not being driven by those points.');
    }
    const poor = sweep.r2.filter((r) => Number.isFinite(r) && r < 0.98).length;
    if (poor > sweep.r2.length * 0.2) {
      add('warn', `The per-potential fit is poor (R² < 0.98) at ${Math.round((100 * poor) / sweep.r2.length)}% of potentials`,
        'The separation is only as good as the fit behind it, and that fit is done independently at every potential. A map of R² across the window shows where the number can be trusted and where it cannot.');
    }
  }

  /* ── is ONE exponent describing the whole range at all ──
     R² does not catch this. A current that is k1·v + k2·√v is a SUM of two
     power laws, which is not itself a power law — but over a modest range it
     lies close enough to a straight line on log axes that R² stays above
     0.999 while the fitted slope still moves substantially depending on which
     rates went in. Splitting the series and fitting each half is the check
     that sees it. */
  if (curves.length >= 6) {
    const pts = curves.map((c) => {
      const pk = peaks(c.points).anodic;
      return { scanRate: c.scanRate, current: pk ? pk.current : NaN };
    }).filter((x) => Number.isFinite(x.current)).sort((a, b) => a.scanRate - b.scanRate);
    if (pts.length >= 6) {
      const half = Math.ceil(pts.length / 2);
      const lo = bValue(pts.slice(0, half));
      const hi = bValue(pts.slice(half - 1));
      const gap = Math.abs(hi.b - lo.b);
      if (Number.isFinite(gap) && gap > 0.08) {
        add('error', `b is ${lo.b.toFixed(3)} over the lower rates and ${hi.b.toFixed(3)} over the upper`,
          `One exponent is not describing this electrode across this range — and R² will not tell you, because a sum of two power laws still looks like a line on log axes. Whichever half somebody fits is the b they will report. Quote the range with the number, or quote both.`);
      } else if (Number.isFinite(gap) && gap > 0.04) {
        add('warn', `b moves ${gap.toFixed(3)} between the lower and upper halves of the series`,
          'Small but systematic. State the scan-rate range the fit used; without it the number is not reproducible.');
      }
    }
  }

  /* ── the degeneracy nobody mentions ── */
  if (Number.isFinite(fit.b) && fit.b > 0.95) {
    add('warn', `b = ${fit.b.toFixed(3)} — close to 1 across the window`,
      'When the current is very nearly linear in v everywhere, the √v term has almost nothing to explain, and k₂ is fitted mostly to noise. A Dunn separation here will report a high capacitive percentage because the model has nowhere else to put the current — not because it has measured a double layer.');
  }

  return out;
}

/**
 * What this analysis licenses, and what it does not. Rendered next to every
 * result. Not a disclaimer — the sentences a reader needs in order to write
 * an honest sentence of their own.
 */
export const LIMITS = {
  bValue: [
    'b describes how the current scales with scan rate. It does not name a mechanism.',
    'b ≈ 1 is produced by double-layer charging, by surface-confined redox, AND by a response limited by uncompensated resistance. Three explanations, one exponent.',
    'b ≈ 0.5 is produced by semi-infinite diffusion, and also by any process whose rate limits in the same way over the range measured.',
    'b is fitted at ONE potential. Report which potential. A b quoted "at the peak" is not reproducible if the peak moves with rate.',
    'b is a property of the range you measured, not of the material. Extending the scan rates can change it, and that change is itself the result.'
  ],
  dunn: [
    'The capacitive fraction is a MODEL OUTPUT, not a measurement. It is the share of current that i = k₁v + k₂√v assigns to its first term.',
    'The model has exactly two bins. A third process, ohmic distortion or finite-length diffusion has nowhere to go, so it is divided between them — and the percentage still comes out looking precise.',
    'Negative k₁ or k₂ means the model does not fit. It does not mean a negative contribution.',
    'The separation depends on the scan-rate range. Quoting "85% capacitive" without the range and the potential window is not a reproducible statement.',
    'Two electrodes can only be compared this way if the same window, the same rates and the same fitting potential were used for both.'
  ]
};
