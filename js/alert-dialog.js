/**
 * App-styled alert / confirm dialogs (replaces window.alert / window.confirm).
 * Same shell styling as other dialogs; centered via .dialog-backdrop flex.
 */

import { isPrimaryActionEnter } from './utils.js';
import { t } from './i18n.js';

/** @type {null | ((value: boolean | void) => void)} */
let pendingResolve = null;
/** @type {'alert' | 'confirm'} */
let mode = 'alert';

const els = {
  get backdrop() {
    return document.getElementById('app-alert-backdrop');
  },
  get title() {
    return document.getElementById('app-alert-title');
  },
  get message() {
    return document.getElementById('app-alert-message');
  },
  get btnOk() {
    return document.getElementById('app-alert-ok');
  },
  get btnCancel() {
    return document.getElementById('app-alert-cancel');
  },
  get btnClose() {
    return document.getElementById('app-alert-close');
  },
};

function isOpen() {
  return Boolean(els.backdrop && !els.backdrop.classList.contains('hidden'));
}

/**
 * @param {boolean | void} result
 */
function close(result) {
  if (!els.backdrop) return;
  els.backdrop.classList.add('hidden');
  els.backdrop.setAttribute('aria-hidden', 'true');
  const resolve = pendingResolve;
  pendingResolve = null;
  if (resolve) resolve(result);
  // Let app restore filter focus if no other modal remains open
  document.dispatchEvent(new CustomEvent('pmi:modals-maybe-idle'));
}

/**
 * @param {{
 *   mode: 'alert' | 'confirm',
 *   message: string,
 *   title?: string,
 *   okLabel?: string,
 *   cancelLabel?: string,
 * }} opts
 * @returns {Promise<boolean | void>}
 */
function openDialog(opts) {
  if (!els.backdrop || !els.message || !els.title || !els.btnOk) {
    // Fallback if markup missing
    if (opts.mode === 'confirm') {
      return Promise.resolve(window.confirm(String(opts.message || '')));
    }
    window.alert(String(opts.message || ''));
    return Promise.resolve();
  }

  // Replace any in-flight dialog
  if (pendingResolve) {
    const prev = pendingResolve;
    pendingResolve = null;
    prev(opts.mode === 'confirm' ? false : undefined);
  }

  mode = opts.mode;
  els.title.textContent =
    opts.title || (opts.mode === 'confirm' ? t('common.confirm') : t('common.notice'));
  els.message.textContent = String(opts.message || '');
  els.btnOk.textContent = opts.okLabel || t('common.ok');

  if (els.btnCancel) {
    if (opts.mode === 'confirm') {
      els.btnCancel.hidden = false;
      els.btnCancel.textContent = opts.cancelLabel || t('common.cancel');
    } else {
      els.btnCancel.hidden = true;
    }
  }

  els.backdrop.classList.remove('hidden');
  els.backdrop.setAttribute('aria-hidden', 'false');

  return new Promise((resolve) => {
    pendingResolve = resolve;
    queueMicrotask(() => {
      els.btnOk?.focus();
    });
  });
}

function wireOnce() {
  if (wireOnce.done) return;
  wireOnce.done = true;

  els.btnOk?.addEventListener('click', () => {
    close(mode === 'confirm' ? true : undefined);
  });
  els.btnCancel?.addEventListener('click', () => {
    close(false);
  });
  els.btnClose?.addEventListener('click', () => {
    close(mode === 'confirm' ? false : undefined);
  });
  els.backdrop?.addEventListener('click', (e) => {
    if (e.target === els.backdrop) {
      close(mode === 'confirm' ? false : undefined);
    }
  });

  // Highest priority Escape (capture) while open
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Escape') return;
      if (!isOpen()) return;
      e.preventDefault();
      e.stopPropagation();
      close(mode === 'confirm' ? false : undefined);
    },
    true
  );

  // Enter → primary (OK) when focus is not on a control that consumes Enter
  document.addEventListener(
    'keydown',
    (e) => {
      if (!isPrimaryActionEnter(e)) return;
      if (!isOpen()) return;
      e.preventDefault();
      e.stopPropagation();
      close(mode === 'confirm' ? true : undefined);
    },
    true
  );
}
wireOnce.done = false;

/**
 * Show a modal notice with an OK button.
 * @param {string} message
 * @param {{ title?: string, okLabel?: string }} [options]
 * @returns {Promise<void>}
 */
export function showAppAlert(message, options = {}) {
  wireOnce();
  return openDialog({
    mode: 'alert',
    message,
    title: options.title || t('common.notice'),
    okLabel: options.okLabel || t('common.ok'),
  }).then(() => undefined);
}

/**
 * Show a modal confirm with Cancel + OK.
 * @param {string} message
 * @param {{ title?: string, okLabel?: string, cancelLabel?: string }} [options]
 * @returns {Promise<boolean>}
 */
export function showAppConfirm(message, options = {}) {
  wireOnce();
  return openDialog({
    mode: 'confirm',
    message,
    title: options.title || t('common.confirm'),
    okLabel: options.okLabel || t('common.ok'),
    cancelLabel: options.cancelLabel || t('common.cancel'),
  }).then((v) => Boolean(v));
}

export function isAppAlertOpen() {
  return isOpen();
}
