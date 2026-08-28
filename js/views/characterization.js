/**
 * EDMGLAB — Characterisation technique library (Roadmap P9)
 *
 * ────────────────────────────────────────────────────────────────────────
 *  THE "CANNOT TELL YOU" LIST IS THE POINT OF THIS MODULE.
 * ────────────────────────────────────────────────────────────────────────
 *
 * Nearly every characterisation mistake in this field is a technique applied
 * outside the question it can answer — and the wrong answer still looks like a
 * result. BET area presented as electrochemically accessible area; Scherrer
 * crystallite size reported as particle size; a lithium-free EDS spectrum on a
 * lithium compound; a bulk claim from XPS.
 *
 * So the limits are not tucked into a "Limitations" section at the bottom.
 * They sit in the summary bar at the top of every record, beside what the
 * technique measures, in the same visual weight — and the health check refuses
 * a record that does not have them.
 *
 * The layout deliberately reuses the .mv-*, .cbar and .lim-list classes from
 * the method renderer (now in css/style.css) so a technique record and a method
 * record read as the same kind of object, because they are.
 */

import { esc, pageHead, callout, notAuthored } from '../ui.js';
import * as data from '../data.js';
import { renderTree } from '../lib/decision-tree.js';

export async function render(outlet, ctx) {
  const payload = await data.load('characterization');
  const items = payload.items || [];
  const families = payload.families || [];

  if (!items.length) {
    outlet.innerHTML = pageHead('Characterisation', '') + notAuthored('The characterisation library');
    return { destroy() {} };
  }

  // #/characterization/:id opens one technique directly; otherwise the index.
  const wanted = ctx?.params?.id ? items.find((t) => idTail(t.id) === ctx.params.id) : null;

  /* A technique page carries its OWN header — the technique's name is the
     page title there. Rendering the section head as well would put two <h1>
     elements on one page and leave the breadcrumb saying "Characterisation"
     when the reader is looking at BET. */
  outlet.innerHTML = `
    ${wanted ? '' : pageHead('Characterisation',
      'What each technique measures, what it cannot tell you, what the sample must be, and what has to be reported alongside the result.')}
    <div id="ch-body"></div>
    <style>${CSS}</style>`;

  const host = outlet.querySelector('#ch-body');
  let tree = null;

  if (wanted) {
    host.innerHTML = detailHtml(wanted, families);
    return { destroy() {} };
  }

  host.innerHTML = `
    ${callout(`<strong>Read the "cannot tell you" list before choosing a technique, not after.</strong>
      No technique here answers a question on its own: each measures one thing, about one part of a
      sample, under one set of conditions — and the sentence you eventually write is usually a claim
      about the material as a whole.`, 'warn')}

    <section class="section">
      <div class="section-head"><h2>Which technique answers my question?</h2>
        <span class="section-note">every answer states its limits</span></div>
      <div id="ch-tree"></div>
    </section>

    ${families.map((f) => {
      const list = items.filter((t) => t.family === f.id);
      if (!list.length) return '';
      return `<section class="section">
        <div class="section-head"><h2>${esc(f.label)}</h2>
          <span class="section-note">${list.length} technique${list.length === 1 ? '' : 's'}</span></div>
        <div class="ch-grid">${list.map(card).join('')}</div>
      </section>`;
    }).join('')}

    ${payload.closing ? callout(esc(payload.closing), 'info') : ''}`;

  const treeData = await data.load('shared/characterization-tree');
  const treeHost = host.querySelector('#ch-tree');
  if (treeData && treeData.root) tree = renderTree(treeHost, treeData);
  else treeHost.innerHTML = notAuthored('The technique-selection guide');

  return { destroy() { tree?.destroy?.(); } };
}

function card(t) {
  return `<a class="ch-card" href="#/characterization/${esc(idTail(t.id))}">
    <div class="ch-top"><span class="ch-abbr">${esc(t.abbrev || '')}</span>
      <h3>${esc(t.name)}</h3></div>
    <p class="ch-sum">${esc(t.summary || '')}</p>
    <div class="ch-cant">
      <span class="k">Cannot tell you</span>
      <span class="v">${esc(firstClause(t.cannotTell?.[0] || ''))}</span>
      ${t.cannotTell?.length > 1 ? `<span class="more">+${t.cannotTell.length - 1} more</span>` : ''}
    </div>
  </a>`;
}

/** The first sentence of a limit — enough to be useful on a card. */
function firstClause(s) {
  const m = String(s).match(/^[^.]{0,150}\./);
  return m ? m[0] : String(s).slice(0, 120) + (s.length > 120 ? '…' : '');
}

function detailHtml(t, families) {
  const fam = families.find((f) => f.id === t.family);
  const s = t.sample || {};

  return `
    <a class="btn btn-sm" href="#/characterization" style="margin-bottom:1rem">← All techniques</a>

    <header class="page-head">
      <h1>${esc(t.name)}${t.abbrev ? ` <span class="ch-h-abbr">${esc(t.abbrev)}</span>` : ''}</h1>
      ${t.summary ? `<p class="page-lede">${esc(t.summary)}</p>` : ''}
      ${fam ? `<p class="xsmall muted" style="margin-top:.4rem">${esc(fam.label)}</p>` : ''}
    </header>

    <div class="cbar">
      <div class="cb ctrl"><span class="cbk">Probes with</span><span class="cbv">${esc(t.probes || '—')}</span></div>
      <div class="cb meas"><span class="cbk">Detects</span><span class="cbv">${esc(t.detects || '—')}</span></div>
      <div class="cb cant"><span class="cbk">Blind to</span>
        <span class="cbv">${t.cannotTell?.length || 0} stated limit${t.cannotTell?.length === 1 ? '' : 's'} — read them below</span></div>
    </div>

    <div class="ch-two">
      <div class="panel"><div class="panel-head">What it can answer</div>
        <div class="panel-body"><ul class="lim-list">
          ${(t.answers || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div></div>

      <div class="panel panel-cant"><div class="panel-head">What it CANNOT tell you</div>
        <div class="panel-body"><ul class="lim-list warn">
          ${(t.cannotTell || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div></div>
    </div>

    <div class="mv-block" style="margin-top:1.5rem">
      <div class="mv-head"><h2>The sample</h2><span>what it has to be, and what preparation does to it</span></div>
      <div class="mv-body">
        <div class="mv-kv">
          ${s.form ? `<div><span class="k">Form</span><span class="v">${esc(s.form)}</span></div>` : ''}
          ${s.amount ? `<div><span class="k">Amount</span><span class="v">${esc(s.amount)}</span></div>` : ''}
          ${s.destructive ? `<div><span class="k">Destructive?</span><span class="v">${esc(s.destructive)}</span></div>` : ''}
          ${s.prep ? `<div><span class="k">Preparation</span><span class="v">${esc(s.prep)}</span></div>` : ''}
          ${s.notes ? `<div><span class="k">Worth knowing</span><span class="v">${esc(s.notes)}</span></div>` : ''}
        </div>
      </div>
    </div>

    ${(t.reportWith || []).length ? `<div class="mv-block">
      <div class="mv-head"><h2>Report these alongside the result</h2>
        <span>without them the result cannot be checked or reproduced</span></div>
      <div class="mv-body"><ul class="lim-list">
        ${t.reportWith.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
    </div>` : ''}

    ${(t.misread || []).length ? `<div class="mv-block">
      <div class="mv-head"><h2>Commonly misread as</h2></div>
      <div class="mv-body"><ul class="lim-list warn">
        ${t.misread.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
    </div>` : ''}

    ${(t.relatedIds || []).length ? `<section class="section">
      <div class="section-head"><h2>Pairs well with</h2>
        <span class="section-note">no technique answers a question alone</span></div>
      <div class="cols">${t.relatedIds.map((id) =>
        `<a class="chip" href="#/characterization/${esc(idTail(id))}">${esc(id.split('.').slice(1).join('.'))}</a>`).join('')}</div>
    </section>` : ''}

    <div class="callout callout-warn" style="margin-top:1.5rem">
      <strong>Draft content.</strong> Written to be scientifically defensible, but pending review by the
      research group before it is treated as teaching material.
    </div>`;
}

export function idTail(id) { return String(id).split('.').slice(1).join('.'); }

const CSS = `
  .ch-grid { display:grid; gap:.75rem; grid-template-columns:1fr; }
  @media (min-width:840px){ .ch-grid { grid-template-columns:1fr 1fr; } }
  .ch-card { display:block; border:1px solid var(--border); border-radius:var(--r-md);
    background:var(--surface); padding:.85rem 1rem; color:inherit;
    transition:border-color var(--dur-fast), background var(--dur-fast); }
  .ch-card:hover { text-decoration:none; border-color:var(--accent); background:var(--surface-2); }
  .ch-top { display:flex; align-items:baseline; gap:.55rem; flex-wrap:wrap; margin-bottom:.4rem; }
  .ch-abbr { font-family:var(--font-mono); font-size:var(--fs-sm); font-weight:700;
    color:var(--accent-strong); }
  .ch-card h3 { font-size:var(--fs-base); margin:0; color:var(--text); }
  .ch-sum { font-size:var(--fs-sm); color:var(--text-2); margin:0 0 .6rem; }
  .ch-cant { border-top:1px solid var(--border); padding-top:.5rem; display:grid; gap:.15rem; }
  .ch-cant .k { font-size:var(--fs-xs); text-transform:uppercase; letter-spacing:.05em;
    color:var(--danger); font-weight:700; }
  .ch-cant .v { font-size:var(--fs-xs); color:var(--text-2); line-height:1.45; }
  .ch-cant .more { font-size:var(--fs-xs); color:var(--text-muted); font-family:var(--font-mono); }
  .ch-h-abbr { font-family:var(--font-mono); font-size:var(--fs-lg); color:var(--accent-strong);
    font-weight:600; }
  /* align-items:start so each panel sizes to its own content. The limits list
     is usually much longer than the answers list — which is the point — and
     stretching the shorter panel to match leaves a large empty box. */
  .ch-two { display:grid; gap:1rem; grid-template-columns:1fr; align-items:start; }
  @media (min-width:900px){ .ch-two { grid-template-columns:1fr 1fr; } }
  .panel-cant { border-left:3px solid var(--danger); }
`;
