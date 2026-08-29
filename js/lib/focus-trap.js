/**
 * EDMGLAB — Focus containment for overlays
 *
 * An audit walked the app with the Tab key and found both overlays leaking:
 * with the search dialog open, Tab walked straight out of it and into the
 * sidebar behind — links a sighted user cannot see and a screen-reader user
 * has no way to know they have reached. Closing the dialog then dropped focus
 * back to the top of the document, so a keyboard user had to tab the whole
 * shell again to get back to where they were.
 *
 * Both are the same missing piece: while a modal thing is open, the rest of
 * the page is not there.
 *
 * Two mechanisms, deliberately:
 *
 *   TAB CYCLING keeps the keyboard inside. It works in every browser and is
 *   what makes the dialog usable.
 *
 *   `inert` on everything outside removes the background from the
 *   accessibility tree AND from pointer input, so a screen reader cannot
 *   browse into it either. It is applied to the SIBLINGS at each level from
 *   the container up to <body>, never to an ancestor of the container — the
 *   nav drawer lives inside .app, so inerting .app would inert the drawer.
 *   Browsers without `inert` still get the tab cycling.
 */

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', 'details > summary',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

function focusables(root) {
  return [...root.querySelectorAll(FOCUSABLE)].filter((el) => {
    if (el.closest('[hidden]')) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  });
}

/**
 * Contain focus within `container` until the returned function is called.
 *
 * @param {HTMLElement} container
 * @param {object}   [opts]
 * @param {Element[]} [opts.also]      Elements outside the container that must
 *                                     stay reachable — the toggle that opened
 *                                     the drawer, the scrim that closes it.
 * @param {Function} [opts.onEscape]   Called when Escape is pressed.
 * @returns {(restoreTo?: Element|null) => void} release; pass an element to
 *          send focus somewhere other than where it came from, or `null` to
 *          leave focus alone.
 */
export function trap(container, opts = {}) {
  const also = opts.also || [];
  const returnTo = document.activeElement;
  const inerted = [];

  /* Walk container → body, inerting siblings at each level. */
  let node = container;
  while (node && node.parentElement) {
    for (const sib of node.parentElement.children) {
      if (sib === node || sib.contains(container) || also.includes(sib)) continue;
      if (also.some((a) => sib.contains(a))) continue;
      if (sib.inert) continue;                 // already inert — leave it alone
      sib.inert = true;
      inerted.push(sib);
    }
    node = node.parentElement;
    if (node === document.body) break;
  }

  const stops = () => [...focusables(container), ...also.filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  })];

  function onKey(e) {
    if (e.key === 'Escape') { opts.onEscape?.(); return; }
    if (e.key !== 'Tab') return;
    const list = stops();
    if (!list.length) { e.preventDefault(); return; }
    const first = list[0], last = list[list.length - 1];
    const active = document.activeElement;
    // Focus outside the ring (the container itself, or a browser oddity)
    // is pulled back to whichever end the user is heading for.
    if (!list.includes(active)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); return; }
    if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
  }

  document.addEventListener('keydown', onKey, true);

  // Move focus in. Prefer a real control; fall back to the container so a
  // screen reader announces the dialog rather than staying behind it.
  const first = focusables(container)[0];
  if (first) first.focus();
  else {
    if (!container.hasAttribute('tabindex')) container.setAttribute('tabindex', '-1');
    container.focus();
  }

  let released = false;
  return function release(restoreTo) {
    if (released) return;
    released = true;
    document.removeEventListener('keydown', onKey, true);
    for (const el of inerted) el.inert = false;
    const target = restoreTo === undefined ? returnTo : restoreTo;
    // Only restore if the element is still in the document and focusable.
    if (target && target.isConnected && typeof target.focus === 'function') {
      target.focus({ preventScroll: true });
    }
  };
}
