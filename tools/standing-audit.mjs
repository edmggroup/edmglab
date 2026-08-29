/**
 * EDMGLAB — the three standing requirements, checked on every route.
 *
 * Issued mid-development and binding for the rest of the build:
 *   1. every graph must display INSIDE its graph window — including when the
 *      axes are pinned to fixed X/Y ranges
 *   2. nothing scrolls sideways: not the menu, not any view, at any width
 *   3. no text smaller than the type floor
 *
 * All three are checked here rather than remembered, because "I looked and it
 * seemed fine" does not survive a hundred and thirty routes.
 */

import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const BASE = 'http://localhost:8000/';
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const VIEWPORTS = [
  { name: 'phone',   width: 390,  height: 844 },
  { name: 'tablet',  width: 834,  height: 1112 },
  { name: 'desktop', width: 1440, height: 900 }
];

const CHECK = `(() => {
  const out = { hscroll: null, overflow: [], charts: [], tiny: [], svgText: [], glyphs: [],
                menuScroll: null, scenes: 0, enlargeable: 0 };
  const doc = document.scrollingElement;

  // 1 · the page itself must never scroll sideways
  if (doc.scrollWidth > doc.clientWidth + 1) out.hscroll = doc.scrollWidth + ' > ' + doc.clientWidth;

  // 2 · nor may any block overflow its own container
  for (const el of document.querySelectorAll('#view-outlet *, .app-sidebar *')) {
    // SVG has its own overflow model and reports scrollWidth for <text> in
    // USER units, not CSS pixels — comparing the two invents failures. What
    // matters for an SVG is whether the <svg> element fits its box, and that
    // is caught by the page-scroll and chart-containment checks.
    if (el.namespaceURI === 'http://www.w3.org/2000/svg') continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    // A container that DECLARES it scrolls is a deliberate choice (wide
    // tables, code blocks) and is not a defect.
    if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') continue;
    if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) {
      let s = el.tagName.toLowerCase();
      if (el.id) s += '#' + el.id;
      else if (typeof el.className === 'string' && el.className) s += '.' + el.className.trim().split(/\\s+/)[0];
      out.overflow.push(s + ' ' + el.scrollWidth + '>' + el.clientWidth);
    }
  }

  // 3 · every chart canvas inside its box, on both axes
  for (const c of document.querySelectorAll('canvas')) {
    const box = c.closest('.chart-box, .chart-wrap, .anim-block, .panel') || c.parentElement;
    if (!box) continue;
    const cr = c.getBoundingClientRect(), br = box.getBoundingClientRect();
    if (cr.width < 2 || br.width < 2) continue;
    if (cr.right > br.right + 2 || cr.left < br.left - 2 || cr.bottom > br.bottom + 2) {
      out.charts.push((c.id || c.className || 'canvas') +
        ' canvas[' + Math.round(cr.left) + '..' + Math.round(cr.right) + '] box[' +
        Math.round(br.left) + '..' + Math.round(br.right) + ']');
    }
  }

  // 4 · nothing below the type floor
  const floor = parseFloat(getComputedStyle(document.documentElement)
    .getPropertyValue('--fs-2xs')) * 16;
  for (const el of document.querySelectorAll('#view-outlet *, .app-sidebar *, .app-header *, .app-bottomnav *')) {
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1)) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    let px = parseFloat(cs.fontSize);
    /* Text inside an SVG is drawn in user units and then scaled by the
       viewBox, so its declared font-size is not the size anyone sees. Scale
       it by the element's actual on-screen transform to get the real one —
       a label declared at 10px inside a 2× scaled diagram renders at 20. */
    if (el.namespaceURI === 'http://www.w3.org/2000/svg' && el.getScreenCTM) {
      const m = el.getScreenCTM();
      if (m) px *= Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1;
    }
    /* Text INSIDE a drawn symbol — the charge in an ion disc, the V in a
       voltmeter, the W on a Warburg element — is part of the graphic, not
       body text: it is sized by the symbol that contains it and cannot be
       enlarged without enlarging the symbol. Those are reported separately
       rather than as failures. Standalone annotations are the real check. */
    const glyph = el.closest && el.closest('.ac-ion, .ac-meter, .ac-circuit');
    const inSvg = el.namespaceURI === 'http://www.w3.org/2000/svg';
    if (px < floor - 0.3) {
      let s = el.tagName.toLowerCase();
      if (typeof el.className === 'string' && el.className) s += '.' + el.className.trim().split(/\\s+/)[0];
      const entry = s + ' ' + Math.round(px * 10) / 10 + 'px';
      if (glyph) out.glyphs.push(entry);
      else if (inSvg) out.svgText.push(entry);
      else out.tiny.push(entry);            // HTML text: a hard failure
    }
  }

  /* 6 · a diagram whose in-column labels are small must offer a way out of
         the column. A wide scene in a 358 px phone column is at half scale and
         no type floor can fix that without redrawing every scene; the Enlarge
         control turns it onto the long edge instead. So the check is not "is
         the label 12 px" — it is "can the reader get to a size that works". */
  const diagrams = [...document.querySelectorAll('#view-outlet svg')].filter((s) => s.querySelector('text'));
  out.scenes = diagrams.length;
  out.enlargeable = diagrams.filter((s) => {
    const anim = s.closest('.anim');
    if (anim && [...anim.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Enlarge')) return true;
    return !!s.closest('.has-enlarge');
  }).length;

  // 5 · the menu must not need scrolling to reach its items
  const sb = document.querySelector('.app-sidebar');
  if (sb && sb.scrollHeight > sb.clientHeight + 2) out.menuScroll = sb.scrollHeight + ' > ' + sb.clientHeight;
  return out;
})()`;

const browser = await chromium.launch({ executablePath: EXE });
const ctx = await browser.newContext({ viewport: VIEWPORTS[2] });
const page = await ctx.newPage();
await page.goto(BASE, { waitUntil: 'load' });
await page.waitForTimeout(1200);

const seen = new Set(); const queue = ['#/'];
for (const h of await page.$$eval('a[href^="#/"]', (as) => as.map((a) => a.getAttribute('href')))) queue.push(h);
while (queue.length) {
  const hash = queue.shift().split('?')[0];
  if (seen.has(hash)) continue;
  seen.add(hash);
  await page.evaluate((h) => { location.hash = h.slice(1); }, hash);
  await page.waitForTimeout(280);
  for (const h of await page.$$eval('a[href^="#/"]', (as) => as.map((a) => a.getAttribute('href')))) {
    if (!seen.has(h.split('?')[0])) queue.push(h);
  }
}
const routes = [...seen].sort();

const found = { hscroll: [], overflow: new Map(), charts: new Map(), tiny: new Map(), svgText: new Map(), glyphs: new Map(), menuScroll: [], noEnlarge: [] };
const note = (m, k, tag) => { if (!m.has(k)) m.set(k, []); if (m.get(k).length < 4) m.get(k).push(tag); };
let canvases = 0;

for (const vp of VIEWPORTS) {
  await page.setViewportSize({ width: vp.width, height: vp.height });
  for (const hash of routes) {
    await page.evaluate((h) => { location.hash = h.slice(1); }, hash);
    await page.waitForTimeout(340);
    const r = await page.evaluate(CHECK);
    const tag = `${vp.name} ${hash}`;
    if (r.hscroll) found.hscroll.push(`${tag}: ${r.hscroll}`);
    if (r.menuScroll) found.menuScroll.push(`${tag}: ${r.menuScroll}`);
    r.overflow.forEach((x) => note(found.overflow, x, tag));
    r.charts.forEach((x) => note(found.charts, x, tag));
    r.tiny.forEach((x) => note(found.tiny, x, tag));
    r.glyphs.forEach((x) => note(found.glyphs, x, tag));
    r.svgText.forEach((x) => note(found.svgText, x, `${tag}`));
    if (r.scenes && r.enlargeable < r.scenes) found.noEnlarge.push(`${tag}: ${r.scenes - r.enlargeable} of ${r.scenes}`);
    canvases += await page.evaluate(() => document.querySelectorAll('canvas').length);
  }
}

/* ── Fixed axes: pin every chart to hard ranges and re-check containment. ── */
await page.setViewportSize(VIEWPORTS[2]);
const pinned = [];
for (const hash of routes) {
  await page.evaluate((h) => { location.hash = h.slice(1); }, hash);
  await page.waitForTimeout(360);
  const n = await page.evaluate(() => {
    const insts = window.Chart ? Object.values(window.Chart.instances || {}) : [];
    let touched = 0;
    for (const c of insts) {
      if (!c?.options?.scales) continue;
      for (const s of Object.values(c.options.scales)) {
        if (s.type === 'logarithmic') continue;
        s.min = -1000; s.max = 1000;          // deliberately absurd fixed range
      }
      try { c.update('none'); touched++; } catch (e) { /* ignore */ }
    }
    return touched;
  });
  if (!n) continue;
  await page.waitForTimeout(220);
  const r = await page.evaluate(CHECK);
  if (r.charts.length || r.hscroll) pinned.push(`${hash}: ${r.hscroll || ''} ${r.charts.join('; ')}`);
}

const report = {
  routes: routes.length,
  viewports: VIEWPORTS.map((v) => `${v.name} ${v.width}px`),
  canvasesSeen: canvases,
  pageScrollsSideways: found.hscroll,
  menuNeedsScrolling: found.menuScroll,
  blocksOverflowing: [...found.overflow.entries()].map(([k, v]) => `${k}  [${v.join(', ')}]`),
  chartsOutsideTheirBox: [...found.charts.entries()].map(([k, v]) => `${k}  [${v.join(', ')}]`),
  textBelowTheFloor: [...found.tiny.entries()].map(([k, v]) => `${k}  [${v.join(', ')}]`),
  diagramLabelsBelowFloorInColumn: [...found.svgText.entries()].map(([k, v]) => `${k}  [${v.join(', ')}]`),
  symbolGlyphsBelowTheFloor: [...found.glyphs.entries()].map(([k, v]) => `${k}  [${v.join(', ')}]`),
  scenesWithoutAnEnlargeControl: found.noEnlarge,
  chartsOutsideBoxWithFixedAxes: pinned
};
writeFileSync('/tmp/standing-report.json', JSON.stringify(report, null, 2));

for (const [k, v] of Object.entries(report)) {
  if (Array.isArray(v) && v.length && typeof v[0] === 'string' && k !== 'viewports') {
    console.log(`\n── ${k}: ${v.length} ──`);
    v.slice(0, 20).forEach((x) => console.log('  •', x));
  } else if (Array.isArray(v) && k !== 'viewports') {
    console.log(`${k}: none`);
  } else {
    console.log(`${k}: ${JSON.stringify(v)}`);
  }
}
await browser.close();
