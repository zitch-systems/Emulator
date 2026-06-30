'use client';

import type { AppInfo } from '@/lib/types';
import { fmtBytes } from '@/lib/format';

interface Props {
  app: AppInfo | null;
  hasAppetizeToken: boolean;
  nativeAndroid: boolean;
  nativeIos: boolean;
  onRunCloud: () => void;
  onRunNative: () => void;
  busyAction: boolean;
}

export default function InspectPane({
  app,
  hasAppetizeToken,
  nativeAndroid,
  nativeIos,
  onRunCloud,
  onRunNative,
  busyAction,
}: Props) {
  if (!app) {
    return (
      <div className="empty">
        Load a URL, upload an <code>.apk</code> / <code>.ipa</code> / web build, or hit{' '}
        <strong>Demo</strong> to inspect an app here.
      </div>
    );
  }

  const kv =
    app.platform === 'ios'
      ? [
          ['Bundle ID', app.packageId],
          ['Version', app.version],
          ['Build', app.build],
          ['Min iOS', app.minOS],
          ['Devices', app.deviceFamily?.join(', ')],
        ]
      : [
          ['Package', app.packageId],
          ['Version', app.version],
          ['Version code', app.build],
          ['Min SDK', app.minSdk],
          ['Target SDK', app.targetSdk],
          ['ABIs', app.abis?.join(', ')],
        ];

  const maxDir = Math.max(1, ...(app.dirSizes?.map((d) => d.bytes) ?? [1]));
  const canRunNative =
    (app.platform === 'android' && nativeAndroid) || (app.platform === 'ios' && nativeIos);

  return (
    <div>
      <div className="app-head">
        {app.iconDataUrl ? (
          <img className="app-icon" src={app.iconDataUrl} alt="" />
        ) : (
          <div className="app-icon">{app.name.charAt(0).toUpperCase()}</div>
        )}
        <div>
          <div className="app-name">{app.name}</div>
          <div className="app-sub">
            {app.fileType ?? 'App'} · {fmtBytes(app.sizeBytes)}
          </div>
        </div>
      </div>

      <div className="chips">
        {app.runnable ? (
          <span className="chip chip-ok">● Runnable</span>
        ) : (
          <span className="chip chip-warn">○ Inspect-only</span>
        )}
        {app.frameworks.map((f) => (
          <span key={f} className="chip chip-info">
            {f}
          </span>
        ))}
      </div>

      {!app.runnable && (hasAppetizeToken || canRunNative) && (
        <div className="btn-row">
          {canRunNative && (
            <button className="btn btn-primary" onClick={onRunNative} disabled={busyAction}>
              ▶ Run on local {app.platform === 'ios' ? 'Simulator' : 'emulator'}
            </button>
          )}
          {hasAppetizeToken && (
            <button className="btn" onClick={onRunCloud} disabled={busyAction}>
              ☁ Run on Appetize cloud
            </button>
          )}
        </div>
      )}

      <div className="section-h">Details</div>
      <div className="kv-grid">
        {kv
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k as string} style={{ display: 'contents' }}>
              <div className="k">{k}</div>
              <div className="v">{v}</div>
            </div>
          ))}
      </div>

      {app.permissions && app.permissions.length > 0 && (
        <>
          <div className="section-h">Permissions</div>
          <div className="chips">
            {app.permissions.map((p) => (
              <span key={p} className="chip chip-mono">
                {p}
              </span>
            ))}
          </div>
        </>
      )}

      {app.dirSizes && app.dirSizes.length > 0 && (
        <>
          <div className="section-h">Contents · {app.fileCount ?? '—'} files</div>
          <div className="barchart">
            {app.dirSizes.map((d) => (
              <div key={d.name} className="bar-row">
                <span className="label">{d.name}</span>
                <span className="bar-track">
                  <span className="bar-fill" style={{ width: `${(d.bytes / maxDir) * 100}%` }} />
                </span>
                <span className="size">{fmtBytes(d.bytes)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {app.notes.length > 0 && (
        <>
          <div className="section-h">Notes</div>
          <div className="notes">
            {app.notes.map((n, i) => (
              <div key={i} className={/native|cannot|can't/i.test(n) ? 'warn' : ''}>
                · {n}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
