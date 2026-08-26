/**
 * EDMGLAB — Menu (mobile "Menu" bottom-nav tab, Architecture v0.2 §C.4)
 *
 * Everything that does not belong in the four primary tabs: troubleshooting,
 * settings, and the full module list. On desktop the sidebar covers this, but
 * the route stays available so a shared link works on any device.
 */

import { MODULES, GROUPS, icon } from '../nav.js';
import { esc, pageHead, section } from '../ui.js';
import * as store from '../lib/storage.js';

export function render(outlet) {
  const groups = GROUPS.map((g) => {
    const items = MODULES.filter((m) => m.group === g.id);
    if (!items.length) return '';
    return `<div class="section">
      <div class="section-head"><h2>${esc(g.title)}</h2></div>
      <div class="menu-list">
        ${items.map((m) => `
          <a class="menu-row" href="${esc(m.route)}">
            ${icon(m.icon)}
            <span class="menu-label">${esc(m.label)}</span>
            ${m.view ? '' : `<span class="nav-phase">P${m.phase}</span>`}
            <span class="menu-chev" aria-hidden="true">›</span>
          </a>`).join('')}
      </div>
    </div>`;
  }).join('');

  const theme = document.documentElement.getAttribute('data-theme');
  const mode = document.documentElement.getAttribute('data-mode');

  outlet.innerHTML = `
    ${pageHead('Menu', 'All modules, plus settings for this device.')}
    ${groups}

    ${section('Settings', `
      <div class="panel"><div class="panel-body stack">
        <div class="row" style="justify-content:space-between">
          <div><strong>Theme</strong><div class="xsmall muted">Currently ${esc(theme || 'system')}</div></div>
          <button class="btn btn-sm" id="m-theme">Switch</button>
        </div>
        <div class="row" style="justify-content:space-between">
          <div><strong>Content depth</strong><div class="xsmall muted">Currently ${esc(mode)} mode</div></div>
          <button class="btn btn-sm" id="m-mode">Switch</button>
        </div>
        <div class="row" style="justify-content:space-between">
          <div><strong>Stored on this device</strong>
            <div class="xsmall muted">Preferences, progress and recently viewed items. Never leaves your browser.</div></div>
          <button class="btn btn-sm" id="m-clear">Clear</button>
        </div>
        ${store.getUser() ? `
        <div class="row" style="justify-content:space-between">
          <div><strong>Signed in as ${esc(store.getUser())}</strong>
            <div class="xsmall muted">Your progress on this shared machine is kept separate from other people's.</div></div>
          <button class="btn btn-sm" id="m-signout">Sign out</button>
        </div>` : ''}
      </div></div>`)}

    ${section('About this build', `
      <div class="panel"><div class="panel-body">
        <p class="small">EDMGLAB Phase 0 — application shell, animation engine, diagram engine,
        simulation labelling, chart layer and data health check.</p>
        <p class="small muted" style="margin-bottom:0">Built as a single-page application:
        one page load, then instant navigation. Works offline after the first visit.</p>
      </div></div>`)}

    <style>
      .menu-list { display:grid; gap:2px; }
      .menu-row { display:flex; align-items:center; gap:.75rem; padding:.7rem .85rem;
        background:var(--surface); border:1px solid var(--border); border-radius:var(--r-md);
        color:var(--text); text-decoration:none; min-height:var(--touch-min); }
      .menu-row:hover { background:var(--surface-2); border-color:var(--border-strong); text-decoration:none; }
      .menu-label { flex:1 1 auto; font-size:var(--fs-sm); font-weight:550; }
      .menu-chev { color:var(--text-muted); font-size:1.2rem; line-height:1; }
    </style>`;

  outlet.querySelector('#m-theme')?.addEventListener('click', () => {
    document.getElementById('theme-btn').click();
    render(outlet);
  });
  outlet.querySelector('#m-mode')?.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-mode') === 'learn' ? 'research' : 'learn';
    document.querySelector(`[data-mode-set="${next}"]`)?.click();
    render(outlet);
  });
  outlet.querySelector('#m-clear')?.addEventListener('click', () => {
    store.clearAll();
    render(outlet);
  });
  outlet.querySelector('#m-signout')?.addEventListener('click', async () => {
    const { signOut } = await import('../lib/access.js');
    signOut();
  });

  return { destroy() {} };
}
