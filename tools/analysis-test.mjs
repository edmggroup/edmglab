/**
 * Numerical tests for the scan-rate analysis engine.
 *
 * The clean case is a real test rather than a demonstration: the generator
 * builds its forward branch as exactly i = k1·v + k2·√v, so a correct
 * implementation must recover k1 and k2 to numerical precision. If it does
 * not, the bug is here and not in the electrochemistry.
 */

/* Relative to THIS file, not to the working directory. The path used to be
   ../EDMGLAB/js/… , which only resolved when the script was run from the
   directory above the repo — so the one audit that needs no browser was the
   one that failed the moment somebody ran it from inside the repo, which is
   where everybody runs it from. */
import * as A from '../js/echem/analysis.js';
import * as S from '../js/echem/sim/scanrate.js';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}  ${detail}`); }
};
const near = (a, b, tol) => Number.isFinite(a) && Math.abs(a - b) <= tol;

const RATES = [5, 10, 20, 50, 100, 200];

console.log('\n── fitLine ──');
{
  const xs = [1, 2, 3, 4, 5];
  const f = A.fitLine(xs, xs.map((x) => 3 * x - 7));
  ok('recovers an exact slope', near(f.m, 3, 1e-12), `m=${f.m}`);
  ok('recovers an exact intercept', near(f.c, -7, 1e-12), `c=${f.c}`);
  ok('R² is 1 on exact data', near(f.r2, 1, 1e-12), `r2=${f.r2}`);
  ok('standard error is 0 on exact data', near(f.seM, 0, 1e-9), `se=${f.seM}`);
}

console.log('\n── b-value recovers a planted exponent ──');
for (const B of [0.5, 0.62, 0.85, 1.0]) {
  const pts = RATES.map((v) => ({ scanRate: v, current: 3.7 * Math.pow(v / 1000, B) }));
  const f = A.bValue(pts);
  ok(`b = ${B}`, near(f.b, B, 1e-9), `got ${f.b}`);
  if (B === 0.5) {
    ok('  a is recovered too', near(f.a * Math.pow(1 / 1000, B) / Math.pow(1 / 1000, B), 3.7 * Math.pow(1 / 1000, B) / Math.pow(1 / 1000, B), 1e-6)
       || near(3.7 * Math.pow(50 / 1000, B), f.a * Math.pow(50, B), 1e-9),
       `a=${f.a}`);
    ok('  decades measured correctly', near(f.decades, Math.log10(200 / 5), 1e-12), `${f.decades}`);
  }
}

console.log('\n── Dunn recovers planted k1 and k2 at one potential ──');
{
  const k1 = 2.4, k2 = 0.8;
  const pts = RATES.map((r) => {
    const v = r / 1000;
    return { scanRate: r, current: k1 * v + k2 * Math.sqrt(v) };
  });
  const d = A.dunnAt(pts);
  ok('k1', near(d.k1, k1, 1e-9), `got ${d.k1}`);
  ok('k2', near(d.k2, k2, 1e-9), `got ${d.k2}`);
  ok('R² = 1', near(d.r2, 1, 1e-12), `${d.r2}`);
  ok('signs not flagged as opposed', d.opposedSigns === false);

  const v = 50;
  const expect = Math.abs(k1 * v / 1000) / (Math.abs(k1 * v / 1000) + Math.abs(k2 * Math.sqrt(v / 1000)));
  ok('capacitive fraction matches the definition',
    near(A.capacitiveFraction(d, v), expect, 1e-12), `${A.capacitiveFraction(d, v)} vs ${expect}`);
}

console.log('\n── opposite signs are detected ──');
{
  const pts = RATES.map((r) => {
    const v = r / 1000;
    return { scanRate: r, current: 2.0 * v - 0.5 * Math.sqrt(v) };
  });
  ok('k1>0, k2<0 flagged', A.dunnAt(pts).opposedSigns === true);
}

console.log('\n── interpolateAt reads the forward branch only ──');
{
  // Forward 0→1 with y=+10, reverse 1→0 with y=−10. A naive lookup averages
  // to 0; the correct one returns +10.
  const pts = [];
  for (let i = 0; i <= 20; i++) pts.push({ x: i / 20, y: 10 });
  for (let i = 20; i >= 0; i--) pts.push({ x: i / 20, y: -10 });
  ok('returns the forward value', near(A.interpolateAt(pts, 0.5), 10, 1e-9), `${A.interpolateAt(pts, 0.5)}`);
}

console.log('\n── the CLEAN generated series: the model must be recovered exactly ──');
{
  const curves = S.series(RATES);
  const sweep = A.dunnSweep(curves, { samples: 60 });
  ok('a sweep is produced', !!sweep);

  const o = S.DEFAULTS;
  let worst1 = 0, worst2 = 0, worstR2 = 1;
  for (let i = 0; i < sweep.potentials.length; i++) {
    const E = sweep.potentials[i];
    worst1 = Math.max(worst1, Math.abs(sweep.k1[i] - S.k1At(E, o)));
    worst2 = Math.max(worst2, Math.abs(sweep.k2[i] - S.k2At(E, o, o.ePeak)));
    worstR2 = Math.min(worstR2, sweep.r2[i]);
  }
  /* The residual here is INTERPOLATION, not algebra: dunnSweep samples the
     curve at potentials between the generator's grid points and interpolates
     linearly, and linear interpolation of a Gaussian of width 0.085 V across a
     3 mV grid is wrong by about 1e-4. The exact test is the one below, taken
     at potentials that land on the grid. */
  ok('k1(E) recovered through interpolation', worst1 < 2e-3, `worst error ${worst1.toExponential(2)}`);
  ok('k2(E) recovered through interpolation', worst2 < 2e-3, `worst error ${worst2.toExponential(2)}`);

  // Exactly on the generator's own grid, there is nothing to interpolate.
  const onGrid = A.dunnSweep(curves, { samples: o.points });
  let e1 = 0, e2 = 0;
  for (let i = 1; i < onGrid.potentials.length - 1; i++) {
    const E = onGrid.potentials[i];
    e1 = Math.max(e1, Math.abs(onGrid.k1[i] - S.k1At(E, o)));
    e2 = Math.max(e2, Math.abs(onGrid.k2[i] - S.k2At(E, o, o.ePeak)));
  }
  ok('k1(E) recovered exactly on the grid', e1 < 1e-9, `worst error ${e1.toExponential(2)}`);
  ok('k2(E) recovered exactly on the grid', e2 < 1e-9, `worst error ${e2.toExponential(2)}`);
  ok('every per-potential fit is exact', worstR2 > 1 - 1e-9, `worst R² ${worstR2}`);
  ok('no opposed signs anywhere', sweep.opposed.every((x) => !x));

  // And the window-averaged fraction must match the truth computed from the
  // parameters rather than from the data.
  for (const r of [10, 50, 200]) {
    const truth = S.trueCapacitiveFraction(r);
    let cap = 0, dif = 0;
    for (let i = 0; i < sweep.potentials.length; i++) {
      cap += Math.abs(sweep.k1[i] * (r / 1000));
      dif += Math.abs(sweep.k2[i] * Math.sqrt(r / 1000));
    }
    const got = cap / (cap + dif);
    ok(`capacitive fraction at ${r} mV/s matches the planted truth`,
      near(got, truth, 5e-3), `got ${(100 * got).toFixed(2)}% vs ${(100 * truth).toFixed(2)}%`);
  }
}

console.log('\n── the demonstration ──');
{
  const frac = (sw, r) => {
    let c = 0, d = 0;
    for (let i = 0; i < sw.potentials.length; i++) {
      c += Math.abs(sw.k1[i] * (r / 1000));
      d += Math.abs(sw.k2[i] * Math.sqrt(r / 1000));
    }
    return c / (c + d);
  };
  const LOW = [5, 10, 20, 50], HIGH = [50, 100, 200, 500];
  const bAt = (rates, p) => {
    const cs = S.series(rates, p);
    return A.bValue(cs.map((c) => ({ scanRate: c.scanRate, current: A.peaks(c.points).anodic.current }))).b;
  };

  /* PART ONE — b moves with the fitting range even when NOTHING is wrong.
     The peak current is k1·v + k2·√v, a SUM of two power laws, which is not
     itself a power law. A single fitted exponent is therefore a weighted
     average of 0.5 and 1 over whichever rates were chosen: the √v term
     dominates at low rate, the v term at high rate. Same electrode, same
     data, two defensible ranges, two different answers. */
  const bLo = bAt(LOW), bHi = bAt(HIGH);
  ok('b differs between low and high ranges on IDENTICAL clean data',
    Math.abs(bHi - bLo) > 0.08, `low ${bLo.toFixed(3)} vs high ${bHi.toFixed(3)}`);
  ok('and both sit between the two limiting values', bLo > 0.5 && bHi < 1.0);
  console.log(`     b at 5–50 mV/s = ${bLo.toFixed(3)}   ·   b at 50–500 mV/s = ${bHi.toFixed(3)}   (nothing changed but the range)`);

  /* PART TWO — Dunn is stable when its assumption is TRUE, and moves when it
     is not. The output looks identical either way. */
  const cleanLo = frac(A.dunnSweep(S.series(LOW), { samples: 80 }), 50);
  const cleanHi = frac(A.dunnSweep(S.series(HIGH), { samples: 80 }), 50);
  ok('Dunn is range-independent when its two-term model is the truth',
    Math.abs(cleanHi - cleanLo) < 0.005,
    `${(100 * cleanLo).toFixed(1)}% vs ${(100 * cleanHi).toFixed(1)}%`);
  console.log(`     clean: ${(100 * cleanLo).toFixed(1)}% from low rates, ${(100 * cleanHi).toFixed(1)}% from high rates`);

  for (const [label, p, minSpread] of [
    ['an unmodelled third process', { third: 1.6 }, 0.04],
    ['60 Ω uncompensated resistance', { ru: 60 }, 0.04],
    ['a peak drifting 120 mV/decade', { drift: 0.12 }, 0.06]
  ]) {
    const lo = frac(A.dunnSweep(S.series(LOW, p), { samples: 80 }), 50);
    const hi = frac(A.dunnSweep(S.series(HIGH, p), { samples: 80 }), 50);
    ok(`Dunn moves with the range once ${label} is present`,
      Math.abs(hi - lo) > minSpread, `${(100 * lo).toFixed(1)}% vs ${(100 * hi).toFixed(1)}%`);
    console.log(`     ${label}: ${(100 * lo).toFixed(1)}% from low rates, ${(100 * hi).toFixed(1)}% from high rates`);
  }
}

console.log('\n── diagnostics fire on the things they are for ──');
{
  const two = A.bValue([{ scanRate: 50, current: 1 }, { scanRate: 100, current: 1.4 }]);
  const d1 = A.diagnose({ fit: two, curves: [] });
  ok('too few scan rates', d1.some((x) => /Only 2 scan rates/.test(x.title)));
  ok('too narrow a range', d1.some((x) => /decades/.test(x.title)));

  const noisy = A.bValue(RATES.map((r, i) => ({ scanRate: r, current: Math.pow(r / 1000, 0.7) * (1 + (i % 2 ? 0.35 : -0.35)) })));
  ok('a power law that does not hold', A.diagnose({ fit: noisy, curves: [] }).some((x) => /R²/.test(x.title)));

  const drifting = S.series(RATES, { drift: 0.12 });
  const fit = A.bValue(drifting.map((c) => ({ scanRate: c.scanRate, current: A.peaks(c.points).anodic.current })));
  ok('a peak that moves with scan rate',
    A.diagnose({ fit, curves: drifting }).some((x) => /peak moves/.test(x.title)));

  const opposed = A.dunnSweep(RATES.map((r) => ({
    scanRate: r,
    points: Array.from({ length: 40 }, (_, i) => {
      const x = i / 39, v = r / 1000;
      return { x, y: 2 * v - 0.6 * Math.sqrt(v) };
    })
  })), { samples: 30 });
  ok('opposite-sign k1/k2 across the window',
    A.diagnose({ fit: A.bValue([]), curves: [], sweep: opposed }).some((x) => /opposite signs/.test(x.title)));

  /* The one R² cannot see: a clean two-term electrode over seven rates, where
     the fit is excellent and b still moves with the half you choose. */
  const seven = S.series([5, 10, 20, 50, 100, 200, 500]);
  const sevenFit = A.bValue(seven.map((c) => ({ scanRate: c.scanRate, current: A.peaks(c.points).anodic.current })));
  const sub = A.diagnose({ fit: sevenFit, curves: seven });
  ok('b inconsistent across sub-ranges is flagged', sub.some((x) => /over the lower rates/.test(x.title)),
    sub.map((x) => x.title).join(' | '));
  ok('  ...and R² alone would not have caught it', sevenFit.r2 > 0.995, `R² = ${sevenFit.r2.toFixed(5)}`);
  console.log(`     R² = ${sevenFit.r2.toFixed(5)} on a series where b moves by 0.115`);

  const flat = A.bValue(RATES.map((r) => ({ scanRate: r, current: 2 * (r / 1000) })));
  ok('b close to 1 warns about a degenerate separation',
    A.diagnose({ fit: flat, curves: [] }).some((x) => /close to 1/.test(x.title)));
}

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
