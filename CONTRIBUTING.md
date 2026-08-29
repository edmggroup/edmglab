# Adding content to EDMGLAB

This guide is for members of the research group who want to add or correct scientific content. **You do not need to install anything, and you do not need to write code.** Everything below happens in a web browser.

---

## The short version

1. Open the relevant file under `/data/` on GitHub.
2. Click the pencil (Edit) icon.
3. Add your entry, following the pattern of the entries already there.
4. Commit — either straight to `main`, or as a pull request if you would like it reviewed first.
5. Wait about a minute, then open the site and check the **Data Health Check** page (`#/health`).

That is the whole workflow. The site rebuilds itself. There is no build step, no npm, no deployment.

**If it is your first time, start with the glossary.** One term, two fields, no cross-references. It gets you through the whole loop — edit, commit, health check — on something that cannot break anything.

---

## Where things live

Every content file is registered in `js/data.js`. If it is not in that list the site will never load it, so a new file needs one line added there as well — ask, or open an issue.

### Record collections

These hold an `items` array. Each item is one record with an `id`.

| I want to add… | Edit this file | ids look like |
|---|---|---|
| A core concept (charge, capacitance, SEI…) | `data/concepts.json` | `concept.…` |
| An equation, with or without a calculator | `data/formulas.json` | `formula.…` |
| A short definition and its trap | `data/glossary.json` | `glossary.…` |
| A quiz question | `data/quiz.json` | `quiz.…` |
| A characterisation technique | `data/characterization.json` | `technique.…` |
| A storage mechanism | `data/electrochemistry.json` | `mechanism.…` |
| A battery-tester concept | `data/battery-tester/concepts.json` | `concept.…` |
| A battery-tester method | `data/battery-tester/methods.json` | `method.…` |
| A step in the testing workflow | `data/battery-tester/workflow.json` | `wf.…` |
| A battery-tester symptom | `data/battery-tester/troubleshooting.json` | `troubleshooting.…` |
| A workstation concept | `data/echem/concepts.json` | `concept.…` |
| A workstation method | `data/echem/methods.json` | `method.…` |
| An equivalent-circuit element | `data/echem/circuits.json` | `circuit.…` |
| A workstation symptom | `data/echem/troubleshooting.json` | `troubleshooting.…` |
| An electrode material | `data/materials.json` | `material.…` |

**`materials.json` does not exist yet.** It is registered and the health check lists it as "not yet authored". It is deliberately unwritten: a materials database is only worth having if every value carries a citation, and nobody should create it from memory. When the group has a reference list, that file is where it goes.

### Structured documents

These are not lists of records. They hold a tree, a diagram, a grouped guide — so they declare `"_kind"` and the health check exempts them from the `items` rule rather than misreading them as broken.

| File | `_kind` | What it holds |
|---|---|---|
| `data/battery-tester/cells.json` | `cells` | Cell formats and their construction |
| `data/battery-tester/safety.json` | `safety` | The safety section — **review with your safety officer** |
| `data/echem/tafel.json` | `tafel` | Tafel validity checks and pitfalls |
| `data/preparation.json` | `preparation` | The electrode-preparation chain |
| `data/import-profiles.json` | `profiles` | Instrument column names and plot definitions |
| `data/shared/method-decision-tree.json` | `tree` | "Which method should I use?" |
| `data/shared/characterization-tree.json` | `tree` | "Which technique answers my question?" |

Annotated templates live in `data/_schema/`.

---

## Two rules that are not negotiable

Everything else in this document is mechanics. These two are why the platform exists.

### Never invent an experimental value

If you do not have a source, **leave the field out**. An absent field renders as "not yet written", which is honest. A made-up number renders exactly like a real one, and the student has no way to tell.

This applies to instrument specifications too. Fill them from our own manuals and calibration records — never from memory, and never from what a similar model does.

### Never present one observation as identifying one explanation

A single symptom does not prove a single cause. A single curve does not identify a mechanism. A single technique does not answer every question about a sample.

This is not a style preference; it is the rule the health check enforces in five different places, and it is why a troubleshooting entry with one cause, a technique with no `cannotTell`, and a mechanism with no `distinguishFrom` are all **errors**.

---

## What the Health Check enforces

Open `#/health` after every edit. It loads every registered file and validates it in the browser — no tooling, no CI, just the page. **Errors must be fixed. Warnings are usually worth fixing but will not break anything.**

### Everywhere

| Rule | Severity |
|---|---|
| Every record has an `id` | error |
| Every `id` is unique across the whole platform | error |
| `id` is namespaced as `type.snake_case_name` | warning |
| Every cross-reference resolves to a real record | error |
| The file declares a `schemaVersion` | warning |

Cross-references are checked in `relatedIds`, `equationIds`, `relatedFormulaIds`, `feedsFormulaIds`, `troubleshootingIds`, `relatedTechniqueIds`, `measuredBy` and `calculatorId`. You never write "see also" sections; every link on the site is generated from these.

### Numbers

Never write a bare number for a physical quantity. Write an object that says where it came from:

```json
"theoreticalCapacity": {
  "value": 372,
  "unit": "mAh/g",
  "provenance": "literature",
  "source": "Dahn et al., DOI 10.1016/...",
  "note": "graphite, LiC6 stoichiometry"
}
```

| `provenance` | Use it when | Also required |
|---|---|---|
| `theoretical` | Derived from a formula or stoichiometry | — |
| `literature` | A published value or range | `source` — citation or DOI (**error** if missing) |
| `datasheet` | From an instrument manual | `source` — the manual and its version (**error** if missing) |
| `measured` | We measured it ourselves | `date` (warning if missing), and who |
| `userEntered` | Typed by a student at runtime | never written into these files |
| `illustrative` | A number in a simulation or diagram | see `simulationBasis` below |

A number with a unit and no provenance is an **error**, and would render with a red **Unverified** badge.

Anything that plots or computes from a model must carry `simulationBasis` — the governing equation and its assumptions. That is an error too, and it is what stops a simulated curve being mistaken for data.

### Formulas

| Rule | Severity |
|---|---|
| `validContext` — the configuration the equation is valid for | error |
| `variables` listed | warning |
| `assumptions` listed | warning |
| `limitations` listed | warning |

`validContext` matters more than it sounds. The specific-capacitance formula for a single electrode in a three-electrode cell is not the same as the single-electrode-equivalent value from a symmetric two-electrode device — the latter conventionally carries a factor of four. A student handed the wrong variant gets a wrong answer with nothing to warn them. Write:

```json
"validContext": {
  "cellType": "three-electrode",
  "deviceConfig": "single electrode",
  "performanceLevel": "material",
  "note": "…what a reader would otherwise get wrong…"
}
```

**If you add an `expression`, the formula becomes a calculator** and four more rules apply, all errors:

- the expression must parse
- every symbol in it must be declared in `variables`
- every variable must declare `units` (what each option multiplies by to reach SI)
- `result.units` must be present

A unit factor is the most common way a calculated result comes out wrong, so they are checked rather than trusted. `mAh/g` is **3600**, not 3.6 — per gram, not per kilogram. That exact mistake shipped once and made specific capacity read 200,000 instead of 200.

### Troubleshooting

| Rule | Severity |
|---|---|
| At least **two** possible `causes` | error |
| `diagnostics` — how to tell the causes apart | warning |

A large IR drop might be high internal resistance, poor contact, electrolyte resistance, a current-collector problem, excessive current, or two-wire sensing. List the realistic candidates and say how to distinguish them.

### Methods

| Rule | Severity |
|---|---|
| `instrument.controls` and `instrument.measures` | warning |
| `limitations` | warning |

Every method record follows the five layers: instrument / cell / applied signal / response / processing / interpretation. What the instrument **controls** and what it **measures** is the distinction the whole module is built on — a potentiostat controlling potential and measuring current is a different experiment from a galvanostat doing the reverse.

### Characterisation techniques

| Rule | Severity |
|---|---|
| `cannotTell` — what the technique cannot tell you | **error** |
| more than one entry in `cannotTell` | warning |
| `answers`, `sample`, `reportWith` | warning |

Nearly every characterisation mistake in this field is a technique applied outside the question it can answer — BET area presented as electrochemically accessible area, Scherrer size as particle size, a bulk claim from a surface technique. The wrong answer still looks like a result. A technique page without its limits teaches the confidence that causes the mistake.

### Storage mechanisms

| Rule | Severity |
|---|---|
| `distinguishFrom` — how to tell it from its neighbours | **error** |
| more than one distinguishing test | warning |
| which quantity may be reported for it | warning |

### Concepts

| Rule | Severity |
|---|---|
| At least one of `learnMode` / `researchMode` | error |
| Both present | warning if either is missing |

They are two views of **one** record, not two articles — that is what stops them drifting apart as different people edit over the years. Learn: plain language, a worked example, no unexplained jargon. Research: the mathematical treatment, the assumptions, the limitations, what to watch for in practice.

### Quiz questions

| Rule | Severity |
|---|---|
| At least two `options` | error |
| Exactly **one** option marked `correct` | error |
| Every option has a `why` — right ones and wrong ones | error |
| An overall `explanation` | warning |

The wrong options are where the teaching is. And note what the existing questions do: a large fraction of the correct answers are some form of *"you cannot tell from this alone."* That is not evasion and it is not padding — it is the single most common correct answer in experimental work, and a quiz that always rewarded a confident choice would undo what the rest of the platform teaches.

---

## Worked example 1 — a glossary term

The easiest possible contribution. Open `data/glossary.json` and add to `items`:

```json
{
  "id": "glossary.coulombic_efficiency",
  "term": "Coulombic efficiency",
  "shortDef": "Discharge capacity divided by the charge capacity of the same cycle, as a percentage.",
  "trap": "A value above 100% is not a good result — it usually means a side reaction is contributing charge, or the two half-cycles were not measured under the same conditions.",
  "relatedIds": ["formula.coulombic_efficiency"]
}
```

`trap` is not optional decoration. Every term on that page carries a definition **and** the thing people get wrong about it, at equal visual weight.

---

## Worked example 2 — a formula that calculates

The hardest shape, so here is a complete real one, trimmed. Open `data/formulas.json`:

```json
{
  "id": "formula.specific_capacitance",
  "name": "Specific capacitance — three-electrode (from GCD)",
  "domain": "supercapacitor",
  "derivedFrom": "GCD",
  "plainText": "Cs = I × Δt / (m × ΔV)",
  "latex": "C_s = \\dfrac{I\\,\\Delta t}{m\\,\\Delta V}",
  "expression": "I*Δt/(m*ΔV)",
  "aliases": ["specific capacitance", "gravimetric capacitance", "Cs"],
  "variables": [
    { "symbol": "I",  "name": "Discharge current", "siUnit": "A",
      "units": [{ "u": "mA", "f": 0.001 }, { "u": "A", "f": 1 }], "default": 1 },
    { "symbol": "Δt", "name": "Discharge time", "siUnit": "s",
      "units": [{ "u": "s", "f": 1 }, { "u": "min", "f": 60 }], "default": 100 },
    { "symbol": "m",  "name": "Mass of active material", "siUnit": "kg",
      "units": [{ "u": "mg", "f": 1e-6 }, { "u": "g", "f": 0.001 }], "default": 2,
      "note": "Active material only. Whether binder and additive are included must be stated and kept consistent." },
    { "symbol": "ΔV", "name": "Voltage window used for the calculation", "siUnit": "V",
      "units": [{ "u": "V", "f": 1 }, { "u": "mV", "f": 0.001 }], "default": 1,
      "note": "State whether the IR drop is inside or outside this window. Both conventions appear in the literature and they give different answers." }
  ],
  "result": {
    "name": "Specific capacitance", "siUnit": "F/kg",
    "units": [{ "u": "F/g", "f": 1000 }, { "u": "F/kg", "f": 1 }]
  },
  "normalizationBasis": "gravimetric",
  "validContext": {
    "cellType": "three-electrode",
    "deviceConfig": "single electrode",
    "performanceLevel": "material",
    "note": "For a symmetric two-electrode device use the separate symmetric-device record. The factor of four there is not a correction to this equation."
  },
  "assumptions": ["…"],
  "limitations": ["…"],
  "relatedIds": ["concept.capacitance_vs_capacity"],
  "tags": ["supercapacitor", "gcd"]
}
```

Reading it back:

- **`expression`** is what the calculator evaluates. It is parsed by a small expression reader in `js/lib/expr.js` — **not** by `eval` — precisely because these live in a file you are invited to edit through GitHub's web editor. Supported operators are `+ - * / ^` and brackets; the functions are `sqrt`, `abs`, `ln`, `log10`, `log` (which means base 10 here, deliberately), `exp`, `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `min`, `max`, `pow`; the named constants are `F` (96485.332 C/mol), `R` (8.314462618 J/mol·K), `PI` and `e`. Unicode symbols like `Δt` are fine. The list is deliberately fixed — anything not on it is a parse error rather than a silent zero.
- **`units[].f`** is the factor that converts that unit to the variable's `siUnit`. `mg → kg` is `1e-6`. Get this wrong and the calculator is confidently wrong; the health check verifies the expression, not your arithmetic, so check the factors by hand.
- **`default`** pre-fills the calculator so the page is never a row of empty boxes.
- **`note`** on a variable appears next to that input. Use it for the thing people get wrong — which mass, which window, which convention.
- **`id`** is `type.snake_case_name`, unique platform-wide. Everything cross-links through these strings, so **renaming an id breaks every reference to it**. Choose carefully; the health check will tell you immediately if something now points at nothing.

---

## Worked example 3 — a quiz question

```json
{
  "id": "quiz.bet_accessible_area",
  "category": "characterisation",
  "question": "A carbon has a BET surface area of 1800 m²/g but only 90 F/g. What does that tell you?",
  "options": [
    { "text": "The capacitance measurement is wrong.",
      "why": "Nothing here indicates a measurement fault. Reaching for instrument error before considering the physics is the habit this question is about." },
    { "text": "Much of the BET area is not accessible to the electrolyte.",
      "correct": true,
      "why": "BET uses nitrogen at 77 K; the electrolyte ion is larger and solvated. Micropores counted by nitrogen may be unreachable in the cell. This is the most common explanation — but see the last option." },
    { "text": "The material is not capacitive.",
      "why": "90 F/g is a real capacitance. The question is why it is not larger, not whether it exists." },
    { "text": "You cannot tell from these two numbers alone.",
      "why": "Also defensible, and worth holding on to: pore accessibility is the usual explanation, but electrode thickness, binder coverage, wetting and the measurement window all affect F/g. The second option is the best single inference; this one is the honest caveat." }
  ],
  "explanation": "Two numbers, two different probes, and no reason to expect them to be proportional.",
  "teaches": ["technique.bet", "glossary.bet"],
  "goDeeper": { "route": "#/characterization/bet", "label": "What BET can and cannot tell you" }
}
```

Exactly one `correct`. Every option carries a `why`, including the wrong ones.

`teaches` lists the record ids the question is about — they are checked like any other cross-reference, so a typo is caught. `goDeeper` is the link shown after answering, pointing at the module that covers the question properly.

---

## Before you tell anyone it is ready

**1. Open `#/health`.** Every error must be zero. The page also lists which files loaded and which are not yet authored.

**2. Look at the Offline readiness panel on the same page.** It asks the service worker what is actually in the cache on that device. If you have added a file it should appear in the Content count; if it does not, the file is probably not registered in `js/data.js`.

**3. Read your entry on the site itself,** in both Learn and Research mode, and in both themes. A record can be structurally valid and still read badly.

If the health page will not load at all, the cause is almost always a JSON syntax error — a missing comma, or a trailing comma after the last item. The browser console (F12) names the file.

---

## A note on JSON

- Every string needs **double** quotes, never single.
- Commas go **between** items, never after the last one.
- No comments are allowed. To leave a note for a human, use a field starting with `_` — the app ignores those, and there are several already (`_note`, `_README`) doing exactly that.
- Special characters need escaping: `\"` for a quote, `\\` for a backslash. LaTeX needs doubled backslashes: `\\dfrac`.
- Unicode is fine and encouraged — `Δ`, `µ`, `Ω`, `²`, `·` all work in ids' values, symbols and prose. (Not in `id` itself: keep those ASCII.)

If in doubt, copy an existing entry and edit it rather than writing one from scratch.

---

## Everything on this site is draft

Every page carries a draft banner, and it stays until the group has reviewed the content. If you are reviewing rather than writing: the health check verifies structure, not truth. Nothing in it can tell you a definition is wrong, only that it is shaped correctly. That part is yours.

The **safety section** (`data/battery-tester/safety.json`) should be reviewed with your safety officer before anyone treats it as guidance.
