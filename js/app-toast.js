/**
 * Brief bottom toast notifications.
 */

/** @type {HTMLElement|null} */
let toastEl = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let appToastTimer = null;

/**
 * @param {HTMLElement|null} el
 */
export function initAppToast(el) {
  toastEl = el;
}

/**
 * Brief bottom toast (success by default).
 * @param {string} message
 * @param {{ error?: boolean, ms?: number }} [opts]
 */
export function showAppToast(message, { error = false, ms = 4200 } = {}) {
  const el = toastEl;
  if (!el) return;
  if (appToastTimer) {
    clearTimeout(appToastTimer);
    appToastTimer = null;
  }
  el.hidden = false;
  el.textContent = String(message || '');
  el.classList.toggle('is-error', !!error);
  // Force reflow so re-show animates
  void el.offsetWidth;
  el.classList.add('is-visible');
  appToastTimer = setTimeout(() => {
    el.classList.remove('is-visible');
    appToastTimer = setTimeout(() => {
      el.hidden = true;
      el.textContent = '';
      appToastTimer = null;
    }, 240);
  }, ms);
}
