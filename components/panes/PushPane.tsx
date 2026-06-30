'use client';

interface Props {
  token: string;
  setToken: (v: string) => void;
  repo: string;
  setRepo: (v: string) => void;
  branch: string;
  setBranch: (v: string) => void;
  folder: string;
  setFolder: (v: string) => void;
  status: { kind: 'ok' | 'err' | 'warn'; text: string } | null;
  resultUrl: string | null;
  busy: boolean;
  onVerify: () => void;
  onPush: () => void;
  onLoadArtifacts: () => void;
}

export default function PushPane({
  token,
  setToken,
  repo,
  setRepo,
  branch,
  setBranch,
  folder,
  setFolder,
  status,
  resultUrl,
  busy,
  onVerify,
  onPush,
  onLoadArtifacts,
}: Props) {
  return (
    <div>
      <div className="field">
        <label>GitHub token</label>
        <input
          type="password"
          value={token}
          placeholder="ghp_… / github_pat_…"
          onChange={(e) => setToken(e.target.value)}
        />
        <div className="hint">
          Fine-grained PAT with <strong>Contents: Read and write</strong> (+ Actions: Read to pull
          build artifacts).{' '}
          <a href="https://github.com/settings/tokens?type=beta" target="_blank" rel="noreferrer">
            Create one →
          </a>
        </div>
      </div>

      <div className="field">
        <label>Repository</label>
        <input value={repo} placeholder="owner/name" onChange={(e) => setRepo(e.target.value)} />
      </div>

      <div className="two-col">
        <div className="field">
          <label>Branch</label>
          <input value={branch} placeholder="main" onChange={(e) => setBranch(e.target.value)} />
        </div>
        <div className="field">
          <label>Folder</label>
          <input value={folder} placeholder="emulator-reports" onChange={(e) => setFolder(e.target.value)} />
        </div>
      </div>

      <div className="btn-row">
        <button className="btn" onClick={onVerify} disabled={busy || !token}>
          Verify token
        </button>
        <button className="btn" onClick={onLoadArtifacts} disabled={busy || !token || !repo}>
          ⤓ Pull build artifact
        </button>
        <button className="btn btn-primary" onClick={onPush} disabled={busy || !token || !repo}>
          ⤴ Push report
        </button>
      </div>

      {status && <div className={`status-line ${status.kind}`}>{status.text}</div>}
      {resultUrl && (
        <div className="status-line ok">
          <a href={resultUrl} target="_blank" rel="noreferrer">
            View on GitHub →
          </a>
        </div>
      )}
    </div>
  );
}
