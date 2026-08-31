/**
 * EDMGLAB — The pathway
 *
 * The group's founding description of this platform was not a list of modules.
 * It was a route:
 *
 *   CONCEPT → CHEMISTRY/PHYSICS → MATERIAL → PREPARATION → CHARACTERIZATION →
 *   ELECTRODE FABRICATION → ELECTROCHEMICAL TESTING → CALCULATION →
 *   DATA ANALYSIS → INTERPRETATION → TROUBLESHOOTING
 *
 * Every module was built, and none of them was that. The sidebar is a flat
 * list grouped Learn / Lab / Analysis, which is how you find a thing you
 * already know the name of — not how you follow a question from "what am I
 * even measuring" to "why does my curve look like that".
 *
 * ── WHAT MAKES THIS MORE THAN A FLOWCHART ──
 *
 * A decorative diagram linking eleven module home pages would be worthless.
 * So the spine takes a MATERIAL, and each stage then shows what the platform
 * actually holds for THAT material — and, just as loudly, where it holds
 * nothing specific and is only offering the generic module.
 *
 * That distinction is the honest part and it is also the useful part. A
 * student learns which of their questions this platform can answer and which
 * they must take to the literature or the bench. The group gets a map of
 * exactly which content is missing, per material, ranked by how often the gap
 * appears. The coverage figure at the top is deliberately not flattering.
 *
 * NOTHING IN THIS VIEW IS AUTHORED CONTENT. Every stage reads from records
 * that already exist and are already validated by the health check; this file
 * contains the stage definitions and the rules for deciding whether a stage is
 * specific or generic, and no scientific claims of its own.
 */

import { esc, pageHead, callout } from '../ui.js';
import * as data from '../data.js';

/* ══════════════════════════════════════════════════════════
   The eleven stages
   ══════════════════════════════════════════════════════════
   `question` is what a person is actually asking at that point, in their
   words. `route` is where the generic module lives. `fill` returns what the
   platform holds for a given material: { specific, html } — and `specific`
   is what the coverage count is built from, so a stage that returns generic
   text must NOT claim to be specific.                                      */

const STAGES = [
  {
    key: 'concept', label: 'Concept', route: '#/fundamentals',
    question: 'What quantity am I actually dealing with, and what does it mean?',
    fill: (m, ctx) => {
      const ids = (m.relatedIds || []).filter((i) => i.startsWith('concept.'));
      /* Three fundamentals apply to EVERY material equally, so they are named
         here rather than linked from all 24 records — linking them everywhere
         would lift the coverage figure without adding information, which is
         exactly how a metric like that stops meaning anything. */
      const always = links(
        ['concept.normalisation', 'concept.capacitance_vs_capacity', 'concept.provenance'], ctx);
      if (!ids.length) {
        return {
          specific: false,
          html: `<p class="pw-p">Nothing in <code>concepts.json</code> is linked to this material in
              particular. These three apply to it as they do to every material — and the first is not
              optional reading here, because this module's whole subject is <em>per gram of what</em>:</p>
            ${always}`
        };
      }
      return {
        specific: true,
        html: `<p class="pw-p">This material's record raises these fundamentals by name:</p>
          ${links(ids, ctx)}
          <p class="pw-note">Applying to every material, including this one: ${always}</p>`
      };
    }
  },
  {
    key: 'chemistry', label: 'Chemistry / physics', route: '#/chemistry',
    question: 'By what mechanism does this material actually store charge?',
    fill: (m, ctx) => {
      if (!m.mechanismId) {
        return {
          specific: true,
          html: `${callout(`<strong>No mechanism record covers this material.</strong>
            ${esc(m.mechanismNote || '')}`, 'warn')}
            <p class="pw-p">That is a recorded gap in <code>electrochemistry.json</code>, not an
            oversight — forcing this reaction into the nearest available label would teach
            vocabulary that does not apply to it.</p>`
        };
      }
      const mech = ctx.mechanisms.find((x) => x.id === m.mechanismId);
      return {
        specific: true,
        html: `${links([m.mechanismId], ctx)}
          ${mech?.summary ? `<p class="pw-p">${esc(mech.summary)}</p>` : ''}
          ${m.mechanismNote
            ? `<p class="pw-note"><strong>With a caveat.</strong> ${esc(m.mechanismNote)}</p>` : ''}`
      };
    }
  },
  {
    key: 'material', label: 'Material', route: '#/materials',
    question: 'What is it, and how much charge could it possibly hold?',
    fill: (m, ctx) => ({
      specific: true,
      html: `<p class="pw-p">${esc(m.summary)}</p>
        <p class="eqn pw-eqn">${esc(m.reaction)}</p>
        ${ctx.capacity(m)
          ? `<p class="pw-p"><strong>${ctx.capacity(m).toFixed(1)} mAh/g</strong> theoretical, computed
             from the formula unit and electron count this record declares — not a stored number.</p>`
          : `<p class="pw-p"><strong>No theoretical capacity exists</strong> for this material.</p>`}
        <p class="pw-p"><a href="#/materials/${esc(short(m.id))}">Open the full record →</a></p>`,
      /* This stage already links to the exact record, so the per-stage footer
         link to the module index below would just be a worse version of it. */
      hideMore: true
    })
  },
  {
    key: 'preparation', label: 'Preparation', route: '#/preparation',
    question: 'How is the powder turned into something I can test?',
    fill: () => generic(`The platform holds <strong>one</strong> preparation chain — formulation,
      mixing, casting, drying, calendering, punching — and it is written to be general.
      Nothing in it is specific to this material, and a synthesis route for this material is
      not in the platform at all.`)
  },
  {
    key: 'characterization', label: 'Characterisation', route: '#/characterization',
    question: 'How do I confirm I made what I think I made?',
    fill: (m, ctx) => {
      const rows = ctx.techniquesFor(m.id);
      if (!rows.length) {
        return generic(`Eleven techniques are documented, each with what it can and cannot tell you.
          None is yet linked to a question <em>this material's own record raises</em>.`);
      }
      return {
        specific: true,
        html: `<p class="pw-p">These are linked because this material's own record names the thing
            the technique measures — they are reasons to run an experiment, never results of one:</p>
          <div class="pw-rows">
            ${rows.map((r) => `<div class="pw-row">
              <a href="#/characterization/${esc(short(r.id))}"><strong>${esc(r.name || r.id)}</strong></a>
              <span>${esc(r.why)}</span>
            </div>`).join('')}
          </div>`
      };
    }
  },
  {
    key: 'fabrication', label: 'Electrode fabrication', route: '#/preparation',
    question: 'What decisions in making the electrode will change my result?',
    fill: () => generic(`Covered by the preparation chain's decision points — binder, conductive
      additive, loading, thickness, calendering. Generic to all materials, and the loading and
      thickness choices there matter more to a result than most people expect.`)
  },
  {
    key: 'testing', label: 'Electrochemical testing', route: '#/workstation',
    question: 'Which measurement do I run, in which cell configuration?',
    fill: (m) => ({
      specific: true,
      html: `<div class="pw-hc">
          <div><div class="pw-hc-h">In a half cell — against ${esc(m.halfCell?.against || '—')}</div>
            <p class="pw-p">${esc(m.halfCell?.whatItMeasures || '')}</p></div>
          <div><div class="pw-hc-h">In a full cell</div>
            <p class="pw-p">${esc(m.fullCell?.whatChanges || '')}</p></div>
        </div>
        <p class="pw-note"><strong>The methods themselves are generic.</strong> CV, GCD and EIS are
          documented under the workstation and the battery tester, and none of them is written for
          this material in particular. What IS specific is the configuration above — and getting that
          wrong is what makes a number uninterpretable rather than merely imprecise.</p>`
    })
  },
  {
    key: 'calculation', label: 'Calculation', route: '#/formulas',
    question: 'Which formula turns my raw curve into a reported number?',
    fill: (m, ctx) => {
      const ids = (m.relatedIds || []).filter((i) => i.startsWith('formula.'));
      if (!ids.length) {
        return generic(`The formula library applies as it does to any material, with each entry
          stating the configuration it is valid in. No formula is linked specifically to this record.`);
      }
      return { specific: true, html: links(ids, ctx) };
    }
  },
  {
    key: 'analysis', label: 'Data analysis', route: '#/analysis',
    question: 'What do I do with the file the instrument gave me?',
    fill: () => generic(`Import your own CSV and plot it, or run b-value and Dunn deconvolution on
      a scan-rate series. Both work on any material's data and neither knows what material it is.`)
  },
  {
    key: 'interpretation', label: 'Interpretation', route: '#/materials',
    question: 'What does my number NOT tell me?',
    fill: (m) => {
      const rows = m.cannotTell || [];
      if (!rows.length) return generic('This record does not yet list what its measurements cannot establish.');
      return {
        specific: true,
        html: `<p class="pw-p">What a measurement on this material does <strong>not</strong> establish:</p>
          <ul class="pw-list">${rows.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
          ${(m.electrolyteContext || []).length ? `<p class="pw-note"><strong>And it depends on the
            electrolyte.</strong> This record covers
            ${m.electrolyteContext.map((c) => esc(c.system)).join(' and ')} systems separately,
            because the solvent is not a background condition.</p>` : ''}`
      };
    }
  },
  {
    key: 'troubleshooting', label: 'Troubleshooting', route: '#/troubleshooting',
    question: 'It looks wrong. What are the possible causes?',
    fill: (m, ctx) => {
      const rows = ctx.symptomsFor(m.id);
      if (!rows.length) {
        return generic(`Ten symptom-first entries, each giving <strong>several</strong> possible causes
          and the diagnostic that separates them. None names this material specifically.`);
      }
      return {
        specific: true,
        html: `<p class="pw-p">Symptoms this material's own record gives you a reason to expect —
            <strong>candidate causes to rule in or out, never a diagnosis</strong>:</p>
          <div class="pw-rows">
            ${rows.map((r) => `<div class="pw-row">
              <a href="#/troubleshooting/${esc(short(r.id))}"><strong>${esc(r.symptom)}</strong></a>
              <span>${esc(r.why)}</span>
            </div>`).join('')}
          </div>
          <p class="pw-note">Each of those entries lists several possible causes. This material being a
            plausible one does not make it the cause — open the entry and run the diagnostic that
            separates them.</p>`
      };
    }
  }
];

const generic = (html) => ({ specific: false, html: `<p class="pw-p">${html}</p>` });
const short = (id) => String(id).replace(/^[a-z]+\./, '');

/* ══════════════════════════════════════════════════════════ */

export async function render(outlet, ctxIn) {
  const [mats, ec, ch, concepts, formulas, tsBt, tsEc] = await Promise.all([
    data.load('materials'), data.load('electrochemistry'), data.load('characterization'),
    data.load('concepts').catch(() => ({})), data.load('formulas').catch(() => ({})),
    /* The registry key is 'ec/troubleshooting', not 'echem/…' — the file lives
       at echem/troubleshooting.json but the key does not match its path, which
       is exactly the sort of thing a silent .catch() would have hidden. */
    data.load('bt/troubleshooting').catch(() => ({})), data.load('ec/troubleshooting').catch(() => ({}))
  ]);
  const symptoms = [...(tsBt.items || []), ...(tsEc.items || [])];

  const items = mats.items || [];
  const chosenId = ctxIn?.params?.id
    ? (String(ctxIn.params.id).startsWith('material.') ? ctxIn.params.id : `material.${ctxIn.params.id}`)
    : null;
  const chosen = chosenId ? items.find((m) => m.id === chosenId) : null;

  const ctx = {
    mechanisms: ec.items || [],
    names: new Map([...(concepts.items || []), ...(formulas.items || []), ...(ec.items || [])]
      .map((r) => [r.id, r.name || r.title || r.id])),
    routeFor,
    capacity,
    techniquesFor(materialId) {
      /* Reverse lookup: characterization.json holds materialNotes keyed by
         material id, so the link and the REASON for it live with the technique
         rather than being restated here. One place, one wording. */
      return (ch.items || [])
        .filter((t) => t.materialNotes && t.materialNotes[materialId])
        .map((t) => ({ id: t.id, name: t.name, why: t.materialNotes[materialId] }));
    },
    symptomsFor(materialId) {
      return symptoms
        .filter((t) => t.materialNotes && t.materialNotes[materialId])
        .map((t) => ({ id: t.id, symptom: t.symptom || t.title || t.id, why: t.materialNotes[materialId] }));
    }
  };

  outlet.innerHTML = chosen ? forMaterial(chosen, items, ctx) : overview(items, ctx);
  wire(outlet);
  return { destroy() {} };
}

/** Where a cross-referenced id lives. Derived from the id's namespace so a new
 *  record type fails visibly here rather than producing a dead link. */
/**
 * Where a cross-referenced id lives.
 *
 * Only three of these route to a single record: formulas, techniques and
 * materials each have a detail page keyed by the id's tail. Concepts and
 * mechanisms do NOT — `#/fundamentals/:section` and `#/chemistry/:section`
 * take a section name, not a record id, so those link to the section that
 * holds them. A trailing slash below means "append the id tail"; no slash
 * means the route is the destination.
 *
 * This is deliberately not solved by adding a scroll-to-record parameter to
 * those two views. They work, the pathway already shows the mechanism's own
 * summary inline so nothing is lost by landing on the section, and jumping
 * the page to an element sits badly with a platform whose standing rule is
 * that nothing should need scrolling.
 */
const ROUTE_BY_TYPE = {
  formula: '#/formula/',
  technique: '#/characterization/',
  material: '#/materials/',
  concept: '#/fundamentals/concepts',
  mechanism: '#/chemistry/mechanisms',
  potential: '#/materials'
};
function routeFor(id) {
  const base = ROUTE_BY_TYPE[id.split('.')[0]];
  if (!base) return null;
  return base.endsWith('/') ? base + short(id) : base;
}

function links(ids, ctx) {
  return `<div class="pw-chips">${ids.map((id) => {
    const href = ctx.routeFor(id);
    const label = ctx.names.get(id) || short(id).replace(/_/g, ' ');
    return href ? `<a class="pw-chip" href="${esc(href)}">${esc(label)}</a>`
                : `<span class="pw-chip">${esc(label)}</span>`;
  }).join('')}</div>`;
}

/* Capacity is recomputed here rather than imported from the materials view,
   for the same reason the test keeps its own atomic-weight table: two paths to
   one number is the only arrangement that can catch a wrong one. */
const AW = {
  H: 1.008, Li: 6.94, C: 12.011, N: 14.007, O: 15.999, Na: 22.990, Mg: 24.305,
  Al: 26.982, Si: 28.085, P: 30.974, S: 32.06, K: 39.098, Ti: 47.867,
  V: 50.942, Mn: 54.938, Fe: 55.845, Co: 58.933, Ni: 58.693, Cu: 63.546,
  Zn: 65.38, Pb: 207.2
};
function capacity(m) {
  if (!m.composition || !m.electrons) return null;
  let M = 0;
  for (const [el, n] of Object.entries(m.composition)) {
    if (AW[el] === undefined) return null;
    M += AW[el] * n;
  }
  return (m.electrons * 96485.332) / (3.6 * M);
}

/* ══════════════════════════════════════════════════════════
   The overview
   ══════════════════════════════════════════════════════════ */

function overview(items, ctx) {
  const scored = items.map((m) => ({ m, n: coverage(m, ctx) }))
    .sort((a, b) => b.n - a.n || a.m.name.localeCompare(b.m.name));

  return `
    ${pageHead('The pathway',
      'The route this platform was asked to make navigable — from what a quantity means to why a curve looks wrong.')}

    <p class="small" style="max-width:78ch">Every module here answers a question that arrives at a
      particular point in an experiment. The sidebar sorts them by what they are; this page sorts them
      by <strong>when you need them</strong>. Pick a material and each stage fills in with what the
      platform actually holds for it — and says so plainly where it holds only the generic module.</p>

    <section class="section">
      <div class="section-head"><h2>The eleven stages</h2>
        <span class="section-note">each one links to the module that covers it</span></div>
      <ol class="pw-spine">
        ${STAGES.map((s, i) => `<li class="pw-stage">
          <span class="pw-n">${i + 1}</span>
          <div>
            <a class="pw-slabel" href="${esc(s.route)}">${esc(s.label)}</a>
            <div class="pw-q">${esc(s.question)}</div>
          </div>
        </li>`).join('')}
      </ol>
    </section>

    ${gapAnalysis(items, ctx)}

    <section class="section">
      <div class="section-head"><h2>Walk it for one material</h2>
        <span class="section-note">${items.length} materials · sorted by how much the platform holds</span></div>
      ${callout(`<strong>The coverage number counts stages, not quality.</strong> It is the number of
        stages holding something specific to that material rather than the generic module — a
        <em>floor</em>, satisfied by one grounded link. It cannot tell you whether the content is deep,
        whether the most useful technique was the one linked, or whether anyone has reviewed it. Three
        stages are generic by nature and can never count, so 8 is the maximum.`, 'info')}
      <div class="pw-cards">
        ${scored.map(({ m, n }) => `
          <a class="pw-card" href="#/pathway/${esc(short(m.id))}">
            <h3>${esc(m.name)}</h3>
            <div class="pw-sub">${esc(m.role)} · ${(m.chemistry || []).join(', ')}</div>
            <div class="pw-bar" role="img"
                 aria-label="${n} of ${STAGES.length} stages hold material-specific content">
              ${STAGES.map((s) => `<span class="${stageSpecific(m, s, ctx) ? 'on' : ''}"></span>`).join('')}
            </div>
            <div class="pw-sub">${n} of ${STAGES.length} stages specific to this material</div>
          </a>`).join('')}
      </div>
    </section>

    ${STYLE}`;
}

/**
 * Where the platform is thin, counted rather than guessed.
 *
 * This is the most useful thing this page does for the GROUP rather than for a
 * student. It is not a progress bar: several stages are generic by nature —
 * one preparation chain serves every material, and the analysis tools do not
 * know what material produced the file. Those are marked so nobody spends a
 * weekend "fixing" them. What is left is the real list of what to write next,
 * ordered by how many materials the gap affects.
 */
const BY_NATURE_GENERIC = new Set(['preparation', 'fabrication', 'analysis']);

function gapAnalysis(items, ctx) {
  const rows = STAGES.map((s) => {
    const n = items.filter((m) => stageSpecific(m, s, ctx)).length;
    return { s, n, pct: items.length ? Math.round((n / items.length) * 100) : 0 };
  });
  const worth = rows.filter((r) => !BY_NATURE_GENERIC.has(r.s.key) && r.n < items.length)
    .sort((a, b) => a.n - b.n);

  return `
    <section class="section">
      <div class="section-head"><h2>Where the platform is thin</h2>
        <span class="section-note">counted across all ${items.length} materials</span></div>
      <p class="small" style="max-width:78ch">How many materials have something written for them at each
        stage. Three stages are <strong>generic by nature</strong> and are marked as such — one
        preparation chain serves every material, and the analysis tools do not know what produced the
        file. Nobody should try to "fix" those.</p>
      <div class="pw-rows">
        ${rows.map(({ s, n, pct }) => {
          const nature = BY_NATURE_GENERIC.has(s.key);
          return `<div class="pw-gap">
            <span>${esc(s.label)}</span>
            <span class="pw-meter" role="img" aria-label="${n} of ${items.length} materials">
              <span style="width:${nature ? 100 : pct}%" class="${nature ? 'nature' : ''}"></span>
            </span>
            <span class="pw-gap-n">${nature ? 'generic by design' : `${n} / ${items.length}`}</span>
          </div>`;
        }).join('')}
      </div>
      ${worth.length ? `<p class="pw-note" style="max-width:78ch">
        <strong>The next thing worth writing</strong> is ${esc(worth[0].s.label.toLowerCase())} content —
        ${items.length - worth[0].n} of ${items.length} materials have none. After that,
        ${worth.slice(1, 3).map((r) => esc(r.s.label.toLowerCase())).join(' and ')}.</p>`
      : `<p class="pw-note" style="max-width:78ch">
        <strong>Every material now has at least one record-grounded link at every stage that can have
        one — and that is a floor, not a ceiling.</strong> A full bar means each material has somewhere
        specific to go from each stage. It does not mean the coverage is deep, that the most useful
        technique was the one linked, or that the content has been reviewed. The bars stop being
        informative at this point; what replaces them is reading the pages.</p>`}
    </section>`;
}

function stageSpecific(m, s, ctx) {
  try { return Boolean(s.fill(m, ctx)?.specific); } catch { return false; }
}
function coverage(m, ctx) {
  return STAGES.filter((s) => stageSpecific(m, s, ctx)).length;
}

/* ══════════════════════════════════════════════════════════
   The pathway for one material
   ══════════════════════════════════════════════════════════ */

function forMaterial(m, items, ctx) {
  const filled = STAGES.map((s) => ({ s, r: s.fill(m, ctx) }));
  const n = filled.filter((x) => x.r.specific).length;
  const gaps = filled.filter((x) => !x.r.specific).map((x) => x.s.label);

  return `
    <p style="margin-bottom:1rem"><a class="btn btn-sm" href="#/pathway">← All materials</a></p>
    ${pageHead(`${m.name} — the whole pathway`,
      'From what the quantity means to why the curve looks wrong, for this material specifically.')}

    <div class="pw-summary">
      <div><div class="pw-big">${n}<span>/${STAGES.length}</span></div>
        <div class="pw-sub">stages with content specific to this material</div></div>
      <div>
        <div class="pw-sub" style="margin-bottom:.3rem">Generic only</div>
        <div class="pw-chips">${gaps.map((g) => `<span class="pw-chip muted">${esc(g)}</span>`).join('')}</div>
      </div>
    </div>

    <ol class="pw-walk">
      ${filled.map(({ s, r }, i) => `
        <li class="pw-step ${r.specific ? 'is-specific' : 'is-generic'}">
          <div class="pw-step-head">
            <span class="pw-n">${i + 1}</span>
            <div>
              <h2 class="pw-h">${esc(s.label)}</h2>
              <div class="pw-q">${esc(s.question)}</div>
            </div>
            <span class="chip ${r.specific ? 'chip-ok' : ''}">${r.specific ? 'this material' : 'generic'}</span>
          </div>
          <div class="pw-body">
            ${r.html}
            ${r.hideMore ? '' : `<p class="pw-more"><a href="${esc(s.route)}">Open ${esc(s.label)} →</a></p>`}
          </div>
        </li>`).join('')}
    </ol>

    ${callout(`<strong>A generic stage is not an empty one.</strong> The module behind it is written and
      applies to this material as it does to any other. What "generic" means here is narrower and more
      useful: nothing in the platform is written about <em>this material at this stage</em>, so if you
      need that, it is a literature question or a bench question — and a good candidate for the next
      thing this group writes down.`, 'info')}

    ${STYLE}`;
}

function wire(outlet) {
  /* Nothing to bind: every control on this page is a link, which is what makes
     it work with a keyboard, with a screen reader and offline without effort. */
  void outlet;
}

const STYLE = `
  <style>
    .pw-spine { list-style:none; margin:0; padding:0; display:grid; gap:.4rem; }
    .pw-stage { display:grid; grid-template-columns:auto 1fr; gap:.75rem; align-items:start;
                padding:.6rem .8rem; background:var(--surface); border:1px solid var(--border);
                border-radius:var(--r-md); }
    .pw-n { display:inline-flex; align-items:center; justify-content:center; width:26px; height:26px;
            border-radius:50%; background:var(--surface-2); border:1px solid var(--border);
            font-family:var(--font-mono); font-size:var(--fs-xs); font-weight:700; flex:none; }
    .pw-slabel { font-weight:600; font-size:var(--fs-base); }
    .pw-q { font-size:var(--fs-sm); color:var(--text-2); }

    .pw-cards { display:grid; gap:.85rem; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); }
    .pw-card { display:block; padding:.9rem 1rem; background:var(--surface);
               border:1px solid var(--border); border-radius:var(--r-lg); color:inherit; }
    .pw-card:hover { border-color:var(--accent); text-decoration:none; color:inherit; }
    .pw-card h3 { margin:0 0 .15rem; font-size:var(--fs-base); }
    .pw-sub { font-size:var(--fs-xs); color:var(--text-muted); }
    .pw-bar { display:flex; gap:3px; margin:.6rem 0 .35rem; }
    .pw-bar span { flex:1; height:7px; border-radius:2px; background:var(--surface-2);
                   border:1px solid var(--border); }
    .pw-bar span.on { background:var(--ok); border-color:var(--ok); }

    .pw-summary { display:grid; gap:1rem; grid-template-columns:1fr; align-items:center;
                  padding:1rem; background:var(--surface); border:1px solid var(--border);
                  border-radius:var(--r-lg); margin-bottom:1.25rem; }
    @media (min-width:760px){ .pw-summary { grid-template-columns:auto 1fr; gap:2rem; } }
    .pw-big { font-family:var(--font-mono); font-size:var(--fs-2xl); font-weight:700;
              color:var(--accent-strong); line-height:1; }
    .pw-big span { font-size:var(--fs-md); color:var(--text-muted); }

    .pw-walk { list-style:none; margin:0; padding:0; display:grid; gap:.7rem; }
    .pw-step { border:1px solid var(--border); border-radius:var(--r-lg); background:var(--surface);
               overflow:hidden; }
    .pw-step.is-specific { border-left:4px solid var(--ok); }
    .pw-step.is-generic { border-left:4px solid var(--border); }
    .pw-step-head { display:grid; grid-template-columns:auto 1fr auto; gap:.75rem; align-items:center;
                    padding:.7rem .9rem; background:var(--surface-2); }
    .pw-h { margin:0; font-size:var(--fs-base); }
    .pw-body { padding:.85rem .9rem; }
    .pw-p { font-size:var(--fs-sm); margin:0 0 .6rem; max-width:78ch; }
    .pw-eqn { font-size:var(--fs-sm); margin:0 0 .6rem; }
    .pw-note { font-size:var(--fs-xs); color:var(--text-2); margin:.6rem 0 0; max-width:78ch;
               border-top:1px solid var(--border); padding-top:.5rem; }
    .pw-list { font-size:var(--fs-sm); margin:0 0 .5rem; padding-left:1.1rem; max-width:78ch; }
    .pw-list li { margin-bottom:.3rem; }
    .pw-more { font-size:var(--fs-xs); margin:.6rem 0 0; }
    .pw-chips { display:flex; flex-wrap:wrap; gap:.35rem; }
    .pw-chip { display:inline-flex; padding:2px var(--sp-2); border-radius:var(--r-pill);
               background:var(--surface-2); border:1px solid var(--border);
               font-size:var(--fs-xs); color:var(--text-2); }
    a.pw-chip:hover { border-color:var(--accent); color:var(--accent-strong); text-decoration:none; }
    .pw-rows { display:grid; gap:.4rem; }
    .pw-row { display:grid; gap:.15rem; padding:.5rem .65rem; background:var(--surface-2);
              border-radius:var(--r-sm); font-size:var(--fs-sm); }
    .pw-row span { font-size:var(--fs-xs); color:var(--text-2); }
    /* The link is the row's title, so its natural box is one line of text —
       22 px, which is under the 24 px minimum target. Made a block with a
       little vertical padding so the tappable area matches what it looks like. */
    .pw-row > a { display:block; padding:.15rem 0; min-height:24px; }
    .pw-hc { display:grid; gap:.8rem; grid-template-columns:1fr; }
    @media (min-width:820px){ .pw-hc { grid-template-columns:1fr 1fr; } }
    .pw-hc-h { font-weight:600; font-size:var(--fs-sm); margin-bottom:.25rem; }

    .pw-gap { display:grid; grid-template-columns:minmax(9rem,auto) 1fr auto; gap:.75rem;
              align-items:center; padding:.4rem .65rem; background:var(--surface-2);
              border-radius:var(--r-sm); font-size:var(--fs-sm); }
    .pw-meter { display:block; height:9px; border-radius:5px; background:var(--surface);
                border:1px solid var(--border); overflow:hidden; }
    .pw-meter > span { display:block; height:100%; background:var(--ok); }
    .pw-meter > span.nature { background:var(--text-muted); opacity:.45; }
    .pw-gap-n { font-family:var(--font-mono); font-size:var(--fs-xs); color:var(--text-2);
                white-space:nowrap; }
  </style>`;
