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

  /** Extra rows rendered above/below the viewport. */
  VIRTUAL_BUFFER_ROWS: 2,

  SESSION_SORT_KEY: 'pmi:sort',
};

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
