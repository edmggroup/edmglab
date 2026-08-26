/**
 * EDMGLAB — Chart layer
 * (Instrumentation spec §8, §32 · Architecture v0.2 §I.2 · Integration report §6.10)
 *
 * A thin wrapper over Chart.js. Every plot in EDMGLAB goes through here, so
 * axis conventions, theming, zoom/pan/inspect/reset and the simulated-data
 * treatment are consistent everywhere and defined once.
 *
 * Loading: Chart.js and the zoom plugin are SELF-HOSTED in /vendor/ and
 * loaded on first use, never at boot. Reasons (Architecture §I.2): a campus
 * network's route to an international CDN is often slower than to our own
 * origin; the app then works offline from the very first load; and there is
 * no third-party availability or DNS dependency. A student who only reads
 * concept pages never downloads ~220 KB of charting code.
 */

import { esc } from '../ui.js';

/* ── Lazy vendor loading ─────────────────────────────────── */

let loadPromise = null;

function injectScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = false;             // preserve execution order
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

/** Load Chart.js + zoom plugin once. Safe to call repeatedly. */
export function ensureCharts() {
  if (loadPromise) return loadPromise;
  const base = new URL('../../vendor/', import.meta.url).href;
  loadPromise = (async () => {
    await injectScript(base + 'hammer.min.js');           // touch pinch/pan
    await injectScript(base + 'chart.umd.min.js');
    await injectScript(base + 'chartjs-plugin-zoom.min.js');
    if (window.Chart && window.ChartZoom) window.Chart.register(window.ChartZoom);
    applyGlobalDefaults();
    return window.Chart;
  })();
  return loadPromise;
}

/* ── Theming ─────────────────────────────────────────────── */

function tok(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function palette() {
  return {
    text:   tok('--text-2', '#a3b1c0'),
    muted:  tok('--text-muted', '#74828f'),
    grid:   tok('--grid', '#232a34'),
    border: tok('--border', '#2b333e'),
    surface:tok('--surface', '#161a21'),
    series: [1, 2, 3, 4, 5, 6].map((i) => tok(`--series-${i}`, '#4fb3c9'))
  };
}

function applyGlobalDefaults() {
  const C = window.Chart;
  if (!C) return;
  const p = palette();
  C.defaults.font.family = tok('--font-ui', 'system-ui, sans-serif');
  C.defaults.font.size = 12;
  C.defaults.color = p.text;
  C.defaults.borderColor = p.grid;
  C.defaults.animation = { duration: 220 };
  C.defaults.plugins.legend.labels.boxWidth = 12;
  C.defaults.plugins.legend.labels.boxHeight = 12;
  C.defaults.plugins.legend.labels.usePointStyle = true;
}

const registry = new Set();

/** Re-theme every live chart. Called by app.js when the theme toggles. */
export function retheme() {
  if (!window.Chart) return;
  applyGlobalDefaults();
  const p = palette();
  for (const ch of registry) {
    for (const axis of Object.values(ch.options.scales || {})) {
      if (axis.grid)  axis.grid.color = p.grid;
      if (axis.ticks) axis.ticks.color = p.muted;
      if (axis.title) axis.title.color = p.text;
    }
    ch.update('none');
  }
}

/* ── Chart card ──────────────────────────────────────────── */

/**
 * Create a titled chart card with zoom / pan / reset controls.
 *
 * @param {HTMLElement} container
 * @param {object} o
 * @param {string} o.title
 * @param {string} o.xLabel
 * @param {string} o.yLabel
 * @param {Array}  o.datasets  [{label, data:[{x,y}], color?, showLine?, pointRadius?}]
 * @param {boolean}[o.equalAspect]  true for Nyquist plots — see note below
 * @param {string} [o.hint]
 * @param {boolean}[o.xReverse]  e.g. Bode plots drawn high→low frequency
 * @param {boolean}[o.logX]
 * @returns {Promise<{chart, destroy}>}
 */
export async function chartCard(container, o) {
  const Chart = await ensureCharts();
  const p = palette();

  const card = document.createElement('div');
  card.className = 'chart-card';
  card.innerHTML = `
    <div class="chart-head">
      <span>${esc(o.title || 'Plot')}</span>
      <span class="spacer"></span>
      <button type="button" class="btn btn-sm" data-act="reset">Reset view</button>
    </div>
    <div class="chart-canvas-wrap"><canvas></canvas></div>
    <div class="chart-hint">${esc(o.hint || 'Scroll or pinch to zoom · drag to pan · hover a point to read its value')}</div>`;
  container.appendChild(card);

  const canvas = card.querySelector('canvas');

  const datasets = (o.datasets || []).map((d, i) => ({
    label: d.label || `Series ${i + 1}`,
    data: d.data || [],
    borderColor: d.color || p.series[i % p.series.length],
    backgroundColor: d.color || p.series[i % p.series.length],
    showLine: d.showLine !== false,
    pointRadius: d.pointRadius ?? 0,
    pointHoverRadius: 4,
    borderWidth: d.borderWidth ?? 2,
    tension: d.tension ?? 0,
    borderDash: d.dashed ? [5, 4] : undefined
  }));

  const scaleBase = (label, extra = {}) => ({
    type: extra.type || 'linear',
    title: { display: !!label, text: label, color: p.text, font: { size: 12 } },
    grid: { color: p.grid, drawTicks: false },
    ticks: { color: p.muted, padding: 6 },
    border: { color: p.border },
    ...extra
  });

  const chart = new Chart(canvas, {
    type: 'scatter',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      parsing: false,           // data is already {x,y} — skip Chart.js parsing for speed
      normalized: true,
      interaction: { mode: 'nearest', intersect: false, axis: 'xy' },
      scales: {
        x: scaleBase(o.xLabel, {
          type: o.logX ? 'logarithmic' : 'linear',
          reverse: !!o.xReverse
        }),
        y: scaleBase(o.yLabel)
      },
      plugins: {
        legend: { display: datasets.length > 1, position: 'top', align: 'end' },
        tooltip: {
          backgroundColor: p.surface,
          borderColor: p.border,
          borderWidth: 1,
          titleColor: tok('--text', '#e6edf3'),
          bodyColor: p.text,
          padding: 10,
          displayColors: true,
          callbacks: {
            label: (ctx) => {
              const x = fmt(ctx.parsed.x), y = fmt(ctx.parsed.y);
              return `${ctx.dataset.label}:  ${x}, ${y}`;
            }
          }
        },
        zoom: {
          pan:  { enabled: true, mode: 'xy', modifierKey: null },
          zoom: {
            wheel: { enabled: true, speed: 0.08 },
            pinch: { enabled: true },
            mode: 'xy'
          },
          limits: { x: { minRange: 1e-9 }, y: { minRange: 1e-12 } }
        }
      }
    }
  });

  /* A Nyquist plot must have equal scaling on both axes: the semicircle is
     only a semicircle, and the 45° Warburg line only 45°, if one ohm on the
     real axis is the same length as one ohm on the imaginary axis. Chart.js
     will not do this on its own, so we match the ranges after layout. */
  if (o.equalAspect) equalizeAspect(chart);

  card.querySelector('[data-act="reset"]').addEventListener('click', () => {
    chart.resetZoom();
    if (o.equalAspect) equalizeAspect(chart);
  });

  registry.add(chart);

  return {
    chart,
    card,
    /** Replace all data without rebuilding the chart. */
    update(newDatasets) {
      chart.data.datasets.forEach((ds, i) => { ds.data = newDatasets[i]?.data || []; });
      chart.update('none');
      if (o.equalAspect) equalizeAspect(chart);
    },
    destroy() { registry.delete(chart); chart.destroy(); card.remove(); }
  };
}

function equalizeAspect(chart) {
  const xs = chart.scales.x, ys = chart.scales.y;
  if (!xs || !ys) return;
  const xr = xs.max - xs.min, yr = ys.max - ys.min;
  const pxRatio = chart.chartArea
    ? (chart.chartArea.right - chart.chartArea.left) / (chart.chartArea.bottom - chart.chartArea.top)
    : 1;
  const target = yr * pxRatio;
  if (Math.abs(xr - target) / Math.max(xr, target) < 0.02) return;
  if (xr < target) {
    const mid = (xs.max + xs.min) / 2;
    chart.options.scales.x.min = mid - target / 2;
    chart.options.scales.x.max = mid + target / 2;
  } else {
    const mid = (ys.max + ys.min) / 2;
    const ty = xr / pxRatio;
    chart.options.scales.y.min = mid - ty / 2;
    chart.options.scales.y.max = mid + ty / 2;
  }
  chart.update('none');
}

function fmt(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  const a = Math.abs(v);
  if (a !== 0 && (a < 1e-3 || a >= 1e5)) return v.toExponential(3);
  return Number(v.toFixed(4)).toString();
}

/* ── Downsampling ────────────────────────────────────────────
   Architecture §G.2: plots are downsampled, calculations are not.
   Rendering 200,000 points to a canvas is slow and visually pointless —
   no screen has that many pixels. This is Largest-Triangle-Three-Buckets,
   which preserves peaks and inflections that naive every-Nth sampling
   destroys — and losing a redox peak to a sampling shortcut would be a
   scientific error, not just a cosmetic one.

   Every CALCULATION still runs on the full dataset.
   ──────────────────────────────────────────────────────────── */

export function downsampleLTTB(data, threshold = 2000) {
  const n = data.length;
  if (threshold >= n || threshold <= 2) return data;

  const sampled = [data[0]];
  const every = (n - 2) / (threshold - 2);
  let a = 0;

  for (let i = 0; i < threshold - 2; i++) {
    const rangeStart = Math.floor((i + 1) * every) + 1;
    const rangeEnd = Math.min(Math.floor((i + 2) * every) + 1, n);

    // Average of the next bucket, used as the third triangle vertex.
    let avgX = 0, avgY = 0;
    const len = rangeEnd - rangeStart || 1;
    for (let j = rangeStart; j < rangeEnd; j++) { avgX += data[j].x; avgY += data[j].y; }
    avgX /= len; avgY /= len;

    const curStart = Math.floor(i * every) + 1;
    const curEnd = Math.floor((i + 1) * every) + 1;
    const ax = data[a].x, ay = data[a].y;

    let maxArea = -1, chosen = curStart;
    for (let j = curStart; j < curEnd && j < n; j++) {
      const area = Math.abs((ax - avgX) * (data[j].y - ay) - (ax - data[j].x) * (avgY - ay)) / 2;
      if (area > maxArea) { maxArea = area; chosen = j; }
    }
    sampled.push(data[chosen]);
    a = chosen;
  }

  sampled.push(data[n - 1]);
  return sampled;
}
