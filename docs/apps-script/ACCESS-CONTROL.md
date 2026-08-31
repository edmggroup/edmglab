# Optional: giving people access without a git commit

**You do not need this.** The PIN gate works with no setup: an admin uses `#/admin`, generates the configuration, pastes it into `data/access.json` and commits. That flow is not going away and it is still the right one if nobody here wants to run a Google script.

This is for the case where it is an obstacle — where giving a new student a PIN should not require a supervisor to make a git commit.

With this deployed, an admin adds or suspends someone from `#/admin` and it is live for everyone on their next visit.

---

## Read this first — it is different from `Code.gs`

The correction inbox (`Code.gs`) is deliberately unauthenticated. The worst case there is a junk row in a Sheet.

**This is not in that category.** An unauthenticated write here would let anyone on the internet grant themselves access or lock the whole group out — strictly worse than the commit flow it replaces, which at least requires push rights on the repository.

So writes require an **admin key**:

> The key lives in **Script Properties**, on Google's servers. It is never in this repository, never in `data/access.json`, and never in any JavaScript a browser downloads. A static site cannot keep a secret; this script can, because it is a server. This is the one place in EDMGLAB where something can actually refuse a request.

**Reads stay public**, deliberately. The configuration a browser needs contains only names, salts and PBKDF2 hashes — exactly what already sits in `data/access.json` in a public repository. Serving it from here changes nothing.

### What this still does not do

It does not protect the site. EDMGLAB is static: anyone with the URL can open `data/formulas.json` without ever meeting the PIN. This makes **administration** safe and immediate. It does not make the content private, and a four-digit PIN whose hash is public is recoverable by anyone who cares to try all ten thousand.

**The two-tier rule is unchanged.** Everything in this repository must still be safe to be public.

---

## Setting it up

**1. Make a new Google Sheet.** Call it something like *EDMGLAB access log*. Do not reuse the corrections sheet, and do not use a spreadsheet that contains anything else.

**2. Extensions → Apps Script.**

**3. Replace everything in `Code.gs`** — the file the editor opens — with the contents of **`AccessControl.gs`** from this folder. Save.

> Deploying both scripts? Use **two separate Apps Script projects**, each bound to its own Sheet. They have deliberately different security models and should not share a deployment.

**4. Set the admin key.** Project Settings (the gear) → Script Properties → **Add script property**:

| Property | Value |
|---|---|
| `ADMIN_KEY` | 24 or more random characters |

Generate it with a password manager. Do not use a word, a date, or the lab wifi password. **Do not put it in the repository, in a chat message, or in a shared document** — store it wherever the group keeps its passwords, and give it only to the people who should be able to change the access list.

**5. Run `selfTest` once.** Pick `selfTest` from the function dropdown and press Run. Grant the permissions it asks for. Check the log says the key is set and that it is bound to a Sheet.

**6. Deploy → New deployment → Web app.**

| Setting | Value |
|---|---|
| Execute as | **Me** |
| Who has access | **Anyone** |

"Anyone" is required — a browser cannot complete a Google sign-in from a cross-origin `fetch`. It is safe here *because the admin key is checked inside the script*, which is exactly the protection `Code.gs` cannot have.

**7. Copy the `/exec` URL** and put it in `data/access.json`:

```json
{
  "endpoint": "https://script.google.com/macros/s/AKfycb.../exec"
}
```

Commit that one line. It is the last commit you need to make for access changes.

**8. Open `#/admin`.** A **Manage people** section now appears above the old one. Type the admin key, add a person with a four-digit PIN, and it is live.

---

## Moving your existing list across

If you already have people in `data/access.json`, they are not automatically at the endpoint — the endpoint starts empty. Either add them again through **Manage people**, or, if the list is long, send the whole configuration in one write using the `replaceAll` action.

The old configuration stays in `data/access.json` and becomes the **fallback**, used only when the endpoint cannot be reached and the browser has nothing cached. Leaving it in place is sensible.

---

## What happens when things go wrong

| Situation | What the site does |
|---|---|
| Endpoint reachable | Uses the live list. |
| Endpoint down, device has seen it before | Uses the **last list it saw**, so the gate stays on. |
| Endpoint down, device has never seen it | Falls back to `data/access.json`. |
| No `endpoint` set at all | `data/access.json` is the list, as before. |
| Nothing works | Gate is **off**. Deliberate: failing closed would lock the group out of a site whose content is public anyway. |

**One consequence worth knowing.** A device that is offline keeps the last list it saw, so someone you suspend keeps access on that device until it reconnects. That is a soft gate behaving like a soft gate. If you need somebody out immediately, a PIN is not the mechanism — removing their access to the underlying data is.

---

## The audit tab

Every write and **every refused write** appends a row to the *Access log* tab: when, what action, whether it succeeded, who it was about, who did it, and a detail line.

A run of `REFUSED` rows means somebody is guessing the admin key. Change it in Script Properties and tell the group the new one; nothing else needs redeploying.

---

## What is never sent

The PIN is turned into a PBKDF2-SHA256 hash **in the admin's browser**, and only `{ salt, hash, iterations }` is sent. A PIN never reaches Google, never appears in an execution log, and never appears in the audit tab. The script could not reveal a PIN if it were compelled to, because it was never told one.

That also means **nothing can show you a PIN again**. Tell the person their PIN when you set it; if it is lost, set a new one.

---

## Turning it off

Blank the `endpoint` in `data/access.json` and commit. The site goes straight back to using the committed list, and the deployment can be deleted at your convenience.

---

## Troubleshooting

**"The script did not return JSON."** The deployment's access is not set to *Anyone*. Re-deploy with that setting.

**"Not authorised."** The admin key does not match. It is case-sensitive; check for a trailing space when it was pasted into Script Properties.

**"The script did not answer within 20 seconds."** Apps Script is slow on its first call after a period of inactivity. Try once more.

**The section does not appear on `#/admin`.** `endpoint` is empty in `data/access.json`, or the committed change has not deployed yet. GitHub Pages usually takes about a minute.

**A change does not show up for someone.** They have a cached list. It refreshes on their next load with a working connection; a hard reload forces it.

---

## Checking it still works

`node tools/access-live-test.mjs` stands up a mock endpoint implementing this same contract and drives the real admin page against it — 27 assertions, including that no PIN ever crosses the network and that the admin key is never written to browser storage. It does not touch your deployment.
