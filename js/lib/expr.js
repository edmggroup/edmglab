/**
 * EDMGLAB — Safe expression evaluator and unit engine
 * (Architecture v0.2 §D.4 · Instrumentation spec §40)
 *
 * ────────────────────────────────────────────────────────────────────────
 *  WHY THIS EXISTS RATHER THAN A CALCULATOR PER FORMULA
 * ────────────────────────────────────────────────────────────────────────
 * A file per calculator means twenty-odd files that each re-implement input
 * handling, unit conversion and formatting — and twenty places for a unit
 * error to hide. Here a formula record declares its own expression and the
 * units of each variable, and ONE generic calculator is generated from it.
 * Adding a formula is a JSON edit; it is never a code change.
 *
 * ── WHY NOT eval() / new Function() ──
 * The expressions live in a git-tracked content file that group members are
 * explicitly invited to edit through GitHub's web editor. Handing that file
 * a path to arbitrary JavaScript execution would be indefensible, however
 * trusted the authors are. This is a real parser: it accepts numbers,
 * declared variable symbols, + − × ÷ ^, parentheses and a fixed list of
 * mathematical functions, and nothing else. An expression it cannot parse
 * throws, and the health check reports it.
 *
 * ── UNITS ──
 * Everything is evaluated in SI. Each variable declares the units it may be
 * entered in and the factor that converts that unit TO SI; the result
 * declares the same for converting FROM SI. Evaluating in one consistent
 * system is what stops "mA vs A" and "g vs kg" errors, which are by a wide
 * margin the most common way a specific capacitance comes out 1000× wrong.
 */

/* ════════════════════════════════════════════════════════════
   Tokeniser
   ════════════════════════════════════════════════════════════ */

const NUM = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/;
/* Identifiers allow letters, digits and underscore, plus the Greek and
   subscript characters the formulas actually use (Δ, η, σ, α, ₀…). */
const IDENT = /^[A-Za-z_Ͱ-Ͽ₀-₟][A-Za-z0-9_Ͱ-Ͽ₀-₟]*/;

function tokenize(src) {
  const out = [];
  let s = String(src);
  let i = 0;

  while (i < s.length) {
    const rest = s.slice(i);
    const ch = s[i];

    if (/\s/.test(ch)) { i++; continue; }

    if ('+-*/^(),'.includes(ch)) { out.push({ t: ch }); i++; continue; }
    // Accept the typographic multiplication and division signs authors
    // naturally type, rather than making the content file learn ASCII.
    if (ch === '×' || ch === '·') { out.push({ t: '*' }); i++; continue; }
    if (ch === '÷') { out.push({ t: '/' }); i++; continue; }

    const n = rest.match(NUM);
    if (n) { out.push({ t: 'num', v: parseFloat(n[0]) }); i += n[0].length; continue; }

    const id = rest.match(IDENT);
    if (id) { out.push({ t: 'id', v: id[0] }); i += id[0].length; continue; }

    throw new Error(`Unexpected character "${ch}" at position ${i}`);
  }
  out.push({ t: 'end' });
  return out;
}

/* ════════════════════════════════════════════════════════════
   Parser — recursive descent, standard precedence
   expr   := term (('+'|'-') term)*
   term   := unary (('*'|'/') unary)*
   unary  := ('-'|'+') unary | power
   power  := atom ('^' unary)?          right-associative
   atom   := number | ident | ident '(' args ')' | '(' expr ')'
   ════════════════════════════════════════════════════════════ */

/** Functions an expression may call. Deliberately a fixed, small list. */
export const FUNCTIONS = {
  sqrt: Math.sqrt,
  abs: Math.abs,
  ln: Math.log,
  log10: Math.log10,
  log: Math.log10,          // "log" means base 10 in every formula here
  exp: Math.exp,
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan,
  min: Math.min, max: Math.max,
  pow: Math.pow
};

/** Physical constants an expression may reference by name. */
export const CONSTANTS = {
  F: 96485.332,        // C/mol      Faraday constant
  R: 8.314462618,      // J/(mol·K)  gas constant
  PI: Math.PI,
  e: Math.E
};

export function parse(src) {
  const tk = tokenize(src);
  let p = 0;
  const peek = () => tk[p];
  const eat = (t) => {
    if (tk[p].t !== t) throw new Error(`Expected "${t}" but found "${tk[p].t}"`);
    return tk[p++];
  };

  function expr() {
    let node = term();
    while (peek().t === '+' || peek().t === '-') {
      const op = tk[p++].t;
      node = { op, a: node, b: term() };
    }
    return node;
  }
  function term() {
    let node = unary();
    while (peek().t === '*' || peek().t === '/') {
      const op = tk[p++].t;
      node = { op, a: node, b: unary() };
    }
    return node;
  }
  function unary() {
    if (peek().t === '-') { p++; return { op: 'neg', a: unary() }; }
    if (peek().t === '+') { p++; return unary(); }
    return power();
  }
  function power() {
    const base = atom();
    if (peek().t === '^') { p++; return { op: '^', a: base, b: unary() }; }
    return base;
  }
  function atom() {
    const t = peek();
    if (t.t === 'num') { p++; return { op: 'num', v: t.v }; }
    if (t.t === 'id') {
      p++;
      if (peek().t === '(') {
        p++;
        const args = [];
        if (peek().t !== ')') {
          args.push(expr());
          while (peek().t === ',') { p++; args.push(expr()); }
        }
        eat(')');
        if (!FUNCTIONS[t.v]) throw new Error(`Unknown function "${t.v}"`);
        return { op: 'call', name: t.v, args };
      }
      return { op: 'var', name: t.v };
    }
    if (t.t === '(') { p++; const e = expr(); eat(')'); return e; }
    throw new Error(`Unexpected "${t.t}" in expression`);
  }

  const ast = expr();
  if (peek().t !== 'end') throw new Error(`Unexpected trailing "${peek().t}"`);
  return ast;
}

/** Every variable symbol an expression reads (constants excluded). */
export function symbols(ast, out = new Set()) {
  if (!ast || typeof ast !== 'object') return out;
  if (ast.op === 'var') { if (!(ast.name in CONSTANTS)) out.add(ast.name); return out; }
  if (ast.op === 'call') { ast.args.forEach((a) => symbols(a, out)); return out; }
  symbols(ast.a, out); symbols(ast.b, out);
  return out;
}

/** Evaluate a parsed expression against a {symbol: number} scope. */
export function evaluate(ast, scope = {}) {
  switch (ast.op) {
    case 'num': return ast.v;
    case 'neg': return -evaluate(ast.a, scope);
    case '+': return evaluate(ast.a, scope) + evaluate(ast.b, scope);
    case '-': return evaluate(ast.a, scope) - evaluate(ast.b, scope);
    case '*': return evaluate(ast.a, scope) * evaluate(ast.b, scope);
    case '/': {
      const d = evaluate(ast.b, scope);
      // Return Infinity rather than throwing: the calculator shows it as an
      // undefined result with an explanation, which is more useful to a
      // student than an error message with no context.
      return evaluate(ast.a, scope) / d;
    }
    case '^': return Math.pow(evaluate(ast.a, scope), evaluate(ast.b, scope));
    case 'call': return FUNCTIONS[ast.name](...ast.args.map((a) => evaluate(a, scope)));
    case 'var': {
      if (ast.name in scope) return scope[ast.name];
      if (ast.name in CONSTANTS) return CONSTANTS[ast.name];
      throw new Error(`No value for "${ast.name}"`);
    }
    default: throw new Error(`Bad node "${ast.op}"`);
  }
}

/** Parse once, evaluate many. Cached by source string. */
const cache = new Map();
export function compile(src) {
  if (cache.has(src)) return cache.get(src);
  const ast = parse(src);
  const fn = (scope) => evaluate(ast, scope);
  fn.ast = ast;
  fn.symbols = Array.from(symbols(ast));
  cache.set(src, fn);
  return fn;
}

/* ════════════════════════════════════════════════════════════
   Units
   ════════════════════════════════════════════════════════════ */

/**
 * A unit is {u, f, o?}: value_SI = value_in_unit × f + (o ?? 0).
 * The offset exists for temperature only — °C to K is the one conversion in
 * this library that is not a pure scaling, and getting it wrong in an
 * Arrhenius or Tafel expression is a silent 273-fold class of error.
 */
export function toSI(value, unit) {
  if (!unit) return value;
  return value * (unit.f ?? 1) + (unit.o ?? 0);
}

export function fromSI(value, unit) {
  if (!unit) return value;
  return (value - (unit.o ?? 0)) / (unit.f ?? 1);
}

export function findUnit(list, name) {
  if (!Array.isArray(list) || !list.length) return null;
  return list.find((u) => u.u === name) || list[0];
}

/* ════════════════════════════════════════════════════════════
   Formatting
   ════════════════════════════════════════════════════════════ */

/** Significant-figure formatting that never invents precision. */
export function sig(value, digits = 4) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  if (!Number.isFinite(value)) return value > 0 ? '∞' : '−∞';
  if (value === 0) return '0';
  const a = Math.abs(value);
  if (a < 1e-4 || a >= 1e6) return value.toExponential(Math.max(0, digits - 1));
  return String(Number(value.toPrecision(digits)));
}

/**
 * Compute one formula record.
 *
 * @param {object} f       formula record with { expression, variables[], result }
 * @param {object} inputs  { symbol: { value, unit } } as entered by the user
 * @returns {{ok:boolean, value?:number, display?:number, unit?:string,
 *            si?:number, error?:string, missing?:string[]}}
 */
export function computeFormula(f, inputs) {
  if (!f?.expression) return { ok: false, error: 'This formula has no computable expression.' };

  let fn;
  try { fn = compile(f.expression); }
  catch (e) { return { ok: false, error: `Expression could not be parsed: ${e.message}` }; }

  const scope = {};
  const missing = [];

  for (const v of f.variables || []) {
    const got = inputs[v.symbol];
    if (got === undefined || got.value === '' || got.value === null || Number.isNaN(got.value)) {
      if (fn.symbols.includes(v.symbol)) missing.push(v.symbol);
      continue;
    }
    const unit = findUnit(v.units, got.unit);
    scope[v.symbol] = toSI(Number(got.value), unit);
  }

  if (missing.length) return { ok: false, missing };

  let si;
  try { si = fn(scope); }
  catch (e) { return { ok: false, error: e.message }; }

  const outUnit = findUnit(f.result?.units, inputs.__resultUnit);
  return {
    ok: true,
    si,
    value: fromSI(si, outUnit),
    unit: outUnit?.u || f.result?.siUnit || '',
    scope
  };
}
