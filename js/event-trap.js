/**
 * Mobile browsers fire a synthetic `click` after touchend, often on whatever
 * is under the finger once a modal is removed. Stop the current event and
 * briefly swallow follow-up pointer/click events in capture phase.
 */

/** @type {ReturnType<typeof setTimeout> | null} */
let swallowTimer = null;
/** @type {((ev: Event) => void) | null} */
let swallowHandler = null;

function removeSwallow() {
  if (swallowHandler) {
    document.removeEventListener('click', swallowHandler, true);
    document.removeEventListener('pointerup', swallowHandler, true);
    document.removeEventListener('pointerdown', swallowHandler, true);
    document.removeEventListener('touchend', swallowHandler, true);
    document.removeEventListener('mouseup', swallowHandler, true);
    swallowHandler = null;
  }
  if (swallowTimer != null) {
    clearTimeout(swallowTimer);
    swallowTimer = null;
  }
}

/**
 * @param {Event} [e]
 * @param {{ ms?: number }} [opts] — how long to block ghost clicks (mobile needs ~350–500ms)
 */
export function trapModalCloseEvent(e, opts = {}) {
  const ms = opts.ms ?? 450;

  if (e) {
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === 'function') {
      e.stopImmediatePropagation();
    }
  }

  // Refresh window so repeated closes keep protection
  removeSwallow();

  swallowHandler = (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (typeof ev.stopImmediatePropagation === 'function') {
      ev.stopImmediatePropagation();
    }
  };

  document.addEventListener('click', swallowHandler, true);
  document.addEventListener('pointerup', swallowHandler, true);
  document.addEventListener('pointerdown', swallowHandler, true);
  document.addEventListener('touchend', swallowHandler, true);
  document.addEventListener('mouseup', swallowHandler, true);

  swallowTimer = setTimeout(removeSwallow, ms);
}
