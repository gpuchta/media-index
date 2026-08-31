import { t } from './i18n.js';
import {
  BINDER_FILTER_OPTIONS,
  BINDER_NOTATION_OPTIONS,
  CONFIG,
  FILTER_TYPES,
  TYPEAHEAD_GROUP_ORDER,
  compileBinderRegexes,
  getStoredBinderCustomPatterns,
  getStoredBinderNotationId,
  resolveBinderPatternSources,
} from './config.js';
import { movieYear } from './utils.js';

const FILTER_TYPE_SET = new Set(FILTER_TYPES);

/**
 * Active binder matchers (from Settings notation). Null until first apply/lazy load.
 * @type {RegExp[]|null}
 */
let activeBinderRegexes = null;

/**
 * Apply binder notation rules used by isBinderLocation / binder:yes filter.
 * Does not write localStorage — callers persist via setStored* when saving Settings.
 * @param {unknown} [notationId]
 * @param {unknown} [customText]
 * @returns {{
 *   id: string,
 *   sources: string[],
 *   regexes: RegExp[],
 *   errors: { source: string, message: string }[],
 * }}
 */
export function applyBinderNotation(notationId, customText) {
  const id =
    notationId != null && String(notationId).trim() !== ''
      ? String(notationId).trim()
      : getStoredBinderNotationId();
  const custom =
    customText != null
      ? String(customText)
      : getStoredBinderCustomPatterns();
  const sources = resolveBinderPatternSources(id, custom);
  const { regexes, errors } = compileBinderRegexes(sources);
  // Fall back to default letter+page if every pattern is invalid
  if (!regexes.length) {
    const fallback = compileBinderRegexes(
      resolveBinderPatternSources(CONFIG.BINDER_NOTATION_DEFAULT, '')
    );
    activeBinderRegexes = fallback.regexes;
  } else {
    activeBinderRegexes = regexes;
  }
  return { id, sources, regexes: activeBinderRegexes, errors };
}

/** Ensure matchers exist (load from storage once). */
function ensureBinderRegexes() {
  if (!activeBinderRegexes) {
    applyBinderNotation();
  }
  return activeBinderRegexes || [];
}

/**
 * Whether a location string counts as a physical binder slot under the
 * active Settings notation (letter+page, color, roman, emoji, or custom).
 * Empty location is never a binder.
 * @param {unknown} location
 * @returns {boolean}
 */
export function isBinderLocation(location) {
  const s = String(location || '').trim();
  if (!s) return false;
  const regexes = ensureBinderRegexes();
  for (const re of regexes) {
    // Reset sticky/global lastIndex if any future flags add them
    re.lastIndex = 0;
    if (re.test(s)) return true;
  }
  return false;
}

/**
 * Count movies whose location matches the given regex list (or active rules).
 * @param {object[]} movies
 * @param {RegExp[]} [regexes]
 * @returns {number}
 */
export function countBinderMatches(movies, regexes) {
  const list = Array.isArray(movies) ? movies : [];
  const matchers = regexes || ensureBinderRegexes();
  let n = 0;
  for (const m of list) {
    const s = String(m?.location || '').trim();
    if (!s) continue;
    for (const re of matchers) {
      re.lastIndex = 0;
      if (re.test(s)) {
        n += 1;
        break;
      }
    }
  }
  return n;
}

/**
 * Test one location against the given (or active) binder rules.
 * @param {unknown} location
 * @param {RegExp[]} [regexes]
 * @returns {boolean}
 */
export function testBinderLocation(location, regexes) {
  const s = String(location || '').trim();
  if (!s) return false;
  const matchers = regexes || ensureBinderRegexes();
  for (const re of matchers) {
    re.lastIndex = 0;
    if (re.test(s)) return true;
  }
  return false;
}

/** @returns {typeof BINDER_NOTATION_OPTIONS} */
export function getBinderNotationOptions() {
  return BINDER_NOTATION_OPTIONS;
}

const BINDER_YES_ALIASES = new Set([
  'yes',
  'true',
  '1',
  'in',
  'in binder',
  'binder',
  'binders',
]);
const BINDER_NO_ALIASES = new Set([
  'no',
  'false',
  '0',
  'out',
  'not',
  'not in binder',
  'non-binder',
  'nonbinder',
  'digital',
]);

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
  if (type === 'binder') {
    const lc = v.toLowerCase();
    if (BINDER_NO_ALIASES.has(lc) || lc.includes('not in binder')) return 'no';
    if (BINDER_YES_ALIASES.has(lc) || lc === 'in binder') return 'yes';
    // binder:yes / binder:no already lowercased via aliases; unknown → yes
    if (lc === 'no' || lc.startsWith('not')) return 'no';
    return 'yes';
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
  if (leaf.type === 'binder') {
    const v = normalizeValue('binder', leaf.value);
    return v === 'no' ? t('filter.binder.no') : t('filter.binder.yes');
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

  // Bare phrases → binder filter (before year/vote so "no" is not vote 0)
  const binderPhrase = /^not\s+in\s+binder$/i.test(t)
    ? 'no'
    : /^(?:in\s+)?binders?$/i.test(t)
      ? 'yes'
      : null;
  if (binderPhrase) {
    return { type: 'binder', value: binderPhrase, not };
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

  if (next.type === 'binder') {
    // Single binder mode: replace any existing binder leaf
    const without = leaves.filter((l) => l.type !== 'binder');
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

/**
 * Location filter match (case-insensitive).
 *
 * Binder-aware forms (letter + optional page, default notation A1 / F42):
 * - Binder only:  "A"     → location "A" or "A1"…"A999" (not "Amazon")
 * - Binder range: "A-C"   → any binder letter in A…C inclusive (OR of binders)
 * - Binder page:  "A1"    → exact slot "A1" (not "A10")
 *
 * Anything else keeps partial substring match (e.g. "Amazon", "Cinema", "12").
 *
 * @param {unknown} movieLocation
 * @param {unknown} filterValue raw leaf value (not necessarily lowercased)
 * @returns {boolean}
 */
export function matchesLocationFilter(movieLocation, filterValue) {
  const loc = String(movieLocation || '').trim();
  const val = String(filterValue || '').trim();
  if (!val || !loc) return false;

  const locLc = loc.toLowerCase();
  const valLc = val.toLowerCase();

  // Inclusive binder letter range: A-C, c-a (order-insensitive)
  const rangeM = /^([a-z])-([a-z])$/i.exec(val);
  if (rangeM) {
    let a = rangeM[1].toLowerCase().charCodeAt(0);
    let b = rangeM[2].toLowerCase().charCodeAt(0);
    if (a > b) {
      const t = a;
      a = b;
      b = t;
    }
    const slot = /^([a-z])(?:\d{1,3})?$/i.exec(loc);
    if (!slot) return false;
    const letter = slot[1].toLowerCase().charCodeAt(0);
    return letter >= a && letter <= b;
  }

  // Single binder letter: A → A, A1, A42 (not Amazon / FandangoNOW)
  if (/^[a-z]$/i.test(val)) {
    return new RegExp(`^${valLc}(?:\\d{1,3})?$`, 'i').test(loc);
  }

  // Full binder slot: A1 / F42 → exact match only
  if (/^[a-z]\d{1,3}$/i.test(val)) {
    return locLc === valLc;
  }

  // Free-form / digital labels: partial substring
  return locLc.includes(valLc);
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
      hit = matchesLocationFilter(movie.location, leaf.value);
      break;
    }
    case 'binder': {
      const inBinder = isBinderLocation(movie.location);
      const want = normalizeValue('binder', leaf.value);
      hit = want === 'no' ? !inBinder : inBinder;
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
    case 'format': {
      const list = movie.format || [];
      hit = list.some((f) => String(f).toLowerCase() === val);
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
 * Letter-page binder slot: A1, F42 → binder letter "A" / "F".
 * Used to surface binder-only typeahead entries (whole binder filter).
 * @param {unknown} location
 * @returns {string|null} uppercase binder letter, or null
 */
function binderLetterFromLocation(location) {
  const s = String(location || '').trim();
  const m = /^([A-Za-z])\d{1,3}$/.exec(s);
  return m ? m[1].toUpperCase() : null;
}

/**
 * Shared collator for case/accent-insensitive order.
 * `localeCompare(..., { sensitivity: 'base' })` constructs a Collator on every
 * comparison; with ~34k unique actors that blocked first paint for seconds.
 */
const BASE_COLLATOR = new Intl.Collator(undefined, { sensitivity: 'base' });

function compareBaseStrings(a, b) {
  return BASE_COLLATOR.compare(a, b);
}

/**
 * Yield so the browser can paint and handle input between index chunks.
 * Prefer `scheduler.yield()` when present (Chrome); otherwise a macrotask.
 */
function yieldToMain() {
  const sched = globalThis.scheduler;
  if (sched && typeof sched.yield === 'function') return sched.yield();
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/** Native-sort this many values in one turn; larger lists split and merge. */
const TYPEAHEAD_SORT_CHUNK = 4000;

function mergeSorted(left, right, cmp) {
  const out = new Array(left.length + right.length);
  let i = 0;
  let j = 0;
  let k = 0;
  while (i < left.length && j < right.length) {
    out[k++] = cmp(left[i], right[j]) <= 0 ? left[i++] : right[j++];
  }
  while (i < left.length) out[k++] = left[i++];
  while (j < right.length) out[k++] = right[j++];
  return out;
}

/**
 * @param {string[]} arr
 * @param {(a: string, b: string) => number} cmp
 * @param {() => boolean} [isCancelled]
 * @returns {Promise<string[]|null>}
 */
async function sortYielding(arr, cmp, isCancelled) {
  if (arr.length <= TYPEAHEAD_SORT_CHUNK) {
    arr.sort(cmp);
    return arr;
  }
  const mid = arr.length >> 1;
  const left = await sortYielding(arr.slice(0, mid), cmp, isCancelled);
  if (!left || (isCancelled && isCancelled())) return null;
  await yieldToMain();
  const right = await sortYielding(arr.slice(mid), cmp, isCancelled);
  if (!right || (isCancelled && isCancelled())) return null;
  await yieldToMain();
  return mergeSorted(left, right, cmp);
}

function collectTypeaheadSets(movies) {
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
    format: new Set(),
  };

  for (const m of movies) {
    if (m.title) sets.title.add(String(m.title));
    for (const g of m.genres || []) if (g) sets.genre.add(String(g));
    const y = movieYear(m);
    if (y >= 1000 && y <= 9999) sets.year.add(String(y));
    if (m.location) {
      const loc = String(m.location);
      sets.location.add(loc);
      const letter = binderLetterFromLocation(loc);
      if (letter) sets.location.add(letter);
    }
    for (const d of m.directors || []) if (d) sets.director.add(String(d));
    for (const a of m.actors || []) if (a) sets.actor.add(String(a));
    if (m.collection) sets.collection.add(String(m.collection));
    for (const c of m.production_companies || []) if (c) sets.company.add(String(c));
    for (const k of m.keywords || []) if (k) sets.keyword.add(String(k));
    for (const f of m.format || []) if (f) sets.format.add(String(f));
  }
  return sets;
}

function sortTypeaheadValues(type, values) {
  if (type === 'year') {
    // Newest first when browsing years
    values.sort((a, b) => Number(b) - Number(a));
    return values;
  }
  if (type === 'location') {
    // Binder letters before their page slots (A, A1, A2…); then other labels
    values.sort(compareLocationTypeahead);
    return values;
  }
  values.sort(compareBaseStrings);
  return values;
}

function indexFromTypeaheadSets(sets) {
  /** @type {Record<string, string[]>} */
  const index = {};
  for (const [type, set] of Object.entries(sets)) {
    index[type] = sortTypeaheadValues(type, Array.from(set));
  }
  index.binder = BINDER_FILTER_OPTIONS.map((o) => o.value);
  return index;
}

/**
 * Build typeahead index from movies: Map type -> sorted unique values.
 * Includes 4-digit release years from `year` / `released`.
 * Location index also includes binder letters (A, B, C…) derived from
 * letter+page slots so typeahead can pick a whole binder, not only A1.
 *
 * Synchronous build. Prefer {@link buildTypeaheadIndexAsync} after first paint
 * so sorting tens of thousands of names does not delay LCP.
 */
export function buildTypeaheadIndex(movies) {
  return indexFromTypeaheadSets(collectTypeaheadSets(movies));
}

/**
 * Same index as {@link buildTypeaheadIndex}, yielding between types and
 * splitting large sorts so a 30k+ actor list does not monopolize the main thread.
 *
 * @param {object[]} movies
 * @param {{ isCancelled?: () => boolean }} [opts]
 * @returns {Promise<Record<string, string[]>|null>} null if cancelled
 */
export async function buildTypeaheadIndexAsync(movies, opts = {}) {
  const isCancelled = opts.isCancelled || (() => false);
  const sets = collectTypeaheadSets(movies);
  if (isCancelled()) return null;

  /** @type {Record<string, string[]>} */
  const index = {};
  for (const [type, set] of Object.entries(sets)) {
    if (isCancelled()) return null;
    await yieldToMain();
    if (isCancelled()) return null;
    const values = Array.from(set);
    if (type === 'year') {
      index[type] = sortTypeaheadValues(type, values);
    } else {
      const cmp = type === 'location' ? compareLocationTypeahead : compareBaseStrings;
      const sorted = await sortYielding(values, cmp, isCancelled);
      if (!sorted) return null;
      index[type] = sorted;
    }
  }
  if (isCancelled()) return null;
  index.binder = BINDER_FILTER_OPTIONS.map((o) => o.value);
  return index;
}

/**
 * Rank a location for binder-aware order: A1…An, B1…Bn, then free-form, empty last.
 * @param {unknown} location
 * @returns {{ kind: number, letter: string, page: number, raw: string }}
 */
function locationSortKey(location) {
  const t = String(location || '').trim();
  if (!t) {
    return { kind: 2, letter: '', page: 0, raw: '' };
  }
  if (/^[A-Za-z]$/.test(t)) {
    return { kind: 0, letter: t.toUpperCase(), page: -1, raw: t };
  }
  const slot = /^([A-Za-z])(\d{1,3})$/.exec(t);
  if (slot) {
    return {
      kind: 0,
      letter: slot[1].toUpperCase(),
      page: parseInt(slot[2], 10),
      raw: t,
    };
  }
  // Streaming / free-form labels after physical binders
  return { kind: 1, letter: '', page: 0, raw: t };
}

/**
 * Compare locations: binder slots A1…An, B1…Bn (numeric page), then free-form
 * labels (Amazon, …), then empty. Case-insensitive letter order.
 * @param {unknown} a
 * @param {unknown} b
 * @returns {number}
 */
export function compareLocations(a, b) {
  const ra = locationSortKey(a);
  const rb = locationSortKey(b);
  if (ra.kind !== rb.kind) return ra.kind - rb.kind;
  if (ra.kind === 0) {
    if (ra.letter !== rb.letter) {
      return BASE_COLLATOR.compare(ra.letter, rb.letter);
    }
    // Binder letter alone (page -1) before A1, A2, …; pages numeric
    if (ra.page !== rb.page) return ra.page - rb.page;
  }
  return BASE_COLLATOR.compare(ra.raw, rb.raw);
}

/** Typeahead location list uses the same binder-aware order. */
function compareLocationTypeahead(a, b) {
  return compareLocations(a, b);
}

/**
 * Human-readable typeahead line for a type/value pair.
 * @param {string} type
 * @param {string} value
 * @returns {string}
 */
export function typeaheadValueLabel(type, value) {
  if (type === 'binder') {
    return displayLabel({ type: 'binder', value });
  }
  return String(value);
}

/**
 * Resolve a typeahead query that targets one filter type:
 *   "location" | "loc" (unique prefix) | "location:" | "location:cin"
 * @param {string} q lowercased trimmed query
 * @returns {{ type: string, sub: string }|null}
 */
function resolveTypeaheadTypeScope(q) {
  if (!q) return null;
  const typed = /^([a-z_]+):(.*)$/i.exec(q);
  if (typed) {
    const type = typed[1].toLowerCase();
    if (TYPEAHEAD_GROUP_ORDER.includes(type)) {
      return { type, sub: typed[2].trim().toLowerCase() };
    }
    return null;
  }
  // Exact type name
  if (TYPEAHEAD_GROUP_ORDER.includes(q)) {
    return { type: q, sub: '' };
  }
  // Unique type prefix (e.g. "loc" → location, "act" → actor)
  if (q.length >= 2) {
    const hits = TYPEAHEAD_GROUP_ORDER.filter((t) => t.startsWith(q));
    if (hits.length === 1) return { type: hits[0], sub: '' };
  }
  return null;
}

/**
 * Query typeahead; returns [{ type, value }] grouped, limited.
 * Order follows TYPEAHEAD_GROUP_ORDER (year before keyword).
 *
 * Matching:
 * - Value and display label (e.g. binder "yes" ↔ "In binder").
 * - Type-scoped browse: typing "location" / "loc" / "location:" lists that type
 *   with a high limit so long location lists are not truncated mid-alphabet.
 * - Free-text does not match the type name alone (avoids every location matching
 *   "location" then stopping at the global 40-hit cap).
 */
export function queryTypeahead(index, query, limit = 40) {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const scope = resolveTypeaheadTypeScope(q);
  if (scope) {
    const values = index[scope.type] || [];
    // Full type browse can be large (hundreds of binder slots + digital labels)
    const max = scope.sub ? limit : Math.max(limit, 500);
    /** @type {{ type: string, value: string }[]} */
    const results = [];
    for (const value of values) {
      const raw = String(value);
      const label = typeaheadValueLabel(scope.type, raw);
      const hay = `${raw} ${label}`.toLowerCase();
      if (!scope.sub || hay.includes(scope.sub)) {
        results.push({ type: scope.type, value: raw });
        if (results.length >= max) break;
      }
    }
    return results;
  }

  /** @type {{ type: string, value: string }[]} */
  const results = [];
  for (const type of TYPEAHEAD_GROUP_ORDER) {
    const values = index[type] || [];
    for (const value of values) {
      const raw = String(value);
      const label = typeaheadValueLabel(type, raw);
      // Match value/label only — not the type name (see type-scoped branch above)
      const hay = `${raw} ${label}`.toLowerCase();
      if (hay.includes(q)) {
        results.push({ type, value: raw });
        if (results.length >= limit) return results;
      }
    }
  }
  return results;
}

export function sortMovies(movies, sortId) {
  const list = movies.slice();
  const cmpTitle = (a, b) =>
    BASE_COLLATOR.compare(String(a.title || ''), String(b.title || ''));

  switch (sortId) {
    case 'title-asc':
      list.sort((a, b) => cmpTitle(a, b) || movieYear(b) - movieYear(a));
      break;
    case 'title-desc':
      list.sort((a, b) => cmpTitle(b, a) || movieYear(b) - movieYear(a));
      break;
    case 'location-asc':
      // A1…An, B1…Bn, … then free-form locations, empty last; title as tie-break
      list.sort(
        (a, b) => compareLocations(a.location, b.location) || cmpTitle(a, b)
      );
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
