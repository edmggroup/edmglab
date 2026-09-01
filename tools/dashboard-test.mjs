/**
 * EDMGLAB — the dashboard cannot go stale again
 *
 * WHY THIS EXISTS
 *
 * The landing page spent months telling visitors this was a "Phase 0 build"
 * whose scientific content "arrives module by module", under a *Coming next*
 * table listing five modules that had been finished for weeks — and fourteen
 * module cards reading "Phase undefined", because a module's phase number is
 * deleted from the nav model the moment it ships.
 *
 * Nothing caught any of it. The health check validates content files; the
 * accessibility, offline, performance and standing audits all walk every route
 * and all passed, because a page can be perfectly accessible, fast, offline
 * capable and completely wrong. The dashboard was the first thing anyone saw
 * and the last thing anyone looked at.
 *
 * That is the project's recurring defect in its purest form: A HAND-MAINTAINED
 * LIST THAT NOTHING CHECKS. The roadmap table and the phase chips are gone —
 * derived or deleted. What remains that cannot be derived is one line of
 * description per module, and this is what checks it.
 *
 * Run:  node tools/dashboard-test.mjs      (no browser, no server)
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const dash = readFileSync(join(ROOT, 'js/views/dashboard.js'), 'utf8');
const nav = readFileSync(join(ROOT, 'js/nav.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name + (detail ? '  ' + detail : '')); }
  else { fail++; console.log('  ✗ ' + name + (detail ? '  ' + detail : '')); }
};
const head = (s) => console.log('\n' + s);

/* The nav model is parsed rather than imported: importing it would need the
   browser globals it is written against, and the shape here is stable enough
   that a regex is honest. If this stops matching, nav.js changed structurally
   and this should fail loudly rather than silently check nothing. */
const entries = [...nav.matchAll(/\{\s*id:\s*'([a-z-]+)'[^}]*\}/g)].map((m) => ({
  id: m[1], src: m[0], built: /view:\s*'/.test(m[0]), phase: /phase:\s*\d/.test(m[0])
}));

head('The nav model still parses');
ok(`${entries.length} module entries found`, entries.length > 15,
  entries.length > 15 ? '' : 'nav.js has changed shape — this test is no longer checking anything');
const builtIds = entries.filter((e) => e.built).map((e) => e.id);
ok(`${builtIds.length} of them are built`, builtIds.length > 0);

head('Every built module has a description');
/* Keys of the DESCRIPTIONS object, quoted or bare. */
const block = dash.slice(dash.indexOf('const DESCRIPTIONS = {'), dash.indexOf('/** One row in'));
const described = new Set([...block.matchAll(/^\s{2}'?([a-z-]+)'?:/gm)].map((m) => m[1]));
const missing = builtIds.filter((id) => !described.has(id));
ok('none missing', missing.length === 0,
  missing.length ? missing.join(', ') + ' — a blank subtitle on the landing page' : `${described.size} written`);

const orphan = [...described].filter((id) => !entries.some((e) => e.id === id));
ok('and none describes a module that no longer exists', orphan.length === 0, orphan.join(', '));

head('Nothing on the page claims a build state it cannot know');

/* Comments are stripped first, and the first run of this test is why: the
   header comment in dashboard.js EXPLAINS what went stale, quoting the exact
   phrases, and the check matched its own explanation. A staleness test that
   fires on the note describing the fix would push whoever hits it toward
   deleting the explanation to make the test pass — the opposite of useful.
   What matters is what the page RENDERS. */
const code = dash
  .replace(/\/\*[\s\S]*?\*\//g, ' ')      // block comments
  .replace(/^\s*\/\/.*$/gm, ' ');          // whole-line // comments
const STALE = [
  ['Phase 0 build', /Phase 0 build/],
  ['a "Coming next" roadmap table', /Coming next/],
  ['a hardcoded roadmap array', /NEXT_UP/],
  ['a phase chip on a built module', /chips:\s*\[\s*'Phase '/]
];
for (const [what, re] of STALE) {
  ok(`no ${what}`, !re.test(code),
    re.test(code) ? 'this is what went stale last time' : '');
}

head('The remaining-work section is derived');
ok('it reads the data files rather than listing what somebody remembers',
  /fillTodo/.test(code) && /review\.json/.test(code) && /instruments\.json/.test(code));
ok('unbuilt modules come from the nav model, not a second list',
  /MODULES\.filter\(\(m\) => !m\.view\)/.test(code));
ok('the instruments row disappears once the file is filled in',
  /specsFilled === 0/.test(code) && /!machine\.model/.test(code),
  'so nobody has to remember to delete it');

head('A phase badge is still possible for a module that is genuinely unbuilt');
/* The badge was removed from the CARDS, not from the concept. If a new module
   is added to the roadmap tomorrow it must still be able to say so. */
ok('the sidebar still renders one', /nav-phase/.test(nav));
ok('the dashboard still handles pending modules', /pending\.length/.test(code));

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
