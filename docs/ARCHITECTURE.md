# Architecture — EMulator Studio (production)

This describes how to turn the browser prototype into a product that can **actually run native Android/iOS builds**. The web/PWA/hybrid path and the inspector are already solved in `reference_prototype/` — port them as-is. The new work is a backend and a native-execution layer.

```
┌────────────────────────────────────────────────────────────────────────┐
│  FRONTEND  (Next.js + TS — recreate the prototype UI exactly)           │
│  device frames · console/network/inspect/report/push panels · themes    │
└───────────────┬───────────────────────────────┬────────────────────────┘
                │ web/PWA/hybrid (runs in-browser)│ native (needs backend)
                ▼                                 ▼
   ┌─────────────────────────┐      ┌───────────────────────────────────┐
   │ BROWSER RUNTIME (ported  │      │ BACKEND  (Node service / API)     │
   │ from emu/*.js)           │      │ • GitHub: OAuth/PAT, fetch builds │
   │ • zip/axml/bplist        │      │ • Emulator orchestrator           │
   │ • inspect + framework    │      │ • Screenshot + log capture        │
   │ • hybrid blob runner     │      │ • Report → repo (commit/PR)       │
   │ • console bridge         │      └──────────┬────────────────────────┘
   │ • report builder         │                 │ pick ONE+ strategy
   └─────────────────────────┘                  ▼
                          ┌──────────────────────────────────────────────┐
                          │ NATIVE EXECUTION (see strategies A/B/C below) │
                          │ A) Local SDK: emulator+adb / xcrun simctl     │
                          │ B) Cloud farm: Appetize.io / BrowserStack     │
                          │ C) CI: GitHub Actions emulator + commit report│
                          └──────────────────────────────────────────────┘
```

## Recommended stack
- **Frontend:** Next.js 14 (App Router) + TypeScript + plain CSS variables (the prototype's tokens — no Tailwind needed, but fine if the user prefers it). Reuse the prototype's CSS verbatim.
- **Backend:** Next.js Route Handlers for light work; a separate **long-running Node service** (Fastify) for emulator orchestration + WebSocket streaming, because emulators are stateful and long-lived.
- **Streaming the device screen to the browser:** WebSocket of periodic PNG frames (simple, works everywhere) for v1; upgrade to WebRTC/`scrcpy`/emulator gRPC video for low latency later.
- **Packaging option:** if "no servers" is desired, ship as a **Tauri or Electron desktop app** that bundles the Node orchestrator and talks to the local Android SDK / Xcode. This is the cleanest "it just works on my machine" story for local emulators.

---

## Native-execution strategies

Pick based on the user's environment. Ideally implement **A (Android) + the inspector fallback** first, then **B** for universal/iOS-without-Mac.

### Strategy A — Local SDK emulators (most powerful, free, your machine)
Backend shells out to the platform tools. Best when the developer has Android Studio / Xcode installed.

**Android** (`emulator` + `adb`, cross-platform):
1. Create/boot an AVD: `emulator -avd Pixel_8_API_34 -no-snapshot -gpu swiftshader_indirect`.
2. Wait for boot: `adb wait-for-device shell 'while [[ -z $(getprop sys.boot_completed) ]]; do sleep 1; done'`.
3. Install: `adb install -r app.apk` → launch: `adb shell monkey -p <package> 1` (or `am start -n <pkg>/<activity>`).
4. **Screen stream:** loop `adb exec-out screencap -p` → PNG over WebSocket (~2–5 fps). For interactive low-latency, run **scrcpy** and pipe its H.264, or use the emulator's gRPC `streamScreenshot`. **Input:** forward browser pointer/key events → `adb shell input tap/swipe/text/keyevent`.
5. **Logs → MD:** `adb logcat -v time` (filter by app PID) → parse → reuse the prototype's report format. Crashes: watch for `FATAL EXCEPTION` / tombstones.
6. **Screenshot:** `adb exec-out screencap -p > shot.png` (true device pixels).

**iOS** (`xcrun simctl`, **macOS only**):
1. Boot: `xcrun simctl boot "iPhone 15 Pro"` (+ `open -a Simulator` to show, or run headless).
2. Install: `xcrun simctl install booted App.app` (extract `Payload/*.app` from the `.ipa` first).
3. Launch: `xcrun simctl launch booted <bundle-id>`.
4. **Screenshot:** `xcrun simctl io booted screenshot shot.png`. **Video:** `simctl io booted recordVideo`.
5. **Logs → MD:** `xcrun simctl spawn booted log stream --level debug --predicate 'processImagePath CONTAINS "<App>"'`. Crash logs: `~/Library/Logs/DiagnosticReports/`.
6. Streaming: poll `simctl io screenshot`, or record video; full WebRTC is harder on iOS sim.

> iOS without a Mac is impossible locally — fall back to Strategy B.

### Strategy B — Cloud device farm (universal, zero local setup, paid)
Best for "works for anyone, including iOS on Windows/Linux." Recommended provider: **Appetize.io** (clean embed + API). Alternative: **BrowserStack App Live / App Automate**.

**Appetize flow:**
1. Upload artifact: `POST https://api.appetize.io/v1/apps` with the `.apk`/`.ipa` → returns a `publicKey`.
2. Embed the streamed real device with `<iframe src="https://appetize.io/embed/<publicKey>?device=pixel8&osVersion=14.0&autoplay=true">` — the user interacts with a real device in-browser. This **replaces the device-frame iframe** for native apps (you can even keep your own bezel around it).
3. **Logs/screenshots:** drive the session via Appetize's `postMessage` JS SDK (`app.getSession()`, `session.screenshot()`, debug + network logs) → feed into the same panels and Markdown report.

This is the smallest amount of code for the biggest "it really runs" win. Gate it behind a user-supplied API key (the prototype already has the UI pattern for storing keys locally).

### Strategy C — CI / repo-native (matches "push errors to repo")
A reusable **GitHub Action** that, on push/PR: builds the app, boots an emulator in CI (`reactivecircus/android-emulator-runner` for Android; macOS runners + `simctl` for iOS), runs a smoke launch, captures screenshots + logs, and **commits the Markdown report** to `emulator-reports/` or comments on the PR. Ship this as a template in the repo so testing is automatic. Pairs well with A/B for interactive runs.

---

## Repo connection (all strategies)
1. **Auth:** GitHub OAuth App (preferred) or fine-grained PAT (prototype already implements PAT push via the contents API — see `emu/github.js`).
2. **Find the build:** in priority order — (a) latest **Release** asset matching `*.apk`/`*.ipa`, (b) latest successful **Actions artifact**, (c) **build from source** (`./gradlew assembleDebug` / `xcodebuild -archive` + `exportArchive`). Let the user choose.
3. **Load** the artifact into the selected runner (browser for hybrid/web, backend for native).
4. **Report back:** commit `report.md` + screenshots to a folder, or open a PR. Reuse `emu/report.js` + `emu/github.js`.

## Data flow for one native test
```
user picks repo/artifact ─► backend fetches .apk ─► inspector (reuse emu/inspect)
   ─► orchestrator boots emulator (A) or uploads to Appetize (B)
   ─► install + launch ─► stream frames + forward input to UI
   ─► capture logcat/log stream ─► parse to report model (reuse emu/report shape)
   ─► user hits screenshot ─► device screencap ─► added to report
   ─► user hits push ─► commit report.md + PNGs to repo (reuse emu/github)
```

## Module reuse map (prototype → production)
| Prototype file | Reuse as | Notes |
|---|---|---|
| `emu/zip.js` | ZIP read (apk/ipa) | Browser or Node (swap `DecompressionStream` for `zlib` server-side) |
| `emu/axml.js`, `emu/bplist.js` | Manifest/Info.plist decode | Pure; portable to Node. Or use `aapt2`/`apkanalyzer` server-side (TOOLING_REFERENCE) |
| `emu/inspect.js` | Framework/ABI/perm/icon detect | Keep |
| `emu/runner.js` | Hybrid/web runner + **console bridge** | Browser only |
| `emu/report.js` | Markdown builder | Keep; extend with native log sections |
| `emu/github.js` | Repo push | Keep; add OAuth + artifact fetch |
| `emu/devices.js` | Device frames/sizes | Keep for web + as bezel around cloud embeds |
| `emu/shot.js` | Web screenshot | Native screenshots come from device tools instead |

## Non-goals / honesty rules
- Don't claim to run native code in the browser. Native = backend or cloud, always.
- If no native runner is available, **degrade to inspect + framed web build** and say so (the prototype's exact behavior).
