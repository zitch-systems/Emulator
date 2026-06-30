# Tooling Reference — exact commands & APIs

Copy-paste-grade reference for the backend. Group by capability. Prefer official SDK tools over hand-rolled parsers where a binary already exists, but the prototype's pure-JS decoders (`emu/axml.js`, `emu/bplist.js`) are a dependency-free fallback.

---

## 1. Inspecting packages (no execution)

### Android `.apk`
```bash
# Manifest as readable XML (badging = label, package, versionName/Code, sdk, perms, icon):
aapt2 dump badging app.apk
# or full manifest:
aapt2 dump xmltree app.apk --file AndroidManifest.xml
# Modern alternative bundled with Android Studio:
apkanalyzer manifest print app.apk
apkanalyzer apk summary app.apk          # package, versionCode, versionName
apkanalyzer files list app.apk           # contents
# ABIs:
unzip -l app.apk | grep '^.*lib/' | sed -E 's#.*lib/([^/]+)/.*#\1#' | sort -u
```
Framework hints (same logic as `emu/inspect.js`):
- `lib/*/libflutter.so` → Flutter · `assets/index.android.bundle` or `libhermes.so` → React Native
- `lib/*/libunity.so` → Unity · `assets/public/index.html` or `assets/www/index.html` → **Capacitor/Cordova (hybrid, runnable)**

### iOS `.ipa`
```bash
unzip -o app.ipa -d ipa_out          # Payload/<App>.app/
plutil -convert json -o - "ipa_out/Payload/<App>.app/Info.plist"   # macOS: read Info.plist
# Linux: use the prototype's bplist decoder, or `python3 -c "import plistlib..."`
```
Keys: `CFBundleIdentifier`, `CFBundleDisplayName/Name`, `CFBundleShortVersionString`, `CFBundleVersion`, `MinimumOSVersion`, `UIDeviceFamily`, any `*UsageDescription` (= privacy strings). Hybrid if `Payload/*.app/public/index.html` or `/www/` exists.

---

## 2. Android emulator (Strategy A)
```bash
# List & create AVDs (needs cmdline-tools + system image):
sdkmanager "system-images;android-34;google_apis;x86_64"
avdmanager create avd -n Pixel_8_API_34 -k "system-images;android-34;google_apis;x86_64" -d pixel_8
emulator -list-avds

# Boot headless, software GPU (CI-safe):
emulator -avd Pixel_8_API_34 -no-window -no-audio -no-boot-anim -gpu swiftshader_indirect -accel auto &

# Wait for full boot:
adb wait-for-device
adb shell 'while [[ -z $(getprop sys.boot_completed | tr -d "\r") ]]; do sleep 1; done'

# Install / launch / inspect:
adb install -r -t app.apk
adb shell pm list packages | grep <pkg>
adb shell monkey -p <pkg> -c android.intent.category.LAUNCHER 1   # launch main activity

# Screenshot (true pixels):
adb exec-out screencap -p > shot.png

# Live frames for streaming (loop, ~2-5fps) OR use scrcpy for interactive H.264:
adb exec-out screencap -p          # one frame to stdout
scrcpy --no-control --max-fps 30   # external; or embed via its server protocol

# Forward browser input → device:
adb shell input tap <x> <y>
adb shell input swipe <x1> <y1> <x2> <y2> <ms>
adb shell input text "hello"
adb shell input keyevent <KEYCODE>      # 4=BACK, 3=HOME, 187=RECENTS

# Logs → Markdown (filter to the app's PID):
PID=$(adb shell pidof <pkg>)
adb logcat -v time --pid=$PID *:W       # warnings+; or *:E for errors only
# Crash signal: lines containing "FATAL EXCEPTION" / "ANR in" / tombstone in /data/tombstones
```

## 3. iOS simulator (Strategy A, macOS only)
```bash
xcrun simctl list devices available
xcrun simctl boot "iPhone 15 Pro"
open -a Simulator                         # optional: show the window
# .ipa → .app:
unzip -o app.ipa -d ipa && APP=$(ls -d ipa/Payload/*.app)
xcrun simctl install booted "$APP"
xcrun simctl launch booted <bundle-id>
# Screenshot / video:
xcrun simctl io booted screenshot shot.png
xcrun simctl io booted recordVideo demo.mp4   # Ctrl-C to stop
# Logs → Markdown:
xcrun simctl spawn booted log stream --style compact --level debug \
  --predicate 'processImagePath CONTAINS "<AppName>"'
# Crash reports: ~/Library/Logs/DiagnosticReports/<App>-*.ips
```

## 4. Cloud device farm (Strategy B — Appetize.io)
```bash
# Upload (returns { publicKey }):
curl https://api.appetize.io/v1/apps -H "Content-Type: application/json" \
  -d '{"token":"<API_TOKEN>","url":"https://.../app.apk","platform":"android"}'
```
Embed + control in the browser:
```html
<iframe id="appetize"
  src="https://appetize.io/embed/<publicKey>?device=pixel8&osVersion=14.0&autoplay=true&deviceColor=black"></iframe>
<script>
  const client = await window.appetize.getClient('#appetize');
  const session = await client.startSession();
  const img = await session.screenshot('base64'); // → add to report
  session.on('log', e => pushLog(e));              // device logs → console panel
  session.on('network', e => pushNet(e));          // → network panel
</script>
```
BrowserStack equivalent: App Live (`/app-live/...`) for manual, App Automate (Appium) for scripted runs + REST for sessions/assets/screenshots.

## 5. Building from source (when no prebuilt artifact)
```bash
# Android:
./gradlew assembleDebug            # → app/build/outputs/apk/debug/app-debug.apk
# iOS (macOS):
xcodebuild -scheme App -archivePath build/App.xcarchive archive
xcodebuild -exportArchive -archivePath build/App.xcarchive \
  -exportOptionsPlist ExportOptions.plist -exportPath build/ipa
# Capacitor/PWA:
npm ci && npm run build            # → dist/ or build/ (run directly in the web runner)
```

## 6. GitHub integration
The prototype implements push already (`emu/github.js`, REST contents API). Add:
```
# Find a build artifact:
GET /repos/{owner}/{repo}/releases/latest          → assets[].browser_download_url
GET /repos/{owner}/{repo}/actions/artifacts        → download .zip, unzip the .apk/.ipa
# Push a report (existing):
PUT /repos/{owner}/{repo}/contents/{path}          { message, content(base64), branch, sha? }
# Or open a PR with the report:
POST /repos/{owner}/{repo}/git/refs ... + POST /repos/{owner}/{repo}/pulls
```
Auth: OAuth App (`repo` scope) for a smooth flow, or fine-grained PAT with **Contents: read+write** (+ Actions: read if pulling artifacts).

## 7. GitHub Action template (Strategy C, Android)
```yaml
name: emulator-smoke
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: { distribution: temurin, java-version: '17' }
      - run: ./gradlew assembleDebug
      - uses: reactivecircus/android-emulator-runner@v2
        with:
          api-level: 34
          arch: x86_64
          script: |
            adb install -r app/build/outputs/apk/debug/app-debug.apk
            adb shell monkey -p <pkg> 1
            sleep 8
            adb exec-out screencap -p > shot.png
            adb logcat -d > logcat.txt
      - run: node tools/build-report.js logcat.txt shot.png > report.md   # reuse emu/report shape
      - uses: stefanzweifel/git-auto-commit-action@v5
        with: { commit_message: 'emulator report', file_pattern: 'emulator-reports/**' }
```

## Gotchas
- Emulator boot is slow (30–90s cold); cache snapshots (`-snapshot`) and reuse a warm instance.
- CI needs KVM for x86_64 Android (`ubuntu-latest` has it via the action above).
- iOS optimized `CgBI` PNG icons won't render in a browser — read metadata, skip the preview.
- Stream PNG frames for v1; only invest in WebRTC/scrcpy once the rest works.
- Always sandbox uploaded binaries; never run untrusted native code outside the emulator/VM.
