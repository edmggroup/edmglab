/**
 * EDMGLAB — One formula (#/formula/:id)
 *
 * Thin: it resolves the record and hands it to the shared renderer. The route
 * takes the id TAIL, so `#/formula/specific_capacitance` resolves
 * `formula.specific_capacitance` — the same convention as methods.
 */

import { pageHead, callout } from '../ui.js';
import * as data from '../data.js';
import { renderFormulaDetail, relatedHtml, FORMULA_CSS } from '../lib/formula-view.js';

export async function render(outlet, ctx) {
  const id = `formula.${ctx.params.id}`;

  // Load the library plus everything the related links might point into, so
  // cross-references resolve to a name rather than a bare id.
  const [formulas] = await Promise.all([
    data.items('formulas'),
    data.load('bt/methods').catch(() => null),
    data.load('ec/methods').catch(() => null),
    data.load('concepts').catch(() => null),
    data.load('bt/troubleshooting').catch(() => null),
    data.load('ec/troubleshooting').catch(() => null)
  ]);

  const f = formulas.find((x) => x.id === id);

  outlet.innerHTML = `<div id="fx-page"></div><style>${FORMULA_CSS}</style>`;
  const host = outlet.querySelector('#fx-page');

  if (!f) {
    host.innerHTML = pageHead('Formula not found', '') +
      callout(`No formula with the id <code>${ctx.params.id}</code> is in the library.
        <a href="#/formulas">Back to the formula library</a>.`, 'warn');
    return { destroy() {} };
  }

  const view = renderFormulaDetail(host, f, { backHref: '#/formulas' });
  const links = host.querySelector('#fx-links');
  if (links) links.innerHTML = relatedHtml(f, (rid) => data.resolveLoaded(rid));

  return { destroy() { view.destroy?.(); } };
}
