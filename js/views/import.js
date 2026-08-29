/**
 * EDMGLAB — Data import and analysis (Roadmap P4)
 *
 * ────────────────────────────────────────────────────────────────────────
 *  THE ORDER: what was read → what was guessed → confirm it → then a plot.
 * ────────────────────────────────────────────────────────────────────────
 *
 * Every import tool is tempted to show the pretty chart first. This one shows
 * the parse report first, because the chart is a claim about the data and the
 * report is what makes the claim checkable. Rows the parser could not read are
 * counted and listed with their line numbers before anything is drawn, and the
 * column mapping is presented as a PROPOSAL with the header it matched, not as
 * a decision already taken.
 *
 * That ordering costs the user two seconds and catches the failures that are
 * otherwise invisible: a semicolon-delimited European export read with decimal
 * points, a current column in mA read as A, a column of instrument text that
 * became a column of silent zeros.
 *
 * ── PROVENANCE ──
 * Imported values are the user's own MEASURED data — the only measured data
 * anywhere in this application. They are labelled as such, kept clearly apart
 * from the simulators, and never mixed into a plot with modelled curves.
 */

import { esc, pageHead, callout } from '../ui.js';
import * as data from '../data.js';
import * as CSV from '../lib/csv.js';
import { chartCard, downsampleLTTB } from '../lib/charts.js';
import { sig } from '../lib/expr.js';

const PLOT_LIMIT = 4000;   // points drawn; every statistic uses the full set

export async function render(outlet) {
  const profiles = await data.load('import-profiles');

  let parsed = null;        // result from csv-core
  let file = null;          // the File object
  let charts = [];
  const chosenUnit = {};    // column index -> unit string
  const chosenRole = {};    // column index -> role id or ''

  outlet.innerHTML = `
    ${pageHead('Data import',
      'Read an export from your battery tester or workstation, check what was read, then plot and summarise it.')}

    ${callout(`<strong>Your file never leaves this browser tab.</strong> It is read with the browser's own
      file API and parsed here. There is no upload and no server to upload to — EDMGLAB is a static site.
      Closing the tab discards everything. Nothing is stored between visits.`, 'info')}

    <div id="im-drop" class="im-drop" tabindex="0" role="button"
         aria-label="Choose a data file, or drop one here">
      <div class="im-drop-in">
        <strong>Drop a file here</strong>
        <span>or click to choose · CSV, TSV, TXT · comma, tab, semicolon or pipe separated</span>
        <span class="xsmall muted">Exports from Arbin, Neware, BioLogic, OrigaMaster and generic CSV are
          recognised. A header this build does not know is mapped by hand in one click — and can be added
          to <code>data/import-profiles.json</code> so it is recognised next time.</span>
      </div>
      <input type="file" id="im-file" accept=".csv,.tsv,.txt,.dat,text/csv,text/plain" hidden>
    </div>

    <div id="im-status" class="im-status" hidden></div>
    <div id="im-body"></div>

    <style>
      .im-drop { border:2px dashed var(--border); border-radius:var(--r-md);
        background:var(--surface); padding:2rem 1.25rem; text-align:center; cursor:pointer;
        transition:border-color var(--dur-fast), background var(--dur-fast); margin:1.25rem 0; }
      .im-drop:hover, .im-drop.is-over {
        border-color:var(--accent); background:var(--accent-wash); }
      /* Keyboard focus must NOT look identical to hover: a keyboard user has
         no pointer to tell them where they are. Suppressing the outline here
         left this control with no visible focus state at all. */
      .im-drop:focus-visible {
        border-color:var(--accent); background:var(--accent-wash);
        outline:2px solid var(--accent); outline-offset:3px; }
      .im-drop-in { display:grid; gap:.35rem; }
      .im-drop-in strong { font-size:var(--fs-md); color:var(--text); }
      .im-drop-in span { font-size:var(--fs-sm); color:var(--text-2); }
      .im-status { display:flex; align-items:center; gap:.6rem; font-size:var(--fs-sm);
        color:var(--text-2); margin-bottom:1rem; }
      .im-bar { flex:1 1 auto; height:4px; background:var(--surface-2); border-radius:2px; overflow:hidden; }
      .im-bar i { display:block; height:100%; background:var(--accent); width:0; transition:width .12s linear; }
      .im-rep { display:grid; gap:.5rem; grid-template-columns:repeat(auto-fit,minmax(120px,1fr));
        margin-bottom:1rem; }
      .im-stat { border:1px solid var(--border); border-radius:var(--r-sm); background:var(--surface);
        padding:.55rem .7rem; }
      .im-stat.warn { border-color:var(--warn); }
      .im-stat .k { display:block; font-size:var(--fs-xs); color:var(--text-muted);
        text-transform:uppercase; letter-spacing:.05em; font-weight:650; }
      .im-stat .v { font-family:var(--font-mono); font-size:var(--fs-lg); color:var(--text); }
      .im-stat.warn .v { color:var(--warn); }
      .im-map { width:100%; border-collapse:collapse; font-size:var(--fs-sm); }
      .im-map th { text-align:left; font-size:var(--fs-xs); text-transform:uppercase;
        letter-spacing:.05em; color:var(--text-muted); font-weight:650; padding:.4rem .5rem;
        border-bottom:1px solid var(--border); }
      .im-map td { padding:.4rem .5rem; border-bottom:1px solid var(--border); vertical-align:middle; }
      .im-map select { background:var(--surface-2); color:var(--text); border:1px solid var(--border);
        border-radius:var(--r-sm); padding:.3rem .35rem; font:inherit; font-size:var(--fs-xs);
        min-height:32px; max-width:13rem; }
      .im-map code { font-size:var(--fs-xs); }
      .im-guess { font-size:var(--fs-xs); color:var(--text-muted); }
      .im-guess.low { color:var(--warn); }
      .im-pre { font-family:var(--font-mono); font-size:var(--fs-xs); color:var(--text-2);
        background:var(--surface-2); border:1px solid var(--border); border-radius:var(--r-sm);
        padding:.6rem .7rem; white-space:pre-wrap; overflow-wrap:anywhere; max-height:11rem; overflow:auto; }
      .im-rej { font-family:var(--font-mono); font-size:var(--fs-xs); }
      .im-rej li { margin-bottom:.2rem; }
      .im-sum { width:100%; border-collapse:collapse; font-size:var(--fs-sm); }
      .im-sum th, .im-sum td { padding:.35rem .5rem; border-bottom:1px solid var(--border); text-align:right; }
      .im-sum th:first-child, .im-sum td:first-child { text-align:left; }
      .im-sum th { font-size:var(--fs-xs); text-transform:uppercase; letter-spacing:.05em;
        color:var(--text-muted); font-weight:650; }
      .im-sum td { font-family:var(--font-mono); }
      /* Below the stacking breakpoint the shared .stackable rule turns each row
         into a card; these two tables opt in like every other table in the app,
         so neither ever needs a horizontal scrollbar on a phone. */
      @media (max-width:760px) {
        .im-map td, .im-sum td { text-align:left; }
        .im-map select { max-width:100%; width:100%; }
      }
      .im-sum td:first-child { font-family:var(--font-ui); }
      .measured-banner { display:flex; align-items:center; gap:.6rem; flex-wrap:wrap;
        background:var(--ok-wash); border:1px solid var(--ok); border-radius:var(--r-md);
        padding:.6rem .85rem; margin-bottom:1rem; font-size:var(--fs-sm); color:var(--text-2); }
    </style>`;

  const drop = outlet.querySelector('#im-drop');
  const input = outlet.querySelector('#im-file');
  const status = outlet.querySelector('#im-status');
  const body = outlet.querySelector('#im-body');

  drop.addEventListener('click', () => input.click());
  drop.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
  });
  input.addEventListener('change', () => { if (input.files[0]) load(input.files[0]); });

  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => {
    e.preventDefault(); drop.classList.add('is-over');
  }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => {
    e.preventDefault(); drop.classList.remove('is-over');
  }));
  drop.addEventListener('drop', (e) => {
    const f = e.dataTransfer?.files?.[0];
    if (f) load(f);
  });

  function say(text, pct) {
    status.hidden = false;
    status.innerHTML = `<span>${esc(text)}</span>
      <span class="im-bar"><i style="width:${Math.round((pct || 0) * 100)}%"></i></span>`;
  }

  async function load(f) {
    file = f;
    destroyCharts();
    body.innerHTML = '';
    say(`Reading ${f.name} (${CSV.fileSize(f.size)})…`, 0.05);

    let text;
    try {
      text = await CSV.readFile(f, (p) => say(`Reading ${f.name}…`, 0.05 + p * 0.35));
    } catch (e) {
      status.hidden = true;
      body.innerHTML = callout(`<strong>Could not read that file.</strong> ${esc(e.message)}`, 'danger');
      return;
    }

    say(`Parsing${CSV.usingWorker() ? ' (off the main thread)' : ''}…`, 0.45);
    try {
      parsed = await CSV.parse(text, profiles, {}, (p) => say('Parsing…', 0.45 + p * 0.5));
    } catch (e) {
      status.hidden = true;
      body.innerHTML = callout(`<strong>Parsing failed.</strong> ${esc(e.message)}`, 'danger');
      return;
    }

    for (const c of parsed.columns) { chosenRole[c.index] = c.role || ''; chosenUnit[c.index] = c.unit || ''; }
    status.hidden = true;
    paint();
  }

  function roleDef(id) { return (profiles.roles || []).find((r) => r.id === id); }
  function unitOf(colIndex) {
    const role = chosenRole[colIndex];
    const def = roleDef(role);
    if (!def) return null;
    return (def.units || []).find((u) => u.u === chosenUnit[colIndex]) || def.units?.[0] || null;
  }
  function colByRole(role) {
    const i = Object.keys(chosenRole).find((k) => chosenRole[k] === role);
    return i === undefined ? null : parsed.columns[Number(i)];
  }

  function paint() {
    if (!parsed) return;
    const rep = parsed.report;
    const det = parsed.detected;

    if (rep.fatal) {
      body.innerHTML = callout(`<strong>${esc(rep.fatal)}</strong>`, 'danger') + rawPreview();
      return;
    }

    const rejected = rep.short + rep.long;
    const lowConfidence = det.sniff.consistent < 0.9 || !det.decimal.confident;

    body.innerHTML = `
      <div class="measured-banner">
        <span class="badge badge-measured">Measured</span>
        <span><strong>${esc(file.name)}</strong> — your own experimental data. Everything below is read
        from this file. Nothing here is simulated, and no simulated curve is drawn on the same axes.</span>
      </div>

      <section class="section">
        <div class="section-head"><h2>What was read</h2>
          <span class="section-note">check this before the plot</span></div>

        <div class="im-rep">
          <div class="im-stat"><span class="k">Rows kept</span><span class="v">${rep.kept.toLocaleString()}</span></div>
          <div class="im-stat"><span class="k">Columns</span><span class="v">${parsed.columns.length}</span></div>
          <div class="im-stat${rejected ? ' warn' : ''}"><span class="k">Rows rejected</span><span class="v">${rejected}</span></div>
          <div class="im-stat${rep.nonNumeric ? ' warn' : ''}"><span class="k">Unreadable cells</span><span class="v">${rep.nonNumeric}</span></div>
          <div class="im-stat"><span class="k">Blank lines</span><span class="v">${rep.blank}</span></div>
        </div>

        <div class="table-wrap"><table class="stackable"><tbody>
          <tr><td data-label="Separator"><strong>Separator</strong></td>
              <td data-label="value">${esc(det.sniff.name)} — consistent on
                ${Math.round(det.sniff.consistent * 100)}% of sampled lines</td></tr>
          <tr><td data-label="Decimal"><strong>Decimal mark</strong></td>
              <td data-label="value"><code>${esc(det.decimal.decimal)}</code> — ${esc(det.decimal.reason)}</td></tr>
          <tr><td data-label="Header"><strong>Header row</strong></td>
              <td data-label="value">line ${det.headerIndex + 1}${det.preamble.length
                ? ` · ${det.preamble.length} line${det.preamble.length === 1 ? '' : 's'} of instrument metadata above it` : ''}</td></tr>
        </tbody></table></div>

        ${lowConfidence ? callout(`<strong>Check this one carefully.</strong>
          ${det.sniff.consistent < 0.9
            ? 'The separator was not consistent across every line. ' : ''}
          ${!det.decimal.confident
            ? 'The decimal mark could not be determined with confidence — a European export using decimal ' +
              'commas, read as if it used points, produces numbers wrong by factors of ten with no error ' +
              'anywhere. ' : ''}
          Compare the ranges in the mapping table below against what you expect from the measurement.`, 'warn') : ''}

        ${rejected ? `<details style="margin-top:1rem"><summary class="small">
            ${rejected} row${rejected === 1 ? ' was' : 's were'} rejected — see which</summary>
          <p class="xsmall muted" style="margin:.6rem 0">Rejected rows are NOT included in anything below.
          They are listed here with their line numbers so you can look at them in the original file, rather
          than being dropped silently.</p>
          <ul class="im-rej">${rep.rejected.map((x) =>
            `<li>line ${x.line}: ${esc(x.why)} — <span class="muted">${esc(x.text)}</span></li>`).join('')}
          </ul>${rep.rejected.length < rejected ? `<p class="xsmall muted">…and ${rejected - rep.rejected.length} more.</p>` : ''}
        </details>` : ''}

        ${det.preamble.length ? `<details style="margin-top:.75rem"><summary class="small">
            Instrument metadata above the header — often carries the active mass and the schedule</summary>
          <div class="im-pre" style="margin-top:.6rem">${esc(det.preamble.join('\n'))}</div></details>` : ''}
      </section>

      <section class="section">
        <div class="section-head"><h2>Column mapping</h2>
          <span class="section-note">detected, not decided — change anything that is wrong</span></div>
        <p class="small" style="max-width:76ch;margin-bottom:.8rem">
          The unit matters as much as the role. A current column in mA read as A is a factor of a thousand,
          and it produces no error — just a specific capacitance that is wrong by three orders of magnitude.
          Check the range of each column against what you expect.
        </p>
        <div class="table-wrap"><table class="im-map stackable">
          <thead><tr><th>Column in your file</th><th>Is</th><th>In units of</th><th>Range in the file</th></tr></thead>
          <tbody>${parsed.columns.map(mapRow).join('')}</tbody>
        </table></div>
      </section>

      <div id="im-plots"></div>
      <div id="im-stats"></div>`;

    body.querySelectorAll('[data-role-for]').forEach((sel) => sel.addEventListener('change', () => {
      const i = Number(sel.dataset.roleFor);
      chosenRole[i] = sel.value;
      const def = roleDef(sel.value);
      chosenUnit[i] = def?.units?.[0]?.u || '';
      paint();
    }));
    body.querySelectorAll('[data-unit-for]').forEach((sel) => sel.addEventListener('change', () => {
      chosenUnit[Number(sel.dataset.unitFor)] = sel.value;
      paint();
    }));

    drawPlots();
    drawStats();
  }

  function mapRow(c) {
    const role = chosenRole[c.index];
    const def = roleDef(role);
    const u = unitOf(c.index);
    const range = c.numeric && c.min !== undefined
      ? `${sig(c.min, 4)} … ${sig(c.max, 4)}${u ? ` ${esc(u.u)}` : ''}`
      : '<span class="muted">text column</span>';

    return `<tr>
      <td data-label="Column"><code>${esc(c.header)}</code>
        ${c.role && c.roleScore < 80 ? `<div class="im-guess low">matched on "${esc(c.matchedAlias)}" — worth checking</div>`
          : c.role ? `<div class="im-guess">matched on "${esc(c.matchedAlias)}"</div>`
          : `<div class="im-guess">no match — set it by hand if you need this column</div>`}
        ${!c.numeric && c.numericFraction > 0 ? `<div class="im-guess low">only ${Math.round(c.numericFraction * 100)}% of values are numeric</div>` : ''}
      </td>
      <td data-label="Is"><select data-role-for="${c.index}">
        <option value=""${role ? '' : ' selected'}>— not used —</option>
        ${(profiles.roles || []).map((r) =>
          `<option value="${esc(r.id)}"${r.id === role ? ' selected' : ''}>${esc(r.label)}</option>`).join('')}
      </select></td>
      <td data-label="In units of">${def ? `<select data-unit-for="${c.index}">${(def.units || []).map((x) =>
          `<option value="${esc(x.u)}"${x.u === chosenUnit[c.index] ? ' selected' : ''}>${esc(x.u)}</option>`).join('')}
        </select>` : '<span class="muted">—</span>'}</td>
      <td data-label="Range in the file">${range}</td>
    </tr>`;
  }

  /* ── Plots ── */

  async function drawPlots() {
    destroyCharts();
    const host = body.querySelector('#im-plots');
    if (!host) return;

    const available = (profiles.plots || []).filter((p) => p.needs.every((r) => colByRole(r)));

    if (!available.length) {
      host.innerHTML = `<section class="section">
        <div class="section-head"><h2>Plots</h2></div>
        ${callout(`No plot can be drawn yet. Map at least one recognised pair — time and voltage,
          voltage and current, or frequency and impedance — using the table above.`, 'info')}
      </section>`;
      return;
    }

    host.innerHTML = `<section class="section">
      <div class="section-head"><h2>Plots</h2>
        <span class="section-note">${available.length} available from this mapping · your measured data</span></div>
      <div class="stack" id="im-plot-hosts">
        ${available.map((p) => `<div data-plot="${esc(p.id)}"></div>`).join('')}
      </div>
    </section>`;

    for (const p of available) {
      const cx = colByRole(p.x), cy = colByRole(p.y);
      const s = CSV.series(cx, cy, unitOf(cx.index), unitOf(cy.index));
      let points = s.points;
      if (p.negateY) points = points.map((q) => ({ x: q.x, y: -q.y }));

      /* Downsample for DRAWING only — every statistic above and every value
         handed to a calculator uses the full set. Architecture §G.2. */
      const drawn = points.length > PLOT_LIMIT ? downsampleLTTB(points, PLOT_LIMIT) : points;

      const target = host.querySelector(`[data-plot="${p.id}"]`);
      const hint = [
        p.note,
        p.constantCurrentCheck ? constantCurrentNote(colByRole('current'), unitOf(colByRole('current').index)) : null,
        points.length > drawn.length
          ? `Drawing ${drawn.length.toLocaleString()} of ${points.length.toLocaleString()} points (peaks preserved); statistics use all of them.`
          : null,
        s.dropped ? `${s.dropped} row${s.dropped === 1 ? '' : 's'} had a non-numeric value in one of these two columns and are not plotted.` : null
      ].filter(Boolean).join(' · ');

      const ch = await chartCard(target, {
        title: p.title,
        xLabel: `${roleDef(p.x)?.label || p.x}  (${unitOf(cx.index)?.u || ''})`,
        yLabel: `${p.negateY ? '−' : ''}${roleDef(p.y)?.label || p.y}  (${unitOf(cy.index)?.u || ''})`,
        datasets: [{ label: file.name, data: drawn, pointRadius: drawn.length < 400 ? 1.5 : 0 }],
        logX: !!p.logX,
        equalAspect: !!p.equalAspect,
        hint
      });
      charts.push(ch);
    }
  }

  function drawStats() {
    const host = body.querySelector('#im-stats');
    if (!host) return;
    const mapped = parsed.columns.filter((c) => chosenRole[c.index] && c.numeric);
    if (!mapped.length) { host.innerHTML = ''; return; }

    host.innerHTML = `<section class="section">
      <div class="section-head"><h2>Summary</h2>
        <span class="section-note">descriptive only · computed over every kept row, in SI</span></div>
      <p class="small" style="max-width:76ch;margin-bottom:.8rem">
        These are descriptions of the numbers in your file, not findings. Nothing here identifies a plateau,
        a peak or a step — those are interpretations, and this page does not make them for you.
      </p>
      <div class="table-wrap"><table class="im-sum stackable">
        <thead><tr><th>Column</th><th>n</th><th>Min</th><th>Max</th><th>Span</th><th>Mean</th><th>Median</th><th>SD</th></tr></thead>
        <tbody>${mapped.map((c) => {
          const u = unitOf(c.index);
          const st = CSV.stats(c, u);
          if (!st) return '';
          const si = roleDef(chosenRole[c.index])?.siUnit || '';
          return `<tr>
            <td data-label="Column">${esc(c.header)} <span class="muted">(${esc(si)})</span></td>
            <td data-label="n">${st.n.toLocaleString()}</td>
            <td data-label="Min">${sig(st.min, 4)}</td>
            <td data-label="Max">${sig(st.max, 4)}</td>
            <td data-label="Span">${sig(st.span, 4)}</td>
            <td data-label="Mean">${sig(st.mean, 4)}</td>
            <td data-label="Median">${sig(st.median, 4)}</td>
            <td data-label="SD">${sig(st.sd, 3)}</td></tr>`;
        }).join('')}</tbody>
      </table></div>

      ${callout(`<strong>Taking a number from here into a calculator.</strong> Read the value you need off
        the summary or the plot, then open the <a href="#/calculators">calculation workbench</a> and enter it.
        The workbench asks which configuration you measured in before it computes, which is a question this
        page cannot answer from the file — a CSV records what the instrument did, never which cell
        arrangement produced it.`, 'info')}
    </section>`;
  }

  /**
   * A current–potential plot is a cyclic voltammogram only if the potential was
   * swept. If the current was held instead, the same two columns produce a plot
   * that looks like a voltammogram and is not one.
   *
   * This states a FACT about the numbers — what fraction of rows sit within 1%
   * of the median magnitude — and draws the one inference that fact licenses:
   * constant current IS galvanostatic, by definition. It stops there. It does
   * not guess at the protocol, name the technique, or interpret the shape.
   */
  function constantCurrentNote(col, unit) {
    if (!col) return null;
    const mags = col.values.filter(Number.isFinite).map(Math.abs).filter((v) => v > 0);
    if (mags.length < 20) return null;
    const sorted = [...mags].sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)];
    if (!(med > 0)) return null;
    const within = mags.filter((v) => Math.abs(v - med) / med <= 0.01).length / mags.length;
    if (within < 0.9) return null;
    return `NOT a voltammogram: the current magnitude stays within 1% of ${sig(med * (unit?.f ?? 1), 3)} A ` +
           `on ${(within * 100).toFixed(0)}% of rows, so the current was held, not the potential.`;
  }

  function destroyCharts() {
    charts.forEach((c) => c.destroy?.());
    charts = [];
  }

  return { destroy() { destroyCharts(); } };
}
