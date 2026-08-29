# Putting EDMGLAB on a phone

Roadmap Phase 15. **Read the first section before doing any of the rest** — most groups need only that, and the rest is a week of work for something they will not use.

---

## Start here: you probably do not need an Android build

EDMGLAB already installs on a phone. Open it in Chrome on Android, use **⋮ → Add to home screen** (or the install prompt Chrome offers on its own), and you get:

- an icon on the home screen, with the app's own name and mark
- a full-screen window with no browser chrome — the same as any app
- **full offline operation**, including the plot library and every content file
- automatic updates the next time the phone is online, with no store review

The install criteria are all met and checked by `tools/pwa-audit.mjs`: 14 of 14, plus the six things that decide whether Android shows the rich install dialog with screenshots rather than the one-line bar people dismiss without reading.

On iPhone the equivalent is **Share → Add to Home Screen** in Safari. Offline works; the install dialog is plainer.

**What a Play Store build adds is distribution, not capability.** If nobody needs to find EDMGLAB by searching the Play Store, and you can send a link to the people who should have it, stop here — you have the app already.

---

## What a Play Store build would actually take

A **Trusted Web Activity** (TWA) is a thin Android wrapper that opens this site full-screen with no URL bar. It is the standard way to put a PWA on the Play Store. The code is trivial; the obstacles are all administrative, and one of them is specific to how this site is hosted.

### Obstacle 1 — Digital Asset Links must be served from the DOMAIN ROOT

Android verifies that the app and the website belong to the same owner by fetching:

```
https://<domain>/.well-known/assetlinks.json
```

Note **`<domain>`**, not `<domain>/<path>`. If EDMGLAB is served from a GitHub Pages *project* site:

```
https://edmggroup.github.io/edmglab/     ← the site
https://edmggroup.github.io/.well-known/assetlinks.json   ← where Android looks
```

…then that file has to live in the **`edmggroup.github.io` repository**, not in this one. This repository cannot serve anything at the domain root. Putting `assetlinks.json` in this repo would place it at `/edmglab/.well-known/assetlinks.json`, where nothing will ever look for it — which is why this folder ships it as a template rather than in place.

Three ways out, in the order most groups should consider them:

| Option | What it takes | Result |
|---|---|---|
| **Custom domain** for this repo (e.g. `edmglab.yourlab.ac.uk`) | A CNAME record and a `CNAME` file in this repo | The repo serves its own root, so `.well-known/assetlinks.json` goes here and everything works. **Cleanest.** |
| **Put the file in the org site repo** | Commit `assetlinks.json` to `edmggroup.github.io` | Works. Needs whoever controls that repository. |
| **Skip verification** | Nothing | The app still runs, but Android shows the URL bar at the top. It looks like a browser tab with extra steps, not an app. |

### Obstacle 2 — a signing key you keep for the life of the app

Play requires every update to be signed with the same key. Lose it and you cannot update the app; you publish a new listing and every installed copy is orphaned. That key cannot come from here — generate it yourself, back it up somewhere the group will still have in five years, and never commit it.

The key's SHA-256 fingerprint is what goes in `assetlinks.json`. Get it with:

```bash
keytool -list -v -keystore edmglab.keystore -alias edmglab | grep SHA256
```

### Obstacle 3 — a Play Console account

A one-off fee, an organisation identity, a privacy policy URL, a content rating questionnaire, and a review for each release. For internal distribution you can skip the store entirely and hand people the `.apk` directly, or use Play's internal testing track.

---

## If you decide to build it

**1. Install Bubblewrap** (Google's TWA generator — it writes the Android project so you do not have to):

```bash
npm install -g @bubblewrap/cli
```

It will offer to download a JDK and the Android SDK on first run. Say yes; they go in your home directory, not in this repository.

**2. Initialise from the live manifest:**

```bash
bubblewrap init --manifest https://edmggroup.github.io/edmglab/manifest.json
```

`twa-manifest.json` in this folder is what those answers should come out as — compare against it, and copy anything Bubblewrap did not infer. It reads the name, colours, icons and shortcuts straight from the manifest this repository already publishes, so there is nothing to keep in step by hand.

**3. Build and sign:**

```bash
bubblewrap build
```

This produces `app-release-signed.apk` (sideload) and `app-release-bundle.aab` (Play upload).

**4. Publish the asset links.** Bubblewrap prints the exact JSON, or fill in `assetlinks.json` from this folder with your fingerprint and package name. Put it where Obstacle 1 says it must go, then check it:

```bash
curl https://<your domain>/.well-known/assetlinks.json
```

**5. Verify the URL bar is gone.** Install the APK and open it. If you can see the address bar, verification failed — the file is in the wrong place, the fingerprint does not match, or it has not propagated yet. Nothing else about the app is wrong.

---

## What does NOT need doing again

A TWA is a window onto this site. It has no copy of the content, no separate build of the JavaScript, and no second codebase.

- **Updating content** is still editing JSON and committing. The app picks it up.
- **Updating the app itself** — the shell, the views — is still bumping `CACHE_VERSION` and committing.
- **A new APK is only needed** when the app's *name*, *icon*, *colours* or *package identity* change. Not for content, and not for code.

That is the point of the approach, and it is why the wrapper is worth so little effort: everything that matters already ships through GitHub Pages.

---

## A note on the offline promise

The app's usefulness in a basement lab comes from the service worker, not from being an APK. That already works in the browser and in the installed PWA — verified from a cold install that visits only the home page, then walks all 131 routes with the network cut. Wrapping it in an APK does not improve it, and a TWA that failed verification would not degrade it either.
