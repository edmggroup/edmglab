/**
 * EDMGLAB — Shared UI renderers (Architecture v0.2 §C.8)
 *
 * One card renderer, one badge renderer, one table renderer, driven by
 * whatever record they are given. This is the visual expression of the
 * content-as-data decision: the materials grid, the formula grid and the
 * troubleshooting list are the same code with different data.
 */

/* ── Escaping ──────────────────────────────────────────────
   All content is authored by the group and served from our own repo, but
   everything still goes through escaping. Content will eventually arrive
   from a Google Sheet submission pipeline (§J.1), and a habit of escaping
   everywhere is what makes that safe by default rather than by review.   */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function el(tag, attrs = {}, html = '') {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  if (html) node.innerHTML = html;
  return node;
}

/* ── Provenance badges (§D.3) ─────────────────────────────
   Every numeric value in EDMGLAB carries a provenance. The badge is not
   decoration: it is how a reader tells a theoretical number from a
   datasheet figure from something a student typed in this session.      */

const PROV_LABEL = {
  theoretical:  'Theoretical',
  literature:   'Literature',
  datasheet:    'Datasheet',
  measured:     'Measured',
  userEntered:  'Your input',
  illustrative: 'Illustrative'
};

export function provenanceBadge(prov, source) {
  if (!prov) return `<span class="badge badge-unverified" title="No provenance recorded — this value should not be relied on">Unverified</span>`;
  const label = PROV_LABEL[prov] || prov;
  const title = source ? `${label} — ${source}` : label;
  return `<span class="badge badge-${esc(prov)}" title="${esc(title)}">${esc(label)}</span>`;
}

/**
 * Render a value object {value, unit, provenance, source} as text + badge.
 * A bare number (no provenance) renders with an explicit "Unverified" badge
 * rather than looking authoritative.
 */
export function valueWithProvenance(v) {
  if (v === null || v === undefined) return '<span class="muted">—</span>';
  if (typeof v !== 'object') return `<span class="num">${esc(v)}</span> ${provenanceBadge(null)}`;
  const num = v.value ?? '—';
  const unit = v.unit ? ` <span class="unit">${esc(v.unit)}</span>` : '';
  const note = v.note ? `<div class="xsmall muted">${esc(v.note)}</div>` : '';
  return `<span class="num">${esc(num)}</span>${unit} ${provenanceBadge(v.provenance, v.source)}${note}`;
}

/* ── Cards ─────────────────────────────────────────────── */

/**
 * One generic card. Every card type in EDMGLAB is this function with a
 * different record.
 * @param {{href,title,sub,chips,badge,icon}} o
 */
export function card(o) {
  const chips = (o.chips || []).map((c) => `<span class="chip">${esc(c)}</span>`).join('');
  return `<a class="card" href="${esc(o.href || '#/')}">
    <div class="row" style="gap:.5rem;margin-bottom:.35rem">
      <span class="card-title">${esc(o.title)}</span>
      ${o.badge || ''}
    </div>
    ${o.sub ? `<p class="card-sub">${esc(o.sub)}</p>` : ''}
    ${chips ? `<div class="chip-row" style="margin-top:.65rem">${chips}</div>` : ''}
  </a>`;
}

export function cardGrid(cards) {
  return `<div class="card-grid">${cards.join('')}</div>`;
}

/* ── Page furniture ───────────────────────────────────── */

export function pageHead(title, lede) {
  return `<header class="page-head">
    <h1>${esc(title)}</h1>
    ${lede ? `<p class="page-lede">${esc(lede)}</p>` : ''}
  </header>`;
}

export function section(title, bodyHtml, note) {
  return `<section class="section">
    <div class="section-head"><h2>${esc(title)}</h2>${note ? `<span class="section-note">${esc(note)}</span>` : ''}</div>
    ${bodyHtml}
  </section>`;
}

export function callout(text, kind = 'info') {
  return `<div class="callout callout-${esc(kind)}">${text}</div>`;
}

export function emptyState(text) {
  return `<div class="empty-state">${esc(text)}</div>`;
}

/**
 * A table that becomes stacked cards on small screens (§C.4).
 * `rows` is an array of arrays; `cols` an array of header strings.
 */
export function table(cols, rows, opts = {}) {
  const head = `<thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>`;
  const body = `<tbody>${rows.map((r) =>
    `<tr>${r.map((cell, i) => `<td data-label="${esc(cols[i] || '')}">${cell}</td>`).join('')}</tr>`
  ).join('')}</tbody>`;
  return `<div class="table-wrap"><table class="${opts.stackable === false ? '' : 'stackable'}">${head}${body}</table></div>`;
}

/* ── Mode-aware content (§C.10 / spec §35) ────────────────
   Learn Mode and Research Mode are two views of ONE record — never two
   content sets. Both are rendered; CSS shows the active one. That keeps
   the toggle instant and guarantees they cannot drift apart.            */
export function modeBlock(learnHtml, researchHtml) {
  return `<div data-mode-only="learn">${learnHtml}</div><div data-mode-only="research">${researchHtml}</div>`;
}

/** A "not yet authored" marker — honest about gaps rather than showing an empty section. */
export function notAuthored(what = 'This content') {
  return `<p class="small muted"><em>${esc(what)} has not been written yet.</em></p>`;
}
