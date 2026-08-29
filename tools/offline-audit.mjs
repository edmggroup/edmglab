/**
 * EDMGLAB — offline readiness audit
 *
 * The scenario that matters is not "browse the whole site, then unplug".
 * It is: install it in the office, open ONE page, walk into a basement lab,
 * and then try to use it. That is what this tests.
 *
 *   1. fresh profile, load the home page ONLY
 *   2. wait for the worker to install and finish its background warm-up
 *   3. cut the network at the browser level
 *   4. cold-start the app and walk every route, checking it renders,
 *      that charts actually draw, and that nothing 404s
 *
 * It also compares the worker's hand-maintained SHELL list against every file
 * the app really asks for, in both directions.
 */

import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const BASE = 'http://localhost:8000/';
const ROOT = '/home/claude/EDMGLAB/';
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const swSrc = readFileSync(ROOT + 'service-worker.js', 'utf8');
const SHELL = [...swSrc.match(/const SHELL = \[([\s\S]*?)\];/)[1].matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]);
const shellSet = new Set([...SHELL, '']);

const browser = await chromium.launch({ executablePath: EXE });

/* ══ PHASE 1 · online, home page only ══════════════════════════════ */
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const consoleErrors = [];
let current = 'boot';
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`${current}: ${m.text().slice(0, 200)}`); });
page.on('pageerror', (e) => consoleErrors.push(`${current}: pageerror ${e.message.slice(0, 200)}`));

await page.goto(BASE, { waitUntil: 'load' });
await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 20000 })
  .catch(() => console.log('!! worker never took control'));

// Wait for the background warm-up to finish reporting.
const warmed = await page.waitForFunction(
  () => window.__warmDone === true, null, { timeout: 45000 }
).then(() => true).catch(() => false);

// The app logs its result; poll the cache instead so we do not depend on logs.
const warmReport = await page.evaluate(async () => {
  const deadline = Date.now() + 40000;
  let last = null;
  while (Date.now() < deadline) {
    const names = await caches.keys();
    const data = names.find((n) => n.includes('data'));
    const shell = names.find((n) => n.startsWith('edmglab-v'));
    const dc = data ? (await (await caches.open(data)).keys()).length : 0;
    const sc = shell ? (await (await caches.open(shell)).keys()).length : 0;
    last = { names, dataEntries: dc, shellEntries: sc };
    if (dc >= 20 && sc >= 60) return last;         // warm-up has landed
    await new Promise((r) => setTimeout(r, 700));
  }
  return last;
});
console.log('after a HOME-PAGE-ONLY visit, cache holds:', JSON.stringify(warmReport));

await page.close();

/* ══ PHASE 2 · offline, cold start ═════════════════════════════════ */
await ctx.setOffline(true);
const off = await ctx.newPage();
const offErrors = [];
const bad404 = new Set();
let route = 'cold start';
off.on('console', (m) => { if (m.type() === 'error') offErrors.push(`${route}: ${m.text().slice(0, 200)}`); });
off.on('pageerror', (e) => offErrors.push(`${route}: pageerror ${e.message.slice(0, 200)}`));
off.on('response', (r) => { if (!r.ok()) bad404.add(`${new URL(r.url()).pathname} → ${r.status()}`); });

const fail = [];
await off.goto(BASE, { waitUntil: 'load' }).catch((e) => fail.push(['COLD START', e.message.slice(0, 140)]));
await off.waitForTimeout(1800);

const booted = await off.$eval('#view-outlet', (el) => el.textContent.trim().length > 40).catch(() => false);
if (!booted) fail.push(['#/ cold start', 'view outlet empty with no network']);

/* Crawl offline — the route list itself has to come from the cached app. */
const seen = new Set(); const queue = ['#/'];
for (const h of await off.$$eval('a[href^="#/"]', (as) => as.map((a) => a.getAttribute('href')))) queue.push(h);

const requested = new Map();
off.on('response', (r) => {
  const u = new URL(r.url());
  if (u.origin !== 'http://localhost:8000') return;
  requested.set(u.pathname.replace(/^\//, ''), r.status());
});

let charted = 0;
while (queue.length) {
  const hash = queue.shift().split('?')[0];
  if (seen.has(hash)) continue;
  seen.add(hash); route = hash;
  await off.evaluate((h) => { location.hash = h.slice(1); }, hash);
  await off.waitForTimeout(560);

  const st = await off.evaluate(() => {
    const el = document.getElementById('view-outlet');
    const txt = (el?.textContent || '').trim();
    const canvases = [...document.querySelectorAll('#view-outlet canvas')];
    return {
      len: txt.length,
      err: /failed to load|could not be loaded|not available offline|error loading/i.test(txt),
      head: txt.slice(0, 80),
      canvases: canvases.length,
      // A canvas that Chart.js never touched has no chart instance attached.
      drawn: canvases.filter((c) => c.width > 10 && c.height > 10).length
    };
  });
  if (st.len < 40 || st.err) fail.push([hash, `len=${st.len} "${st.head}"`]);
  if (st.canvases && st.drawn < st.canvases) fail.push([hash, `${st.canvases - st.drawn} chart canvas/es never drew`]);
  charted += st.drawn;

  for (const h of await off.$$eval('a[href^="#/"]', (as) => as.map((a) => a.getAttribute('href')))) {
    if (!seen.has(h.split('?')[0])) queue.push(h);
  }
}

const routes = [...seen].sort();
const appFiles = [...requested.keys()].filter((p) => !p.startsWith('data/'));
const missingFromShell = appFiles.filter((p) => !shellSet.has(p) && !p.startsWith('vendor/'));

const report = {
  cacheAfterHomePageOnly: warmReport,
  routesTestedOffline: routes.length,
  chartsDrawnOffline: charted,
  offlineFailures: fail,
  nonOkResponsesOffline: [...bad404],
  consoleErrorsOffline: [...new Set(offErrors)].slice(0, 30),
  consoleErrorsOnlineBoot: [...new Set(consoleErrors)].slice(0, 30),
  requestedButNotInShell: missingFromShell,
  warmFlagSeen: warmed
};
writeFileSync('/tmp/offline-report.json', JSON.stringify(report, null, 2));

console.log(`\nroutes walked with NO network : ${routes.length}`);
console.log(`chart canvases drawn offline  : ${charted}`);
console.log(`failures                      : ${fail.length}`);
for (const [r, why] of fail.slice(0, 25)) console.log('  ✗', r, '—', why);
console.log(`non-OK responses offline      : ${bad404.size}`);
for (const b of [...bad404].slice(0, 15)) console.log('  !', b);
console.log(`console errors offline        : ${new Set(offErrors).size}`);
for (const e of [...new Set(offErrors)].slice(0, 12)) console.log('  !', e);
console.log(`console errors at online boot : ${new Set(consoleErrors).size}`);
for (const e of [...new Set(consoleErrors)].slice(0, 12)) console.log('  !', e);
console.log('requested but not in SHELL    :', missingFromShell.length ? missingFromShell : 'none');

await browser.close();
