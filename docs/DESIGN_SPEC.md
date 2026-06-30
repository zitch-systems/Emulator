# Design Spec — EMulator Studio UI (hi-fi)

Recreate this exactly. The live source of truth is `reference_prototype/EMulator Studio.html` (all CSS is in its `<style>` block). Values below are lifted from it.

## Layout shell
Full-viewport, no page scroll. Three regions stacked: **top bar** (fixed height, wraps), then a horizontal **main** split into **stage** (flex, fills) + **side panel** (fixed `430px`, `360px` ≤920px wide). Everything uses CSS variables; theme is toggled by `class="dark"` on `<html>` and persisted to `localStorage('emu.theme')`.

```
┌──────────────────────────────── top bar ─────────────────────────────────┐
│ [E] EMulator Studio · device test lab │ url input [Load] │ APK/IPA  Web    │
│                                        │ build  Demo │ … │ [device ▾] [☾]  │
├───────────────────────────────┬───────────────────────────────────────────┤
│  STAGE (device frame, scaled, │  SIDE PANEL                               │
│  centered, letterboxed)       │  tabs: Inspect Console Network Report     │
│  floating toolbar: ⟳ ↻ dims % ◉│        Push Help                          │
│                               │  (active pane content)                    │
└───────────────────────────────┴───────────────────────────────────────────┘
```

## Design tokens (exact)

### Light (`:root`)
| Token | Value | | Token | Value |
|---|---|---|---|---|
| `--bg` | `#f3f4f6` | | `--ink` | `#181b21` |
| `--panel` | `#ffffff` | | `--ink-2` | `#3c424c` |
| `--panel-2` | `#f7f8fa` | | `--muted` | `#697078` |
| `--line` | `#e3e6ea` | | `--faint` | `#9aa1ab` |
| `--line-2` | `#eceef1` | | `--accent` | `#0e8f6e` |
| `--chip` | `#eef0f3` | | `--accent-2` | `#0b7a5e` |
| `--stage` | `#d9dde2` | | `--accent-ink` | `#ffffff` |
| `--err` | `#cf3030` | | `--warn` | `#9a6a12` |
| `--ok` | `#0e8f6e` | | `--info` | `#2563c9` |

### Dark (`html.dark`)
| Token | Value | | Token | Value |
|---|---|---|---|---|
| `--bg` | `#0b0d11` | | `--ink` | `#e8ebef` |
| `--panel` | `#13161c` | | `--ink-2` | `#c2c8d0` |
| `--panel-2` | `#191d24` | | `--muted` | `#878e99` |
| `--line` | `#262b34` | | `--faint` | `#5b626d` |
| `--chip` | `#1d222a` | | `--accent` | `#34d399` |
| `--stage` | `#06070a` | | `--accent-2` | `#2bbd86` |
| `--err` | `#ff7066` | | `--accent-ink` | `#04221a` |
| `--ok` | `#34d399` | | `--warn` | `#fbbf24` |
| `--info` | `#6aa3ff` | | | |

### Other
- **Radius:** base `--radius: 11px`; buttons/inputs `8px`; chips `7px`; cards `14–16px`; device frame `device.radius + 8px`.
- **Type:** sans = `-apple-system, system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`; mono = `ui-monospace, "SF Mono", SFMono-Regular, "JetBrains Mono", Menlo, Consolas, monospace`. Base body `13px`. Brand `14px/680`. Section headers `11px/680 uppercase, letter-spacing .05em, color --faint`. Logs/metadata in mono `11.5px`.
- **Shadow:** `0 1px 2px rgba(17,20,28,.06), 0 8px 24px -12px rgba(17,20,28,.14)` (light); heavier in dark.
- **Accent** is emerald — used for the primary button, active tab underline (`2px`), focus rings, "Runnable" chip, bar fills. Do not introduce blue/purple gradients.

## Components

### Top bar
- **Brand:** `24px` rounded-`7px` emerald gradient tile with white `E`, then "EMulator Studio" + muted "device test lab".
- **Source field:** flex-grow input (placeholder `https://your-app.com · PWA / web build URL · localhost:3000`) joined to a primary **Load** button (input has no right border, button radius `0 8px 8px 0`).
- **Buttons:** `⤓ APK / IPA` (opens file picker `.apk,.ipa,.zip`), `⌥ Web build` (folder picker, `webkitdirectory`), `◷ Demo`. Secondary style: `--panel-2` bg, `1px --line` border, hover lifts border to `--faint`.
- **Right:** device `<select>`, theme toggle (`☾`/`☀`).
- Buttons: `padding:8px 12px; font-size:12.5px; weight:550`. Primary = accent bg, accent-ink text.

### Stage + device frame
- Stage bg `--stage`. Device is built in JS (`emu/devices.js`) and **scaled with `transform: scale()`** to fit (no CSS transition on the frame — it interferes with the computed transform).
- **Floating toolbar** (top-center, frosted `--panel` 86% + `backdrop-filter: blur(10px)`, `1px --line`, radius `11px`): `⟳` rotate, `↻` reload, mono dimension label (e.g. `393×852`), mono scale `%`, `◉` screenshot (disabled when capture impossible).
- **Device frames** (presets in `emu/devices.js`): iPhone 15 Pro `393×852@3` (Dynamic Island), 15 Pro Max `430×932@3`, iPhone SE `375×667@2` (home button, larger top/bottom bezel via `.frame-home`), Pixel 8 `412×915@2.6` (punch-hole), Pixel 8 Pro `448×998@3`, Galaxy Fold open `600×818@2.4` (center seam), iPad Pro 11 `834×1194@2`, Android tablet `800×1280@2`. Bezel = metallic gradient; screen `overflow:hidden`, radius `device.radius`. Status-bar overlay (time + signal/wifi/battery glyphs), home-indicator bar. Rotation swaps w/h and hides notch.
- **Placeholder** (native inspect-only): centered card — `⛬` glyph (warn color), "Native Android/iOS binary", explanation that browsers can't execute native code.

### Side panel — tabs
Tabs: **Inspect · Console · Network · Report · Push · Help**. Active tab: full-ink text + `2px` accent underline. Console/Network tabs carry a count **badge** (`badge-err` red when errors, `badge-warn` amber, else muted).

**Inspect pane** — app icon (`58px`, rounded `14px`) or letter fallback; name (`17px/680`); mono sub (`APK · 18.1 MB`); chips row: **● Runnable** (ok) or **○ Inspect-only** (warn) + framework chips (info color). Then a `key/value` grid (mono values, right-aligned) of package/version/SDK/ABIs (Android) or bundleId/version/min iOS/devices (iOS). Then **Permissions** as mono chips. Then **Contents** — file count + a horizontal **bar chart** of largest directories (accent fills). Then **Notes** (dotted-separated lines; native warning in warn color).

**Console pane** — filter chips (`log/info/warn/error`, toggle `.off` → strike-through + hides that level via `.hide-<lv>`), clear button. List in mono `11.5px`, each row `[level] message`; error rows tinted `--err` 9%, warn text amber. Footer: `● N errors · ● N warnings · Σ N logs`.

**Network pane** — rows `[METHOD] [status] [url] [ms]`; status colored ok/err. Clear button.

**Report pane** — **Sections to include** checkboxes (2-col): App metadata, Permissions, Package contents, Errors & warnings (default on); Full console log, Network log (default off); Screenshots (on). **Screenshots** horizontal strip (`78×138` thumbs, removable). Buttons: **Preview**, primary **↓ report.md**, **↓ .zip (md + shots)**. Preview = mono pre block.

**Push pane** — password field **GitHub token** (hint links to token settings, "Contents → Read and write"), text **Repository** (`owner/name`), two-col **Branch** + **Folder**, **Verify token** + primary **⤴ Push report**, status line (ok/err/warn colored mono), hidden "View on GitHub →" link on success. Token + repo persist to `localStorage`.

**Help pane** — "What runs vs. inspected" list (ok/warn coded), the **bridge snippet** in a readonly `<textarea>` (mono `10.5px`) + **⧉ Copy snippet**, export/ship note.

### Overlays
- **Busy:** centered spinner (`34px`, accent top-border, `0.8s` spin) + message, over a blurred scrim.
- **Toast:** bottom-center pill, `--ink` bg / `--bg` text, slides up, auto-hides ~2.6s.
- **Drag-drop:** dashed accent overlay inset `14px` with "Drop .apk / .ipa / .html / build folder to load".

## Interactions & behavior
- **Load URL** → iframe `src` (cross-origin: can't capture console/screenshot; show the warn note + bridge hint). **Upload build/zip/folder** → in-memory file map, references rewritten to blob URLs, run in iframe with the injected **console bridge** (full capture). **APK/IPA** → inspect; if **hybrid**, extract web root + run; if **native**, show placeholder + metadata. **Demo** loads a Capacitor sample so all panels populate on first open.
- **Console bridge** (`emu/runner.js`): wraps `console.*`, `error`/`unhandledrejection`, `fetch`/XHR in the guest; `postMessage` to parent → Console/Network panels. Same-origin blob docs are fully captured.
- **Device change / rotate** re-renders the frame and re-applies the current run; scale recomputes on resize.
- **Screenshot** (`◉`) uses `html2canvas` on same-origin iframe content → PNG → report strip. (Production native screenshots come from `adb screencap` / `simctl io` instead.)
- **Report** builds Markdown from selected sections (`emu/report.js`); zip bundles `report.md` + `screenshots/*.png` (`emu/zipw.js`).
- **Push** commits the report (+ PNGs) to `folder/<timestamp>/` via the GitHub contents API (`emu/github.js`).
- Theme toggle persists; all keys: `emu.theme`, `emu.gh.token`, `emu.gh.repo`.

## Assets
No image assets — icons are Unicode/SF-symbol glyphs and CSS-drawn (status bar, battery). The app icon shown in Inspect is extracted from the uploaded package at runtime. In production, swap glyphs for the codebase's existing icon set (Lucide/SF Symbols/etc.) at the same weights.

## Files (reference)
`reference_prototype/EMulator Studio.html` + `reference_prototype/emu/{devices,zip,axml,bplist,inspect,runner,shot,report,github,zipw,demo}.js`. Each `emu/*` file documents its public `EMU.<module>` API at the bottom.
