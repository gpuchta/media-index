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
  if (Array.isArray(v)) return v.map((x) => (x && typeof x === 'object' && x.name != null ? x.name : x));
  return [v];
}

/** @param {object[]} movies */
export function buildLibraryStats(movies, { topN = 15 } = {}) {
  const top = (rows) => rows.slice(0, topN);

  const directors = countNameFrequencies(movies, (m) => asList(m.directors));
  const actors = countNameFrequencies(movies, (m) => asList(m.actors));
  const genres = countNameFrequencies(movies, (m) => asList(m.genres));
  const collections = countNameFrequencies(movies, (m) => asList(m.collection));
  const companies = countNameFrequencies(movies, (m) => asList(m.production_companies));

  return {
    directors: { filterType: 'director', label: 'Directors', rows: top(directors), totalDistinct: directors.length },
    actors: { filterType: 'actor', label: 'Actors', rows: top(actors), totalDistinct: actors.length },
    genres: { filterType: 'genre', label: 'Genres', rows: top(genres), totalDistinct: genres.length },
    collections: {
      filterType: 'collection',
      label: 'Collections',
      rows: top(collections),
      totalDistinct: collections.length,
    },
    companies: {
      filterType: 'company',
      label: 'Companies',
      rows: top(companies),
      totalDistinct: companies.length,
    },
  };
}

/**
 * Section heading: "Top 15 Directors" or "12 Directors" when fewer than topN.
 * @param {{ label: string, rows: {name:string,count:number}[], totalDistinct: number }} section
 * @param {number} topN
 */
export function statsSectionTitle(section, topN = 15) {
  const n = section.totalDistinct;
  if (n === 0) return `No ${section.label}`;
  if (n <= topN) return `${n} ${section.label}`;
  return `Top ${topN} ${section.label}`;
}
