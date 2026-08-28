/**
 * EDMGLAB — CSV / instrument-export parsing core
 * (Architecture v0.2 §G · Roadmap P4)
 *
 * Pure functions, no DOM, no worker API. The Web Worker imports this, and so
 * does the main-thread fallback, so there is exactly one parser and it can be
 * tested outside a browser.
 *
 * ────────────────────────────────────────────────────────────────────────
 *  THE RULE THIS FILE IS WRITTEN AROUND: NEVER SILENTLY CLEAN DATA.
 * ────────────────────────────────────────────────────────────────────────
 * A parser that quietly drops the rows it does not understand will happily
 * turn a 5,000-point discharge into 4,200 points and produce a capacity that
 * is 16% low — with nothing on screen to suggest anything happened. Every row
 * this parser rejects is counted, categorised and reported back with its line
 * number, and the interface shows that report before it shows a plot.
 *
 * The same applies to every guess it makes. Delimiter, decimal separator,
 * header row and column roles are all DETECTED and then handed to the user as
 * a proposal to confirm — never applied silently. A European export using
 * semicolons and decimal commas, read as if it used points, yields numbers
 * that are wrong by factors of ten with no parse error at all.
 */

/* ════════════════════════════════════════════════════════════
   Sniffing
   ════════════════════════════════════════════════════════════ */

const DELIMS = [
  { d: ',',  name: 'comma' },
  { d: '\t', name: 'tab' },
  { d: ';',  name: 'semicolon' },
  { d: '|',  name: 'pipe' }
];

/** Split a line on a delimiter, honouring double-quoted fields. */
export function splitLine(line, delim) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }   // escaped quote
        else q = false;
      } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/**
 * Choose the delimiter by consistency, not by frequency.
 * Frequency alone picks the comma in a semicolon-separated European file that
 * happens to use decimal commas — the very case this has to get right. What
 * actually distinguishes the real delimiter is that it produces the SAME
 * field count on every line.
 */
export function sniffDelimiter(lines) {
  let best = null;
  for (const { d, name } of DELIMS) {
    const counts = lines.map((l) => splitLine(l, d).length);
    const fields = mode(counts);
    if (fields < 2) continue;
    const consistent = counts.filter((c) => c === fields).length / counts.length;
    const score = consistent * 100 + Math.min(fields, 20);
    if (!best || score > best.score) best = { delim: d, name, fields, consistent, score };
  }
  return best || { delim: ',', name: 'comma', fields: 1, consistent: 0, score: 0 };
}

/**
 * Decide whether numbers use a decimal comma.
 *
 * Only meaningful once the delimiter is known: if fields look like "1,234"
 * AND the delimiter is not a comma, the comma is a decimal separator. If the
 * delimiter IS a comma, a decimal comma cannot be distinguished from a field
 * break, and we say so rather than guessing.
 */
export function sniffDecimal(rows, delim) {
  if (delim === ',') return { decimal: '.', confident: true, reason: 'comma-delimited, so a decimal comma is not possible' };

  let commaNum = 0, dotNum = 0;
  for (const cells of rows) {
    for (const c of cells) {
      if (/^-?\d+,\d+$/.test(c)) commaNum++;
      else if (/^-?\d+\.\d+$/.test(c)) dotNum++;
    }
  }
  if (commaNum > dotNum * 2 && commaNum > 3) {
    return { decimal: ',', confident: true, reason: `${commaNum} fields look like 1,234 and only ${dotNum} like 1.234` };
  }
  if (commaNum > 0 && dotNum > 0) {
    return { decimal: '.', confident: false,
      reason: `both styles appear (${dotNum} with a point, ${commaNum} with a comma) — check the mapping preview` };
  }
  return { decimal: '.', confident: true, reason: 'numbers use a decimal point' };
}

/** Parse a numeric field under a known decimal convention. */
export function num(text, decimal = '.') {
  if (text === null || text === undefined) return NaN;
  let s = String(text).trim();
  if (!s) return NaN;
  if (decimal === ',') s = s.replace(/\./g, '').replace(',', '.');   // 1.234,56 → 1234.56
  else s = s.replace(/,/g, '');                                      // 1,234.56 → 1234.56
  // Instrument exports use several spellings for "not a number".
  if (/^(na|nan|n\/a|null|inf|-?inf|infinity|#+|-{2,})$/i.test(s)) return NaN;
  const v = Number(s);
  return Number.isFinite(v) ? v : NaN;
}

function mode(arr) {
  const m = new Map();
  for (const v of arr) m.set(v, (m.get(v) || 0) + 1);
  let bv = 0, bc = -1;
  for (const [v, c] of m) if (c > bc || (c === bc && v > bv)) { bv = v; bc = c; }
  return bv;
}

/**
 * Find the header row.
 *
 * Instrument exports routinely begin with metadata — the operator's name, the
 * schedule file, the cell mass, a blank line or two. The header is the first
 * line that both splits into the expected number of fields AND is mostly
 * non-numeric, with the line after it mostly numeric. Lines above it are kept
 * and shown, because they often contain the mass and the schedule, which the
 * user needs and would otherwise have to go back to the instrument for.
 */
export function findHeader(lines, delim, fields) {
  for (let i = 0; i < Math.min(lines.length - 1, 60); i++) {
    const cells = splitLine(lines[i], delim);
    if (cells.length !== fields) continue;
    const nonNumeric = cells.filter((c) => c && Number.isNaN(Number(c.replace(',', '.')))).length;
    if (nonNumeric < Math.max(2, cells.length * 0.5)) continue;

    const next = splitLine(lines[i + 1] || '', delim);
    if (next.length !== fields) continue;
    const numeric = next.filter((c) => c !== '' && !Number.isNaN(Number(c.replace(',', '.')))).length;
    if (numeric >= Math.max(1, next.length * 0.5)) {
      return { index: i, headers: cells, preamble: lines.slice(0, i) };
    }
  }
  return { index: -1, headers: null, preamble: [] };
}

/* ════════════════════════════════════════════════════════════
   Column roles
   ════════════════════════════════════════════════════════════ */

/**
 * Match a header against the alias table from data/import-profiles.json.
 * Returns the best role and a confidence, never a silent decision — the view
 * always shows what was matched and lets the user override it.
 */
export function detectRole(header, profiles) {
  const full = normalise(header);
  if (!full) return null;
  // Also try the header with its unit suffix removed: "Z're/ohm" has to reach
  // the alias "z'", and "Time (s)" the alias "time". Both spellings are scored
  // and the better match wins.
  const bare = normalise(stripUnit(header));
  let best = null;

  for (const role of profiles.roles || []) {
    for (const a of role.aliases || []) {
      const n = normalise(a);
      if (!n) continue;
      for (const h of (bare && bare !== full) ? [full, bare] : [full]) {
        let score = 0;
        if (h === n) score = 100;
        /* A short PLAIN-ALPHANUMERIC alias may ONLY match exactly. "t", "i",
           "v", "e", "f" are all real column headers on their own, and all
           catastrophic as substrings: without this rule a column called "Note"
           matches the time alias "t" and is silently mapped to time.
           Aliases carrying punctuation — z', z'', |z| — are distinctive enough
           to substring-match safely, and need to, because "Z're/ohm" is a real
           header that must reach the alias "z'". */
        else if (n.length <= 2 && /^[a-z0-9]+$/.test(n)) score = 0;
        else if (h.startsWith(n + ' ') || h.startsWith(n + '/') || h.startsWith(n + '(')) score = 80;
        else if (h.includes(n)) score = 60 - Math.abs(h.length - n.length);
        if (score > 0 && (!best || score > best.score)) best = { role: role.id, score, matched: a };
      }
    }
  }
  return best && best.score >= 55 ? best : null;
}

/** Everything after the first "(", "[" or unit-style "/" — "I/mA" → "I". */
function stripUnit(header) {
  return String(header || '')
    .replace(/[<>]/g, '')
    .replace(/\s*[([].*$/, '')
    .replace(/\/[^/]*$/, '')
    .trim();
}

/**
 * One canonical spelling for a unit string, so "ohm", "Ohms" and "Ω" all
 * compare equal. Ω is the reason this exists: `'Ω'.toLowerCase()` is the
 * Greek small omega 'ω', so a naive case-fold makes the symbol fail to match
 * itself.
 */
function unitKey(s) {
  return String(s || '')
    .replace(/\s+/g, '')
    .replace(/[µμ]/g, 'u')
    .replace(/[Ωω]/g, 'ohm')
    .toLowerCase()
    .replace(/^ohms$/, 'ohm')
    .replace(/^(deg|degree|degrees|dega)$/, '°')
    .replace(/^degc$/, '°c');
}

/** Pull a unit out of a header like "Voltage (V)", "I/mA", "Z' [ohm]". */
export function detectUnit(header, role, profiles) {
  const m = String(header).match(/[([/]\s*([^)\]]+?)\s*[)\]]?\s*$/);
  const raw = m ? m[1].trim() : '';
  if (!raw) return null;
  const def = (profiles.roles || []).find((r) => r.id === role);
  if (!def) return null;
  const want = unitKey(raw);
  const hit = (def.units || []).find((u) =>
    unitKey(u.u) === want || (u.aliases || []).some((a) => unitKey(a) === want));
  return hit ? hit.u : null;
}

function normalise(s) {
  return String(s || '').toLowerCase()
    .replace(/[·×<>]/g, ' ')
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ════════════════════════════════════════════════════════════
   Full parse
   ════════════════════════════════════════════════════════════ */

/**
 * Parse a whole file.
 *
 * @param {string} text
 * @param {object} profiles      data/import-profiles.json
 * @param {object} [override]    {delim, decimal, headerIndex} to force a choice
 * @param {function} [onProgress] called with 0..1
 * @returns {{columns, rows, report, detected}}
 */
export function parse(text, profiles, override = {}, onProgress = null) {
  const started = { rejected: [], blank: 0, short: 0, long: 0, nonNumeric: 0 };

  // Normalise newlines, but count the ORIGINAL line numbers so a rejection
  // report points at a line the user can actually find in their file.
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');

  const sample = lines.filter((l) => l.trim()).slice(0, 80);
  if (!sample.length) {
    return { columns: [], rows: [], detected: null,
      report: { total: 0, kept: 0, ...started, fatal: 'The file is empty.' } };
  }

  const sniff = override.delim
    ? { delim: override.delim, name: nameOf(override.delim), fields: mode(sample.map((l) => splitLine(l, override.delim).length)), consistent: 1 }
    : sniffDelimiter(sample);

  const head = override.headerIndex !== undefined && override.headerIndex >= 0
    ? { index: override.headerIndex,
        headers: splitLine(lines[override.headerIndex], sniff.delim),
        preamble: lines.slice(0, override.headerIndex) }
    : findHeader(lines, sniff.delim, sniff.fields);

  if (head.index < 0) {
    return { columns: [], rows: [], detected: { sniff },
      report: { total: lines.length, kept: 0, ...started,
        fatal: 'No header row could be identified. Choose the header line manually, or check the delimiter.' } };
  }

  const bodyStart = head.index + 1;
  const bodySample = lines.slice(bodyStart, bodyStart + 200)
    .filter((l) => l.trim()).map((l) => splitLine(l, sniff.delim));
  const dec = override.decimal
    ? { decimal: override.decimal, confident: true, reason: 'set by you' }
    : sniffDecimal(bodySample, sniff.delim);

  const n = head.headers.length;
  const cols = head.headers.map((h, i) => {
    const role = detectRole(h, profiles);
    return {
      index: i,
      header: h || `Column ${i + 1}`,
      role: role?.role || null,
      roleScore: role?.score || 0,
      matchedAlias: role?.matched || null,
      unit: role ? detectUnit(h, role.role, profiles) : null,
      values: []
    };
  });

  let total = 0;
  for (let li = bodyStart; li < lines.length; li++) {
    const raw = lines[li];
    total++;
    if (!raw.trim()) { started.blank++; continue; }

    const cells = splitLine(raw, sniff.delim);
    if (cells.length < n) {
      started.short++;
      if (started.rejected.length < 25) started.rejected.push({ line: li + 1, why: `${cells.length} fields, expected ${n}`, text: clip(raw) });
      continue;
    }
    if (cells.length > n) {
      started.long++;
      if (started.rejected.length < 25) started.rejected.push({ line: li + 1, why: `${cells.length} fields, expected ${n}`, text: clip(raw) });
      continue;
    }

    for (let c = 0; c < n; c++) cols[c].values.push(num(cells[c], dec.decimal));

    if (onProgress && (total & 8191) === 0) onProgress(li / lines.length);
  }

  const kept = cols[0]?.values.length || 0;

  // Per-column numeric quality, so a column of text (a step name, a date) is
  // visible as such rather than becoming a column of silent NaN.
  for (const c of cols) {
    const finite = c.values.filter(Number.isFinite).length;
    c.numericFraction = kept ? finite / kept : 0;
    c.numeric = c.numericFraction > 0.5;
    if (c.numeric && finite) {
      let mn = Infinity, mx = -Infinity;
      for (const v of c.values) if (Number.isFinite(v)) { if (v < mn) mn = v; if (v > mx) mx = v; }
      c.min = mn; c.max = mx;
    }
    if (c.numeric && finite < kept) started.nonNumeric += (kept - finite);
  }

  return {
    columns: cols,
    rows: kept,
    detected: {
      sniff, decimal: dec, headerIndex: head.index,
      preamble: head.preamble.filter((l) => l.trim()).slice(0, 20)
    },
    report: { total, kept, ...started, fatal: null }
  };
}

function nameOf(d) { return (DELIMS.find((x) => x.d === d) || {}).name || d; }
function clip(s) { return s.length > 90 ? s.slice(0, 87) + '…' : s; }

/* ════════════════════════════════════════════════════════════
   Series extraction
   ════════════════════════════════════════════════════════════ */

/**
 * Build {x, y} pairs from two mapped columns, converting both to SI.
 * Non-finite pairs are dropped from the PLOT and counted — the count is shown,
 * because a plot quietly missing a fifth of its points is a lie about the data.
 */
export function series(colX, colY, unitX, unitY, limit = 0) {
  const out = [];
  let dropped = 0;
  const n = Math.min(colX.values.length, colY.values.length);
  for (let i = 0; i < n; i++) {
    const x = colX.values[i], y = colY.values[i];
    if (!Number.isFinite(x) || !Number.isFinite(y)) { dropped++; continue; }
    out.push({ x: x * (unitX?.f ?? 1) + (unitX?.o ?? 0), y: y * (unitY?.f ?? 1) + (unitY?.o ?? 0) });
  }
  return { points: limit && out.length > limit ? out : out, dropped, total: n };
}

/** Descriptive statistics. Nothing inferred, nothing named. */
export function stats(col, unit) {
  const vals = col.values.filter(Number.isFinite).map((v) => v * (unit?.f ?? 1) + (unit?.o ?? 0));
  if (!vals.length) return null;
  const n = vals.length;
  let sum = 0, mn = Infinity, mx = -Infinity;
  for (const v of vals) { sum += v; if (v < mn) mn = v; if (v > mx) mx = v; }
  const mean = sum / n;
  let sq = 0;
  for (const v of vals) sq += (v - mean) * (v - mean);
  const sorted = [...vals].sort((a, b) => a - b);
  return {
    n, min: mn, max: mx, mean,
    sd: n > 1 ? Math.sqrt(sq / (n - 1)) : 0,
    median: n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2,
    span: mx - mn,
    first: vals[0], last: vals[n - 1]
  };
}
