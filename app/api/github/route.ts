// POST /api/github — token-scoped GitHub operations, proxied server-side so the
// user's PAT never leaves our same-origin server and is never persisted.
// actions: verify | artifacts | fetch | push
//
// Auth: fine-grained PAT with Contents: read+write (+ Actions: read to pull
// CI artifacts), or a classic token with `repo` scope.

import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import type { RepoArtifact, PushFile } from '@/lib/emu/github';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 90;

const API = 'https://api.github.com';

function gh(token: string, extra: Record<string, string> = {}) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'EMulator-Studio',
    ...extra,
  };
}

function err(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: NextRequest) {
  let action = '';
  try {
    const body = await req.json();
    action = String(body.action || '');
    const token = String(body.token || '');
    if (!token) return err('Missing GitHub token', 401);

    switch (action) {
      case 'verify':
        return await verify(token);
      case 'artifacts':
        return await artifacts(token, String(body.repo || ''));
      case 'fetch':
        return await fetchArtifact(token, String(body.repo || ''), body.artifact as RepoArtifact);
      case 'push':
        return await push(token, body);
      default:
        return err('Unknown action: ' + action);
    }
  } catch (e) {
    return err(`GitHub ${action} failed: ${(e as Error).message}`, 500);
  }
}

async function verify(token: string) {
  const res = await fetch(`${API}/user`, { headers: gh(token) });
  if (!res.ok) return err(`Token rejected (${res.status})`, 401);
  const user = await res.json();
  const scopes = (res.headers.get('x-oauth-scopes') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return NextResponse.json({ login: user.login, scopes });
}

function platformFromName(name: string): RepoArtifact['platform'] {
  if (/\.apk$/i.test(name) || /android/i.test(name)) return 'android';
  if (/\.ipa$/i.test(name) || /ios|iphone/i.test(name)) return 'ios';
  return 'unknown';
}

async function artifacts(token: string, repo: string) {
  if (!/^[^/]+\/[^/]+$/.test(repo)) return err('Repository must be "owner/name"');
  const out: RepoArtifact[] = [];

  // Latest release assets.
  const relRes = await fetch(`${API}/repos/${repo}/releases?per_page=5`, { headers: gh(token) });
  if (relRes.ok) {
    const releases = await relRes.json();
    for (const rel of releases) {
      for (const a of rel.assets || []) {
        if (/\.(apk|ipa)$/i.test(a.name)) {
          out.push({
            kind: 'release',
            name: a.name,
            platform: platformFromName(a.name),
            ref: a.url, // API asset url (works for private repos)
            sizeBytes: a.size,
            tag: rel.tag_name,
            updatedAt: a.updated_at,
          });
        }
      }
    }
  }

  // Latest Actions artifacts (zip-wrapped).
  const artRes = await fetch(`${API}/repos/${repo}/actions/artifacts?per_page=30`, {
    headers: gh(token),
  });
  if (artRes.ok) {
    const data = await artRes.json();
    for (const a of data.artifacts || []) {
      if (a.expired) continue;
      out.push({
        kind: 'actions',
        name: a.name + '.zip',
        platform: platformFromName(a.name),
        ref: String(a.id),
        sizeBytes: a.size_in_bytes,
        updatedAt: a.updated_at,
      });
    }
  }

  return NextResponse.json({ artifacts: out });
}

async function fetchArtifact(token: string, repo: string, artifact: RepoArtifact) {
  if (!artifact) return err('Missing artifact');

  if (artifact.kind === 'release') {
    const res = await fetch(artifact.ref, {
      headers: gh(token, { Accept: 'application/octet-stream' }),
      redirect: 'follow',
    });
    if (!res.ok) return err(`Asset download failed (${res.status})`, 502);
    const buf = Buffer.from(await res.arrayBuffer());
    return NextResponse.json({ filename: artifact.name, base64: buf.toString('base64') });
  }

  // actions artifact -> download zip, extract the first .apk/.ipa inside.
  const zipRes = await fetch(`${API}/repos/${repo}/actions/artifacts/${artifact.ref}/zip`, {
    headers: gh(token),
    redirect: 'follow',
  });
  if (!zipRes.ok) return err(`Artifact download failed (${zipRes.status})`, 502);
  const zip = await JSZip.loadAsync(Buffer.from(await zipRes.arrayBuffer()));
  const inner = Object.keys(zip.files).find((n) => /\.(apk|ipa)$/i.test(n));
  if (!inner) return err('No .apk/.ipa found inside the Actions artifact zip', 422);
  const bytes = await zip.file(inner)!.async('nodebuffer');
  return NextResponse.json({
    filename: inner.split('/').pop() || inner,
    base64: bytes.toString('base64'),
  });
}

async function push(token: string, body: Record<string, unknown>) {
  const repo = String(body.repo || '');
  const branch = String(body.branch || 'main');
  const folder = String(body.folder || 'emulator-reports').replace(/^\/+|\/+$/g, '');
  const message = String(body.message || 'Add EMulator Studio report');
  const files = (body.files as PushFile[]) || [];
  if (!/^[^/]+\/[^/]+$/.test(repo)) return err('Repository must be "owner/name"');
  if (!files.length) return err('No files to push');

  // Resolve the branch head (create the branch from the default if missing).
  let baseSha: string;
  const refRes = await fetch(`${API}/repos/${repo}/git/ref/heads/${branch}`, { headers: gh(token) });
  let branchExists = refRes.ok;
  if (refRes.ok) {
    baseSha = (await refRes.json()).object.sha;
  } else {
    const repoRes = await fetch(`${API}/repos/${repo}`, { headers: gh(token) });
    if (!repoRes.ok) return err(`Repo not found or no access (${repoRes.status})`, 404);
    const def = (await repoRes.json()).default_branch;
    const defRef = await fetch(`${API}/repos/${repo}/git/ref/heads/${def}`, { headers: gh(token) });
    if (!defRef.ok) return err(`Could not resolve default branch (${defRef.status})`, 502);
    baseSha = (await defRef.json()).object.sha;
  }

  // Base tree from the base commit.
  const commitRes = await fetch(`${API}/repos/${repo}/git/commits/${baseSha}`, { headers: gh(token) });
  if (!commitRes.ok) return err(`Could not read base commit (${commitRes.status})`, 502);
  const baseTree = (await commitRes.json()).tree.sha;

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const prefix = `${folder}/${stamp}`;

  // Create a blob per file.
  const tree: { path: string; mode: '100644'; type: 'blob'; sha: string }[] = [];
  for (const f of files) {
    const blobRes = await fetch(`${API}/repos/${repo}/git/blobs`, {
      method: 'POST',
      headers: gh(token),
      body: JSON.stringify({ content: f.contentBase64, encoding: 'base64' }),
    });
    if (!blobRes.ok) return err(`Blob create failed (${blobRes.status})`, 502);
    const sha = (await blobRes.json()).sha;
    tree.push({ path: `${prefix}/${f.path}`, mode: '100644', type: 'blob', sha });
  }

  // New tree -> new commit -> move the ref.
  const treeRes = await fetch(`${API}/repos/${repo}/git/trees`, {
    method: 'POST',
    headers: gh(token),
    body: JSON.stringify({ base_tree: baseTree, tree }),
  });
  if (!treeRes.ok) return err(`Tree create failed (${treeRes.status})`, 502);
  const newTree = (await treeRes.json()).sha;

  const newCommitRes = await fetch(`${API}/repos/${repo}/git/commits`, {
    method: 'POST',
    headers: gh(token),
    body: JSON.stringify({ message, tree: newTree, parents: [baseSha] }),
  });
  if (!newCommitRes.ok) return err(`Commit create failed (${newCommitRes.status})`, 502);
  const newCommit = await newCommitRes.json();

  const refUrl = `${API}/repos/${repo}/git/refs/heads/${branch}`;
  const moveRes = await fetch(branchExists ? refUrl : `${API}/repos/${repo}/git/refs`, {
    method: branchExists ? 'PATCH' : 'POST',
    headers: gh(token),
    body: JSON.stringify(
      branchExists ? { sha: newCommit.sha } : { ref: `refs/heads/${branch}`, sha: newCommit.sha },
    ),
  });
  if (!moveRes.ok) return err(`Ref update failed (${moveRes.status})`, 502);

  return NextResponse.json({
    commitUrl: newCommit.html_url,
    htmlUrl: `https://github.com/${repo}/tree/${branch}/${prefix}`,
  });
}
