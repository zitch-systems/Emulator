'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AppInfo,
  LogEntry,
  LogLevel,
  NetEntry,
  ProbeResult,
  ReportSections,
  Shot,
  SourceKind,
} from '@/lib/types';
import { DEVICES, getDevice } from '@/lib/emu/devices';
import { attachBridge } from '@/lib/emu/bridge';
import { buildRunnableDoc, buildRunnableHtml, type RunHandle } from '@/lib/emu/runner';
import { captureIframe } from '@/lib/emu/shot';
import { buildReport } from '@/lib/emu/report';
import { buildReportZip, downloadBlob, downloadText } from '@/lib/emu/zipw';
import {
  ghStore,
  verifyToken,
  listArtifacts,
  fetchArtifact,
  pushReport,
  type RepoArtifact,
} from '@/lib/emu/github';
import { DEMO_APP, DEMO_HTML } from '@/lib/emu/demo';
import { fileToBytes, bytesToBase64, extractWebRoot, filesToMap } from '@/lib/clientutil';
import DeviceFrame from '@/components/DeviceFrame';
import InspectPane from '@/components/panes/InspectPane';
import ConsolePane from '@/components/panes/ConsolePane';
import NetworkPane from '@/components/panes/NetworkPane';
import ReportPane from '@/components/panes/ReportPane';
import PushPane from '@/components/panes/PushPane';
import HelpPane from '@/components/panes/HelpPane';

type Tab = 'inspect' | 'console' | 'network' | 'report' | 'push' | 'help';
type Mode = 'iframe' | 'placeholder' | 'appetize';

const TABS: Tab[] = ['inspect', 'console', 'network', 'report', 'push', 'help'];
const APPETIZE_KEY = 'emu.appetize.token';

export default function Studio() {
  // ---- core state ----
  const [dark, setDark] = useState(false);
  const [deviceId, setDeviceId] = useState(DEVICES[0].id);
  const [landscape, setLandscape] = useState(false);
  const [mode, setMode] = useState<Mode>('placeholder');
  const [runUrl, setRunUrl] = useState<string | null>(null);
  const [appetizeKey, setAppetizeKey] = useState<string | null>(null);
  const [crossOrigin, setCrossOrigin] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [sourceRef, setSourceRef] = useState('');
  const [sourceKind, setSourceKind] = useState<SourceKind>('none');

  const [app, setApp] = useState<AppInfo | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [net, setNet] = useState<NetEntry[]>([]);
  const [shots, setShots] = useState<Shot[]>([]);

  const [tab, setTab] = useState<Tab>('inspect');
  const [filters, setFilters] = useState<Record<LogLevel, boolean>>({
    log: true,
    info: true,
    warn: true,
    error: true,
  });
  const [sections, setSections] = useState<ReportSections>({
    metadata: true,
    permissions: true,
    contents: true,
    errors: true,
    fullConsole: false,
    network: false,
    screenshots: true,
  });
  const [preview, setPreview] = useState<string | null>(null);

  const [busy, setBusy] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState(false);
  const [probing, setProbing] = useState(false);
  const [toast, setToastMsg] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [scalePct, setScalePct] = useState(100);

  // ---- settings / github ----
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [appetizeToken, setAppetizeToken] = useState('');
  const [ghToken, setGhToken] = useState('');
  const [ghRepo, setGhRepo] = useState('');
  const [ghBranch, setGhBranch] = useState('main');
  const [ghFolder, setGhFolder] = useState('emulator-reports');
  const [ghStatus, setGhStatus] = useState<{ kind: 'ok' | 'err' | 'warn'; text: string } | null>(null);
  const [ghResultUrl, setGhResultUrl] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<RepoArtifact[] | null>(null);

  const [nativeAndroid, setNativeAndroid] = useState(false);
  const [nativeIos, setNativeIos] = useState(false);

  // ---- refs ----
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const runHandleRef = useRef<RunHandle | null>(null);
  const lastPkgRef = useRef<{ base64: string; filename: string; app: AppInfo } | null>(null);
  const apkInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const device = useMemo(() => getDevice(deviceId), [deviceId]);

  // ---- lifecycle ----
  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    window.setTimeout(() => setToastMsg(null), 2600);
  }, []);

  const pushLog = useCallback((e: LogEntry) => setLogs((prev) => [...prev, e]), []);
  const pushNet = useCallback((e: NetEntry) => setNet((prev) => [...prev, e]), []);

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
    setGhToken(ghStore.getToken());
    setGhRepo(ghStore.getRepo());
    try {
      setAppetizeToken(localStorage.getItem(APPETIZE_KEY) || '');
    } catch {
      /* ignore */
    }
    const detach = attachBridge({ onLog: pushLog, onNet: pushNet });
    // Probe local SDK availability (best-effort).
    fetch('/api/native', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'status' }),
    })
      .then((r) => r.json())
      .then((s) => {
        setNativeAndroid(Boolean(s?.android?.available));
        setNativeIos(Boolean(s?.ios?.available));
      })
      .catch(() => undefined);
    return () => {
      detach();
      runHandleRef.current?.revoke();
    };
  }, [pushLog, pushNet]);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('emu.theme', next ? 'dark' : 'light');
    } catch {
      /* ignore */
    }
  };

  const resetCapture = () => {
    setLogs([]);
    setNet([]);
    setPreview(null);
  };

  const cleanupRun = () => {
    runHandleRef.current?.revoke();
    runHandleRef.current = null;
    setAppetizeKey(null);
  };

  // ---- loaders ----
  const loadUrl = useCallback(() => {
    let url = urlInput.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    cleanupRun();
    resetCapture();
    let host = url;
    try {
      host = new URL(url).host;
    } catch {
      /* ignore */
    }
    setApp({
      platform: 'web',
      name: host,
      frameworks: ['PWA / web'],
      runnable: true,
      fileType: 'Web URL',
      notes: [
        'Remote URL loaded in the device frame.',
        'Cross-origin: the browser cannot read its console directly — use Headless probe, or ship the bridge snippet (Help tab).',
      ],
    });
    setRunUrl(url);
    setSourceRef(url);
    setSourceKind('url');
    setMode('iframe');
    setCrossOrigin(true);
    setTab('inspect');
  }, [urlInput]);

  const loadDemo = useCallback(() => {
    cleanupRun();
    resetCapture();
    const handle = buildRunnableHtml(DEMO_HTML);
    runHandleRef.current = handle;
    setApp(DEMO_APP);
    setRunUrl(handle.url);
    setSourceRef('Capacitor demo');
    setSourceKind('demo');
    setMode('iframe');
    setCrossOrigin(false);
    setTab('inspect');
    showToast('Demo loaded — try the buttons, then check Console & Report');
  }, [showToast]);

  const inspectBytes = useCallback(
    async (bytes: Uint8Array, filename: string) => {
      const form = new FormData();
      form.append('file', new Blob([new Uint8Array(bytes)]), filename);
      const res = await fetch('/api/inspect', { method: 'POST', body: form });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || 'Inspection failed');
      return json.info as AppInfo;
    },
    [],
  );

  const handlePackageBytes = useCallback(
    async (bytes: Uint8Array, filename: string) => {
      setBusy('Inspecting package…');
      try {
        cleanupRun();
        resetCapture();
        const info = await inspectBytes(bytes, filename);
        setApp(info);
        setSourceRef(filename);
        setSourceKind(info.platform === 'ios' ? 'ipa' : info.platform === 'android' ? 'apk' : 'build');
        lastPkgRef.current = { base64: bytesToBase64(bytes), filename, app: info };

        if (info.runnable && info.hybridRoot !== undefined) {
          // Hybrid .apk/.ipa web layer, or a web-build .zip (hybridRoot '' = root).
          const webRoot = await extractWebRoot(bytes, info.hybridRoot);
          const handle = buildRunnableDoc(webRoot);
          runHandleRef.current = handle;
          setRunUrl(handle.url);
          setMode('iframe');
          setCrossOrigin(false);
        } else {
          setRunUrl(null);
          setMode('placeholder');
        }
        setTab('inspect');
        showToast(`${info.fileType}: ${info.name} — ${info.runnable ? 'runnable' : 'inspect-only'}`);
      } catch (e) {
        showToast('Error: ' + (e as Error).message);
      } finally {
        setBusy(null);
      }
    },
    [inspectBytes, showToast],
  );

  const handleFolder = useCallback(
    async (files: FileList) => {
      setBusy('Loading web build…');
      try {
        cleanupRun();
        resetCapture();
        const map = await filesToMap(files);
        const handle = buildRunnableDoc(map);
        runHandleRef.current = handle;
        setApp({
          platform: 'web',
          name: 'Web build',
          frameworks: ['Web build'],
          runnable: true,
          fileType: 'Web build',
          fileCount: map.size,
          notes: ['Local web build running with full console, network and screenshot capture.'],
        });
        setRunUrl(handle.url);
        setSourceRef(`local build (${map.size} files)`);
        setSourceKind('build');
        setMode('iframe');
        setCrossOrigin(false);
        setTab('console');
      } catch (e) {
        showToast('Error: ' + (e as Error).message);
      } finally {
        setBusy(null);
      }
    },
    [showToast],
  );

  // ---- file inputs ----
  const onApkPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const bytes = await fileToBytes(f);
    if (/\.html?$/i.test(f.name)) {
      cleanupRun();
      resetCapture();
      const handle = buildRunnableHtml(new TextDecoder().decode(bytes));
      runHandleRef.current = handle;
      setApp({ platform: 'web', name: f.name, frameworks: ['HTML'], runnable: true, fileType: 'HTML', notes: [] });
      setRunUrl(handle.url);
      setMode('iframe');
      setCrossOrigin(false);
      setSourceKind('build');
      setTab('console');
      return;
    }
    handlePackageBytes(bytes, f.name);
  };

  const onFolderPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length) handleFolder(files);
    e.target.value = '';
  };

  // ---- drag & drop ----
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const items = e.dataTransfer.files;
    if (!items || !items.length) return;
    if (items.length > 1) {
      handleFolder(items);
      return;
    }
    const f = items[0];
    const bytes = await fileToBytes(f);
    if (/\.html?$/i.test(f.name)) {
      cleanupRun();
      resetCapture();
      const handle = buildRunnableHtml(new TextDecoder().decode(bytes));
      runHandleRef.current = handle;
      setApp({ platform: 'web', name: f.name, frameworks: ['HTML'], runnable: true, fileType: 'HTML', notes: [] });
      setRunUrl(handle.url);
      setMode('iframe');
      setCrossOrigin(false);
      setTab('console');
    } else {
      handlePackageBytes(bytes, f.name);
    }
  };

  // ---- device toolbar ----
  const rotate = () => setLandscape((v) => !v);
  const reload = () => {
    if (mode !== 'iframe' || !runUrl) return;
    const cur = runUrl;
    setRunUrl(null);
    window.setTimeout(() => setRunUrl(cur), 30);
  };

  const addShot = useCallback(
    (dataUrl: string, label: string) => {
      const id = `shot-${shots.length + 1}-${Math.floor(scalePct)}`;
      setShots((prev) => [...prev, { id, dataUrl, label, ts: Date.now() }]);
    },
    [shots.length, scalePct],
  );

  const canProbe = sourceKind === 'url' && /^https?:\/\//i.test(sourceRef);

  const runProbe = useCallback(async () => {
    if (!canProbe) return;
    setProbing(true);
    try {
      const res = await fetch('/api/probe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: sourceRef, deviceId, landscape }),
      });
      const data = (await res.json()) as ProbeResult;
      if (!res.ok || !data.ok) throw new Error(data.error || 'Probe failed');
      setLogs((prev) => [...prev, ...data.logs]);
      setNet((prev) => [...prev, ...data.net]);
      if (data.screenshotDataUrl) addShot(data.screenshotDataUrl, `${device.name} · probe`);
      const errs = data.logs.filter((l) => l.level === 'error').length;
      showToast(`Headless probe: ${errs} error(s), ${data.net.length} request(s) · HTTP ${data.status ?? '—'}`);
      setTab('console');
    } catch (e) {
      showToast('Probe error: ' + (e as Error).message);
    } finally {
      setProbing(false);
    }
  }, [canProbe, sourceRef, deviceId, landscape, addShot, device.name, showToast]);

  const screenshot = useCallback(async () => {
    if (mode === 'appetize') {
      showToast('Use the Appetize device controls to capture cloud screenshots.');
      return;
    }
    if (crossOrigin && canProbe) {
      // capture via headless probe (also refreshes logs/net)
      runProbe();
      return;
    }
    try {
      if (!iframeRef.current) throw new Error('nothing to capture');
      const dataUrl = await captureIframe(iframeRef.current);
      addShot(dataUrl, `${device.name} ${new Date().toLocaleTimeString()}`);
      showToast('Screenshot added to report');
    } catch (e) {
      if ((e as Error).message === 'cross-origin' && canProbe) runProbe();
      else showToast('Screenshot failed: ' + (e as Error).message);
    }
  }, [mode, crossOrigin, canProbe, runProbe, addShot, device.name, showToast]);

  // ---- report ----
  const reportInput = useCallback(
    () => ({
      app,
      source: { kind: sourceKind, ref: sourceRef },
      device,
      logs,
      net,
      shots,
      sections,
      generatedAt: Date.now(),
    }),
    [app, sourceKind, sourceRef, device, logs, net, shots, sections],
  );

  const onPreview = () => setPreview(buildReport(reportInput()));
  const onDownloadMd = () => {
    downloadText(buildReport(reportInput()), 'report.md');
    showToast('report.md downloaded');
  };
  const onDownloadZip = async () => {
    const blob = await buildReportZip(buildReport(reportInput()), shots);
    downloadBlob(blob, 'emulator-report.zip');
    showToast('Report bundle downloaded');
  };

  // ---- github ----
  const persistGh = (t: string, r: string) => {
    ghStore.setToken(t);
    ghStore.setRepo(r);
  };
  const onVerify = async () => {
    setGhStatus({ kind: 'warn', text: 'Verifying…' });
    try {
      const u = await verifyToken(ghToken);
      persistGh(ghToken, ghRepo);
      setGhStatus({ kind: 'ok', text: `Token OK — @${u.login}${u.scopes.length ? ' (' + u.scopes.join(', ') + ')' : ''}` });
    } catch (e) {
      setGhStatus({ kind: 'err', text: (e as Error).message });
    }
  };
  const onLoadArtifacts = async () => {
    setGhStatus({ kind: 'warn', text: 'Loading artifacts…' });
    try {
      const { artifacts } = await listArtifacts(ghToken, ghRepo);
      persistGh(ghToken, ghRepo);
      if (!artifacts.length) {
        setGhStatus({ kind: 'warn', text: 'No .apk/.ipa release assets or Actions artifacts found.' });
        return;
      }
      setArtifacts(artifacts);
      setGhStatus(null);
    } catch (e) {
      setGhStatus({ kind: 'err', text: (e as Error).message });
    }
  };
  const pickArtifact = async (a: RepoArtifact) => {
    setArtifacts(null);
    setBusy('Fetching artifact…');
    try {
      const { filename, base64 } = await fetchArtifact(ghToken, ghRepo, a);
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      await handlePackageBytes(bytes, filename);
    } catch (e) {
      showToast('Fetch failed: ' + (e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const onPush = async () => {
    setGhResultUrl(null);
    setGhStatus({ kind: 'warn', text: 'Pushing report…' });
    try {
      const md = buildReport(reportInput());
      const files = [{ path: 'report.md', contentBase64: btoa(unescape(encodeURIComponent(md))) }];
      if (sections.screenshots) {
        for (const s of shots) {
          files.push({ path: `screenshots/${s.id}.png`, contentBase64: s.dataUrl.split(',')[1] });
        }
      }
      const out = await pushReport({
        token: ghToken,
        repo: ghRepo,
        branch: ghBranch,
        folder: ghFolder,
        message: `EMulator Studio report — ${app?.name ?? sourceRef}`,
        files,
      });
      persistGh(ghToken, ghRepo);
      setGhStatus({ kind: 'ok', text: 'Report pushed.' });
      setGhResultUrl(out.htmlUrl);
      showToast('Report pushed to repo');
    } catch (e) {
      setGhStatus({ kind: 'err', text: (e as Error).message });
    }
  };

  // ---- native / cloud run ----
  const onRunCloud = async () => {
    const pkg = lastPkgRef.current;
    if (!pkg) return showToast('Upload an .apk / .ipa first');
    if (!appetizeToken) {
      setSettingsOpen(true);
      return;
    }
    setBusyAction(true);
    setBusy('Uploading to Appetize cloud…');
    try {
      const res = await fetch('/api/appetize', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token: appetizeToken,
          platform: pkg.app.platform === 'ios' ? 'ios' : 'android',
          base64: pkg.base64,
          filename: pkg.filename,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Upload failed');
      setAppetizeKey(data.publicKey);
      setMode('appetize');
      showToast('Streaming real device from Appetize');
    } catch (e) {
      showToast('Appetize: ' + (e as Error).message);
    } finally {
      setBusy(null);
      setBusyAction(false);
    }
  };

  const onRunNative = async () => {
    const pkg = lastPkgRef.current;
    if (!pkg) return showToast('Upload an .apk / .ipa first');
    setBusyAction(true);
    setBusy('Installing on local device…');
    try {
      const isIos = pkg.app.platform === 'ios';
      const res = await fetch('/api/native', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: isIos ? 'ios-install' : 'android-install',
          base64: pkg.base64,
          filename: pkg.filename,
          packageId: pkg.app.packageId,
          bundleId: pkg.app.packageId,
        }),
      });
      const data = await res.json();
      if (data.available === false) {
        showToast(data.reason || 'Local SDK not available');
        return;
      }
      if (data.error) throw new Error(data.error);
      showToast('Installed on local device — pulling screenshot & logs');
      // pull one screenshot + logcat
      const shotRes = await fetch('/api/native', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: isIos ? 'ios-screenshot' : 'screenshot' }),
      }).then((r) => r.json());
      if (shotRes.screenshotDataUrl) addShot(shotRes.screenshotDataUrl, `${pkg.app.name} · device`);
      if (!isIos) {
        const logRes = await fetch('/api/native', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'logcat', packageId: pkg.app.packageId }),
        }).then((r) => r.json());
        if (Array.isArray(logRes.logs)) setLogs((prev) => [...prev, ...logRes.logs]);
      }
      setTab('console');
    } catch (e) {
      showToast('Native run: ' + (e as Error).message);
    } finally {
      setBusy(null);
      setBusyAction(false);
    }
  };

  const saveSettings = () => {
    try {
      if (appetizeToken) localStorage.setItem(APPETIZE_KEY, appetizeToken);
      else localStorage.removeItem(APPETIZE_KEY);
    } catch {
      /* ignore */
    }
    setSettingsOpen(false);
    showToast('Settings saved');
  };

  // ---- derived ----
  const errCount = logs.filter((l) => l.level === 'error').length;
  const warnCount = logs.filter((l) => l.level === 'warn').length;
  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).then(
      () => showToast('Copied'),
      () => showToast('Copy failed'),
    );
  };

  const sw = landscape ? device.height : device.width;
  const sh = landscape ? device.width : device.height;

  return (
    <div
      className="app"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      {/* hidden inputs */}
      <input ref={apkInputRef} type="file" accept=".apk,.ipa,.zip,.html" hidden onChange={onApkPicked} />
      <input
        ref={folderInputRef}
        type="file"
        hidden
        onChange={onFolderPicked}
        // @ts-expect-error non-standard but widely supported
        webkitdirectory=""
        directory=""
        multiple
      />

      {/* top bar */}
      <header className="topbar">
        <div className="brand">
          <div className="tile">E</div>
          <div>
            <div className="name">EMulator Studio</div>
            <div className="sub">device test lab</div>
          </div>
        </div>

        <div className="source-field">
          <input
            value={urlInput}
            placeholder="https://your-app.com · PWA / web build URL · localhost:3000"
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadUrl()}
          />
          <button className="btn btn-primary" onClick={loadUrl}>
            Load
          </button>
        </div>

        <button className="btn" onClick={() => apkInputRef.current?.click()}>
          ⤓ APK / IPA
        </button>
        <button className="btn" onClick={() => folderInputRef.current?.click()}>
          ⌥ Web build
        </button>
        <button className="btn" onClick={loadDemo}>
          ◷ Demo
        </button>

        <span className="spacer" />

        <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
          {DEVICES.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <button className="icon-btn" onClick={() => setSettingsOpen(true)} title="Settings">
          ⚙
        </button>
        <button className="icon-btn" onClick={toggleTheme} title="Theme">
          {dark ? '☀' : '☾'}
        </button>
      </header>

      {/* main */}
      <div className="main">
        <div className="stage">
          <div className="toolbar">
            <button className="tbtn" onClick={rotate} title="Rotate">
              ⟳
            </button>
            <button className="tbtn" onClick={reload} disabled={mode !== 'iframe'} title="Reload">
              ↻
            </button>
            <span className="sep" />
            <span className="dim">
              {sw}×{sh}
            </span>
            <span className="dim">{scalePct}%</span>
            <span className="sep" />
            <button
              className="tbtn"
              onClick={screenshot}
              disabled={mode === 'placeholder'}
              title="Screenshot"
            >
              ◉
            </button>
          </div>

          <DeviceFrame
            device={device}
            landscape={landscape}
            mode={mode}
            runUrl={runUrl}
            appetizeKey={appetizeKey}
            iframeRef={iframeRef}
            onScale={setScalePct}
            placeholderTitle={app ? `Native ${app.platform === 'ios' ? 'iOS' : 'Android'} binary` : 'Native binary'}
            placeholderBody={
              app && !app.runnable
                ? `${app.name} is a native ${app.platform} app — browsers can't execute it. Inspect it on the right, or run it on a local emulator / Appetize cloud.`
                : undefined
            }
          />
        </div>

        {/* side panel */}
        <aside className="sidepanel">
          <nav className="tabs">
            {TABS.map((t) => (
              <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
                {t[0].toUpperCase() + t.slice(1)}
                {t === 'console' && (errCount > 0 || warnCount > 0) && (
                  <span className={`badge ${errCount ? 'badge-err' : 'badge-warn'}`}>
                    {errCount || warnCount}
                  </span>
                )}
                {t === 'network' && net.length > 0 && <span className="badge">{net.length}</span>}
              </button>
            ))}
          </nav>

          <div className="pane">
            {tab === 'inspect' && (
              <InspectPane
                app={app}
                hasAppetizeToken={Boolean(appetizeToken)}
                nativeAndroid={nativeAndroid}
                nativeIos={nativeIos}
                onRunCloud={onRunCloud}
                onRunNative={onRunNative}
                busyAction={busyAction}
              />
            )}
            {tab === 'console' && (
              <ConsolePane
                logs={logs}
                filters={filters}
                toggleFilter={(lv) => setFilters((f) => ({ ...f, [lv]: !f[lv] }))}
                onClear={() => setLogs([])}
                onProbe={runProbe}
                probing={probing}
                canProbe={canProbe}
              />
            )}
            {tab === 'network' && <NetworkPane net={net} onClear={() => setNet([])} />}
            {tab === 'report' && (
              <ReportPane
                sections={sections}
                setSection={(k, v) => setSections((s) => ({ ...s, [k]: v }))}
                shots={shots}
                removeShot={(id) => setShots((prev) => prev.filter((s) => s.id !== id))}
                preview={preview}
                onPreview={onPreview}
                onDownloadMd={onDownloadMd}
                onDownloadZip={onDownloadZip}
              />
            )}
            {tab === 'push' && (
              <PushPane
                token={ghToken}
                setToken={setGhToken}
                repo={ghRepo}
                setRepo={setGhRepo}
                branch={ghBranch}
                setBranch={setGhBranch}
                folder={ghFolder}
                setFolder={setGhFolder}
                status={ghStatus}
                resultUrl={ghResultUrl}
                busy={Boolean(busy)}
                onVerify={onVerify}
                onPush={onPush}
                onLoadArtifacts={onLoadArtifacts}
              />
            )}
            {tab === 'help' && <HelpPane onCopy={copy} />}
          </div>
        </aside>
      </div>

      {/* overlays */}
      {busy && (
        <div className="busy">
          <div className="box">
            <div className="spinner" />
            <div>{busy}</div>
          </div>
        </div>
      )}
      {dragOver && <div className="dropzone">Drop .apk / .ipa / .html / build folder to load</div>}
      {toast && <div className="toast">{toast}</div>}

      {artifacts && (
        <div className="modal" onClick={() => setArtifacts(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h3>Pick a build artifact</h3>
            {artifacts.map((a, i) => (
              <button key={i} className="btn" style={{ display: 'block', width: '100%', marginBottom: 8, textAlign: 'left' }} onClick={() => pickArtifact(a)}>
                <strong>{a.name}</strong> · {a.kind} · {a.platform}
                {a.tag ? ` · ${a.tag}` : ''}
              </button>
            ))}
          </div>
        </div>
      )}

      {settingsOpen && (
        <div className="modal" onClick={() => setSettingsOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h3>Settings</h3>
            <div className="field">
              <label>Appetize.io API token (optional — for real native device streaming)</label>
              <input
                type="password"
                value={appetizeToken}
                placeholder="tok_…"
                onChange={(e) => setAppetizeToken(e.target.value)}
              />
              <div className="hint">
                Enables ☁ Run on Appetize cloud for native .apk/.ipa. Stored only in this browser.
              </div>
            </div>
            <div className="btn-row">
              <button className="btn btn-primary" onClick={saveSettings}>
                Save
              </button>
              <button className="btn" onClick={() => setSettingsOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
