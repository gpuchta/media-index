/**
 * GitHub library save and target helpers (token prompt, commits/deploy links).
 */

import { GITHUB_TARGET } from './config.js';
import {
  computeGitBlobSha,
  getFileContent,
  getStoredGithubToken,
  putFileContent,
} from './github.js';
import {
  diffLibraries,
  formatLibraryCommitMessage,
  parseLibraryJson,
} from './library-diff.js';
import { showAppAlert } from './alert-dialog.js';

/**
 * @returns {Promise<string>} token or empty string if missing
 */
export async function getGithubTokenOrPrompt() {
  const token = getStoredGithubToken();
  if (!token) {
    await showAppAlert(
      'No GitHub API key stored. Open Menu → Configuration → Settings, enter your GitHub API key, and Save.',
      { title: 'GitHub API key' }
    );
    return '';
  }
  return token;
}

/**
 * Require a valid GITHUB_DATA_COMMITS_URL parse result.
 * @returns {Promise<typeof GITHUB_TARGET>}
 */
export async function requireGithubTarget() {
  if (!GITHUB_TARGET) {
    await showAppAlert(
      'GitHub target is not configured or invalid.\n\n' +
        'In js/config.js set GITHUB_DATA_COMMITS_URL to your data file’s commits page, e.g.\n' +
        'https://github.com/YOUR_USER/YOUR_REPO/commits/main/data/media-index.json\n\n' +
        'See docs/README.md (Configure your fork).',
      { title: 'GitHub configuration' }
    );
    return null;
  }
  return GITHUB_TARGET;
}

/** Open GitHub commit history for the library data file in a new tab. */
export async function openGithubDataCommitsView() {
  const target = await requireGithubTarget();
  if (!target) return;
  window.open(target.commitsUrl, '_blank', 'noopener,noreferrer');
}

/** Open GitHub Actions (deployments) in a new tab. */
export async function openGithubDeploymentView() {
  const target = await requireGithubTarget();
  if (!target) return;
  window.open(target.deploymentUrl, '_blank', 'noopener,noreferrer');
}

/**
 * @param {{
 *   saveJsonBtn: HTMLElement|null,
 *   getMovies: () => object[],
 *   setDirty: (v: boolean) => void,
 *   openSaveProgressDialog: () => void,
 *   appendSaveLog: (message: string, opts?: { level?: string }) => void,
 *   appendSaveLogMessage: (text: string) => void,
 * }} opts
 */
export function initGithubSave(opts) {
  const {
    saveJsonBtn,
    getMovies,
    setDirty,
    openSaveProgressDialog,
    appendSaveLog,
    appendSaveLogMessage,
  } = opts;

  /** Guard against double-clicks while a remote save is in flight. */
  let saveJsonInFlight = false;

  /**
   * Upsert the full in-memory library to GitHub (Contents API).
   * Target owner/repo/path come from CONFIG.GITHUB_DATA_COMMITS_URL.
   * Progress is written to the Save progress dialog console.
   * Commit message lists movie changes (truncated); console shows the full list.
   */
  async function saveJsonToGithub() {
    if (saveJsonInFlight) return;

    const token = await getGithubTokenOrPrompt();
    if (!token) return;

    const target = await requireGithubTarget();
    if (!target) return;

    const { owner, repo, path, branch } = target;
    const movies = getMovies();

    saveJsonInFlight = true;
    if (saveJsonBtn) saveJsonBtn.disabled = true;
    openSaveProgressDialog();

    try {
      appendSaveLog('Starting GitHub save…');
      appendSaveLog(`Movies in library: ${movies.length}`);
      appendSaveLog(`From commits URL (branch ${branch} for history links)`);
      appendSaveLog(`Target: ${owner}/${repo}/${path}`);
      appendSaveLog('Serializing library JSON…');
      const content = JSON.stringify(movies, null, 2);
      const bytes = new TextEncoder().encode(content).length;
      appendSaveLog(`Payload: ${content.length} chars (~${bytes} bytes)`);

      appendSaveLog('Checking remote file…');
      const existing = await getFileContent({ token, owner, repo, path });

      /** @type {object[]} */
      let remoteMovies = [];
      let isCreate = false;

      if (existing.exists) {
        const shaShort = existing.sha
          ? `${existing.sha.slice(0, 7)}…`
          : '(unknown)';
        appendSaveLog(`Remote file exists (sha ${shaShort}).`);

        // Skip PUT when local payload matches the remote blob (no empty commit).
        if (existing.sha) {
          appendSaveLog('Comparing local payload to remote…');
          const localSha = await computeGitBlobSha(content);
          if (localSha === existing.sha) {
            appendSaveLog(
              `No changes detected (sha ${localSha.slice(0, 7)}… matches remote). Skipping commit.`
            );
            setDirty(false);
            appendSaveLog(`Done. ${owner}/${repo}/${path}`);
            return;
          }
          appendSaveLog(
            `Local differs from remote (local ${localSha.slice(0, 7)}… ≠ remote ${shaShort}).`
          );
        }

        const parsed = parseLibraryJson(existing.content);
        if (parsed == null) {
          appendSaveLog(
            'Warning: remote file is not a JSON array; treating remote as empty for the change summary.'
          );
          remoteMovies = [];
        } else {
          remoteMovies = parsed;
          appendSaveLog(`Remote library: ${remoteMovies.length} movie(s).`);
        }
      } else {
        isCreate = true;
        appendSaveLog('Remote file not found; will create.');
        remoteMovies = [];
      }

      const diff = diffLibraries(remoteMovies, movies);
      const fullMessage = formatLibraryCommitMessage(diff, {
        create: isCreate,
        maxPerSection: Infinity,
      });
      const commitMessage = formatLibraryCommitMessage(diff, {
        create: isCreate,
        // Truncate each of Added / Removed / Changed independently
        maxPerSection: 15,
      });

      appendSaveLog('Change summary (full):');
      appendSaveLogMessage(fullMessage);
      appendSaveLog('Commit message (truncated for GitHub):');
      appendSaveLogMessage(commitMessage);

      if (existing.exists) {
        appendSaveLog('Uploading update…');
        await putFileContent({
          token,
          owner,
          repo,
          path,
          content,
          sha: existing.sha,
          message: commitMessage,
        });
        appendSaveLog('File updated successfully.');
      } else {
        appendSaveLog('Uploading create…');
        await putFileContent({
          token,
          owner,
          repo,
          path,
          content,
          message: commitMessage,
        });
        appendSaveLog('File created successfully.');
      }

      setDirty(false);
      appendSaveLog(`Done. ${owner}/${repo}/${path}`);
    } catch (err) {
      const msg = err?.message || String(err);
      appendSaveLog(`ERROR: ${msg}`, { level: 'error' });
    } finally {
      saveJsonInFlight = false;
      if (saveJsonBtn) saveJsonBtn.disabled = false;
      appendSaveLog('Finished.');
    }
  }

  return {
    saveJsonToGithub,
    isSaveInFlight: () => saveJsonInFlight,
  };
}
