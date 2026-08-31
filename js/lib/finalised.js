/**
 * EDMGLAB — which records the group has signed off
 *
 * Split out of router.js for the reason that has now caught three separate
 * regressions: router.js is on the boot path of every visit, so anything added
 * to it is downloaded by everyone whether they need it or not. This code is
 * needed only on a record DETAIL page, and only to upgrade a footer that has
 * already rendered correctly as "draft".
 *
 * The lazy import therefore costs nothing visually: the footer says draft,
 * then says checked if this record is. There is no flash of the wrong claim,
 * because the wrong claim in the safe direction is the one that renders first.
 *
 * ── WHY SIGN-OFF IS A COMMIT AND NOT AN ENDPOINT WRITE ──
 *
 * Review verdicts go to the review endpoint with no commit, because a verdict
 * is one person's opinion and there will be hundreds of them. "The group has
 * checked this" is a different kind of statement — the platform makes it to
 * every future student who opens that page — and it belongs in the same
 * reviewable history as the content it is about. So it is a list in
 * data/review.json that somebody edits deliberately.
 */

let cache = null;

/** Route section → the id namespace its detail pages show. A route not listed
 *  here has no single record behind it, so it keeps the general draft notice
 *  however many of the records it lists are signed off. */
const SECTION_TO_TYPE = {
  materials: 'material',
  formula: 'formula',
  characterization: 'technique',
  troubleshooting: 'troubleshooting',
  method: 'method'
};

/** The record a path is showing, or null if it is not showing exactly one. */
export function recordIdFor(path) {
  const [, section, tail] = path.split('/');
  if (!tail || !SECTION_TO_TYPE[section]) return null;
  return `${SECTION_TO_TYPE[section]}.${tail}`;
}

/**
 * Load the sign-off list once.
 * A failure leaves everything labelled draft, which is the safe direction for
 * this particular default to fail in — claiming content has been checked when
 * the file could not be read would be the one genuinely harmful outcome here.
 */
export async function load() {
  if (cache) return cache;
  cache = { ids: new Set(), by: null };
  try {
    const url = new URL('../../data/review.json', import.meta.url).href;
    const res = await fetch(url, { cache: 'no-cache' });
    if (res.ok) {
      const cfg = await res.json();
      cache.ids = new Set(cfg.finalised || []);
      cache.by = cfg.finalisedBy || null;
    }
  } catch { /* everything stays draft */ }
  return cache;
}
