# Adding content to EDMGLAB

This guide is for members of the research group who want to add or correct scientific content. **You do not need to install anything, and you do not need to write code.** Everything below happens in a web browser.

---

## The short version

1. Open the relevant file under `/data/` on GitHub.
2. Click the pencil (Edit) icon.
3. Add your entry, following the pattern of the entries already there.
4. Commit — either straight to `main`, or as a pull request if you would like it reviewed first.
5. Wait about a minute, then open the site and check the **Data Health Check** page.

That is the whole workflow. The site rebuilds itself.

---

## Where things live

| I want to add… | Edit this file |
|---|---|
| A concept (charge, capacitance, SEI, intercalation…) | `data/concepts.json` |
| An equation | `data/formulas.json` |
| A calculator | `data/calculators.json` |
| A material | `data/materials.json` |
| A battery-tester method | `data/battery-tester/methods.json` |
| A test protocol / schedule | `data/battery-tester/protocols.json` |
| One of our actual instruments | `data/instruments.json` |
| A workstation method | `data/echem/methods.json` |
| A troubleshooting entry | `data/battery-tester/troubleshooting.json` or `data/echem/troubleshooting.json` |
| A short definition | `data/glossary.json` |

Annotated templates for each shape live in `data/_schema/`.

---

## The rules that will trip you up

These exist because EDMGLAB is used for research training, and a plausible-looking wrong number is worse than no number at all. The Health Check page enforces all of them, so you will find out quickly.

### 1. Every number needs a provenance

Never write a bare number. Write an object saying where it came from:

```json
"theoreticalCapacity": {
  "value": 372,
  "unit": "mAh/g",
  "provenance": "theoretical",
  "note": "graphite, LiC6 stoichiometry"
}
```

`provenance` must be one of:

| Value | Use it when | Also required |
|---|---|---|
| `theoretical` | Derived from a formula or stoichiometry | — |
| `literature` | A published value or range | `source` — a citation or DOI |
| `datasheet` | From an instrument manual | `source` — the manual and its version |
| `measured` | We measured or calibrated it ourselves | `date`, and who |
| `userEntered` | Typed by a student at runtime | (never written into these files) |

A number without a provenance renders on the site with a red **Unverified** badge. That is deliberate.

### 2. Never invent an experimental value

If you do not have a source, leave the field out. An absent field renders as "not yet written", which is honest. A made-up number renders as though it were real, which is not.

This applies to instrument specifications too. Fill `instruments.json` from our own manuals and calibration records — never from memory, and never from what a similar model does.

### 3. Every formula states where it is valid

A formula record must include `validContext`: the cell configuration (two- or three-electrode), the device configuration, and whether the result is a material-level or device-level quantity.

This matters more than it might sound. The specific-capacitance formula for a single electrode in a three-electrode cell is not the same as the single-electrode-equivalent value from a symmetric two-electrode device — the latter conventionally carries a factor of four. A student given the wrong variant gets a wrong answer with nothing to warn them.

Also list the `assumptions`. If you would qualify the equation when explaining it to a student out loud, write that qualification down.

### 4. Troubleshooting entries need more than one cause

A troubleshooting entry with a single cause will be rejected by the Health Check.

One symptom almost never proves one cause. A large IR drop might be high internal resistance, poor contact, electrolyte resistance, a current-collector problem, excessive current, or two-wire sensing. List the realistic candidates and, in `diagnostics`, say how to tell them apart.

### 5. Learn Mode and Research Mode are one record

Fill in both `learnMode` and `researchMode` on the same entry. They are two views of one thing, not two separate articles — that is what stops them drifting apart as different people edit over the years.

Learn Mode: plain language, a worked example, no unexplained jargon.
Research Mode: the mathematical treatment, the assumptions, the limitations, what to watch out for in practice.

---

## Adding a formula, step by step

Open `data/formulas.json`. Add an entry to `items`:

```json
{
  "id": "formula.energy_density",
  "name": "Gravimetric energy density",
  "plainText": "E = ...",
  "latex": "E = ...",
  "aliases": ["energy density", "specific energy"],
  "variables": [
    { "symbol": "…", "name": "…", "siUnit": "…", "commonUnit": "…" }
  ],
  "siUnit": "J/kg",
  "commonUnit": "Wh/kg",
  "normalizationBasis": "gravimetric",
  "validContext": {
    "cellType": "…",
    "deviceConfig": "…",
    "performanceLevel": "material | device",
    "note": "…"
  },
  "assumptions": ["…"],
  "limitations": ["…"],
  "relatedIds": [],
  "tags": []
}
```

**About `id`:** always `type.snake_case_name`, and it must be unique across the entire platform. This is how everything cross-links — `relatedIds`, `equationIds`, `calculatorId` all refer to these strings. Once an id is in use, renaming it breaks every reference to it, so choose carefully.

**About `relatedIds`:** list the ids of anything connected — the concept it belongs to, the technique that measures it, the troubleshooting entry for when it comes out wrong. These are what build the pathway links across the site. You do not write "see also" sections anywhere; they are generated from these.

---

## Before you tell anyone it is ready

Open the **Data Health Check** page (in the sidebar under Support, or go to `#/health`).

It reports:

- Records with missing or duplicate ids
- Cross-references pointing at records that do not exist
- Numbers with no provenance, or literature values with no source
- Formulas with no `validContext`
- Troubleshooting entries with only one cause
- Methods that do not say what is controlled and what is measured

**Errors must be fixed.** Warnings are usually worth fixing but will not break anything.

If the page will not load at all, the most likely cause is a JSON syntax error — a missing comma, or a trailing comma after the last item in a list. The browser console (F12) names the file.

---

## A note on JSON

JSON is fussy in a few specific ways:

- Every string needs **double** quotes, never single.
- Commas go **between** items, never after the last one.
- No comments are allowed. If you need to leave a note for a human, use a `"_note"` field — anything starting with `_` is ignored by the app.
- Special characters in text need escaping: `\"` for a quote, `\\` for a backslash.

If in doubt, copy an existing entry and edit it rather than writing one from scratch.
