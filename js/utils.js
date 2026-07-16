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
