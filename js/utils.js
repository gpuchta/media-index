import { CONFIG } from './config.js';

export function posterUrl(posterPath) {
  if (!posterPath) return '';
  if (posterPath.startsWith('http')) return posterPath;
  const path = posterPath.startsWith('/') ? posterPath : `/${posterPath}`;
  return `${CONFIG.TMDB_IMAGE_BASE}${path}`;
}

/**
 * Promote selected alternate to poster_path.
 *
 * If current poster_path differs from selected path:
 * 1. Add current poster_path to the alternate posters collection if not already present
 * 2. Set poster_path to the selected path
 * 3. Remove selected from posters so the primary is not duplicated in the collection
 *
 * Only path removal for missing files (404) is handled elsewhere.
 * @returns {{ posterPath: string, posters: string[] }}
 */
export function promotePosterSelection(posters, currentPath, selectedPath) {
  let list = Array.isArray(posters) ? posters.map(String).filter(Boolean) : [];
  const cur = currentPath ? String(currentPath) : '';
  const sel = selectedPath ? String(selectedPath) : '';

  if (!sel) {
    // No selection: keep current primary; ensure it is not duplicated in alternates
    if (cur) list = list.filter((p) => p !== cur);
    return { posterPath: cur, posters: list };
  }

  if (cur && cur !== sel) {
    // Demote current primary into alternates if missing
    if (!list.includes(cur)) list.push(cur);
  }

  // Selected becomes primary — drop it from alternates to avoid duplicates
  list = list.filter((p) => p !== sel);

  return { posterPath: sel, posters: list };
}

/** @deprecated use promotePosterSelection */
export function swapPosterSelection(posters, currentPath, selectedPath) {
  return promotePosterSelection(posters, currentPath, selectedPath);
}

/**
 * Merge poster path lists without dropping entries (first-seen order).
 */
export function mergePosterLists(...lists) {
  const out = [];
  const seen = new Set();
  for (const list of lists) {
    if (!list) continue;
    const arr = Array.isArray(list) ? list : [list];
    for (const p of arr) {
      if (!p) continue;
      const s = String(p);
      if (seen.has(s)) continue;
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}


export function formatRuntime(minutes) {
  if (minutes == null || minutes === '' || Number.isNaN(Number(minutes))) return '—';
  const m = Math.round(Number(minutes));
  if (m <= 0) return '—';
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h === 0) return `${rem} min`;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

export function movieYear(movie) {
  if (movie.year != null && movie.year !== '') {
    const y = parseInt(String(movie.year), 10);
    if (!Number.isNaN(y)) return y;
  }
  if (movie.released) {
    const y = parseInt(String(movie.released).slice(0, 4), 10);
    if (!Number.isNaN(y)) return y;
  }
  return 0;
}

export function releaseSortKey(movie) {
  if (movie.released) return String(movie.released);
  const y = movieYear(movie);
  return y ? `${y}-01-01` : '';
}

/**
 * Export download name from CONFIG.DATA_PATH (basename only, no timestamp).
 * e.g. `data/media-index.json` → `media-index.json`
 */
export function formatExportFilename(dataPath) {
  const path = String(dataPath || '').replace(/\\/g, '/');
  const base = path.split('/').filter(Boolean).pop();
  return base || 'media-index.json';
}

export function downloadJson(filename, data) {
  const text = JSON.stringify(data, null, 2);
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Whether Enter should stay with the focused control instead of activating a
 * dialog primary action (Save / OK / Search / Close).
 *
 * Defers for text-like inputs (native form submit / field commit), textarea,
 * select, color/file/range, contenteditable, and focused buttons/links.
 * Checkbox/radio do not reserve Enter so the dialog primary can still run.
 *
 * @param {EventTarget|null|undefined} target
 * @returns {boolean}
 */
export function isEnterReservedByTarget(target) {
  if (!target || !(target instanceof Element)) return false;

  if (target.closest('textarea, [contenteditable="true"]')) return true;
  if (target.closest('select')) return true;

  const input = target.closest('input');
  if (input) {
    const type = String(input.type || 'text').toLowerCase();
    // Typing / form fields — leave Enter to the field or form
    if (
      type === 'text' ||
      type === 'search' ||
      type === 'email' ||
      type === 'url' ||
      type === 'tel' ||
      type === 'password' ||
      type === 'number' ||
      type === 'date' ||
      type === 'datetime-local' ||
      type === 'month' ||
      type === 'week' ||
      type === 'time'
    ) {
      return true;
    }
    // Color picker, file, range — Enter is for the control, not Save
    if (type === 'color' || type === 'file' || type === 'range') return true;
    // submit/button inputs act like buttons
    if (type === 'submit' || type === 'button' || type === 'reset' || type === 'image') {
      return true;
    }
    // checkbox / radio: do not reserve — dialog Enter = primary action
    return false;
  }

  // Focused actionable control: Enter activates it natively
  if (target.closest('button, a[href], [role="button"], summary')) return true;

  return false;
}

/**
 * True if the keydown is a plain Enter (no modifiers) that a dialog may map
 * to its primary action.
 * @param {KeyboardEvent} e
 * @returns {boolean}
 */
export function isPrimaryActionEnter(e) {
  if (!e) return false;
  if (e.key !== 'Enter' && e.code !== 'Enter' && e.code !== 'NumpadEnter') {
    return false;
  }
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return false;
  if (e.isComposing) return false;
  return !isEnterReservedByTarget(e.target);
}

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/**
 * Briefly show "Copied" / "Copy failed" on a Copy button, then restore.
 * Text buttons: swap label text. Icon buttons (`data-copy-mode="icon"`):
 * update aria-label/title and a success/fail class without destroying SVG.
 * @param {HTMLElement|null|undefined} btn
 * @param {'ok'|'fail'} [status]
 */
export function flashCopyButton(btn, status = 'ok') {
  if (!btn) return;
  const label = status === 'fail' ? 'Copy failed' : 'Copied';
  const ms = status === 'fail' ? 2000 : 1500;
  const iconMode = btn.dataset.copyMode === 'icon';

  if (iconMode) {
    if (!btn.dataset.copyDefaultLabel) {
      btn.dataset.copyDefaultLabel = btn.getAttribute('aria-label') || 'Copy key';
    }
    const prevLabel = btn.dataset.copyDefaultLabel;
    btn.setAttribute('aria-label', label);
    btn.setAttribute('title', label);
    btn.classList.remove('is-copy-ok', 'is-copy-fail');
    btn.classList.add(status === 'fail' ? 'is-copy-fail' : 'is-copy-ok');
    window.setTimeout(() => {
      if (!btn.isConnected) return;
      btn.setAttribute('aria-label', prevLabel);
      btn.setAttribute('title', prevLabel);
      btn.classList.remove('is-copy-ok', 'is-copy-fail');
    }, ms);
    return;
  }

  btn.textContent = label;
  window.setTimeout(() => {
    if (btn.isConnected) btn.textContent = 'Copy';
  }, ms);
}

/**
 * Copy plain text to the clipboard (Clipboard API with textarea fallback).
 * @param {string} text
 * @returns {Promise<void>}
 */
export async function copyTextToClipboard(text) {
  const value = String(text ?? '');
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = value;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  ta.remove();
}
