/**
 * Shared progress-console logging and the Save/Import progress dialog shell.
 */

import { isAppAlertOpen } from './alert-dialog.js';
import { t } from './i18n.js';
import {
  copyTextToClipboard,
  flashCopyButton,
  isPrimaryActionEnter,
} from './utils.js';

/**
 * Reset .dialog-body scroll inside a backdrop (shared by many modals).
 * @param {HTMLElement|null|undefined} backdrop
 */
export function resetDialogScroll(backdrop) {
  const body = backdrop?.querySelector?.('.dialog-body');
  if (body) body.scrollTop = 0;
}

/**
 * Append a timestamped line to a progress console element.
 * @param {HTMLElement|null|undefined} consoleEl
 * @param {string} message
 * @param {{ level?: 'normal' | 'error' | 'warn' | 'ok' }} [opts]
 */
export function appendProgressLog(consoleEl, message, opts = {}) {
  const el = consoleEl;
  if (!el) return;
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const ts = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const line = document.createElement('span');
  line.className = 'progress-console-line';
  const level = opts.level || 'normal';
  if (level === 'error' || level === 'warn') {
    line.classList.add(level === 'error' ? 'is-error' : 'is-warn');
  } else if (level === 'ok') {
    line.classList.add('is-ok');
  }
  line.textContent = `[${ts}] ${message}`;
  if (el.childNodes.length) {
    el.appendChild(document.createTextNode('\n'));
  }
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
}

/**
 * Wire the shared Save / file-import progress dialog.
 * @param {{
 *   backdrop: HTMLElement|null,
 *   title: HTMLElement|null,
 *   console: HTMLElement|null,
 *   closeBtn: HTMLElement|null,
 *   okBtn: HTMLElement|null,
 *   copyBtn: HTMLElement|null,
 *   focusFilterWhenIdle: () => void,
 * }} opts
 */
export function initSaveProgressDialog(opts) {
  const {
    backdrop,
    title,
    console: consoleEl,
    closeBtn,
    okBtn,
    copyBtn,
    focusFilterWhenIdle,
  } = opts;

  /**
   * @param {{ title?: string }} [openOpts]
   */
  function openSaveProgressDialog(openOpts = {}) {
    if (!backdrop) return;
    if (title) {
      title.textContent = openOpts.title || t('saveProgress.title');
    }
    if (consoleEl) {
      consoleEl.textContent = '';
    }
    resetDialogScroll(backdrop);
    backdrop.classList.remove('hidden');
    backdrop.setAttribute('aria-hidden', 'false');
    queueMicrotask(() => {
      resetDialogScroll(backdrop);
      okBtn?.focus();
    });
  }

  function closeSaveProgressDialog() {
    if (!backdrop) return;
    backdrop.classList.add('hidden');
    backdrop.setAttribute('aria-hidden', 'true');
    if (title) {
      title.textContent = t('saveProgress.title');
    }
    focusFilterWhenIdle();
  }

  function isSaveProgressOpen() {
    return Boolean(backdrop && !backdrop.classList.contains('hidden'));
  }

  /**
   * @param {string} message
   * @param {{ level?: 'normal' | 'error' | 'warn' | 'ok' }} [logOpts]
   */
  function appendSaveLog(message, logOpts = {}) {
    appendProgressLog(consoleEl, message, logOpts);
  }

  /**
   * @param {string} text
   */
  function appendSaveLogMessage(text) {
    const lines = String(text || '').split('\n');
    for (const line of lines) {
      appendSaveLog(line === '' ? ' ' : line);
    }
  }

  async function copySaveProgressLog() {
    const text = consoleEl?.textContent || '';
    if (!text) {
      appendSaveLog('(nothing to copy yet)');
      return;
    }
    try {
      await copyTextToClipboard(text);
      flashCopyButton(copyBtn, 'ok');
    } catch (err) {
      flashCopyButton(copyBtn, 'fail');
      appendSaveLog(`Copy failed: ${err?.message || err}`);
    }
  }

  closeBtn?.addEventListener('click', () => closeSaveProgressDialog());
  okBtn?.addEventListener('click', () => closeSaveProgressDialog());
  copyBtn?.addEventListener('click', () => {
    void copySaveProgressLog();
  });
  backdrop?.addEventListener('click', (e) => {
    if (e.target === backdrop) closeSaveProgressDialog();
  });

  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Escape') return;
      if (isAppAlertOpen()) return;
      if (!isSaveProgressOpen()) return;
      e.preventDefault();
      e.stopPropagation();
      closeSaveProgressDialog();
    },
    true
  );

  document.addEventListener(
    'keydown',
    (e) => {
      if (!isPrimaryActionEnter(e)) return;
      if (isAppAlertOpen()) return;
      if (!isSaveProgressOpen()) return;
      e.preventDefault();
      e.stopPropagation();
      closeSaveProgressDialog();
    },
    true
  );

  return {
    openSaveProgressDialog,
    closeSaveProgressDialog,
    isSaveProgressOpen,
    appendSaveLog,
    appendSaveLogMessage,
  };
}
