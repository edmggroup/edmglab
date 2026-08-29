/**
 * EDMGLAB — Three-electrode system, interactive (Instrumentation spec §16, §17)
 *
 * A purpose-built cell drawing rather than a block diagram, because the point
 * here is PHYSICAL: which lead goes where, and what flows along it.
 *
 * Spec §16 asks for one distinction to be visually emphasised above all others:
 *
 *      POTENTIAL is measured between WE and RE      (essentially no current)
 *      CURRENT flows between WE and CE              (the whole cell current)
 *
 * That is the entire reason a third electrode exists, and it is the thing
 * students most reliably get wrong. So it is not left as a caption — the two
 * paths are separately highlightable, and the page opens with them side by
 * side rather than mixed together.
 *
 * The detail panel is imported from diagram.js so both interactive diagrams
 * in the platform behave identically and there is only one implementation.
 */

import { esc } from '../ui.js';
import * as data from '../data.js';
import { detailHtml } from '../lib/diagram.js';
import { n as svg, label } from '../lib/anim-components.js';
import { addEnlargeControl } from '../lib/anim-fullscreen.js';

/* Geometry */
const G = {
  boxX: 170, boxY: 22, boxW: 380, boxH: 54,
  cellX: 178, cellY: 150, cellW: 364, cellH: 196,
  elyteY: 174,
  eTop: 118, eBottom: 300, eW: 15,
  we: 250, re: 360, ce: 470,
  currentY: 322, potY: 262
};

export async function render(host) {
  const payload = await data.load('ec/electrodes');
  const blocks = (payload.items || [])[0]?.blocks || [];
  const byId = Object.fromEntries(blocks.map((b) => [b.id, b]));

  host.innerHTML = `
    <div class="tec">
      <div class="tec-controls" role="group" aria-label="Highlight a path">
        <span class="field-label" style="margin-right:.3rem">Highlight</span>
        <button type="button" class="btn btn-sm" data-hl="potential">Potential measurement (WE ↔ RE)</button>
        <button type="button" class="btn btn-sm" data-hl="current">Current path (WE ↔ CE)</button>
        <button type="button" class="btn btn-sm is-active" data-hl="none">Both</button>
      </div>
      <div class="tec-stage" id="tec-stage"></div>
      <p class="tec-caption" id="tec-caption"></p>
      <div class="panel dg-detail" id="tec-detail">
        <div class="panel-head">Component detail</div>
        <div class="panel-body"><p class="dg-empty">Select a labelled part of the cell above.</p></div>
      </div>
    </div>

    <style>
      .tec { display:grid; gap:.9rem; }
      .tec-controls { display:flex; flex-wrap:wrap; align-items:center; gap:.4rem; }
      .tec-stage { border:1px solid var(--border); border-radius:var(--r-lg);
        background:var(--bg); padding:.5rem; }
      .tec-stage svg { display:block; width:100%; height:auto; }
      .tec-caption { font-size:var(--fs-sm); color:var(--text-2); margin:0; min-height:2.6em; }
      .tec-hot { cursor:pointer; }
      .tec-hot:focus { outline:none; }
      .tec-hot .hit { fill:transparent; }
      .tec-hot:hover .body, .tec-hot:focus-visible .body { stroke:var(--accent); stroke-width:2.6; }
      .tec-hot.is-selected .body { stroke:var(--accent-strong); stroke-width:3; }
      .path-dim { opacity:.16; }
    </style>`;

  const stage = host.querySelector('#tec-stage');
  const caption = host.querySelector('#tec-caption');
  const detail = host.querySelector('#tec-detail');
  const s = buildSvg();
  stage.appendChild(s.el);
  // 720-unit diagram in a 348 px phone column is half scale; its labels land
  // at about 5 px. Give it the same way out the animated scenes have.
  addEnlargeControl(stage, 'Three-electrode cell');

  /* ── Selection ── */
  function select(id) {
    const b = byId[id];
    s.hotspots.forEach((g, key) => g.classList.toggle('is-selected', key === id));
    if (!b) {
      detail.querySelector('.panel-body').innerHTML =
        `<p class="dg-empty">Detail for this part has not been authored yet.</p>`;
      return;
    }
    detail.querySelector('.panel-head').textContent = b.label;
    detail.querySelector('.panel-body').innerHTML = detailHtml(b);
  }

  s.hotspots.forEach((g, id) => {
    g.addEventListener('click', () => select(id));
    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(id); }
    });
  });

  /* ── Path highlighting — the §16 emphasis ── */
  const CAPTIONS = {
    potential: 'The potential of the working electrode is measured against the reference. Ideally no current passes through the reference electrode at all — it is there to hold a stable potential, not to carry charge. If current does flow through it, its potential shifts and every measurement moves with it.',
    current: 'The cell current flows between the working and counter electrodes. The counter electrode exists only to complete this circuit, which is why it needs sufficient area and a material that will not contaminate the cell — its own reaction is not what you are studying.',
    none: 'Two separate jobs, two separate paths. Separating them is the whole reason a third electrode exists: with only two, you cannot measure a stable potential and pass current through the same electrode without one corrupting the other.'
  };

  function highlight(mode) {
    s.currentPath.classList.toggle('path-dim', mode === 'potential');
    s.potentialPath.classList.toggle('path-dim', mode === 'current');
    caption.textContent = CAPTIONS[mode];
    host.querySelectorAll('[data-hl]').forEach((b) =>
      b.classList.toggle('is-active', b.dataset.hl === mode));
  }
  host.querySelectorAll('[data-hl]').forEach((b) =>
    b.addEventListener('click', () => highlight(b.dataset.hl)));

  highlight('none');
  if (blocks.length) select(blocks[0].id);

  return { destroy() { s.hotspots.clear(); } };
}

/* ════════════════════════════════════════════════════════════
   The drawing
   ════════════════════════════════════════════════════════════ */

function buildSvg() {
  const el = svg('svg', { viewBox: '0 0 720 400', role: 'group', 'aria-label': 'Three-electrode cell' });
  const hotspots = new Map();

  /** Wrap content in a focusable, clickable hotspot group. */
  const hot = (id, aria, children, hitRect) => {
    const g = svg('g', { class: 'tec-hot', tabindex: '0', role: 'button', 'aria-label': aria, 'data-id': id });
    children.forEach((ch) => g.appendChild(ch));
    if (hitRect) g.appendChild(svg('rect', { class: 'hit', ...hitRect }));
    el.appendChild(g);
    hotspots.set(id, g);
    return g;
  };

  /* ── Instrument ── */
  el.appendChild(svg('rect', {
    x: G.boxX, y: G.boxY, width: G.boxW, height: G.boxH, rx: 8,
    fill: 'var(--surface-2)', stroke: 'var(--border-strong)', 'stroke-width': 1.6
  }));
  const t = label(G.boxX + G.boxW / 2, G.boxY + 24, 'POTENTIOSTAT / GALVANOSTAT',
    { anchor: 'middle', size: 12, mono: true, weight: 700, fill: 'var(--text)' });
  el.appendChild(t);
  el.appendChild(label(G.boxX + G.boxW / 2, G.boxY + 42, 'controls one quantity · measures the other',
    { anchor: 'middle', size: 10, fill: 'var(--text-muted)' }));

  /* ── Cell vessel and electrolyte ── */
  el.appendChild(svg('path', {
    d: `M ${G.cellX} ${G.cellY} L ${G.cellX} ${G.cellY + G.cellH - 26}
        Q ${G.cellX} ${G.cellY + G.cellH} ${G.cellX + 26} ${G.cellY + G.cellH}
        L ${G.cellX + G.cellW - 26} ${G.cellY + G.cellH}
        Q ${G.cellX + G.cellW} ${G.cellY + G.cellH} ${G.cellX + G.cellW} ${G.cellY + G.cellH - 26}
        L ${G.cellX + G.cellW} ${G.cellY}`,
    fill: 'none', stroke: 'var(--border-strong)', 'stroke-width': 2
  }));

  hot('electrolyte', 'Electrolyte', [
    svg('path', {
      class: 'body',
      d: `M ${G.cellX + 2} ${G.elyteY} L ${G.cellX + 2} ${G.cellY + G.cellH - 26}
          Q ${G.cellX + 2} ${G.cellY + G.cellH - 2} ${G.cellX + 26} ${G.cellY + G.cellH - 2}
          L ${G.cellX + G.cellW - 26} ${G.cellY + G.cellH - 2}
          Q ${G.cellX + G.cellW - 2} ${G.cellY + G.cellH - 2} ${G.cellX + G.cellW - 2} ${G.cellY + G.cellH - 26}
          L ${G.cellX + G.cellW - 2} ${G.elyteY} Z`,
      fill: 'var(--accent)', 'fill-opacity': 0.07, stroke: 'var(--accent-dim)', 'stroke-width': 1.2
    }),
    label(G.cellX + 14, G.elyteY + 20, 'Electrolyte', { size: 11, fill: 'var(--text-2)' })
  ], { x: G.cellX, y: G.cellY + G.cellH - 34, width: 120, height: 46 });

  /* ── Electrodes ── */
  const electrode = (id, x, colour, name, sub) => {
    hot(id, name, [
      svg('rect', {
        class: 'body', x: x - G.eW / 2, y: G.eTop, width: G.eW, height: G.eBottom - G.eTop, rx: 3,
        fill: colour, 'fill-opacity': 0.35, stroke: colour, 'stroke-width': 1.8
      }),
      svg('line', { x1: x, y1: G.boxY + G.boxH, x2: x, y2: G.eTop, stroke: colour, 'stroke-width': 2 }),
      label(x, G.eTop - 14, name, { anchor: 'middle', size: 12, weight: 700, fill: colour }),
      label(x, G.eTop - 28, sub, { anchor: 'middle', size: 9.5, fill: 'var(--text-muted)' })
    ], { x: x - 34, y: G.boxY + G.boxH, width: 68, height: G.eBottom - G.boxY - G.boxH });
  };
  electrode('we', G.we, 'var(--series-1)', 'WE', 'working');
  electrode('re', G.re, 'var(--series-4)', 'RE', 'reference');
  electrode('ce', G.ce, 'var(--series-2)', 'CE', 'counter');

  /* ── Current path: WE ↔ CE ── */
  const currentPath = svg('g', {});
  currentPath.appendChild(svg('path', {
    d: `M ${G.we} ${G.eBottom} C ${G.we} ${G.currentY + 26}, ${G.ce} ${G.currentY + 26}, ${G.ce} ${G.eBottom}`,
    fill: 'none', stroke: 'var(--series-2)', 'stroke-width': 3.4, 'stroke-linecap': 'round', 'stroke-opacity': 0.85
  }));
  // Direction arrows along the arc
  [0.34, 0.5, 0.66].forEach((f) => {
    const x = G.we + (G.ce - G.we) * f;
    currentPath.appendChild(svg('path', {
      d: `M ${x - 6} ${G.currentY + 13} L ${x + 5} ${G.currentY + 19.5} L ${x - 6} ${G.currentY + 26} Z`,
      fill: 'var(--series-2)'
    }));
  });
  currentPath.appendChild(label((G.we + G.ce) / 2, G.currentY + 46, 'CURRENT  —  the full cell current flows here',
    { anchor: 'middle', size: 11, weight: 650, fill: 'var(--series-2)' }));
  el.appendChild(currentPath);
  hotspots.set('path_current', currentPath);
  currentPath.setAttribute('class', 'tec-hot');
  currentPath.setAttribute('tabindex', '0');
  currentPath.setAttribute('role', 'button');
  currentPath.setAttribute('aria-label', 'Current path between working and counter electrodes');

  /* ── Potential path: WE ↔ RE ── */
  const potentialPath = svg('g', {});
  potentialPath.appendChild(svg('line', {
    x1: G.we, y1: G.potY, x2: G.re, y2: G.potY,
    stroke: 'var(--series-4)', 'stroke-width': 2.6, 'stroke-dasharray': '7 5', 'stroke-linecap': 'round'
  }));
  potentialPath.appendChild(svg('circle', {
    cx: (G.we + G.re) / 2, cy: G.potY, r: 15,
    fill: 'var(--surface)', stroke: 'var(--series-4)', 'stroke-width': 2
  }));
  const vt = label((G.we + G.re) / 2, G.potY + 5, 'V',
    { anchor: 'middle', size: 14, mono: true, weight: 700, fill: 'var(--series-4)' });
  potentialPath.appendChild(vt);
  potentialPath.appendChild(label((G.we + G.re) / 2, G.potY - 26, 'POTENTIAL  —  ideally no current',
    { anchor: 'middle', size: 10.5, weight: 650, fill: 'var(--series-4)' }));
  el.appendChild(potentialPath);
  hotspots.set('path_potential', potentialPath);
  potentialPath.setAttribute('class', 'tec-hot');
  potentialPath.setAttribute('tabindex', '0');
  potentialPath.setAttribute('role', 'button');
  potentialPath.setAttribute('aria-label', 'Potential measurement between working and reference electrodes');

  return { el, hotspots, currentPath, potentialPath };
}
