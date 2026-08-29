/**
 * EDMGLAB — Shared scientific animation engine
 * (Architecture v0.2 §C.10 · Instrumentation spec §7, §37 · Integration report §4, §6.2, §6.9)
 *
 * ONE engine for both instrument modules and the wider platform. Spec §37 is
 * explicit: "Do not create separate animation engines."
 *
 * What this file owns
 *   - A SINGLE requestAnimationFrame loop for every scene on the page.
 *     Naively, each animation runs its own loop and a mid-range Android phone
 *     drops frames with more than a few running (Integration report §6.9).
 *   - The standard control set required by §7: Play, Pause, Reset, Speed,
 *     Explanation toggle, Labels toggle.
 *   - prefers-reduced-motion handling — enforced HERE, so no individual scene
 *     can forget it. Reduced-motion users get the scene's static frame.
 *   - IntersectionObserver: a scene scrolled off screen stops consuming CPU.
 *   - The mandatory "Conceptual representation" caption. A scene declares
 *     `conceptual: true` and the engine renders the caption. It is not the
 *     scene author's to omit.
 *
 * What a scene owns
 *   - setup(svg, ctx): build persistent SVG elements once.
 *   - render(t, ctx): position them for normalised time t ∈ [0, 1].
 *   A scene contains no timing, no controls and no rAF logic of its own —
 *   typically ~60 lines.
 */

import { esc } from '../ui.js';
import { enlarge } from './anim-fullscreen.js';

/* Tells app.js this module is loaded, so it can call into it on a theme
   change or a tab switch WITHOUT importing it and putting it back on the
   boot path. One line here, 12 KB off every first visit. */
window.__edmglabAnim = true;

/* ── Global loop ─────────────────────────────────────────── */

const active = new Set();   // scenes currently playing AND visible
let rafId = null;
let lastTs = 0;

function tick(ts) {
  const dt = lastTs ? ts - lastTs : 16.7;
  lastTs = ts;

  for (const s of active) {
    s._elapsed += dt * s.speed;
    let t = s._elapsed / s.duration;

    if (t >= 1) {
      if (s.loop) { s._elapsed %= s.duration; t = s._elapsed / s.duration; }
      else { t = 1; s.pause(); }
    }
    s._paint(t);
  }

  if (active.size) rafId = requestAnimationFrame(tick);
  else { rafId = null; lastTs = 0; }
}

function wake() {
  if (rafId === null && active.size) { lastTs = 0; rafId = requestAnimationFrame(tick); }
}

/** True when the user has asked for reduced motion. Checked live, not cached. */
function reducedMotion() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/* ── Scene ───────────────────────────────────────────────── */

/**
 * @param {object} def
 * @param {string}  def.id
 * @param {string} [def.title]
 * @param {string}  def.viewBox      SVG viewBox, e.g. '0 0 640 320'
 * @param {number}  def.duration     ms for one full pass
 * @param {boolean}[def.loop=true]
 * @param {boolean}[def.conceptual]  forces the "conceptual representation" caption
 * @param {object} [def.simulationBasis] present when the scene plots a model —
 *                 triggers the illustrative-simulation treatment instead
 * @param {number} [def.staticAt=0.5] t used for the reduced-motion still frame
 * @param {Array}  [def.steps]        [{at, label, text}] narration keyed to t
 * @param {Function} def.setup        (svg, ctx) => void
 * @param {Function} def.render       (t, ctx) => void
 */
export function createScene(def) {
  const scene = {
    ...def,
    loop: def.loop !== false,
    speed: 1,
    duration: def.duration || 6000,
    staticAt: def.staticAt ?? 0.5,
    steps: def.steps || [],
    _elapsed: 0,
    _mounted: false,
    _visible: true,
    _playing: false,
    _ctx: {},
    _els: {}
  };

  scene._paint = (t) => {
    try {
      scene.render(t, scene._ctx);
    } catch (e) {
      console.error(`[anim] scene "${scene.id}" render failed`, e);
      scene.pause();
      return;
    }
    if (scene._els.bar) scene._els.bar.style.width = (t * 100).toFixed(1) + '%';
    updateStep(scene, t);
  };

  scene.play = () => {
    if (reducedMotion()) return;           // never auto-defy the OS setting
    scene._playing = true;
    scene._els.wrap?.classList.add('is-playing');
    setPlayLabel(scene, true);
    if (scene._visible) { active.add(scene); wake(); }
  };

  scene.pause = () => {
    scene._playing = false;
    scene._els.wrap?.classList.remove('is-playing');
    setPlayLabel(scene, false);
    active.delete(scene);
  };

  scene.reset = () => {
    scene._elapsed = 0;
    scene._paint(0);
  };

  scene.setSpeed = (v) => { scene.speed = v; };

  scene.destroy = () => {
    active.delete(scene);
    scene._observer?.disconnect();
    scene._mounted = false;
  };

  return scene;
}

function setPlayLabel(scene, playing) {
  const b = scene._els.playBtn;
  if (!b) return;
  b.setAttribute('aria-pressed', playing ? 'true' : 'false');
  b.innerHTML = playing ? ICON_PAUSE + ' Pause' : ICON_PLAY + ' Play';
}

function updateStep(scene, t) {
  if (!scene.steps.length || !scene._els.explain) return;
  let cur = scene.steps[0];
  for (const s of scene.steps) if (t >= s.at) cur = s;
  if (scene._els._lastStep === cur) return;
  scene._els._lastStep = cur;
  scene._els.explain.innerHTML =
    `<span class="anim-step-label">${esc(cur.label)}</span> — ${esc(cur.text)}`;
}

/* ── Mounting ────────────────────────────────────────────── */

const ICON_PLAY  = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" style="fill:currentColor;stroke:none"><path d="M8 5v14l11-7z"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" style="fill:currentColor;stroke:none"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>';
const ICON_RESET = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" style="fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round"><path d="M4 12a8 8 0 1 0 2.5-5.8"/><path d="M4 4v4h4"/></svg>';

/**
 * Build the player chrome, run setup(), and register the scene.
 * @returns {{scene, destroy}} handle — the view MUST call destroy() on unmount
 */
export function mountScene(container, scene) {
  const reduced = reducedMotion();

  const wrap = document.createElement('div');
  wrap.className = 'anim';
  wrap.dataset.labels = 'on';

  // ── Stage ──
  const stage = document.createElement('div');
  stage.className = 'anim-stage';
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', scene.viewBox);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', scene.title || scene.id);
  stage.appendChild(svg);
  wrap.appendChild(stage);

  // ── Caption: enforced, not optional ──
  // A conceptual animation ALWAYS says so. Spec §7 and §40 both require it,
  // and putting it here means no scene can ship without it.
  if (scene.conceptual) {
    const cap = document.createElement('div');
    cap.className = 'anim-caption';
    cap.innerHTML =
      `<span class="badge badge-illustrative">Conceptual</span>
       <span>Conceptual representation — not an atomistically accurate simulation.</span>`;
    wrap.appendChild(cap);
  }

  // ── Explanation panel ──
  let explain = null;
  if (scene.steps.length) {
    explain = document.createElement('div');
    explain.className = 'anim-explain';
    wrap.appendChild(explain);
  }

  // ── Controls ──
  const controls = document.createElement('div');
  controls.className = 'anim-controls';

  const playBtn = document.createElement('button');
  playBtn.type = 'button';
  playBtn.className = 'btn btn-sm';
  playBtn.setAttribute('aria-pressed', 'false');
  playBtn.innerHTML = ICON_PLAY + ' Play';

  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'btn btn-sm';
  resetBtn.innerHTML = ICON_RESET + ' Reset';

  const progress = document.createElement('div');
  progress.className = 'anim-progress';
  progress.innerHTML = '<i></i>';

  const speedWrap = document.createElement('label');
  speedWrap.className = 'anim-speed';
  speedWrap.innerHTML = `<span>Speed</span>
    <select aria-label="Animation speed">
      <option value="0.25">0.25×</option>
      <option value="0.5">0.5×</option>
      <option value="1" selected>1×</option>
      <option value="2">2×</option>
    </select>`;

  controls.append(playBtn, resetBtn, progress, speedWrap);

  if (scene.steps.length) {
    const explainBtn = document.createElement('button');
    explainBtn.type = 'button';
    explainBtn.className = 'btn btn-sm is-active';
    explainBtn.textContent = 'Explanation';
    explainBtn.setAttribute('aria-pressed', 'true');
    explainBtn.addEventListener('click', () => {
      const on = explain.hasAttribute('hidden');
      explain.toggleAttribute('hidden', !on);
      explainBtn.setAttribute('aria-pressed', String(on));
      explainBtn.classList.toggle('is-active', on);
    });
    controls.appendChild(explainBtn);
  }

  /* Enlarge. Part of the STANDARD control set, not a per-scene option: the
     scenes are drawn wide, and on a phone that puts their smaller annotations
     below the readable floor. Every scene therefore gets a way out of the
     column. js/lib/anim-fullscreen.js explains the rotation. */
  const bigBtn = document.createElement('button');
  bigBtn.type = 'button';
  bigBtn.className = 'btn btn-sm';
  bigBtn.textContent = 'Enlarge';
  bigBtn.setAttribute('aria-label', `Enlarge the diagram: ${scene.title || scene.id}`);
  bigBtn.addEventListener('click', () => enlarge(stage, scene.title || scene.id));
  controls.appendChild(bigBtn);

  const labelBtn = document.createElement('button');
  labelBtn.type = 'button';
  labelBtn.className = 'btn btn-sm is-active';
  labelBtn.textContent = 'Labels';
  labelBtn.setAttribute('aria-pressed', 'true');
  labelBtn.addEventListener('click', () => {
    const on = wrap.dataset.labels !== 'on';
    wrap.dataset.labels = on ? 'on' : 'off';
    labelBtn.setAttribute('aria-pressed', String(on));
    labelBtn.classList.toggle('is-active', on);
  });
  controls.appendChild(labelBtn);

  wrap.appendChild(controls);
  container.appendChild(wrap);

  // ── Wire refs and build the scene ──
  scene._els = {
    wrap, svg, explain, playBtn,
    bar: progress.querySelector('i')
  };
  scene._ctx = { svg, scene, ns: SVG_NS };

  try {
    scene.setup(svg, scene._ctx);
  } catch (e) {
    console.error(`[anim] scene "${scene.id}" setup failed`, e);
    wrap.innerHTML = `<div class="callout callout-danger">This animation failed to build. See the browser console.</div>`;
    return { scene, destroy() {} };
  }

  playBtn.addEventListener('click', () => (scene._playing ? scene.pause() : scene.play()));
  resetBtn.addEventListener('click', () => { scene.pause(); scene.reset(); });
  speedWrap.querySelector('select').addEventListener('change', (e) => scene.setSpeed(parseFloat(e.target.value)));

  // ── Reduced motion: render one still frame and say why ──
  if (reduced) {
    scene._paint(scene.staticAt);
    playBtn.disabled = true;
    resetBtn.disabled = true;
    const note = document.createElement('div');
    note.className = 'anim-caption';
    note.innerHTML = `<span>Motion is reduced in your system settings, so this is shown as a still frame.</span>`;
    wrap.insertBefore(note, controls);
  } else {
    scene._paint(0);

    // Pause when scrolled out of view — the second half of the
    // mobile-performance design (Integration report §6.9).
    if ('IntersectionObserver' in window) {
      scene._observer = new IntersectionObserver((entries) => {
        for (const en of entries) {
          scene._visible = en.isIntersecting;
          if (!en.isIntersecting) active.delete(scene);
          else if (scene._playing) { active.add(scene); wake(); }
        }
      }, { threshold: 0.15 });
      scene._observer.observe(wrap);
    }
  }

  scene._mounted = true;
  return {
    scene,
    destroy() { scene.destroy(); }
  };
}

/** Stop every scene on the page. Called by app.js when the tab is hidden. */
export function pauseAll() {
  for (const s of Array.from(active)) s.pause();
}
