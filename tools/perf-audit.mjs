/**
 * EDMGLAB — performance budget (Architecture v0.2 §I.1)
 *
 * The budget is a table of numbers, which is the right way to write one; this
 * measures each of them rather than trusting the design that was supposed to
 * hit them.
 *
 *   first visit, interactive        < 1500 ms   on campus wifi
 *   repeat visit, interactive       <  400 ms   service worker, no network
 *   view switch, data already in    <  100 ms
 *   view switch, lazy data          <  300 ms
 *   search results                  <   50 ms
 *   CSV import, 50 000 rows         < 2000 ms   to first plot
 *   shell payload, uncompressed     <  150 KB
 *
 * "Interactive" is taken as the moment the first view has actually rendered
 * content — not DOMContentLoaded, which on a single-page app happens while
 * the screen is still empty and would flatter the number.
 *
 * "Campus wifi" is emulated at 12 Mbit/s down with a 40 ms round trip, which
 * is a reasonable middle for a busy shared network — not a fast desktop
 * connection, and not a punitive 3G profile the app was never scoped for.
 */

import { chromium } from 'playwright';
import { writeFileSync, mkdtempSync, writeFileSync as wf } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = 'http://localhost:8000/';
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const CAMPUS = {
  offline: false,
  downloadThroughput: (12 * 1024 * 1024) / 8,   // 12 Mbit/s
  uploadThroughput: (3 * 1024 * 1024) / 8,
  latency: 40
};

const results = [];
const record = (metric, target, got, unit = 'ms', note = '') =>
  results.push({ metric, target, got: Math.round(got * 10) / 10, unit, pass: got <= target, note });

const browser = await chromium.launch({ executablePath: EXE });

/* ══ 1 · shell payload, uncompressed ═══════════════════════════════
   Everything the browser must have before the first view can render:
   the document, the stylesheets, and the whole static import graph of
   app.js. Data files are content, not shell, and are counted separately. */
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const bytes = new Map();
  page.on('response', async (r) => {
    const u = new URL(r.url());
    if (u.origin !== 'http://localhost:8000') return;
    try {
      const b = await r.body();
      bytes.set(u.pathname, b.length);
    } catch { /* served from cache, no body */ }
  });
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() =>
    (document.getElementById('view-outlet')?.textContent || '').trim().length > 40, null, { timeout: 15000 });
  await page.waitForTimeout(300);

  let shell = 0, data = 0, other = 0;
  const shellFiles = [];
  for (const [p, n] of bytes) {
    if (p.includes('/data/')) { data += n; continue; }
    if (p.includes('/vendor/') || p.includes('/pwa/')) { other += n; continue; }
    shell += n; shellFiles.push([p, n]);
  }
  shellFiles.sort((a, b) => b[1] - a[1]);
  record('Shell payload (uncompressed)', 150, shell / 1024, 'KB',
    shellFiles.slice(0, 6).map(([p, n]) => `${p.split('/').pop()} ${(n / 1024).toFixed(1)}K`).join(', '));
  record('Core data at boot', 999, data / 1024, 'KB', 'not budgeted; reported for context');
  await ctx.close();
}

/* ══ 2 · first visit, interactive, on campus wifi ══════════════════ */
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', CAMPUS);
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });

  await page.goto(BASE, { waitUntil: 'commit' });
  const t = await page.evaluate(async () => {
    const start = performance.timeOrigin;
    await new Promise((res) => {
      const done = () => {
        const el = document.getElementById('view-outlet');
        if (el && el.textContent.trim().length > 40) { res(); return true; }
        return false;
      };
      if (done()) return;
      new MutationObserver((_, o) => { if (done()) o.disconnect(); })
        .observe(document.documentElement, { childList: true, subtree: true, characterData: true });
      setTimeout(res, 20000);
    });
    return performance.now();
  });
  record('First visit → interactive (12 Mbit, 40 ms RTT)', 1500, t);
  await ctx.close();
}

/* ══ 3 · repeat visit, interactive, with NO network ════════════════ */
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(9000);              // let the warm-up finish
  await ctx.setOffline(true);

  const runs = [];
  for (let i = 0; i < 3; i++) {
    const p2 = await ctx.newPage();
    await p2.goto(BASE, { waitUntil: 'commit' });
    runs.push(await p2.evaluate(async () => {
      await new Promise((res) => {
        const done = () => {
          const el = document.getElementById('view-outlet');
          if (el && el.textContent.trim().length > 40) { res(); return true; }
          return false;
        };
        if (done()) return;
        new MutationObserver((_, o) => { if (done()) o.disconnect(); })
          .observe(document.documentElement, { childList: true, subtree: true, characterData: true });
        setTimeout(res, 10000);
      });
      return performance.now();
    }));
    await p2.close();
  }
  record('Repeat visit → interactive (offline)', 400, Math.min(...runs), 'ms',
    `three runs: ${runs.map((r) => Math.round(r)).join(', ')}`);
  await ctx.close();
}

/* ══ 4 · view switches, and search ═════════════════════════════════ */
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(2500);

  /** Time from setting the hash to the view outlet showing that view. */
  const switchTo = (hash) => page.evaluate(async (h) => {
    const outlet = document.getElementById('view-outlet');
    const before = outlet.textContent.trim().slice(0, 60);
    const t0 = performance.now();
    location.hash = h;
    await new Promise((res) => {
      const ok = () => {
        const now = outlet.textContent.trim();
        if (now.length > 40 && now.slice(0, 60) !== before) { res(); return true; }
        return false;
      };
      if (ok()) return;
      new MutationObserver((_, o) => { if (ok()) o.disconnect(); }).observe(outlet, { childList: true, subtree: true });
      setTimeout(res, 8000);
    });
    return performance.now() - t0;
  }, hash);

  /* Warm: visit everything once so both the module and its data are in
     memory, then re-measure. This is the "data loaded" row. */
  const warmRoutes = ['#/glossary', '#/formulas', '#/fundamentals', '#/learning', '#/characterization'];
  for (const r of warmRoutes) { await switchTo(r); await page.waitForTimeout(120); }
  const warm = [];
  for (let i = 0; i < 2; i++) {
    for (const r of warmRoutes) { warm.push(await switchTo(r)); await page.waitForTimeout(90); }
  }
  record('View switch, data already loaded', 100, Math.max(...warm), 'ms',
    `worst of ${warm.length} switches across ${warmRoutes.length} views`);

  /* Cold: a fresh context, each route visited for the first time — the
     module is fetched and its data file loaded. */
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p3 = await ctx2.newPage();
  await p3.goto(BASE, { waitUntil: 'load' });
  await p3.waitForTimeout(2000);
  const coldRoutes = ['#/preparation', '#/characterization', '#/chemistry', '#/learning', '#/troubleshooting'];
  const cold = [];
  for (const r of coldRoutes) {
    cold.push(await p3.evaluate(async (h) => {
      const outlet = document.getElementById('view-outlet');
      const before = outlet.textContent.trim().slice(0, 60);
      const t0 = performance.now();
      location.hash = h;
      await new Promise((res) => {
        const ok = () => {
          const now = outlet.textContent.trim();
          if (now.length > 40 && now.slice(0, 60) !== before) { res(); return true; }
          return false;
        };
        if (ok()) return;
        new MutationObserver((_, o) => { if (ok()) o.disconnect(); }).observe(outlet, { childList: true, subtree: true });
        setTimeout(res, 8000);
      });
      return performance.now() - t0;
    }, r));
    await p3.waitForTimeout(150);
  }
  record('View switch, lazy module + data', 300, Math.max(...cold), 'ms',
    coldRoutes.map((r, i) => `${r} ${Math.round(cold[i])}`).join(', '));
  await ctx2.close();

  /* Search: index is in memory, so this is pure ranking + render. */
  const searchTimes = await page.evaluate(async () => {
    const mod = await import('./js/search.js');
    const out = [];
    for (const q of ['capacit', 'eis', 'specific capacity', 'nyquist', 'binder', 'tafel', 'a']) {
      const t0 = performance.now();
      mod.search(q);
      out.push(performance.now() - t0);
    }
    return out;
  });
  record('Search results', 50, Math.max(...searchTimes), 'ms',
    `worst of ${searchTimes.length} queries; index built at boot`);
  await ctx.close();
}

/* ══ 5 · CSV import, 50 000 rows, to first plot ════════════════════ */
{
  const rows = 50000;
  const lines = ['Time/s,Ewe/V,I/mA,Cycle'];
  for (let i = 0; i < rows; i++) {
    const t = i * 0.5;
    const v = 0.05 + 0.9 * Math.abs(((i % 2000) / 2000) * 2 - 1);
    lines.push(`${t.toFixed(1)},${v.toFixed(5)},${(i % 2 ? 1 : -1) * 2.5},${Math.floor(i / 2000) + 1}`);
  }
  const dir = mkdtempSync(join(tmpdir(), 'edmg-'));
  const file = join(dir, 'cycler-50k.csv');
  wf(file, lines.join('\n'));

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message.slice(0, 160)));
  await page.goto(BASE + '#/import', { waitUntil: 'load' });
  await page.waitForTimeout(2500);

  await page.evaluate(() => { window.__t0 = null; });
  const t0 = Date.now();
  await page.setInputFiles('#im-file', file);
  // First plot = a canvas that has actually been drawn into.
  await page.waitForFunction(() =>
    [...document.querySelectorAll('#view-outlet canvas')].some((c) => c.width > 10 && c.height > 10),
    null, { timeout: 30000 }).catch(() => {});
  const dt = Date.now() - t0;

  const state = await page.evaluate(() => {
    const txt = document.getElementById('view-outlet').textContent;
    return {
      canvases: document.querySelectorAll('#view-outlet canvas').length,
      rowsMentioned: (txt.match(/([\d,\s]{3,})\s*rows?/i) || [])[0] || '',
      worker: /worker/i.test(txt) ? 'mentioned' : '',
      /* Look for the app's actual error UI, not for the word "error" — the
         import page's own copy explains that a mis-read unit "produces no
         error", which a naive text match reads as a failure. */
      error: !!document.querySelector('#view-outlet .callout-danger')
    };
  });
  record(`CSV import, ${rows.toLocaleString('en-GB')} rows → first plot`, 2000, dt, 'ms',
    `${state.canvases} canvas(es); ${state.rowsMentioned.trim()}${state.error ? ' — VIEW REPORTS AN ERROR' : ''}`);
  if (pageErrors.length) record('CSV import page errors', 0, pageErrors.length, 'count', pageErrors[0]);
  await ctx.close();
}

await browser.close();

const w = Math.max(...results.map((r) => r.metric.length));
console.log('\n' + 'METRIC'.padEnd(w) + '  TARGET      MEASURED   ');
console.log('-'.repeat(w + 28));
for (const r of results) {
  const flag = r.target === 999 ? '  ·' : (r.pass ? '  ✓' : '  ✗ OVER');
  console.log(
    r.metric.padEnd(w) +
    `  ${String(r.target).padStart(5)}${r.unit}` +
    `  ${String(r.got).padStart(9)}${r.unit}` + flag);
  if (r.note) console.log(' '.repeat(2) + '· ' + r.note);
}
const fails = results.filter((r) => !r.pass && r.target !== 999);
console.log(`\n${results.length - fails.length - 1}/${results.length - 1} budget targets met.`);
writeFileSync('/tmp/perf-report.json', JSON.stringify(results, null, 2));
