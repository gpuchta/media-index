/**
 * Minimal TMDB API v3 client (search + API key storage).
 * Key is never hard-coded; load/save via localStorage.
 * Locale comes from Settings (pmi:locale) via localeToTmdbLanguage().
 */

import { localeToTmdbLanguage } from './config.js';
import { promotePosterSelection } from './utils.js';

export const TMDB_API_BASE = 'https://api.themoviedb.org/3';
export const TMDB_API_KEY_STORAGE = 'pmi:tmdbApiKey';

export function getStoredTmdbApiKey() {
  try {
    return localStorage.getItem(TMDB_API_KEY_STORAGE) || '';
  } catch {
    return '';
  }
}

export function setStoredTmdbApiKey(apiKey) {
  const key = String(apiKey || '').trim();
  try {
    if (key) localStorage.setItem(TMDB_API_KEY_STORAGE, key);
    else localStorage.removeItem(TMDB_API_KEY_STORAGE);
  } catch {
    /* private mode */
  }
  return key;
}

function redactUrl(url) {
  return String(url).replace(/([?&]api_key=)[^&]*/gi, '$1***');
}

/** @type {Map<number, string>|null} */
let genreIdToName = null;
let genreMapApiKey = '';
let genreMapLanguage = '';

/** Append current Settings locale as TMDB `language` query param. */
function withLanguage(url) {
  const lang = localeToTmdbLanguage();
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}language=${encodeURIComponent(lang)}`;
}

/**
 * Fetch and cache TMDB movie genre id → name map for the given API key + locale.
 * @param {string} apiKey
 * @returns {Promise<Map<number, string>>}
 */
export async function getGenreMap(apiKey) {
  const key = String(apiKey || '').trim();
  if (!key) return new Map();
  const lang = localeToTmdbLanguage();
  if (genreIdToName && genreMapApiKey === key && genreMapLanguage === lang) {
    return genreIdToName;
  }

  const url = withLanguage(
    `${TMDB_API_BASE}/genre/movie/list?api_key=${encodeURIComponent(key)}`
  );
  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`TMDB genres failed: ${res.status} ${res.statusText} (${redactUrl(url)})`);
  }
  const data = await res.json();
  const map = new Map();
  for (const g of data.genres || []) {
    if (g && g.id != null && g.name) map.set(Number(g.id), String(g.name));
  }
  genreIdToName = map;
  genreMapApiKey = key;
  genreMapLanguage = lang;
  return map;
}

function resolveGenreNames(genreIds, map) {
  if (!Array.isArray(genreIds) || !genreIds.length) return [];
  const names = [];
  for (const id of genreIds) {
    const name = map.get(Number(id));
    if (name) names.push(name);
  }
  return names;
}

/**
 * @param {string} apiKey
 * @param {string} title
 * @param {string|number|null|undefined} year
 * @param {number} [page=1]
 */
export async function searchMoviesByTitleAndYear(apiKey, title, year, page = 1) {
  const key = String(apiKey || '').trim();
  if (!key) throw new Error('TMDB API key is required');
  const q = String(title || '').trim();
  if (!q) throw new Error('Movie title is required');
  const pageNum = Math.max(1, parseInt(String(page), 10) || 1);

  let url = withLanguage(
    `${TMDB_API_BASE}/search/movie?api_key=${encodeURIComponent(key)}&query=${encodeURIComponent(q)}&page=${pageNum}`
  );
  const y = year === '' || year == null ? null : parseInt(String(year), 10);
  if (y != null && !Number.isNaN(y)) {
    url += `&year=${y}`;
  }

  // Parallel: search + genre list (for resolving genre_ids on search hits)
  const [res, genreMap] = await Promise.all([
    fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    }),
    getGenreMap(key).catch(() => new Map()),
  ]);

  if (!res.ok) {
    throw new Error(`TMDB search failed: ${res.status} ${res.statusText} (${redactUrl(url)})`);
  }

  const data = await res.json();
  let movies = Array.isArray(data.results)
    ? data.results.map((m) => ({
        id: m.id,
        title: m.title || '',
        releaseDate: m.release_date || null,
        releaseYear: m.release_date ? parseInt(String(m.release_date).slice(0, 4), 10) || null : null,
        overview: m.overview || '',
        posterPath: m.poster_path || null,
        voteAverage: m.vote_average ?? 0,
        voteCount: m.vote_count ?? 0,
        genreIds: Array.isArray(m.genre_ids) ? m.genre_ids : [],
        genres: resolveGenreNames(m.genre_ids, genreMap),
      }))
    : [];

  // When a 4-digit year was requested, keep only matches with that release year
  if (y != null && !Number.isNaN(y)) {
    movies = movies.filter((m) => m.releaseYear === y);
  }

  return {
    page: data.page ?? pageNum,
    totalResults: data.total_results ?? movies.length,
    totalPages: data.total_pages ?? 1,
    movies,
    filteredByYear: y != null && !Number.isNaN(y) ? y : null,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * TMDB soft upper limit is ~40–50 req/s per IP (legacy 40/10s removed Dec 2019).
 * Respect 429 with Retry-After / exponential backoff.
 * @param {string} url
 * @param {{ retries?: number }} [opts]
 */
async function fetchJson(url, { retries = 6 } = {}) {
  let lastStatus = 0;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    lastStatus = res.status;
    if (res.status === 429) {
      const retryAfter = parseFloat(res.headers.get('Retry-After') || '');
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(Math.max(retryAfter * 1000, 400), 30000)
        : Math.min(800 * 2 ** attempt, 16000);
      await sleep(waitMs);
      continue;
    }
    if (!res.ok) {
      throw new Error(
        `TMDB request failed: ${res.status} ${res.statusText} (${redactUrl(url)})`
      );
    }
    return res.json();
  }
  throw new Error(
    `TMDB rate limited (HTTP ${lastStatus || 429}) after ${retries + 1} attempts (${redactUrl(url)})`
  );
}

/**
 * Full movie detail + credits + keywords (Java getMovieById parity).
 * @param {string} apiKey
 * @param {number|string} id
 */
export async function getMovieById(apiKey, id) {
  const key = String(apiKey || '').trim();
  if (!key) throw new Error('TMDB API key is required');
  const movieId = encodeURIComponent(String(id));
  const base = `${TMDB_API_BASE}/movie/${movieId}`;

  const [detail, credits, keywords] = await Promise.all([
    fetchJson(
      withLanguage(
        `${base}?api_key=${encodeURIComponent(key)}&append_to_response=images`
      )
    ),
    fetchJson(withLanguage(`${base}/credits?api_key=${encodeURIComponent(key)}`)),
    fetchJson(withLanguage(`${base}/keywords?api_key=${encodeURIComponent(key)}`)),
  ]);

  const cast = Array.isArray(credits.cast)
    ? [...credits.cast]
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((c) => c.name)
        .filter(Boolean)
    : [];
  const directors = Array.isArray(credits.crew)
    ? credits.crew.filter((c) => c.job === 'Director').map((c) => c.name).filter(Boolean)
    : [];
  const keywordNames = Array.isArray(keywords.keywords)
    ? keywords.keywords
        .map((k) => k.name)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b))
    : [];

  const posters = [];
  const backdrops = [];
  const img = detail.images || {};
  for (const p of img.posters || []) {
    if (p?.file_path) posters.push(p.file_path);
  }
  for (const b of img.backdrops || []) {
    if (b?.file_path) backdrops.push(b.file_path);
  }
  // Ensure default poster is first / present in list
  if (detail.poster_path && !posters.includes(detail.poster_path)) {
    posters.unshift(detail.poster_path);
  } else if (detail.poster_path) {
    const i = posters.indexOf(detail.poster_path);
    if (i > 0) {
      posters.splice(i, 1);
      posters.unshift(detail.poster_path);
    }
  }

  const releaseDate = detail.release_date || null;
  const releaseYear = releaseDate
    ? parseInt(String(releaseDate).slice(0, 4), 10) || null
    : null;

  return {
    id: detail.id,
    title: detail.title || '',
    releaseDate,
    releaseYear,
    overview: detail.overview || '',
    posterPath: detail.poster_path || null,
    backdropPath: detail.backdrop_path || null,
    voteAverage: detail.vote_average ?? 0,
    voteCount: detail.vote_count ?? 0,
    budget: detail.budget ?? 0,
    revenue: detail.revenue ?? 0,
    runtime: detail.runtime ?? null,
    popularity: detail.popularity ?? 0,
    genres: Array.isArray(detail.genres)
      ? detail.genres.map((g) => g.name).filter(Boolean)
      : [],
    productionCompanies: Array.isArray(detail.production_companies)
      ? detail.production_companies.map((c) => c.name).filter(Boolean)
      : [],
    collection: detail.belongs_to_collection?.name || null,
    posters,
    backdrops,
    directors,
    actors: cast,
    keywords: keywordNames,
  };
}

/**
 * Map TMDB detail to library movie JSON shape (snake_case).
 * @param {object} detail — from getMovieById
 * @param {{ posterPath?: string|null }} [opts]
 */
export function toLibraryMovie(detail, opts = {}) {
  const selected =
    opts.posterPath != null && opts.posterPath !== ''
      ? opts.posterPath
      : detail.posterPath || null;
  const year = detail.releaseYear != null ? String(detail.releaseYear) : '';
  // Promote selected to poster_path; demote previous primary into alternates if needed
  const promoted = promotePosterSelection(
    detail.posters || [],
    detail.posterPath || null,
    selected
  );
  return {
    tmdb_id: String(detail.id),
    title: detail.title || '',
    year,
    released: detail.releaseDate || year || '',
    runtime: detail.runtime ?? 0,
    overview: detail.overview || '',
    poster_path: promoted.posterPath || '',
    backdrop_path: detail.backdropPath || '',
    posters: promoted.posters,
    backdrops: Array.isArray(detail.backdrops) ? detail.backdrops : [],
    vote_average: detail.voteAverage ?? 0,
    vote_count: detail.voteCount ?? 0,
    budget: detail.budget ?? 0,
    revenue: detail.revenue ?? 0,
    popularity: detail.popularity ?? 0,
    genres: detail.genres || [],
    directors: detail.directors || [],
    actors: detail.actors || [],
    keywords: detail.keywords || [],
    production_companies: detail.productionCompanies || [],
    collection: detail.collection || '',
    location: '',
  };
}

/**
 * Merge keyword lists (case-insensitive). Incoming (TMDB) first, then existing extras.
 * @param {unknown} existing
 * @param {unknown} incoming
 * @returns {string[]}
 */
export function mergeKeywords(existing, incoming) {
  /** @type {string[]} */
  const out = [];
  const seen = new Set();
  for (const list of [incoming, existing]) {
    if (!Array.isArray(list)) continue;
    for (const raw of list) {
      const s = String(raw ?? '').trim();
      if (!s) continue;
      const key = s.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(s);
    }
  }
  return out;
}

/**
 * Build an updated library movie from a fresh TMDB detail while preserving local data:
 * 1) Keep existing poster if still present as poster_path or in alternate posters
 * 2) Keep location as-is
 * 3) Merge keywords (no duplicates)
 *
 * @param {object} existing — current library movie
 * @param {object} detail — from getMovieById
 * @returns {object} new library-shaped movie (caller may Object.assign in place)
 */
export function mergeLibraryMovieFromTmdb(existing, detail) {
  const oldPoster = existing?.poster_path ? String(existing.poster_path) : '';
  const tmdbPrimary = detail?.posterPath ? String(detail.posterPath) : '';
  const tmdbAlts = Array.isArray(detail?.posters)
    ? detail.posters.map(String).filter(Boolean)
    : [];
  const available = new Set(tmdbAlts);
  if (tmdbPrimary) available.add(tmdbPrimary);

  // Keep current poster when it still appears on TMDB; otherwise take TMDB primary
  const selectedPoster =
    oldPoster && available.has(oldPoster) ? oldPoster : tmdbPrimary || null;

  const fresh = toLibraryMovie(detail, { posterPath: selectedPoster });
  fresh.location =
    existing?.location != null ? String(existing.location) : '';
  fresh.keywords = mergeKeywords(existing?.keywords, fresh.keywords);
  return fresh;
}

/**
 * Apply merged fields onto an existing movie object (preserves array reference).
 * @param {object} target
 * @param {object} merged
 */
export function applyMergedMovieInPlace(target, merged) {
  if (!target || !merged) return target;
  for (const k of Object.keys(target)) {
    if (!(k in merged)) delete target[k];
  }
  Object.assign(target, merged);
  return target;
}
