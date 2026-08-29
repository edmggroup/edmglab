/**
 * EDMGLAB — Enlarge a diagram
 *
 * WHY THIS EXISTS
 *
 * The conceptual scenes are drawn on a wide viewBox — a cell is a wide thing —
 * and `.anim-stage svg` scales to the column width. On a 390 px phone that is
 * roughly half scale, so a secondary annotation declared at 11 user units
 * renders at about 5.7 px: about a millimetre tall. An audit measured every
 * label on every route and found twenty of them below the type floor, all of
 * them inside these diagrams.
 *
 * The three ways out were: let the diagram scroll sideways (forbidden — the
 * standing requirement is that nothing scrolls), redraw every scene in a
 * portrait layout (a rewrite of each scene, and a second layout to keep
 * correct forever), or give the diagram the whole screen when someone asks.
 *
 * This is the third. On a phone held upright the useful gain comes from
 * ROTATING the diagram onto the long edge: 844 px instead of 390 takes the
 * same label from 5.7 px to about 12 px. On a wide screen there is nothing to
 * gain from rotating, so it does not.
 *
 * The stage element is MOVED into the overlay rather than cloned. The scene
 * holds direct references to the SVG nodes it animates; a clone would leave
 * the animation running in the hidden original while the visible copy sat
 * frozen. On close it goes back exactly where it was.
 */

import { trap } from './focus-trap.js';

const PAD = 16;          // breathing room against the viewport edge
const CHROME = 64;       // the overlay's own header
/* Turning the page sideways costs the reader something — they have to tilt
   the phone or their head — so it happens only when it actually gains size.
   1.05 rather than a larger margin because the alternative is 9 px text:
   measured across the four diagrams, 1.2 declined to rotate two of them and
   left both below the floor. */
const ROTATE_GAIN = 1.05;

let openOverlay = null;

/** Parse "0 0 728 320" → aspect ratio. */
function aspect(svg) {
  const vb = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  return vb.length === 4 && vb[2] > 0 && vb[3] > 0 ? vb[2] / vb[3] : 16 / 9;
}

export function isOpen() { return openOverlay !== null; }

/**
 * @param {HTMLElement} stage   the .anim-stage element to enlarge
 * @param {string}      title   what the diagram is, shown in the overlay header
 */
export function enlarge(stage, title) {
  if (openOverlay) return;

  const svg = stage.querySelector('svg');
  if (!svg) return;

  // Remember exactly where the stage came from.
  const home = stage.parentNode;
  const after = stage.nextSibling;

  const overlay = document.createElement('div');
  overlay.className = 'dg-full';
  overlay.innerHTML = `
    <div class="dg-full-bar">
      <span class="dg-full-title"></span>
      <span class="dg-full-hint"></span>
      <button type="button" class="btn btn-sm dg-full-close">Close</button>
    </div>
    <div class="dg-full-fit"><div class="dg-full-rot"></div></div>`;
  overlay.querySelector('.dg-full-title').textContent = title || 'Diagram';

  const rot = overlay.querySelector('.dg-full-rot');
  const hint = overlay.querySelector('.dg-full-hint');
  rot.appendChild(stage);
  document.body.appendChild(overlay);
  // Stop the page behind from scrolling under the overlay.
  const prevOverflow = document.documentElement.style.overflow;
  document.documentElement.style.overflow = 'hidden';

  /* A static drawing usually does not fill its viewBox — the three-electrode
     cell leaves about a quarter of its box empty — so enlarging to the
     viewBox wastes the space that was the whole point. Tighten to what is
     actually drawn.

     ONLY for static diagrams. An animated scene moves things around; a box
     measured at the moment it opened would clip whatever wanders outside it
     a second later. */
  const animated = !!stage.closest('.anim');
  const originalVB = svg.getAttribute('viewBox');
  if (!animated) {
    try {
      const bb = svg.getBBox();
      if (bb.width > 0 && bb.height > 0) {
        const m = Math.max(bb.width, bb.height) * 0.02;
        svg.setAttribute('viewBox',
          `${bb.x - m} ${bb.y - m} ${bb.width + m * 2} ${bb.height + m * 2}`);
      }
    } catch (e) { /* getBBox throws on a detached or empty SVG — keep the original */ }
  }

  function layout() {
    const W = window.innerWidth - PAD * 2;
    const H = window.innerHeight - CHROME - PAD * 2;
    const ar = aspect(svg);

    const upright = Math.min(W, H * ar);          // width if drawn as-is
    const turned = Math.min(W * ar, H);           // width if turned on its side
    const rotate = turned > upright * ROTATE_GAIN;

    const w = rotate ? turned : upright;
    rot.style.width = `${Math.round(w)}px`;
    rot.style.height = `${Math.round(w / ar)}px`;
    rot.style.transform = rotate ? 'rotate(90deg)' : 'none';
    hint.textContent = rotate
      ? 'Turned sideways to use the long edge of the screen.'
      : '';
  }
  layout();
  window.addEventListener('resize', layout);

  const release = trap(overlay, { onEscape: close });
  overlay.querySelector('.dg-full-close').addEventListener('click', () => close());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  // A hash change while the overlay is open would tear down the view that owns
  // this stage; close first so the stage is back home before that happens.
  window.addEventListener('hashchange', close, { once: true });

  function close() {
    if (openOverlay !== overlay) return;
    openOverlay = null;
    window.removeEventListener('resize', layout);
    window.removeEventListener('hashchange', close);
    // Put the stage back before the overlay is removed, or it goes with it.
    document.documentElement.style.overflow = prevOverflow;
    if (originalVB) svg.setAttribute('viewBox', originalVB);
    stage.style.width = '';
    home.insertBefore(stage, after);
    release();
    overlay.remove();
  }

  openOverlay = overlay;
  return close;
}

/**
 * Give a STATIC diagram the same way out.
 *
 * The animated scenes get the Enlarge control from the engine, which owns
 * their control set. The static ones — the three-electrode cell, the cell
 * format stack — are built by their views directly, and the audit found them
 * with 5 px labels on a phone and no way to make them bigger. Rather than
 * push a control set into those views, this adds the one control they need.
 *
 * @param {HTMLElement} stage  the element holding the <svg>
 * @param {string}      title  what the diagram is
 */
export function addEnlargeControl(stage, title) {
  if (!stage || stage.querySelector(':scope > .dg-enlarge')) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-sm dg-enlarge';
  btn.textContent = 'Enlarge';
  btn.setAttribute('aria-label', `Enlarge the diagram: ${title}`);
  btn.addEventListener('click', () => enlarge(stage, title));
  stage.appendChild(btn);
  stage.classList.add('has-enlarge');
}
