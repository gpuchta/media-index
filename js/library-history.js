/**
 * Library history dialog: list GitHub commits for the data file, download/restore.
 */

import { CONFIG, GITHUB_TARGET } from './config.js';
import {
  getFileContent,
  listCommitsForPath,
} from './github.js';
import { parseLibraryJson } from './library-diff.js';
import { isAppAlertOpen, showAppAlert } from './alert-dialog.js';
import { t } from './i18n.js';
import { resetDialogScroll } from './progress-console.js';
import {
  downloadJson,
  escapeHtml,
  formatExportFilename,
  isPrimaryActionEnter,
} from './utils.js';
import {
  getGithubTokenOrPrompt,
  requireGithubTarget,
  openGithubDataCommitsView,
} from './github-save.js';

/**
 * @param {{
 *   els: {
 *     historyBackdrop: HTMLElement|null,
 *     historyScroll: HTMLElement|null,
 *     historySubtitle: HTMLElement|null,
 *     historyStatus: HTMLElement|null,
 *     historyList: HTMLElement|null,
 *     historySentinel: HTMLElement|null,
 *     historyLoadMore: HTMLElement|null,
 *     historyEnd: HTMLElement|null,
 *     historyClose: HTMLElement|null,
 *     historyCloseFooter: HTMLElement|null,
 *     historyOpenGithub: HTMLElement|null,
 *     libraryHistoryBtn: HTMLElement|null,
 *   },
 *   closeMenu: () => void,
 *   focusFilterWhenIdle: () => void,
 *   showAppToast: (message: string, opts?: object) => void,
 *   isMetaRefreshRunning: () => boolean,
 *   confirmAndApplyImportedLibrary: (movies: object[], opts: object) => Promise<boolean>,
 * }} opts
 */
export function initLibraryHistory(opts) {
  const {
    els,
    closeMenu,
    focusFilterWhenIdle,
    showAppToast,
    isMetaRefreshRunning,
    confirmAndApplyImportedLibrary,
  } = opts;

  // —— Library history (GitHub commits for data file) ——

  const HISTORY_PAGE_SIZE = 15;

  /**
   * @type {{
   *   page: number,
   *   hasNextPage: boolean,
   *   loading: boolean,
   *   loadingMore: boolean,
   *   commits: object[],
   * }}
   */
  const historyState = {
    page: 0,
    hasNextPage: false,
    loading: false,
    loadingMore: false,
    commits: [],
  };

  /** @type {IntersectionObserver|null} */
  let historySentinelObserver = null;

  function isLibraryHistoryOpen() {
    return Boolean(
      els.historyBackdrop && !els.historyBackdrop.classList.contains('hidden')
    );
  }

  function disconnectHistorySentinel() {
    if (historySentinelObserver) {
      historySentinelObserver.disconnect();
      historySentinelObserver = null;
    }
  }

  /**
   * Watch the bottom sentinel; when it enters the dialog body viewport, fetch more.
   */
  function connectHistorySentinel() {
    disconnectHistorySentinel();
    const root = els.historyScroll;
    const sentinel = els.historySentinel;
    if (!root || !sentinel || typeof IntersectionObserver === 'undefined') {
      return;
    }
    historySentinelObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          maybeLoadMoreHistory();
        }
      },
      {
        root,
        // Start loading a bit before the sentinel is fully visible
        rootMargin: '0px 0px 80px 0px',
        threshold: 0,
      }
    );
    historySentinelObserver.observe(sentinel);
  }

  function setHistoryStatus(message, { error = false } = {}) {
    if (!els.historyStatus) return;
    if (!message) {
      els.historyStatus.hidden = true;
      els.historyStatus.textContent = '';
      els.historyStatus.classList.remove('is-error');
      return;
    }
    els.historyStatus.hidden = false;
    els.historyStatus.textContent = message;
    els.historyStatus.classList.toggle('is-error', !!error);
  }

  /**
   * @param {string|null|undefined} iso
   * @returns {string}
   */
  function formatHistoryDate(iso) {
    if (!iso) return 'Unknown date';
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return String(iso);
      return d.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return String(iso);
    }
  }

  /**
   * @param {string} sha
   * @returns {object|null}
   */
  function findHistoryCommit(sha) {
    const s = String(sha || '').trim();
    return historyState.commits.find((c) => c.sha === s) || null;
  }

  /**
   * @param {object} c — commit from listCommitsForPath
   * @returns {HTMLElement}
   */
  function createHistoryItem(c) {
    const item = document.createElement('div');
    item.className = 'history-item';
    item.setAttribute('role', 'listitem');

    const top = document.createElement('div');
    top.className = 'history-item-top';

    const main = document.createElement('div');
    main.className = 'history-item-main';

    const headline = c.messageHeadline || '(no message)';
    const fullMsg = String(c.message || '').trim();
    const body = fullMsg
      .split(/\r?\n/)
      .slice(1)
      .join('\n')
      .replace(/^\s+/, '')
      .trimEnd();
    const hasDetails = Boolean(body);

    const msg = document.createElement('p');
    msg.className = 'history-item-msg';
    msg.textContent = headline;
    main.appendChild(msg);

    const meta = document.createElement('p');
    meta.className = 'history-item-meta';
    const who = c.authorLogin || c.authorName || 'unknown';
    meta.innerHTML =
      `<span class="history-item-sha">${escapeHtml(c.shortSha || c.sha.slice(0, 7))}</span>` +
      ` · ${escapeHtml(formatHistoryDate(c.date))}` +
      ` · ${escapeHtml(who)}`;
    main.appendChild(meta);

    /** @type {HTMLPreElement|null} */
    let details = null;
    if (hasDetails) {
      details = document.createElement('pre');
      details.className = 'history-item-details';
      details.hidden = true;
      details.textContent = body;

      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'history-item-more';
      toggle.textContent = t('history.showMore');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const open = details.hidden;
        details.hidden = !open;
        toggle.textContent = open ? t('history.showLess') : t('history.showMore');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      });

      main.appendChild(toggle);
    }

    const actions = document.createElement('div');
    actions.className = 'history-item-actions';

    const dl = document.createElement('button');
    dl.type = 'button';
    dl.className = 'btn';
    dl.dataset.historyAction = 'download';
    dl.dataset.sha = c.sha;
    dl.textContent = t('history.download');
    dl.title = t('history.downloadTitle');

    const restore = document.createElement('button');
    restore.type = 'button';
    restore.className = 'btn btn-primary';
    restore.dataset.historyAction = 'restore';
    restore.dataset.sha = c.sha;
    restore.textContent = t('history.restore');
    restore.title = t('history.restoreTitle');

    actions.append(restore, dl);
    top.append(main, actions);
    item.appendChild(top);
    // Full-width details under headline + stacked action buttons
    if (details) item.appendChild(details);
    return item;
  }

  function syncHistoryScrollHints() {
    if (els.historyLoadMore) {
      els.historyLoadMore.hidden = !historyState.loadingMore;
    }
    if (els.historyEnd) {
      const showEnd =
        !historyState.loading &&
        !historyState.loadingMore &&
        historyState.commits.length > 0 &&
        !historyState.hasNextPage;
      els.historyEnd.hidden = !showEnd;
    }
    // Keep sentinel in the layout only while more pages may exist
    if (els.historySentinel) {
      els.historySentinel.hidden =
        historyState.loading ||
        !historyState.hasNextPage ||
        historyState.commits.length === 0;
    }
  }

  /**
   * Full re-render of the commit list (initial load / error / empty).
   */
  function renderHistoryList() {
    const host = els.historyList;
    if (!host) return;
    host.innerHTML = '';

    if (historyState.loading && !historyState.commits.length) {
      host.innerHTML = `<p class="history-empty">${escapeHtml(t('history.loading'))}</p>`;
      syncHistoryScrollHints();
      return;
    }

    if (!historyState.commits.length) {
      host.innerHTML = `<p class="history-empty">${escapeHtml(t('history.none'))}</p>`;
      syncHistoryScrollHints();
      return;
    }

    const frag = document.createDocumentFragment();
    for (const c of historyState.commits) {
      frag.appendChild(createHistoryItem(c));
    }
    host.appendChild(frag);
    syncHistoryScrollHints();
  }

  /**
   * Append newly fetched commits without wiping expanded “Show more” rows.
   * @param {object[]} commits
   */
  function appendHistoryItems(commits) {
    const host = els.historyList;
    if (!host || !commits?.length) return;
    // Drop empty placeholder if present
    const empty = host.querySelector('.history-empty');
    if (empty) empty.remove();
    const frag = document.createDocumentFragment();
    for (const c of commits) {
      frag.appendChild(createHistoryItem(c));
    }
    host.appendChild(frag);
    syncHistoryScrollHints();
  }

  /**
   * Load a history page. Page 1 replaces the list; later pages append.
   * @param {number} page
   * @param {{ append?: boolean }} [opts]
   */
  async function loadLibraryHistoryPage(page, { append = false } = {}) {
    const target = GITHUB_TARGET;
    if (!target) {
      historyState.loading = false;
      historyState.loadingMore = false;
      setHistoryStatus('GitHub target is not configured.', { error: true });
      renderHistoryList();
      return;
    }

    // Append: block if anything is in flight or no more pages.
    // Initial load: allow when openLibraryHistoryDialog already set loading=true.
    if (append) {
      if (historyState.loading || historyState.loadingMore) return;
      if (!historyState.hasNextPage) return;
    } else if (historyState.loadingMore) {
      return;
    }

    const token = await getGithubTokenOrPrompt();
    if (!token) {
      historyState.loading = false;
      historyState.loadingMore = false;
      setHistoryStatus('GitHub API key required to load history.', { error: true });
      renderHistoryList();
      return;
    }

    if (append) {
      historyState.loadingMore = true;
      if (els.historyLoadMore) {
        els.historyLoadMore.textContent = t('history.loadingMore');
      }
      syncHistoryScrollHints();
    } else {
      historyState.loading = true;
      historyState.page = page;
      setHistoryStatus(t('history.loading'));
      // Only re-render the placeholder when the list is still empty
      if (!historyState.commits.length) renderHistoryList();
    }

    try {
      const result = await listCommitsForPath({
        token,
        owner: target.owner,
        repo: target.repo,
        path: target.path,
        sha: target.branch,
        page,
        perPage: HISTORY_PAGE_SIZE,
      });

      if (append) {
        // De-dupe by sha in case of overlap
        const seen = new Set(historyState.commits.map((c) => c.sha));
        const fresh = result.commits.filter((c) => c.sha && !seen.has(c.sha));
        historyState.commits = historyState.commits.concat(fresh);
        historyState.page = result.page;
        historyState.hasNextPage = result.hasNextPage;
        historyState.loadingMore = false;
        appendHistoryItems(fresh);
      } else {
        historyState.commits = result.commits;
        historyState.page = result.page;
        historyState.hasNextPage = result.hasNextPage;
        historyState.loading = false;
        renderHistoryList();
      }

      const n = historyState.commits.length;
      setHistoryStatus(
        n
          ? t('history.showing', {
              n,
              more: historyState.hasNextPage ? t('history.scrollMore') : '',
            })
          : t('history.none')
      );
      // Sentinel may already be visible if the list is short — fill the viewport
      queueMicrotask(() => maybeLoadMoreHistory());
    } catch (err) {
      console.error(err);
      historyState.loading = false;
      historyState.loadingMore = false;
      if (!append) {
        historyState.commits = [];
        historyState.hasNextPage = false;
        setHistoryStatus(err?.message || String(err), { error: true });
        renderHistoryList();
      } else {
        setHistoryStatus(err?.message || String(err), { error: true });
        syncHistoryScrollHints();
      }
    }
  }

  /** Called by the scroll sentinel observer (and short-list fill). */
  function maybeLoadMoreHistory() {
    if (!isLibraryHistoryOpen()) return;
    if (historyState.loading || historyState.loadingMore) return;
    if (!historyState.hasNextPage) return;
    void loadLibraryHistoryPage(historyState.page + 1, { append: true });
  }

  async function openLibraryHistoryDialog() {
    if (!els.historyBackdrop) return;
    if (isMetaRefreshRunning()) {
      await showAppAlert(
        'Wait for the metadata update to finish before browsing history.',
        { title: 'Library history' }
      );
      return;
    }
    const target = await requireGithubTarget();
    if (!target) return;
    const token = await getGithubTokenOrPrompt();
    if (!token) return;

    if (els.historySubtitle) {
      els.historySubtitle.textContent = `${target.owner}/${target.repo} · ${target.branch} · ${target.path}`;
    }
    historyState.page = 0;
    historyState.hasNextPage = false;
    historyState.commits = [];
    historyState.loading = true;
    historyState.loadingMore = false;

    resetDialogScroll(els.historyBackdrop);
    els.historyBackdrop.classList.remove('hidden');
    els.historyBackdrop.setAttribute('aria-hidden', 'false');
    setHistoryStatus(t('history.loading'));
    if (els.historyLoadMore) {
      els.historyLoadMore.hidden = true;
      els.historyLoadMore.textContent = t('history.loadingMore');
    }
    if (els.historyEnd) {
      els.historyEnd.hidden = true;
      els.historyEnd.textContent = t('history.end');
    }
    if (els.historySentinel) els.historySentinel.hidden = true;
    renderHistoryList();
    connectHistorySentinel();
    queueMicrotask(() => {
      resetDialogScroll(els.historyBackdrop);
      els.historyCloseFooter?.focus();
    });

    await loadLibraryHistoryPage(1, { append: false });
  }

  function closeLibraryHistoryDialog() {
    if (!els.historyBackdrop) return;
    disconnectHistorySentinel();
    els.historyBackdrop.classList.add('hidden');
    els.historyBackdrop.setAttribute('aria-hidden', 'true');
    if (els.historyList) els.historyList.innerHTML = '';
    setHistoryStatus('');
    if (els.historyLoadMore) els.historyLoadMore.hidden = true;
    if (els.historyEnd) els.historyEnd.hidden = true;
    if (els.historySentinel) els.historySentinel.hidden = true;
    historyState.loading = false;
    historyState.loadingMore = false;
    historyState.commits = [];
    historyState.hasNextPage = false;
    historyState.page = 0;
    focusFilterWhenIdle();
  }

  /**
   * @param {string} sha
   * @returns {Promise<{ text: string, movies: object[] }|null>}
   */
  async function fetchLibraryAtCommit(sha) {
    const target = GITHUB_TARGET;
    if (!target) {
      await showAppAlert('GitHub target is not configured.', {
        title: 'Library history',
      });
      return null;
    }
    const token = await getGithubTokenOrPrompt();
    if (!token) return null;

    const file = await getFileContent({
      token,
      owner: target.owner,
      repo: target.repo,
      path: target.path,
      ref: sha,
    });
    if (!file.exists) {
      throw new Error('File not found at this commit (removed or path changed).');
    }
    const text = String(file.content ?? '');
    const movies = parseLibraryJson(text);
    if (movies == null) {
      throw new Error('File at this commit is not a valid JSON movie array.');
    }
    return { text, movies };
  }

  /**
   * @param {string} sha
   * @param {HTMLButtonElement} [btn]
   */
  async function downloadHistoryCommit(sha, btn) {
    const commit = findHistoryCommit(sha);
    const short = commit?.shortSha || String(sha).slice(0, 7);
    const prevLabel = btn?.textContent;
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Downloading…';
    }
    try {
      const result = await fetchLibraryAtCommit(sha);
      if (!result) return;
      const datePart = commit?.date
        ? String(commit.date).slice(0, 10)
        : 'unknown-date';
      const base = formatExportFilename(CONFIG.DATA_PATH).replace(/\.json$/i, '');
      downloadJson(`${base}-${datePart}-${short}.json`, result.movies);
      showAppToast(`Downloaded ${short} (${result.movies.length} movies)`);
    } catch (err) {
      console.error(err);
      await showAppAlert(err?.message || String(err), {
        title: 'Download failed',
      });
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = prevLabel || 'Download';
      }
    }
  }

  /**
   * @param {string} sha
   * @param {HTMLButtonElement} [btn]
   */
  async function restoreHistoryCommit(sha, btn) {
    const commit = findHistoryCommit(sha);
    const short = commit?.shortSha || String(sha).slice(0, 7);
    const label =
      commit?.messageHeadline
        ? `${short} — ${commit.messageHeadline}`
        : short;
    const prevLabel = btn?.textContent;
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Loading…';
    }
    try {
      const result = await fetchLibraryAtCommit(sha);
      if (!result) return;
      const applied = await confirmAndApplyImportedLibrary(result.movies, {
        sourceLabel: label,
        title: 'Restore library version',
        okLabel: 'Restore',
        toastPrefix: 'Restored',
      });
      if (applied) {
        closeLibraryHistoryDialog();
      }
    } catch (err) {
      console.error(err);
      await showAppAlert(err?.message || String(err), {
        title: 'Restore failed',
      });
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = prevLabel || 'Restore';
      }
    }
  }

  els.libraryHistoryBtn?.addEventListener('click', () => {
    closeMenu();
    void openLibraryHistoryDialog();
  });

  els.historyClose?.addEventListener('click', () => closeLibraryHistoryDialog());
  els.historyCloseFooter?.addEventListener('click', () => closeLibraryHistoryDialog());
  els.historyBackdrop?.addEventListener('click', (e) => {
    if (e.target === els.historyBackdrop) closeLibraryHistoryDialog();
  });
  els.historyOpenGithub?.addEventListener('click', () => {
    void openGithubDataCommitsView();
  });
  els.historyList?.addEventListener('click', (e) => {
    const btn = e.target.closest?.('button[data-history-action]');
    if (!btn || !els.historyList.contains(btn)) return;
    const sha = btn.dataset.sha || '';
    const action = btn.dataset.historyAction;
    if (!sha || !action) return;
    if (action === 'download') void downloadHistoryCommit(sha, btn);
    else if (action === 'restore') void restoreHistoryCommit(sha, btn);
  });

  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Escape') return;
      if (isAppAlertOpen()) return;
      if (!isLibraryHistoryOpen()) return;
      e.preventDefault();
      e.stopPropagation();
      closeLibraryHistoryDialog();
    },
    true
  );

  document.addEventListener(
    'keydown',
    (e) => {
      if (!isPrimaryActionEnter(e)) return;
      if (isAppAlertOpen()) return;
      if (!isLibraryHistoryOpen()) return;
      e.preventDefault();
      e.stopPropagation();
      closeLibraryHistoryDialog();
    },
    true
  );

  return {
    isLibraryHistoryOpen,
    openLibraryHistoryDialog,
    closeLibraryHistoryDialog,
  };
}
