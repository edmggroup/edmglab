/**
 * EDMGLAB — Cell formats and configurations (Instrumentation spec §4)
 *
 * ── THE DISTINCTION THIS PAGE EXISTS TO MAKE ──
 * §4 lists coin, CR-type, half, full, symmetric, pouch, cylindrical and
 * three-electrode cells together. They are not the same kind of thing, and
 * treating them as one list is exactly what leaves students confused:
 *
 *   FORMAT        how the cell is physically built   (coin · pouch · cylindrical)
 *   CONFIGURATION what the measurement is ABOUT      (half · full · symmetric · three-electrode)
 *
 * A coin cell can be a half cell OR a full cell. The format decides how you
 * assemble it; the configuration decides which formula is valid for the
 * result. Separating them is the whole point of the page.
 *
 * The layer diagram is a data-driven cross-section — no format-specific
 * drawing code, so adding a Swagelok or a flooded cell is a JSON edit.
 */

import { esc } from '../ui.js';
import * as data from '../data.js';
import { n as svg, label } from '../lib/anim-components.js';
import { addEnlargeControl } from '../lib/anim-fullscreen.js';

const FILL = {
  metal: { f: 'var(--border-strong)', s: 'var(--text-muted)' },
  pos:   { f: 'var(--series-6)',      s: 'var(--series-6)' },
  neg:   { f: 'var(--series-1)',      s: 'var(--series-1)' },
  sep:   { f: 'var(--text-muted)',    s: 'var(--text-muted)' },
  insul: { f: 'var(--series-5)',      s: 'var(--series-5)' }
};

export async function render(host) {
  const payload = await data.load('bt/cells');
  const formats = payload.formats || [];
  const configs = payload.configurations || [];

  if (!formats.length && !configs.length) {
    host.innerHTML = `<div class="callout callout-warn">Cell content has not been authored yet.</div>`;
    return { destroy() {} };
  }

  host.innerHTML = `
    <div class="callout callout-info" style="margin-bottom:1.25rem">
      <strong>Format and configuration are two different questions.</strong>
      The <em>format</em> is how the cell is physically built — coin, pouch, cylindrical.
      The <em>configuration</em> is what the measurement is about — half, full, symmetric,
      three-electrode. A coin cell can be a half cell or a full cell. The format decides how you
      assemble it; the configuration decides <strong>which formula is valid for the result</strong>.
    </div>

    <section class="section">
      <div class="section-head"><h2>Cell formats</h2>
        <span class="section-note">how it is built · select any layer</span></div>
      <div class="fmt-tabs" role="group" aria-label="Choose a cell format">
        ${formats.map((f, i) => `<button type="button" class="btn btn-sm${i === 0 ? ' is-active' : ''}"
           data-fmt="${esc(f.id)}">${esc(f.name)}</button>`).join('')}
      </div>
      <div id="fmt-body"></div>
    </section>

    <section class="section">
      <div class="section-head"><h2>Cell configurations</h2>
        <span class="section-note">what the measurement is about</span></div>
      <div class="cfg-grid">
        ${configs.map(cfgCard).join('')}
      </div>
    </section>

    <style>
      .fmt-tabs { display:flex; flex-wrap:wrap; gap:.4rem; margin-bottom:1rem; }
      .fmt-stage { border:1px solid var(--border); border-radius:var(--r-lg);
        background:var(--bg); padding:.75rem; }
      .fmt-stage svg { display:block; width:100%; height:auto; }
      .fmt-layer { cursor:pointer; }
      .fmt-layer:focus { outline:none; }
      .fmt-layer rect.body { transition:opacity var(--dur-fast); }
      .fmt-layer:hover rect.body, .fmt-layer:focus-visible rect.body { opacity:1; }
      .fmt-layer.is-selected rect.body { opacity:1; stroke-width:2.5; }
      .fmt-grid { display:grid; gap:1rem; grid-template-columns:minmax(260px,1fr) minmax(280px,1.1fr);
        align-items:start; }
      @media (max-width:820px){ .fmt-grid { grid-template-columns:1fr; } }
      .cfg-grid { display:grid; gap:.75rem; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); }
      .cfg-card { border:1px solid var(--border); border-radius:var(--r-md);
        background:var(--surface); padding:1rem; }
      .cfg-card h3 { font-size:var(--fs-md); margin:0 0 .15rem; }
      .cfg-lvl { font-family:var(--font-mono); font-size:var(--fs-xs); margin-bottom:.7rem; display:block; }
      .cfg-lvl.material { color:var(--accent-strong); }
      .cfg-lvl.device { color:var(--warn); }
      .cfg-row { margin-bottom:.6rem; font-size:var(--fs-sm); }
      .cfg-row .k { font-size:var(--fs-xs); text-transform:uppercase; letter-spacing:.06em;
        color:var(--text-muted); font-weight:650; display:block; margin-bottom:.1rem; }
      .cfg-row .v { color:var(--text-2); }
      .cfg-watch { border-left:3px solid var(--warn); background:var(--warn-wash);
        padding:.55rem .7rem; border-radius:var(--r-sm); font-size:var(--fs-sm); color:var(--text-2); }
    </style>`;

  const body = host.querySelector('#fmt-body');
  let current = null;

  function showFormat(id) {
    const f = formats.find((x) => x.id === id) || formats[0];
    current = f;
    host.querySelectorAll('[data-fmt]').forEach((b) => b.classList.toggle('is-active', b.dataset.fmt === f.id));

    body.innerHTML = `
      <p class="small" style="max-width:74ch;margin-bottom:.9rem">${esc(f.summary)}</p>
      ${f.note ? `<p class="xsmall muted" style="margin-bottom:1rem">${esc(f.note)}</p>` : ''}
      <div class="fmt-grid">
        <div class="fmt-stage" id="fmt-stage"></div>
        <div class="stack">
          <div class="panel"><div class="panel-head" id="fmt-dt-head">Layer detail</div>
            <div class="panel-body" id="fmt-dt-body">
              <p class="dg-empty small muted">Select a layer in the cross-section.</p></div></div>
          ${f.problems?.length ? `<div class="panel"><div class="panel-head">What commonly goes wrong</div>
            <div class="panel-body"><ul class="lim-list">${f.problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div></div>` : ''}
        </div>
      </div>`;

    const stage = body.querySelector('#fmt-stage');
    const els = buildStack(stage, f, select);
    addEnlargeControl(stage, `Cell format: ${f.label || f.id}`);
    function select(layerId) {
      const l = f.layers.find((x) => x.id === layerId);
      els.forEach((el, k) => el.classList.toggle('is-selected', k === layerId));
      body.querySelector('#fmt-dt-head').textContent = l ? l.label : 'Layer detail';
      body.querySelector('#fmt-dt-body').innerHTML = l
        ? `<p class="small" style="margin:0">${esc(l.detail)}</p>`
        : `<p class="dg-empty small muted">Select a layer.</p>`;
    }
    select(f.layers[0]?.id);
  }

  host.querySelectorAll('[data-fmt]').forEach((b) =>
    b.addEventListener('click', () => showFormat(b.dataset.fmt)));
  showFormat(formats[0]?.id);

  return { destroy() {} };
}

/* ── Cross-section stack ─────────────────────────────────── */

function buildStack(stage, fmt, onSelect) {
  const W = 420, PAD = 14, LABEL_X = 250;
  const unit = 9;                      // px per thickness unit
  const gap = 3;

  let y = PAD;
  const rows = fmt.layers.map((l) => {
    const h = Math.max(14, (l.t || 4) * unit);
    const row = { ...l, y, h };
    y += h + gap;
    return row;
  });
  const H = y + PAD;

  const el = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'group',
    'aria-label': `${fmt.name} cross-section` });
  const els = new Map();

  rows.forEach((r, i) => {
    const c = FILL[r.fill] || FILL.metal;
    const g = svg('g', { class: 'fmt-layer', tabindex: '0', role: 'button',
      'aria-label': `${r.label} — activate for detail` });

    g.appendChild(svg('rect', {
      class: 'body', x: PAD, y: r.y, width: 214, height: r.h, rx: 3,
      fill: c.f, 'fill-opacity': 0.32, stroke: c.s, 'stroke-width': 1.5, opacity: 0.85
    }));
    // Leader line out to the label, so text never sits on top of the stack.
    g.appendChild(svg('line', {
      x1: PAD + 214, y1: r.y + r.h / 2, x2: LABEL_X - 8, y2: r.y + r.h / 2,
      stroke: 'var(--border-strong)', 'stroke-width': 1, 'stroke-dasharray': '2 2'
    }));
    g.appendChild(label(LABEL_X, r.y + r.h / 2 + 5, r.label, { size: 13, fill: 'var(--text)' }));

    el.appendChild(g);
    els.set(r.id, g);

    g.addEventListener('click', () => onSelect(r.id));
    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(r.id); }
      if (e.key === 'ArrowDown') { e.preventDefault(); els.get(rows[(i + 1) % rows.length].id)?.focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); els.get(rows[(i - 1 + rows.length) % rows.length].id)?.focus(); }
    });
  });

  stage.appendChild(el);
  return els;
}

/* ── Configuration cards ─────────────────────────────────── */

function cfgCard(c) {
  const lvl = /material/i.test(c.level) ? 'material' : 'device';
  return `<div class="cfg-card">
    <h3>${esc(c.name)}</h3>
    <span class="cfg-lvl ${lvl}">${esc(c.level)}-level result</span>
    <div class="cfg-row"><span class="k">Measures</span><span class="v">${esc(c.measures)}</span></div>
    <div class="cfg-row"><span class="k">Typically</span><span class="v">${esc(c.typical)}</span></div>
    <div class="cfg-row"><span class="k">Consequence for the formula</span><span class="v">${esc(c.formulaNote)}</span></div>
    <div class="cfg-watch"><strong>Watch for:</strong> ${esc(c.watchFor)}</div>
  </div>`;
}
