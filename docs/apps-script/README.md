# Optional: corrections into a Google Sheet

**You do not need this.** EDMGLAB's correction form already works with no setup at all: on GitHub Pages it derives the repository from the URL and opens a pre-filled GitHub issue. This is for the case where that is not good enough — group members without a GitHub account, or who will not make one.

It is Architecture §J and the Phase 14 exit criterion: *a submitted correction reaches a Sheet you review.*

---

## Read this first

The Web App URL has to be public for a browser to reach it, and it will sit in `data/feedback.json` in a repository anyone can read. Therefore:

> **Anyone who finds the URL can write a row.** There is no authentication and there cannot be one from a static page — a key in the JavaScript is readable by anyone who can read the JavaScript. This is the same honesty the PIN gate carries: it is not security, and calling it security would be worse than not having it.
>
> **The Sheet is a public inbox.** Point it at a spreadsheet that contains nothing else. Never put unpublished results, personal data or anything under an NDA in the same file.

That trade is fine for a correction inbox — the worst case is junk rows, which take a moment to delete. It would not be fine for anything else, so do not reuse this pattern for anything else.

---

## Setting it up

**1. Make a new Google Sheet.** Call it something like *EDMGLAB corrections*. Do not reuse an existing sheet.

**2. Extensions → Apps Script.** This opens an editor bound to that sheet.

**3. Replace everything in `Code.gs`** with the contents of `Code.gs` from this folder. Save.

**4. Optional — set `NOTIFY`** near the top to an email address if you want to be told when a correction arrives. Leave it as `''` for none.

**5. Run `selfTest` once** from the editor's function dropdown. Google will ask for authorisation the first time; approve it. Check that a row appeared in the sheet — if it did, the script works, and anything that goes wrong later is deployment rather than code.

**6. Deploy → New deployment → Web app**, with:

| Setting | Value | Why |
|---|---|---|
| Execute as | **Me** | The script needs your permission to write to your sheet. Running as the user would demand a Google sign-in the browser cannot complete from a cross-origin `fetch`. |
| Who has access | **Anyone** | Not "anyone with a Google account" — that also fails from a `fetch`. See the warning above about what this means. |

**7. Copy the `/exec` URL.** Open it in a browser: you should see a small JSON object saying the deployment is live and how many rows exist. If you see a Google sign-in page or an error, the access setting is wrong.

**8. Put it in `data/feedback.json`:**

```json
"endpoint": "https://script.google.com/macros/s/AKfycb…/exec"
```

Commit. The correction form switches to it automatically — `mode` is `"auto"`, which prefers the endpoint when one is set.

**9. Check it from the site.** Open EDMGLAB, use *Suggest a correction* under any page, and submit. The status line under the button should say it was sent to the correction sheet. A row should appear.

---

## Re-deploying after an edit

Apps Script keeps serving the **deployed** version, not the saved one. After editing `Code.gs` you must go to **Deploy → Manage deployments → (pencil) → Version: New version → Deploy**. The `/exec` URL stays the same.

This catches everyone at least once: you fix something, save, test, and see the old behaviour.

---

## What the Sheet looks like

The script creates a `Corrections` tab with a frozen header row:

| Column | What it holds |
|---|---|
| Received | When the script wrote the row |
| Reported at | When the reader pressed the button (may differ if they were offline) |
| Category | Which kind of problem they chose |
| Page | The route it is about |
| Record id | The record, when the page named one |
| What is wrong | Their description |
| What it should say | Their suggested replacement, if any |
| Source | Their citation, if any |
| Reported by | Their name, if they gave one |
| **Status** | Yours to maintain — `new`, `accepted`, `rejected`, `done` |
| **Notes** | Yours |

The last two columns are for the reviewer. Nothing overwrites them; new corrections are only ever appended.

## Turning a row into a change

A correction is not a change. Someone still has to decide whether it is right, and edit the JSON. The path is:

1. Read the row. Is the correction itself correct?
2. If it needs a source and does not have one, that is the thing to chase — most stalled corrections stall here.
3. Edit the file under `/data/` per **CONTRIBUTING.md** and commit.
4. Run the **Data Health Check** (`#/health`) before saying it is done.
5. Set the row's Status to `done`.

## Turning it off

Empty the `endpoint` field in `data/feedback.json` and commit. The form reverts to GitHub issues. Archive the deployment from **Manage deployments** if you want the URL to stop responding as well.

---

## Troubleshooting

**"the script did not return JSON"** — almost always the access setting. Open the `/exec` URL directly: if you see a Google sign-in page, redeploy with access **Anyone**.

**Nothing arrives, no error** — you edited the script but did not deploy a new version. See *Re-deploying* above.

**It works from `curl` but not from the site** — something changed the request's content type. The client deliberately sends `text/plain`, which is a "simple request" needing no CORS preflight; `application/json` triggers a preflight that Apps Script does not answer, and the browser blocks it while `curl`, which does not enforce CORS, carries on working.

**Junk rows** — expected eventually, since the URL is public. The script rejects submissions with no page and no record, and caps field lengths, but that is a speed bump rather than a wall. Delete them. If it becomes a nuisance, archive the deployment, create a new one, and update `feedback.json`: a new URL is a new address the junk does not know.
