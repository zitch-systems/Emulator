// GitHub client helpers (browser). Token + repo persist to localStorage exactly
// like the prototype (keys emu.gh.token / emu.gh.repo). All network work is
// proxied through our own /api/github route so the token is only ever sent to
// our same-origin server (never persisted there) and artifact downloads avoid
// cross-origin issues. Port of emu/github.js, extended with artifact fetch.

export interface RepoArtifact {
  kind: 'release' | 'actions';
  name: string;
  platform: 'android' | 'ios' | 'unknown';
  ref: string; // download url or artifact id
  sizeBytes?: number;
  tag?: string;
  updatedAt?: string;
}

export interface PushFile {
  path: string; // path within folder, e.g. report.md or screenshots/x.png
  contentBase64: string;
}

const K_TOKEN = 'emu.gh.token';
const K_REPO = 'emu.gh.repo';

export const ghStore = {
  getToken(): string {
    try {
      return localStorage.getItem(K_TOKEN) || '';
    } catch {
      return '';
    }
  },
  setToken(v: string) {
    try {
      if (v) localStorage.setItem(K_TOKEN, v);
      else localStorage.removeItem(K_TOKEN);
    } catch {
      /* ignore */
    }
  },
  getRepo(): string {
    try {
      return localStorage.getItem(K_REPO) || '';
    } catch {
      return '';
    }
  },
  setRepo(v: string) {
    try {
      if (v) localStorage.setItem(K_REPO, v);
      else localStorage.removeItem(K_REPO);
    } catch {
      /* ignore */
    }
  },
};

async function ghCall<T>(action: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch('/api/github', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, ...body }),
  });
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json.error || `GitHub request failed (${res.status})`);
  return json as T;
}

export function verifyToken(token: string): Promise<{ login: string; scopes: string[] }> {
  return ghCall('verify', { token });
}

export function listArtifacts(token: string, repo: string): Promise<{ artifacts: RepoArtifact[] }> {
  return ghCall('artifacts', { token, repo });
}

/** Returns base64 of the artifact bytes (apk/ipa), unzipping actions artifacts server-side. */
export function fetchArtifact(
  token: string,
  repo: string,
  artifact: RepoArtifact,
): Promise<{ filename: string; base64: string }> {
  return ghCall('fetch', { token, repo, artifact });
}

export function pushReport(args: {
  token: string;
  repo: string;
  branch: string;
  folder: string;
  message: string;
  files: PushFile[];
}): Promise<{ commitUrl: string; htmlUrl: string }> {
  return ghCall('push', args);
}
