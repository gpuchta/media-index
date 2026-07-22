/**
 * Library collection file import/export and empty-collection actions.
 */

import { CONFIG } from './config.js';
import { parseLibraryJson } from './library-diff.js';
import { showAppAlert, showAppConfirm } from './alert-dialog.js';
import { showAppToast } from './app-toast.js';
import { downloadJson, formatExportFilename } from './utils.js';

/**
 * @param {{
 *   els: { exportBtn: any, importBtn: any, importFileInput: any, emptyCollectionBtn: any },
 *   closeMenu: () => void,
 *   getMovies: () => object[],
 *   getDirty: () => boolean,
 *   isDataReady: () => boolean,
 *   isMetaRefreshRunning: () => boolean,
 *   setDirty: (v: boolean) => void,
 *   finishLibraryLoad: (movies: object[]) => void,
 *   dialog: { isOpen: () => boolean, close: () => void },
 * }} opts
 */
export function initLibraryIo(opts) {
  const {
    els,
    closeMenu,
    getMovies,
    getDirty,
    isDataReady,
    isMetaRefreshRunning,
    setDirty,
    finishLibraryLoad,
    dialog,
  } = opts;

  function exportData() {
    downloadJson(formatExportFilename(CONFIG.DATA_PATH), getMovies());
    setDirty(false);
  }

  /**
   * Push effective localStorage settings into live UI + in-memory prefs.
   * Used after Import settings and Clear session.
   */
  function startLibraryImport() {
    if (!isDataReady()) {
      void showAppAlert('Library is still loading. Try again in a moment.', {
        title: 'Import',
      });
      return;
    }
    if (isMetaRefreshRunning()) {
      void showAppAlert('Wait for the metadata update to finish before importing.', {
        title: 'Import',
      });
      return;
    }
    const input = els.importFileInput;
    if (!input) {
      void showAppAlert('Import is not available in this browser.', {
        title: 'Import',
      });
      return;
    }
    input.click();
  }

  /**
   * Confirm and replace the in-browser library with a parsed movie array.
   * @param {object[]} imported
   * @param {{
   *   sourceLabel: string,
   *   title?: string,
   *   okLabel?: string,
   *   toastPrefix?: string,
   * }} opts
   * @returns {Promise<boolean>} true if the library was replaced
   */
  async function confirmAndApplyImportedLibrary(imported, opts) {
    const sourceLabel = String(opts?.sourceLabel || 'import').trim() || 'import';
    const title = opts?.title || 'Import library';
    const okLabel = opts?.okLabel || 'Replace library';
    const toastPrefix = opts?.toastPrefix || 'Imported';

    if (!Array.isArray(imported)) {
      await showAppAlert(
        `Could not load “${sourceLabel}”.\n\nExpected a JSON array of movies.`,
        { title: `${title} failed` }
      );
      return false;
    }

    const objectCount = imported.filter(
      (m) => m && typeof m === 'object' && !Array.isArray(m)
    ).length;
    if (imported.length > 0 && objectCount === 0) {
      await showAppAlert(
        `“${sourceLabel}” is a JSON array, but it does not look like movie objects.`,
        { title: `${title} failed` }
      );
      return false;
    }

    const before = getMovies();
    const after = imported;
    const diff = diffLibraries(before, after);
    const fromN = before.length;
    const toN = after.length;

    if (diff.totalTouched === 0 && fromN === toN) {
      await showAppAlert(
        `“${sourceLabel}” matches your current library (${toN} movie${
          toN === 1 ? '' : 's'
        }). Nothing to change.`,
        { title }
      );
      return false;
    }

    const dirtyNote = getDirty()
      ? '\n\nYou have unsaved changes in this browser; this will replace them too.'
      : '';
    const ok = await showAppConfirm(
      `Replace your current library with “${sourceLabel}”?\n\n` +
        `Current: ${fromN} movie${fromN === 1 ? '' : 's'}\n` +
        `Import:  ${toN} movie${toN === 1 ? '' : 's'}\n\n` +
        `Compared to now: +${diff.addedCount} added · −${diff.removedCount} removed · ~${diff.changedCount} changed.\n\n` +
        `This only updates the library in this browser. Use Save to GitHub (or Export) to keep the result.` +
        dirtyNote,
      {
        title,
        okLabel,
        cancelLabel: 'Cancel',
      }
    );
    if (!ok) return false;

    if (dialog.isOpen()) {
      dialog.close();
    }

    finishLibraryLoad(after);
    setDirty(true);
    showAppToast(
      `${toastPrefix} ${toN} movie${toN === 1 ? '' : 's'}` +
        (diff.totalTouched
          ? ` (+${diff.addedCount} · −${diff.removedCount} · ~${diff.changedCount})`
          : '')
    );
    return true;
  }

  /**
   * Replace the in-browser library with movies from a user-selected JSON file.
   * @param {File} file
   */
  async function importLibraryFromFile(file) {
    if (!file) return;
    const name = String(file.name || 'file').trim() || 'file';

    let text;
    try {
      text = await file.text();
    } catch (err) {
      console.error(err);
      await showAppAlert(
        `Could not read “${name}”.\n\n${err?.message || err}`,
        { title: 'Import failed' }
      );
      return;
    }

    const imported = parseLibraryJson(text);
    if (imported == null) {
      await showAppAlert(
        `“${name}” is not a valid library file.\n\n` +
          `Expected a JSON array of movies (same format as Export / media-index.json).`,
        { title: 'Import failed' }
      );
      return;
    }

    await confirmAndApplyImportedLibrary(imported, {
      sourceLabel: name,
      title: 'Import library',
      okLabel: 'Replace library',
      toastPrefix: 'Imported',
    });
  }

  /**
   * Clear every movie from the in-browser library (after confirmation).
   * Does not touch GitHub until the user Saves.
   */
  async function emptyCollection() {
    if (!isDataReady()) {
      await showAppAlert('Library is still loading. Try again in a moment.', {
        title: 'Empty collection',
      });
      return;
    }
    if (isMetaRefreshRunning()) {
      await showAppAlert(
        'Wait for the metadata update to finish before emptying the collection.',
        { title: 'Empty collection' }
      );
      return;
    }

    const n = getMovies().length;
    if (n === 0) {
      await showAppAlert('The collection is already empty.', {
        title: 'Empty collection',
      });
      return;
    }

    const dirtyNote = getDirty()
      ? '\n\nYou also have unsaved changes; those will be discarded with the library.'
      : '';
    const ok = await showAppConfirm(
      `Remove all ${n} movie${n === 1 ? '' : 's'} from this collection?\n\n` +
        `This only clears the library in this browser. Use Save to GitHub (or Export a backup first) if you need to keep or restore data.` +
        dirtyNote,
      {
        title: 'Empty collection',
        okLabel: 'Empty collection',
        cancelLabel: 'Cancel',
      }
    );
    if (!ok) return;

    if (dialog.isOpen()) {
      dialog.close();
    }

    finishLibraryLoad([]);
    setDirty(true);
    showAppToast(`Emptied collection (${n} movie${n === 1 ? '' : 's'} removed)`);
  }


  els.exportBtn?.addEventListener('click', () => {
    closeMenu();
    exportData();
  });
  els.importBtn?.addEventListener('click', () => {
    closeMenu();
    startLibraryImport();
  });
  els.importFileInput?.addEventListener('change', () => {
    const file = els.importFileInput?.files?.[0] || null;
    if (els.importFileInput) els.importFileInput.value = '';
    if (file) void importLibraryFromFile(file);
  });
  els.emptyCollectionBtn?.addEventListener('click', () => {
    closeMenu();
    void emptyCollection();
  });

  return {
    exportData,
    startLibraryImport,
    importLibraryFromFile,
    emptyCollection,
    confirmAndApplyImportedLibrary,
  };
}
