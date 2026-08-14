/**
 * Configuration: export/import settings (file + clipboard) and clear session.
 * Uses shared progress-console logging and settings-io apply logic.
 */

import { isAppAlertOpen, showAppAlert, showAppConfirm } from './alert-dialog.js';
import { t } from './i18n.js';
import {
  SETTINGS_EXPORT_FILENAME,
  applySettingsImport,
  buildSettingsExportObject,
  clearLocalStorageSession,
  settingsExportIncludesApiKeys,
} from './settings-io.js';
import {
  appendProgressLog,
  resetDialogScroll,
} from './progress-console.js';
import {
  copyTextToClipboard,
  downloadJson,
  isPrimaryActionEnter,
} from './utils.js';

/**
 * Shared settings import + console logging (file and clipboard).
 * @param {string} text raw JSON text
 * @param {{
 *   sourceLabel: string,
 *   log: (message: string, opts?: { level?: 'normal'|'error'|'warn'|'ok' }) => void,
 *   reapplySettingsFromStorage: () => void,
 * }} opts
 * @returns {boolean} true if settings were applied (including partial defaults)
 */
export function importSettingsFromText(
  text,
  { sourceLabel, log, reapplySettingsFromStorage }
) {
  const name = String(sourceLabel || 'settings.json').trim() || 'settings.json';
  log(t('settingsIo.importStarting', { name }));

  const raw = String(text ?? '');
  if (!raw.trim()) {
    log(t('settingsIo.importEmpty'), { level: 'error' });
    log(t('settingsIo.finished'));
    return false;
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    log(
      t('settingsIo.importParseFailed', {
        error: err?.message || String(err),
      }),
      { level: 'error' }
    );
    log(t('settingsIo.finished'));
    return false;
  }

  const result = applySettingsImport(data);
  if (!result.ok) {
    log(result.error || t('settingsIo.importFailed'), { level: 'error' });
    log(t('settingsIo.finished'));
    return false;
  }

  let applied = 0;
  let defaults = 0;
  let invalid = 0;
  let ignored = 0;
  for (const line of result.lines) {
    if (line.status === 'applied') {
      applied += 1;
      log(`${line.label}: ${t('settingsIo.statusApplied')}`);
    } else if (line.status === 'default') {
      defaults += 1;
      log(`${line.label}: ${line.detail || t('settingsIo.statusDefault')}`);
    } else if (line.status === 'invalid') {
      invalid += 1;
      log(`${line.label}: ${line.detail || t('settingsIo.statusInvalid')}`, {
        level: 'warn',
      });
    } else if (line.status === 'ignored') {
      ignored += 1;
      log(`${line.key}: ${line.detail || t('settingsIo.statusIgnored')}`);
    } else if (line.status === 'secret') {
      log(`${line.label}: ${line.detail || t('settingsIo.statusSecret')}`, {
        level: 'error',
      });
    }
  }

  if (result.secretsApplied.length) {
    log(
      t('settingsIo.secretWarning', {
        keys: result.secretsApplied.join(', '),
      }),
      { level: 'error' }
    );
    log(t('settingsIo.secretClearHint'), { level: 'error' });
  }

  reapplySettingsFromStorage();

  log(
    t('settingsIo.importSummary', {
      applied,
      defaults,
      invalid,
      ignored,
      secrets: result.secretsApplied.length,
    }),
    { level: 'ok' }
  );
  log(t('settingsIo.finished'));
  return true;
}

/**
 * @param {{
 *   closeMenu: () => void,
 *   showAppToast: (message: string, opts?: { error?: boolean, ms?: number }) => void,
 *   reapplySettingsFromStorage: () => void,
 *   closeSettingsDialog: (opts?: { revertPreview?: boolean }) => void,
 *   focusFilterWhenIdle: () => void,
 *   isSettingsOpen: () => boolean,
 *   exportSettingsBtn: HTMLElement|null,
 *   importSettingsBtn: HTMLElement|null,
 *   importSettingsFileInput: HTMLInputElement|null,
 *   clearSessionBtn: HTMLElement|null,
 *   settingsExportBackdrop: HTMLElement|null,
 *   settingsExportClose: HTMLElement|null,
 *   settingsExportCancel: HTMLElement|null,
 *   settingsExportCopy: HTMLElement|null,
 *   settingsExportDownload: HTMLElement|null,
 *   settingsExportKeysNote: HTMLElement|null,
 *   clipboardImportBackdrop: HTMLElement|null,
 *   clipboardImportText: HTMLTextAreaElement|null,
 *   clipboardImportConsole: HTMLElement|null,
 *   clipboardImportClose: HTMLElement|null,
 *   clipboardImportCancel: HTMLElement|null,
 *   clipboardImportRun: HTMLElement|null,
 *   clipboardImportPasteBtn: HTMLElement|null,
 *   clipboardImportFileBtn: HTMLElement|null,
 * }} opts
 */
export function initSettingsTransfer(opts) {
  const {
    closeMenu,
    showAppToast,
    reapplySettingsFromStorage,
    closeSettingsDialog,
    focusFilterWhenIdle,
    isSettingsOpen,
    exportSettingsBtn,
    importSettingsBtn,
    importSettingsFileInput,
    clearSessionBtn,
    settingsExportBackdrop,
    settingsExportClose,
    settingsExportCancel,
    settingsExportCopy,
    settingsExportDownload,
    settingsExportKeysNote,
    clipboardImportBackdrop,
    clipboardImportText,
    clipboardImportConsole,
    clipboardImportClose,
    clipboardImportCancel,
    clipboardImportRun,
    clipboardImportPasteBtn,
    clipboardImportFileBtn,
  } = opts;

  /** Last file name or “clipboard” shown in the import log. */
  let lastImportSource = '';

  function exportDoneMessage() {
    return settingsExportIncludesApiKeys()
      ? t('settingsIo.exportDoneWithKeys')
      : t('settingsIo.exportDone');
  }

  function exportClipboardDoneMessage() {
    return settingsExportIncludesApiKeys()
      ? t('settingsIo.exportClipboardDoneWithKeys')
      : t('settingsIo.exportClipboardDone');
  }

  function isSettingsExportOpen() {
    return Boolean(
      settingsExportBackdrop &&
        !settingsExportBackdrop.classList.contains('hidden')
    );
  }

  function syncExportKeysNote() {
    if (!settingsExportKeysNote) return;
    const on = settingsExportIncludesApiKeys();
    settingsExportKeysNote.hidden = !on;
  }

  function openSettingsExportDialog() {
    if (!settingsExportBackdrop) return;
    syncExportKeysNote();
    resetDialogScroll(settingsExportBackdrop);
    settingsExportBackdrop.classList.remove('hidden');
    settingsExportBackdrop.setAttribute('aria-hidden', 'false');
    queueMicrotask(() => {
      resetDialogScroll(settingsExportBackdrop);
      settingsExportDownload?.focus();
    });
  }

  function closeSettingsExportDialog() {
    if (!settingsExportBackdrop) return;
    settingsExportBackdrop.classList.add('hidden');
    settingsExportBackdrop.setAttribute('aria-hidden', 'true');
    focusFilterWhenIdle();
  }

  function exportSettings() {
    downloadJson(SETTINGS_EXPORT_FILENAME, buildSettingsExportObject());
    closeSettingsExportDialog();
    showAppToast(exportDoneMessage());
  }

  async function exportSettingsToClipboard() {
    const text = JSON.stringify(buildSettingsExportObject(), null, 2);
    try {
      await copyTextToClipboard(text);
      closeSettingsExportDialog();
      showAppToast(exportClipboardDoneMessage());
    } catch (err) {
      await showAppAlert(
        t('settingsIo.exportClipboardFailed', {
          error: err?.message || String(err),
        }),
        { title: t('menu.exportSettings') }
      );
    }
  }

  function isSettingsImportOpen() {
    return Boolean(
      clipboardImportBackdrop &&
        !clipboardImportBackdrop.classList.contains('hidden')
    );
  }

  function openSettingsImportDialog() {
    if (!clipboardImportBackdrop) return;
    lastImportSource = '';
    if (clipboardImportText) clipboardImportText.value = '';
    if (clipboardImportConsole) clipboardImportConsole.textContent = '';
    resetDialogScroll(clipboardImportBackdrop);
    clipboardImportBackdrop.classList.remove('hidden');
    clipboardImportBackdrop.setAttribute('aria-hidden', 'false');
    queueMicrotask(() => {
      resetDialogScroll(clipboardImportBackdrop);
      clipboardImportText?.focus();
    });
  }

  function closeSettingsImportDialog() {
    if (!clipboardImportBackdrop) return;
    clipboardImportBackdrop.classList.add('hidden');
    clipboardImportBackdrop.setAttribute('aria-hidden', 'true');
    focusFilterWhenIdle();
  }

  /**
   * @param {string} message
   * @param {{ level?: 'normal' | 'error' | 'warn' | 'ok' }} [logOpts]
   */
  function appendImportLog(message, logOpts = {}) {
    appendProgressLog(clipboardImportConsole, message, logOpts);
  }

  async function pasteIntoImport() {
    const ta = clipboardImportText;
    if (!ta) return;
    try {
      if (!navigator.clipboard?.readText) {
        appendImportLog(t('settingsIo.clipboardPasteUnsupported'), {
          level: 'warn',
        });
        ta.focus();
        return;
      }
      const text = await navigator.clipboard.readText();
      ta.value = text;
      lastImportSource = t('settingsIo.clipboardSource');
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
      appendImportLog(t('settingsIo.clipboardPasted', { n: text.length }));
    } catch (err) {
      appendImportLog(
        t('settingsIo.clipboardPasteFailed', {
          error: err?.message || String(err),
        }),
        { level: 'error' }
      );
      ta.focus();
    }
  }

  /**
   * Load a picked file into the import editor (does not apply yet).
   * @param {File} file
   */
  async function loadSettingsFileIntoEditor(file) {
    const name = file?.name || 'settings.json';
    const ta = clipboardImportText;
    try {
      const text = await file.text();
      if (ta) {
        ta.value = text;
        ta.focus();
        ta.setSelectionRange(0, 0);
      }
      lastImportSource = name;
      appendImportLog(
        t('settingsIo.importFileLoaded', { n: text.length, name })
      );
    } catch (err) {
      appendImportLog(
        t('settingsIo.importReadFailed', {
          error: err?.message || String(err),
        }),
        { level: 'error' }
      );
    }
  }

  function startSettingsFilePick() {
    const input = importSettingsFileInput;
    if (!input) {
      appendImportLog(t('settingsIo.importUnavailable'), { level: 'error' });
      return;
    }
    input.click();
  }

  function runSettingsImport() {
    const text = clipboardImportText?.value ?? '';
    if (clipboardImportConsole) {
      clipboardImportConsole.textContent = '';
    }
    importSettingsFromText(text, {
      sourceLabel: lastImportSource || t('settingsIo.importTitle'),
      log: appendImportLog,
      reapplySettingsFromStorage,
    });
  }

  async function clearSession() {
    const ok = await showAppConfirm(t('settingsIo.clearConfirm'), {
      title: t('menu.clearSession'),
      okLabel: t('settingsIo.clearAction'),
      cancelLabel: t('common.cancel'),
    });
    if (!ok) return;

    if (isSettingsOpen()) {
      closeSettingsDialog({ revertPreview: false });
    }
    if (isSettingsExportOpen()) closeSettingsExportDialog();
    if (isSettingsImportOpen()) closeSettingsImportDialog();

    const { before, after } = clearLocalStorageSession();
    reapplySettingsFromStorage();

    await showAppAlert(
      t('settingsIo.clearResult', {
        before,
        after,
      }),
      {
        title: t('menu.clearSession'),
        okLabel: t('common.ok'),
      }
    );
  }

  exportSettingsBtn?.addEventListener('click', () => {
    closeMenu();
    openSettingsExportDialog();
  });

  importSettingsBtn?.addEventListener('click', () => {
    closeMenu();
    openSettingsImportDialog();
  });

  importSettingsFileInput?.addEventListener('change', () => {
    const file = importSettingsFileInput?.files?.[0] || null;
    if (importSettingsFileInput) importSettingsFileInput.value = '';
    if (!file) return;
    if (!isSettingsImportOpen()) openSettingsImportDialog();
    void loadSettingsFileIntoEditor(file);
  });

  settingsExportClose?.addEventListener('click', () => {
    closeSettingsExportDialog();
  });
  settingsExportCancel?.addEventListener('click', () => {
    closeSettingsExportDialog();
  });
  settingsExportBackdrop?.addEventListener('click', (e) => {
    if (e.target === settingsExportBackdrop) closeSettingsExportDialog();
  });
  settingsExportDownload?.addEventListener('click', () => {
    exportSettings();
  });
  settingsExportCopy?.addEventListener('click', () => {
    void exportSettingsToClipboard();
  });

  clipboardImportClose?.addEventListener('click', () => {
    closeSettingsImportDialog();
  });
  clipboardImportCancel?.addEventListener('click', () => {
    closeSettingsImportDialog();
  });
  clipboardImportBackdrop?.addEventListener('click', (e) => {
    if (e.target === clipboardImportBackdrop) closeSettingsImportDialog();
  });
  clipboardImportRun?.addEventListener('click', () => {
    runSettingsImport();
  });
  clipboardImportPasteBtn?.addEventListener('click', () => {
    void pasteIntoImport();
  });
  clipboardImportFileBtn?.addEventListener('click', () => {
    startSettingsFilePick();
  });

  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Escape') return;
      if (isAppAlertOpen()) return;
      if (isSettingsExportOpen()) {
        e.preventDefault();
        e.stopPropagation();
        closeSettingsExportDialog();
        return;
      }
      if (!isSettingsImportOpen()) return;
      e.preventDefault();
      e.stopPropagation();
      closeSettingsImportDialog();
    },
    true
  );

  document.addEventListener(
    'keydown',
    (e) => {
      if (!isPrimaryActionEnter(e)) return;
      if (isAppAlertOpen()) return;
      if (!isSettingsExportOpen()) return;
      e.preventDefault();
      e.stopPropagation();
      exportSettings();
    },
    true
  );

  clearSessionBtn?.addEventListener('click', () => {
    closeMenu();
    void clearSession();
  });

  return {
    isSettingsExportOpen,
    isSettingsImportOpen,
    exportSettings,
    exportSettingsToClipboard,
    openSettingsExportDialog,
    closeSettingsExportDialog,
    openSettingsImportDialog,
    closeSettingsImportDialog,
    clearSession,
  };
}
