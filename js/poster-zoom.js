/**
 * Fullscreen poster lightbox. Open from a hot-corner.
 * Dismiss: any key, or pointerdown outside the image / short tap on image.
 * Long-press image: open image URL in a new tab.
 *
 * On mobile, closing on pointerdown must swallow the synthetic click that
 * would otherwise hit the poster/grid under the finger.
 */

import { trapModalCloseEvent } from './event-trap.js';

const LONG_PRESS_MS = 550;

let open = false;
let wired = false;
/** Ignore dismiss until after the opening gesture finishes. */
let ignoreDismissUntil = 0;
/** @type {ReturnType<typeof setTimeout> | null} */
let longPressTimer = null;
let longPressFired = false;

function ensureUi() {
  let backdrop = document.getElementById('poster-zoom-backdrop');
  if (backdrop) return backdrop;
  backdrop = document.createElement('div');
  backdrop.id = 'poster-zoom-backdrop';
  backdrop.className = 'poster-zoom-backdrop hidden';
  backdrop.setAttribute('aria-hidden', 'true');
  backdrop.innerHTML = `
    <div class="poster-zoom-frame" role="dialog" aria-modal="true" aria-label="Enlarged poster">
      <div class="poster-zoom-loading" role="status" aria-live="polite">
        <div class="spinner" aria-hidden="true"></div>
        <span>Loading…</span>
      </div>
      <img class="poster-zoom-img" alt="" draggable="false" hidden />
    </div>
  `;
  document.body.appendChild(backdrop);
  wireImageLongPress(backdrop.querySelector('.poster-zoom-img'));
  return backdrop;
}

function setZoomLoading(backdrop, loading) {
  if (!backdrop) return;
  backdrop.classList.toggle('is-loading', loading);
  const status = backdrop.querySelector('.poster-zoom-loading');
  const img = backdrop.querySelector('.poster-zoom-img');
  if (status) status.hidden = !loading;
  if (img) {
    if (loading) img.setAttribute('hidden', '');
    else img.removeAttribute('hidden');
  }
}

function clearLongPress() {
  if (longPressTimer != null) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

function wireImageLongPress(img) {
  if (!img || img.dataset.longPressWired === '1') return;
  img.dataset.longPressWired = '1';

  img.addEventListener('pointerdown', (e) => {
    if (!open) return;
    // Primary button / touch only
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.stopPropagation();
    longPressFired = false;
    clearLongPress();
    longPressTimer = setTimeout(() => {
      longPressTimer = null;
      longPressFired = true;
      const src = img.currentSrc || img.src;
      if (!src) return;
      window.open(src, '_blank', 'noopener,noreferrer');
    }, LONG_PRESS_MS);
    try {
      img.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  });

  const endPress = (e) => {
    if (!open) return;
    const wasPending = longPressTimer != null;
    clearLongPress();
    try {
      if (e?.pointerId != null) img.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    // Short tap on image → dismiss (long-press already opened the URL)
    if (wasPending && !longPressFired) {
      dismiss(e);
    }
  };

  img.addEventListener('pointerup', endPress);
  img.addEventListener('pointercancel', () => {
    clearLongPress();
    longPressFired = false;
  });
  img.addEventListener('pointerleave', () => {
    // Only cancel if we didn't fire (still holding timer)
    if (longPressTimer != null) clearLongPress();
  });
  // Avoid mobile “save image” / callout competing with long-press
  img.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  });
}

function dismiss(e) {
  if (!open) return;
  if (Date.now() < ignoreDismissUntil) return;
  // Block ghost click/tap on elements revealed under the finger (mobile)
  trapModalCloseEvent(e, { ms: 500 });
  clearLongPress();
  longPressFired = false;
  const backdrop = document.getElementById('poster-zoom-backdrop');
  if (!backdrop) return;
  backdrop.classList.add('hidden');
  backdrop.setAttribute('aria-hidden', 'true');
  const img = backdrop.querySelector('.poster-zoom-img');
  if (img) {
    img.onload = null;
    img.onerror = null;
    img.removeAttribute('src');
    img.alt = '';
  }
  setZoomLoading(backdrop, false);
  open = false;
  document.dispatchEvent(new CustomEvent('pmi:modals-maybe-idle'));
}

function onPointerDownCapture(e) {
  if (!open) return;
  // Long-press / short-tap handled on the image itself
  if (e.target?.closest?.('.poster-zoom-img')) return;
  dismiss(e);
}

function wireDismiss() {
  if (wired) return;
  wired = true;
  document.addEventListener('pointerdown', onPointerDownCapture, true);
  document.addEventListener('keydown', dismiss, true);
}

/**
 * @param {string} url — full image URL
 * @param {string} [alt]
 */
export function showPosterZoom(url, alt = '') {
  const src = String(url || '').trim();
  if (!src) return;
  wireDismiss();
  const backdrop = ensureUi();
  const img = backdrop.querySelector('.poster-zoom-img');

  clearLongPress();
  longPressFired = false;
  setZoomLoading(backdrop, true);
  img.onload = null;
  img.onerror = null;
  img.removeAttribute('src');
  img.alt = alt || 'Poster';

  const finish = () => {
    if (!open) return;
    setZoomLoading(backdrop, false);
  };
  img.onload = finish;
  img.onerror = finish;

  img.src = src;
  if (img.complete && img.naturalWidth > 0) {
    finish();
  }

  backdrop.classList.remove('hidden');
  backdrop.setAttribute('aria-hidden', 'false');
  open = true;
  ignoreDismissUntil = Date.now() + 350;
}

/** Larger TMDB size for lightbox (grid uses w342). */
export function posterZoomUrl(posterPath) {
  if (!posterPath) return '';
  const p = String(posterPath);
  if (p.startsWith('http')) return p;
  const path = p.startsWith('/') ? p : `/${p}`;
  return `https://image.tmdb.org/t/p/w780${path}`;
}

/**
 * Attach a bottom-left hot corner to a positioned poster host.
 * @param {HTMLElement} host — position:relative container
 * @param {() => string} getUrl — full URL (or '') when clicked
 * @param {() => string} [getAlt]
 */
export function attachPosterHotCorner(host, getUrl, getAlt) {
  if (!host || host.querySelector('.poster-hot-corner')) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'poster-hot-corner';
  btn.setAttribute('aria-label', 'Enlarge poster');
  btn.tabIndex = 0;
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const url = typeof getUrl === 'function' ? getUrl() : '';
    if (!url) return;
    const alt = typeof getAlt === 'function' ? getAlt() : '';
    showPosterZoom(url, alt);
  });
  btn.addEventListener('pointerdown', (e) => e.stopPropagation());
  host.appendChild(btn);
}

export function isPosterZoomOpen() {
  return open;
}
