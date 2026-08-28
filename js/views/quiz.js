/**
 * EDMGLAB — Learning check (Roadmap P12)
 *
 * ────────────────────────────────────────────────────────────────────────
 *  A JUDGEMENT QUIZ, NOT A RECALL QUIZ.
 * ────────────────────────────────────────────────────────────────────────
 *
 * Every question asks the kind of judgement that actually goes wrong in this
 * group's work — which quantity is valid, what a result does and does not
 * license, which of two conventions applies. Almost none of them can be
 * answered by remembering a definition.
 *
 * Three things follow from that, and they are the whole design:
 *
 *  1. EVERY OPTION EXPLAINS ITSELF, including the wrong ones. Explaining why a
 *     plausible wrong answer is plausible is where the teaching is; a quiz that
 *     only explains the right answer teaches nothing about the trap. The health
 *     check refuses a question whose options do not all carry a `why`.
 *
 *  2. "YOU CANNOT TELL FROM THIS ALONE" IS OFTEN CORRECT, and is presented as a
 *     real answer rather than a hedge — with the explanation saying what WOULD
 *     settle it. A quiz that always rewarded a confident choice would undo what
 *     the rest of the platform teaches.
 *
 *  3. NOTHING IS SCORED AGAINST THE PERSON. There is no pass mark, no timer and
 *     no leaderboard. The tally exists so you can see which areas to revisit,
 *     and it is stored per-user in this browser and nowhere else.
 *
 * After answering, the reader sees the explanation for THEIR choice and for the
 * correct one, then a link into the module that covers it — so a wrong answer
 * routes somewhere rather than just being marked.
 */

import { esc, pageHead, callout, notAuthored } from '../ui.js';
import * as data from '../data.js';
import * as store from '../lib/storage.js';

const PROGRESS_KEY = 'quiz.progress.v1';

export async function render(outlet) {
  const payload = await data.load('quiz');
  const all = payload.items || [];
  const cats = payload.categories || [];

  if (!all.length) {
    outlet.innerHTML = pageHead('Learning check', '') + notAuthored('The learning check');
    return { destroy() {} };
  }

  // Answered questions, remembered per user so the tally survives a reload.
  let progress = store.get(PROGRESS_KEY) || {};
  let filter = 'all';
  let queue = [];
  let idx = 0;
  let answered = null;   // index of the option this reader chose

  outlet.innerHTML = `
    ${pageHead('Learning check',
      'Questions about judgement rather than recall — which quantity is valid, and what a result does not license.')}

    ${callout(`<strong>Nothing here is scored against you.</strong> There is no pass mark and no timer,
      and your answers stay in this browser. Several of the correct answers are a form of
      <em>"you cannot tell from this alone"</em> — that is the most common correct answer in
      experimental work, not a hedge, and where it applies the explanation says what would settle it.`, 'info')}

    <div class="qz-bar">
      <div class="qz-chips" role="group" aria-label="Filter by area">
        <button type="button" class="chip is-on" data-cat="all">All ${all.length}</button>
        ${cats.map((c) => `<button type="button" class="chip" data-cat="${esc(c.id)}">${esc(c.label)}</button>`).join('')}
      </div>
      <span class="spacer"></span>
      <span class="qz-tally" id="qz-tally"></span>
      <button type="button" class="btn btn-sm" id="qz-reset">Clear my answers</button>
    </div>

    <div id="qz-body"></div>

    <style>${CSS}</style>`;

  const body = outlet.querySelector('#qz-body');

  outlet.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => {
    filter = b.dataset.cat;
    outlet.querySelectorAll('.qz-chips .chip').forEach((x) => x.classList.toggle('is-on', x === b));
    build();
  }));

  outlet.querySelector('#qz-reset').addEventListener('click', () => {
    progress = {};
    store.set(PROGRESS_KEY, progress);
    build();
  });

  function tally() {
    const done = Object.keys(progress).length;
    const right = Object.values(progress).filter((v) => v.correct).length;
    const el = outlet.querySelector('#qz-tally');
    el.textContent = done ? `${right} of ${done} answered correctly` : 'Nothing answered yet';
  }

  function build() {
    queue = filter === 'all' ? all.slice() : all.filter((q) => q.category === filter);
    idx = 0;
    answered = null;
    paint();
  }

  function paint() {
    tally();

    if (!queue.length) {
      body.innerHTML = `<p class="small muted">No questions in that area yet.</p>`;
      return;
    }

    const q = queue[idx];
    const prior = progress[q.id];
    const showing = answered !== null ? answered : (prior ? prior.choice : null);
    const cat = cats.find((c) => c.id === q.category);

    body.innerHTML = `
      <div class="qz-head">
        <span class="qz-n">Question ${idx + 1} of ${queue.length}</span>
        ${cat ? `<span class="chip">${esc(cat.label)}</span>` : ''}
        ${prior ? `<span class="qz-prev ${prior.correct ? 'ok' : 'no'}">
          ${prior.correct ? 'answered correctly' : 'answered incorrectly'}</span>` : ''}
      </div>

      <div class="qz-card">
        <h2 class="qz-q">${esc(q.question)}</h2>

        <div class="qz-opts" role="radiogroup" aria-label="Answer options">
          ${q.options.map((o, i) => {
            const chosen = showing === i;
            const revealed = showing !== null;
            const cls = !revealed ? '' : o.correct ? ' is-correct' : chosen ? ' is-wrong' : ' is-dim';
            return `<button type="button" class="qz-opt${cls}" data-opt="${i}"
              role="radio" aria-checked="${chosen}" ${revealed ? 'disabled' : ''}>
              <span class="qz-mark">${revealed ? (o.correct ? '✓' : chosen ? '✗' : '') : String.fromCharCode(65 + i)}</span>
              <span class="qz-text">${esc(o.text)}</span>
              ${revealed ? `<span class="qz-why">${esc(o.why)}</span>` : ''}
            </button>`;
          }).join('')}
        </div>

        ${showing !== null ? `
          <div class="callout ${q.options[showing].correct ? 'callout-ok' : 'callout-warn'}" style="margin-top:1rem">
            <strong>${q.options[showing].correct ? 'That is the answer.' : 'Not that one.'}</strong>
            ${esc(q.explanation)}
          </div>
          ${q.goDeeper?.route ? `<p style="margin-top:.75rem">
            <a href="${esc(q.goDeeper.route)}">${esc(q.goDeeper.label)} →</a></p>` : ''}
          ${(q.teaches || []).length ? `<p class="xsmall muted" style="margin-top:.5rem">
            Covered in: ${q.teaches.map((t) => `<code>${esc(t)}</code>`).join(' · ')}</p>` : ''}
        ` : ''}
      </div>

      <div class="qz-nav">
        <button type="button" class="btn btn-sm" id="qz-prev" ${idx === 0 ? 'disabled' : ''}>← Previous</button>
        <span class="spacer"></span>
        <button type="button" class="btn btn-sm${showing !== null ? ' btn-primary' : ''}"
          id="qz-next" ${idx >= queue.length - 1 ? 'disabled' : ''}>Next →</button>
      </div>`;

    body.querySelectorAll('[data-opt]').forEach((b) => b.addEventListener('click', () => {
      answered = Number(b.dataset.opt);
      progress[q.id] = { choice: answered, correct: !!q.options[answered].correct };
      store.set(PROGRESS_KEY, progress);
      paint();
    }));

    body.querySelector('#qz-prev').addEventListener('click', () => {
      if (idx > 0) { idx--; answered = null; paint(); }
    });
    body.querySelector('#qz-next').addEventListener('click', () => {
      if (idx < queue.length - 1) { idx++; answered = null; paint(); }
    });
  }

  build();
  return { destroy() {} };
}

const CSS = `
  .qz-bar { display:flex; flex-wrap:wrap; align-items:center; gap:.6rem; margin:1.25rem 0 1rem; }
  .qz-chips { display:flex; flex-wrap:wrap; gap:.3rem; }
  .qz-chips .chip { cursor:pointer; font:inherit; }
  .qz-chips .chip.is-on { background:var(--accent-wash); border-color:var(--accent); color:var(--accent-strong); }
  .qz-tally { font-size:var(--fs-sm); color:var(--text-2); font-family:var(--font-mono); }
  .qz-head { display:flex; flex-wrap:wrap; align-items:center; gap:.5rem; margin-bottom:.6rem; }
  .qz-n { font-family:var(--font-mono); font-size:var(--fs-xs); color:var(--text-muted); }
  .qz-prev { font-size:var(--fs-xs); font-weight:650; }
  .qz-prev.ok { color:var(--ok); }
  .qz-prev.no { color:var(--warn); }
  .qz-card { border:1px solid var(--border); border-radius:var(--r-md); background:var(--surface);
    padding:1.1rem 1.2rem; }
  .qz-q { font-size:var(--fs-md); margin:0 0 1rem; line-height:1.45; }
  .qz-opts { display:grid; gap:.5rem; }
  .qz-opt { display:grid; grid-template-columns:auto 1fr; gap:.2rem .7rem; text-align:left;
    padding:.7rem .85rem; background:var(--surface-2); color:var(--text);
    border:1px solid var(--border); border-radius:var(--r-sm); font:inherit; cursor:pointer;
    transition:border-color var(--dur-fast), background var(--dur-fast); }
  .qz-opt:hover:not(:disabled) { border-color:var(--accent); background:var(--surface-3); }
  .qz-opt:disabled { cursor:default; }
  .qz-mark { grid-row:1; font-family:var(--font-mono); font-weight:700; color:var(--text-muted);
    min-width:1.1rem; }
  .qz-text { grid-row:1; font-size:var(--fs-sm); line-height:1.45; }
  .qz-why { grid-column:2; font-size:var(--fs-xs); color:var(--text-2); line-height:1.5;
    margin-top:.35rem; border-top:1px solid var(--border); padding-top:.35rem; }
  .qz-opt.is-correct { border-color:var(--ok); background:var(--ok-wash); }
  .qz-opt.is-correct .qz-mark { color:var(--ok); }
  .qz-opt.is-wrong { border-color:var(--danger); background:var(--danger-wash); }
  .qz-opt.is-wrong .qz-mark { color:var(--danger); }
  .qz-opt.is-dim { opacity:.72; }
  .qz-nav { display:flex; align-items:center; gap:.6rem; margin-top:1rem; }
`;
