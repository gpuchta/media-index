/**
 * Bulk and single-movie TMDB metadata refresh UI + jobs.
 */

import { getStoredBulkMetaConfirm2 } from './config.js';
import {
  applyMergedMovieInPlace,
  getMovieById,
  getStoredTmdbApiKey,
  mergeLibraryMovieFromTmdb,
} from './tmdb.js';
import { isAppAlertOpen, showAppAlert, showAppConfirm } from './alert-dialog.js';
import { t } from './i18n.js';
import { resetDialogScroll } from './progress-console.js';
import { isPrimaryActionEnter } from './utils.js';
import { showAppToast } from './app-toast.js';

/**
 * @param {{
 *   els: Record<string, HTMLElement|null>,
 *   closeMenu: () => void,
 *   focusFilterWhenIdle: () => void,
 *   getMovies: () => object[],
 *   isDataReady: () => boolean,
 *   setDirty: (v: boolean) => void,
 *   refreshLibraryAfterMutation: () => void,
 *   dialog: {
 *     isOpen: () => boolean,
 *     movie: object|null,
 *     open: (m: object) => void,
 *     applyDraftPreserveFieldsToMovie: () => void,
 *     setMetadataUpdateBusy: (busy: boolean) => void,
 *   },
 * }} opts
 */
export function initMetaRefresh(opts) {
  const {
    els,
    closeMenu,
    focusFilterWhenIdle,
    getMovies,
    isDataReady,
    setDirty,
    refreshLibraryAfterMutation,
    dialog,
  } = opts;

  // —— Bulk metadata refresh (TMDB) ——

  /** @type {{ running: boolean, cancelRequested: boolean }} */
  const metaRefreshJob = {
    running: false,
    cancelRequested: false,
  };

  function isMetaRefreshOpen() {
    return Boolean(
      els.metaRefreshBackdrop && !els.metaRefreshBackdrop.classList.contains('hidden')
    );
  }

  function openMetaRefreshDialog() {
    if (!els.metaRefreshBackdrop) return;
    if (els.metaRefreshRunning) els.metaRefreshRunning.hidden = false;
    if (els.metaRefreshDone) els.metaRefreshDone.hidden = true;
    if (els.metaRefreshBar) els.metaRefreshBar.style.width = '0%';
    if (els.metaRefreshProgressbar) {
      els.metaRefreshProgressbar.setAttribute('aria-valuenow', '0');
    }
    if (els.metaRefreshCount) {
      els.metaRefreshCount.textContent = t('refresh.refreshing', { index: 0, total: 0 });
    }
    if (els.metaRefreshPct) els.metaRefreshPct.textContent = '0%';
    if (els.metaRefreshMovie) els.metaRefreshMovie.textContent = '—';
    if (els.metaRefreshStatus) els.metaRefreshStatus.textContent = t('refresh.preparing');
    if (els.metaRefreshDoneFailed) {
      els.metaRefreshDoneFailed.hidden = true;
      els.metaRefreshDoneFailed.textContent = '';
    }
    if (els.metaRefreshFailures) els.metaRefreshFailures.hidden = true;
    if (els.metaRefreshFailureList) els.metaRefreshFailureList.innerHTML = '';
    if (els.metaRefreshCancel) {
      els.metaRefreshCancel.disabled = false;
      els.metaRefreshCancel.hidden = false;
    }
    if (els.metaRefreshClose) els.metaRefreshClose.disabled = true;
    resetDialogScroll(els.metaRefreshBackdrop);
    els.metaRefreshBackdrop.classList.remove('hidden');
    els.metaRefreshBackdrop.setAttribute('aria-hidden', 'false');
    queueMicrotask(() => {
      resetDialogScroll(els.metaRefreshBackdrop);
      els.metaRefreshCancel?.focus();
    });
  }

  function closeMetaRefreshDialog() {
    if (!els.metaRefreshBackdrop) return;
    if (metaRefreshJob.running) {
      metaRefreshJob.cancelRequested = true;
      return;
    }
    els.metaRefreshBackdrop.classList.add('hidden');
    els.metaRefreshBackdrop.setAttribute('aria-hidden', 'true');
    focusFilterWhenIdle();
  }

  /**
   * @param {{ index: number, total: number, title: string, status: string }} p
   */
  function updateMetaRefreshProgress({ index, total, title, status }) {
    const pct = total > 0 ? Math.min(100, Math.round((index / total) * 100)) : 0;
    if (els.metaRefreshBar) els.metaRefreshBar.style.width = `${pct}%`;
    if (els.metaRefreshProgressbar) {
      els.metaRefreshProgressbar.setAttribute('aria-valuenow', String(pct));
    }
    if (els.metaRefreshCount) {
      els.metaRefreshCount.textContent =
        total > 0
          ? t('refresh.refreshing', { index, total })
          : t('refresh.refreshingEllipsis');
    }
    if (els.metaRefreshPct) els.metaRefreshPct.textContent = `${pct}%`;
    if (els.metaRefreshMovie) {
      els.metaRefreshMovie.textContent = title || '—';
    }
    if (els.metaRefreshStatus) {
      els.metaRefreshStatus.textContent = status || '';
    }
  }

  /**
   * @param {{
   *   ok: number,
   *   failed: number,
   *   total: number,
   *   cancelled: boolean,
   *   failures: { title: string, reason: string, warn?: boolean }[],
   * }} result
   */
  function showMetaRefreshDone(result) {
    const { ok, failed, total, cancelled, failures } = result;
    if (els.metaRefreshRunning) els.metaRefreshRunning.hidden = true;
    if (els.metaRefreshDone) els.metaRefreshDone.hidden = false;

    const icon = els.metaRefreshDone?.querySelector('.meta-done-icon');
    if (icon) {
      icon.classList.toggle('is-error', failed > 0 && ok === 0);
      icon.classList.toggle('is-partial', failed > 0 && ok > 0);
    }

    if (els.metaRefreshDoneHeading) {
      els.metaRefreshDoneHeading.textContent = cancelled
        ? t('refresh.cancelled')
        : failed && !ok
          ? t('refresh.failed')
          : t('refresh.complete');
    }
    if (els.metaRefreshDoneSummary) {
      els.metaRefreshDoneSummary.textContent = t('refresh.summary', {
        ok,
        total,
        cancel: cancelled ? t('refresh.beforeCancel') : '',
      });
    }
    if (els.metaRefreshDoneFailed) {
      if (failed > 0) {
        els.metaRefreshDoneFailed.hidden = false;
        els.metaRefreshDoneFailed.textContent = t('refresh.failedCount', { n: failed });
      } else {
        els.metaRefreshDoneFailed.hidden = true;
        els.metaRefreshDoneFailed.textContent = '';
      }
    }

    if (els.metaRefreshFailureList && els.metaRefreshFailures) {
      els.metaRefreshFailureList.innerHTML = '';
      if (failures.length) {
        els.metaRefreshFailures.hidden = false;
        const frag = document.createDocumentFragment();
        for (const f of failures.slice(0, 50)) {
          const li = document.createElement('li');
          const t = document.createElement('span');
          t.className = 'meta-fail-title';
          t.textContent = f.title || 'Untitled';
          const r = document.createElement('span');
          r.className = 'meta-fail-reason' + (f.warn ? ' is-warn' : '');
          r.textContent = f.reason || 'Error';
          li.append(t, r);
          frag.appendChild(li);
        }
        if (failures.length > 50) {
          const li = document.createElement('li');
          const t = document.createElement('span');
          t.className = 'meta-fail-title';
          t.textContent = `… and ${failures.length - 50} more`;
          li.appendChild(t);
          frag.appendChild(li);
        }
        els.metaRefreshFailureList.appendChild(frag);
      } else {
        els.metaRefreshFailures.hidden = true;
      }
    }

    if (els.metaRefreshCancel) {
      els.metaRefreshCancel.hidden = true;
      els.metaRefreshCancel.disabled = true;
    }
    if (els.metaRefreshClose) {
      els.metaRefreshClose.disabled = false;
      queueMicrotask(() => els.metaRefreshClose?.focus());
    }
  }

  /**
   * Shared merge: fetch TMDB detail and apply onto an existing library movie.
   * @param {object} movie
   * @param {string} apiKey
   * @returns {Promise<object>} the same movie reference after in-place update
   */
  async function refreshMovieFromTmdb(movie, apiKey) {
    const tmdbId = movie?.tmdb_id != null ? String(movie.tmdb_id).trim() : '';
    if (!tmdbId) {
      const err = new Error('Missing TMDB ID');
      err.code = 'MISSING_TMDB_ID';
      throw err;
    }
    const detail = await getMovieById(apiKey, tmdbId);
    const merged = mergeLibraryMovieFromTmdb(movie, detail);
    applyMergedMovieInPlace(movie, merged);
    return movie;
  }

  /**
   * Update one library movie from TMDB (single confirmation).
   * Prefer open-dialog draft location/keywords/poster when merging.
   * @param {object} movie
   */
  async function startSingleMovieMetadataRefresh(movie) {
    if (!movie || metaRefreshJob.running) return;
    if (!isDataReady()) {
      await showAppAlert('Library is still loading. Try again in a moment.', {
        title: 'Update metadata',
      });
      return;
    }
    const apiKey = getStoredTmdbApiKey();
    if (!apiKey) {
      await showAppAlert(
        'Set a TMDB API key in Menu → Settings before updating metadata.',
        { title: 'TMDB API key required' }
      );
      return;
    }

    const title = String(movie.title || 'Untitled').trim() || 'Untitled';
    const tmdbId = movie.tmdb_id != null ? String(movie.tmdb_id).trim() : '';
    if (!tmdbId) {
      await showAppAlert(`“${title}” has no TMDB id, so it cannot be updated.`, {
        title: 'Update metadata',
      });
      return;
    }

    const ok = await showAppConfirm(
      `Update metadata for “${title}” from TMDB?\n\n` +
        `This re-fetches title, year, overview, cast, crew, genres, ratings, posters, ` +
        `and related fields.\n\n` +
        `Location and keywords will be merged:\n` +
        `• Location — kept as-is (never overwritten)\n` +
        `• Keywords — TMDB tags combined with yours (duplicates skipped)\n` +
        `• Poster — kept if it still appears on TMDB (primary or alternate); otherwise the TMDB default`,
      {
        title: 'Update metadata',
        okLabel: 'Update',
        cancelLabel: 'Cancel',
      }
    );
    if (!ok) return;

    const fromDialog = dialog.isOpen() && dialog.movie === movie;
    if (fromDialog) {
      dialog.applyDraftPreserveFieldsToMovie();
      dialog.setMetadataUpdateBusy(true);
    }

    try {
      await refreshMovieFromTmdb(movie, apiKey);
      setDirty(true);
      refreshLibraryAfterMutation();
      if (dialog.isOpen() && dialog.movie === movie) {
        dialog.open(movie);
      }
      showAppToast(`Updated “${movie.title || title}” from TMDB`);
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : String(err);
      await showAppAlert(msg || 'Update failed.', {
        title: 'Update metadata failed',
      });
    } finally {
      if (fromDialog || (dialog.isOpen() && dialog.movie === movie)) {
        dialog.setMetadataUpdateBusy(false);
      }
    }
  }

  /**
   * Confirm (optionally twice) then refresh every library movie from TMDB.
   * Location kept; keywords merged; poster kept if still on TMDB.
   */
  async function startBulkMetadataRefresh() {
    if (metaRefreshJob.running) return;
    if (!isDataReady()) {
      await showAppAlert('Library is still loading. Try again in a moment.', {
        title: 'Refresh (TMDB)',
      });
      return;
    }
    const apiKey = getStoredTmdbApiKey();
    if (!apiKey) {
      await showAppAlert(
        'Set a TMDB API key in Menu → Settings before refreshing from TMDB.',
        { title: 'TMDB API key required' }
      );
      return;
    }

    const total = getMovies().length;
    if (!total) {
      await showAppAlert('Your library is empty — nothing to refresh.', {
        title: 'Refresh (TMDB)',
      });
      return;
    }

    const firstOk = await showAppConfirm(
      `Refresh metadata for all ${total} movie${total === 1 ? '' : 's'} from TMDB?\n\n` +
        `This re-fetches title, year, overview, cast, crew, genres, ratings, posters, ` +
        `and related fields for every library entry.\n\n` +
        `Location and keywords will be merged:\n` +
        `• Location — kept as-is (never overwritten)\n` +
        `• Keywords — TMDB tags combined with yours (duplicates skipped)\n` +
        `• Poster — kept if it still appears on TMDB (primary or alternate); otherwise the TMDB default\n\n` +
        `TMDB limits how many updates we can do per second, so this can take a little while.`,
      {
        title: 'Refresh (TMDB)',
        okLabel: 'Continue',
        cancelLabel: 'Cancel',
      }
    );
    if (!firstOk) return;

    if (getStoredBulkMetaConfirm2()) {
      const secondOk = await showAppConfirm(
        `Are you sure you want to refresh metadata for all ${total} movie${
          total === 1 ? '' : 's'
        }?\n\n` +
          `This overwrites TMDB-sourced fields in your library. You can still discard unsaved ` +
          `changes by reloading without Save to GitHub, or restore an older data file.`,
        {
          title: 'Confirm refresh',
          okLabel: 'Refresh all',
          cancelLabel: 'Cancel',
        }
      );
      if (!secondOk) return;
    }

    await runBulkMetadataRefresh(apiKey);
  }

  /**
   * @param {string} apiKey
   */
  async function runBulkMetadataRefresh(apiKey) {
    metaRefreshJob.running = true;
    metaRefreshJob.cancelRequested = false;
    openMetaRefreshDialog();

    const movies = getMovies();
    const total = movies.length;
    let ok = 0;
    let failed = 0;
    /** @type {{ title: string, reason: string, warn?: boolean }[]} */
    const failures = [];
    let cancelled = false;
    let anySuccess = false;

    try {
      for (let i = 0; i < movies.length; i += 1) {
        if (metaRefreshJob.cancelRequested) {
          cancelled = true;
          break;
        }

        const movie = movies[i];
        const title = String(movie?.title || 'Untitled').trim() || 'Untitled';
        const tmdbId = movie?.tmdb_id != null ? String(movie.tmdb_id).trim() : '';

        updateMetaRefreshProgress({
          index: i + 1,
          total,
          title,
          status: 'Fetching details, credits, keywords…',
        });

        if (!tmdbId) {
          failed += 1;
          failures.push({
            title,
            reason: 'Missing TMDB ID',
            warn: true,
          });
          continue;
        }

        try {
          await refreshMovieFromTmdb(movie, apiKey);
          anySuccess = true;
          ok += 1;

          // Keep open detail dialog in sync if this is the same object
          if (dialog.isOpen() && dialog.movie === movie) {
            dialog.open(movie);
          }
        } catch (err) {
          failed += 1;
          const msg = err instanceof Error ? err.message : String(err);
          failures.push({
            title,
            reason: msg,
            warn: err?.code === 'MISSING_TMDB_ID',
          });
          console.error(`Metadata refresh failed for ${title} (${tmdbId}):`, err);
        }
      }

      // Final progress bar
      if (!cancelled) {
        updateMetaRefreshProgress({
          index: total,
          total,
          title: els.metaRefreshMovie?.textContent || '—',
          status: 'Finishing…',
        });
        if (els.metaRefreshBar) els.metaRefreshBar.style.width = '100%';
        if (els.metaRefreshProgressbar) {
          els.metaRefreshProgressbar.setAttribute('aria-valuenow', '100');
        }
        if (els.metaRefreshPct) els.metaRefreshPct.textContent = '100%';
      }

      if (anySuccess) {
        setDirty(true);
        refreshLibraryAfterMutation();
      }

      showMetaRefreshDone({ ok, failed, total, cancelled, failures });

      if (ok > 0 && !cancelled) {
        showAppToast(
          `Refreshed ${ok} movie${ok === 1 ? '' : 's'} from TMDB${
            failed ? ` · ${failed} failed` : ''
          }`
        );
      } else if (ok > 0 && cancelled) {
        showAppToast(
          `Refreshed ${ok} movie${ok === 1 ? '' : 's'} before cancel${
            failed ? ` · ${failed} failed` : ''
          }`
        );
      }
    } finally {
      metaRefreshJob.running = false;
      metaRefreshJob.cancelRequested = false;
    }
  }


  els.metaRefreshBtn?.addEventListener('click', () => {
    closeMenu();
    void startBulkMetadataRefresh();
  });

  els.metaRefreshCancel?.addEventListener('click', () => {
    if (metaRefreshJob.running) {
      metaRefreshJob.cancelRequested = true;
      if (els.metaRefreshStatus) {
        els.metaRefreshStatus.textContent = 'Cancelling after current movie…';
      }
      if (els.metaRefreshCancel) els.metaRefreshCancel.disabled = true;
      return;
    }
    closeMetaRefreshDialog();
  });
  els.metaRefreshClose?.addEventListener('click', () => closeMetaRefreshDialog());
  els.metaRefreshCloseX?.addEventListener('click', () => {
    if (metaRefreshJob.running) {
      metaRefreshJob.cancelRequested = true;
      if (els.metaRefreshStatus) {
        els.metaRefreshStatus.textContent = 'Cancelling after current movie…';
      }
      if (els.metaRefreshCancel) els.metaRefreshCancel.disabled = true;
      return;
    }
    closeMetaRefreshDialog();
  });
  els.metaRefreshBackdrop?.addEventListener('click', (e) => {
    if (e.target !== els.metaRefreshBackdrop) return;
    if (metaRefreshJob.running) return;
    closeMetaRefreshDialog();
  });

  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Escape') return;
      if (isAppAlertOpen()) return;
      if (!isMetaRefreshOpen()) return;
      e.preventDefault();
      e.stopPropagation();
      if (metaRefreshJob.running) {
        metaRefreshJob.cancelRequested = true;
        if (els.metaRefreshStatus) {
          els.metaRefreshStatus.textContent = 'Cancelling after current movie…';
        }
        if (els.metaRefreshCancel) els.metaRefreshCancel.disabled = true;
        return;
      }
      closeMetaRefreshDialog();
    },
    true
  );

  document.addEventListener(
    'keydown',
    (e) => {
      if (!isPrimaryActionEnter(e)) return;
      if (isAppAlertOpen()) return;
      if (!isMetaRefreshOpen() || metaRefreshJob.running) return;
      e.preventDefault();
      e.stopPropagation();
      closeMetaRefreshDialog();
    },
    true
  );

  return {
    isMetaRefreshOpen,
    isMetaRefreshRunning: () => metaRefreshJob.running,
    startBulkMetadataRefresh,
    startSingleMovieMetadataRefresh,
  };
}
