/**
 * EDMGLAB — Suggest a correction (Roadmap Phase 14)
 *
 * The rule this view is built around: never claim a correction was sent when
 * it was not. Everything typed is written to the local queue BEFORE anything
 * is attempted, and only marked sent once a destination has accepted it. The
 * page says which destination it is going to use, in plain words, above the
 * button rather than after it.
 *
 * See js/lib/feedback.js for why there are three destinations and what each
 * one is for.
 */

import { esc, pageHead, callout } from '../ui.js';
import * as fb from '../lib/feedback.js';

let conf = null;

export async function render(outlet, ctx) {
  conf = await fb.config();
  const about = ctx?.query?.get('about') || '';
  const record = ctx?.query?.get('record') || '';

  outlet.innerHTML = `
    ${pageHead('Suggest a correction',
      'All the science on this platform is draft. If something here is wrong, this is where to say so.')}
    <div id="sg-dest"></div>
    <form id="sg-form" class="sg-form" novalidate>
      <div class="panel"><div class="panel-body sg-body">

        <div class="sg-field">
          <label class="field-label" for="sg-cat">What kind of problem is it?</label>
          <select id="sg-cat" class="sg-input">
            ${conf.categories.map((c) => `<option value="${esc(c.id)}">${esc(c.label)}</option>`).join('')}
          </select>
          <p class="sg-hint" id="sg-cat-hint"></p>
        </div>

        <div class="sg-row">
          <div class="sg-field">
            <label class="field-label" for="sg-page">Which page?</label>
            <input id="sg-page" class="sg-input" type="text" value="${esc(about)}"
                   placeholder="#/formula/specific_capacitance">
          </div>
          <div class="sg-field">
            <label class="field-label" for="sg-record">Record id, if you know it</label>
            <input id="sg-record" class="sg-input" type="text" value="${esc(record)}"
                   placeholder="formula.specific_capacitance">
          </div>
        </div>

        <div class="sg-field">
          <label class="field-label" for="sg-problem">What is wrong?</label>
          <textarea id="sg-problem" class="sg-input" rows="4" required
            placeholder="Be specific about what is incorrect, and why."></textarea>
        </div>

        <div class="sg-field">
          <label class="field-label" for="sg-suggested">What should it say instead? <span class="sg-opt">optional</span></label>
          <textarea id="sg-suggested" class="sg-input" rows="3"
            placeholder="A replacement sentence, a corrected number, a missing caveat."></textarea>
        </div>

        <div class="sg-field">
          <label class="field-label" for="sg-source">Source <span class="sg-opt">optional, but the fastest way to get a change accepted</span></label>
          <input id="sg-source" class="sg-input" type="text"
                 placeholder="A DOI, a paper, a manual, or 'our own measurement, 12 March'">
          <p class="sg-hint">A correction with a citation can be applied straight away. One without needs
            someone to go and find the source first, which is usually where it stalls.</p>
        </div>

        <div class="sg-field">
          <label class="field-label" for="sg-who">Your name <span class="sg-opt">optional</span></label>
          <input id="sg-who" class="sg-input" type="text" placeholder="So somebody can ask you about it">
        </div>

      </div></div>

      <div class="sg-actions">
        <button type="submit" class="btn btn-primary" id="sg-send"></button>
        <button type="button" class="btn" id="sg-preview-btn" aria-expanded="false">Show what will be sent</button>
        <span class="sg-status" id="sg-status" role="status"></span>
      </div>

      <pre class="sg-preview" id="sg-preview" hidden></pre>
    </form>

    <section class="section" id="sg-queue-wrap"></section>

    <style>
      .sg-body { display:grid; gap:1.1rem; }
      .sg-row { display:grid; gap:1.1rem; grid-template-columns:1fr; }
      @media (min-width:760px){ .sg-row { grid-template-columns:1fr 1fr; } }
      .sg-field { display:grid; gap:.35rem; }
      .sg-opt { font-weight:500; color:var(--text-muted); }
      .sg-input {
        width:100%; font:inherit; font-size:var(--fs-sm);
        background:var(--surface-2); color:var(--text);
        border:1px solid var(--border); border-radius:var(--r-sm);
        padding:.5rem .6rem; min-height:40px;
      }
      textarea.sg-input { min-height:auto; line-height:1.5; resize:vertical; }
      .sg-input:focus-visible { border-color:var(--accent); }
      .sg-hint { margin:0; font-size:var(--fs-xs); color:var(--text-muted); max-width:70ch; }
      .sg-actions { display:flex; flex-wrap:wrap; gap:.6rem; align-items:center; margin-top:1rem; }
      .sg-status { font-size:var(--fs-sm); color:var(--text-2); }
      .sg-status.ok { color:var(--ok); }
      .sg-status.bad { color:var(--danger); }
      .sg-preview {
        margin-top:1rem; padding:1rem; white-space:pre-wrap; word-break:break-word;
        background:var(--surface); border:1px solid var(--border); border-radius:var(--r-md);
        font-family:var(--font-mono); font-size:var(--fs-xs); color:var(--text-2); max-width:100%;
      }
      .sg-q { display:grid; gap:.3rem; padding:.75rem .9rem; border-bottom:1px solid var(--border); }
      .sg-q:last-child { border-bottom:0; }
      .sg-q-top { display:flex; gap:.6rem; align-items:baseline; flex-wrap:wrap; }
      .sg-q-title { font-weight:600; font-size:var(--fs-sm); flex:1 1 14rem; min-width:0; }
      .sg-q-meta { font-size:var(--fs-xs); color:var(--text-muted); font-family:var(--font-mono); }
      .sg-q-acts { display:flex; gap:.4rem; flex-wrap:wrap; }
    </style>`;

  const $ = (s) => outlet.querySelector(s);
  const cat = $('#sg-cat');
  const status = $('#sg-status');

  const hint = () => {
    const c = conf.categories.find((x) => x.id === cat.value);
    $('#sg-cat-hint').textContent = c ? c.hint : '';
  };
  cat.addEventListener('change', hint);
  hint();

  renderDestination($('#sg-dest'), $('#sg-send'));
  renderQueue(outlet);

  const collect = () => fb.newCorrection({
    category: cat.value,
    page: $('#sg-page').value.trim(),
    recordId: $('#sg-record').value.trim(),
    problem: $('#sg-problem').value.trim(),
    suggested: $('#sg-suggested').value.trim(),
    source: $('#sg-source').value.trim(),
    who: $('#sg-who').value.trim()
  });

  $('#sg-preview-btn').addEventListener('click', (e) => {
    const pre = $('#sg-preview');
    const show = pre.hidden;
    pre.hidden = !show;
    e.currentTarget.setAttribute('aria-expanded', String(show));
    e.currentTarget.textContent = show ? 'Hide what will be sent' : 'Show what will be sent';
    if (show) {
      const c = collect();
      pre.textContent = `${fb.formatTitle(c, conf.categories)}\n\n${fb.formatBody(c, conf.categories)}`;
    }
  });

  $('#sg-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const c = collect();
    if (!c.problem) {
      status.className = 'sg-status bad';
      status.textContent = 'Say what is wrong first — the rest is optional.';
      $('#sg-problem').focus();
      return;
    }

    // Queue BEFORE attempting anything. Nothing typed here is ever lost to a
    // failed request, a closed tab or a browser that decided not to open a
    // new window.
    const item = fb.enqueue(c);
    status.className = 'sg-status';
    status.textContent = 'Saved on this device…';

    try {
      if (conf.mode === 'endpoint') {
        await fb.postToEndpoint(c, conf);
        fb.markSent(item.id, 'endpoint');
        status.className = 'sg-status ok';
        status.textContent = 'Sent to the group\'s correction sheet.';
      } else if (conf.mode === 'github') {
        const { url, truncated } = fb.issueUrl(c, conf);
        await copy(`${fb.formatTitle(c, conf.categories)}\n\n${fb.formatBody(c, conf.categories)}`);
        const win = window.open(url, '_blank', 'noopener');
        if (win) {
          // The issue is not filed until they press Submit on GitHub, so this
          // is marked "opened", not "sent" — and it stays in the queue below
          // until they say it is done.
          status.className = 'sg-status ok';
          status.textContent = truncated
            ? 'GitHub opened. The text was too long for the link, so the full version is on your clipboard — paste it in.'
            : 'GitHub opened with the issue filled in. Press Submit there to file it.';
        } else {
          status.className = 'sg-status bad';
          status.textContent = 'The browser blocked the new tab. It is copied to your clipboard, and saved below.';
        }
      } else {
        await copy(fb.asMarkdown([c], conf.categories));
        status.className = 'sg-status ok';
        status.textContent = 'Copied to your clipboard and saved below. Nothing was sent — this build has nowhere to send it.';
      }
    } catch (err) {
      status.className = 'sg-status bad';
      status.textContent = `Not sent: ${err.message}. It is saved below and can be sent again.`;
    }

    $('#sg-form').reset();
    hint();
    $('#sg-preview').hidden = true;
    $('#sg-preview-btn').textContent = 'Show what will be sent';
    $('#sg-preview-btn').setAttribute('aria-expanded', 'false');
    renderQueue(outlet);
  });

  return { destroy() {} };
}

/* ── Where is this going? Said before the button, not after. ── */

function renderDestination(el, btn) {
  if (conf.mode === 'endpoint') {
    btn.textContent = 'Send correction';
    el.innerHTML = callout(`<strong>This goes to the group's correction sheet.</strong>
      Submitted through the group's Apps Script endpoint. You do not need a GitHub account.`, 'ok');
    return;
  }
  if (conf.mode === 'github') {
    btn.textContent = 'Open a GitHub issue';
    el.innerHTML = callout(`<strong>This opens a pre-filled issue on
      <code>${esc(conf.repo)}</code>.</strong> ${conf.derivedRepo
        ? 'That repository was read from the address this site is served from.'
        : 'That repository is set in <code>data/feedback.json</code>.'}
      You will need a GitHub account, and the issue is not filed until you press Submit there —
      so a copy is kept on this page until you say it is done.`, 'info');
    return;
  }
  btn.textContent = 'Save and copy';
  el.innerHTML = callout(`<strong>This build has nowhere to send corrections, so nothing will be
    transmitted.</strong> What you write is copied to your clipboard and kept on this page, so you can
    paste it into an email or a message. To change that, either serve the site from GitHub Pages —
    where the repository is derived automatically — or set <code>repo</code> or <code>endpoint</code>
    in <code>data/feedback.json</code>.`, 'warn');
}

/* ── What is still on this device ─────────────────────────── */

function renderQueue(outlet) {
  const wrap = outlet.querySelector('#sg-queue-wrap');
  const all = fb.queue();
  if (!all.length) { wrap.innerHTML = ''; return; }

  const open = all.filter((x) => !x.sent);
  wrap.innerHTML = `
    <div class="section-head"><h2>On this device</h2>
      <span class="section-note">${open.length} not yet confirmed sent</span></div>
    ${callout(`These are kept in this browser only — they are not synchronised anywhere, and clearing
      site data removes them. Once a correction has been filed, mark it done so this list stays
      meaningful.`, 'info')}
    <div class="panel">
      ${all.map((c) => `
        <div class="sg-q">
          <div class="sg-q-top">
            <span class="sg-q-title">${esc(fb.formatTitle(c, conf.categories))}</span>
            <span class="sg-q-meta">${c.sent ? `done · ${esc((c.how || ''))}` : 'open'}</span>
          </div>
          <div class="sg-q-meta">${esc(c.page || '—')} · ${esc(new Date(c.at).toLocaleString())}</div>
          <div class="sg-q-acts">
            <button type="button" class="btn btn-sm" data-copy="${esc(c.id)}">Copy</button>
            ${c.sent ? '' : `<button type="button" class="btn btn-sm" data-done="${esc(c.id)}">Mark done</button>`}
            <button type="button" class="btn btn-sm" data-del="${esc(c.id)}">Remove</button>
          </div>
        </div>`).join('')}
    </div>
    <div class="sg-actions">
      <button type="button" class="btn" id="sg-copy-all">Copy all ${all.length}</button>
      <button type="button" class="btn" id="sg-download">Download as Markdown</button>
      <span class="sg-status" id="sg-q-status" role="status"></span>
    </div>`;

  const qs = wrap.querySelector('#sg-q-status');
  const say = (t) => { qs.textContent = t; };

  wrap.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
    const c = fb.queue().find((x) => x.id === b.dataset.copy);
    if (c) { await copy(fb.asMarkdown([c], conf.categories)); say('Copied.'); }
  }));
  wrap.querySelectorAll('[data-done]').forEach((b) => b.addEventListener('click', () => {
    fb.markSent(b.dataset.done, 'by hand'); renderQueue(outlet);
  }));
  wrap.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => {
    fb.remove(b.dataset.del); renderQueue(outlet);
  }));
  wrap.querySelector('#sg-copy-all').addEventListener('click', async () => {
    await copy(fb.asMarkdown(fb.queue(), conf.categories)); say('All copied.');
  });
  wrap.querySelector('#sg-download').addEventListener('click', () => {
    const blob = new Blob([fb.asMarkdown(fb.queue(), conf.categories)], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `edmglab-corrections-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    say('Downloaded.');
  });
}

/** Clipboard, with a fallback for browsers that refuse the async API. */
async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } finally { ta.remove(); }
  }
}
