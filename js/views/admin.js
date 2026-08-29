/**
 * EDMGLAB — Access control admin panel
 *
 * Generates the contents of `data/access.json`. It cannot write the file:
 * EDMGLAB is a static site with no server, so the admin copies the generated
 * JSON and commits it. That is a feature rather than a limitation — the access
 * configuration goes through the same reviewable commit history as everything
 * else, and no secret is ever typed into the repository directly (only a
 * PBKDF2 derivation of it).
 *
 * The panel is deliberately NOT gated. It has no power over what the deployed
 * site does — only a commit does — so hiding it would add friction without
 * adding protection. Anyone opening it sees settings they cannot apply.
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
        ${store.getUser() ? `<div class="xsmall muted" style="margin-top:.7rem">
          Signed in on this device as <code>${esc(store.getUser())}</code> —
          <a href="#" id="admin-signout">sign out</a></div>` : ''}
      </div></div>`)}

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
