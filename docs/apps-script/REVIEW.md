# Reviewing the draft content

Sixty thousand words across 285 entries, none of it checked by anyone in the group. The platform says so on every page, and it will keep saying so until somebody says otherwise.

This is how that happens. There are two halves, and they use the same entry ids so you can mix them freely.

---

## 1. Read it — the Word pack

```bash
node tools/export-review.mjs
```

Writes `review-export/` — a cover sheet plus one document per module, in the order worth doing them. Every entry has its full text, its id, and a box with three tick options and room to write.

Circulate them. People read long arguments better away from a screen, and the person best placed to check the safety section may never open the app.

**`00 — Start here.docx`** is the cover sheet: what the pack is, what to look for, and the module table with priorities.

Re-run the command any time — it always reflects what is currently in `data/`.

---

## 2. Record the verdict — `#/review`

Menu → **Content Review**. Same 285 entries, grouped by module, with a running count of what is still unchecked. Three buttons per entry:

| Verdict | What it means |
|---|---|
| **Correct as written** | You know this area and this is right. |
| **Needs a change** | Say what it should say and where that comes from. A correction with no source cannot be acted on. |
| **I cannot judge this** | **Not a cop-out.** It tells the group this entry needs a different reviewer, which is information nobody has otherwise. |

The page works with no setup — verdicts are kept in that browser and exported as a file with the button at the bottom. That is enough for one person working through a module alone.

---

## 3. Optional: several people at once

Deploy the script and everyone sees the same progress, and each other's disagreements.

**1. Make a new Google Sheet.** Call it *EDMGLAB review*. Do not reuse the corrections or access sheets.

**2. Extensions → Apps Script.** Replace `Code.gs` with **`Review.gs`** from this folder. Save.

**3. Project Settings → Script Properties:**

| Property | Value |
|---|---|
| `REVIEW_KEY` | 16 or more random characters |

> **This key is meant to be shared with the whole group.** Every reviewer needs it, so it will end up in a group chat — choose it on that assumption, and **never set it to the same string as `ADMIN_KEY`**. `selfTest` errors if you do. They protect very different things: the worst a leaked review key allows is junk verdicts, which are appended rather than overwritten and can be voted over. The admin key can lock the group out.

**4. Run `selfTest`** from the editor. Grant permissions. Check the log.

**5. Deploy → New deployment → Web app**, *Execute as* **Me**, *Who has access* **Anyone**. Copy the `/exec` URL.

**6. Put it in `data/review.json`** and commit:

```json
{
  "endpoint": "https://script.google.com/macros/s/AKfycb.../exec",
  "note": "Please finish the safety section before the group meeting on the 12th."
}
```

`note` appears at the top of the review page — use it to say what this round is for and when you need it back.

---

## Nothing is ever overwritten

Every verdict **appends a row**. The current state is the latest row per entry per reviewer, worked out when the page loads. So:

- A mistake is corrected by voting again.
- Two reviewers who disagree both stay on the record, and the page shows a **reviewers disagree** flag rather than letting whoever clicked last win.
- The whole history is readable in the Sheet by a human.

A disagreement about content is the most useful thing this exercise can surface. It is the last thing the tool should hide.

---

## Working through what comes back

In the Apps Script editor, run **`reportOutstanding`**. It prints three lists:

- **Needs a change** — with the note, ready to act on.
- **Reviewers disagree** — resolve these in a meeting, not in the app.
- **Needs a different reviewer** — find that person.

Make the actual changes in the JSON under `data/` and commit them. **The review page is not an editor, deliberately** — a scientific claim should go through the same reviewable commit history as everything else in this repository, and that is the one piece of friction worth keeping.

---

## Signing something off

When the group is satisfied with an entry, add its id to `finalised` in `data/review.json` and commit:

```json
{
  "finalised": ["material.lifepo4", "formula.specific_capacity"],
  "finalisedBy": { "by": "EDMG group meeting", "on": "2026-09-15" }
}
```

That entry's page then stops saying *draft* and says **checked** instead, with who and when. Everything else stays draft.

**Why this one step is a commit and not a click.** A verdict is one person's opinion and there will be hundreds of them, so those go to the endpoint with no ceremony. *"The group has checked this"* is a different kind of statement — the platform makes it to every future student who reads that page — and it belongs in the same reviewable history as the content it is about.

---

## What to look for

The platform makes a great many claims of the form *"this measurement does not tell you X"*. Those are the load-bearing sentences: they are what separates it from a textbook summary, and they are the ones most likely to be subtly wrong. If you read nothing else closely, read those.

Also worth scepticism:

- Any rule stated without its exception.
- Any number without a provenance beside it.
- Anywhere the writing sounds more confident than the evidence behind it.

The automated checks in `tools/` confirm every cross-reference resolves, every value carries a provenance, every formula states where it is valid, and every troubleshooting entry offers more than one cause. **None of them can tell you a definition is wrong.** That is the entire reason this document exists.

---

## Troubleshooting

**"Not authorised."** The review key does not match. Check for a trailing space when it was pasted into Script Properties.

**"The script did not return JSON."** The deployment's access is not *Anyone*.

**Verdicts save but do not share.** The review key field is empty. The page says *recorded here, but not shared* when that happens — nothing is lost, and re-entering the key and clicking the verdict again sends it.

**Someone's verdicts are missing.** They reviewed before the endpoint was configured. Their **Export** button produces a file with all of them, ids included.
