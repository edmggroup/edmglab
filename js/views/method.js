/**
 * EDMGLAB — Method detail page (route: #/method/:id)
 *
 * ONE route serves every method in both instrument modules. Methods are
 * addressed by their id tail (#/method/cccv, #/method/eis), so a supervisor
 * can send a student straight to a technique without knowing or caring which
 * module owns it — which is how people actually think about techniques.
 *
 * Rendering is entirely delegated to the shared method renderer; this file
 * only resolves the id and works out where "back" should go.
 */

import * as data from '../data.js';
import { renderMethodDetail } from '../lib/method-view.js';
import { pageHead } from '../ui.js';

export async function render(outlet, ctx) {
  const wanted = `method.${ctx.params.id}`;

  // Look in both libraries. A technique that legitimately appears in both
  // (GCD, for instance) resolves to whichever record declares that exact id.
  const [bt, ec] = await Promise.all([
    data.items('bt/methods').catch(() => []),
    data.items('ec/methods').catch(() => [])
  ]);

  const all = [...bt, ...ec];
  const m = all.find((x) => x.id === wanted);

  if (!m) {
    outlet.innerHTML = `
      ${pageHead('Method not found', `No method is registered under “${ctx.params.id}”.`)}
      <div class="row">
        <a class="btn" href="#/battery-tester/methods">Battery Tester methods</a>
        <a class="btn" href="#/workstation/methods">Workstation methods</a>
      </div>`;
    return { destroy() {} };
  }

  const backHref = m.module === 'echem' ? '#/workstation/methods' : '#/battery-tester/methods';
  return renderMethodDetail(outlet, m, { backHref });
}
