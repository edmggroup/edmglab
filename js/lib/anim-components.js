/**
 * EDMGLAB — Scientific animation primitive library
 * (Instrumentation spec §37 · Integration report §4, layer 2)
 *
 * Every visual object a scene can need, as a parameterised SVG factory.
 * Scenes compose these; they never draw raw SVG. Two consequences worth
 * having: one consistent visual language across both instrument modules,
 * and a single place to fix an ion that looks wrong everywhere at once.
 *
 * Everything is styled from CSS custom properties (tokens.css), so the whole
 * library follows the light/dark theme with no per-scene work.
 *
 * NOTE ON SCIENTIFIC HONESTY
 * These are schematic symbols, not physical models. Ion radii here are
 * chosen for legibility, not drawn to scale — Na⁺ is drawn larger than Li⁺
 * because that ordering is real and pedagogically useful, but the ratio on
 * screen is not the true ionic-radius ratio. Any scene using them is
 * labelled "Conceptual representation" by the engine.
 */

const NS = 'http://www.w3.org/2000/svg';

/** Create an SVG node with attributes. */
export function n(tag, attrs = {}, children = []) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    e.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c) e.appendChild(c);
  return e;
}

/** Group helper. */
export function group(attrs = {}, children = []) { return n('g', attrs, children); }

/* ════════════════════════════════════════════════════════════
   CHARGE CARRIERS
   ════════════════════════════════════════════════════════════ */

const ION_STYLE = {
  'Li':     { r: 7,   fill: 'var(--series-1)', text: 'Li⁺' },
  'Na':     { r: 9,   fill: 'var(--series-2)', text: 'Na⁺' },
  'K':      { r: 10,  fill: 'var(--series-5)', text: 'K⁺'  },
  'H':      { r: 5.5, fill: 'var(--series-3)', text: 'H⁺'  },
  'cation': { r: 8,   fill: 'var(--series-3)', text: '+'   },
  'anion':  { r: 8,   fill: 'var(--series-6)', text: '−'   }
};

/**
 * A charge carrier.
 * @param {'Li'|'Na'|'K'|'H'|'cation'|'anion'} species
 */
export function ion(species = 'Li', opts = {}) {
  const s = ION_STYLE[species] || ION_STYLE.cation;
  const r = opts.r || s.r;
  const g = group({ class: 'ac-ion', 'data-species': species });
  g.appendChild(n('circle', {
    r, cx: 0, cy: 0,
    fill: opts.fill || s.fill,
    'fill-opacity': opts.opacity ?? 0.9,
    stroke: 'var(--bg)', 'stroke-width': 1
  }));
  if (opts.label !== false) {
    const t = n('text', {
      x: 0, y: r * 0.42, 'text-anchor': 'middle',
      'font-size': r * 1.05, 'font-family': 'var(--font-mono)',
      'font-weight': 600, fill: 'var(--bg)', 'pointer-events': 'none'
    });
    t.textContent = s.text;
    g.appendChild(t);
  }
  return g;
}

/** An electron — always small, always the same colour, never confusable with an ion. */
export function electron(opts = {}) {
  const r = opts.r || 4;
  const g = group({ class: 'ac-electron' });
  g.appendChild(n('circle', {
    r, cx: 0, cy: 0,
    fill: 'var(--text-2)', stroke: 'var(--bg)', 'stroke-width': 0.8
  }));
  g.appendChild(n('line', {
    x1: -r * 0.5, y1: 0, x2: r * 0.5, y2: 0,
    stroke: 'var(--bg)', 'stroke-width': 1.4, 'stroke-linecap': 'round'
  }));
  return g;
}

/* ════════════════════════════════════════════════════════════
   CELL COMPONENTS
   ════════════════════════════════════════════════════════════ */

/**
 * An electrode block.
 * @param {{x,y,w,h,role,label,fill}} o  role: 'positive'|'negative'|'we'|'ce'|'re'
 */
export function electrode(o) {
  const roleFill = {
    positive: 'var(--series-6)', negative: 'var(--series-1)',
    we: 'var(--series-1)', ce: 'var(--series-2)', re: 'var(--series-4)'
  };
  const g = group({ class: 'ac-electrode', 'data-role': o.role || '' });
  g.appendChild(n('rect', {
    x: o.x, y: o.y, width: o.w, height: o.h, rx: 3,
    fill: o.fill || roleFill[o.role] || 'var(--surface-3)',
    'fill-opacity': o.opacity ?? 0.28,
    stroke: o.fill || roleFill[o.role] || 'var(--border-strong)',
    'stroke-width': 1.6
  }));
  if (o.label) g.appendChild(label(o.x + o.w / 2, o.y - 8, o.label, { anchor: 'middle' }));
  return g;
}

/** Porous carbon texture inside a region — for EDLC and hard-carbon scenes. */
export function porousCarbon(o) {
  const g = group({ class: 'ac-porous' });
  g.appendChild(n('rect', {
    x: o.x, y: o.y, width: o.w, height: o.h, rx: 3,
    fill: 'var(--surface-3)', 'fill-opacity': 0.5,
    stroke: 'var(--border-strong)', 'stroke-width': 1.4
  }));
  const cols = o.cols || 4, rows = o.rows || 5;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      // Deterministic offsets — no Math.random, so the picture is identical
      // on every render and every device.
      const jitter = ((i * 7 + j * 13) % 5) - 2;
      g.appendChild(n('circle', {
        cx: o.x + (o.w / (cols + 1)) * (i + 1) + jitter,
        cy: o.y + (o.h / (rows + 1)) * (j + 1) + jitter,
        r: 2.6 + ((i + j) % 3) * 0.7,
        fill: 'var(--bg)', 'fill-opacity': 0.75
      }));
    }
  }
  return g;
}

/** A single pore, drawn large enough to show ions entering it. */
export function pore(o) {
  return n('ellipse', {
    class: 'ac-pore', cx: o.cx, cy: o.cy, rx: o.rx || 14, ry: o.ry || 8,
    fill: 'var(--bg)', stroke: 'var(--border-strong)', 'stroke-width': 1.2,
    'stroke-dasharray': '3 2'
  });
}

/** A carbon layer / graphene sheet, drawn as a slightly wavy line. */
export function carbonLayer(o) {
  const w = o.w, y = o.y, amp = o.amp ?? 2.5, segs = o.segs || 10;
  let d = `M ${o.x} ${y}`;
  for (let i = 1; i <= segs; i++) {
    const x = o.x + (w / segs) * i;
    d += ` Q ${x - w / segs / 2} ${y + (i % 2 ? -amp : amp)} ${x} ${y}`;
  }
  return n('path', {
    class: 'ac-carbon', d, fill: 'none',
    stroke: o.stroke || 'var(--text-muted)', 'stroke-width': o.width || 2,
    'stroke-linecap': 'round'
  });
}

/** Separator — a dashed permeable barrier. */
export function separator(o) {
  const g = group({ class: 'ac-separator' });
  g.appendChild(n('rect', {
    x: o.x, y: o.y, width: o.w, height: o.h,
    fill: 'var(--text-muted)', 'fill-opacity': 0.10,
    stroke: 'var(--text-muted)', 'stroke-width': 1.2, 'stroke-dasharray': '4 3'
  }));
  if (o.label) g.appendChild(label(o.x + o.w / 2, o.y - 8, o.label, { anchor: 'middle' }));
  return g;
}

/** Electrolyte region — a wash of colour behind everything else. */
export function electrolyte(o) {
  const g = group({ class: 'ac-electrolyte' });
  g.appendChild(n('rect', {
    x: o.x, y: o.y, width: o.w, height: o.h, rx: o.rx ?? 4,
    fill: 'var(--accent)', 'fill-opacity': 0.06,
    stroke: 'var(--accent-dim)', 'stroke-width': 1, 'stroke-opacity': 0.5
  }));
  if (o.label) g.appendChild(label(o.x + o.w / 2, o.y + o.h + 16, o.label, { anchor: 'middle' }));
  return g;
}

/** Current collector — a solid metal strip. */
export function currentCollector(o) {
  const g = group({ class: 'ac-collector' });
  g.appendChild(n('rect', {
    x: o.x, y: o.y, width: o.w, height: o.h, rx: 1.5,
    fill: 'var(--border-strong)', stroke: 'var(--text-muted)', 'stroke-width': 1
  }));
  if (o.label) g.appendChild(label(o.x + o.w / 2, o.y - 8, o.label, { anchor: 'middle', size: 10 }));
  return g;
}

/** An active-material particle. */
export function particle(o) {
  return n('circle', {
    class: 'ac-particle', cx: o.cx, cy: o.cy, r: o.r || 12,
    fill: o.fill || 'var(--surface-3)',
    stroke: o.stroke || 'var(--border-strong)', 'stroke-width': 1.4
  });
}

/* ════════════════════════════════════════════════════════════
   ANNOTATION
   ════════════════════════════════════════════════════════════ */

/**
 * A text label. Hidden by the engine's Labels toggle.
 *
 * 12.5 user units, not 11.5. A scene's viewBox is about 640 wide and the
 * stage scales to the column, so on a phone every one of these renders at
 * roughly half its declared size — 11.5 became 6.4 px, about a millimetre.
 * The bump helps a little everywhere; the real answer for a phone is the
 * engine's Enlarge control (js/lib/anim-fullscreen.js), which turns the
 * diagram onto the long edge of the screen.
 */
export function label(x, y, text, opts = {}) {
  const t = n('text', {
    class: 'anim-label', x, y,
    'text-anchor': opts.anchor || 'start',
    /* A FLOOR, not a default. Scenes were passing 9.5 and 10 for secondary
       annotations, which is fine on the desk monitor they were drawn on and
       4.6 px on a phone. Clamping here means no scene can reintroduce it, and
       there is no list of call sites to keep in step. */
    'font-size': Math.max(opts.size || 12.5, 11),
    'font-family': opts.mono ? 'var(--font-mono)' : 'var(--font-ui)',
    'font-weight': opts.weight || 550,
    fill: opts.fill || 'var(--text-2)'
  });
  t.textContent = text;
  return t;
}

/** A monospace numeric readout — for live voltage/current values. */
export function readout(x, y, opts = {}) {
  const t = n('text', {
    x, y, 'text-anchor': opts.anchor || 'start',
    'font-size': Math.max(opts.size || 13, 11),   // same floor as label()
    'font-family': 'var(--font-mono)', 'font-weight': 600,
    fill: opts.fill || 'var(--text)'
  });
  t.textContent = opts.text || '';
  return t;
}

/** An arrow between two points. Returns a <path> you can re-point later. */
export function arrow(x1, y1, x2, y2, opts = {}) {
  const g = group({ class: 'ac-arrow' });
  const color = opts.stroke || 'var(--text-2)';
  const line = n('line', {
    x1, y1, x2, y2, stroke: color,
    'stroke-width': opts.width || 1.8,
    'stroke-linecap': 'round',
    'stroke-dasharray': opts.dashed ? '5 3' : null
  });
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const hl = opts.head || 7;
  const head = n('path', {
    d: `M ${x2} ${y2} L ${x2 - hl * Math.cos(ang - 0.4)} ${y2 - hl * Math.sin(ang - 0.4)} L ${x2 - hl * Math.cos(ang + 0.4)} ${y2 - hl * Math.sin(ang + 0.4)} Z`,
    fill: color
  });
  g.append(line, head);
  g._line = line; g._head = head;
  return g;
}

/** Axes for an in-scene plot, with labelled x and y. */
export function axes(o) {
  const g = group({ class: 'ac-axes' });
  const { x, y, w, h } = o;
  g.appendChild(n('line', { x1: x, y1: y, x2: x, y2: y + h, stroke: 'var(--border-strong)', 'stroke-width': 1.4 }));
  g.appendChild(n('line', { x1: x, y1: y + h, x2: x + w, y2: y + h, stroke: 'var(--border-strong)', 'stroke-width': 1.4 }));
  if (o.xLabel) g.appendChild(label(x + w / 2, y + h + 26, o.xLabel, { anchor: 'middle', size: 11 }));
  if (o.yLabel) {
    const t = label(0, 0, o.yLabel, { anchor: 'middle', size: 11 });
    t.setAttribute('transform', `translate(${x - 30} ${y + h / 2}) rotate(-90)`);
    g.appendChild(t);
  }
  // Light gridlines
  for (let i = 1; i < (o.grid || 4); i++) {
    g.appendChild(n('line', {
      x1: x, y1: y + (h / (o.grid || 4)) * i, x2: x + w, y2: y + (h / (o.grid || 4)) * i,
      stroke: 'var(--grid)', 'stroke-width': 1
    }));
  }
  return g;
}

/** A polyline trace you extend point by point as a scene runs. */
export function trace(opts = {}) {
  return n('polyline', {
    class: 'ac-trace', points: '', fill: 'none',
    stroke: opts.stroke || 'var(--series-1)',
    'stroke-width': opts.width || 2,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round'
  });
}

/** Push a point onto a trace created above. */
export function pushPoint(traceEl, x, y, maxPoints = 600) {
  const pts = traceEl.getAttribute('points');
  const next = pts ? pts + ' ' + x.toFixed(1) + ',' + y.toFixed(1) : x.toFixed(1) + ',' + y.toFixed(1);
  const arr = next.split(' ');
  traceEl.setAttribute('points', arr.length > maxPoints ? arr.slice(arr.length - maxPoints).join(' ') : next);
}

export function clearTrace(traceEl) { traceEl.setAttribute('points', ''); }

/* ════════════════════════════════════════════════════════════
   INSTRUMENT SYMBOLS
   ════════════════════════════════════════════════════════════ */

/** A meter face — V or A — for showing what is measured vs controlled. */
export function meter(cx, cy, kind = 'V', opts = {}) {
  const r = opts.r || 16;
  const g = group({ class: 'ac-meter', 'data-kind': kind });
  g.appendChild(n('circle', {
    cx, cy, r, fill: 'var(--surface)',
    stroke: opts.stroke || 'var(--border-strong)', 'stroke-width': 1.6
  }));
  const t = n('text', {
    x: cx, y: cy + r * 0.34, 'text-anchor': 'middle',
    'font-size': r * 0.95, 'font-family': 'var(--font-mono)', 'font-weight': 700,
    fill: opts.fill || 'var(--text-2)'
  });
  t.textContent = kind;
  g.appendChild(t);
  return g;
}

/** A circuit element symbol: resistor, capacitor, cpe, warburg, inductor. */
export function circuitElement(x, y, type, opts = {}) {
  const w = opts.w || 34, h = opts.h || 16;
  const g = group({ class: 'ac-circuit', 'data-type': type });
  const stroke = opts.stroke || 'var(--text-2)', sw = 1.8;

  if (type === 'resistor') {
    g.appendChild(n('rect', { x: x - w / 2, y: y - h / 2, width: w, height: h, fill: 'var(--surface)', stroke, 'stroke-width': sw }));
  } else if (type === 'capacitor') {
    g.appendChild(n('line', { x1: x - 4, y1: y - h / 2 - 2, x2: x - 4, y2: y + h / 2 + 2, stroke, 'stroke-width': sw + 0.6 }));
    g.appendChild(n('line', { x1: x + 4, y1: y - h / 2 - 2, x2: x + 4, y2: y + h / 2 + 2, stroke, 'stroke-width': sw + 0.6 }));
  } else if (type === 'cpe') {
    g.appendChild(n('path', { d: `M ${x - 8} ${y - h / 2 - 2} L ${x - 1} ${y} L ${x - 8} ${y + h / 2 + 2}`, fill: 'none', stroke, 'stroke-width': sw }));
    g.appendChild(n('path', { d: `M ${x + 1} ${y - h / 2 - 2} L ${x + 8} ${y} L ${x + 1} ${y + h / 2 + 2}`, fill: 'none', stroke, 'stroke-width': sw }));
  } else if (type === 'warburg') {
    g.appendChild(n('rect', { x: x - w / 2, y: y - h / 2, width: w, height: h, fill: 'var(--surface)', stroke, 'stroke-width': sw }));
    const t = n('text', { x, y: y + 4.5, 'text-anchor': 'middle', 'font-size': 12, 'font-family': 'var(--font-mono)', fill: stroke });
    t.textContent = 'W';
    g.appendChild(t);
  } else if (type === 'inductor') {
    let d = `M ${x - w / 2} ${y}`;
    for (let i = 0; i < 4; i++) d += ` a 4 4 0 0 1 8 0`;
    g.appendChild(n('path', { d, fill: 'none', stroke, 'stroke-width': sw }));
  }

  // Leads
  g.appendChild(n('line', { x1: x - w / 2 - 10, y1: y, x2: x - w / 2, y2: y, stroke, 'stroke-width': sw }));
  g.appendChild(n('line', { x1: x + w / 2, y1: y, x2: x + w / 2 + 10, y2: y, stroke, 'stroke-width': sw }));

  if (opts.label) g.appendChild(label(x, y - h / 2 - 8, opts.label, { anchor: 'middle', mono: true, size: 11 }));
  return g;
}

/** A wire path between components. */
export function wire(d, opts = {}) {
  return n('path', {
    class: 'ac-wire', d, fill: 'none',
    stroke: opts.stroke || 'var(--border-strong)',
    'stroke-width': opts.width || 1.8,
    'stroke-linecap': 'round',
    'stroke-dasharray': opts.dashed ? '5 4' : null
  });
}

/* ════════════════════════════════════════════════════════════
   MOTION HELPERS
   ════════════════════════════════════════════════════════════ */

/** Place a node at (x, y) — the standard way a scene moves a primitive. */
export function at(node, x, y, opts = {}) {
  const s = opts.scale ? ` scale(${opts.scale})` : '';
  node.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})${s}`);
  if (opts.opacity !== undefined) node.setAttribute('opacity', opts.opacity);
}

/** Linear interpolation. */
export const lerp = (a, b, t) => a + (b - a) * t;

/** Smooth ease in/out — for motion that should not look mechanical. */
export const ease = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

/** Wrap t into a 0→1→0 triangle, for back-and-forth motion. */
export const pingPong = (t) => (t < 0.5 ? t * 2 : 2 - t * 2);

/** Stagger helper: offset t per index so a group of ions does not move in lockstep. */
export function staggered(t, index, count, spread = 0.35) {
  const off = (index / Math.max(count, 1)) * spread;
  return (t + off) % 1;
}
