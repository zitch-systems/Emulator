# Handoff: EMulator Studio — Universal Android / iOS / PWA Test Lab

## Overview
EMulator Studio lets a developer connect a Git repo and **test any build — `.apk`, iOS app, or PWA — in real device frames**, capture console/errors, take screenshots, export a Markdown report, and push that report (or screenshots) back to the repo.

This package is the spec + working reference for building it as a **real product**, not a throwaway mock. There is already a fully working browser implementation of the *web/PWA/hybrid* path and the *package inspector* (in `reference_prototype/`). Your job in Claude Code is to:

1. **Reuse** the prototype's logic and exact UI for everything web-based.
2. **Add real native execution** (the one thing a browser can't do) via real tooling — local Android/iOS emulators and/or a cloud device farm.
3. **Add a backend + GitHub integration** so it connects to a repo, pulls/builds artifacts, and pushes reports back.

> ⚠️ **The hard constraint that shaped this design:** a web page **cannot execute a native `.apk`/`.ipa` binary**. The prototype is honest about that — it *inspects* native packages and *runs* hybrid/web ones. The Claude Code implementation is where native execution becomes real, because you'll have a backend that can shell out to `adb`/`emulator`/`xcrun simctl` or call a cloud device API. **Read `ARCHITECTURE.md` for the three strategies and pick per the user's environment.**

## About the design files
The files in `reference_prototype/` are a **working browser app** (`EMulator Studio.html` + `emu/*.js`). They are simultaneously:
- the **design reference** (final UI, colors, type, layout, interactions — recreate this exactly), and
- **reusable production logic** for the web side — the ZIP reader, AXML/bplist decoders, framework detection, the blob-rewriting hybrid runner, the console bridge, the Markdown report builder, and the GitHub push are all real and portable. Lift them; don't reinvent them.

Recreate the UI in the target stack (recommended: **Next.js + TypeScript + a Node service layer**, see ARCHITECTURE). If the user already has a stack, follow theirs.

## Fidelity
**High-fidelity.** The prototype is the intended look down to hex values and spacing. `DESIGN_SPEC.md` lists exact tokens, screens, and components. Match it.

## What's in this package
```
design_handoff_emulator_studio/
├── README.md              ← you are here: mandate, build plan, milestones, acceptance
├── ARCHITECTURE.md        ← system design + the 3 native-execution strategies (pick one+)
├── TOOLING_REFERENCE.md   ← exact commands & APIs: adb, emulator, simctl, aapt2, Appetize, GitHub
├── DESIGN_SPEC.md         ← UI screens, components, design tokens, interactions (hi-fi)
└── reference_prototype/   ← the working browser app — UI reference + reusable web-side logic
    ├── EMulator Studio.html
    └── emu/*.js
```

## Core requirements (from the product owner)
1. **Universal** — works for *any* repo and *any* `.apk` / iOS build / PWA.
2. **Actually runs the build** — not just a preview; the app boots and is interactive.
3. **Connects to a Git repo** — pull/locate the build artifact; push results back.
4. **Error logging in Markdown**, exportable **and** pushable to the repo.
5. **Screenshots** of the running app.
6. **End-to-end & tested** — see acceptance criteria below.

## Recommended build plan (phased)

**Phase 0 — Port the web app (1–2 days).**
Recreate the prototype UI in Next.js/TS. Port `emu/*.js` to typed modules. The web/PWA/hybrid runner, inspector, report builder, screenshots, and GitHub push should all work exactly as the prototype does. *Acceptance:* load a URL and an uploaded build, see console/network, capture a screenshot, download a report, push to a repo — all green, matching the prototype.

**Phase 1 — Backend + repo connection (2–3 days).**
Add a Node service (Next API routes / a small Fastify service). Implement GitHub OAuth (or PAT). Given `owner/repo`, locate a build: GitHub Releases asset, Actions artifact, or build-from-source. Stream artifacts to the runner. *Acceptance:* "Connect repo → pick a release/artifact → it loads into the studio."

**Phase 2 — Native execution (the differentiator) (3–6 days).**
Implement **at least one** strategy from ARCHITECTURE:
- **Local Android** via Android SDK `emulator`+`adb` (install, launch, stream screen, `logcat`→MD, `screencap`).
- **Local iOS** (macOS) via `xcrun simctl` (install, launch, screenshot, `log stream`→MD).
- **Cloud** via Appetize.io (upload APK/IPA → embeddable streamed real device → session logs/screenshots via API). Best for "universal, no Mac needed."
*Acceptance:* a real `.apk` boots, is interactive in the UI, a screenshot is captured from the device, and `logcat`/crash output lands in the Markdown report.

**Phase 3 — Reports → repo, polish (1–2 days).**
Real device logs + crashes parsed to the existing Markdown format; push to repo as a commit or **open a PR**; optional GitHub Action that runs this on every push and commits a report. *Acceptance:* a failing build produces an error report committed to `emulator-reports/<timestamp>/` (or a PR).

## End-to-end acceptance test (the "is it done" checklist)
- [ ] Connect a GitHub repo with a sample app (provide one Capacitor app + one native Flutter/Java app).
- [ ] **Hybrid/web build:** runs live, interactive, console+network captured, screenshot taken.
- [ ] **Native `.apk`:** boots in a real Android emulator (or Appetize), interactive, screenshot from device, `logcat` in report.
- [ ] **iOS build:** boots in `simctl` (mac) or Appetize, screenshot, logs captured.
- [ ] **Inspect** still works for any package (metadata/permissions/ABIs).
- [ ] Markdown report with selectable sections → download **and** push to repo.
- [ ] Light/dark, all device frames, rotation — match `DESIGN_SPEC.md`.

## Notes
- Keep the prototype's **honesty**: if a path can't execute (e.g., no Mac, no cloud key), say so in the UI and fall back to inspect + framed web build — don't fake a running screen.
- Security: never commit tokens; backend holds emulator access; PATs/cloud keys via server-side env or the user's browser only (as the prototype does).
- The prototype runs offline except `html2canvas` (CDN). In production, bundle it.
