/**
 * EDMGLAB — Interactive block-diagram engine
 * (Instrumentation spec §3, §14, §15, §16, §17 · Integration report §2.1)
 *
 * ONE component drives every interactive diagram in both modules:
 *   §3  battery tester channel architecture
 *   §14 potentiostat principle
 *   §15 galvanostat principle
 *   §16/§17 three-electrode system and cell connections
 *
 * Each is a JSON file, not a bespoke page. Adding a diagram is authoring
 * data; it never requires touching this file.
 *
 * Accessibility is built in rather than bolted on: blocks are real focusable
 * elements in a tablist-like pattern, reachable and operable by keyboard,
 * because a diagram that only works with a mouse excludes people and fails
 * on a phone.
 */

import { esc } from '../ui.js';
import { addEnlargeControl } from './anim-fullscreen.js';

const NS = 'http://www.w3.org/2000/svg';
const n = (t, a = {}) => {
  const e = document.createElementNS(NS, t);
  for (const [k, v] of Object.entries(a)) if (v !== null && v !== undefined) e.setAttribute(k, v);
  return e;
};

/**
 * Render an interactive diagram.
 * @param {HTMLElement} container
 * @param {object} spec  the diagram JSON (see data/_schema/diagram.example.json)
 * @returns {{destroy:Function}}
 */
/* Below this container width the authored horizontal layout is discarded and
   the blocks are stacked in a single column instead. Scaling a 800-unit-wide
   diagram down to a phone would leave 6px text; scrolling sideways hides
   blocks with no cue that they exist. Re-laying out keeps everything visible
   and legible, which is the only outcome that actually serves the reader. */
const NARROW_PX = 660;

/** Stacked single-column layout, generated from the block list. */
function columnLayout(spec) {
  const W = 360, PAD = 12, BW = W - PAD * 2, BH = 78, GAP = 34;
  const blocks = spec.blocks.map((b, i) => ({
    ...b, x: PAD, y: PAD + i * (BH + GAP), w: BW, h: BH
  }));
  return {
    blocks,
    viewBox: `0 0 ${W} ${PAD * 2 + blocks.length * (BH + GAP) - GAP}`
  };
}

export function renderDiagram(container, spec) {
  if (!spec || !Array.isArray(spec.blocks) || !spec.blocks.length) {
    container.innerHTML = `<div class="callout callout-warn">This diagram has not been authored yet.</div>`;
    return { destroy() {} };
  }

  const wrap = document.createElement('div');
  wrap.className = 'diagram';

  const stage = document.createElement('div');
  stage.className = 'diagram-stage';
  wrap.appendChild(stage);

  let selectedId = spec.blocks[0].id;
  let isNarrow = null;
  let blockEls = new Map();

  /** (Re)build the SVG for the current width. */
  function build() {
    // While the diagram is enlarged the stage lives in the overlay, not here.
    // Rebuilding then would wipe the drawing the reader is looking at.
    if (!wrap.contains(stage)) return;

    const narrow = (container.clientWidth || 800) < NARROW_PX;
    if (narrow === isNarrow) return;
    isNarrow = narrow;

    const layout = narrow ? columnLayout(spec)
                          : { blocks: spec.blocks, viewBox: spec.viewBox || '0 0 860 320' };

    stage.innerHTML = '';
    blockEls = new Map();
    buildSvgInto(stage, spec, layout, blockEls, select);
    /* Block diagrams are the one family of drawings a view mounts without an
       animation player around it, so the Enlarge control has to come from
       here — otherwise the four instrument diagrams would be the only ones on
       the platform with no way to make their labels bigger on a phone. It is
       added INSIDE build() because build() clears the stage. */
    addEnlargeControl(stage, spec.title || 'Diagram');
    select(selectedId);
  }

  function buildSvgInto(stageEl, spec, layout, blockEls, onSelect) {
  const svg = n('svg', {
    viewBox: layout.viewBox,
    role: 'group',
    'aria-label': spec.title || 'Interactive block diagram'
  });
  stageEl.appendChild(svg);

  // Connections first, so blocks paint on top of the lines.
  const byId = Object.fromEntries(layout.blocks.map((b) => [b.id, b]));
  for (const c of spec.connections || []) {
    const a = byId[c.from], b = byId[c.to];
    if (!a || !b) { console.warn(`[diagram] connection references unknown block: ${c.from} → ${c.to}`); continue; }
    svg.appendChild(connector(a, b, c));
  }

  // ── Blocks ──
  layout.blocks.forEach((b, i) => {
    const g = n('g', {
      class: 'dg-block',
      'data-id': b.id,
      'data-quantity': b.quantity || 'none',
      tabindex: '0',
      role: 'button',
      'aria-label': `${b.label}${b.sub ? ', ' + b.sub : ''} — activate for details`
    });

    g.appendChild(n('rect', { x: b.x, y: b.y, width: b.w, height: b.h, rx: 7 }));

    // Label, wrapped by hand — SVG has no automatic text wrapping.
    const lines = wrapText(b.label, Math.floor(b.w / 7.2));
    const hasSub = !!b.sub;
    const totalH = lines.length * 15 + (hasSub ? 14 : 0);
    let ty = b.y + b.h / 2 - totalH / 2 + 12;
    for (const line of lines) {
      const t = n('text', { x: b.x + b.w / 2, y: ty, 'text-anchor': 'middle' });
      t.textContent = line;
      g.appendChild(t);
      ty += 15;
    }
    if (hasSub) {
      const s = n('text', { x: b.x + b.w / 2, y: ty + 1, 'text-anchor': 'middle', class: 'dg-sub' });
      s.textContent = b.sub;
      g.appendChild(s);
    }

    svg.appendChild(g);
    blockEls.set(b.id, g);

    const activate = () => onSelect(b.id);
    g.addEventListener('click', activate);
    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
      // Arrow keys walk the diagram in authoring order — a natural reading
      // path through a signal chain.
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        const next = layout.blocks[(i + 1) % layout.blocks.length];
        blockEls.get(next.id)?.focus();
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = layout.blocks[(i - 1 + layout.blocks.length) % layout.blocks.length];
        blockEls.get(prev.id)?.focus();
      }
    });
  });
  }

  // ── Legend ──
  if (spec.blocks.some((b) => b.quantity === 'controlled' || b.quantity === 'measured')) {
    const lg = document.createElement('div');
    lg.className = 'diagram-legend';
    lg.innerHTML = `
      <span><i class="lg-swatch"></i> Solid outline — <strong>controlled</strong> quantity</span>
      <span><i class="lg-swatch measured"></i> Dashed outline — <strong>measured</strong> quantity</span>
      <span class="muted">Select any block for detail</span>`;
    wrap.appendChild(lg);
  }

  // ── Detail panel ──
  const detail = document.createElement('div');
  detail.className = 'panel dg-detail';
  detail.innerHTML = `<div class="panel-head">Block detail</div>
    <div class="panel-body"><p class="dg-empty">Select a block in the diagram above to see what it does,
    whether it controls or measures, what commonly goes wrong there, and how that shows up in your data.</p></div>`;
  wrap.appendChild(detail);

  container.appendChild(wrap);

  const specById = Object.fromEntries(spec.blocks.map((b) => [b.id, b]));

  function select(id) {
    const b = specById[id];
    if (!b) return;
    selectedId = id;
    blockEls.forEach((el, key) => el.classList.toggle('is-selected', key === id));
    detail.querySelector('.panel-body').innerHTML = detailHtml(b);
    detail.querySelector('.panel-head').textContent = b.label;
  }

  build();

  // Re-lay-out when the container crosses the narrow threshold. build() is a
  // no-op unless the layout mode actually changed, so this is cheap.
  let ro = null;
  if ('ResizeObserver' in window) {
    ro = new ResizeObserver(() => build());
    ro.observe(container);
  }

  return { destroy() { ro?.disconnect(); blockEls.clear(); } };
}

/** Exported so purpose-built diagrams (e.g. the three-electrode cell, which
 *  is a physical layout rather than a block flow) can reuse exactly the same
 *  detail panel instead of growing a second implementation. */
export function detailHtml(b) {
  const d = b.detail || {};
  const rows = [];

  if (d.function) rows.push(['What it does', `<p>${esc(d.function)}</p>`]);

  if (d.quantity) {
    const q = b.quantity;
    const badge = q === 'controlled'
      ? '<span class="badge badge-datasheet">Controlled</span>'
      : q === 'measured'
        ? '<span class="badge badge-measured">Measured</span>'
        : q === 'both'
          ? '<span class="badge badge-datasheet">Controlled</span> <span class="badge badge-measured">Measured</span>'
          : '';
    rows.push(['Controlled or measured', `${badge}<p style="margin-top:.4rem">${esc(d.quantity)}</p>`]);
  }

  if (d.role) rows.push(['Role in the experiment', `<p>${esc(d.role)}</p>`]);

  if (d.problems?.length) {
    rows.push(['Common problems', `<ul>${d.problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>`]);
  }

  if (d.dataEffect) {
    rows.push(['Effect on the recorded data', `<p>${esc(d.dataEffect)}</p>`]);
  }

  if (!rows.length) {
    return `<p class="dg-empty">Detail for this block has not been authored yet.</p>`;
  }

  const dl = `<dl>${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
  const draft = b.detail?._draft
    ? `<div class="callout callout-warn" style="margin-top:1rem"><strong>Draft content.</strong> This text is a placeholder pending review by the research group.</div>`
    : '';
  return dl + draft;
}

/** Elbow connector between two blocks, with an arrowhead. */
function connector(a, b, c) {
  const g = n('g', { class: 'dg-conn-group' });
  const ax = a.x + a.w / 2, ay = a.y + a.h / 2;
  const bx = b.x + b.w / 2, by = b.y + b.h / 2;

  // Leave from the edge nearest the target.
  let x1, y1, x2, y2;
  if (Math.abs(bx - ax) > Math.abs(by - ay)) {
    x1 = bx > ax ? a.x + a.w : a.x;  y1 = ay;
    x2 = bx > ax ? b.x : b.x + b.w;  y2 = by;
  } else {
    x1 = ax; y1 = by > ay ? a.y + a.h : a.y;
    x2 = bx; y2 = by > ay ? b.y : b.y + b.h;
  }

  const midX = (x1 + x2) / 2;
  const d = Math.abs(bx - ax) > Math.abs(by - ay)
    ? `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`
    : `M ${x1} ${y1} L ${x1} ${(y1 + y2) / 2} L ${x2} ${(y1 + y2) / 2} L ${x2} ${y2}`;

  g.appendChild(n('path', { class: 'dg-conn', d, 'stroke-dasharray': c.dashed ? '5 4' : null }));

  // Arrowhead at the target end.
  const ang = Math.atan2(y2 - (y1 + y2) / 2 || 0, x2 - midX || 0);
  const hl = 7;
  g.appendChild(n('path', {
    class: 'dg-conn-arrow',
    d: `M ${x2} ${y2} L ${x2 - hl * Math.cos(ang - 0.45)} ${y2 - hl * Math.sin(ang - 0.45)} L ${x2 - hl * Math.cos(ang + 0.45)} ${y2 - hl * Math.sin(ang + 0.45)} Z`
  }));

  if (c.label) {
    const t = n('text', {
      x: midX, y: (y1 + y2) / 2 - 6, 'text-anchor': 'middle',
      'font-size': 12, 'font-family': 'var(--font-mono)', fill: 'var(--text-muted)'
    });
    t.textContent = c.label;
    g.appendChild(t);
  }
  return g;
}

/** Naive greedy word wrap — SVG text does not wrap on its own. */
function wrapText(text, maxChars) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    if (!line) line = w;
    else if ((line + ' ' + w).length <= maxChars) line += ' ' + w;
    else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines;
}
