/**
 * EDMGLAB — Troubleshooting engine (Instrumentation spec §11, §33)
 *
 * ONE engine, TWO authoring files. Entries are written in
 * data/battery-tester/troubleshooting.json and data/echem/troubleshooting.json
 * — separate for authoring clarity — and merged here into a single searchable
 * index.
 *
 * That merge is deliberate and matters: a student with a large IR drop does
 * not know in advance whether their problem belongs to the cycler module or
 * the workstation module. Searching "IR drop" has to return both the
 * cell/contact causes and the uncompensated-resistance causes, or the tool
 * fails exactly the person it was built for.
 *
 * ── THE RULE THIS VIEW ENFORCES ──
 * Spec §11 and §33: "Do not claim that one symptom proves one cause."
 * Every entry leads with ALL its candidate causes before any of them is
 * discussed, and the diagnostics section is framed as how to tell them apart —
 * never as a verdict. The health check separately refuses to pass a
 * single-cause entry.
 */

import { esc, pageHead, callout } from '../ui.js';
import * as data from '../data.js';

export async function render(outlet, ctx) {
  const [bt, ec] = await Promise.all([
    data.items('bt/troubleshooting').catch(() => []),
    data.items('ec/troubleshooting').catch(() => [])
  ]);
  const all = [...bt, ...ec];

  // Deep link to one entry: #/troubleshooting/high_ir_drop
  if (ctx.params.id) {
    const e = all.find((x) => x.id === `troubleshooting.${ctx.params.id}`);
    return renderEntry(outlet, e, ctx.params.id);
  }

  outlet.innerHTML = `
    ${pageHead('Troubleshooting',
      'Start from the symptom you are seeing. Every entry lists several possible causes and how to tell them apart — never a single verdict.')}

    ${callout(`<strong>One symptom does not prove one cause.</strong> These entries are structured to
      resist that. The diagnostics are ordered cheapest-and-most-likely first, and several begin by asking
      whether the problem is in the <em>instrument</em>, the <em>cell</em>, or the <em>data processing</em>
      — a separation worth making before changing anything.`, 'warn')}

    <div class="ts-tools">
      <input type="search" class="ml-search" id="ts-q" placeholder="Describe the symptom…"
             autocomplete="off" spellcheck="false" aria-label="Search symptoms">
      <div class="ts-filters" role="group" aria-label="Filter by module">
        <button type="button" class="btn btn-sm is-active" data-mod="all">All</button>
        <button type="button" class="btn btn-sm" data-mod="battery-tester">Battery Tester</button>
        <button type="button" class="btn btn-sm" data-mod="echem">Workstation</button>
      </div>
    </div>
    <p class="xsmall muted" id="ts-count" style="margin:.6rem 0 1rem"></p>
    <div class="ts-list" id="ts-list"></div>

    <style>
      .ts-tools { display:flex; flex-wrap:wrap; gap:.75rem; align-items:center; }
      .ts-filters { display:flex; gap:.3rem; flex-wrap:wrap; }
      .ts-list { display:grid; gap:.6rem; }
      .ts-card { display:block; padding:.85rem 1rem; background:var(--surface);
        border:1px solid var(--border); border-radius:var(--r-md); color:var(--text);
        transition:border-color var(--dur-fast), background var(--dur-fast); }
      .ts-card:hover { border-color:var(--accent); background:var(--surface-2); text-decoration:none; }
      .ts-sym { font-weight:600; font-size:var(--fs-base); display:block; margin-bottom:.2rem; }
      .ts-sum { font-size:var(--fs-sm); color:var(--text-2); line-height:1.5; }
      .ts-meta { display:flex; gap:.4rem; margin-top:.6rem; flex-wrap:wrap; align-items:center; }
      .ts-ncauses { font-family:var(--font-mono); font-size:var(--fs-xs); color:var(--warn); }
    </style>`;

  const listEl = outlet.querySelector('#ts-list');
  const countEl = outlet.querySelector('#ts-count');
  const q = outlet.querySelector('#ts-q');
  let mod = 'all';

  function draw() {
    const f = q.value.trim().toLowerCase();
    const list = all
      .filter((e) => mod === 'all' || e.module === mod)
      .filter((e) => !f || [e.symptom, e.summary, ...(e.aliases || []), ...(e.causes || []), ...(e.tags || [])]
        .join(' ').toLowerCase().includes(f));

    countEl.textContent = `${list.length} of ${all.length} entries`;
    listEl.innerHTML = list.length ? list.map(card).join('')
      : `<p class="small muted">No entry matches “${esc(q.value)}”. The troubleshooting library is still
         being written — tell the group what you were looking for so it can be added.</p>`;
  }

  q.addEventListener('input', draw);
  outlet.querySelectorAll('[data-mod]').forEach((b) => b.addEventListener('click', () => {
    mod = b.dataset.mod;
    outlet.querySelectorAll('[data-mod]').forEach((x) => x.classList.toggle('is-active', x === b));
    draw();
  }));

  draw();
  return { destroy() {} };
}

function card(e) {
  const n = (e.causes || []).length;
  return `<a class="ts-card" href="#/troubleshooting/${esc(idTail(e.id))}">
    <span class="ts-sym">${esc(e.symptom)}</span>
    <span class="ts-sum">${esc(e.summary || '')}</span>
    <span class="ts-meta">
      <span class="chip">${e.module === 'echem' ? 'Workstation' : 'Battery Tester'}</span>
      <span class="ts-ncauses">${n} possible cause${n === 1 ? '' : 's'}</span>
    </span>
  </a>`;
}

const idTail = (id) => String(id).split('.').slice(1).join('.');

/* ── Single entry ────────────────────────────────────────── */

function renderEntry(outlet, e, rawId) {
  if (!e) {
    outlet.innerHTML = `${pageHead('Not found', `No troubleshooting entry is registered under “${esc(rawId)}”.`)}
      <a class="btn" href="#/troubleshooting">All symptoms</a>`;
    return { destroy() {} };
  }

  outlet.innerHTML = `
    <a class="btn btn-sm" href="#/troubleshooting" style="margin-bottom:1rem">← All symptoms</a>
    ${pageHead(e.symptom, e.summary || '')}

    <div class="mv-block">
      <div class="mv-head"><h2>Possible causes</h2>
        <span>${(e.causes || []).length} candidates — not a ranked verdict</span></div>
      <ul class="lim-list">${(e.causes || []).map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
      <p class="xsmall muted" style="margin-top:.6rem">
        Several of these can be true at once, and the symptom alone does not distinguish them.
        Work through the checks below rather than acting on the first plausible entry.
      </p>
    </div>

    ${e.diagnostics?.length ? `
    <div class="mv-block">
      <div class="mv-head"><h2>How to tell them apart</h2>
        <span>cheapest and most likely first</span></div>
      <ol class="lim-list">${e.diagnostics.map((d) => `<li>${esc(d)}</li>`).join('')}</ol>
    </div>` : ''}

    ${e.fixes?.length ? `
    <div class="mv-block">
      <div class="mv-head"><h2>Corrective actions</h2>
        <span>once a diagnostic has actually identified the cause</span></div>
      <ul class="lim-list">${e.fixes.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
    </div>` : ''}

    ${e.safetyNotes?.length ? `
    <div class="callout callout-danger" style="margin-bottom:1.25rem">
      <strong>Safety.</strong>
      <ul class="lim-list" style="margin-top:.4rem">${e.safetyNotes.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
    </div>` : ''}

    ${e.relatedIds?.length ? `
    <div class="mv-block">
      <div class="mv-head"><h2>Related</h2></div>
      <div class="cols">${e.relatedIds.map((r) => `<a class="chip" href="${linkFor(r)}">${esc(r)}</a>`).join('')}</div>
    </div>` : ''}

    <div class="callout callout-warn">
      <strong>Draft content.</strong> Written to be scientifically defensible, but pending review by the
      research group before it is treated as guidance.
    </div>`;

  return { destroy() {} };
}

function linkFor(id) {
  const [ns, ...rest] = String(id).split('.');
  const tail = rest.join('.');
  const map = { method: '#/method/', troubleshooting: '#/troubleshooting/', formula: '#/formula/', concept: '#/concept/' };
  return map[ns] ? map[ns] + tail : '#/';
}
