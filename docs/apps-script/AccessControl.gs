/**
 * EDMGLAB — access control receiver
 * Google Apps Script Web App. Architecture §J.
 *
 * WHAT THIS SOLVES
 * The admin panel at #/admin can generate an access configuration, but a
 * browser cannot commit it. So adding one person to the group meant an admin
 * editing data/access.json and pushing to git — which is fine for a developer
 * and a real obstacle for everyone else. With this deployed, the admin panel
 * writes here instead and the change is live on the next visit.
 *
 * ══════════════════════════════════════════════════════════════════════
 * READ THIS BEFORE DEPLOYING. IT IS DIFFERENT FROM Code.gs.
 * ══════════════════════════════════════════════════════════════════════
 *
 * Code.gs (the correction inbox) is deliberately unauthenticated: the worst
 * case is a junk row in a Sheet. THIS script is not in that category. An
 * unauthenticated write here would let anyone on the internet grant themselves
 * access or lock the whole group out — strictly worse than the git flow it
 * replaces, which at least requires push rights.
 *
 * So every WRITE requires an admin key:
 *
 *   · The key lives in Script Properties, on Google's servers. It is never in
 *     the repository, never in data/access.json, and never in any JavaScript
 *     the browser downloads. A static site cannot keep a secret; this script
 *     can, because it is a server.
 *   · The admin types it into the admin panel when making a change. It is sent
 *     with that one request and is not stored by the page.
 *   · Comparison is constant-time-ish and every attempt is logged with a
 *     timestamp, so a guessing campaign is visible in the audit tab.
 *
 * READS are public and that is intentional: the config the browser needs
 * contains only names, salts and PBKDF2 hashes — exactly what already sits in
 * data/access.json in a public repository. Publishing it here changes nothing.
 *
 * WHAT THIS STILL DOES NOT DO
 * It does not protect the site. EDMGLAB is static: anyone with the URL can
 * open data/formulas.json without ever meeting the PIN. This script makes
 * ADMINISTRATION safe and immediate. It does not make the content private, and
 * a four-digit PIN whose hash is public is recoverable by anyone who cares.
 * The two-tier rule is unchanged: everything in the repository must be safe to
 * be public.
 * ══════════════════════════════════════════════════════════════════════
 */

/** Script Property holding the admin key. Set it from the Apps Script editor:
 *  Project Settings → Script Properties → add ADMIN_KEY. */
var KEY_PROPERTY = 'ADMIN_KEY';

/** Script Property holding the live config JSON. Written by this script only. */
var CONFIG_PROPERTY = 'ACCESS_CONFIG';

/** Audit tab. Created automatically. Every write and every refused write. */
var AUDIT_SHEET = 'Access log';

/** Refuse absurd payloads before doing any work. */
var MAX_BODY = 60000;
var MAX_USERS = 300;

var AUDIT_COLUMNS = ['When', 'Action', 'Result', 'Subject', 'By', 'Detail'];

/* ══════════════════════════════════════════════════════════════════
   Read — public
   ══════════════════════════════════════════════════════════════════ */

function doGet(e) {
  try {
    var cfg = readConfig();
    // Never emit the admin key, and never emit anything not meant for a client.
    return json({
      ok: true,
      config: publicConfig(cfg),
      updated: cfg.updated || null
    });
  } catch (err) {
    return json({ ok: false, error: String(err && err.message || err) });
  }
}

/* ══════════════════════════════════════════════════════════════════
   Write — admin key required
   ══════════════════════════════════════════════════════════════════ */

function doPost(e) {
  var body = {};
  var action = '(none)';
  try {
    var raw = (e && e.postData && e.postData.contents) || '';
    if (raw.length > MAX_BODY) throw new Error('payload too large');
    body = JSON.parse(raw || '{}');
    action = String(body.action || '(none)');

    if (!checkKey(body.adminKey)) {
      audit(action, 'REFUSED', '', body.by, 'admin key did not match');
      // Deliberately vague, and deliberately not fast — see checkKey.
      return json({ ok: false, error: 'Not authorised.' });
    }

    var cfg = readConfig();
    var result = apply(cfg, action, body);
    result.updated = new Date().toISOString();
    writeConfig(result);
    audit(action, 'OK', body.slug || body.name || '', body.by, describe(action, body));

    return json({ ok: true, config: publicConfig(result), updated: result.updated });
  } catch (err) {
    var msg = String(err && err.message || err);
    audit(action, 'ERROR', body.slug || '', body.by, msg);
    return json({ ok: false, error: msg });
  }
}

/**
 * Verify the admin key.
 *
 * Two things matter here and neither is obvious:
 *   1. The comparison walks the WHOLE string regardless of where it first
 *      differs. A plain === returns as soon as it finds a mismatch, and the
 *      time that takes leaks how much of the key was right.
 *   2. Every attempt sleeps. A 4-digit PIN is guessable in ten thousand tries;
 *      an admin key should not be guessable at all, and a quarter-second floor
 *      turns a million-guess campaign into weeks while costing a real admin
 *      nothing they would notice.
 */
function checkKey(supplied) {
  Utilities.sleep(250);
  var expected = PropertiesService.getScriptProperties().getProperty(KEY_PROPERTY);
  if (!expected) throw new Error('No ADMIN_KEY is set in Script Properties. Set one before using this.');
  var a = String(supplied == null ? '' : supplied);
  var b = String(expected);
  var diff = a.length ^ b.length;
  for (var i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/* ══════════════════════════════════════════════════════════════════
   Actions
   ══════════════════════════════════════════════════════════════════
   Each returns the NEW config. None of them ever computes a hash: the browser
   derives PBKDF2 from the PIN and sends only salt + hash + iterations, so a
   PIN never crosses the network and never appears in a Google log.        */

function apply(cfg, action, body) {
  switch (action) {
    case 'setGate':
      cfg.enabled = body.enabled === true;
      if (body.mode === 'shared' || body.mode === 'users') cfg.mode = body.mode;
      if (typeof body.message === 'string') cfg.message = body.message.slice(0, 300);
      if (typeof body.hint === 'string') cfg.hint = body.hint.slice(0, 200);
      if (body.rememberDays != null) cfg.rememberDays = clampInt(body.rememberDays, 0, 365);
      return cfg;

    case 'setSharedPin':
      cfg.pin = requireCredential(body.pin);
      return cfg;

    case 'addUser': {
      var u = {
        name: requireText(body.name, 'name', 80),
        slug: requireText(body.slug, 'slug', 80),
        enabled: body.enabled === false ? false : true,
        role: body.role === 'admin' ? 'admin' : 'member',
        added: new Date().toISOString()
      };
      var cred = requireCredential(body.credential);
      u.salt = cred.salt; u.hash = cred.hash; u.iterations = cred.iterations;

      cfg.users = cfg.users || [];
      if (cfg.users.length >= MAX_USERS) throw new Error('too many people on the list');
      for (var i = 0; i < cfg.users.length; i++) {
        if (cfg.users[i].slug === u.slug) throw new Error('Someone with that name is already listed.');
      }
      cfg.users.push(u);
      return cfg;
    }

    case 'removeUser': {
      var slug = requireText(body.slug, 'slug', 80);
      cfg.users = (cfg.users || []).filter(function (x) { return x.slug !== slug; });
      return cfg;
    }

    case 'setUserEnabled': {
      var s = requireText(body.slug, 'slug', 80);
      var found = false;
      (cfg.users || []).forEach(function (x) {
        if (x.slug === s) { x.enabled = body.enabled === true; found = true; }
      });
      if (!found) throw new Error('No such person on the list.');
      return cfg;
    }

    /* Replaces the whole config in one write. This is how the admin panel
       pushes a configuration it generated offline, and how a mistake gets
       rolled back from the audit tab. */
    case 'replaceAll': {
      var next = body.config;
      if (!next || typeof next !== 'object') throw new Error('no config supplied');
      return normalise(next);
    }

    default:
      throw new Error('Unknown action: ' + action);
  }
}

function describe(action, body) {
  if (action === 'setGate') return 'enabled=' + (body.enabled === true) + ' mode=' + (body.mode || '');
  if (action === 'addUser') return 'role=' + (body.role || 'member');
  if (action === 'setUserEnabled') return 'enabled=' + (body.enabled === true);
  return '';
}

/* ══════════════════════════════════════════════════════════════════
   Storage
   ══════════════════════════════════════════════════════════════════ */

function defaultConfig() {
  return {
    schemaVersion: 1,
    enabled: false,
    mode: 'shared',
    message: 'Enter the lab access PIN to continue.',
    hint: '',
    rememberDays: 14,
    pin: null,
    users: []
  };
}

function readConfig() {
  var raw = PropertiesService.getScriptProperties().getProperty(CONFIG_PROPERTY);
  if (!raw) return defaultConfig();
  try { return normalise(JSON.parse(raw)); }
  catch (e) { return defaultConfig(); }
}

function writeConfig(cfg) {
  PropertiesService.getScriptProperties()
    .setProperty(CONFIG_PROPERTY, JSON.stringify(normalise(cfg)));
}

/** Force the shape, whatever arrived. A config with a surprise field in it is
 *  a config the client will not understand. */
function normalise(c) {
  var d = defaultConfig();
  var out = {
    schemaVersion: 1,
    enabled: c.enabled === true,
    mode: c.mode === 'users' ? 'users' : 'shared',
    message: String(c.message == null ? d.message : c.message).slice(0, 300),
    hint: String(c.hint == null ? '' : c.hint).slice(0, 200),
    rememberDays: clampInt(c.rememberDays == null ? d.rememberDays : c.rememberDays, 0, 365),
    pin: c.pin ? credential(c.pin) : null,
    users: [],
    updated: c.updated || null
  };
  var seen = {};
  (c.users || []).slice(0, MAX_USERS).forEach(function (u) {
    if (!u || !u.slug || seen[u.slug]) return;
    seen[u.slug] = true;
    var cred = credential(u);
    out.users.push({
      name: String(u.name || u.slug).slice(0, 80),
      slug: String(u.slug).slice(0, 80),
      enabled: u.enabled === false ? false : true,
      role: u.role === 'admin' ? 'admin' : 'member',
      added: u.added || null,
      salt: cred.salt, hash: cred.hash, iterations: cred.iterations
    });
  });
  return out;
}

/** What the browser is allowed to see. Today that is everything in the config
 *  — it holds no secrets, only salts and derived hashes — but routing it
 *  through one function means a future field that IS sensitive has one obvious
 *  place to be withheld, rather than leaking because somebody returned cfg. */
function publicConfig(cfg) {
  return {
    schemaVersion: 1,
    enabled: cfg.enabled === true,
    mode: cfg.mode,
    message: cfg.message,
    hint: cfg.hint,
    rememberDays: cfg.rememberDays,
    pin: cfg.pin || null,
    users: (cfg.users || []).map(function (u) {
      return {
        name: u.name, slug: u.slug, enabled: u.enabled !== false, role: u.role,
        added: u.added || null,
        salt: u.salt, hash: u.hash, iterations: u.iterations
      };
    })
  };
}

function credential(o) {
  return {
    salt: String((o && o.salt) || ''),
    hash: String((o && o.hash) || ''),
    iterations: clampInt((o && o.iterations) || 150000, 1000, 2000000)
  };
}

function requireCredential(o) {
  var c = credential(o);
  if (!c.salt || !c.hash) throw new Error('A derived PIN (salt and hash) is required.');
  return c;
}

function requireText(v, what, max) {
  var s = String(v == null ? '' : v).trim();
  if (!s) throw new Error('Missing ' + what + '.');
  return s.slice(0, max);
}

function clampInt(v, lo, hi) {
  var n = parseInt(v, 10);
  if (isNaN(n)) n = lo;
  return Math.max(lo, Math.min(hi, n));
}

/* ══════════════════════════════════════════════════════════════════
   Audit
   ══════════════════════════════════════════════════════════════════
   Every write and every refusal. This is what turns "someone changed the
   access list" from a mystery into a line with a time on it, and it is where
   a key-guessing campaign becomes visible. Failure to log never fails the
   operation — a change that was applied has been applied.                 */

function audit(action, result, subject, by, detail) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) return;                       // not bound to a Sheet — skip quietly
    var sh = ss.getSheetByName(AUDIT_SHEET);
    if (!sh) {
      sh = ss.insertSheet(AUDIT_SHEET);
      sh.appendRow(AUDIT_COLUMNS);
      sh.setFrozenRows(1);
    }
    sh.appendRow([
      new Date(), String(action), String(result), String(subject || ''),
      String(by || '(not given)'), String(detail || '')
    ]);
  } catch (e) { /* logging must never break a write */ }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ══════════════════════════════════════════════════════════════════
   Run this once from the editor to check the deployment
   ══════════════════════════════════════════════════════════════════ */

function selfTest() {
  var key = PropertiesService.getScriptProperties().getProperty(KEY_PROPERTY);
  Logger.log('ADMIN_KEY set: ' + (key ? 'yes (' + key.length + ' characters)' : 'NO — set it before deploying'));
  if (key && key.length < 16) Logger.log('WARNING: that key is short. Use 24+ random characters.');
  var cfg = readConfig();
  Logger.log('Gate enabled: ' + cfg.enabled + ' · mode: ' + cfg.mode + ' · people: ' + (cfg.users || []).length);
  Logger.log('Bound to a Sheet: ' + (SpreadsheetApp.getActiveSpreadsheet() ? 'yes' : 'no — the audit log will be skipped'));
}
