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
} from './settings-io.js';
import {
  appendProgressLog,
  resetDialogScroll,
} from './progress-console.js';
import { copyTextToClipboard, downloadJson } from './utils.js';

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
 *   openSaveProgressDialog: (opts?: { title?: string }) => void,
 *   appendSaveLog: (message: string, opts?: { level?: string }) => void,
 *   reapplySettingsFromStorage: () => void,
 *   closeSettingsDialog: (opts?: { revertPreview?: boolean }) => void,
 *   focusFilterWhenIdle: () => void,
 *   isSettingsOpen: () => boolean,
 *   exportSettingsBtn: HTMLElement|null,
 *   exportSettingsClipboardBtn: HTMLElement|null,
 *   importSettingsBtn: HTMLElement|null,
 *   importSettingsFileInput: HTMLInputElement|null,
 *   importSettingsClipboardBtn: HTMLElement|null,
 *   clearSessionBtn: HTMLElement|null,
 *   clipboardImportBackdrop: HTMLElement|null,
 *   clipboardImportText: HTMLTextAreaElement|null,
 *   clipboardImportConsole: HTMLElement|null,
 *   clipboardImportClose: HTMLElement|null,
 *   clipboardImportCancel: HTMLElement|null,
 *   clipboardImportRun: HTMLElement|null,
 *   clipboardImportPasteBtn: HTMLElement|null,
 * }} opts
 */
export function initSettingsTransfer(opts) {
  const {
    closeMenu,
    showAppToast,
    openSaveProgressDialog,
    appendSaveLog,
    reapplySettingsFromStorage,
    closeSettingsDialog,
    focusFilterWhenIdle,
    isSettingsOpen,
    exportSettingsBtn,
    exportSettingsClipboardBtn,
    importSettingsBtn,
    importSettingsFileInput,
    importSettingsClipboardBtn,
    clearSessionBtn,
    clipboardImportBackdrop,
    clipboardImportText,
    clipboardImportConsole,
    clipboardImportClose,
    clipboardImportCancel,
    clipboardImportRun,
    clipboardImportPasteBtn,
  } = opts;

  function exportSettings() {
    downloadJson(SETTINGS_EXPORT_FILENAME, buildSettingsExportObject());
    showAppToast(t('settingsIo.exportDone'));
  }

  async function exportSettingsToClipboard() {
    const text = JSON.stringify(buildSettingsExportObject(), null, 2);
    try {
      await copyTextToClipboard(text);
      showAppToast(t('settingsIo.exportClipboardDone'));
    } catch (err) {
      await showAppAlert(
        t('settingsIo.exportClipboardFailed', {
          error: err?.message || String(err),
        }),
        { title: t('menu.exportSettingsClipboard') }
      );
    }
  }

  function startSettingsImport() {
    const input = importSettingsFileInput;
    if (!input) {
      void showAppAlert(t('settingsIo.importUnavailable'), {
        title: t('menu.importSettings'),
      });
      return;
    }
    input.click();
  }

  /**
   * @param {File} file
   */
  async function importSettingsFromFile(file) {
    const name = file?.name || 'settings.json';
    openSaveProgressDialog({ title: t('settingsIo.importTitle') });

    let text;
    try {
      text = await file.text();
    } catch (err) {
      appendSaveLog(
        t('settingsIo.importReadFailed', {
          error: err?.message || String(err),
        }),
        { level: 'error' }
      );
      appendSaveLog(t('settingsIo.finished'));
      return;
    }

    importSettingsFromText(text, {
      sourceLabel: name,
      log: appendSaveLog,
      reapplySettingsFromStorage,
    });
  }

  function isClipboardImportOpen() {
    return Boolean(
      clipboardImportBackdrop &&
        !clipboardImportBackdrop.classList.contains('hidden')
    );
  }

  function openClipboardImportDialog() {
    if (!clipboardImportBackdrop) return;
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

  function closeClipboardImportDialog() {
    if (!clipboardImportBackdrop) return;
    clipboardImportBackdrop.classList.add('hidden');
    clipboardImportBackdrop.setAttribute('aria-hidden', 'true');
    focusFilterWhenIdle();
  }

  /**
   * @param {string} message
   * @param {{ level?: 'normal' | 'error' | 'warn' | 'ok' }} [logOpts]
   */
  function appendClipboardImportLog(message, logOpts = {}) {
    appendProgressLog(clipboardImportConsole, message, logOpts);
  }

  async function pasteIntoClipboardImport() {
    const ta = clipboardImportText;
    if (!ta) return;
    try {
      if (!navigator.clipboard?.readText) {
        appendClipboardImportLog(t('settingsIo.clipboardPasteUnsupported'), {
          level: 'warn',
        });
        ta.focus();
        return;
      }
      const text = await navigator.clipboard.readText();
      ta.value = text;
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
      appendClipboardImportLog(
        t('settingsIo.clipboardPasted', { n: text.length })
      );
    } catch (err) {
      appendClipboardImportLog(
        t('settingsIo.clipboardPasteFailed', {
          error: err?.message || String(err),
        }),
        { level: 'error' }
      );
      ta.focus();
    }
  }

  function runClipboardSettingsImport() {
    const text = clipboardImportText?.value ?? '';
    if (clipboardImportConsole) {
      clipboardImportConsole.textContent = '';
    }
    importSettingsFromText(text, {
      sourceLabel: t('settingsIo.clipboardSource'),
      log: appendClipboardImportLog,
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
    exportSettings();
  });

  exportSettingsClipboardBtn?.addEventListener('click', () => {
    closeMenu();
    void exportSettingsToClipboard();
  });

  importSettingsBtn?.addEventListener('click', () => {
    closeMenu();
    startSettingsImport();
  });

  importSettingsFileInput?.addEventListener('change', () => {
    const file = importSettingsFileInput?.files?.[0] || null;
    if (importSettingsFileInput) importSettingsFileInput.value = '';
    if (file) void importSettingsFromFile(file);
  });

  importSettingsClipboardBtn?.addEventListener('click', () => {
    closeMenu();
    openClipboardImportDialog();
  });

  clipboardImportClose?.addEventListener('click', () => {
    closeClipboardImportDialog();
  });
  clipboardImportCancel?.addEventListener('click', () => {
    closeClipboardImportDialog();
  });
  clipboardImportBackdrop?.addEventListener('click', (e) => {
    if (e.target === clipboardImportBackdrop) closeClipboardImportDialog();
  });
  clipboardImportRun?.addEventListener('click', () => {
    runClipboardSettingsImport();
  });
  clipboardImportPasteBtn?.addEventListener('click', () => {
    void pasteIntoClipboardImport();
  });

  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Escape') return;
      if (isAppAlertOpen()) return;
      if (!isClipboardImportOpen()) return;
      e.preventDefault();
      e.stopPropagation();
      closeClipboardImportDialog();
    },
    true
  );

  clearSessionBtn?.addEventListener('click', () => {
    closeMenu();
    void clearSession();
  });

  return {
    isClipboardImportOpen,
    exportSettings,
    exportSettingsToClipboard,
    startSettingsImport,
    clearSession,
    openClipboardImportDialog,
    closeClipboardImportDialog,
  };
}
