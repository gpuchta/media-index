/**
 * Library statistics: frequency rankings for filterable facets.
 */

import { t } from './i18n.js';

/**
 * @param {object[]} movies
 * @param {(movie: object) => string[]} getNames
 * @returns {{ name: string, count: number }[]}
 */
export function countNameFrequencies(movies, getNames) {
  /** @type {Map<string, { name: string, count: number }>} */
  const map = new Map();
  for (const m of movies || []) {
    const names = getNames(m) || [];
    for (const raw of names) {
      const name = String(raw || '').trim();
      if (!name) continue;
      const key = name.toLowerCase();
      const cur = map.get(key);
      if (cur) cur.count += 1;
      else map.set(key, { name, count: 1 });
    }
  }
  return [...map.values()].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  );
}

function asList(v) {
  if (v == null || v === '') return [];
  if (Array.isArray(v)) {
    return v.map((x) => (x && typeof x === 'object' && x.name != null ? x.name : x));
  }
  return [v];
}

/**
 * Full ranked lists per facet (UI truncates to top N and offers “Show more”).
 * @param {object[]} movies
 */
export function buildLibraryStats(movies) {
  const directors = countNameFrequencies(movies, (m) => asList(m.directors));
  const actors = countNameFrequencies(movies, (m) => asList(m.actors));
  const genres = countNameFrequencies(movies, (m) => asList(m.genres));
  const collections = countNameFrequencies(movies, (m) => asList(m.collection));
  const companies = countNameFrequencies(movies, (m) => asList(m.production_companies));

  return {
    directors: {
      filterType: 'director',
      labelKey: 'stats.directors',
      label: t('stats.directors'),
      rows: directors,
    },
    actors: {
      filterType: 'actor',
      labelKey: 'stats.actors',
      label: t('stats.actors'),
      rows: actors,
    },
    genres: {
      filterType: 'genre',
      labelKey: 'stats.genres',
      label: t('stats.genres'),
      rows: genres,
    },
    collections: {
      filterType: 'collection',
      labelKey: 'stats.collections',
      label: t('stats.collections'),
      rows: collections,
    },
    companies: {
      filterType: 'company',
      labelKey: 'stats.companies',
      label: t('stats.companies'),
      rows: companies,
    },
  };
}

/**
 * Section heading:
 * - "Top 10 Companies of 47" when truncated
 * - "12 Companies" when ≤ topN or expanded (full list)
 * @param {{ label: string, labelKey?: string, rows: { name: string, count: number }[] }} section
 * @param {number} topN
 * @param {boolean} expanded
 */
export function statsSectionTitle(section, topN = 10, expanded = false) {
  const n = section.rows.length;
  const label = section.labelKey ? t(section.labelKey) : section.label;
  if (n === 0) return t('stats.none', { label });
  if (expanded || n <= topN) return t('stats.countLabel', { n, label });
  return t('stats.topOf', { n: topN, label, total: n });
}
