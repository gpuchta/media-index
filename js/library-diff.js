/**
 * Diff two movie library arrays for GitHub commit messages / save console.
 * Order of reported adds follows the "after" array; removes follow "before";
 * changes follow "after" (ES2015+ stable iteration / library order).
 */

/** Max titles listed per section (Added / Removed / Changed) in the commit message. */
export const LIBRARY_DIFF_MAX_PER_SECTION = 15;

/**
 * High-level field groups for change summaries (label → movie keys).
 * First matching group wins per key; unlisted keys → "other".
 */
const CHANGE_GROUPS = [
  { label: 'location', keys: ['location'] },
  { label: 'poster', keys: ['poster_path', 'posters'] },
  { label: 'keywords', keys: ['keywords'] },
  { label: 'title', keys: ['title'] },
  { label: 'overview', keys: ['overview'] },
  { label: 'genres', keys: ['genres'] },
  { label: 'directors', keys: ['directors'] },
  { label: 'actors', keys: ['actors'] },
  { label: 'collection', keys: ['collection'] },
  { label: 'companies', keys: ['production_companies'] },
  { label: 'votes', keys: ['vote_average', 'vote_count'] },
  { label: 'release', keys: ['released', 'year'] },
  { label: 'runtime', keys: ['runtime'] },
  { label: 'images', keys: ['backdrop_path', 'backdrops'] },
];

const KEY_TO_GROUP = (() => {
  /** @type {Map<string, string>} */
  const m = new Map();
  for (const g of CHANGE_GROUPS) {
    for (const k of g.keys) m.set(k, g.label);
  }
  return m;
})();

/**
 * Stable identity for matching movies across local/remote libraries.
 * @param {object|null|undefined} movie
 * @returns {string}
 */
export function movieKey(movie) {
  if (!movie || typeof movie !== 'object') return 'unknown:';
  if (movie.tmdb_id != null && String(movie.tmdb_id).trim() !== '') {
    return `tmdb:${String(movie.tmdb_id).trim()}`;
  }
  const title = String(movie.title || '')
    .trim()
    .toLowerCase();
  const year =
    movie.year != null && String(movie.year).trim() !== ''
      ? String(movie.year).trim()
      : String(movie.released || '').slice(0, 4);
  return `title:${title}|${year}`;
}

/**
 * Display label: "Title (year)" when year is available.
 * @param {object|null|undefined} movie
 * @returns {string}
 */
export function movieLabel(movie) {
  if (!movie || typeof movie !== 'object') return '(unknown)';
  const title = String(movie.title || '').trim() || 'Untitled';
  let year = '';
  if (movie.year != null && String(movie.year).trim() !== '') {
    year = String(movie.year).trim();
  } else if (movie.released) {
    year = String(movie.released).slice(0, 4);
  }
  return year ? `${title} (${year})` : title;
}

/**
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
function valuesEqual(a, b) {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (typeof a !== 'object' || typeof b !== 'object') {
    return String(a) === String(b);
  }
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/**
 * High-level labels for fields that differ between two movie objects.
 * @param {object} before
 * @param {object} after
 * @returns {string[]}
 */
export function changedFieldLabels(before, after) {
  const keys = new Set([
    ...Object.keys(before || {}),
    ...Object.keys(after || {}),
  ]);
  /** @type {Set<string>} */
  const groups = new Set();
  for (const key of keys) {
    if (valuesEqual(before?.[key], after?.[key])) continue;
    groups.add(KEY_TO_GROUP.get(key) || 'other');
  }
  // Stable order: CHANGE_GROUPS order, then "other"
  const ordered = [];
  for (const g of CHANGE_GROUPS) {
    if (groups.has(g.label)) ordered.push(g.label);
  }
  if (groups.has('other')) ordered.push('other');
  return ordered;
}

/**
 * @param {unknown} raw
 * @returns {object[]|null} null if not a JSON array
 */
export function parseLibraryJson(raw) {
  if (raw == null) return [];
  const text = String(raw).trim();
  if (!text) return [];
  try {
    const data = JSON.parse(text);
    if (!Array.isArray(data)) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Diff two libraries (remote/before vs local/after).
 * @param {object[]} before
 * @param {object[]} after
 * @returns {{
 *   added: { key: string, label: string, movie: object }[],
 *   removed: { key: string, label: string, movie: object }[],
 *   changed: { key: string, label: string, fields: string[], before: object, after: object }[],
 *   addedCount: number,
 *   removedCount: number,
 *   changedCount: number,
 *   totalTouched: number,
 * }}
 */
export function diffLibraries(before, after) {
  const beforeList = Array.isArray(before) ? before : [];
  const afterList = Array.isArray(after) ? after : [];

  /** @type {Map<string, object>} */
  const beforeMap = new Map();
  for (const m of beforeList) {
    const k = movieKey(m);
    if (!beforeMap.has(k)) beforeMap.set(k, m);
  }

  /** @type {Map<string, object>} */
  const afterMap = new Map();
  for (const m of afterList) {
    const k = movieKey(m);
    if (!afterMap.has(k)) afterMap.set(k, m);
  }

  /** @type {{ key: string, label: string, movie: object }[]} */
  const added = [];
  /** @type {{ key: string, label: string, fields: string[], before: object, after: object }[]} */
  const changed = [];

  // First-seen in after (library) order for stable unique reporting
  const seenAfter = new Set();
  for (const m of afterList) {
    const k = movieKey(m);
    if (seenAfter.has(k)) continue;
    seenAfter.add(k);
    if (!beforeMap.has(k)) {
      added.push({ key: k, label: movieLabel(m), movie: m });
    } else {
      const prev = beforeMap.get(k);
      const fields = changedFieldLabels(prev, m);
      if (fields.length) {
        changed.push({
          key: k,
          label: movieLabel(m),
          fields,
          before: prev,
          after: m,
        });
      }
    }
  }

  /** @type {{ key: string, label: string, movie: object }[]} */
  const removed = [];
  const seenBefore = new Set();
  for (const m of beforeList) {
    const k = movieKey(m);
    if (seenBefore.has(k)) continue;
    seenBefore.add(k);
    if (!afterMap.has(k)) {
      removed.push({ key: k, label: movieLabel(m), movie: m });
    }
  }

  return {
    added,
    removed,
    changed,
    addedCount: added.length,
    removedCount: removed.length,
    changedCount: changed.length,
    totalTouched: added.length + removed.length + changed.length,
  };
}

/**
 * Subject line, e.g. "Update library: +2 −1 ~4 movies"
 * @param {ReturnType<typeof diffLibraries>} diff
 * @param {{ create?: boolean }} [opts]
 * @returns {string}
 */
export function formatLibraryDiffSubject(diff, opts = {}) {
  if (opts.create) {
    const n = diff.addedCount;
    return n === 1
      ? 'Create library with 1 movie'
      : `Create library with ${n} movies`;
  }
  const a = diff.addedCount;
  const r = diff.removedCount;
  const c = diff.changedCount;
  if (a === 0 && r === 0 && c === 0) {
    return 'Update library: no movie changes';
  }
  return `Update library: +${a} −${r} ~${c} movies`;
}

/**
 * @param {string[]} lines — already formatted "- Title…" lines
 * @param {number} maxPerSection — Infinity = no truncate
 * @returns {string[]}
 */
function truncateSectionLines(lines, maxPerSection) {
  if (!Number.isFinite(maxPerSection) || lines.length <= maxPerSection) {
    return lines.slice();
  }
  const head = lines.slice(0, maxPerSection);
  const more = lines.length - maxPerSection;
  head.push(`… and ${more} more`);
  return head;
}

/**
 * Format full commit-style message (subject + body).
 * Each of Added / Removed / Changed truncates independently when maxPerSection is finite.
 *
 * @param {ReturnType<typeof diffLibraries>} diff
 * @param {{
 *   maxPerSection?: number,
 *   create?: boolean,
 * }} [opts]
 * @returns {string}
 */
export function formatLibraryCommitMessage(diff, opts = {}) {
  const max =
    opts.maxPerSection === undefined
      ? LIBRARY_DIFF_MAX_PER_SECTION
      : opts.maxPerSection;

  const subject = formatLibraryDiffSubject(diff, { create: opts.create });
  const parts = [subject];

  if (diff.addedCount) {
    parts.push('');
    parts.push('Added:');
    const lines = diff.added.map((e) => `- ${e.label}`);
    parts.push(...truncateSectionLines(lines, max));
  }

  if (diff.removedCount) {
    parts.push('');
    parts.push('Removed:');
    const lines = diff.removed.map((e) => `- ${e.label}`);
    parts.push(...truncateSectionLines(lines, max));
  }

  if (diff.changedCount) {
    parts.push('');
    parts.push('Changed:');
    const lines = diff.changed.map((e) => {
      const fields = e.fields.length ? e.fields.join(', ') : 'other';
      return `- ${e.label}: ${fields}`;
    });
    parts.push(...truncateSectionLines(lines, max));
  }

  return parts.join('\n');
}
