/**
 * EDMGLAB — content review
 *
 * Sixty thousand words, none of it checked by anyone in the group, and the
 * platform says so on every page. This is where that stops being true.
 *
 * ── WHAT THIS IS NOT ──
 *
 * It is not an editor. A reviewer records a verdict and, where something is
 * wrong, says what it should say and where that comes from; somebody then
 * makes the change in the JSON and commits it. Letting a web page rewrite the
 * content would put scientific claims outside the reviewable commit history
 * that is the whole reason the content lives in git — and it is the one place
 * where the friction is worth keeping.
 *
 * ── THE THREE VERDICTS, AND WHY "UNSURE" EARNS ITS PLACE ──
 *
 *   correct as written · needs a change · I cannot judge this
 *
 * The third is not a cop-out. A postgraduate who knows electrochemistry and
 * not X-ray diffraction marking a diffraction entry "unsure" tells the group
 * that entry needs a different reviewer — which is information nobody has
 * otherwise, and which a two-button interface silently destroys by forcing a
 * guess.
 *
 * ── DISAGREEMENT IS SHOWN, NOT RESOLVED ──
 *
 * Two reviewers, two answers, and the page says so. The endpoint appends
 * rather than overwrites, so nobody's verdict is quietly replaced by whoever
 * clicked last. A disagreement about content is the most useful thing this
 * exercise can surface and the last thing it should hide.
 *
 * ── OPEN TO EVERYONE IN THE GROUP ──
 *
 * Not admin-only. The person best placed to check a diffraction entry is
 * whoever runs the diffractometer, and restricting this to whoever administers
 * the website would lose exactly the expertise the exercise needs. What a
 * reviewer cannot do is CHANGE anything: verdicts are recorded, the edit is
 * made in the JSON and committed, and sign-off is a separate deliberate step.
 *
 * Units come from js/lib/review-units.js, which the Word export also imports,
 * so the document and the page can never disagree about what there is.
 */

import { esc, pageHead, callout } from '../ui.js';
import * as data from '../data.js';
import { unitsIn, moduleName, PRIORITY } from '../lib/review-units.js';

const LOCAL_KEY = 'edmglab.review.local';

const VERDICTS = [
  { id: 'ok', label: 'Correct as written', cls: 'ok' },
  { id: 'change', label: 'Needs a change', cls: 'change' },
  { id: 'unsure', label: 'I cannot judge this', cls: 'unsure' }
];

export async function render(outlet, ctx) {
  const cfgUrl = new URL('../../data/review.json', import.meta.url).href;
  let cfg = {};
  try {
    const res = await fetch(cfgUrl, { cache: 'no-cache' });
    if (res.ok) cfg = await res.json();
  } catch { /* the page still works with verdicts kept locally */ }

  const keys = data.allKeys();
  await Promise.all(keys.map((k) => data.load(k).catch(() => null)));

  const modules = [];
  for (const { key, payload } of data.loadedFiles()) {
    const units = unitsIn(key, payload);
    if (units.length) modules.push({ key, name: moduleName(key), units });
  }
  const rank = (k) => {
    const i = PRIORITY.findIndex(([pk]) => pk === k);
    return i >= 0 ? i : PRIORITY.length + 1;
  };
  modules.sort((a, b) => rank(a.key) - rank(b.key) || b.units.length - a.units.length);

  const endpoint = String(cfg.endpoint || '').trim();
  const finalised = new Set(cfg.finalised || []);

  /* Verdicts from the endpoint if there is one, merged over anything recorded
     on this device. Local always wins for the current reviewer, so a verdict
     given while offline is not lost when the shared list loads. */
  let shared = {};
  let liveError = null;
  let live = null;
  if (endpoint) {
    try {
      live = await import('../lib/review-live.js');
      shared = await live.fetchReviews(endpoint);
    } catch (e) { liveError = e.message; }
  }

  const state = {
    local: readLocal(),
    shared,
    endpoint,
    live,
    reviewer: live?.remembered.name() || '',
    key: live?.remembered.key() || '',
    module: modules.find((m) => m.key === ctx?.params?.key) || modules[0],
    filter: 'todo'
  };

  outlet.innerHTML = shell(modules, cfg, state, liveError, finalised);
  wire(outlet, modules, state, finalised);
  return { destroy() {} };
}

/* ══════════════════════════════════════════════════════════ */

function verdictOf(state, id) {
  return state.local[id]?.verdict || state.shared[id]?.verdict || null;
}

function counts(units, state) {
  const c = { ok: 0, change: 0, unsure: 0, todo: 0, disagree: 0 };
  for (const u of units) {
    const v = verdictOf(state, u.id);
    if (v) c[v] = (c[v] || 0) + 1; else c.todo++;
    if (state.shared[u.id]?.disagreement) c.disagree++;
  }
  return c;
}

function shell(modules, cfg, state, liveError, finalised) {
  const all = modules.flatMap((m) => m.units);
  const c = counts(all, state);
  const done = all.length - c.todo;
  const pct = all.length ? Math.round((done / all.length) * 100) : 0;

  return `
    ${pageHead('Content review',
      'Every scientific claim in EDMGLAB, waiting to be checked by someone who knows the field.')}

    ${cfg.note ? callout(esc(cfg.note), 'info') : ''}

    ${liveError ? callout(`<strong>The shared review list did not load.</strong> ${esc(liveError)}
      Your verdicts are still being recorded on this device and can be exported at the bottom of this
      page.`, 'warn') : ''}

    ${!state.endpoint ? callout(`<strong>Verdicts are being kept in this browser only.</strong>
      That is enough for one person working through a module alone. For several people at once — seeing
      each other's progress and each other's disagreements — deploy the small script in
      <code>docs/apps-script/</code> and put its URL in <code>data/review.json</code>.
      Either way, use <strong>Export</strong> at the bottom to send what you have recorded.`, 'info') : ''}

    ${callout(`<strong>Anyone in the group can review, and that is the point.</strong> The person best
      placed to check an X-ray diffraction entry is whoever runs the diffractometer, not whoever
      administers the website. Put your name in — a verdict nobody can follow up is not much use — and
      work through whatever you actually know about. <strong>"I cannot judge this" is a real answer</strong>
      and often the most useful one: it says the entry needs a different reviewer, which is something
      nobody knows until you say it.`, 'info')}

    <section class="section">
      <div class="section-head"><h2>Where it stands</h2>
        <span class="section-note">${all.length} entries · about
          ${Math.round(all.reduce((n, u) => n + u.words, 0) / 1000)}k words</span></div>
      <div class="rv-summary">
        <div>
          <div class="rv-big">${pct}<span>%</span></div>
          <div class="rv-sub">${done} of ${all.length} entries have a verdict</div>
        </div>
        <div class="rv-tallies">
          <span class="chip chip-ok">${c.ok} correct</span>
          <span class="chip chip-warn">${c.change} need a change</span>
          <span class="chip">${c.unsure} need a different reviewer</span>
          ${c.disagree ? `<span class="chip chip-warn">${c.disagree} disagreed</span>` : ''}
          ${finalised.size ? `<span class="chip chip-ok">${finalised.size} signed off</span>` : ''}
        </div>
      </div>
      ${callout(`<strong>Read the safety section first, with your safety officer.</strong> It is the only
        part of this platform where being wrong could hurt somebody. Nothing else on the list outranks
        it.`, 'warn')}
    </section>

    <section class="section">
      <div class="section-head"><h2>Modules</h2>
        <span class="section-note">in the order worth doing them</span></div>
      <div class="rv-mods">
        ${modules.map((m) => {
          const mc = counts(m.units, state);
          const mdone = m.units.length - mc.todo;
          /* PRIORITY is an ordered list, so `find` matches all six of them and
             every one claimed to be "first". Only the head of the list is
             first; the rest carry their position, which is the information
             that was actually meant. */
          const pr = PRIORITY.findIndex(([k]) => k === m.key);
          const badge = pr === 0 ? '<span class="chip chip-warn">start here</span>'
            : pr > 0 ? `<span class="chip">${pr + 1}</span>` : '';
          return `<button type="button" class="rv-mod${m.key === state.module.key ? ' on' : ''}"
                    data-mod="${esc(m.key)}" title="${esc(pr >= 0 ? PRIORITY[pr][1] : '')}">
            <div class="rv-mod-h">${esc(m.name)}${badge}</div>
            <div class="rv-bar"><span style="width:${m.units.length ? (mdone / m.units.length) * 100 : 0}%"></span></div>
            <div class="rv-sub">${mdone} / ${m.units.length}${mc.change ? ` · ${mc.change} flagged` : ''}</div>
          </button>`;
        }).join('')}
      </div>
    </section>

    <section class="section">
      <div class="section-head"><h2 id="rv-mod-title">${esc(state.module?.name || '')}</h2>
        <span class="section-note" id="rv-mod-note"></span></div>

      <div class="rv-who">
        <label class="field" style="flex:1 1 200px">
          <span class="field-label">Your name</span>
          <input type="text" id="rv-name" maxlength="60" autocomplete="off"
                 value="${esc(state.reviewer)}" placeholder="so a verdict can be followed up">
        </label>
        ${state.endpoint ? `<label class="field" style="flex:1 1 200px">
          <span class="field-label">Review key
            <span class="muted">(the group's shared key — ask whoever set this up)</span></span>
          <input type="password" id="rv-key" autocomplete="off" value="${esc(state.key)}">
        </label>` : ''}
        <div class="rv-filter">
          ${[['todo', 'Not yet checked'], ['all', 'All'], ['change', 'Flagged'], ['disagree', 'Disagreed']]
            .map(([id, label]) => `<button type="button" class="btn btn-sm rv-f${id === 'todo' ? ' on' : ''}"
              data-filter="${id}">${label}</button>`).join('')}
        </div>
      </div>

      <div id="rv-list" class="rv-list"></div>
      <p class="xsmall muted" id="rv-status" role="status" aria-live="polite"></p>
    </section>

    <section class="section">
      <div class="section-head"><h2>Send it back</h2></div>
      <div class="panel"><div class="panel-body">
        <p class="small">Everything recorded on this device, as a file. Send it to whoever is collating —
          it carries the ids, so it can be applied without guesswork.</p>
        <div class="row">
          <button type="button" class="btn" id="rv-export">Export my verdicts</button>
          <button type="button" class="btn btn-sm" id="rv-clear">Clear what is on this device</button>
          ${state.endpoint ? `<button type="button" class="btn btn-sm" id="rv-forget">Forget the review key</button>` : ''}
        </div>
        <p class="xsmall muted" style="margin:.6rem 0 0">The review key is remembered on this device so
          you do not retype it once per verdict. On a shared lab machine, forget it when you are
          done.</p>
      </div></div>
    </section>

    ${STYLE}`;
}

/* ══════════════════════════════════════════════════════════ */

function unitCard(u, state, finalised) {
  const localV = state.local[u.id];
  const sharedV = state.shared[u.id];
  const v = localV?.verdict || sharedV?.verdict || null;
  const dis = sharedV?.disagreement;

  return `<article class="rv-card${v ? ' done' : ''}" data-id="${esc(u.id)}">
    <div class="rv-card-h">
      <div>
        <h3>${esc(u.title)}</h3>
        <div class="rv-id"><code>${esc(u.id)}</code> · ${u.words} words</div>
      </div>
      <div class="rv-flags">
        ${finalised.has(u.id) ? '<span class="chip chip-ok">signed off</span>' : ''}
        ${dis ? '<span class="chip chip-warn">reviewers disagree</span>' : ''}
        ${sharedV && !localV ? `<span class="chip">${esc(sharedV.reviewer || 'someone')}</span>` : ''}
      </div>
    </div>

    <div class="rv-body">
      ${u.fields.map(([label, text]) => text === null
        ? `<div class="rv-sub-h">${esc(label)}</div>`
        : `<div class="rv-field${label.startsWith('   ') ? ' nested' : ''}">
             ${label.trim() ? `<div class="rv-label">${esc(label.trim())}</div>` : ''}
             <div class="rv-text">${esc(text).replace(/\n/g, '<br>')}</div>
           </div>`).join('')}
    </div>

    <div class="rv-verdicts">
      ${VERDICTS.map((x) => `<button type="button" class="rv-v ${x.cls}${v === x.id ? ' on' : ''}"
        data-v="${x.id}" aria-pressed="${v === x.id}">${x.label}</button>`).join('')}
    </div>

    <div class="rv-note-wrap"${v === 'change' || localV?.note ? '' : ' hidden'}>
      <label class="field">
        <span class="field-label">What should it say, and where does that come from?</span>
        <textarea class="rv-note" rows="2" placeholder="A correction without a source cannot be acted on."
          >${esc(localV?.note || '')}</textarea>
      </label>
    </div>
  </article>`;
}

function wire(outlet, modules, state, finalised) {
  const $ = (s) => outlet.querySelector(s);
  const list = $('#rv-list');
  const status = $('#rv-status');

  const say = (m, bad = false) => {
    status.textContent = m;
    status.style.color = bad ? 'var(--chip-warn-fg)' : '';
  };

  function visible() {
    const units = state.module?.units || [];
    if (state.filter === 'all') return units;
    if (state.filter === 'change') return units.filter((u) => verdictOf(state, u.id) === 'change');
    if (state.filter === 'disagree') return units.filter((u) => state.shared[u.id]?.disagreement);
    return units.filter((u) => !verdictOf(state, u.id));
  }

  function draw() {
    const units = visible();
    $('#rv-mod-title').textContent = state.module?.name || '';
    const c = counts(state.module?.units || [], state);
    $('#rv-mod-note').textContent =
      `${(state.module?.units.length || 0) - c.todo} of ${state.module?.units.length || 0} checked`;

    list.innerHTML = units.length
      ? units.map((u) => unitCard(u, state, finalised)).join('')
      : `<p class="small muted" style="padding:1rem">Nothing here under this filter.
         ${state.filter === 'todo' ? 'Every entry in this module has a verdict.' : ''}</p>`;

    list.querySelectorAll('.rv-card').forEach((card) => {
      const id = card.dataset.id;
      const unit = (state.module?.units || []).find((u) => u.id === id);
      card.querySelectorAll('.rv-v').forEach((b) => {
        b.addEventListener('click', () => setVerdict(card, unit, b.dataset.v));
      });
      const note = card.querySelector('.rv-note');
      note?.addEventListener('change', () => {
        const cur = state.local[id];
        if (!cur) return;
        cur.note = note.value.trim();
        writeLocal(state.local);
        send(unit, cur, true);
      });
    });
  }

  function setVerdict(card, unit, verdict) {
    if (!unit) return;
    const name = $('#rv-name').value.trim();
    if (!name) { say('Put your name in first — a verdict nobody can follow up is not much use.', true); return; }

    const note = card.querySelector('.rv-note');
    const entry = { verdict, note: note?.value.trim() || '', at: Date.now(), by: name };
    state.local[unit.id] = entry;
    writeLocal(state.local);

    card.querySelectorAll('.rv-v').forEach((b) => {
      const on = b.dataset.v === verdict;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    card.classList.add('done');
    card.querySelector('.rv-note-wrap').hidden = verdict !== 'change' && !entry.note;
    if (verdict === 'change') note?.focus();

    refreshTallies();
    send(unit, entry, false);
  }

  async function send(unit, entry, isNoteEdit) {
    if (!state.endpoint || !state.live) {
      say(isNoteEdit ? 'Note saved on this device.' : 'Recorded on this device.');
      return;
    }
    const key = $('#rv-key')?.value.trim();
    const name = $('#rv-name').value.trim();
    if (!key) { say('Recorded here. Add the review key to share it with the group.', true); return; }
    state.live.remembered.save(key, name);
    try {
      say('Sending…');
      await state.live.submit(state.endpoint, {
        reviewKey: key, reviewer: name,
        entries: [{ id: unit.id, module: state.module.key, verdict: entry.verdict, note: entry.note }]
      });
      say('Shared with the group.');
    } catch (e) {
      say('Recorded here, but not shared: ' + e.message, true);
    }
  }

  function refreshTallies() {
    const all = modules.flatMap((m) => m.units);
    const c = counts(all, state);
    const done = all.length - c.todo;
    const big = outlet.querySelector('.rv-big');
    if (big) big.innerHTML = `${Math.round((done / all.length) * 100)}<span>%</span>`;
    const sub = outlet.querySelector('.rv-summary .rv-sub');
    if (sub) sub.textContent = `${done} of ${all.length} entries have a verdict`;
    outlet.querySelectorAll('.rv-mod').forEach((b) => {
      const m = modules.find((x) => x.key === b.dataset.mod);
      if (!m) return;
      const mc = counts(m.units, state);
      const md = m.units.length - mc.todo;
      b.querySelector('.rv-bar span').style.width = `${(md / m.units.length) * 100}%`;
      b.querySelector('.rv-sub').textContent =
        `${md} / ${m.units.length}${mc.change ? ` · ${mc.change} flagged` : ''}`;
    });
  }

  outlet.querySelectorAll('.rv-mod').forEach((b) => {
    b.addEventListener('click', () => {
      state.module = modules.find((m) => m.key === b.dataset.mod);
      outlet.querySelectorAll('.rv-mod').forEach((x) => x.classList.toggle('on', x === b));
      draw();
    });
  });

  outlet.querySelectorAll('[data-filter]').forEach((b) => {
    b.addEventListener('click', () => {
      state.filter = b.dataset.filter;
      outlet.querySelectorAll('[data-filter]').forEach((x) => x.classList.toggle('on', x === b));
      draw();
    });
  });

  $('#rv-export').addEventListener('click', () => {
    const rows = Object.entries(state.local).map(([id, v]) => ({
      id, verdict: v.verdict, note: v.note || '', by: v.by || '', at: new Date(v.at).toISOString()
    }));
    if (!rows.length) { say('Nothing recorded on this device yet.', true); return; }
    const blob = new Blob([JSON.stringify({
      _what: 'EDMGLAB content review. One entry per reviewed unit; `id` matches the record in data/.',
      exported: new Date().toISOString(),
      reviewer: $('#rv-name').value.trim(),
      count: rows.length,
      verdicts: rows
    }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `edmglab-review-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    say(`Exported ${rows.length} verdicts.`);
  });

  $('#rv-forget')?.addEventListener('click', () => {
    state.live?.remembered.forget();
    const f = $('#rv-key'); if (f) f.value = '';
    say('Key forgotten on this device. Verdicts already sent are unaffected.');
  });

  $('#rv-clear').addEventListener('click', (e) => {
    const b = e.currentTarget;
    /* Two clicks, no confirm() — a modal dialog blocks the page and is banned
       in this codebase. Making the button ask for itself is safer and faster. */
    if (b.dataset.armed !== 'yes') {
      b.dataset.armed = 'yes';
      b.textContent = 'Really clear? This cannot be undone';
      setTimeout(() => { b.dataset.armed = ''; b.textContent = 'Clear what is on this device'; }, 4000);
      return;
    }
    state.local = {};
    writeLocal(state.local);
    b.dataset.armed = ''; b.textContent = 'Clear what is on this device';
    draw(); refreshTallies();
    say('Cleared. Anything already shared with the group is unaffected.');
  });

  draw();
}

function readLocal() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}') || {}; } catch { return {}; }
}
function writeLocal(v) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(v)); } catch { /* quota, private mode */ }
}

const STYLE = `
  <style>
    .rv-summary { display:grid; gap:1rem; grid-template-columns:1fr; align-items:center;
                  padding:1rem; background:var(--surface); border:1px solid var(--border);
                  border-radius:var(--r-lg); margin-bottom:1rem; }
    @media (min-width:700px){ .rv-summary { grid-template-columns:auto 1fr; gap:2rem; } }
    .rv-big { font-family:var(--font-mono); font-size:var(--fs-2xl); font-weight:700;
              color:var(--accent-strong); line-height:1; }
    .rv-big span { font-size:var(--fs-md); color:var(--text-muted); }
    .rv-sub { font-size:var(--fs-xs); color:var(--text-muted); }
    .rv-tallies { display:flex; flex-wrap:wrap; gap:.4rem; }

    .rv-mods { display:grid; gap:.6rem; grid-template-columns:repeat(auto-fill,minmax(230px,1fr)); }
    .rv-mod { text-align:left; padding:.7rem .8rem; background:var(--surface);
              border:1px solid var(--border); border-radius:var(--r-md); color:inherit; font:inherit;
              cursor:pointer; }
    .rv-mod:hover { border-color:var(--accent); }
    .rv-mod.on { border-color:var(--accent); background:var(--surface-2); }
    .rv-mod-h { font-size:var(--fs-sm); font-weight:600; display:flex; gap:.4rem;
                align-items:center; flex-wrap:wrap; margin-bottom:.4rem; }
    .rv-bar { height:6px; border-radius:3px; background:var(--surface-2);
              border:1px solid var(--border); overflow:hidden; margin-bottom:.3rem; }
    .rv-bar span { display:block; height:100%; background:var(--ok); }

    .rv-who { display:flex; flex-wrap:wrap; gap:.7rem; align-items:flex-end; margin-bottom:1rem; }
    .rv-filter { display:flex; gap:.3rem; flex-wrap:wrap; }
    .rv-f.on { border-color:var(--accent); color:var(--accent-strong); }

    .rv-list { display:grid; gap:.8rem; }
    .rv-card { border:1px solid var(--border); border-radius:var(--r-lg); background:var(--surface);
               overflow:hidden; }
    .rv-card.done { border-left:4px solid var(--ok); }
    .rv-card-h { display:flex; justify-content:space-between; gap:.8rem; align-items:flex-start;
                 padding:.75rem .9rem; background:var(--surface-2); }
    .rv-card-h h3 { margin:0; font-size:var(--fs-base); }
    .rv-id { font-size:var(--fs-2xs); color:var(--text-muted); }
    .rv-flags { display:flex; gap:.3rem; flex-wrap:wrap; flex:none; }
    .rv-body { padding:.85rem .9rem; max-width:82ch; }
    .rv-sub-h { font-size:var(--fs-sm); font-weight:600; margin:.7rem 0 .3rem; }
    .rv-field { margin-bottom:.6rem; }
    .rv-field.nested { padding-left:1rem; border-left:2px solid var(--border); }
    .rv-label { font-size:var(--fs-2xs); text-transform:uppercase; letter-spacing:.06em;
                color:var(--text-muted); margin-bottom:.15rem; }
    .rv-text { font-size:var(--fs-sm); }
    .rv-verdicts { display:flex; gap:.4rem; flex-wrap:wrap; padding:.7rem .9rem;
                   border-top:1px solid var(--border); }
    .rv-v { font:inherit; font-size:var(--fs-sm); padding:.4rem .7rem; min-height:34px;
            border-radius:var(--r-pill); border:1px solid var(--border);
            background:var(--surface-2); color:var(--text-2); cursor:pointer; }
    .rv-v:hover { border-color:var(--accent); }
    .rv-v.on.ok { background:color-mix(in srgb, var(--ok) 14%, transparent);
                  border-color:var(--ok); color:var(--chip-ok-fg); font-weight:600; }
    .rv-v.on.change { background:color-mix(in srgb, var(--warn) 14%, transparent);
                      border-color:var(--warn); color:var(--chip-warn-fg); font-weight:600; }
    .rv-v.on.unsure { background:var(--surface); border-color:var(--text-muted);
                      color:var(--text); font-weight:600; }
    .rv-note-wrap { padding:0 .9rem .8rem; }
    .rv-note { width:100%; font:inherit; font-size:var(--fs-sm); background:var(--surface-2);
               color:var(--text); border:1px solid var(--border); border-radius:var(--r-sm);
               padding:.5rem .6rem; }
  </style>`;
