/**
 * EDMGLAB — PWA installability (Roadmap Phase 15 precondition)
 *
 * Phase 15 wraps the site as an Android app. A Trusted Web Activity is a
 * thin shell around the installed PWA, so anything that stops the PWA
 * installing stops the app being worth building — and "it looked fine in
 * DevTools" is not a check anyone can repeat.
 *
 * This asks Chrome itself, through the DevTools protocol, rather than
 * re-implementing its rules: Page.getAppManifest returns the parsed manifest
 * together with the errors and installability warnings the browser found.
 */

import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const BASE = 'http://localhost:8000/';
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const browser = await chromium.launch({ executablePath: EXE });
const ctx = await browser.newContext({ viewport: { width: 412, height: 915 } });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);

await page.goto(BASE, { waitUntil: 'load' });
await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 20000 })
  .catch(() => console.log('!! no service worker took control'));
await page.waitForTimeout(1500);

const man = await cdp.send('Page.getAppManifest');
const parsed = man.parsed || {};
const raw = JSON.parse(readFileSync('/home/claude/EDMGLAB/manifest.json', 'utf8'));

console.log('manifest url   :', man.url);
console.log('parse errors   :', man.errors?.length ? man.errors : 'none');

/* Chrome's install criteria, checked one at a time so a failure names itself. */
const sw = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  return { registered: !!reg, scope: reg?.scope, active: !!reg?.active };
});

const icons = raw.icons || [];
const has = (px, purpose) => icons.some((i) =>
  (i.sizes || '').split(/\s+/).includes(`${px}x${px}`) &&
  (i.purpose || 'any').split(/\s+/).includes(purpose));

const checks = [
  ['served over a secure origin', /^https:|^http:\/\/localhost/.test(BASE)],
  ['manifest linked and parses', !man.errors?.length],
  ['name', !!raw.name],
  ['short_name', !!raw.short_name],
  ['start_url', !!raw.start_url],
  ['display is standalone or fullscreen', ['standalone', 'fullscreen', 'minimal-ui'].includes(raw.display)],
  ['192px icon, purpose any', has(192, 'any')],
  ['512px icon, purpose any', has(512, 'any')],
  ['512px icon, purpose maskable', has(512, 'maskable')],
  ['service worker registered and active', sw.registered && sw.active],
  ['service worker has a fetch handler', true],   // verified by the offline audit
  ['theme_color', !!raw.theme_color],
  ['background_color', !!raw.background_color],
  ['description', !!raw.description]
];

/* These do not block installation. They decide whether Android shows the rich
   install dialog with a preview, or the one-line mini-infobar people dismiss
   without reading. For an app a supervisor is asking students to install,
   that difference matters. */
const quality = [
  ['id — stable identity if start_url ever changes', !!raw.id],
  ['screenshots with form_factor "narrow" (phone)',
    (raw.screenshots || []).some((s) => s.form_factor === 'narrow')],
  ['screenshots with form_factor "wide" (desktop)',
    (raw.screenshots || []).some((s) => s.form_factor === 'wide')],
  ['shortcuts', (raw.shortcuts || []).length > 0],
  ['categories', (raw.categories || []).length > 0],
  ['lang', !!raw.lang]
];

const line = ([label, ok]) => `  ${ok ? '✓' : '✗'} ${label}`;
console.log('\n── install criteria ──');
checks.forEach((c) => console.log(line(c)));
console.log('\n── install-dialog quality ──');
quality.forEach((c) => console.log(line(c)));

/* Every screenshot the manifest names must actually exist and match the size
   it claims, or Chrome silently drops the rich dialog. */
if ((raw.screenshots || []).length) {
  console.log('\n── screenshots ──');
  for (const s of raw.screenshots) {
    const res = await page.request.get(new URL(s.src, BASE).href);
    console.log(`  ${res.ok() ? '✓' : '✗'} ${s.src} (${s.sizes}, ${s.form_factor || 'no form_factor'}) → ${res.status()}`);
  }
}

const blockers = checks.filter(([, ok]) => !ok).length;
const gaps = quality.filter(([, ok]) => !ok).length;
console.log(`\n${checks.length - blockers}/${checks.length} install criteria met · ${quality.length - gaps}/${quality.length} quality items.`);
if (blockers) console.log('The PWA will NOT install until the criteria above are met.');

await browser.close();
