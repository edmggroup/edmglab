/**
 * EDMGLAB — Our instruments (Architecture v0.2 §E.5)
 *
 * The one view whose content this platform will never write.
 *
 * `data/instruments.json` ships empty, and the empty state below is not a
 * placeholder waiting for a future phase — it is the correct rendering of a
 * file only the group can fill. Specifications come from your manuals; the
 * quirks come from your benches. Neither can be inferred, and a plausible
 * invented number here would look exactly like a real one.
 *
 * The quirks are the point. "Channel 7 reads about 2 mV low, verified March
 * 2026" is knowledge that currently lives in one senior student's head and
 * leaves with them. It is also useless to anyone outside the lab, so it is
 * safe in a public repository — which is why it can live here at all.
 */

import { esc, pageHead, callout, valueWithProvenance } from '../ui.js';
import * as data from '../data.js';

export async function render(outlet) {
  const payload = await data.load('instruments');
  const items = Array.isArray(payload.items) ? payload.items : [];

  outlet.innerHTML = `
    ${pageHead('Our instruments',
      'The machines in this lab: what the manual says, when they were last checked, and what everyone eventually learns about them.')}
    ${items.length ? renderList(items) : renderEmpty()}
    <style>
      .in-card { border:1px solid var(--border); border-radius:var(--r-lg);
                 background:var(--surface); overflow:hidden; margin-bottom:1.25rem; }
      .in-head { display:flex; gap:.75rem; align-items:baseline; flex-wrap:wrap;
                 padding:.85rem 1rem; border-bottom:1px solid var(--border); background:var(--surface-2); }
      .in-head h2 { margin:0; font-size:var(--fs-md); }
      .in-head .sub { font-size:var(--fs-xs); color:var(--text-muted); font-family:var(--font-mono); }
      .in-body { padding:1rem; display:grid; gap:1.25rem; }
      .in-sec h3 { font-size:var(--fs-sm); text-transform:uppercase; letter-spacing:.06em;
                   color:var(--text-muted); margin:0 0 .5rem; }
      .in-kv { display:grid; gap:.35rem; }
      .in-kv > div { display:flex; gap:.75rem; justify-content:space-between; align-items:baseline;
                     padding:.35rem .55rem; background:var(--surface-2); border-radius:var(--r-sm); }
      .in-kv .k { font-size:var(--fs-sm); color:var(--text-2); }
      .in-chan { display:flex; flex-wrap:wrap; gap:.35rem; }
      .in-chan span { font-family:var(--font-mono); font-size:var(--fs-2xs); padding:.2rem .45rem;
                      background:var(--surface-2); border:1px solid var(--border); border-radius:var(--r-sm); }
      .in-quirk { border-left:3px solid var(--warn); background:var(--warn-wash);
                  border-radius:0 var(--r-sm) var(--r-sm) 0; padding:.65rem .8rem; display:grid; gap:.25rem; }
      .in-quirk .w { font-size:var(--fs-sm); font-weight:600; }
      .in-quirk .m { font-size:var(--fs-xs); color:var(--text-2); }
      .in-quirk .d { font-size:var(--fs-2xs); color:var(--text-muted); font-family:var(--font-mono); }
      .in-steps { margin:0; padding-left:1.15rem; font-size:var(--fs-sm); color:var(--text-2); }
      .in-steps li { margin-bottom:.3rem; }
    </style>`;

  return { destroy() {} };
}

function renderList(items) {
  return items.map((m) => `
    <article class="in-card">
      <div class="in-head">
        <h2>${esc([m.vendor, m.model].filter(Boolean).join(' ') || m.id)}</h2>
        <span class="sub">${esc([m.kind, m.serial, m.location].filter(Boolean).join(' · '))}</span>
      </div>
      <div class="in-body">
        ${m.manual?.title ? `
          <div class="in-sec"><h3>Manual</h3>
            <p class="small" style="margin:0">${esc(m.manual.title)}${
              m.manual.version ? ` — version ${esc(m.manual.version)}` : ''}
              ${m.manual.url ? ` · <a href="${esc(m.manual.url)}">link</a>` : ''}</p>
          </div>` : ''}

        ${m.channels?.length ? `
          <div class="in-sec"><h3>Channels</h3>
            <div class="in-chan">${m.channels.map((c) =>
              `<span title="${esc([c.group, c.range, c.notes].filter(Boolean).join(' · '))}">${esc(c.id)}${
                c.group ? ` · ${esc(c.group)}` : ''}</span>`).join('')}</div>
          </div>` : ''}

        ${specRows(m.specs)}

        ${m.calibration?.length ? `
          <div class="in-sec"><h3>Calibration and checks</h3>
            <div class="in-kv">${m.calibration.map((c) => `
              <div><span class="k">${esc(c.date || '—')}${c.by ? ` · ${esc(c.by)}` : ''}${
                c.what ? ` · ${esc(c.what)}` : ''}</span>
              <span class="small">${esc(c.result || '')}</span></div>`).join('')}</div>
          </div>` : ''}

        ${m.sop?.length ? m.sop.map((s) => `
          <div class="in-sec"><h3>${esc(s.title || 'Procedure')}</h3>
            <ol class="in-steps">${(s.steps || []).filter(Boolean).map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
          </div>`).join('') : ''}

        ${m.quirks?.length ? `
          <div class="in-sec"><h3>Known quirks</h3>
            <div class="in-kv">${m.quirks.filter((q) => q.what).map((q) => `
              <div class="in-quirk" style="display:grid">
                <span class="w">${esc(q.what)}</span>
                ${q.workaround ? `<span class="m">${esc(q.workaround)}</span>` : ''}
                <span class="d">${esc([q.verified && `verified ${q.verified}`, q.by, q.affects].filter(Boolean).join(' · ') || 'no date recorded')}</span>
              </div>`).join('')}</div>
          </div>` : ''}
      </div>
    </article>`).join('');
}

/** Specifications, each carrying its provenance badge. */
function specRows(specs) {
  if (!specs) return '';
  const rows = Object.entries(specs)
    .filter(([k, v]) => !k.startsWith('_') && v && typeof v === 'object' && typeof v.value === 'number');
  if (!rows.length) return '';
  return `<div class="in-sec"><h3>From the manual</h3>
    <div class="in-kv">${rows.map(([k, v]) => `
      <div><span class="k">${esc(label(k))}</span>
      <span>${valueWithProvenance(v)}</span></div>`).join('')}</div>
  </div>`;
}

function label(k) {
  return k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
}

function renderEmpty() {
  return `
    ${callout(`<strong>Nothing here yet, and that is deliberate.</strong> EDMGLAB will never write an
      instrument specification. Every number on this page has to come from your own manual or your own
      calibration record — a value from memory, or from what a similar model does, would render exactly
      like a real one and there would be nothing to warn a student.`, 'warn')}

    <section class="section">
      <div class="section-head"><h2>What to put here</h2>
        <span class="section-note">edit <code>data/instruments.json</code></span></div>
      <div class="cols">
        <div class="panel"><div class="panel-head">From the manual</div><div class="panel-body">
          <ul class="lim-list">
            <li>Vendor, model, serial and where it lives — useful the moment there are two of the same machine.</li>
            <li>Channel count and grouping: which channels share a chamber, which are wired for which range.</li>
            <li>Current and voltage maxima, resolution and accuracy — copying the vendor's wording exactly,
                including whether accuracy is <em>% of reading</em> or <em>% of range</em>. Those differ by a
                lot at low current, and it is the commonest place a specification gets quoted wrongly.</li>
            <li>The manual's <strong>version</strong>. Vendors revise specifications between editions, and a
                value from the wrong edition is a wrong value with a citation attached.</li>
          </ul>
        </div></div>
        <div class="panel"><div class="panel-head">From your benches — the part that matters</div><div class="panel-body">
          <ul class="lim-list warn">
            <li><strong>Quirks.</strong> "Channel 7 reads about 2 mV low against the calibrator, verified
                March 2026." That sentence exists nowhere else. It is in one senior student's head, and it
                leaves when they graduate.</li>
            <li><strong>Workarounds.</strong> What to do about each quirk. More useful than the observation.</li>
            <li><strong>Calibration history.</strong> What was checked, when, by whom, and what was found.
                "Within specification" is a result worth recording.</li>
            <li><strong>Your own procedures.</strong> How a coin cell goes into that particular fixture.
                Not in the manual, not in any paper.</li>
          </ul>
        </div></div>
      </div>
    </section>

    <section class="section">
      <div class="section-head"><h2>How</h2></div>
      <div class="panel"><div class="panel-body">
        <p class="small">Open <code>data/instruments.json</code> in GitHub's web editor. Copy the
          <code>_template</code> block into <code>items</code>, fill what you can from a document in front of
          you, and delete the rest — an absent field renders as nothing rather than as a guess. Commit, then
          run the <a href="#/health">Data Health Check</a>: every specification must carry a
          <code>provenance</code> of <code>datasheet</code> with its source, or <code>measured</code> with a
          date, and the check errors if one does not.</p>
        <p class="small" style="margin-bottom:0">None of this is sensitive. Instrument quirks are useless to
          anyone outside this lab, so they belong in the repository — unlike anything about unpublished
          results, which does not. See <a href="#/menu">the two-tier rule</a> in the README.</p>
      </div></div>
    </section>`;
}
