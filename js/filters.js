import { FILTER_TYPES, TYPEAHEAD_GROUP_ORDER } from './config.js';
import { movieYear } from './utils.js';

const FILTER_TYPE_SET = new Set(FILTER_TYPES);

/**
 * A leaf filter: { type, value, not }
 * Collection of leaves is automatically compiled into an AND of type-groups,
 * each type-group OR-ing its leaves (with per-leaf NOT).
 */

export function leafKey(leaf) {
  return `${leaf.not ? '1' : '0'}|${leaf.type}|${String(leaf.value).toLowerCase()}`;
}

export function normalizeValue(type, raw) {
  const v = String(raw).trim();
  if (type === 'vote') {
    return String(parseInt(v.replace(/%/g, ''), 10));
  }
  return v;
}

export function displayLabel(leaf) {
  if (leaf.type === 'vote') {
    return `≥ ${leaf.value}%`;
  }
  if (leaf.type === 'year') {
    return leaf.value;
  }
  return leaf.value;
}

/**
 * Leading `-` means "add as NOT …" for **any** filter type, except bare
 * year ranges `YYYY-YYYY` which use an internal hyphen (e.g. `1990-2000`).
 *
 * Examples (all types):
 *   -2010              → NOT year
 *   -genre:Action      → NOT genre Action
 *   -actor:Jude Law    → NOT actor
 *   -Jude              → typeahead still matches; free-text may exact-match
 *   -1990-2000         → NOT year range
 */
export function stripLeadingNot(text) {
  const t = String(text || '').trim();
  if (!t) return { not: false, text: '' };
  if (/^\d{4}-\d{4}$/.test(t)) return { not: false, text: t };
  if (t.startsWith('-') && t.length > 1) {
    return { not: true, text: t.slice(1).trim() };
  }
  return { not: false, text: t };
}

/**
 * Exact case-insensitive match against typeahead index values (all types).
 * Prefers TYPEAHEAD_GROUP_ORDER when the same string exists in multiple types.
 */
function leafFromExactIndexMatch(text, typeaheadIndex, not) {
  if (!typeaheadIndex || !text) return null;
  const q = text.toLowerCase();
  for (const type of TYPEAHEAD_GROUP_ORDER) {
    const values = typeaheadIndex[type] || [];
    for (const value of values) {
      if (String(value).toLowerCase() === q) {
        return { type, value, not };
      }
    }
  }
  return null;
}

/**
 * Parse free-text Enter into a leaf, or null if empty.
 * Optional leading `-` sets not:true for every filter type.
 *
 * Resolution order:
 * 1. Explicit `type:value` (any FILTER_TYPES key)
 * 2. Year range / year / vote patterns
 * 3. Exact match in typeahead index (genre, actor, director, …)
 * 4. Keyword
 *
 * @param {string} text
 * @param {Record<string, string[]>|null} [typeaheadIndex]
 */
export function leafFromFreeText(text, typeaheadIndex = null) {
  const { not, text: body } = stripLeadingNot(text);
  const t = body.trim();
  if (!t) return null;

  // Explicit type:value for all filter types (quoted value optional)
  const typed = /^([a-zA-Z_]+):(.+)$/.exec(t);
  if (typed) {
    const type = typed[1].toLowerCase();
    let value = typed[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (FILTER_TYPE_SET.has(type) && value) {
      return { type, value, not };
    }
  }

  const yearRange = /^(\d{4})-(\d{4})$/.exec(t);
  if (yearRange) {
    return { type: 'year', value: `${yearRange[1]}-${yearRange[2]}`, not };
  }
  if (/^\d{4}$/.test(t)) {
    return { type: 'year', value: t, not };
  }

  const vote = /^(?:(\d{1,3})%?)$/.exec(t);
  if (vote) {
    const n = parseInt(vote[1], 10);
    if (n >= 0 && n <= 100) {
      return { type: 'vote', value: String(n), not };
    }
  }

  const exact = leafFromExactIndexMatch(t, typeaheadIndex, not);
  if (exact) return exact;

  return { type: 'keyword', value: t, not };
}

export function addLeaf(leaves, leaf) {
  const next = { ...leaf, value: normalizeValue(leaf.type, leaf.value), not: !!leaf.not };

  if (next.type === 'vote') {
    // Single vote threshold: replace any existing vote leaf
    const without = leaves.filter((l) => l.type !== 'vote');
    return [...without, next];
  }

  const key = leafKey(next);
  if (leaves.some((l) => leafKey(l) === key)) return leaves;
  return [...leaves, next];
}

export function toggleLeafNot(leaves, index) {
  return leaves.map((l, i) => (i === index ? { ...l, not: !l.not } : l));
}

export function removeLeaf(leaves, index) {
  return leaves.filter((_, i) => i !== index);
}

/** Keep only the leaf at index; drop all others. */
export function removeOtherLeaves(leaves, index) {
  if (index < 0 || index >= leaves.length) return leaves.slice();
  return [leaves[index]];
}

function matchesLeaf(movie, leaf) {
  const val = String(leaf.value).toLowerCase();
  let hit = false;

  switch (leaf.type) {
    case 'title': {
      // Exact match when picking a full title from typeahead
      hit = String(movie.title || '').toLowerCase() === val;
      break;
    }
    case 'location': {
      const loc = String(movie.location || '').toLowerCase();
      hit = loc.includes(val);
      break;
    }
    case 'director': {
      const list = movie.directors || [];
      hit = list.some((d) => String(d).toLowerCase() === val);
      break;
    }
    case 'actor': {
      const list = movie.actors || [];
      hit = list.some((a) => String(a).toLowerCase() === val);
      break;
    }
    case 'collection': {
      hit = String(movie.collection || '').toLowerCase() === val;
      break;
    }
    case 'company': {
      const list = movie.production_companies || [];
      hit = list.some((c) => String(c).toLowerCase() === val);
      break;
    }
    case 'keyword': {
      const list = movie.keywords || [];
      hit = list.some((k) => String(k).toLowerCase().includes(val));
      break;
    }
    case 'genre': {
      const list = movie.genres || [];
      hit = list.some((g) => String(g).toLowerCase() === val);
      break;
    }
    case 'year': {
      const y = movieYear(movie);
      if (val.includes('-')) {
        const [a, b] = val.split('-').map((x) => parseInt(x, 10));
        hit = y >= a && y <= b;
      } else {
        hit = y === parseInt(val, 10);
      }
      break;
    }
    case 'vote': {
      const threshold = parseInt(val, 10) / 10;
      const avg = Number(movie.vote_average) || 0;
      hit = avg >= threshold;
      break;
    }
    default:
      hit = false;
  }

  return leaf.not ? !hit : hit;
}

/**
 * Within one filter type:
 *   - positive leaves → OR  (match any)
 *   - negated leaves  → AND (must satisfy every NOT)
 *   - if both: (positives OR…) AND (each NOT…)
 * Across types: AND.
 * Empty leaves → all movies match.
 */
export function matchesTypeGroup(movie, group) {
  if (!group.length) return true;
  const positives = group.filter((l) => !l.not);
  const negatives = group.filter((l) => l.not);
  if (positives.length) {
    const anyPos = positives.some((leaf) => matchesLeaf(movie, leaf));
    if (!anyPos) return false;
  }
  if (negatives.length) {
    const allNeg = negatives.every((leaf) => matchesLeaf(movie, leaf));
    if (!allNeg) return false;
  }
  return true;
}

/** Separator label between two consecutive chips of the same type (UI). */
export function sameTypeJoinLabel(prevLeaf, nextLeaf) {
  if (!prevLeaf.not && !nextLeaf.not) return 'OR';
  return 'AND';
}

export function applyFilters(movies, leaves) {
  if (!leaves.length) return movies.slice();

  const byType = new Map();
  for (const leaf of leaves) {
    if (!byType.has(leaf.type)) byType.set(leaf.type, []);
    byType.get(leaf.type).push(leaf);
  }

  return movies.filter((movie) => {
    for (const group of byType.values()) {
      if (!matchesTypeGroup(movie, group)) return false;
    }
    return true;
  });
}

/**
 * Build typeahead index from movies: Map type -> sorted unique values.
 * Includes 4-digit release years from `year` / `released`.
 */
export function buildTypeaheadIndex(movies) {
  const sets = {
    title: new Set(),
    genre: new Set(),
    year: new Set(),
    location: new Set(),
    director: new Set(),
    actor: new Set(),
    collection: new Set(),
    company: new Set(),
    keyword: new Set(),
  };

  for (const m of movies) {
    if (m.title) sets.title.add(String(m.title));
    for (const g of m.genres || []) if (g) sets.genre.add(String(g));
    const y = movieYear(m);
    if (y >= 1000 && y <= 9999) sets.year.add(String(y));
    if (m.location) sets.location.add(String(m.location));
    for (const d of m.directors || []) if (d) sets.director.add(String(d));
    for (const a of m.actors || []) if (a) sets.actor.add(String(a));
    if (m.collection) sets.collection.add(String(m.collection));
    for (const c of m.production_companies || []) if (c) sets.company.add(String(c));
    for (const k of m.keywords || []) if (k) sets.keyword.add(String(k));
  }

  const index = {};
  for (const [type, set] of Object.entries(sets)) {
    if (type === 'year') {
      // Newest first when browsing years
      index[type] = Array.from(set).sort((a, b) => Number(b) - Number(a));
    } else {
      index[type] = Array.from(set).sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: 'base' })
      );
    }
  }
  return index;
}

/**
 * Query typeahead; returns [{ type, value }] grouped, limited.
 * Order follows TYPEAHEAD_GROUP_ORDER (year before keyword).
 */
export function queryTypeahead(index, query, limit = 40) {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const results = [];
  for (const type of TYPEAHEAD_GROUP_ORDER) {
    const values = index[type] || [];
    for (const value of values) {
      if (String(value).toLowerCase().includes(q)) {
        results.push({ type, value: String(value) });
        if (results.length >= limit) return results;
      }
    }
  }
  return results;
}

export function sortMovies(movies, sortId) {
  const list = movies.slice();
  const cmpTitle = (a, b) =>
    String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' });

  switch (sortId) {
    case 'title-asc':
      list.sort((a, b) => cmpTitle(a, b) || movieYear(b) - movieYear(a));
      break;
    case 'title-desc':
      list.sort((a, b) => cmpTitle(b, a) || movieYear(b) - movieYear(a));
      break;
    case 'released-asc':
      list.sort((a, b) => {
        const ka = releaseKey(a);
        const kb = releaseKey(b);
        return ka.localeCompare(kb) || cmpTitle(a, b);
      });
      break;
    case 'released-desc':
    default:
      list.sort((a, b) => {
        const ka = releaseKey(a);
        const kb = releaseKey(b);
        return kb.localeCompare(ka) || cmpTitle(a, b);
      });
      break;
  }
  return list;
}

function releaseKey(movie) {
  if (movie.released) return String(movie.released);
  const y = movieYear(movie);
  return y ? `${y}-01-01` : '0000-00-00';
}
