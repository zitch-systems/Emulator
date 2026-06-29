/* EMulator Studio — GitHub push via REST contents API (fine-grained PAT, browser CORS). */
(function (global) {
  'use strict';
  const API = 'https://api.github.com';
  const LS_TOKEN = 'emu.gh.token';
  const LS_REPO = 'emu.gh.repo';

  function getToken() { try { return localStorage.getItem(LS_TOKEN) || ''; } catch (e) { return ''; } }
  function setToken(t) { try { t ? localStorage.setItem(LS_TOKEN, t) : localStorage.removeItem(LS_TOKEN); } catch (e) {} }
  function getRepo() { try { return localStorage.getItem(LS_REPO) || ''; } catch (e) { return ''; } }
  function setRepo(r) { try { r ? localStorage.setItem(LS_REPO, r) : localStorage.removeItem(LS_REPO); } catch (e) {} }

  function parseRepo(input) {
    if (!input) return null;
    let s = input.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/, '').replace(/\/$/, '');
    const m = s.match(/^([^/]+)\/([^/]+)/);
    return m ? { owner: m[1], repo: m[2] } : null;
  }

  function headers(token) {
    return { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  }

  async function getUser(token) {
    const res = await fetch(API + '/user', { headers: headers(token) });
    if (!res.ok) throw new Error('Token check failed (' + res.status + ')');
    return res.json();
  }

  async function getDefaultBranch(token, owner, repo) {
    const res = await fetch(API + '/repos/' + owner + '/' + repo, { headers: headers(token) });
    if (!res.ok) throw new Error('Repo not found or no access (' + res.status + ')');
    return (await res.json()).default_branch || 'main';
  }

  async function blobToBase64(blob) {
    const buf = new Uint8Array(await blob.arrayBuffer());
    let bin = ''; const chunk = 0x8000;
    for (let i = 0; i < buf.length; i += chunk) bin += String.fromCharCode.apply(null, buf.subarray(i, i + chunk));
    return btoa(bin);
  }
  function textToBase64(text) {
    const u8 = new TextEncoder().encode(text); let bin = ''; const chunk = 0x8000;
    for (let i = 0; i < u8.length; i += chunk) bin += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
    return btoa(bin);
  }

  async function putFile(token, owner, repo, branch, path, base64, message) {
    // get existing sha (if any)
    let sha;
    try {
      const head = await fetch(API + '/repos/' + owner + '/' + repo + '/contents/' + encodeURI(path) + '?ref=' + branch, { headers: headers(token) });
      if (head.ok) sha = (await head.json()).sha;
    } catch (e) {}
    const body = { message, content: base64, branch };
    if (sha) body.sha = sha;
    const res = await fetch(API + '/repos/' + owner + '/' + repo + '/contents/' + encodeURI(path), {
      method: 'PUT', headers: headers(token), body: JSON.stringify(body),
    });
    if (!res.ok) { const t = await res.text(); throw new Error('PUT ' + path + ' failed (' + res.status + '): ' + t.slice(0, 200)); }
    return res.json();
  }

  // files: [{ path, text } | { path, blob }]
  async function push({ token, owner, repo, branch, message, files, onProgress }) {
    if (!token) throw new Error('No GitHub token set');
    branch = branch || await getDefaultBranch(token, owner, repo);
    const results = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const b64 = f.text != null ? textToBase64(f.text) : await blobToBase64(f.blob);
      onProgress && onProgress(i + 1, files.length, f.path);
      const out = await putFile(token, owner, repo, branch, f.path, b64, message || 'Add EMulator report');
      results.push({ path: f.path, url: out.content && out.content.html_url });
    }
    return { branch, results };
  }

  global.EMU = global.EMU || {};
  global.EMU.github = { getToken, setToken, getRepo, setRepo, parseRepo, getUser, getDefaultBranch, push };
})(window);
