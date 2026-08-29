/**
 * EDMGLAB — Hash router (Architecture v0.2 §A.1, §C.5)
 *
 * Deliberately small and dependency-free. Hash routing is used rather than
 * the History API because GitHub Pages serves static files: a real path like
 * /materials/hard_carbon would 404 on refresh unless the host rewrites
 * unknown paths to index.html, which Pages cannot be configured to do.
 * Hash routes are bookmarkable, shareable and survive a refresh.
 *
 * Views are loaded with dynamic import() on first visit and cached after,
 * so a student who never opens the import workspace never downloads its code.
 */

import { MODULES, setActive } from './nav.js';

const routes = [];
const viewCache = new Map();
let outlet = null;
let current = null;

/**
 * Register a route.
 * @param {string} pattern e.g. '/material/:id' — ':name' captures one segment
 * @param {() => Promise<{render:Function}>} loader dynamic import of the view
 * @param {object} [meta] { title, crumb }
 */
export function route(pattern, loader, meta = {}) {
  routes.push({ pattern, loader, meta, parts: pattern.replace(/^\//, '').split('/') });
}

function match(path) {
  const segs = path.replace(/^\//, '').split('/').filter(Boolean);
  for (const r of routes) {
    const parts = r.parts.filter(Boolean);
    if (parts.length !== segs.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].startsWith(':')) params[parts[i].slice(1)] = decodeURIComponent(segs[i]);
      else if (parts[i] !== segs[i]) { ok = false; break; }
    }
    if (ok) return { r, params };
  }
  // Root
  if (!segs.length) {
    const root = routes.find((r) => r.pattern === '/' || r.pattern === '');
    if (root) return { r: root, params: {} };
  }
  return null;
}

export function currentPath() {
  // The query string is not part of the route. `#/suggest?about=…` must match
  // the `/suggest` pattern, or a link that carries context to a view would
  // land on "not found" instead.
  return ((location.hash || '#/').replace(/^#/, '').split('?')[0]) || '/';
}

/** Anything after `?` in the hash, as URLSearchParams. */
export function currentQuery() {
  const q = (location.hash || '').split('?')[1] || '';
  return new URLSearchParams(q);
}

async function resolve() {
  const path = currentPath();
  const hit = match(path);

  outlet.setAttribute('aria-busy', 'true');

  // Let the outgoing view release timers, observers and animation scenes.
  if (current && typeof current.destroy === 'function') {
    try { current.destroy(); } catch (e) { console.warn('[router] destroy failed', e); }
  }
  current = null;

  if (!hit) { renderNotFound(path); return; }

  // Show a spinner only if loading is slow enough to notice — avoids a flash
  // on the common case where the module is already cached.
  const slow = setTimeout(() => {
    outlet.innerHTML = '<div class="loading-row"><span class="spinner"></span> Loading…</div>';
  }, 180);

  try {
    let view = viewCache.get(hit.r.pattern);
    if (!view) {
      view = await hit.r.loader();
      viewCache.set(hit.r.pattern, view);
    }
    clearTimeout(slow);

    outlet.innerHTML = '';
    const ctx = { params: hit.params, query: currentQuery(), path, outlet };
    const result = await view.render(outlet, ctx);
    current = result && typeof result === 'object' ? result : null;

    document.title = (hit.r.meta.title ? hit.r.meta.title + ' — ' : '') + 'EDMGLAB';
    setActive('#' + path);
    updateBreadcrumb(hit.r.meta, hit.params, path);
    updateFooter(path);
  } catch (err) {
    clearTimeout(slow);
    console.error('[router] view failed', err);
    outlet.innerHTML = `
      <div class="page-head"><h1>Something went wrong</h1>
      <p class="page-lede">This view failed to load. The error is in the browser console.</p></div>
      <div class="callout callout-danger"><code>${escapeHtml(String(err && err.message || err))}</code></div>
      <p style="margin-top:1rem"><a class="btn" href="#/">Back to dashboard</a></p>`;
  } finally {
    outlet.setAttribute('aria-busy', 'false');
  }

  // Move focus to the main region so keyboard and screen-reader users
  // land on the new content rather than staying on the clicked link.
  const main = document.getElementById('main');
  if (main) main.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function renderNotFound(path) {
  const mod = MODULES.find((m) => m.route === '#' + path);
  if (mod) {
    // A real module that simply hasn't been built yet — say so honestly
    // rather than pretending the page is missing.
    import('./views/placeholder.js').then((v) => {
      outlet.innerHTML = '';
      v.render(outlet, { module: mod });
      setActive('#' + path);
      document.title = mod.label + ' — EDMGLAB';
      updateBreadcrumb({ title: mod.label }, {}, path);
      outlet.setAttribute('aria-busy', 'false');
    });
    return;
  }
  outlet.innerHTML = `
    <div class="page-head"><h1>Page not found</h1>
    <p class="page-lede">No route matches <code>${escapeHtml(path)}</code>.</p></div>
    <p><a class="btn" href="#/">Back to dashboard</a></p>`;
  outlet.setAttribute('aria-busy', 'false');
}

function updateBreadcrumb(meta, params, path = '/') {
  const el = document.getElementById('breadcrumb');
  if (!el) return;
  // The brand sits immediately to the left, so the breadcrumb does not repeat
  // it — it only shows where you are below the root.
  const bits = [];
  if (meta.crumb) bits.push(meta.crumb);
  else if (meta.title && path !== '/') bits.push(`<span>${escapeHtml(meta.title)}</span>`);
  if (params.id) bits.push(`<span>${escapeHtml(params.id)}</span>`);
  el.innerHTML = bits.join('<span class="sep">/</span>');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ── The correction footer ────────────────────────────────────
   One line under every view: "something wrong here? say so", carrying the
   route it was clicked from.

   It lives OUTSIDE #view-outlet, as a sibling inside <main>. Thirty-one
   places in the codebase assign to `outlet.innerHTML`, several of them in
   event handlers long after render() has resolved, so anything appended
   inside the outlet would vanish the first time a view redrew itself. A
   sibling cannot be clobbered by any of them.

   Not shown on the correction page itself, and not on the admin panel —
   neither is content anyone would be correcting. */
const NO_FOOTER = ['/suggest', '/admin', '/menu'];

function updateFooter(path) {
  const main = document.getElementById('main');
  if (!main) return;
  let foot = document.getElementById('page-foot');

  if (NO_FOOTER.includes(path)) { if (foot) foot.hidden = true; return; }

  if (!foot) {
    foot = document.createElement('footer');
    foot.id = 'page-foot';
    foot.className = 'page-foot';
    main.appendChild(foot);
  }
  foot.hidden = false;
  const q = new URLSearchParams({ about: '#' + path });
  foot.innerHTML = `<span>All content here is <strong>draft</strong>, pending review by the group.</span>
    <a class="page-foot-link" href="#/suggest?${q}">Something wrong on this page?</a>`;
}

export function start(outletEl) {
  outlet = outletEl;
  window.addEventListener('hashchange', resolve);
  resolve();
}

export function go(path) {
  location.hash = path.startsWith('#') ? path : '#' + path;
}
