/**
 * EDMGLAB — Minimal complex arithmetic for impedance models
 *
 * Extracted so the EIS simulator (sim/eis.js) and the equivalent-circuit
 * element explorer (sim/circuits.js) share ONE implementation. Two copies of
 * complex division is exactly the kind of duplication that lets a fix land in
 * one place and not the other.
 *
 * Everything here is exact arithmetic on a stated formula. No approximations,
 * no fitting, no data.
 */

export const c = (re, im = 0) => ({ re, im });
export const add = (a, b) => c(a.re + b.re, a.im + b.im);
export const sub = (a, b) => c(a.re - b.re, a.im - b.im);
export const mul = (a, b) => c(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
export const div = (a, b) => {
  const d = b.re * b.re + b.im * b.im;
  return c((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
};
export const abs = (a) => Math.hypot(a.re, a.im);
export const argDeg = (a) => (Math.atan2(a.im, a.re) * 180) / Math.PI;

/** Two impedances in parallel: Z = Z1·Z2 / (Z1 + Z2). */
export const par = (a, b) => div(mul(a, b), add(a, b));

/** Principal square root. */
export function sqrt(a) {
  const r = Math.sqrt(abs(a));
  const t = Math.atan2(a.im, a.re) / 2;
  return c(r * Math.cos(t), r * Math.sin(t));
}

/* cosh/sinh of a complex argument.
   These overflow for large real parts, which happens routinely in
   finite-length diffusion elements at high frequency. tanh and coth both
   approach 1 there, so the ratio is clamped rather than computed. */
const CLAMP = 20;

export function tanh(a) {
  if (Math.abs(a.re) > CLAMP) return c(Math.sign(a.re) || 1, 0);
  const sh = c(Math.sinh(a.re) * Math.cos(a.im), Math.cosh(a.re) * Math.sin(a.im));
  const ch = c(Math.cosh(a.re) * Math.cos(a.im), Math.sinh(a.re) * Math.sin(a.im));
  return div(sh, ch);
}

export function coth(a) {
  if (Math.abs(a.re) > CLAMP) return c(Math.sign(a.re) || 1, 0);
  const sh = c(Math.sinh(a.re) * Math.cos(a.im), Math.cosh(a.re) * Math.sin(a.im));
  const ch = c(Math.cosh(a.re) * Math.cos(a.im), Math.sinh(a.re) * Math.sin(a.im));
  return div(ch, sh);
}
