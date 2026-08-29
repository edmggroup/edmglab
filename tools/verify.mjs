/**
 * EDMGLAB — final sweep.
 *   · every route renders with no console error and no page error
 *   · every sidebar link lands on a real view, not the placeholder
 *   · the data health check reports zero errors
 *   · charts actually draw
 *   · the sidebar fits at five widths without scrolling (navfit)
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:8000/';
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const browser = await chromium.launch({ executablePath: EXE });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

const errors = [];
let route = 'boot';
page.on('console', (m) => { if (m.type() === 'error') errors.push(`${route}: ${m.text().slice(0, 180)}`); });
page.on('pageerror', (e) => errors.push(`${route}: PAGEERROR ${e.message.slice(0, 180)}`));

await page.goto(BASE, { waitUntil: 'load' });
await page.waitForTimeout(1500);

const seen = new Set(); const queue = ['#/'];
for (const h of await page.$$eval('a[href^="#/"]', (as) => as.map((a) => a.getAttribute('href')))) queue.push(h);
const thin = [];
let canvases = 0, drawn = 0;

while (queue.length) {
  const hash = queue.shift().split('?')[0];
  if (seen.has(hash)) continue;
  seen.add(hash); route = hash;
  await page.evaluate((h) => { location.hash = h.slice(1); }, hash);
  await page.waitForTimeout(520);
  const st = await page.evaluate(() => {
    const el = document.getElementById('view-outlet');
    const txt = (el?.textContent || '').trim();
    const cs = [...document.querySelectorAll('#view-outlet canvas')];
    return {
      len: txt.length,
      placeholder: /roadmap phase|not built yet|coming in phase/i.test(txt),
      head: txt.slice(0, 70),
      canvases: cs.length,
      drawn: cs.filter((c) => c.width > 10 && c.height > 10).length
    };
  });
  canvases += st.canvases; drawn += st.drawn;
  if (st.len < 60) thin.push(`${hash} (${st.len} chars) "${st.head}"`);
  for (const h of await page.$$eval('a[href^="#/"]', (as) => as.map((a) => a.getAttribute('href')))) {
    if (!seen.has(h.split('?')[0])) queue.push(h);
  }
}

/* Sidebar links must never land on the placeholder — except materials (P7),
   which is honestly unbuilt and says so. */
route = 'sidebar sweep';
const sidebarLinks = await page.$$eval('.app-sidebar a[href^="#/"]', (as) => as.map((a) => a.getAttribute('href')));
const placeholders = [];
for (const h of [...new Set(sidebarLinks)]) {
  route = h;
  await page.evaluate((x) => { location.hash = x.slice(1); }, h);
  await page.waitForTimeout(420);
  const ph = await page.evaluate(() =>
    /roadmap phase|not built yet|coming in phase/i.test(document.getElementById('view-outlet').textContent));
  if (ph) placeholders.push(h);
}

/* Health check */
route = '#/health';
await page.evaluate(() => { location.hash = '/health'; });
await page.waitForTimeout(4500);
const health = await page.evaluate(() => {
  const nums = [...document.querySelectorAll('.health-stat')].map((s) => ({
    n: s.querySelector('.hs-num')?.textContent.trim(),
    l: s.querySelector('.hs-lbl')?.textContent.trim()
  }));
  const off = document.querySelector('#offline-body');
  return { nums, offline: off ? off.textContent.replace(/\s+/g, ' ').trim().slice(0, 260) : 'absent' };
});

/* navfit — the sidebar must show every module without scrolling */
const navfit = [];
for (const w of [1024, 1180, 1280, 1440, 1680]) {
  await page.setViewportSize({ width: w, height: 720 });
  await page.evaluate(() => { location.hash = '/'; });
  await page.waitForTimeout(320);
  navfit.push(await page.evaluate((width) => {
    const sb = document.querySelector('.app-sidebar');
    return `${width}px: ${sb.scrollHeight <= sb.clientHeight + 2 ? 'fits' : `SCROLLS ${sb.scrollHeight}>${sb.clientHeight}`}`;
  }, w));
}

console.log(`routes            : ${seen.size}`);
console.log(`thin/empty views  : ${thin.length}`);
thin.slice(0, 10).forEach((x) => console.log('  ✗', x));
console.log(`sidebar → placeholder: ${placeholders.length ? placeholders.join(', ') : 'none'}`);
console.log(`chart canvases    : ${drawn}/${canvases} drawn`);
console.log(`console errors    : ${new Set(errors).size}`);
[...new Set(errors)].slice(0, 15).forEach((x) => console.log('  !', x));
console.log('health            :', health.nums.map((s) => `${s.n} ${s.l}`).join(' · '));
console.log('offline panel     :', health.offline);
console.log('navfit            :', navfit.join(' | '));

await browser.close();
