/**
 * App configuration.
 *
 * Forkers: set GITHUB_DATA_COMMITS_URL to your library file’s commits page on GitHub.
 * Owner, repo, branch, data path, Data Changes URL, and Deployments URL are all
 * derived from that single string (see parseGithubDataCommitsUrl in github.js).
 *
 * Do not put API keys here — use Menu → Settings (browser localStorage only).
 *
 * Cache bust: bump DATA_VERSION when replacing data so GitHub Pages clients
 * re-download instead of using a cached JSON.
 */
import { parseGithubDataCommitsUrl } from './github.js';

/** Fallback load path if GITHUB_DATA_COMMITS_URL is missing or invalid. */
export const FALLBACK_DATA_PATH = 'data/media-index.json';

export const CONFIG = {
  /**
   * Single GitHub target for this deployment / fork.
   * Shape: https://github.com/{owner}/{repo}/commits/{branch}/{path-to-data-file}
   * Example: https://github.com/gpuchta/media-index/commits/main/data/media-index.json
   *
   * From this the app derives: owner, repo, branch, data path, commits URL,
   * and Actions (deployments) URL. Change it when you fork.
   */
  GITHUB_DATA_COMMITS_URL:
    'https://github.com/gpuchta/media-index/commits/main/data/media-index.json',

  /**
   * Relative path to movie JSON for fetch/load.
   * Overwritten below from GITHUB_DATA_COMMITS_URL when that URL parses cleanly.
   */
  DATA_PATH: FALLBACK_DATA_PATH,

  /**
   * Query string appended when fetching data (`?v=…`).
   * Bump when you replace the data file in place so clients re-download.
   */
  DATA_VERSION: '2026-07-15-143500',

  TMDB_IMAGE_BASE: 'https://image.tmdb.org/t/p/w342',
  TMDB_MOVIE_BASE: 'https://www.themoviedb.org/movie/',

  /** Design cell size (px) at comfortable desktop widths. */
  // CELL_WIDTH: 256,
  // CELL_HEIGHT: 388,
  // CELL_MIN_WIDTH: 120,
  // CELL_GAP: 10,

  CELL_WIDTH: 128,   // was 256 — ~3 cols at ~412px (Pixel 6 Pro portrait)
  CELL_HEIGHT: 194,  // was 388 — keep ~2:3 (128 * 388/256)
  CELL_MIN_WIDTH: 110, // was 120 — stay ≤ computed cell width for 3 cols
  CELL_GAP: 10,

  /**
   * Poster grid size preference (Settings slider), percent of design cell size.
   * Stored in localStorage as an integer string (e.g. "100").
   */
  POSTER_SCALE_STORAGE: 'pmi:posterScale',
  POSTER_SCALE_MIN: 50,
  POSTER_SCALE_MAX: 200,
  POSTER_SCALE_DEFAULT: 100,
  POSTER_SCALE_STEP: 5,

  /**
   * Poster grid gap preference (Settings slider), pixels.
   * Stored in localStorage as an integer string (e.g. "10"). Default matches CELL_GAP.
   */
  POSTER_GAP_STORAGE: 'pmi:posterGap',
  POSTER_GAP_MIN: 0,
  POSTER_GAP_MAX: 40,
  POSTER_GAP_DEFAULT: 10,
  POSTER_GAP_STEP: 1,

  /** Extra rows rendered above/below the viewport. */
  VIRTUAL_BUFFER_ROWS: 2,

  SESSION_SORT_KEY: 'pmi:sort',
};

/**
 * Clamp and normalize a poster-scale percent (50–200).
 * @param {unknown} value
 * @returns {number}
 */
export function clampPosterScalePercent(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return CONFIG.POSTER_SCALE_DEFAULT;
  return Math.min(
    CONFIG.POSTER_SCALE_MAX,
    Math.max(CONFIG.POSTER_SCALE_MIN, n)
  );
}

/** @returns {number} percent 50–200 */
export function getStoredPosterScalePercent() {
  try {
    const raw = localStorage.getItem(CONFIG.POSTER_SCALE_STORAGE);
    if (raw == null || raw === '') return CONFIG.POSTER_SCALE_DEFAULT;
    return clampPosterScalePercent(raw);
  } catch {
    return CONFIG.POSTER_SCALE_DEFAULT;
  }
}

/**
 * @param {unknown} percent
 * @returns {number} stored percent
 */
export function setStoredPosterScalePercent(percent) {
  const n = clampPosterScalePercent(percent);
  try {
    if (n === CONFIG.POSTER_SCALE_DEFAULT) {
      localStorage.removeItem(CONFIG.POSTER_SCALE_STORAGE);
    } else {
      localStorage.setItem(CONFIG.POSTER_SCALE_STORAGE, String(n));
    }
  } catch {
    /* private mode */
  }
  return n;
}

/**
 * Clamp and normalize poster gap in pixels (0–40).
 * @param {unknown} value
 * @returns {number}
 */
export function clampPosterGapPx(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return CONFIG.POSTER_GAP_DEFAULT;
  return Math.min(CONFIG.POSTER_GAP_MAX, Math.max(CONFIG.POSTER_GAP_MIN, n));
}

/** @returns {number} gap in px */
export function getStoredPosterGapPx() {
  try {
    const raw = localStorage.getItem(CONFIG.POSTER_GAP_STORAGE);
    if (raw == null || raw === '') return CONFIG.POSTER_GAP_DEFAULT;
    return clampPosterGapPx(raw);
  } catch {
    return CONFIG.POSTER_GAP_DEFAULT;
  }
}

/**
 * @param {unknown} px
 * @returns {number} stored gap px
 */
export function setStoredPosterGapPx(px) {
  const n = clampPosterGapPx(px);
  try {
    if (n === CONFIG.POSTER_GAP_DEFAULT) {
      localStorage.removeItem(CONFIG.POSTER_GAP_STORAGE);
    } else {
      localStorage.setItem(CONFIG.POSTER_GAP_STORAGE, String(n));
    }
  } catch {
    /* private mode */
  }
  return n;
}

/**
 * Parsed GitHub target from CONFIG.GITHUB_DATA_COMMITS_URL, or null if invalid.
 * @type {{
 *   owner: string,
 *   repo: string,
 *   branch: string,
 *   path: string,
 *   commitsUrl: string,
 *   deploymentUrl: string,
 * } | null}
 */
export const GITHUB_TARGET = parseGithubDataCommitsUrl(CONFIG.GITHUB_DATA_COMMITS_URL);

if (GITHUB_TARGET?.path) {
  CONFIG.DATA_PATH = GITHUB_TARGET.path;
}

export const FILTER_TYPES = [
  'title',
  'location',
  'director',
  'actor',
  'collection',
  'company',
  'keyword',
  'year',
  'genre',
  'vote',
];

export const FILTER_TYPE_LABELS = {
  title: 'title',
  location: 'location',
  director: 'director',
  actor: 'actor',
  collection: 'collection',
  company: 'company',
  keyword: 'keyword',
  year: 'year',
  genre: 'genre',
  vote: 'vote',
};

/** Typeahead group order (title near top; year before keyword so "2020" ranks over "2020s") */
export const TYPEAHEAD_GROUP_ORDER = [
  'title',
  'genre',
  'year',
  'location',
  'director',
  'actor',
  'collection',
  'company',
  'keyword',
];

export const SORT_OPTIONS = [
  { id: 'title-asc', label: 'Title (asc)', field: 'title', dir: 'asc' },
  { id: 'title-desc', label: 'Title (desc)', field: 'title', dir: 'desc' },
  { id: 'released-asc', label: 'Release Date (asc)', field: 'released', dir: 'asc' },
  { id: 'released-desc', label: 'Release Date (desc)', field: 'released', dir: 'desc' },
];

/** Default: newest release date first (title asc as tie-breaker). */
export const DEFAULT_SORT = 'released-desc';
