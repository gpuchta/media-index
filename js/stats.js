/**
 * Library statistics: frequency rankings for filterable facets.
 */

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
    directors: { filterType: 'director', label: 'Directors', rows: directors },
    actors: { filterType: 'actor', label: 'Actors', rows: actors },
    genres: { filterType: 'genre', label: 'Genres', rows: genres },
    collections: { filterType: 'collection', label: 'Collections', rows: collections },
    companies: { filterType: 'company', label: 'Companies', rows: companies },
  };
}

/**
 * Section heading:
 * - "Top 10 Companies of 47" when truncated
 * - "12 Companies" when ≤ topN or expanded (full list)
 * @param {{ label: string, rows: { name: string, count: number }[] }} section
 * @param {number} topN
 * @param {boolean} expanded
 */
export function statsSectionTitle(section, topN = 10, expanded = false) {
  const n = section.rows.length;
  if (n === 0) return `No ${section.label}`;
  if (expanded || n <= topN) return `${n} ${section.label}`;
  return `Top ${topN} ${section.label} of ${n}`;
}
