/**
 * GitHub REST API — repository Contents
 * Docs: https://docs.github.com/en/rest/repos/contents
 *
 * - GET  /repos/{owner}/{repo}/contents/{path}  — read file
 * - PUT  /repos/{owner}/{repo}/contents/{path}  — create or update (sha required to update)
 *
 * Token is never hard-coded; pass it in or use localStorage helpers.
 */

export const GITHUB_API_BASE = 'https://api.github.com';
/** API version from GitHub REST docs */
export const GITHUB_API_VERSION = '2026-03-10';
export const GITHUB_TOKEN_STORAGE = 'pmi:githubToken';

export function getStoredGithubToken() {
  try {
    return localStorage.getItem(GITHUB_TOKEN_STORAGE) || '';
  } catch {
    return '';
  }
}

export function setStoredGithubToken(token) {
  const t = String(token || '').trim();
  try {
    if (t) localStorage.setItem(GITHUB_TOKEN_STORAGE, t);
    else localStorage.removeItem(GITHUB_TOKEN_STORAGE);
  } catch {
    /* private mode */
  }
  return t;
}

function requireToken(token) {
  const t = String(token || '').trim();
  if (!t) throw new Error('GitHub token is required');
  return t;
}

function requirePathParts({ owner, repo, path }) {
  const o = String(owner || '').trim();
  const r = String(repo || '').trim();
  const p = String(path || '').replace(/^\/+/, '').trim();
  if (!o) throw new Error('GitHub owner is required');
  if (!r) throw new Error('GitHub repo is required');
  if (!p) throw new Error('GitHub file path is required');
  return { owner: o, repo: r, path: p };
}

function apiHeaders(token, extra = {}) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${requireToken(token)}`,
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
    ...extra,
  };
}

function contentsUrl(owner, repo, path, ref) {
  const base = `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
  if (ref) return `${base}?ref=${encodeURIComponent(ref)}`;
  return base;
}

/** UTF-8 string → Base64 (GitHub Contents API requires Base64 content). */
export function encodeGithubContent(text) {
  const bytes = new TextEncoder().encode(String(text ?? ''));
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Git blob SHA-1 for a text file (matches GitHub Contents `sha`).
 * Formula: sha1("blob " + byteLength + "\\0" + utf8Bytes)
 * Used to detect “nothing changed” without relying on full remote content
 * (Contents API may omit body for large files).
 *
 * @param {string} text
 * @returns {Promise<string>} 40-char hex digest
 */
export async function computeGitBlobSha(text) {
  const contentBytes = new TextEncoder().encode(String(text ?? ''));
  const header = new TextEncoder().encode(`blob ${contentBytes.length}\0`);
  const combined = new Uint8Array(header.length + contentBytes.length);
  combined.set(header, 0);
  combined.set(contentBytes, header.length);
  const digest = await crypto.subtle.digest('SHA-1', combined);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Fetch a git blob by SHA (full file body).
 * Contents API omits `content` for large files (encoding "none"); use this instead.
 *
 * GET /repos/{owner}/{repo}/git/blobs/{sha}
 *
 * @param {object} opts
 * @param {string} opts.token
 * @param {string} opts.owner
 * @param {string} opts.repo
 * @param {string} opts.sha — blob SHA from Contents API
 * @returns {Promise<string>} decoded UTF-8 text
 */
export async function getGitBlobContent(opts) {
  const token = requireToken(opts.token);
  const owner = String(opts.owner || '').trim();
  const repo = String(opts.repo || '').trim();
  const sha = String(opts.sha || '').trim();
  if (!owner) throw new Error('GitHub owner is required');
  if (!repo) throw new Error('GitHub repo is required');
  if (!sha) throw new Error('Git blob SHA is required');

  const url = `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/blobs/${encodeURIComponent(sha)}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: apiHeaders(token),
  });
  if (!res.ok) {
    throw new Error(`GitHub get blob failed (${res.status}): ${await parseError(res)}`);
  }
  const data = await res.json();
  if (data.encoding === 'base64' && typeof data.content === 'string') {
    return decodeGithubContent(data.content);
  }
  if (typeof data.content === 'string') return data.content;
  throw new Error('GitHub blob response had no decodable content');
}

/** Base64 (possibly with newlines) → UTF-8 string. */
export function decodeGithubContent(base64) {
  const clean = String(base64 || '').replace(/\n/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

async function parseError(res) {
  let detail = res.statusText || '';
  try {
    const body = await res.json();
    if (body?.message) detail = body.message;
    if (Array.isArray(body?.errors) && body.errors.length) {
      detail += `: ${body.errors.map((e) => e.message || JSON.stringify(e)).join('; ')}`;
    }
  } catch {
    /* ignore */
  }
  return detail;
}

/**
 * GET file contents.
 *
 * @param {object} opts
 * @param {string} opts.token — PAT with repo scope (or fine-grained Contents R/W)
 * @param {string} opts.owner
 * @param {string} opts.repo
 * @param {string} opts.path — file path in the repo
 * @param {string} [opts.ref] — branch, tag, or commit SHA (default: default branch)
 * @returns {Promise<{
 *   exists: boolean,
 *   content?: string,
 *   sha?: string,
 *   name?: string,
 *   path?: string,
 *   size?: number,
 *   encoding?: string,
 *   type?: string,
 *   raw?: object,
 * }>}
 */
export async function getFileContent(opts) {
  const token = requireToken(opts.token);
  const { owner, repo, path } = requirePathParts(opts);
  const url = contentsUrl(owner, repo, path, opts.ref);

  const res = await fetch(url, {
    method: 'GET',
    headers: apiHeaders(token),
  });

  if (res.status === 404) {
    return { exists: false };
  }

  if (!res.ok) {
    throw new Error(`GitHub get contents failed (${res.status}): ${await parseError(res)}`);
  }

  const data = await res.json();

  // Directory listing is an array — not a single file
  if (Array.isArray(data)) {
    throw new Error(`GitHub path "${path}" is a directory, not a file`);
  }

  if (data.type && data.type !== 'file') {
    throw new Error(`GitHub path "${path}" is type "${data.type}", expected file`);
  }

  let content = '';
  if (data.encoding === 'base64' && typeof data.content === 'string' && data.content.trim()) {
    content = decodeGithubContent(data.content);
  } else if (typeof data.content === 'string' && data.content.trim()) {
    // encoding "none" or other — only use if GitHub actually returned a body
    content = data.content;
  }

  // Large files: Contents API returns encoding "none" and empty content.
  // Fetch the blob by SHA so callers can diff / parse the full library.
  if (!content && data.sha) {
    content = await getGitBlobContent({
      token,
      owner,
      repo,
      sha: data.sha,
    });
  }

  return {
    exists: true,
    content,
    sha: data.sha,
    name: data.name,
    path: data.path,
    size: data.size,
    encoding: data.encoding,
    type: data.type,
    raw: data,
  };
}

/**
 * PUT create or update file contents.
 * For updates, `sha` of the existing blob is required.
 *
 * @param {object} opts
 * @param {string} opts.token
 * @param {string} opts.owner
 * @param {string} opts.repo
 * @param {string} opts.path
 * @param {string} opts.content — plain text (will be Base64-encoded)
 * @param {string} opts.message — commit message
 * @param {string} [opts.sha] — required when updating an existing file
 * @param {string} [opts.branch]
 * @param {{ name: string, email: string }} [opts.committer]
 * @param {{ name: string, email: string }} [opts.author]
 * @returns {Promise<{ created: boolean, content: object|null, commit: object, raw: object }>}
 */
export async function putFileContent(opts) {
  const token = requireToken(opts.token);
  const { owner, repo, path } = requirePathParts(opts);
  const message = String(opts.message || '').trim();
  if (!message) throw new Error('Commit message is required');

  const body = {
    message,
    content: encodeGithubContent(opts.content ?? ''),
  };
  if (opts.sha) body.sha = opts.sha;
  if (opts.branch) body.branch = opts.branch;
  if (opts.committer?.name && opts.committer?.email) {
    body.committer = {
      name: opts.committer.name,
      email: opts.committer.email,
    };
  }
  if (opts.author?.name && opts.author?.email) {
    body.author = {
      name: opts.author.name,
      email: opts.author.email,
    };
  }

  const url = contentsUrl(owner, repo, path);
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      ...apiHeaders(token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(
      `GitHub ${opts.sha ? 'update' : 'create'} contents failed (${res.status}): ${await parseError(res)}`
    );
  }

  const data = await res.json();
  return {
    created: res.status === 201,
    content: data.content ?? null,
    commit: data.commit,
    raw: data,
  };
}

/**
 * Create the file if missing, otherwise update it (fetches current SHA when needed).
 *
 * @param {object} opts — same as putFileContent, plus optional ref for GET
 * @param {string} [opts.createMessage] — commit message when creating (default: opts.message)
 * @param {string} [opts.updateMessage] — commit message when updating (default: opts.message)
 * @returns {Promise<{ created: boolean, content: object|null, commit: object, raw: object, previousSha?: string }>}
 */
export async function upsertFileContent(opts) {
  const { owner, repo, path } = requirePathParts(opts);
  const existing = await getFileContent({
    token: opts.token,
    owner,
    repo,
    path,
    ref: opts.ref || opts.branch,
  });

  if (existing.exists) {
    const result = await putFileContent({
      ...opts,
      message: opts.updateMessage || opts.message || `Update ${path}`,
      sha: existing.sha,
    });
    return { ...result, created: false, previousSha: existing.sha };
  }

  const result = await putFileContent({
    ...opts,
    message: opts.createMessage || opts.message || `Create ${path}`,
    sha: undefined,
  });
  return { ...result, created: true };
}

/**
 * Resolve the authenticated GitHub username (login) for the given token.
 * @param {string} token
 * @returns {Promise<string>}
 */
export async function getAuthenticatedLogin(token) {
  const res = await fetch(`${GITHUB_API_BASE}/user`, {
    method: 'GET',
    headers: apiHeaders(token),
  });
  if (!res.ok) {
    throw new Error(`GitHub auth failed (${res.status}): ${await parseError(res)}`);
  }
  const data = await res.json();
  const login = String(data?.login || '').trim();
  if (!login) throw new Error('GitHub token did not return a user login');
  return login;
}

/**
 * Parse a GitHub data-file commits URL into owner/repo/branch/path and derived links.
 *
 * Expected shape:
 *   https://github.com/{owner}/{repo}/commits/{branch}/{path}
 * e.g.
 *   https://github.com/gpuchta/media-index/commits/main/data/media-index.json
 *
 * @param {string} url
 * @returns {{
 *   owner: string,
 *   repo: string,
 *   branch: string,
 *   path: string,
 *   commitsUrl: string,
 *   deploymentUrl: string,
 * } | null}
 */
export function parseGithubDataCommitsUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return null;

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
  if (host !== 'github.com') return null;

  // pathname: /{owner}/{repo}/commits/{branch}/{path...}
  const parts = parsed.pathname.split('/').filter(Boolean);
  if (parts.length < 5) return null;
  if (parts[2].toLowerCase() !== 'commits') return null;

  const owner = decodeURIComponent(parts[0]);
  const repo = decodeURIComponent(parts[1]);
  const branch = decodeURIComponent(parts[3]);
  const path = parts
    .slice(4)
    .map((s) => decodeURIComponent(s))
    .join('/')
    .replace(/^\/+/, '');

  if (!owner || !repo || !branch || !path) return null;

  const commitsUrl = `https://github.com/${owner}/${repo}/commits/${branch}/${path}`;
  const deploymentUrl = `https://github.com/${owner}/${repo}/actions/`;

  return { owner, repo, branch, path, commitsUrl, deploymentUrl };
}
