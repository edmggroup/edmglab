/**
 * EDMGLAB — Enforced simulation labelling
 * (Instrumentation spec §27, §36, §40 · Integration report §6.3)
 *
 * ────────────────────────────────────────────────────────────────────────
 *  THIS FILE EXISTS TO MAKE A SCIENTIFIC RULE UNBREAKABLE BY ACCIDENT.
 * ────────────────────────────────────────────────────────────────────────
 *
 * Spec §40 forbids presenting simulated output as experimental data.
 * Spec §27 and §36 require interactive simulators. Those are compatible only
 * if the boundary is enforced by the system rather than by remembering.
 *
 * Three rules, all implemented here:
 *
 *  1. THE LABEL IS NOT OPTIONAL. Every simulated plot is wrapped by this
 *     function, which paints the banner. There is no code path that renders
 *     a simulated series without it.
 *
 *  2. THE MODEL IS ALWAYS INSPECTABLE. Every simulator must supply a
 *     `simulationBasis` naming its governing equations and assumptions.
 *     Calling this without one throws in development, because an
 *     unattributable simulation is worse than no simulation.
 *
 *  3. NO REALISM THEATRE. Enforced by convention in the simulators, restated
 *     here because it is the rule most easily eroded: simulated curves get no
 *     synthetic noise, no invented material names and no fabricated axis
 *     values presented as characteristic of a real system. A student must
 *     never be able to screenshot a simulator and mistake it for data.
 */

import { esc } from '../ui.js';

const BANNER_TEXT = 'Illustrative simulation — NOT experimental data';

/**
 * Wrap simulated content in the mandatory labelling.
 *
 * @param {HTMLElement} container   where to mount
 * @param {object} opts
 * @param {string} [opts.title]
 * @param {object} opts.simulationBasis  REQUIRED
 * @param {string} opts.simulationBasis.model      short name, e.g. "Randles circuit"
 * @param {string[]} [opts.simulationBasis.equations]  plain-text equations used
 * @param {string[]} opts.simulationBasis.assumptions  what the model assumes
 * @param {string} [opts.simulationBasis.note]
 * @returns {{body: HTMLElement, wrap: HTMLElement}}  mount your plot into `body`
 */
export function simWrap(container, opts = {}) {
  const basis = opts.simulationBasis;

  if (!basis || !basis.model || !Array.isArray(basis.assumptions) || !basis.assumptions.length) {
    // Deliberately loud. A simulator without a stated basis is a defect,
    // not a style issue.
    const msg = '[sim-label] simulationBasis with { model, assumptions[] } is REQUIRED for any simulated output.';
    console.error(msg, opts);
    const err = document.createElement('div');
    err.className = 'callout callout-danger';
    err.innerHTML = `<strong>Simulation blocked.</strong> This simulator did not declare the model it is based on,
      so it will not be displayed. Simulated output must always state its governing equations and assumptions.`;
    container.appendChild(err);
    throw new Error(msg);
  }

  const wrap = document.createElement('div');
  wrap.className = 'sim-wrap';

  // ── Banner ──
  const banner = document.createElement('div');
  banner.className = 'sim-banner';
  banner.setAttribute('role', 'note');
  banner.innerHTML = `
    <span class="badge badge-illustrative">Simulated</span>
    <span class="sim-text">${esc(BANNER_TEXT)}</span>
    <span class="spacer"></span>`;

  const basisBtn = document.createElement('button');
  basisBtn.type = 'button';
  basisBtn.className = 'btn btn-sm';
  basisBtn.textContent = 'About this model';
  basisBtn.setAttribute('aria-expanded', 'false');
  banner.appendChild(basisBtn);
  wrap.appendChild(banner);

  // ── Body — the caller mounts the plot here ──
  const body = document.createElement('div');
  body.className = 'sim-body';
  wrap.appendChild(body);

  // ── Model basis, collapsed by default but always one click away ──
  const basisEl = document.createElement('div');
  basisEl.className = 'sim-basis';
  basisEl.hidden = true;
  basisEl.innerHTML = `
    <h4>Model: ${esc(basis.model)}</h4>
    ${basis.equations?.length
      ? basis.equations.map((e) => `<code class="eqn">${esc(e)}</code>`).join('')
      : ''}
    <p style="margin:.6rem 0 .2rem"><strong>This model assumes:</strong></p>
    <ul>${basis.assumptions.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
    ${basis.note ? `<p style="margin-top:.6rem">${esc(basis.note)}</p>` : ''}
    <p style="margin-top:.6rem" class="xsmall muted">
      Curves are drawn directly from these equations with the parameters you set.
      No noise or scatter is added, and no values here describe any real material,
      electrode or cell.
    </p>`;
  wrap.appendChild(basisEl);

  basisBtn.addEventListener('click', () => {
    const show = basisEl.hidden;
    basisEl.hidden = !show;
    basisBtn.setAttribute('aria-expanded', String(show));
    basisBtn.classList.toggle('is-active', show);
  });

  container.appendChild(wrap);
  return { wrap, body, basisEl };
}

/**
 * A short inline marker for simulated values quoted in running text,
 * where a full banner would be disproportionate.
 */
export function simInline(text) {
  return `<span class="badge badge-illustrative" title="${esc(BANNER_TEXT)}">Simulated</span> <span class="num">${esc(text)}</span>`;
}

export { BANNER_TEXT };
