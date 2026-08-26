/**
 * EDMGLAB — Generic decision-tree renderer
 * (Instrumentation spec §30 method selector, §38 which-instrument)
 *
 * One component, driven entirely by JSON. Adding or rewording a branch is a
 * data edit, never a code change.
 *
 * ── THE RULE THAT SHAPES THIS COMPONENT ──
 * Spec §30: "Do not recommend a technique without context." So a leaf is NOT
 * allowed to be a bare recommendation. The renderer requires every leaf to
 * declare BOTH what the technique can tell you AND what it cannot, and it
 * refuses to render a leaf that is missing the second one — because a
 * recommendation without its limits is exactly how students end up applying
 * a method outside the conditions where it means anything.
 */

import { esc } from '../ui.js';

/**
 * @param {HTMLElement} host
 * @param {object} tree  { root, nodes: { id: question-node | leaf-node } }
 * @param {object} [opts] { onNavigate }
 */
export function renderTree(host, tree, opts = {}) {
  if (!tree || !tree.nodes || !tree.root) {
    host.innerHTML = `<div class="callout callout-warn">This decision tree has not been authored yet.</div>`;
    return { destroy() {} };
  }

  let path = [tree.root];

  host.innerHTML = `<div class="dt">
    <nav class="dt-crumbs" id="dt-crumbs" aria-label="Your choices"></nav>
    <div id="dt-body"></div>
  </div>
  <style>
    .dt { display:grid; gap:.9rem; }
    .dt-crumbs { display:flex; flex-wrap:wrap; align-items:center; gap:.35rem; font-size:var(--fs-xs); }
    .dt-crumb { display:inline-flex; align-items:center; gap:.35rem; padding:.2rem .55rem;
      background:var(--surface-2); border:1px solid var(--border); border-radius:var(--r-pill);
      color:var(--text-2); cursor:pointer; font:inherit; font-size:var(--fs-xs); }
    .dt-crumb:hover { border-color:var(--accent); color:var(--text); }
    .dt-crumb-sep { color:var(--text-muted); }
    .dt-q { font-size:var(--fs-lg); font-weight:600; margin:0 0 .9rem; letter-spacing:-.01em; }
    .dt-hint { font-size:var(--fs-sm); color:var(--text-2); margin:-.5rem 0 1rem; max-width:68ch; }
    .dt-options { display:grid; gap:.5rem; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); }
    .dt-option { text-align:left; padding:.8rem .9rem; background:var(--surface);
      border:1px solid var(--border); border-radius:var(--r-md); cursor:pointer; font:inherit;
      color:var(--text); transition:border-color var(--dur-fast), background var(--dur-fast); }
    .dt-option:hover { border-color:var(--accent); background:var(--surface-2); }
    .dt-option strong { display:block; font-size:var(--fs-sm); margin-bottom:.2rem; }
    .dt-option span { font-size:var(--fs-xs); color:var(--text-muted); line-height:1.45; }
    .dt-leaf { border:1px solid var(--accent-dim); border-radius:var(--r-lg); overflow:hidden; }
    .dt-leaf-head { padding:.8rem 1rem; background:var(--accent-wash);
      border-bottom:1px solid var(--accent-dim); }
    .dt-leaf-head h3 { margin:0 0 .2rem; font-size:var(--fs-md); color:var(--accent-strong); }
    .dt-leaf-head p { margin:0; font-size:var(--fs-sm); color:var(--text-2); }
    .dt-leaf-body { padding:1rem; display:grid; gap:1rem; }
    .dt-cols { display:grid; gap:1rem; grid-template-columns:repeat(auto-fit,minmax(230px,1fr)); }
    .dt-col h4 { font-size:var(--fs-xs); text-transform:uppercase; letter-spacing:.07em;
      margin:0 0 .4rem; }
    .dt-col.can h4 { color:var(--ok); }
    .dt-col.cannot h4 { color:var(--warn); }
    .dt-col ul { margin:0; padding-left:1.1rem; font-size:var(--fs-sm); color:var(--text-2); }
    .dt-col li { margin-bottom:.3rem; }
    .dt-meta { font-size:var(--fs-sm); color:var(--text-2); padding-top:.8rem; border-top:1px solid var(--border); }
  </style>`;

  const crumbs = host.querySelector('#dt-crumbs');
  const body = host.querySelector('#dt-body');

  function draw() {
    const nodeId = path[path.length - 1];
    const node = tree.nodes[nodeId];

    // Breadcrumbs — every earlier choice stays clickable, so exploring the
    // tree never means starting over.
    crumbs.innerHTML = path.map((id, i) => {
      const n = tree.nodes[id];
      const text = i === 0 ? 'Start' : (n?.crumb || n?.technique || n?.question || id);
      return `<button type="button" class="dt-crumb" data-step="${i}">${esc(text)}</button>`
        + (i < path.length - 1 ? '<span class="dt-crumb-sep">›</span>' : '');
    }).join('');
    crumbs.querySelectorAll('[data-step]').forEach((b) =>
      b.addEventListener('click', () => { path = path.slice(0, +b.dataset.step + 1); draw(); }));

    if (!node) { body.innerHTML = `<div class="callout callout-warn">Missing node: <code>${esc(nodeId)}</code></div>`; return; }

    if (node.options) { drawQuestion(node); return; }
    drawLeaf(node, nodeId);
  }

  function drawQuestion(node) {
    body.innerHTML = `
      <h3 class="dt-q">${esc(node.question)}</h3>
      ${node.hint ? `<p class="dt-hint">${esc(node.hint)}</p>` : ''}
      <div class="dt-options">
        ${node.options.map((o, i) => `
          <button type="button" class="dt-option" data-opt="${i}">
            <strong>${esc(o.label)}</strong>
            ${o.detail ? `<span>${esc(o.detail)}</span>` : ''}
          </button>`).join('')}
      </div>`;
    body.querySelectorAll('[data-opt]').forEach((b) =>
      b.addEventListener('click', () => { path.push(node.options[+b.dataset.opt].next); draw(); }));
  }

  function drawLeaf(node, nodeId) {
    // Enforced: a leaf must say what the technique CANNOT tell you.
    if (!node.cannotTell?.length) {
      console.error(`[decision-tree] leaf "${nodeId}" has no cannotTell — refusing to render a recommendation without its limits (spec §30).`);
      body.innerHTML = `<div class="callout callout-danger">
        <strong>Leaf incomplete.</strong> This recommendation does not state what the technique
        <em>cannot</em> tell you, so it is not shown. Every leaf must declare its limits.</div>`;
      return;
    }

    body.innerHTML = `
      <div class="dt-leaf">
        <div class="dt-leaf-head">
          <h3>${esc(node.technique)}</h3>
          ${node.summary ? `<p>${esc(node.summary)}</p>` : ''}
        </div>
        <div class="dt-leaf-body">
          <div class="dt-cols">
            <div class="dt-col can">
              <h4>What it can tell you</h4>
              <ul>${(node.canTell || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
            </div>
            <div class="dt-col cannot">
              <h4>What it cannot tell you</h4>
              <ul>${node.cannotTell.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
            </div>
          </div>
          ${node.instrument ? `<div class="dt-meta"><strong>Instrument:</strong> ${esc(node.instrument)}
            ${node.origalys ? `<br><span class="xsmall muted">On OrigaMaster this appears as <code>${esc(node.origalys)}</code>.</span>` : ''}
          </div>` : ''}
          ${node.caution ? `<div class="callout callout-warn">${esc(node.caution)}</div>` : ''}
          ${node.route ? `<div><a class="btn btn-sm" href="${esc(node.route)}">Open the module</a></div>` : ''}
        </div>
      </div>
      <div style="margin-top:.9rem"><button type="button" class="btn btn-sm" id="dt-restart">Start again</button></div>`;

    body.querySelector('#dt-restart').addEventListener('click', () => { path = [tree.root]; draw(); });
  }

  draw();
  return { destroy() {} };
}
