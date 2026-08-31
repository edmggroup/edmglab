/**
 * EDMGLAB — Access control admin panel
 *
 * TWO WAYS TO CHANGE WHO GETS IN, and the page offers whichever is available.
 *
 * 1. GENERATE AND COMMIT (always present, works offline).
 *    Produces the contents of `data/access.json` for the admin to paste and
 *    commit. A static site has no server to write the file, and routing the
 *    access list through the same reviewable commit history as everything else
 *    is a genuine benefit, not only a workaround.
 *
 * 2. LIVE MANAGEMENT (only when `endpoint` is set in data/access.json).
 *    Adds, suspends and removes people through the AccessControl.gs Web App,
 *    live for everyone on their next visit. This exists because path 1 asks a
 *    supervisor to make a git commit in order to give a new student a PIN,
 *    which is fine for a developer and a real obstacle for everyone else.
 *
 * The endpoint is the ONE part of this project where a server can actually
 * refuse a request: it holds an admin key in Script Properties, which a static
 * page cannot do because anything it holds is readable. So writes are properly
 * controlled — while READS stay public, because the config contains only names,
 * salts and PBKDF2 hashes, exactly what already sits in a public repository.
 *
 * The panel itself is deliberately NOT gated. Without the admin key it can
 * change nothing that matters, so hiding it would add friction without adding
 * protection.
 */

import { esc, pageHead, section, callout } from '../ui.js';
import * as access from '../lib/access.js';
/* The derivation MUST be the same code the gate uses — a PIN generated with
   different parameters would not verify. So this imports the gate module
   rather than reimplementing PBKDF2 for the admin panel. */
import { ITERATIONS, randomSalt, derive } from '../lib/access-gate.js';
import * as store from '../lib/storage.js';

export async function render(outlet) {
  const live = await access.loadConfig();

  // Working copy — edited here, then exported. Never applied directly.
  const draft = {
    enabled: live.enabled === true,
    mode: live.mode === 'users' ? 'users' : 'shared',
    message: live.message || 'Enter the lab access PIN to continue.',
    hint: live.hint || '',
    rememberDays: Number(live.rememberDays ?? 14),
    pin: live.pin || null,
    users: Array.isArray(live.users) ? live.users.slice() : []
  };

  outlet.innerHTML = `
    ${pageHead('Access control', 'Optional 4-digit PIN gate for the lab. Off by default.')}

    ${callout(`<strong>Read this first — this is a soft gate, not security.</strong>
      EDMGLAB is served as static files, so there is no server that can refuse a request. Anyone who knows
      the URL can open <code>data/formulas.json</code>, or any other file, directly without ever seeing the
      PIN prompt. What the gate genuinely does: keeps the app tidy on shared or unattended lab machines,
      signals that this is an internal tool, and — in per-user mode — keeps each person's progress and
      calculator history separate.
      <br><br>
      <strong>The two-tier rule is unchanged.</strong> Everything committed to this repository must still be
      safe to be public. Turning this on is never permission to commit unpublished results, NDA material,
      personal data or credentials. If you ever need real access control, it has to come from a server that
      can refuse the request — for this project, Google Apps Script behind institutional sign-in
      (Architecture §J).`, 'warn')}

    ${section('Current live setting', `
      <div class="panel"><div class="panel-body">
        <div class="row" style="justify-content:space-between">
          <div>
            <strong>PIN gate is ${live.enabled ? 'ON' : 'OFF'}</strong>
            <div class="xsmall muted">${esc(live.enabled
              ? `Mode: ${live.mode === 'users' ? 'per-user PINs' : 'one shared PIN'}`
              : (live._reason || 'no configuration file'))}</div>
          </div>
          <span class="badge ${live.enabled ? 'badge-measured' : 'badge-literature'}">
            ${live.enabled ? 'Enabled' : 'Disabled'}</span>
        </div>
        ${live._source ? `<div class="xsmall muted" style="margin-top:.5rem">
          Read from ${esc({ endpoint: 'the live endpoint', cache: 'the last known list (endpoint unreachable)',
                            file: 'data/access.json' }[live._source] || live._source)}.</div>` : ''}
        ${store.getUser() ? `<div class="xsmall muted" style="margin-top:.7rem">
          Signed in on this device as <code>${esc(store.getUser())}</code> —
          <a href="#" id="admin-signout">sign out</a></div>` : ''}
      </div></div>`)}

    <section class="section" id="live-section" hidden>
      <div class="section-head"><h2>Manage people</h2>
        <span class="section-note">changes apply immediately — no commit</span></div>
      <div class="panel"><div class="panel-body stack" id="live-body"></div></div>
    </section>

    ${section('Configure', `
      <div class="panel"><div class="panel-body stack">

        <label class="row" style="justify-content:space-between;cursor:pointer">
          <span><strong>Require a PIN</strong>
            <div class="xsmall muted">Leave off and EDMGLAB opens straight to the dashboard.</div></span>
          <input type="checkbox" id="f-enabled" ${draft.enabled ? 'checked' : ''} style="width:20px;height:20px">
        </label>

        <div id="pin-settings" ${draft.enabled ? '' : 'hidden'} class="stack">

          <div>
            <strong>How PINs work here</strong>
            <div class="radio-row" style="margin-top:.5rem">
              <label><input type="radio" name="mode" value="shared" ${draft.mode === 'shared' ? 'checked' : ''}>
                <span>One shared PIN for the whole group</span></label>
              <label><input type="radio" name="mode" value="users" ${draft.mode === 'users' ? 'checked' : ''}>
                <span>A PIN per person <span class="muted">— also keeps each person's progress separate on a shared machine</span></span></label>
            </div>
          </div>

          <!-- Shared PIN -->
          <div id="mode-shared" ${draft.mode === 'shared' ? '' : 'hidden'}>
            <label class="field">
              <span class="field-label">Shared PIN (4 digits)</span>
              <input type="text" inputmode="numeric" maxlength="4" id="f-pin" class="pin-field" placeholder="••••">
            </label>
            <p class="xsmall muted" style="margin:.4rem 0 0">
              ${draft.pin ? 'A PIN is already set. Leave blank to keep it, or type a new one to replace it.'
                          : 'No PIN set yet.'}
              Pick a number you do not use anywhere else — see the note at the bottom of this page.
            </p>
          </div>

          <!-- Per-user PINs -->
          <div id="mode-users" ${draft.mode === 'users' ? '' : 'hidden'}>
            <div id="user-list" class="stack-sm"></div>
            <div class="row" style="margin-top:.7rem;align-items:flex-end;gap:.6rem">
              <label class="field" style="flex:1 1 180px">
                <span class="field-label">Name</span>
                <input type="text" id="f-uname" placeholder="e.g. Krishna" maxlength="40">
              </label>
              <label class="field" style="flex:0 0 110px">
                <span class="field-label">PIN</span>
                <input type="text" inputmode="numeric" maxlength="4" id="f-upin" class="pin-field" placeholder="••••">
              </label>
              <button type="button" class="btn" id="f-adduser">Add person</button>
            </div>
          </div>

          <label class="field">
            <span class="field-label">Message on the PIN screen</span>
            <input type="text" id="f-message" maxlength="120" value="${esc(draft.message)}">
          </label>

          <label class="field">
            <span class="field-label">Hint <span class="muted">(optional — shown to everyone, so keep it vague)</span></span>
            <input type="text" id="f-hint" maxlength="80" value="${esc(draft.hint)}">
          </label>

          <label class="field">
            <span class="field-label">Stay signed in for (days, 0 = every visit)</span>
            <input type="number" id="f-remember" min="0" max="365" value="${draft.rememberDays}" style="max-width:120px">
          </label>
        </div>

        <div class="row">
          <button type="button" class="btn btn-primary" id="f-generate">Generate configuration</button>
          <span class="xsmall muted" id="f-status"></span>
        </div>
      </div></div>`)}

    <section class="section" id="out-section" hidden>
      <div class="section-head"><h2>Copy this into <code>data/access.json</code></h2></div>
      <div class="panel">
        <div class="panel-head">
          <span>data/access.json</span>
          <span style="flex:1"></span>
          <button type="button" class="btn btn-sm" id="f-copy">Copy</button>
        </div>
        <div class="panel-body">
          <pre class="config-out" id="f-output"></pre>
        </div>
      </div>
      ${callout(`<strong>To apply it:</strong> open <code>data/access.json</code> in GitHub's web editor,
        replace the whole file with the text above, and commit. The change is live in about a minute.
        Only a commit changes what the deployed site does — nothing you do on this page affects it.`, 'info')}
    </section>

    ${section('What gets stored', `
      <div class="panel"><div class="panel-body">
        <p class="small">The PIN itself is never written to the file. What is stored is a
        <strong>PBKDF2-SHA256</strong> derivation with a random salt and ${ITERATIONS.toLocaleString()}
        iterations.</p>
        <p class="small">That is there to protect <em>the PIN</em>, not the site. People reuse four-digit
        numbers on phones, lockers and bank cards, and a plaintext PIN in a public repository would leak a
        number someone uses elsewhere. Be clear-eyed about the limit though: there are only 10,000 possible
        four-digit PINs, so anyone with the config file can eventually recover it — the iteration count makes
        that take real time instead of being instant.</p>
        <p class="small" style="margin-bottom:0"><strong>So: choose a PIN you do not use for anything else.</strong></p>
      </div></div>`)}

    <style>
      .field { display:grid; gap:.3rem; }
      .field-label { font-size:var(--fs-xs); text-transform:uppercase; letter-spacing:.06em;
        color:var(--text-muted); font-weight:650; }
      .field input, .config-out {
        background:var(--surface-2); color:var(--text); border:1px solid var(--border);
        border-radius:var(--r-md); padding:.55rem .7rem; font:inherit; min-height:var(--touch-min); }
      .field input:focus { outline:2px solid var(--accent); outline-offset:1px; }
      .pin-field { font-family:var(--font-mono); letter-spacing:.4em; text-align:center; }
      .radio-row { display:grid; gap:.5rem; }
      .radio-row label { display:flex; gap:.6rem; align-items:flex-start; cursor:pointer;
        font-size:var(--fs-sm); padding:.4rem .55rem; border:1px solid var(--border);
        border-radius:var(--r-md); background:var(--surface-2); }
      .radio-row input { margin-top:.2rem; }
      .config-out { display:block; white-space:pre; overflow-x:auto; font-family:var(--font-mono);
        font-size:var(--fs-xs); line-height:1.55; margin:0; min-height:auto; }
      .user-row { display:flex; align-items:center; gap:.6rem; padding:.5rem .7rem;
        background:var(--surface-2); border:1px solid var(--border); border-radius:var(--r-md); }
      .user-row .u-name { flex:1; font-weight:550; font-size:var(--fs-sm); }
    </style>`;

  /* ── Wiring ────────────────────────────────────────────── */

  const $ = (s) => outlet.querySelector(s);

  $('#admin-signout')?.addEventListener('click', (e) => { e.preventDefault(); access.signOut(); });

  /* Live management appears only when data/access.json names an endpoint, and
     the module behind it is only downloaded then — a group that has not
     deployed the script pays nothing for a feature it does not have. */
  wireLive(outlet, $).catch((e) => console.warn('[admin] live management unavailable:', e.message));

  $('#f-enabled').addEventListener('change', (e) => {
    draft.enabled = e.target.checked;
    $('#pin-settings').hidden = !draft.enabled;
  });

  outlet.querySelectorAll('input[name="mode"]').forEach((r) => {
    r.addEventListener('change', () => {
      draft.mode = outlet.querySelector('input[name="mode"]:checked').value;
      $('#mode-shared').hidden = draft.mode !== 'shared';
      $('#mode-users').hidden = draft.mode !== 'users';
    });
  });

  function drawUsers() {
    const list = $('#user-list');
    if (!draft.users.length) {
      list.innerHTML = `<p class="small muted" style="margin:0">No people added yet.</p>`;
      return;
    }
    list.innerHTML = draft.users.map((u, i) => `
      <div class="user-row">
        <span class="u-name">${esc(u.name)}</span>
        <code class="xsmall muted">${esc(u.slug)}</code>
        <button type="button" class="btn btn-sm" data-rm="${i}">Remove</button>
      </div>`).join('');
    list.querySelectorAll('[data-rm]').forEach((b) => {
      b.addEventListener('click', () => { draft.users.splice(Number(b.dataset.rm), 1); drawUsers(); });
    });
  }
  drawUsers();

  $('#f-adduser').addEventListener('click', async () => {
    const name = $('#f-uname').value.trim();
    const pin = $('#f-upin').value.replace(/\D/g, '');
    const status = $('#f-status');
    if (!name) { status.textContent = 'Enter a name.'; return; }
    if (pin.length !== 4) { status.textContent = 'PIN must be exactly 4 digits.'; return; }
    const slug = access.slugify(name);
    if (draft.users.some((u) => u.slug === slug)) { status.textContent = 'That person is already listed.'; return; }

    status.textContent = 'Hashing…';
    try {
      const salt = randomSalt();
      const hash = await derive(pin, salt);
      draft.users.push({ name, slug, salt, hash, iterations: ITERATIONS });
      $('#f-uname').value = ''; $('#f-upin').value = '';
      status.textContent = `Added ${name}.`;
      drawUsers();
    } catch (e) {
      status.textContent = 'Could not hash: ' + e.message;
    }
  });

  $('#f-generate').addEventListener('click', async () => {
    const status = $('#f-status');
    status.textContent = '';

    const out = {
      _README: 'Generated by the EDMGLAB access panel (#/admin). This is a SOFT GATE, not security: EDMGLAB is a static site, so anyone with the URL can read any file directly without passing this PIN. Never commit confidential material to this repository.',
      schemaVersion: 1,
      enabled: draft.enabled,
      mode: draft.mode,
      message: $('#f-message').value.trim() || 'Enter the lab access PIN to continue.',
      hint: $('#f-hint').value.trim(),
      rememberDays: Math.max(0, Math.min(365, Number($('#f-remember').value) || 0))
    };

    if (draft.enabled && draft.mode === 'shared') {
      const typed = $('#f-pin').value.replace(/\D/g, '');
      if (typed) {
        if (typed.length !== 4) { status.textContent = 'PIN must be exactly 4 digits.'; return; }
        status.textContent = 'Hashing…';
        try {
          const salt = randomSalt();
          out.pin = { salt, hash: await derive(typed, salt), iterations: ITERATIONS };
        } catch (e) { status.textContent = 'Could not hash: ' + e.message; return; }
      } else if (draft.pin) {
        out.pin = draft.pin;                       // keep the existing one
      } else {
        status.textContent = 'Set a PIN, or turn the gate off.'; return;
      }
    }

    if (draft.enabled && draft.mode === 'users') {
      if (!draft.users.length) { status.textContent = 'Add at least one person, or turn the gate off.'; return; }
      out.users = draft.users;
    }

    $('#f-output').textContent = JSON.stringify(out, null, 2);
    $('#out-section').hidden = false;
    status.textContent = 'Generated — copy it into data/access.json and commit.';
    $('#out-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  $('#f-copy').addEventListener('click', async () => {
    const text = $('#f-output').textContent;
    const btn = $('#f-copy');
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = 'Copied';
    } catch {
      // Clipboard API needs a secure context and permission — select instead
      // so the user can copy manually rather than getting nothing.
      const r = document.createRange();
      r.selectNodeContents($('#f-output'));
      const sel = getSelection();
      sel.removeAllRanges(); sel.addRange(r);
      btn.textContent = 'Selected — press Ctrl/Cmd+C';
    }
    setTimeout(() => { btn.textContent = 'Copy'; }, 2500);
  });

  return { destroy() {} };
}

/* ══════════════════════════════════════════════════════════
   Live management
   ══════════════════════════════════════════════════════════
   Everything below runs only when an endpoint is configured. The rest of this
   page keeps working exactly as it did — the generate-and-commit flow is not
   replaced, because it is still the right answer for a group that has not
   deployed the script, and it is the only thing that works with no network.

   THE ADMIN KEY IS TYPED FOR EVERY ACTION AND IS NEVER STORED. Not in
   localStorage, not in a variable that outlives the call. A static page cannot
   keep a secret, so it does not pretend to. See js/lib/access-live.js.       */

async function wireLive(outlet, $) {
  const endpoint = await access.endpointUrl();
  if (!endpoint) return;

  const live = await import('../lib/access-live.js');
  const sec = $('#live-section');
  const body = $('#live-body');
  sec.hidden = false;

  let state = null;        // last fetched config
  let updated = null;

  body.innerHTML = '<div class="loading-row"><span class="spinner"></span> Reading the live list…</div>';

  try {
    const got = await live.fetchConfig(endpoint);
    state = got.config; updated = got.updated;
  } catch (e) {
    body.innerHTML = callout(`<strong>The endpoint is configured but did not answer.</strong>
      ${esc(e.message)}<br><br>The gate still works from <code>data/access.json</code>, and the
      generate-and-commit flow below is unaffected. Check the deployment steps in
      <code>docs/apps-script/README.md</code>.`, 'warn');
    return;
  }

  draw();

  function draw() {
    const users = state.users || [];
    body.innerHTML = `
      ${callout(`<strong>This is the list the site is actually using.</strong> A change here is live for
        everyone on their next visit — no commit, no deploy. The endpoint refuses any write without the
        admin key, which lives in Script Properties on Google's servers and is not in this repository.
        <br><br>
        <strong>One consequence to know about.</strong> A device that is offline keeps the last list it
        saw, so somebody you suspend keeps access on that device until it reconnects. That is a soft gate
        behaving like a soft gate; if you need someone out immediately, the answer is not a PIN.`, 'info')}

      <label class="field">
        <span class="field-label">Admin key <span class="muted">(not stored — typed for each change)</span></span>
        <input type="password" id="lv-key" autocomplete="off" placeholder="from Script Properties">
      </label>

      <label class="field">
        <span class="field-label">Your name <span class="muted">(optional — recorded in the audit log)</span></span>
        <input type="text" id="lv-by" maxlength="40" autocomplete="off" placeholder="who is making this change">
      </label>

      <div class="row" style="justify-content:space-between;align-items:center;
                              border-top:1px solid var(--border);padding-top:.8rem">
        <div>
          <strong>Gate is ${state.enabled ? 'ON' : 'OFF'}</strong>
          <div class="xsmall muted">Mode: ${esc(state.mode === 'users' ? 'per-user PINs' : 'one shared PIN')}${
            updated ? ` · last changed ${esc(new Date(updated).toLocaleString('en-GB'))}` : ''}</div>
        </div>
        <button type="button" class="btn btn-sm" id="lv-toggle">Turn ${state.enabled ? 'off' : 'on'}</button>
      </div>

      <div id="lv-people">
        <div class="field-label" style="margin-bottom:.4rem">People (${users.length})</div>
        ${users.length ? `<div class="stack-sm">${users.map((u) => `
          <div class="row lv-row" style="justify-content:space-between;align-items:center">
            <div>
              <strong>${esc(u.name)}</strong>
              <span class="chip ${u.enabled === false ? 'chip-warn' : 'chip-ok'}">${
                u.enabled === false ? 'suspended' : 'active'}</span>
              ${u.role === 'admin' ? '<span class="chip">admin</span>' : ''}
              <div class="xsmall muted"><code>${esc(u.slug)}</code>${
                u.added ? ` · added ${esc(new Date(u.added).toLocaleDateString('en-GB'))}` : ''}</div>
            </div>
            <div class="row" style="gap:.4rem">
              <button type="button" class="btn btn-sm" data-toggle="${esc(u.slug)}"
                      data-to="${u.enabled === false}">${u.enabled === false ? 'Restore' : 'Suspend'}</button>
              <button type="button" class="btn btn-sm" data-remove="${esc(u.slug)}">Remove</button>
            </div>
          </div>`).join('')}</div>`
        : '<p class="small muted">Nobody is on the list yet.</p>'}
      </div>

      <div class="row" style="align-items:flex-end;gap:.6rem;border-top:1px solid var(--border);padding-top:.8rem">
        <label class="field" style="flex:1 1 180px">
          <span class="field-label">Name</span>
          <input type="text" id="lv-name" maxlength="40" placeholder="e.g. Priya">
        </label>
        <label class="field" style="flex:0 0 110px">
          <span class="field-label">Their PIN</span>
          <input type="text" inputmode="numeric" maxlength="4" id="lv-pin" class="pin-field" placeholder="••••">
        </label>
        <button type="button" class="btn btn-primary" id="lv-add">Add person</button>
      </div>

      <p class="xsmall muted" id="lv-status" role="status" aria-live="polite"></p>

      <p class="xsmall muted" style="border-top:1px solid var(--border);padding-top:.7rem;margin-bottom:0">
        The PIN is turned into a PBKDF2 hash <strong>in this browser</strong> and only the hash is sent, so a
        PIN never reaches Google and never appears in a log. Tell the person their PIN yourself — nothing
        here can show it to you again.</p>`;

    const status = body.querySelector('#lv-status');
    const key = () => body.querySelector('#lv-key').value.trim();
    const by = () => body.querySelector('#lv-by').value.trim();

    /** Every action funnels through here: check the key is present, disable
     *  the buttons so a double-click cannot fire twice, run, refetch, redraw. */
    async function act(what, fn) {
      if (!key()) { say('Enter the admin key first.', true); return; }
      const buttons = [...body.querySelectorAll('button')];
      buttons.forEach((b) => { b.disabled = true; });
      say(what + '…');
      try {
        const res = await fn();
        state = res.config; updated = res.updated || updated;
        const k = key(), n = by();
        draw();
        // Redraw wipes the inputs; put the key and name back so an admin can
        // make three changes without typing the key three times.
        body.querySelector('#lv-key').value = k;
        body.querySelector('#lv-by').value = n;
        say('Done. Live for everyone on their next visit.');
      } catch (e) {
        buttons.forEach((b) => { b.disabled = false; });
        say(e.message, true);
      }
    }

    function say(msg, bad = false) {
      const s = body.querySelector('#lv-status');
      if (!s) return;
      s.textContent = msg;
      s.style.color = bad ? 'var(--chip-warn-fg)' : '';
    }
    void status;

    body.querySelector('#lv-toggle').addEventListener('click', () =>
      act(state.enabled ? 'Turning the gate off' : 'Turning the gate on',
        () => live.setGate(endpoint, key(), { enabled: !state.enabled, mode: state.mode }, by())));

    body.querySelectorAll('[data-toggle]').forEach((b) => {
      b.addEventListener('click', () => act(b.dataset.to === 'true' ? 'Restoring' : 'Suspending',
        () => live.setPersonEnabled(endpoint, key(), b.dataset.toggle, b.dataset.to === 'true', by())));
    });

    body.querySelectorAll('[data-remove]').forEach((b) => {
      b.addEventListener('click', () => {
        /* Two clicks, no dialog. A confirm() would block the extension and is
           banned in this codebase; making the button ask for itself is both
           safer and faster than a modal. */
        if (b.dataset.armed !== 'yes') {
          b.dataset.armed = 'yes';
          b.textContent = 'Really remove?';
          setTimeout(() => { if (b.isConnected) { b.dataset.armed = ''; b.textContent = 'Remove'; } }, 4000);
          return;
        }
        act('Removing', () => live.removePerson(endpoint, key(), b.dataset.remove, by()));
      });
    });

    body.querySelector('#lv-add').addEventListener('click', () => {
      const name = body.querySelector('#lv-name').value.trim();
      const pin = body.querySelector('#lv-pin').value.trim();
      if (!name) { say('Give the person a name.', true); return; }
      if (!/^\d{4}$/.test(pin)) { say('A PIN must be exactly four digits.', true); return; }
      act('Adding ' + name, () => live.addPerson(endpoint, key(), { name, pin, by: by() }));
    });
  }
}
