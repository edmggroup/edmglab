# Data schema templates

Annotated examples of every record shape used in EDMGLAB. **Copy one and edit it** rather than writing an entry from scratch — that is the quickest way to get every required field right.

Every field beginning with an underscore is a note to you and is ignored by the application. Delete them from your copy.

| File | Goes in | The rule that catches people |
|---|---|---|
| `concept.example.json` | `concepts.json` and the module concept files | One record holds BOTH the Learn and the Research version |
| `formula.example.json` | `formulas.json` | `validContext` is required; an `expression` brings four more rules with it |
| `glossary.example.json` | `glossary.json` | `trap` is not optional — every term carries its definition and the misreading |
| `quiz.example.json` | `quiz.json` | Exactly one correct option, and a `why` on every option including the wrong ones |
| `technique.example.json` | `characterization.json` | `cannotTell` is required |
| `mechanism.example.json` | `electrochemistry.json` | `distinguishFrom` is required |
| `troubleshooting.example.json` | the two `troubleshooting.json` files | At least TWO causes |
| `method.example.json` | the two `methods.json` files | Declare what is *controlled* and what is *measured* |
| `circuit.example.json` | `echem/circuits.json` | No equivalent circuit is uniquely determined by a spectrum |
| `material.example.json` | `materials.json` | Every value needs a citation — which is why that file is still empty |
| `instrument.example.json` | `instruments.json` | Specifications from your manual, quirks from your bench |

**Start with the glossary** if this is your first entry: two fields, no cross-references, and the whole edit-commit-health-check loop on something that cannot break anything.

These files are documentation. Nothing here is loaded by the application.

> **`.nojekyll` matters.** GitHub Pages runs Jekyll by default, and Jekyll silently ignores any folder whose name starts with an underscore — including this one. The empty `.nojekyll` file at the repository root disables that behaviour. Do not delete it.

---

## Fields required in every record

| Field | Notes |
|---|---|
| `id` | `type.snake_case_name`, unique across the **whole platform**. This is what every cross-reference points at, so renaming one breaks every link to it. |
| `relatedIds` | Ids of anything connected. These build the pathway links — you never write "see also" sections by hand. |

## Value objects — never a bare number

```json
{ "value": 372, "unit": "mAh/g", "provenance": "theoretical", "note": "graphite, LiC6" }
```

| `provenance` | Use when | Also required |
|---|---|---|
| `theoretical` | Derived from a formula or stoichiometry | — |
| `literature` | A published value or range | `source` |
| `datasheet` | From an instrument manual | `source`, including manual version |
| `measured` | We measured or calibrated it | `date` |
| `userEntered` | Typed by a student at runtime | never written into these files |

A number without a `provenance` renders with a red **Unverified** badge, and the health check reports it as an error.

---

## Templates in this folder

| File | Shape |
|---|---|
| `concept.example.json` | A fundamentals or mechanism concept, with the Learn/Research pair |
| `formula.example.json` | An equation, with variables, valid context and assumptions |
| `method.example.json` | An instrument method, in the five-layer §34 structure |
| `troubleshooting.example.json` | A symptom with multiple causes and diagnostics |
| `diagram.example.json` | An interactive block diagram |
| `instrument.example.json` | One of our physical instruments |

---

## Things the health check will reject

- A record with no `id`, or an `id` already used elsewhere
- A cross-reference pointing at a record that does not exist
- A number with a unit but no `provenance`
- A `literature` or `datasheet` value with no `source`
- A formula with no `validContext`
- **A troubleshooting entry with only one possible cause** — one symptom must never be presented as proving one cause
- A method that does not say what is controlled and what is measured
- Simulated content that does not declare the model it is based on

Run the **Data Health Check** page (`#/health`) after any content change.
