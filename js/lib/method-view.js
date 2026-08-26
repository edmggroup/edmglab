/**
 * EDMGLAB — Generic method renderer (Instrumentation spec §6, §18, §34, §35)
 *
 * ONE component renders every method page in both instrument modules. There
 * are 22 of them; a file per method would mean 22 near-identical files to
 * keep in sync, and adding a 23rd would mean writing code instead of content.
 *
 * ── WHY THE SCHEMA LOOKS LIKE THIS ──
 * Spec §34 asks that INSTRUMENT / CELL / APPLIED SIGNAL / RESPONSE /
 * PROCESSING / INTERPRETATION stay clearly separated throughout. Rather than
 * trusting authors to keep that separation in prose, it IS the record shape:
 * each is its own field, rendered in its own block. An author cannot blur the
 * distinction without leaving a field visibly empty.
 *
 * The health check enforces the two fields that matter most — every method
 * must declare what is controlled and what is measured, and must state its
 * limitations. A method page without limits teaches over-confidence.
 */

import { esc, notAuthored } from '../ui.js';

/* ── List view ───────────────────────────────────────────── */

/**
 * @param {HTMLElement} host
 * @param {Array} methods
 * @param {object} opts { emptyMessage }
 */
export function renderMethodList(host, methods, opts = {}) {
  if (!methods.length) {
    host.innerHTML = notAuthored(opts.emptyMessage || 'The method library');
    return { destroy() {} };
  }

  host.innerHTML = `
    <div class="ml-tools">
      <input type="search" class="ml-search" id="ml-q" placeholder="Filter methods…"
             autocomplete="off" spellcheck="false" aria-label="Filter methods">
      <span class="xsmall muted" id="ml-count"></span>
    </div>
    <div class="ml-grid" id="ml-grid"></div>

    <style>
      .ml-tools { display:flex; align-items:center; gap:.75rem; margin-bottom:1rem; flex-wrap:wrap; }
      .ml-search { flex:1 1 220px; max-width:340px; background:var(--surface-2); color:var(--text);
        border:1px solid var(--border); border-radius:var(--r-md); padding:.5rem .7rem;
        font:inherit; font-size:var(--fs-sm); min-height:var(--touch-min); }
      .ml-search:focus { outline:2px solid var(--accent); outline-offset:1px; }
      .ml-grid { display:grid; gap:.6rem; grid-template-columns:repeat(auto-fill,minmax(268px,1fr)); }
      .ml-card { display:block; padding:.8rem .9rem; background:var(--surface);
        border:1px solid var(--border); border-radius:var(--r-md); color:var(--text);
        transition:border-color var(--dur-fast), background var(--dur-fast); }
      .ml-card:hover { border-color:var(--accent); background:var(--surface-2); text-decoration:none; }
      .ml-name { font-weight:600; font-size:var(--fs-sm); margin-bottom:.2rem; display:block; }
      .ml-sum { font-size:var(--fs-xs); color:var(--text-2); line-height:1.5; }
      .ml-cm { display:flex; gap:.35rem; margin-top:.55rem; flex-wrap:wrap; }
      .ml-cm .chip { font-size:.625rem; }
      .ml-vendor { font-family:var(--font-mono); font-size:.625rem; color:var(--text-muted);
        margin-top:.4rem; display:block; }
    </style>`;

  const grid = host.querySelector('#ml-grid');
  const q = host.querySelector('#ml-q');
  const count = host.querySelector('#ml-count');

  function draw(filter = '') {
    const f = filter.trim().toLowerCase();
    const list = !f ? methods : methods.filter((m) =>
      [m.name, ...(m.aliases || []), ...(m.tags || [])].join(' ').toLowerCase().includes(f));

    count.textContent = `${list.length} of ${methods.length}`;
    grid.innerHTML = list.length ? list.map(methodCard).join('')
      : `<p class="small muted">No method matches “${esc(filter)}”.</p>`;
  }

  q.addEventListener('input', () => draw(q.value));
  draw();
  return { destroy() {} };
}

function methodCard(m) {
  const ctrl = m.instrument?.controls, meas = m.instrument?.measures;
  const vendor = (m.aliases || []).find((a) => /^(Pot\.|Gal\.|Chrono|Open Circuit|Single|Fixed)/.test(a));
  return `<a class="ml-card" href="#/method/${esc(idTail(m.id))}">
    <span class="ml-name">${esc(m.name)}</span>
    <span class="ml-sum">${esc(m.summary || m.cell?.whatHappens || '')}</span>
    <span class="ml-cm">
      ${ctrl ? `<span class="chip">controls: ${esc(ctrl)}</span>` : ''}
      ${meas ? `<span class="chip">measures: ${esc(meas)}</span>` : ''}
    </span>
    ${vendor ? `<span class="ml-vendor">OrigaMaster: ${esc(vendor)}</span>` : ''}
  </a>`;
}

export function idTail(id) { return String(id).split('.').slice(1).join('.'); }

/* ── Detail view ─────────────────────────────────────────── */

export function renderMethodDetail(host, m, opts = {}) {
  if (!m) {
    host.innerHTML = `<div class="callout callout-warn">That method has not been authored yet.</div>`;
    return { destroy() {} };
  }

  const vendorAliases = (m.aliases || []).filter((a) => /^(Pot\.|Gal\.|Chrono|Open Circuit|Single|Fixed|Polarization)/.test(a));

  host.innerHTML = `
    ${opts.backHref ? `<a class="btn btn-sm" href="${esc(opts.backHref)}" style="margin-bottom:1rem">← All methods</a>` : ''}

    <header class="page-head">
      <h1>${esc(m.name)}</h1>
      ${m.summary ? `<p class="page-lede">${esc(m.summary)}</p>` : ''}
      ${vendorAliases.length ? `<p class="xsmall muted" style="margin-top:.5rem">
        On your OrigaLys workstation this appears as
        ${vendorAliases.map((a) => `<code>${esc(a)}</code>`).join(' or ')}.</p>` : ''}
    </header>

    ${controlBar(m)}

    ${block('The instrument', 'What the workstation or cycler is doing', instrumentHtml(m))}
    ${block('The cell', 'What physically happens', cellHtml(m))}
    ${block('The applied signal', 'What you impose, and how to choose it', signalHtml(m))}
    ${block('The response', 'What comes back', responseHtml(m))}
    ${block('Data processing', 'How raw measurements become parameters', processingHtml(m))}
    ${block('Interpretation', 'What it means — switch Learn/Research in the header', interpretationHtml(m))}

    ${m.limitations?.length ? section('Limitations',
      `<ul class="lim-list">${m.limitations.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`,
      'what this method cannot tell you') : ''}

    ${m.commonMistakes?.length ? section('Common mistakes',
      `<ul class="lim-list warn">${m.commonMistakes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`) : ''}

    ${m.applications?.length ? section('Typical applications',
      `<ul class="lim-list">${m.applications.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`) : ''}

    ${m._draft ? `<div class="callout callout-warn" style="margin-top:1.5rem">
      <strong>Draft content.</strong> Written to be scientifically defensible, but pending review by the
      research group before it is treated as teaching material.</div>` : ''}

    <style>
      .mv-block { margin-bottom:1.25rem; }
      .mv-head { display:flex; align-items:baseline; gap:.6rem; flex-wrap:wrap;
        padding-bottom:.4rem; margin-bottom:.7rem; border-bottom:1px solid var(--border); }
      .mv-head h2 { margin:0; font-size:var(--fs-md); }
      .mv-head span { font-size:var(--fs-xs); color:var(--text-muted); }
      .mv-body { font-size:var(--fs-sm); color:var(--text-2); display:grid; gap:.7rem; }
      .mv-body p { margin:0; }
      .mv-kv { display:grid; gap:.45rem; }
      .mv-kv .k { font-size:var(--fs-xs); text-transform:uppercase; letter-spacing:.06em;
        color:var(--text-muted); font-weight:650; }
      .mv-kv .v { color:var(--text); }
      .lim-list { margin:0; padding-left:1.15rem; font-size:var(--fs-sm); color:var(--text-2); }
      .lim-list li { margin-bottom:.35rem; }
      .lim-list.warn li::marker { color:var(--warn); }
      .param { border:1px solid var(--border); border-radius:var(--r-md);
        background:var(--surface-2); padding:.6rem .75rem; }
      .param .pn { font-weight:600; font-size:var(--fs-sm); color:var(--text); display:block; margin-bottom:.15rem; }
      .cbar { display:flex; gap:.5rem; flex-wrap:wrap; margin-bottom:1.5rem; }
      .cbar .cb { display:flex; flex-direction:column; gap:.15rem; padding:.55rem .8rem;
        border:1px solid var(--border); border-radius:var(--r-md); background:var(--surface); flex:1 1 150px; }
      .cbar .cb .cbk { font-size:var(--fs-xs); text-transform:uppercase; letter-spacing:.06em; color:var(--text-muted); font-weight:650; }
      .cbar .cb .cbv { font-size:var(--fs-sm); font-weight:600; }
      .cbar .cb.ctrl .cbv { color:var(--accent-strong); }
      .cbar .cb.meas .cbv { color:var(--warn); }
      .cols { display:flex; flex-wrap:wrap; gap:.4rem; }
    </style>`;

  return { destroy() {} };
}

/* ── Blocks ──────────────────────────────────────────────── */

function block(title, note, body) {
  if (!body) return '';
  return `<div class="mv-block">
    <div class="mv-head"><h2>${esc(title)}</h2><span>${esc(note)}</span></div>
    <div class="mv-body">${body}</div>
  </div>`;
}

function section(title, body, note) {
  return `<div class="mv-block">
    <div class="mv-head"><h2>${esc(title)}</h2>${note ? `<span>${esc(note)}</span>` : ''}</div>
    ${body}
  </div>`;
}

/** The §34 headline: controlled vs measured, stated before anything else. */
function controlBar(m) {
  const i = m.instrument;
  if (!i) return '';
  return `<div class="cbar">
    ${i.controls ? `<div class="cb ctrl"><span class="cbk">Controlled</span><span class="cbv">${esc(i.controls)}</span></div>` : ''}
    ${i.measures ? `<div class="cb meas"><span class="cbk">Measured</span><span class="cbv">${esc(i.measures)}</span></div>` : ''}
    ${i.configuration ? `<div class="cb"><span class="cbk">Configuration</span><span class="cbv">${esc(i.configuration)}</span></div>` : ''}
    ${i.instrument ? `<div class="cb"><span class="cbk">Instrument</span><span class="cbv">${esc(i.instrument)}</span></div>` : ''}
  </div>`;
}

function instrumentHtml(m) {
  const i = m.instrument;
  if (!i) return '';
  return `<div class="mv-kv">
    ${i.principle ? `<div><div class="k">Principle</div><div class="v">${esc(i.principle)}</div></div>` : ''}
    ${i.configuration ? `<div><div class="k">Cell configuration</div><div class="v">${esc(i.configuration)}</div></div>` : ''}
  </div>`;
}

function cellHtml(m) {
  const c = m.cell;
  if (!c) return '';
  return `${c.whatHappens ? `<p>${esc(c.whatHappens)}</p>` : ''}
    ${c.dependsOn?.length ? `<div><div class="k" style="font-size:var(--fs-xs);text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);font-weight:650;margin-bottom:.35rem">The result depends on</div>
      <div class="cols">${c.dependsOn.map((d) => `<span class="chip">${esc(d)}</span>`).join('')}</div></div>` : ''}`;
}

function signalHtml(m) {
  const s = m.appliedSignal;
  if (!s) return '';
  return `${s.waveform ? `<p><strong>Waveform:</strong> ${esc(s.waveform)}</p>` : ''}
    ${s.parameters?.length ? `<div class="mv-kv">${s.parameters.map((p) => `
      <div class="param"><span class="pn">${esc(p.name)}</span>${esc(p.guidance)}</div>`).join('')}</div>` : ''}`;
}

function responseHtml(m) {
  const r = m.response;
  if (!r) return '';
  return `${r.measured ? `<p><strong>Measured:</strong> ${esc(r.measured)}</p>` : ''}
    ${r.plot ? `<p><strong>Usual plot:</strong> ${esc(r.plot)}</p>` : ''}
    ${r.outputColumns?.length ? `<div><div class="k" style="font-size:var(--fs-xs);text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);font-weight:650;margin-bottom:.35rem">Output columns</div>
      <div class="cols">${r.outputColumns.map((c) => `<span class="chip">${esc(c)}</span>`).join('')}</div></div>` : ''}`;
}

function processingHtml(m) {
  const p = m.processing;
  if (!p) return '';
  return `${p.steps?.length ? `<ol class="lim-list">${p.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}
    ${p.formulaIds?.length ? `<p class="xsmall muted">Uses: ${p.formulaIds.map((f) =>
      `<a href="#/formula/${esc(idTail(f))}"><code>${esc(f)}</code></a>`).join(' · ')}</p>` : ''}`;
}

function interpretationHtml(m) {
  const i = m.interpretation;
  if (!i) return '';
  return `<div data-mode-only="learn">${i.learnMode ? `<p>${esc(i.learnMode)}</p>` : notAuthored('The Learn Mode explanation')}</div>
          <div data-mode-only="research">${i.researchMode ? `<p>${esc(i.researchMode)}</p>` : notAuthored('The Research Mode explanation')}</div>`;
}
