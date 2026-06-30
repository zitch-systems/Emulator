'use client';

import { BRIDGE_SNIPPET } from '@/lib/emu/bridge';

export default function HelpPane({ onCopy }: { onCopy: (text: string) => void }) {
  const snippet = `<!-- EMulator Studio bridge — drop into your PWA's index.html <head> to
     stream console + network + errors into the studio for cross-origin URLs -->
<script>${BRIDGE_SNIPPET}</script>`;

  return (
    <div>
      <div className="section-h">What runs vs. what's inspected</div>
      <div className="help-list">
        <div>
          <span className="ok">● PWA / web URL</span> — runs live in the device frame. Same-origin
          builds are fully captured; cross-origin URLs need the bridge below (or use Headless probe).
        </div>
        <div>
          <span className="ok">● Web build (folder / zip)</span> — runs live with full console,
          network &amp; screenshot capture.
        </div>
        <div>
          <span className="ok">● Hybrid .apk / .ipa</span> (Capacitor / Cordova) — the web layer
          runs live.
        </div>
        <div>
          <span className="warn">○ Native .apk / .ipa</span> (Flutter / RN / Unity / native) —
          inspected here; run it on a local emulator (Strategy A) or Appetize cloud (Strategy B).
          Browsers cannot execute native code.
        </div>
      </div>

      <div className="section-h">Bridge snippet</div>
      <p className="hint">
        Cross-origin pages can&apos;t be read by the parent window. Ship this snippet in your app and
        its console, network and errors stream into the studio automatically.
      </p>
      <textarea className="snippet" readOnly value={snippet} />
      <div className="btn-row">
        <button className="btn" onClick={() => onCopy(snippet)}>
          ⧉ Copy snippet
        </button>
      </div>

      <div className="section-h">Headless probe (any URL)</div>
      <p className="hint">
        The <strong>Headless probe</strong> button (Console tab) renders any URL server-side in
        real Chromium at the selected device profile and captures every console line, page error and
        network call plus a screenshot — no snippet required. This is the universal &quot;test &amp;
        audit any build&quot; path.
      </p>
    </div>
  );
}
