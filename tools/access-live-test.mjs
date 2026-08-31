/**
 * EDMGLAB — the live access endpoint, end to end.
 *
 * The client (js/lib/access-live.js) and the server (docs/apps-script/
 * AccessControl.gs) have a contract that nothing else checks, and they are
 * written in different languages, live in different folders, and are deployed
 * by different people at different times. That is the exact shape of a thing
 * that silently drifts.
 *
 * So this stands up a mock endpoint implementing the SAME contract, points a
 * temporary data/access.json at it, and drives the real admin page in a real
 * browser: add a person, suspend them, restore, remove, toggle the gate, and
 * try it all with a wrong key. It also checks the two properties that matter
 * most and are the easiest to lose in a refactor:
 *
 *   · NO PIN EVER CROSSES THE NETWORK. Every request body is inspected; a
 *     four-digit string anywhere in it fails the test.
 *   · THE ADMIN KEY IS NEVER STORED. localStorage and sessionStorage are read
 *     after a successful write and must not contain it.
 *
 * The mock deliberately re-implements the .gs logic rather than importing it,
 * because the point is to check the CLIENT against the contract, not the
 * script against itself.
 *
 * Run:  node tools/access-live-test.mjs      (needs the site on :8000)
 */

import { createServer } from 'node:http';
import { readFileSync, writeFileSync, copyFileSync, existsSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const ACCESS = join(ROOT, 'data/access.json');
const BACKUP = join(ROOT, 'data/access.json.testbak');
const SITE = 'http://localhost:8000';
const PORT = 8123;
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const KEY = 'test-admin-key-do-not-ship';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name + (detail ? '  ' + detail : '')); }
  else { fail++; console.log('  ✗ ' + name + (detail ? '  ' + detail : '')); }
};
const head = (s) => console.log('\n' + s);

/* ══════════════════════════════════════════════════════════
   The mock endpoint — same contract as AccessControl.gs
   ══════════════════════════════════════════════════════════ */

let config = {
  schemaVersion: 1, enabled: false, mode: 'users',
  message: 'Enter the lab access PIN to continue.', hint: '',
  rememberDays: 14, pin: null, users: [], updated: null
};
const seenBodies = [];
let refusals = 0;

const server = createServer((req, res) => {
  const send = (obj) => {
    // Apps Script sends this; without it the browser blocks a cross-origin read.
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(obj));
  };

  if (req.method === 'GET') return send({ ok: true, config, updated: config.updated });

  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    let body;
    try { body = JSON.parse(raw); } catch { return send({ ok: false, error: 'bad json' }); }
    seenBodies.push({ contentType: req.headers['content-type'] || '', body });

    if (body.adminKey !== KEY) { refusals++; return send({ ok: false, error: 'Not authorised.' }); }

    try {
      switch (body.action) {
        case 'setGate':
          config.enabled = body.enabled === true;
          if (body.mode) config.mode = body.mode;
          break;
        case 'addUser':
          if (!body.credential?.salt || !body.credential?.hash) throw new Error('no credential');
          if (config.users.some((u) => u.slug === body.slug)) throw new Error('Someone with that name is already listed.');
          config.users.push({
            name: body.name, slug: body.slug, enabled: true,
            role: body.role === 'admin' ? 'admin' : 'member', added: new Date().toISOString(),
            salt: body.credential.salt, hash: body.credential.hash, iterations: body.credential.iterations
          });
          break;
        case 'removeUser':
          config.users = config.users.filter((u) => u.slug !== body.slug);
          break;
        case 'setUserEnabled': {
          const u = config.users.find((x) => x.slug === body.slug);
          if (!u) throw new Error('No such person on the list.');
          u.enabled = body.enabled === true;
          break;
        }
        default: throw new Error('Unknown action: ' + body.action);
      }
      config.updated = new Date().toISOString();
      send({ ok: true, config, updated: config.updated });
    } catch (e) {
      send({ ok: false, error: e.message });
    }
  });
});

/* ══════════════════════════════════════════════════════════ */

const originalAccess = readFileSync(ACCESS, 'utf8');
copyFileSync(ACCESS, BACKUP);
let browser;

try {
  await new Promise((r) => server.listen(PORT, r));
  const cfg = JSON.parse(originalAccess);
  cfg.endpoint = `http://localhost:${PORT}/exec`;
  writeFileSync(ACCESS, JSON.stringify(cfg, null, 2) + '\n');

  browser = await chromium.launch({ executablePath: EXE });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  const $ = (sel) => page.locator(sel);
  const status = async () => (await page.locator('#lv-status').innerText()).trim();
  const waitDone = async () => {
    await page.waitForFunction(() => {
      const s = document.getElementById('lv-status');
      return s && s.textContent && !/…$/.test(s.textContent.trim());
    }, { timeout: 15000 });
  };

  head('The section appears only because an endpoint is configured');
  await page.goto(`${SITE}/#/admin`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#lv-add', { timeout: 15000 });
  ok('live management section is shown', !(await page.locator('#live-section').getAttribute('hidden')));
  ok('it read the live list, not the file',
    (await page.locator('#live-body').innerText()).includes('Nobody is on the list yet'));

  head('A write without the admin key is refused by the page, before the network');
  const before = seenBodies.length;
  await $('#lv-name').fill('Priya');
  await $('#lv-pin').fill('4417');
  await $('#lv-add').click();
  await page.waitForTimeout(400);
  ok('page asks for the key first', (await status()).includes('admin key'));
  ok('nothing was sent', seenBodies.length === before, `${seenBodies.length - before} request(s)`);

  head('A write with the WRONG key is refused by the endpoint');
  await $('#lv-key').fill('wrong-key');
  await $('#lv-add').click();
  await waitDone();
  ok('the endpoint refused it', (await status()).includes('Not authorised'));
  ok('the refusal was counted server-side', refusals === 1, `refusals=${refusals}`);
  ok('nobody was added', config.users.length === 0);

  head('Adding a person with the right key');
  await $('#lv-key').fill(KEY);
  await $('#lv-by').fill('Krishna');
  await $('#lv-add').click();
  await waitDone();
  ok('the page reports success', (await status()).includes('Done'));
  ok('the person is on the live list', config.users.length === 1 && config.users[0].slug === 'priya',
    JSON.stringify(config.users.map((u) => u.slug)));
  ok('a PBKDF2 hash arrived, with a salt and an iteration count',
    Boolean(config.users[0].hash && config.users[0].salt && config.users[0].iterations >= 1000));
  ok('the audit name came with it', seenBodies.at(-1).body.by === 'Krishna');
  ok('the key was re-filled so a second change needs no retyping',
    (await $('#lv-key').inputValue()) === KEY);

  head('THE TWO PROPERTIES THAT MUST NEVER REGRESS');
  const anyPin = seenBodies.some((r) => JSON.stringify(r.body).match(/"\d{4}"/));
  ok('no four-digit PIN appears in ANY request body', !anyPin,
    anyPin ? 'A PIN reached the network. The derivation must happen in the browser.' : `${seenBodies.length} bodies checked`);

  const stored = await page.evaluate((k) => {
    const hit = [];
    for (const s of [localStorage, sessionStorage]) {
      for (let i = 0; i < s.length; i++) {
        const key = s.key(i);
        if ((s.getItem(key) || '').includes(k)) hit.push(key);
      }
    }
    return hit;
  }, KEY);
  ok('the admin key is in no browser storage', stored.length === 0, stored.join(', '));

  ok('the request used text/plain, which needs no CORS preflight',
    seenBodies.every((r) => r.contentType.startsWith('text/plain')),
    seenBodies.map((r) => r.contentType)[0]);

  head('Suspend, restore, remove');
  await page.locator('[data-toggle="priya"]').click();
  await waitDone();
  ok('suspended', config.users[0].enabled === false);

  await page.locator('[data-toggle="priya"]').click();
  await waitDone();
  ok('restored', config.users[0].enabled === true);

  const rm = page.locator('[data-remove="priya"]');
  await rm.click();
  await page.waitForTimeout(200);
  ok('removal arms rather than firing on one click',
    (await rm.innerText()).includes('Really'), 'and no confirm() dialog, which would block the page');
  ok('still on the list after one click', config.users.length === 1);
  await rm.click();
  await waitDone();
  ok('removed after the second click', config.users.length === 0);

  head('Turning the gate on and off');
  await page.locator('#lv-toggle').click();
  await waitDone();
  ok('gate is on at the endpoint', config.enabled === true);
  await page.locator('#lv-toggle').click();
  await waitDone();
  ok('gate is off again', config.enabled === false);

  /* Snapshot here. Below, the endpoint is deliberately killed, and the browser
     rightly logs ERR_CONNECTION_REFUSED for the fetch that follows — that is
     the scenario under test, not a defect, and counting it would make the
     assertion meaningless. */
  const errorsBeforeTeardown = errors.length;

  head('The boot path reads the endpoint, and survives it dying');
  config = { ...config, enabled: true, mode: 'users', users: [
    { name: 'Priya', slug: 'priya', enabled: true, role: 'member',
      salt: 'AAAA', hash: 'BBBB', iterations: 150000 }
  ] };
  const live = await page.evaluate(async () => {
    const m = await import('/js/lib/access.js');
    return await m.loadConfig();
  });
  ok('boot config came from the endpoint', live._source === 'endpoint' && live.enabled === true,
    `_source=${live._source}`);

  await new Promise((r) => server.close(r));
  const cached = await page.evaluate(async () => {
    const m = await import('/js/lib/access.js');
    return await m.loadConfig();
  });
  ok('with the endpoint dead it falls back to the cached list, not wide open',
    cached._source === 'cache' && cached.enabled === true, `_source=${cached._source}`);
  ok('and it names the reason', String(cached._reason || '').includes('unreachable'), cached._reason);

  ok('no page errors on the normal path', errorsBeforeTeardown === 0,
    errors.slice(0, errorsBeforeTeardown).join(' | '));
  ok('the unreachable endpoint produced no UNCAUGHT error either',
    !errors.slice(errorsBeforeTeardown).some((e) => !/ERR_CONNECTION_REFUSED|Failed to load resource/.test(e)),
    errors.slice(errorsBeforeTeardown).filter((e) => !/ERR_CONNECTION_REFUSED|Failed to load resource/.test(e)).join(' | ')
      || 'only the expected refused connection');
} finally {
  if (browser) await browser.close();
  writeFileSync(ACCESS, originalAccess);
  if (existsSync(BACKUP)) unlinkSync(BACKUP);
  try { server.close(); } catch { /* already closed */ }
}

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
