// Shared domain types for EMulator Studio.
// These are the contracts every module and API route agree on.

export type Platform = 'android' | 'ios' | 'web' | 'unknown';

export type SourceKind =
  | 'url' // remote PWA / web build URL (iframe)
  | 'build' // uploaded web build (folder or zip) run via blob bridge
  | 'apk' // Android package (inspect; run if hybrid)
  | 'ipa' // iOS package (inspect; run if hybrid)
  | 'demo' // bundled Capacitor sample
  | 'appetize' // streamed real device (cloud)
  | 'native' // streamed real device (local SDK orchestrator)
  | 'none';

export type LogLevel = 'log' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  ts: number;
  /** where the entry came from: console | error | unhandledrejection | device | network */
  origin?: string;
  stack?: string;
}

export interface NetEntry {
  method: string;
  url: string;
  status: number;
  ms: number;
  ts: number;
  ok: boolean;
  error?: string;
}

/** Result of inspecting a native package (.apk / .ipa) or a web build. */
export interface AppInfo {
  platform: Platform;
  name: string;
  /** android applicationId / ios CFBundleIdentifier */
  packageId?: string;
  /** versionName / CFBundleShortVersionString */
  version?: string;
  /** versionCode / CFBundleVersion */
  build?: string;
  minSdk?: string;
  targetSdk?: string;
  minOS?: string;
  deviceFamily?: string[];
  abis?: string[];
  permissions?: string[];
  /** detected frameworks: Flutter, React Native, Unity, Capacitor, Cordova, Native */
  frameworks: string[];
  /** hybrid web app we can actually run in an iframe */
  runnable: boolean;
  /** path of the web root inside the package, if hybrid */
  hybridRoot?: string;
  iconDataUrl?: string;
  sizeBytes?: number;
  /** "APK" | "IPA" | "Web build" */
  fileType?: string;
  fileCount?: number;
  /** largest top-level directories, for the contents bar chart */
  dirSizes?: { name: string; bytes: number }[];
  notes: string[];
}

export interface DevicePreset {
  id: string;
  name: string;
  platform: 'ios' | 'android';
  /** logical CSS px in portrait */
  width: number;
  height: number;
  dpr: number;
  /** screen corner radius in px */
  radius: number;
  /** cutout style drawn over the screen */
  notch: 'island' | 'punch' | 'home' | 'seam' | 'none';
  /** bezel thickness in px */
  bezel: number;
  /** user-agent string used when emulating this device */
  ua: string;
  /** Appetize.io device id for cloud streaming */
  appetizeDevice?: string;
}

/** A captured screenshot kept in the report strip. */
export interface Shot {
  id: string;
  dataUrl: string;
  label: string;
  ts: number;
}

export interface ReportSections {
  metadata: boolean;
  permissions: boolean;
  contents: boolean;
  errors: boolean;
  fullConsole: boolean;
  network: boolean;
  screenshots: boolean;
}

export interface ReportInput {
  app: AppInfo | null;
  source: { kind: SourceKind; ref: string };
  device: DevicePreset;
  logs: LogEntry[];
  net: NetEntry[];
  shots: Shot[];
  sections: ReportSections;
  generatedAt: number;
}

/** Server probe result: headless device emulation of any URL via Playwright. */
export interface ProbeResult {
  ok: boolean;
  url: string;
  device: string;
  status?: number;
  title?: string;
  logs: LogEntry[];
  net: NetEntry[];
  screenshotDataUrl?: string;
  durationMs: number;
  error?: string;
}
