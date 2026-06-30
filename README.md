# EMulator Studio — universal Android / iOS / PWA test lab

Connect any repo and **test any build — `.apk`, iOS app, or PWA — in real device
frames**, capture console + network errors, take screenshots, export a Markdown
report, and push that report back to your repo.

Built with **Next.js 14 (App Router) + TypeScript**. Recreates the hi-fi design
in `docs/DESIGN_SPEC.md` and implements the architecture in `docs/ARCHITECTURE.md`
(the design package these were built from; see also `docs/TOOLING_REFERENCE.md`
and `docs/HANDOFF.md`).

---

## The honest constraint (read this first)

A web page **cannot execute a native `.apk` / `.ipa` binary** — that needs a real
OS (Android/QEMU) or Apple's Simulator (macOS-only). EMulator Studio is honest
about this and gives you the full ladder instead of faking a screen:

| Build type | What happens | Needs |
| --- | --- | --- |
| **PWA / web URL** | Runs **live** in a device frame | nothing |
| **Web build** (folder / `.zip`) | Runs **live**, full console + network + screenshot | nothing |
| **Hybrid `.apk` / `.ipa`** (Capacitor / Cordova) | Web layer runs **live** | nothing |
| **Any URL — headless probe** | Real Chromium renders it at the device profile, captures every console line, error & network call + a screenshot — **works cross-origin** | nothing (bundled Chromium) |
| **Native `.apk`** | Metadata inspected; **runs on a real device** | local Android SDK *or* an Appetize token |
| **Native `.ipa`** | Metadata inspected; **runs on a real device** | macOS + Xcode *or* an Appetize token |

So: **PWA/hybrid/web and inspection work with zero setup.** Native execution is
real too — it just needs a device backend (your local SDK, or Appetize cloud).

---

## Features

- **Real device frames** — iPhone 15 Pro / Pro Max / SE, Pixel 8 / 8 Pro, Galaxy
  Fold, iPad Pro 11", Android tablet. Rotate, scale-to-fit, light/dark themes.
- **Live web/PWA/hybrid runner** — uploads a build (folder or zip) or a hybrid
  package's web root, rewrites refs to blob URLs, injects a **console bridge**,
  and runs it in the frame with full console/network/error capture.
- **Universal headless probe** — renders *any* URL server-side in real Chromium at
  the chosen device profile (viewport, DPR, UA, touch) and returns console logs,
  page errors, network calls and a screenshot. This is the "test & audit any
  build" engine; it works even for cross-origin URLs.
- **Package inspector** — dependency-free pure-JS decoders for Android binary XML
  (`AndroidManifest.xml`) and iOS binary/XML `Info.plist`: package/bundle id,
  version, SDK/OS levels, ABIs, permissions, framework detection (Flutter / React
  Native / Unity / Capacitor / native), icon, and a contents breakdown.
- **Native execution**
  - **Local SDK (Strategy A):** drives `adb` + `emulator` (Android) or
    `xcrun simctl` (iOS) when installed — install, launch, `screencap`/screenshot,
    `logcat`/log capture. Degrades gracefully when no SDK is present.
  - **Cloud (Strategy B):** uploads to **Appetize.io** and streams a real device
    into the frame (optional API token).
  - **CI (Strategy C):** a ready-to-copy GitHub Action in
    `templates/github-action-emulator-smoke.yml`.
- **Repo connection** — pull a build artifact from any repo (latest Release asset
  or Actions artifact), and **push** the Markdown report (+ screenshots) back as a
  single commit via the Git Data API.
- **Markdown reports** — selectable sections (metadata, permissions, contents,
  errors, full console, network, screenshots) → download `report.md`, a `.zip`
  bundle, or push to the repo.

---

## Quick start

```bash
npm install
npm run dev            # http://localhost:3000
# or production:
npm run build && npm start
```

Then:

1. **PWA:** paste a URL → **Load**. Use **Headless probe** (Console tab) to capture
   errors/screenshot for cross-origin sites.
2. **Web build:** **⌥ Web build** (pick your `dist/`/`build/` folder) — runs live.
3. **APK/IPA:** **⤓ APK / IPA** — inspects it; hybrid apps run live, native apps
   show metadata + a "Run on local emulator / Appetize" button.
4. **Demo:** **◷ Demo** loads a Capacitor sample that populates every panel.
5. **Report:** **Report** tab → pick sections → download or push.
6. **Push:** **Push** tab → GitHub token + `owner/repo` → **Verify** / **Pull build
   artifact** / **Push report**.

### Capture console for a cross-origin PWA

Cross-origin pages can't be read by the parent window. Either use **Headless
probe**, or ship the bridge so the live frame captures everything:

```html
<script src="/emulator-bridge.js"></script>
```

(Full snippet is in the **Help** tab and `public/emulator-bridge.js`.)

---

## Environment notes

- **Chromium for the probe/screenshot routes** is resolved automatically:
  `PLAYWRIGHT_EXECUTABLE_PATH` → `PLAYWRIGHT_CHROMIUM_PATH` →
  `/opt/pw-browsers/chromium` → Playwright's default. On a normal machine run
  `npx playwright install chromium` once.
- **Tokens** (GitHub PAT, Appetize) are stored only in your browser and sent only
  to this app's own same-origin API routes, which use them per-request and never
  persist them.
- **Local SDK execution** requires `adb` + `emulator` (Android) on `PATH`, or
  macOS + Xcode (`xcrun simctl`) for iOS. The studio auto-detects availability.

---

## Testing

```bash
npm run typecheck       # tsc --noEmit
npm run build           # next build
npm run test:e2e        # Playwright end-to-end smoke tests
```

The e2e suite loads the demo, verifies live console capture via the bridge, a
toolbar screenshot landing in the report, the Markdown preview, and the inspector.

---

## Project layout

```
app/
  layout.tsx, page.tsx, globals.css     # shell + design tokens
  api/
    inspect/   parse .apk/.ipa/.zip -> AppInfo
    probe/     headless device emulation of any URL (Playwright)
    github/    verify | artifacts | fetch | push (Git Data API)
    appetize/  upload to Appetize cloud (Strategy B)
    native/    local adb/emulator + xcrun simctl (Strategy A)
components/
  Studio.tsx, DeviceFrame.tsx, panes/*  # UI
lib/
  emu/{devices,axml,bplist,inspect,runner,bridge,report,github,shot,zipw,demo}.ts
  server/{browser,exec}.ts              # Playwright + process helpers
  types.ts, format.ts, clientutil.ts
templates/github-action-emulator-smoke.yml   # Strategy C
public/emulator-bridge.js                     # shippable console bridge
tests-e2e/smoke.spec.ts
```

Module reuse follows the design package's prototype → production map
(`zip/axml/bplist/inspect/runner/report/github/devices/shot/zipw/demo`).
