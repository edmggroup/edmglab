/**
 * EDMGLAB — Glossary (Roadmap P12)
 *
 * A definition alone is rarely what somebody needs. The terms people look up in
 * this field are usually the ones that mean two different things depending on
 * who is speaking — ESR with two conventions, "specific" with an unstated
 * basis, capacity against capacitance, BET area against accessible area.
 *
 * So every entry has two parts: what the term means, and the trap. The trap is
 * the part worth reading, and it is given the same visual weight as the
 * definition rather than being tucked underneath it.
 */

import { esc, pageHead, callout, notAuthored } from '../ui.js';
import * as data from '../data.js';

export async function render(outlet) {
  // Load the libraries the cross-references point into, so a related id
  // resolves to a name rather than being rendered as a bare string.
  const [items] = await Promise.all([
    data.items('glossary'),
    data.load('concepts').catch(() => null),
    data.load('formulas').catch(() => null),
    data.load('characterization').catch(() => null),
    data.load('electrochemistry').catch(() => null),
    data.load('ec/circuits').catch(() => null),
    data.load('ec/methods').catch(() => null),
    data.load('bt/methods').catch(() => null),
    data.load('bt/troubleshooting').catch(() => null)
  ]);

  if (!items.length) {
    outlet.innerHTML = pageHead('Glossary', '') + notAuthored('The glossary');
    return { destroy() {} };
  }

  const sorted = [...items].sort((a, b) => a.term.localeCompare(b.term));

  outlet.innerHTML = `
    ${pageHead('Glossary',
      'What the term means, and — the part worth reading — what it is commonly taken to mean instead.')}

    ${callout(`<strong>Most of these terms need an entry because they mean two things.</strong>
      ESR has two conventions that differ by a factor of two. "Specific" means divided by something,
      and the something is usually unstated. Capacity and capacitance are different quantities that
      share a first syllable. Each entry gives the definition and then the trap.`, 'info')}

    <div class="gl-bar">
      <input type="search" id="gl-q" placeholder="Filter terms…" autocomplete="off"
             aria-label="Filter glossary terms">
      <span class="xsmall muted" id="gl-count">${sorted.length} terms</span>
    </div>

    <div class="gl-list" id="gl-list">
      ${sorted.map((g) => entry(g)).join('')}
    </div>
    <p id="gl-none" class="small muted" hidden>Nothing matches that filter.</p>

    <style>${CSS}</style>`;

  function entry(g) {
    const rel = (g.relatedIds || []).map((id) => {
      const hit = data.resolveLoaded(id);
      const label = hit ? (hit.record.title || hit.record.name || hit.record.term || id) : null;
      return label ? `<a class="chip" href="${routeFor(id)}">${esc(label)}</a>` : '';
    }).filter(Boolean).join(' ');

    return `<div class="gl-e" data-hay="${esc(hay(g))}">
      <div class="gl-term">${esc(g.term)}</div>
      <div class="gl-def">${esc(g.shortDef)}</div>
      ${g.trap ? `<div class="gl-trap"><span class="k">The trap</span>
        <span class="v">${esc(g.trap)}</span></div>` : ''}
      ${rel ? `<div class="gl-rel">${rel}</div>` : ''}
    </div>`;
  }

  const q = outlet.querySelector('#gl-q');
  const none = outlet.querySelector('#gl-none');
  const count = outlet.querySelector('#gl-count');

  q.addEventListener('input', () => {
    const term = q.value.trim().toLowerCase();
    let shown = 0;
    outlet.querySelectorAll('.gl-e').forEach((el) => {
      const ok = !term || el.dataset.hay.includes(term);
      el.hidden = !ok;
      if (ok) shown++;
    });
    count.textContent = `${shown} of ${sorted.length} terms`;
    none.hidden = shown > 0;
  });

  return { destroy() {} };
}

function hay(g) {
  return [g.term, g.shortDef, g.trap, ...(g.tags || [])].join(' ').toLowerCase();
}

/** Where a cross-referenced id lives. Mirrors the routes in app.js. */
function routeFor(id) {
  const [ns, ...rest] = String(id).split('.');
  const tail = rest.join('.');
  switch (ns) {
    case 'formula':         return `#/formula/${tail}`;
    case 'method':          return `#/method/${tail}`;
    case 'technique':       return `#/characterization/${tail}`;
    case 'troubleshooting': return `#/troubleshooting/${tail}`;
    case 'mechanism':       return '#/chemistry/mechanisms';
    case 'circuit':         return '#/workstation/circuits';
    case 'concept':         return '#/fundamentals';
    default:                return '#/glossary';
  }
}

const CSS = `
  .gl-bar { display:flex; flex-wrap:wrap; align-items:center; gap:.75rem; margin:1.25rem 0 1rem; }
  .gl-bar input { flex:1 1 240px; max-width:420px; min-width:0; background:var(--surface-2);
    color:var(--text); border:1px solid var(--border); border-radius:var(--r-sm);
    padding:.45rem .7rem; min-height:38px; font:inherit; font-size:var(--fs-sm); }
  .gl-list { display:grid; gap:.7rem; grid-template-columns:1fr; }
  @media (min-width:920px){ .gl-list { grid-template-columns:1fr 1fr; } }
  .gl-e { border:1px solid var(--border); border-radius:var(--r-md); background:var(--surface);
    padding:.85rem 1rem; }
  .gl-term { font-size:var(--fs-base); font-weight:650; color:var(--text); margin-bottom:.3rem; }
  .gl-def { font-size:var(--fs-sm); color:var(--text-2); margin-bottom:.6rem; }
  .gl-trap { display:grid; gap:.15rem; border-top:1px solid var(--border); padding-top:.55rem; }
  .gl-trap .k { font-size:var(--fs-xs); text-transform:uppercase; letter-spacing:.05em;
    color:var(--warn); font-weight:700; }
  .gl-trap .v { font-size:var(--fs-sm); color:var(--text-2); line-height:1.5; }
  .gl-rel { display:flex; flex-wrap:wrap; gap:.3rem; margin-top:.6rem; }
  .gl-rel .chip { font-size:var(--fs-xs); }
`;
