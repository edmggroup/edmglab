/**
 * EDMGLAB — Navigation model (Architecture v0.2 §B)
 *
 * THE single source of navigation truth. One array renders BOTH the desktop
 * sidebar and the mobile bottom bar, so adding a module is one entry here
 * plus one view file — never an edit to many HTML files.
 *
 * `tab`   maps a module to its mobile bottom-nav bucket (§C.4)
 * `group` maps it to a desktop sidebar group (§C.2)
 * `phase` is the roadmap phase that builds it; modules not yet built render
 *         a placeholder that says so rather than 404-ing.
 */

/* Inline SVG path data, kept minimal — icons are decorative, labels carry meaning. */
const I = {
  home:      '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
  book:      '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19v18H5.5A1.5 1.5 0 0 1 4 19.5z"/><path d="M8 3v18"/>',
  atom:      '<circle cx="12" cy="12" r="2.2"/><ellipse cx="12" cy="12" rx="9" ry="4"/><ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(120 12 12)"/>',
  flask:     '<path d="M9 3v6.5L4.2 18a2 2 0 0 0 1.7 3h12.2a2 2 0 0 0 1.7-3L15 9.5V3"/><path d="M8 3h8"/><path d="M7.2 15h9.6"/>',
  layers:    '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  scope:     '<circle cx="12" cy="12" r="8"/><path d="M12 4v4M12 16v4M4 12h4M16 12h4"/>',
  flag:      '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  battery:   '<rect x="2" y="7" width="17" height="10" rx="2"/><path d="M22 10.5v3"/><path d="M6 11v2M9.5 11v2M13 11v2"/>',
  wave:      '<path d="M2 12c2.5-6 5-6 7.5 0s5 6 7.5 0 5-6 5 0"/>',
  clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2.8h6V4"/><path d="M8.5 10h7M8.5 14h5"/>',
  sigma:     '<path d="M17 5H7l6 7-6 7h10"/>',
  calc:      '<rect x="4" y="2.5" width="16" height="19" rx="2"/><path d="M8 7h8"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 16h.01M12 16h.01M15.5 16h3"/>',
  upload:    '<path d="M12 15V3"/><path d="m7.5 7.5 4.5-4.5 4.5 4.5"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
  wrench:    '<path d="M15.5 3.5a5.5 5.5 0 0 0-7 7L3 16v5h5l5.5-5.5a5.5 5.5 0 0 0 7-7l-3.2 3.2-3-.5-.5-3z"/>',
  compass:   '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5.5-5.5 2 2-5.5z"/>',
  grid:      '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  heart:     '<path d="M12 20s-7-4.5-7-9.5A3.9 3.9 0 0 1 12 7a3.9 3.9 0 0 1 7 3.5C19 15.5 12 20 12 20z"/>',
  menu:      '<path d="M4 7h16M4 12h16M4 17h16"/>',
  lock:      '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/><path d="M12 14.5v2"/>'
};

export function icon(name) {
  return `<span class="nav-ico"><svg viewBox="0 0 24 24" aria-hidden="true">${I[name] || I.grid}</svg></span>`;
}
export function iconRaw(name) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${I[name] || I.grid}</svg>`;
}

/**
 * Desktop sidebar groups, in display order.
 *
 * Utilities (health check, engine demo, access control) deliberately do NOT
 * appear here. They are maintenance tools, not scientific modules, and mixing
 * them into the same list both crowds the navigation and misrepresents what
 * this platform is. They live in a compact footer rail instead — which is also
 * what lets the whole navigation fit on a laptop screen without scrolling.
 */
export const GROUPS = [
  { id: 'learn', title: 'Learn' },
  { id: 'lab',   title: 'Laboratory' },
  { id: 'tools', title: 'Analysis' }
];

/** Mobile bottom-nav buckets (§C.4). Exactly five, in order. */
export const TABS = [
  { id: 'home',  label: 'Home',  icon: 'home',   route: '#/' },
  { id: 'learn', label: 'Learn', icon: 'book',   route: '#/fundamentals' },
  { id: 'lab',   label: 'Lab',   icon: 'flask',  route: '#/battery-tester' },
  { id: 'tools', label: 'Tools', icon: 'sigma',  route: '#/formulas' },
  { id: 'menu',  label: 'Menu',  icon: 'menu',   route: '#/menu' }
];

/**
 * Every module in the platform.
 * `view` is the module file under js/views/ (null = placeholder).
 */
export const MODULES = [
  { id: 'dashboard',       label: 'Dashboard',           route: '#/',                    icon: 'home',      tab: 'home',  group: null,    phase: 0,  view: 'dashboard' },

  { id: 'fundamentals',    label: 'Fundamentals',        route: '#/fundamentals',        icon: 'book',      tab: 'learn', group: 'learn', view: 'fundamentals' },
  { id: 'chemistry',       label: 'Storage Chemistry',   route: '#/chemistry',           icon: 'atom',      tab: 'learn', group: 'learn', view: 'chemistry/index' },
  { id: 'glossary',        label: 'Glossary',            route: '#/glossary',            icon: 'book',      tab: 'learn', group: 'learn', view: 'glossary' },
  { id: 'learning',        label: 'Learning & Quiz',     route: '#/learning',            icon: 'heart',     tab: 'learn', group: 'learn', view: 'quiz' },

  { id: 'materials',       label: 'Electrode Materials', route: '#/materials',           icon: 'layers',    tab: 'lab',   group: 'lab',   phase: 7 },
  { id: 'preparation',     label: 'Electrode Prep',      route: '#/preparation',         icon: 'flask',     tab: 'lab',   group: 'lab',   view: 'preparation' },
  { id: 'characterization',label: 'Characterisation',    route: '#/characterization',    icon: 'scope',     tab: 'lab',   group: 'lab',   view: 'characterization' },
  { id: 'battery-tester',  label: 'Battery Tester',      route: '#/battery-tester',      icon: 'battery',   tab: 'lab',   group: 'lab',   phase: 3,  view: 'battery-tester/index' },
  { id: 'workstation',     label: 'Echem Workstation',   route: '#/workstation',         icon: 'wave',      tab: 'lab',   group: 'lab',   phase: 5,  view: 'echem/index' },
  { id: 'protocols',       label: 'Test Protocols',      route: '#/battery-tester/protocol', icon: 'clipboard', tab: 'lab', group: 'lab', view: 'battery-tester/index' },
  { id: 'instruments',     label: 'Our Instruments',     route: '#/instruments',         icon: 'clipboard', tab: 'lab',   group: 'lab',   view: 'instruments' },
  { id: 'which-instrument',label: 'Which Instrument?',   route: '#/workstation/choose',  icon: 'compass',   tab: 'lab',   group: 'lab',   phase: 5,  view: 'echem/index' },

  { id: 'formulas',        label: 'Formula Library',     route: '#/formulas',            icon: 'sigma',     tab: 'tools', group: 'tools', view: 'formulas' },
  { id: 'calculators',     label: 'Calculators',         route: '#/calculators',         icon: 'calc',      tab: 'tools', group: 'tools', view: 'calculators' },
  { id: 'import',          label: 'Data Import',         route: '#/import',              icon: 'upload',    tab: 'tools', group: 'tools', view: 'import' },
  { id: 'analysis',        label: 'Scan-rate Analysis',   route: '#/analysis',            icon: 'sigma',     tab: 'tools', group: 'tools', view: 'analysis' },
  { id: 'troubleshooting', label: 'Troubleshooting',     route: '#/troubleshooting',     icon: 'wrench',    tab: 'tools', group: 'tools', phase: 10, view: 'troubleshooting' },

  // Utilities — footer rail, not the main list (see GROUPS above).
  // `shortLabel` is what fits in the narrow rail; `label` is the real name
  // used everywhere else, so cards and page titles stay unambiguous.
  { id: 'demo',   label: 'Engine Demo',       shortLabel: 'Demo',   route: '#/demo',   icon: 'grid',  tab: 'menu', group: null, util: true, phase: 0, view: 'demo' },
  { id: 'health', label: 'Data Health Check', shortLabel: 'Health', route: '#/health', icon: 'scope', tab: 'menu', group: null, util: true, phase: 0, view: 'health' },
  { id: 'admin',  label: 'Access Control',    shortLabel: 'Access', route: '#/admin',  icon: 'lock',  tab: 'menu', group: null, util: true, phase: 0, view: 'admin' },
  /* The main way in is the footer link under every page, which carries the
     route it was clicked from. This entry is for someone who has already
     navigated away and wants to come back to their queued corrections. */
  { id: 'suggest', label: 'Suggest a correction', shortLabel: 'Report', route: '#/suggest', icon: 'flag', tab: 'menu', group: null, util: true, phase: 0, view: 'suggest' }
];

export function moduleByRoute(hash) {
  const base = '#/' + (hash.replace(/^#\/?/, '').split('/')[0] || '');
  return MODULES.find((m) => m.route === base) || null;
}

/** Render the desktop sidebar into `el`. */
export function renderSidebar(el) {
  const groups = GROUPS.map((g) => {
    const items = MODULES.filter((m) => m.group === g.id);
    if (!items.length) return '';
    return `<div class="nav-group">
      <div class="nav-group-title">${g.title}</div>
      <div class="nav-items">${items.map(navLink).join('')}</div>
    </div>`;
  }).join('');

  // Compact utility rail, pinned to the bottom.
  const utils = MODULES.filter((m) => m.util).map((m) => `
    <a class="nav-util" href="${m.route}" data-module="${m.id}" title="${m.label}">
      ${iconRaw(m.icon)}<span>${m.shortLabel || m.label}</span>
    </a>`).join('');

  el.innerHTML = `<nav class="nav-scroll">${groups}</nav>
    <div class="nav-footer">${utils}</div>`;
}

function navLink(m) {
  const built = !!m.view;
  /* The phase badge marks a module that is navigable but not yet built. Guard
     on `m.phase` as well as on `built`: a module with neither is a data error,
     and printing "Pundefined" in the sidebar is a worse way to surface it than
     printing nothing. */
  return `<a class="nav-link" href="${m.route}" data-module="${m.id}">
    ${icon(m.icon)}<span class="nav-label">${m.label}</span>
    ${built || m.phase === undefined ? ''
      : `<span class="nav-phase" title="Not built yet — arrives in roadmap phase ${m.phase}">P${m.phase}</span>`}
  </a>`;
}

/** Render the mobile bottom bar into `el`. */
export function renderBottomNav(el) {
  el.innerHTML = TABS.map((t) => `
    <a class="bottomnav-item" href="${t.route}" data-tab="${t.id}">
      ${iconRaw(t.icon)}<span>${t.label}</span>
    </a>`).join('');
}

/** Mark the active sidebar link and bottom-nav tab for the current route. */
export function setActive(hash) {
  const mod = moduleByRoute(hash);

  document.querySelectorAll('.nav-link, .nav-util').forEach((a) => {
    const on = mod && a.dataset.module === mod.id;
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });

  const tab = mod ? mod.tab : null;
  document.querySelectorAll('.bottomnav-item').forEach((a) => {
    const on = a.dataset.tab === tab;
    a.classList.toggle('is-active', on);
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}
