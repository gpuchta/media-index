/**
 * Single place to rename the data file or tune virtualization.
 * Cache bust: bump DATA_VERSION (or keep date from filename) when replacing data
 * so GitHub Pages clients re-download instead of using a cached JSON.
 */
export const CONFIG = {
  /** Relative path to movie JSON (array of movie objects). */
  DATA_PATH: 'data/media-index.json',

  /**
   * Query string appended when fetching data.
   * Derived from the data filename date so replacing the file with a new
   * dated name forces a fresh download. Bump manually if you overwrite in place.
   */
  DATA_VERSION: '2026-07-15-143500',

  TMDB_IMAGE_BASE: 'https://image.tmdb.org/t/p/w342',
  TMDB_MOVIE_BASE: 'https://www.themoviedb.org/movie/',

  /**
   * GitHub Contents target for Menu → Save JSON.
   * OWNER empty → resolved from the authenticated token (`GET /user`).
   * PATH defaults to DATA_PATH when empty.
   */
  GITHUB_OWNER: '',
  GITHUB_REPO: 'media-index',
  GITHUB_PATH: '',
  /** Commits history for the library data file (Menu → View). */
  GITHUB_DATA_COMMITS_URL:
    'https://github.com/gpuchta/media-index/commits/main/data/media-index.json',
  /** GitHub Actions deployments (Menu → Deployment). */
  GITHUB_DEPLOYMENT_URL: 'https://github.com/gpuchta/media-index/actions/',

  /** Design cell size (px) at comfortable desktop widths. */
  CELL_WIDTH: 256,
  CELL_HEIGHT: 388,
  CELL_MIN_WIDTH: 120,
  CELL_GAP: 10,

  /** Extra rows rendered above/below the viewport. */
  VIRTUAL_BUFFER_ROWS: 2,

  SESSION_SORT_KEY: 'pmi:sort',
};

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
