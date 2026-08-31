/**
 * EDMGLAB — PIN gate: crypto, lockout, session and the gate screen
 *
 * The other half of js/lib/access.js. Read that file's header first: it
 * explains at length why this is a soft gate and not security, and nothing
 * here changes that.
 *
 * This half is separate for one reason. It is about twelve kilobytes of
 * PBKDF2, lockout arithmetic and gate markup that matters only when the gate
 * is switched ON — and it ships off by default, so for almost every visit it
 * was twelve kilobytes on the critical path buying nothing. access.js now
 * imports it dynamically, only after the config says the gate is on.
 *
 * The admin panel imports it directly: generating a configuration needs the
 * same derivation the gate uses, and it must be the SAME code, or a PIN that
 * was generated would not verify.
 */

import { CONFIG_KEYS, slugify } from './access.js';

const { SESSION_KEY, ACTIVE_USER_KEY } = CONFIG_KEYS;
const LOCK_KEY = 'edmglab.access.lock';

/** PBKDF2 work factor. Higher = slower to brute-force AND slower to log in.
 *  ~150k lands around 150–300 ms on a mid-range phone, which is acceptable
 *  for a once-per-session prompt. */
export const ITERATIONS = 150000;

/* ── Crypto ──────────────────────────────────────────────── */

function b64(bytes) { return btoa(String.fromCharCode(...new Uint8Array(bytes))); }
function unb64(s) { return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); }

export function randomSalt() {
  return b64(crypto.getRandomValues(new Uint8Array(16)));
}

/** Derive the stored value from a PIN. */
export async function derive(pin, saltB64, iterations = ITERATIONS) {
  if (!crypto?.subtle) throw new Error('Web Crypto unavailable — requires HTTPS or localhost.');
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(String(pin)), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: unb64(saltB64), iterations, hash: 'SHA-256' }, key, 256
  );
  return b64(bits);
}

/* ── Lockout ─────────────────────────────────────────────────
   Slows a person typing guesses. It does NOT slow a script, which would
   read the config file and test all 10,000 PINs offline without ever
   touching this code. Presented as a speed bump, never as protection.  */

const LOCK_STEPS = [0, 0, 0, 5, 15, 60, 300];   // seconds, by failure count

function getLock() {
  try { return JSON.parse(localStorage.getItem(LOCK_KEY) || '{"fails":0,"until":0}'); }
  catch { return { fails: 0, until: 0 }; }
}
function setLock(v) {
  try { localStorage.setItem(LOCK_KEY, JSON.stringify(v)); } catch { /* ignore */ }
}
function clearLock() {
  try { localStorage.removeItem(LOCK_KEY); } catch { /* ignore */ }
}
function lockRemaining() {
  const l = getLock();
  return Math.max(0, Math.ceil((l.until - Date.now()) / 1000));
}

/* ── Session ─────────────────────────────────────────────── */

function rememberSession(userSlug, persist) {
  const payload = JSON.stringify({ user: userSlug, at: Date.now() });
  try {
    sessionStorage.setItem(SESSION_KEY, payload);
    if (persist) localStorage.setItem(SESSION_KEY, payload);
    if (userSlug) localStorage.setItem(ACTIVE_USER_KEY, userSlug);
  } catch { /* storage blocked — the gate simply reappears next time */ }
}

function readSession(cfg) {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    const days = Number(cfg.rememberDays ?? 14);
    if (days > 0 && Date.now() - s.at > days * 86400000) return null;
    return s;
  } catch { return null; }
}

/* ── Verification ────────────────────────────────────────── */

/**
 * Test a PIN against the config.
 * @returns {Promise<{ok:boolean, user:?string, label:?string}>}
 */
export async function verify(pin, cfg) {
  // Per-user PINs: whichever entry matches identifies the person.
  if (cfg.mode === 'users' && Array.isArray(cfg.users)) {
    for (const u of cfg.users) {
      if (!u.salt || !u.hash) continue;
      /* A suspended person is skipped rather than filtered out earlier, so the
         derivation still runs for them and a suspended PIN takes exactly as
         long to reject as a wrong one. Filtering the list first would make
         "suspended" measurably faster than "wrong", which tells the person at
         the keyboard that their PIN was right — the one thing suspending them
         was meant to stop. */
      const got = await derive(pin, u.salt, u.iterations || ITERATIONS);
      if (got === u.hash && u.enabled !== false) {
        return { ok: true, user: u.slug || slugify(u.name), label: u.name };
      }
    }
    return { ok: false, user: null, label: null };
  }

  // Single shared PIN.
  if (cfg.pin?.salt && cfg.pin?.hash) {
    const got = await derive(pin, cfg.pin.salt, cfg.pin.iterations || ITERATIONS);
    if (got === cfg.pin.hash) return { ok: true, user: null, label: null };
  }
  return { ok: false, user: null, label: null };
}

/* ── The gate ────────────────────────────────────────────── */

/**
 * Everything that happens once the gate is known to be ON.
 * Split out of access.js so that the 12 KB of crypto, lockout and gate UI is
 * not on the boot path of every visit to a site whose gate is off by default
 * — which is every visit, unless the group has turned it on.
 *
 * @returns {Promise<{gated:boolean, user:?string, label:?string}>}
 */
export async function runGate(cfg) {
  const existing = readSession(cfg);
  if (existing) return { gated: true, user: existing.user || null, label: null };
  const result = await showGate(cfg);
  return { gated: true, ...result };
}

function showGate(cfg) {
  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.className = 'gate';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Enter access PIN');

    root.innerHTML = `
      <div class="gate-card">
        <div class="gate-mark" aria-hidden="true"></div>
        <h1 class="gate-title">EDMGLAB</h1>
        <p class="gate-sub">${escape_(cfg.message || 'Enter the lab access PIN to continue.')}</p>

        <div class="gate-pin" id="gate-pin">
          ${[0, 1, 2, 3].map((i) => `
            <input type="password" inputmode="numeric" pattern="[0-9]*" maxlength="1"
                   autocomplete="off" aria-label="PIN digit ${i + 1}" data-i="${i}">`).join('')}
        </div>

        <p class="gate-error" id="gate-error" role="alert" aria-live="assertive"></p>

        ${cfg.hint ? `<p class="gate-hint">Hint: ${escape_(cfg.hint)}</p>` : ''}

        <label class="gate-remember">
          <input type="checkbox" id="gate-remember" checked>
          <span>Remember me on this device${cfg.rememberDays ? ` for ${Number(cfg.rememberDays)} days` : ''}</span>
        </label>

        <button type="button" class="btn btn-primary gate-submit" id="gate-go">Unlock</button>

        <p class="gate-note">
          <strong>This is a soft gate, not security.</strong> EDMGLAB is a static site: this PIN keeps the
          app tidy on shared machines and separates each person's saved progress. It does not protect any
          file from anyone who knows the URL, so nothing confidential belongs in this repository.
        </p>
      </div>`;

    document.body.appendChild(root);
    document.body.classList.add('gate-open');

    const inputs = Array.from(root.querySelectorAll('.gate-pin input'));
    const errEl = root.querySelector('#gate-error');
    const goBtn = root.querySelector('#gate-go');
    let busy = false;

    const value = () => inputs.map((i) => i.value).join('');
    const clear = () => { inputs.forEach((i) => { i.value = ''; }); inputs[0].focus(); };

    inputs.forEach((inp, i) => {
      inp.addEventListener('input', () => {
        inp.value = inp.value.replace(/\D/g, '').slice(0, 1);
        if (inp.value && i < 3) inputs[i + 1].focus();
        if (value().length === 4) attempt();
      });
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !inp.value && i > 0) { inputs[i - 1].focus(); inputs[i - 1].value = ''; e.preventDefault(); }
        if (e.key === 'ArrowLeft' && i > 0) inputs[i - 1].focus();
        if (e.key === 'ArrowRight' && i < 3) inputs[i + 1].focus();
        if (e.key === 'Enter') attempt();
      });
      // Paste a whole PIN into any box
      inp.addEventListener('paste', (e) => {
        const txt = (e.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, 4);
        if (!txt) return;
        e.preventDefault();
        txt.split('').forEach((c, k) => { if (inputs[k]) inputs[k].value = c; });
        inputs[Math.min(txt.length, 3)].focus();
        if (txt.length === 4) attempt();
      });
    });

    goBtn.addEventListener('click', attempt);

    // Lockout countdown, if one is active from a previous burst of attempts.
    let timer = null;
    function tickLock() {
      const left = lockRemaining();
      if (left > 0) {
        goBtn.disabled = true;
        inputs.forEach((i) => { i.disabled = true; });
        errEl.textContent = `Too many attempts. Try again in ${left}s.`;
        timer = setTimeout(tickLock, 1000);
      } else {
        clearTimeout(timer);
        goBtn.disabled = false;
        inputs.forEach((i) => { i.disabled = false; });
        if (errEl.textContent.startsWith('Too many')) errEl.textContent = '';
        inputs[0].focus();
      }
    }
    tickLock();

    async function attempt() {
      if (busy || lockRemaining() > 0) return;
      const pin = value();
      if (pin.length !== 4) { errEl.textContent = 'Enter all four digits.'; return; }

      busy = true;
      goBtn.disabled = true;
      goBtn.innerHTML = '<span class="spinner" style="width:14px;height:14px"></span> Checking…';
      errEl.textContent = '';

      let res;
      try {
        res = await verify(pin, cfg);
      } catch (e) {
        // Web Crypto missing (insecure origin). Fail OPEN and say why —
        // locking people out of a public site over a broken speed bump
        // would be the wrong trade.
        console.error('[access] verification unavailable', e);
        cleanup();
        resolve({ user: null, label: null, error: e.message });
        return;
      }

      busy = false;
      goBtn.disabled = false;
      goBtn.textContent = 'Unlock';

      if (res.ok) {
        clearLock();
        rememberSession(res.user, root.querySelector('#gate-remember').checked);
        cleanup();
        resolve({ user: res.user, label: res.label });
        return;
      }

      const l = getLock();
      l.fails = (l.fails || 0) + 1;
      const wait = LOCK_STEPS[Math.min(l.fails, LOCK_STEPS.length - 1)];
      l.until = wait ? Date.now() + wait * 1000 : 0;
      setLock(l);

      root.querySelector('.gate-card').classList.add('shake');
      setTimeout(() => root.querySelector('.gate-card')?.classList.remove('shake'), 400);
      errEl.textContent = 'Incorrect PIN.';
      clear();
      if (wait) tickLock();
    }

    function cleanup() {
      clearTimeout(timer);
      root.remove();
      document.body.classList.remove('gate-open');
    }

    setTimeout(() => inputs[0].focus(), 50);
  });
}

function escape_(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
