/**
 * EDMGLAB — accessibility audit
 *
 * Walks every route in both themes and checks the things that actually stop
 * someone using the platform:
 *
 *   · every control has an accessible name (an icon button with no label is
 *     announced as "button", which tells a screen-reader user nothing)
 *   · focus is visible on every focusable element
 *   · headings start at h1 and do not skip levels
 *   · every form control is associated with a label
 *   · text meets WCAG AA contrast against what is actually behind it
 *   · touch targets are at least 24×24 (WCAG 2.2 AA)
 *   · the drawer and the search overlay trap focus while open
 *
 * Contrast is computed from RESOLVED computed styles, not from the token file:
 * a token can be perfectly fine in isolation and fail once it lands on a card
 * that has its own background.
 */

import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const BASE = 'http://localhost:8000/';
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const IN_PAGE = `(() => {
  const out = { unnamed: [], focus: [], headings: [], labels: [], contrast: [], targets: [] };

  const vis = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
  };
  const sel = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    else if (el.className && typeof el.className === 'string') s += '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.');
    return s;
  };
  const name = (el) => (
    el.getAttribute('aria-label') ||
    (el.getAttribute('aria-labelledby') && document.getElementById(el.getAttribute('aria-labelledby'))?.textContent) ||
    el.textContent.trim() ||
    el.getAttribute('title') ||
    (el.tagName === 'INPUT' ? (el.getAttribute('placeholder') || '') : '')
  ).trim();

  /* ── 1 · accessible names + target size ── */
  for (const el of document.querySelectorAll('button, a[href], [role="button"], summary')) {
    if (!vis(el)) continue;
    if (!name(el)) out.unnamed.push(sel(el));
    const r = el.getBoundingClientRect();
    // Inline links inside a paragraph are exempt: WCAG 2.2 2.5.8 excludes
    // targets whose size is determined by the sentence they sit in.
    const inline = el.tagName === 'A' && getComputedStyle(el).display === 'inline';
    if (!inline && (r.width < 24 || r.height < 24)) {
      out.targets.push(sel(el) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
    }
  }

  /* ── 2 · form controls have labels ── */
  for (const el of document.querySelectorAll('input, select, textarea')) {
    if (!vis(el)) continue;
    if (el.type === 'hidden') continue;
    const byFor = el.id && document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
    const wrapped = el.closest('label');
    const aria = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby');
    if (!byFor && !wrapped && !aria) out.labels.push(sel(el) + ' [type=' + (el.type || '') + ']');
  }

  /* ── 3 · heading order ── */
  const hs = [...document.querySelectorAll('#view-outlet h1,#view-outlet h2,#view-outlet h3,#view-outlet h4,#view-outlet h5,#view-outlet h6')]
    .filter(vis).map((h) => +h.tagName[1]);
  const h1s = hs.filter((n) => n === 1).length;
  if (hs.length && h1s !== 1) out.headings.push('view has ' + h1s + ' h1 elements');
  for (let i = 1; i < hs.length; i++) if (hs[i] > hs[i - 1] + 1) out.headings.push('h' + hs[i - 1] + ' followed by h' + hs[i]);

  /* ── 4 · contrast ──
     Colours are resolved by PAINTING them: color-mix(), color(srgb …), oklch
     and relative colours all reach computed style in forms a regex gets
     wrong, and a wrong background silently invents failures. A 1×1 canvas is
     the browser's own parser.
     Translucent backgrounds are COMPOSITED rather than skipped — a 12% wash
     over a card is what the eye actually sees. */
  const _cv = document.createElement('canvas'); _cv.width = _cv.height = 1;
  const _c2 = _cv.getContext('2d', { willReadFrequently: true });
  _c2.globalCompositeOperation = 'copy';
  const parse = (str) => {
    if (!str) return null;
    try {
      _c2.fillStyle = '#000000';
      _c2.fillStyle = str;
      _c2.fillRect(0, 0, 1, 1);
      const d = _c2.getImageData(0, 0, 1, 1).data;
      return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
    } catch (e) { return null; }
  };
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1
  });
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const behind = (el) => {
    const layers = [];
    let n = el;
    while (n && n !== document.documentElement) {
      const bg = parse(getComputedStyle(n).backgroundColor);
      if (bg && bg.a > 0.004) {
        layers.push(bg);
        if (bg.a >= 0.999) break;
      }
      n = n.parentElement;
    }
    let base = parse(getComputedStyle(document.documentElement).backgroundColor);
    if (!base || base.a < 0.999) base = { r: 255, g: 255, b: 255, a: 1 };
    // Composite from the bottom layer upward.
    let acc = base;
    for (let i = layers.length - 1; i >= 0; i--) acc = over(layers[i], acc);
    return acc;
  };

  const seen = new Set();
  for (const el of document.querySelectorAll('#view-outlet *, .app-sidebar *, .app-header *, .app-bottomnav *')) {
    if (!vis(el)) continue;
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (!own) continue;
    const cs = getComputedStyle(el);
    let fg = parse(cs.color);
    if (!fg || fg.a < 0.06) continue;      // effectively invisible; not a contrast question
    const bg = behind(el);
    if (fg.a < 0.999) fg = over(fg, bg);   // translucent text really is lower contrast
    const px = parseFloat(cs.fontSize);
    const bold = (parseInt(cs.fontWeight, 10) || 400) >= 700;
    const large = px >= 24 || (px >= 18.66 && bold);
    const need = large ? 3 : 4.5;
    const got = ratio(fg, bg);
    const k = cs.color + '|' + Math.round(bg.r) + ',' + Math.round(bg.g) + ',' + Math.round(bg.b) + '|' + Math.round(px);
    if (seen.has(k)) continue;
    seen.add(k);
    if (got < need) {
      out.contrast.push({
        el: sel(el), fg: cs.color,
        bg: 'rgb(' + Math.round(bg.r) + ',' + Math.round(bg.g) + ',' + Math.round(bg.b) + ')',
        px: Math.round(px * 10) / 10, need, got: Math.round(got * 100) / 100,
        text: el.textContent.trim().slice(0, 45)
      });
    }
  }
  return out;
})()`;

const FOCUS_PROBE = `(() => {
  // Does the element show a visible focus indicator when focused?
  const bad = [];
  const all = [...document.querySelectorAll('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])')]
    .filter((el) => {
      if (el.disabled) return false;   // cannot receive focus, so cannot show a ring
      const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0;
    });
  for (const el of all.slice(0, 60)) {
    const before = getComputedStyle(el);
    const b = { o: before.outlineWidth + before.outlineStyle, s: before.boxShadow, bd: before.borderColor, bg: before.backgroundColor };
    el.focus();
    const a = getComputedStyle(el);
    const changed = (a.outlineWidth + a.outlineStyle) !== b.o || a.boxShadow !== b.s ||
                    a.borderColor !== b.bd || a.backgroundColor !== b.bg;
    const hasOutline = a.outlineStyle !== 'none' && parseFloat(a.outlineWidth) > 0;
    if (!changed && !hasOutline) {
      let s = el.tagName.toLowerCase();
      if (el.id) s += '#' + el.id;
      else if (typeof el.className === 'string' && el.className) s += '.' + el.className.trim().split(/\\s+/)[0];
      bad.push(s);
    }
    el.blur();
  }
  return bad;
})()`;

const browser = await chromium.launch({ executablePath: EXE });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
await page.goto(BASE, { waitUntil: 'load' });
await page.waitForTimeout(1200);

/* Crawl the route list once. */
const seen = new Set(); const queue = ['#/'];
for (const h of await page.$$eval('a[href^="#/"]', (as) => as.map((a) => a.getAttribute('href')))) queue.push(h);
while (queue.length) {
  const hash = queue.shift().split('?')[0];
  if (seen.has(hash)) continue;
  seen.add(hash);
  await page.evaluate((h) => { location.hash = h.slice(1); }, hash);
  await page.waitForTimeout(320);
  for (const h of await page.$$eval('a[href^="#/"]', (as) => as.map((a) => a.getAttribute('href')))) {
    if (!seen.has(h.split('?')[0])) queue.push(h);
  }
}
const routes = [...seen].sort();

const findings = { unnamed: new Map(), focus: new Map(), headings: new Map(), labels: new Map(), contrast: new Map(), targets: new Map() };
const add = (bucket, key, route) => {
  if (!findings[bucket].has(key)) findings[bucket].set(key, []);
  const list = findings[bucket].get(key);
  if (list.length < 4) list.push(route);
};

for (const theme of ['dark', 'light']) {
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
  for (const hash of routes) {
    await page.evaluate((h) => { location.hash = h.slice(1); }, hash);
    await page.waitForTimeout(300);
    const r = await page.evaluate(IN_PAGE);
    const tag = `${theme} ${hash}`;
    r.unnamed.forEach((x) => add('unnamed', x, tag));
    r.headings.forEach((x) => add('headings', x, tag));
    r.labels.forEach((x) => add('labels', x, tag));
    r.targets.forEach((x) => add('targets', x, tag));
    r.contrast.forEach((c) => add('contrast', `${c.el} ${c.px}px ${c.fg} on ${c.bg} = ${c.got} (need ${c.need}) "${c.text}"`, tag));
  }
}

/* Focus visibility — a sample of representative views is enough; the styles
   are global, so a defect shows up on the first view that has that control. */
await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), 'dark');
for (const hash of ['#/', '#/formulas', '#/calculators', '#/import', '#/learning', '#/glossary',
                    '#/workstation', '#/battery-tester', '#/health', '#/admin', '#/chemistry', '#/preparation']) {
  await page.evaluate((h) => { location.hash = h.slice(1); }, hash);
  await page.waitForTimeout(400);
  for (const x of await page.evaluate(FOCUS_PROBE)) add('focus', x, hash);
}

/* ── Focus containment in the two overlays ── */
const modal = {};
await page.setViewportSize({ width: 900, height: 900 });   // drawer mode
await page.evaluate(() => { location.hash = '/'; });
await page.waitForTimeout(400);
await page.click('#nav-toggle');
await page.waitForTimeout(400);
modal.drawerTrapsFocus = await page.evaluate(async () => {
  const outside = document.querySelector('#view-outlet a[href], #view-outlet button');
  if (!outside) return 'no control outside drawer to test';
  outside.focus();
  return document.activeElement === outside ? 'NO — focus reaches the page behind the open drawer' : 'yes';
});
modal.drawerHidesBackground = await page.evaluate(() =>
  document.querySelector('.app-main')?.inert === true ? 'yes (inert)' : 'no');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
modal.drawerReturnsFocus = await page.evaluate(() =>
  document.activeElement?.id === 'nav-toggle' ? 'yes' : 'NO — focus went to ' + (document.activeElement?.tagName || '?'));

await page.setViewportSize({ width: 1280, height: 900 });
await page.click('#search-btn');
await page.waitForTimeout(400);
modal.searchTrapsFocus = await page.evaluate(() => {
  const outside = document.querySelector('.app-sidebar a[href]');
  if (!outside) return 'no control outside overlay to test';
  outside.focus();
  return document.activeElement === outside ? 'NO — focus reaches the page behind the search dialog' : 'yes';
});
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
modal.searchReturnsFocus = await page.evaluate(() =>
  document.activeElement?.id === 'search-btn' ? 'yes' : 'NO — focus went to ' + (document.activeElement?.tagName || '?'));

/* ── aria-current on the active nav item ── */
await page.evaluate(() => { location.hash = '/glossary'; });
await page.waitForTimeout(400);
modal.ariaCurrent = await page.evaluate(() =>
  document.querySelector('.app-sidebar [aria-current]')?.getAttribute('href') || 'NONE');

/* ── reduced motion ── */
const rm = await ctx.newPage();
await rm.emulateMedia({ reducedMotion: 'reduce' });
await rm.goto(BASE + '#/demo', { waitUntil: 'load' });
await rm.waitForTimeout(1500);
modal.reducedMotion = await rm.evaluate(() => {
  const d = getComputedStyle(document.body).getPropertyValue('animation-duration');
  return { bodyAnimDuration: d, note: 'engine renders a still frame — see anim-engine.js' };
});
await rm.close();

const dump = (b) => [...findings[b].entries()].map(([k, v]) => `${k}   [${v.length > 3 ? v.slice(0, 3).join(', ') + ', …' : v.join(', ')}]`);
const report = {
  routes: routes.length,
  unnamedControls: dump('unnamed'),
  focusNotVisible: dump('focus'),
  headingProblems: dump('headings'),
  unlabelledControls: dump('labels'),
  smallTargets: dump('targets'),
  contrastFailures: dump('contrast'),
  modal
};
writeFileSync('/tmp/a11y-report.json', JSON.stringify(report, null, 2));

for (const [k, v] of Object.entries(report)) {
  if (Array.isArray(v)) {
    console.log(`\n── ${k}: ${v.length} ──`);
    v.slice(0, 25).forEach((x) => console.log('  •', x));
    if (v.length > 25) console.log(`  … ${v.length - 25} more`);
  } else if (typeof v === 'object') {
    console.log(`\n── ${k} ──`);
    for (const [a, b] of Object.entries(v)) console.log('  ', a, ':', JSON.stringify(b));
  } else console.log(`\n${k}: ${v}`);
}

await browser.close();
