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
import { LOCALE_OPTIONS } from './locale-options.js';

export { LOCALE_OPTIONS };

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

  /** Remote poster CDN (grid / dialog thumbnails). */
  TMDB_IMAGE_BASE: 'https://image.tmdb.org/t/p/w342',
  /** Larger remote size for poster zoom lightbox. */
  TMDB_IMAGE_ZOOM_BASE: 'https://image.tmdb.org/t/p/w780',
  /**
   * Local primary-poster backup (relative to site root).
   * Filled by `node posters/sync-posters.mjs` → posters/w342/{path}.
   */
  LOCAL_POSTER_BASE: 'posters/w342',
  /**
   * Poster image source: "tmdb" (default) or "local" (synced files under LOCAL_POSTER_BASE).
   * Stored in localStorage.
   */
  POSTER_SOURCE_STORAGE: 'pmi:posterSource',
  POSTER_SOURCE_DEFAULT: 'tmdb',
  TMDB_MOVIE_BASE: 'https://www.themoviedb.org/movie/',

  /**
   * Require a second confirmation before bulk library metadata refresh.
   * Stored in localStorage as "1" / "0". Default: on (safer).
   */
  BULK_META_CONFIRM2_STORAGE: 'pmi:bulkMetaConfirm2',
  BULK_META_CONFIRM2_DEFAULT: true,

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

  /**
   * Poster back lighting / shading intensity (Settings slider), percent 0–100.
   * 0 = flat posters; higher values add theme-colored glow + depth shadow.
   * Stored in localStorage as an integer string (e.g. "50").
   */
  POSTER_BACKLIGHT_STORAGE: 'pmi:posterBacklight',
  POSTER_BACKLIGHT_MIN: 0,
  POSTER_BACKLIGHT_MAX: 100,
  POSTER_BACKLIGHT_DEFAULT: 50,
  POSTER_BACKLIGHT_STEP: 5,

  /**
   * Preferred language for TMDB (ISO 639-1, e.g. en, de).
   * Stored in localStorage; see LOCALE_OPTIONS and localeToTmdbLanguage().
   * Legacy values en_US / de_DE are normalized to en / de.
   */
  LOCALE_STORAGE: 'pmi:locale',
  LOCALE_DEFAULT: 'en',

  /**
   * UI theme id (Settings dropdown). Stored in localStorage.
   * Applied via documentElement data-theme (see css/app.css).
   */
  THEME_STORAGE: 'pmi:theme',
  THEME_DEFAULT: 'dark',
  /** Optional per-variable color overrides (#rrggbb JSON object). */
  THEME_COLORS_STORAGE: 'pmi:themeColors',

  /**
   * Show location badge on poster grid cells.
   * Stored as "0" | "1" in localStorage; default on.
   */
  LOCATION_OVERLAY_STORAGE: 'pmi:locationOverlay',
  LOCATION_OVERLAY_DEFAULT: true,

  /**
   * Comma-separated location labels whose posters are grayed in the grid
   * (e.g. "Watch, Buy" or "Watch, Cinema Now"). Spaces inside a name are kept;
   * only commas (or semicolons) separate entries. Case-insensitive exact match.
   */
  GRAYED_LOCATIONS_STORAGE: 'pmi:grayedLocations',
  GRAYED_LOCATIONS_DEFAULT: 'Watch, Buy',

  /**
   * Binder notation preset id (Settings). Controls which locations count as
   * “In binder” for the binder:yes / binder:no filter.
   */
  BINDER_NOTATION_STORAGE: 'pmi:binderNotation',
  BINDER_NOTATION_DEFAULT: 'letter-page',
  /**
   * Custom binder patterns when notation is "custom": one JavaScript regex
   * source per line (OR’d). Stored as a plain string in localStorage.
   */
  BINDER_NOTATION_CUSTOM_STORAGE: 'pmi:binderNotationCustom',
  BINDER_NOTATION_CUSTOM_DEFAULT: '^[A-Za-z]\\d{1,3}$',

  /** Extra rows rendered above/below the viewport. */
  VIRTUAL_BUFFER_ROWS: 2,

  SESSION_SORT_KEY: 'pmi:sort',
};

/**
 * Themes offered in Settings (extend as needed).
 * @type {ReadonlyArray<{ id: string, label: string, scheme: 'dark'|'light' }>}
 */
export const THEME_OPTIONS = Object.freeze([
  { id: 'dark', label: 'Dark', scheme: 'dark' },
  { id: 'light', label: 'Light', scheme: 'light' },
  { id: 'midnight', label: 'Midnight Ocean', scheme: 'dark' },
  { id: 'sunset', label: 'Sunset Amber', scheme: 'dark' },
  { id: 'forest', label: 'Forest Emerald', scheme: 'dark' },
  { id: 'aurora', label: 'Aurora', scheme: 'dark' },
  { id: 'rose', label: 'Rose Mist', scheme: 'dark' },
  { id: 'slate', label: 'Cool Slate', scheme: 'dark' },
  { id: 'daybreak', label: 'Daybreak', scheme: 'light' },
  { id: 'lavender', label: 'Lavender Fields', scheme: 'light' },
]);

/**
 * Customizable CSS variables (without leading --).
 * group: single | header | grid — layout in the Settings color editor.
 * @type {ReadonlyArray<{ key: string, label: string, group: 'single'|'header'|'grid' }>}
 */
export const THEME_COLOR_FIELDS = Object.freeze([
  { key: 'bg-deep', label: 'Page background', group: 'single' },
  { key: 'surface', label: 'Surface', group: 'single' },
  { key: 'surface-2', label: 'Surface elevated', group: 'single' },
  { key: 'text', label: 'Text', group: 'single' },
  { key: 'text-muted', label: 'Muted text', group: 'single' },
  { key: 'focus', label: 'Accent / focus', group: 'single' },
  { key: 'header-a', label: 'Start', group: 'header' },
  { key: 'header-b', label: 'End', group: 'header' },
  { key: 'bg-grid-a', label: 'Start', group: 'grid' },
  { key: 'bg-grid-b', label: 'End', group: 'grid' },
  { key: 'poster-loc-bg', label: 'Background', group: 'overlay' },
  { key: 'poster-loc-text', label: 'Text', group: 'overlay' },
]);

const THEME_COLOR_KEY_SET = new Set(THEME_COLOR_FIELDS.map((f) => f.key));

/** @returns {boolean} */
export function getStoredLocationOverlayEnabled() {
  try {
    const raw = localStorage.getItem(CONFIG.LOCATION_OVERLAY_STORAGE);
    if (raw == null || raw === '') return CONFIG.LOCATION_OVERLAY_DEFAULT;
    if (raw === '0' || raw === 'false') return false;
    if (raw === '1' || raw === 'true') return true;
    return CONFIG.LOCATION_OVERLAY_DEFAULT;
  } catch {
    return CONFIG.LOCATION_OVERLAY_DEFAULT;
  }
}

/**
 * @param {unknown} enabled
 * @returns {boolean} stored value
 */
export function setStoredLocationOverlayEnabled(enabled) {
  const on = !!enabled;
  try {
    if (on === CONFIG.LOCATION_OVERLAY_DEFAULT) {
      localStorage.removeItem(CONFIG.LOCATION_OVERLAY_STORAGE);
    } else {
      localStorage.setItem(CONFIG.LOCATION_OVERLAY_STORAGE, on ? '1' : '0');
    }
  } catch {
    /* private mode */
  }
  return on;
}

/**
 * @param {unknown} id
 * @returns {'tmdb'|'local'}
 */
export function normalizePosterSource(id) {
  const s = String(id || '')
    .trim()
    .toLowerCase();
  return s === 'local' ? 'local' : 'tmdb';
}

/** @returns {'tmdb'|'local'} */
export function getStoredPosterSource() {
  try {
    const raw = localStorage.getItem(CONFIG.POSTER_SOURCE_STORAGE);
    if (raw == null || raw === '') return CONFIG.POSTER_SOURCE_DEFAULT;
    return normalizePosterSource(raw);
  } catch {
    return CONFIG.POSTER_SOURCE_DEFAULT;
  }
}

/**
 * @param {unknown} id
 * @returns {'tmdb'|'local'}
 */
export function setStoredPosterSource(id) {
  const n = normalizePosterSource(id);
  try {
    if (n === CONFIG.POSTER_SOURCE_DEFAULT) {
      localStorage.removeItem(CONFIG.POSTER_SOURCE_STORAGE);
    } else {
      localStorage.setItem(CONFIG.POSTER_SOURCE_STORAGE, n);
    }
  } catch {
    /* private mode */
  }
  return n;
}

/**
 * Optional in-session override while Settings is open (preview without Save).
 * @type {'tmdb'|'local'|null}
 */
let posterSourceOverride = null;

/**
 * @param {unknown} id pass null/undefined to clear override
 * @returns {'tmdb'|'local'|null}
 */
export function setPosterSourceOverride(id) {
  if (id == null || id === '') {
    posterSourceOverride = null;
  } else {
    posterSourceOverride = normalizePosterSource(id);
  }
  return posterSourceOverride;
}

/** @returns {'tmdb'|'local'} effective source (override or stored) */
export function getEffectivePosterSource() {
  return posterSourceOverride ?? getStoredPosterSource();
}

/**
 * Base URL/path for grid and dialog posters (no trailing slash).
 * Local = posters/w342 from sync-posters.mjs; remote = TMDB w342 CDN.
 * @returns {string}
 */
export function getPosterImageBase() {
  return getEffectivePosterSource() === 'local'
    ? CONFIG.LOCAL_POSTER_BASE
    : CONFIG.TMDB_IMAGE_BASE;
}

/**
 * Base for enlarged poster zoom. Local backup only has w342 files, so zoom
 * reuses the local base; remote uses a larger TMDB size.
 * @returns {string}
 */
export function getPosterZoomImageBase() {
  return getEffectivePosterSource() === 'local'
    ? CONFIG.LOCAL_POSTER_BASE
    : CONFIG.TMDB_IMAGE_ZOOM_BASE;
}

/** @returns {boolean} */
export function getStoredBulkMetaConfirm2() {
  try {
    const raw = localStorage.getItem(CONFIG.BULK_META_CONFIRM2_STORAGE);
    if (raw == null || raw === '') return CONFIG.BULK_META_CONFIRM2_DEFAULT;
    if (raw === '0' || raw === 'false') return false;
    if (raw === '1' || raw === 'true') return true;
    return CONFIG.BULK_META_CONFIRM2_DEFAULT;
  } catch {
    return CONFIG.BULK_META_CONFIRM2_DEFAULT;
  }
}

/**
 * @param {unknown} enabled
 * @returns {boolean}
 */
export function setStoredBulkMetaConfirm2(enabled) {
  const on = !!enabled;
  try {
    if (on === CONFIG.BULK_META_CONFIRM2_DEFAULT) {
      localStorage.removeItem(CONFIG.BULK_META_CONFIRM2_STORAGE);
    } else {
      localStorage.setItem(CONFIG.BULK_META_CONFIRM2_STORAGE, on ? '1' : '0');
    }
  } catch {
    /* private mode */
  }
  return on;
}

/**
 * Parse a comma-separated location list into unique lowercase tokens.
 * Separators are commas or semicolons only — spaces stay inside a label
 * so "Watch, Cinema Now, Buy" → watch | cinema now | buy.
 * @param {unknown} text
 * @returns {string[]} lowercase unique labels (stable first-seen order)
 */
export function parseGrayedLocationsList(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return [];
  /** @type {string[]} */
  const out = [];
  const seen = new Set();
  for (const part of raw.split(/[,;]+/)) {
    const t = part.trim().toLowerCase();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/**
 * Canonical display string for storage / Settings field (preserve words, join ", ").
 * @param {unknown} text
 * @returns {string}
 */
export function formatGrayedLocationsList(text) {
  // Re-parse then re-emit from original casing where possible: use lowercase
  // tokens with simple first-letter capitalisation per word for readability.
  const tokens = parseGrayedLocationsList(text);
  return tokens
    .map((t) =>
      t
        .split(/\s+/)
        .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
        .join(' ')
    )
    .join(', ');
}

/** @returns {string} display string e.g. "Watch, Buy" */
export function getStoredGrayedLocationsText() {
  try {
    const raw = localStorage.getItem(CONFIG.GRAYED_LOCATIONS_STORAGE);
    if (raw == null) return CONFIG.GRAYED_LOCATIONS_DEFAULT;
    return formatGrayedLocationsList(raw);
  } catch {
    return CONFIG.GRAYED_LOCATIONS_DEFAULT;
  }
}

/** @returns {Set<string>} lowercase location labels to gray */
export function getStoredGrayedLocationsSet() {
  return new Set(parseGrayedLocationsList(getStoredGrayedLocationsText()));
}

/**
 * @param {unknown} text
 * @returns {string} stored display string
 */
export function setStoredGrayedLocationsText(text) {
  const formatted = formatGrayedLocationsList(text);
  try {
    if (formatted === formatGrayedLocationsList(CONFIG.GRAYED_LOCATIONS_DEFAULT)) {
      localStorage.removeItem(CONFIG.GRAYED_LOCATIONS_STORAGE);
    } else {
      localStorage.setItem(CONFIG.GRAYED_LOCATIONS_STORAGE, formatted);
    }
  } catch {
    /* private mode */
  }
  return formatted;
}

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
 * Clamp and normalize poster backlight intensity percent (0–100).
 * @param {unknown} value
 * @returns {number}
 */
export function clampPosterBacklightPercent(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return CONFIG.POSTER_BACKLIGHT_DEFAULT;
  return Math.min(
    CONFIG.POSTER_BACKLIGHT_MAX,
    Math.max(CONFIG.POSTER_BACKLIGHT_MIN, n)
  );
}

/** @returns {number} percent 0–100 */
export function getStoredPosterBacklightPercent() {
  try {
    const raw = localStorage.getItem(CONFIG.POSTER_BACKLIGHT_STORAGE);
    if (raw == null || raw === '') return CONFIG.POSTER_BACKLIGHT_DEFAULT;
    return clampPosterBacklightPercent(raw);
  } catch {
    return CONFIG.POSTER_BACKLIGHT_DEFAULT;
  }
}

/**
 * @param {unknown} percent
 * @returns {number} stored percent
 */
export function setStoredPosterBacklightPercent(percent) {
  const n = clampPosterBacklightPercent(percent);
  try {
    if (n === CONFIG.POSTER_BACKLIGHT_DEFAULT) {
      localStorage.removeItem(CONFIG.POSTER_BACKLIGHT_STORAGE);
    } else {
      localStorage.setItem(CONFIG.POSTER_BACKLIGHT_STORAGE, String(n));
    }
  } catch {
    /* private mode */
  }
  return n;
}

/**
 * Apply poster backlight intensity to the document (preview or after Save).
 * Sets --poster-backlight on &lt;html&gt; as a unitless 0–1 factor for CSS.
 * @param {unknown} percent 0–100
 * @returns {number} applied percent
 */
export function applyPosterBacklight(percent) {
  const n = clampPosterBacklightPercent(percent);
  document.documentElement.style.setProperty(
    '--poster-backlight',
    String(n / 100)
  );
  return n;
}

/** Map legacy Settings values to ISO 639-1 ids. */
const LEGACY_LOCALE_MAP = Object.freeze({
  en_us: 'en',
  de_de: 'de',
});

/**
 * Normalize a language id to a known ISO 639-1 option, or default (`en`).
 * Accepts `en`, `en-US`, `en_US` (case-insensitive).
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeLocale(value) {
  let raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return CONFIG.LOCALE_DEFAULT;
  raw = raw.replace(/-/g, '_');
  if (LEGACY_LOCALE_MAP[raw]) raw = LEGACY_LOCALE_MAP[raw];
  // en_US → en; keep bare codes like nb, zh
  if (raw.includes('_')) raw = raw.split('_')[0];
  const found = LOCALE_OPTIONS.find((o) => o.id === raw);
  return found ? found.id : CONFIG.LOCALE_DEFAULT;
}

/** @returns {string} ISO 639-1 id e.g. en */
export function getStoredLocale() {
  try {
    const raw = localStorage.getItem(CONFIG.LOCALE_STORAGE);
    if (raw == null || raw === '') return CONFIG.LOCALE_DEFAULT;
    return normalizeLocale(raw);
  } catch {
    return CONFIG.LOCALE_DEFAULT;
  }
}

/**
 * @param {unknown} locale
 * @returns {string} stored ISO 639-1 id
 */
export function setStoredLocale(locale) {
  const id = normalizeLocale(locale);
  try {
    if (id === CONFIG.LOCALE_DEFAULT) {
      localStorage.removeItem(CONFIG.LOCALE_STORAGE);
    } else {
      localStorage.setItem(CONFIG.LOCALE_STORAGE, id);
    }
  } catch {
    /* private mode */
  }
  return id;
}

/**
 * Convert stored language id to TMDB `language` query value (ISO 639-1).
 * @param {unknown} [locale]
 * @returns {string}
 */
export function localeToTmdbLanguage(locale) {
  return normalizeLocale(locale ?? getStoredLocale());
}

/**
 * Normalize a theme id to a known option, or default (`dark`).
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeTheme(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return CONFIG.THEME_DEFAULT;
  const found = THEME_OPTIONS.find((o) => o.id === raw);
  return found ? found.id : CONFIG.THEME_DEFAULT;
}

/** @returns {string} theme id e.g. dark */
export function getStoredTheme() {
  try {
    const raw = localStorage.getItem(CONFIG.THEME_STORAGE);
    if (raw == null || raw === '') return CONFIG.THEME_DEFAULT;
    return normalizeTheme(raw);
  } catch {
    return CONFIG.THEME_DEFAULT;
  }
}

/**
 * @param {unknown} theme
 * @returns {string} stored theme id
 */
export function setStoredTheme(theme) {
  const id = normalizeTheme(theme);
  try {
    if (id === CONFIG.THEME_DEFAULT) {
      localStorage.removeItem(CONFIG.THEME_STORAGE);
    } else {
      localStorage.setItem(CONFIG.THEME_STORAGE, id);
    }
  } catch {
    /* private mode */
  }
  return id;
}

/**
 * Convert a CSS color (hex / rgb / rgba) to #rrggbb for &lt;input type="color"&gt;.
 * @param {unknown} input
 * @returns {string}
 */
export function cssColorToHex(input) {
  const s = String(input ?? '').trim();
  if (!s) return '#000000';
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  if (/^#[0-9a-fA-F]{8}$/.test(s)) return `#${s.slice(1, 7).toLowerCase()}`;
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    const r = s[1];
    const g = s[2];
    const b = s[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  const m = s.match(
    /rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)/i
  );
  if (m) {
    const h = (n) =>
      Math.max(0, Math.min(255, Math.round(Number(n))))
        .toString(16)
        .padStart(2, '0');
    return `#${h(m[1])}${h(m[2])}${h(m[3])}`;
  }
  // Last resort: browser color parsing via canvas
  try {
    const ctx = document.createElement('canvas').getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#000000';
      ctx.fillStyle = s;
      const v = String(ctx.fillStyle);
      if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
      const m2 = v.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (m2) {
        const h = (n) => Number(n).toString(16).padStart(2, '0');
        return `#${h(m2[1])}${h(m2[2])}${h(m2[3])}`;
      }
    }
  } catch {
    /* ignore */
  }
  return '#000000';
}

/**
 * @param {unknown} value
 * @returns {string|null} #rrggbb or null if invalid
 */
export function normalizeHexColor(value) {
  const s = String(value ?? '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    return cssColorToHex(s);
  }
  if (/^[0-9a-fA-F]{6}$/.test(s)) return `#${s.toLowerCase()}`;
  return null;
}

/**
 * Keep only known theme color keys with valid #rrggbb values.
 * @param {unknown} raw
 * @returns {Record<string, string>}
 */
export function normalizeThemeColors(raw) {
  /** @type {Record<string, string>} */
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(/** @type {Record<string, unknown>} */ (raw))) {
    if (!THEME_COLOR_KEY_SET.has(k)) continue;
    const hex = normalizeHexColor(v);
    if (hex) out[k] = hex;
  }
  return out;
}

/** @returns {Record<string, string>} */
export function getStoredThemeColors() {
  try {
    const raw = localStorage.getItem(CONFIG.THEME_COLORS_STORAGE);
    if (!raw) return {};
    return normalizeThemeColors(JSON.parse(raw));
  } catch {
    return {};
  }
}

/**
 * @param {unknown} colors
 * @returns {Record<string, string>} stored map
 */
export function setStoredThemeColors(colors) {
  const map = normalizeThemeColors(colors);
  try {
    if (!Object.keys(map).length) {
      localStorage.removeItem(CONFIG.THEME_COLORS_STORAGE);
    } else {
      localStorage.setItem(CONFIG.THEME_COLORS_STORAGE, JSON.stringify(map));
    }
  } catch {
    /* private mode */
  }
  return map;
}

/** Clear all custom CSS variable overrides from &lt;html&gt;. */
export function clearThemeColorOverrides() {
  const root = document.documentElement;
  for (const field of THEME_COLOR_FIELDS) {
    root.style.removeProperty(`--${field.key}`);
  }
}

/**
 * Apply custom color overrides as inline CSS variables on &lt;html&gt;.
 * @param {Record<string, string>|null|undefined} colors
 */
export function applyThemeColorOverrides(colors) {
  clearThemeColorOverrides();
  const map = normalizeThemeColors(colors);
  const root = document.documentElement;
  for (const [key, hex] of Object.entries(map)) {
    root.style.setProperty(`--${key}`, hex);
  }
}

/**
 * Apply a theme to the document (preview or after Save).
 * Does not write localStorage — use setStoredTheme / setStoredThemeColors.
 * @param {unknown} theme
 * @param {Record<string, string>|null|undefined} [customColors]
 * @returns {string} applied theme id
 */
export function applyTheme(theme, customColors) {
  const id = normalizeTheme(theme);
  const opt = THEME_OPTIONS.find((o) => o.id === id);
  const root = document.documentElement;
  // Clear overrides first so the base theme paints cleanly, then re-apply.
  clearThemeColorOverrides();
  root.setAttribute('data-theme', id);
  root.style.colorScheme = opt?.scheme === 'light' ? 'light' : 'dark';
  if (customColors && Object.keys(customColors).length) {
    applyThemeColorOverrides(customColors);
  }
  return id;
}

/**
 * Read resolved theme colors from the live document (after applyTheme).
 * @returns {Record<string, string>} key → #rrggbb
 */
export function readResolvedThemeColors() {
  const cs = getComputedStyle(document.documentElement);
  /** @type {Record<string, string>} */
  const out = {};
  for (const field of THEME_COLOR_FIELDS) {
    out[field.key] = cssColorToHex(cs.getPropertyValue(`--${field.key}`));
  }
  return out;
}

/**
 * Base palette for a theme id (no custom overrides).
 * Temporarily applies the theme without custom colors, reads values, then
 * restores the previous theme + colors.
 * @param {unknown} theme
 * @param {unknown} [restoreTheme]
 * @param {Record<string, string>|null|undefined} [restoreColors]
 * @returns {Record<string, string>}
 */
export function getThemeBaseColors(theme, restoreTheme, restoreColors) {
  const id = normalizeTheme(theme);
  applyTheme(id, null);
  const base = readResolvedThemeColors();
  if (restoreTheme != null) {
    applyTheme(restoreTheme, restoreColors);
  }
  return base;
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
  'binder',
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
  binder: 'binder',
  director: 'director',
  actor: 'actor',
  collection: 'collection',
  company: 'company',
  keyword: 'keyword',
  year: 'year',
  genre: 'genre',
  vote: 'vote',
};

/**
 * Typeahead choices for the binder filter (stored as yes/no after normalize).
 * Human-readable so typing "binder" / "in" finds them.
 */
export const BINDER_FILTER_OPTIONS = Object.freeze([
  { value: 'yes', label: 'In binder' },
  { value: 'no', label: 'Not in binder' },
]);

/**
 * Binder notation presets (Settings → Binders).
 * patterns: regex source strings (no slashes); matched with flags `iu` (or `u` only if needed).
 * Empty location never matches. Multiple patterns are OR’d.
 * @type {ReadonlyArray<{
 *   id: string,
 *   label: string,
 *   description: string,
 *   examples: string,
 *   patterns: string[]|null,
 * }>}
 */
export const BINDER_NOTATION_OPTIONS = Object.freeze([
  {
    id: 'letter-page',
    label: 'Letter + page (A1)',
    description: 'Single letter binder id and numeric page/slot (A1, F42).',
    examples: 'A1, F42, N13',
    patterns: Object.freeze(['^[A-Za-z]\\d{1,3}$']),
  },
  {
    id: 'color-page',
    label: 'Color + page (Blue A)',
    description: 'Color name, space, then page letter or number.',
    examples: 'Blue A, Red 12, Green B',
    patterns: Object.freeze([
      '^(?:Blue|Red|Green|Yellow|Orange|Purple|Pink|Black|White|Gray|Grey|Brown)\\s+[A-Za-z0-9]+$',
    ]),
  },
  {
    id: 'roman-page',
    label: 'Roman + page (VIII A)',
    description: 'Roman-numeral binder id, optional hyphen, then page token.',
    examples: 'VIII A, VIII-A, XII 3',
    patterns: Object.freeze(['^[IVXLCDM]+\\s*-?\\s*[A-Za-z0-9]+$']),
  },
  {
    id: 'emoji-page',
    label: 'Emoji + page (😀1)',
    description: 'Leading emoji (or emoji sequence), optional space, then page.',
    examples: '😀1, 📕 A, 😊12',
    patterns: Object.freeze([
      // Extended pictographic (+ ZWJ sequences / variation selectors) then page
      '^(?:\\p{Extended_Pictographic}(?:\\uFE0F|\\uFE0E)?(?:\\u200D\\p{Extended_Pictographic}(?:\\uFE0F|\\uFE0E)?)*)+\\s*[A-Za-z0-9]+$',
    ]),
  },
  {
    id: 'custom',
    label: 'Custom…',
    description:
      'Your own patterns: one JavaScript regular expression per line (OR). Lines starting with # are comments.',
    examples: 'any notation you invent',
    patterns: null,
  },
]);

const BINDER_NOTATION_ID_SET = new Set(
  BINDER_NOTATION_OPTIONS.map((o) => o.id)
);

/**
 * @param {unknown} id
 * @returns {string}
 */
export function normalizeBinderNotationId(id) {
  const s = String(id || '').trim();
  if (BINDER_NOTATION_ID_SET.has(s)) return s;
  return CONFIG.BINDER_NOTATION_DEFAULT;
}

/** @returns {string} */
export function getStoredBinderNotationId() {
  try {
    const raw = localStorage.getItem(CONFIG.BINDER_NOTATION_STORAGE);
    if (raw == null || raw === '') return CONFIG.BINDER_NOTATION_DEFAULT;
    return normalizeBinderNotationId(raw);
  } catch {
    return CONFIG.BINDER_NOTATION_DEFAULT;
  }
}

/**
 * @param {unknown} id
 * @returns {string} stored id
 */
export function setStoredBinderNotationId(id) {
  const n = normalizeBinderNotationId(id);
  try {
    if (n === CONFIG.BINDER_NOTATION_DEFAULT) {
      localStorage.removeItem(CONFIG.BINDER_NOTATION_STORAGE);
    } else {
      localStorage.setItem(CONFIG.BINDER_NOTATION_STORAGE, n);
    }
  } catch {
    /* private mode */
  }
  return n;
}

/** @returns {string} multiline custom pattern text */
export function getStoredBinderCustomPatterns() {
  try {
    const raw = localStorage.getItem(CONFIG.BINDER_NOTATION_CUSTOM_STORAGE);
    if (raw == null) return CONFIG.BINDER_NOTATION_CUSTOM_DEFAULT;
    return String(raw);
  } catch {
    return CONFIG.BINDER_NOTATION_CUSTOM_DEFAULT;
  }
}

/**
 * @param {unknown} text
 * @returns {string} stored text
 */
export function setStoredBinderCustomPatterns(text) {
  const s = String(text ?? '');
  try {
    if (s === CONFIG.BINDER_NOTATION_CUSTOM_DEFAULT) {
      localStorage.removeItem(CONFIG.BINDER_NOTATION_CUSTOM_STORAGE);
    } else {
      localStorage.setItem(CONFIG.BINDER_NOTATION_CUSTOM_STORAGE, s);
    }
  } catch {
    /* private mode */
  }
  return s;
}

/**
 * Parse custom textarea into pattern source lines (skip blanks and # comments).
 * @param {unknown} text
 * @returns {string[]}
 */
export function parseBinderCustomPatternLines(text) {
  const lines = String(text ?? '').split(/\r?\n/);
  /** @type {string[]} */
  const out = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    out.push(t);
  }
  return out;
}

/**
 * Resolve pattern source strings for a notation id.
 * @param {unknown} notationId
 * @param {unknown} [customText] used when id is custom
 * @returns {string[]}
 */
export function resolveBinderPatternSources(notationId, customText) {
  const id = normalizeBinderNotationId(notationId);
  if (id === 'custom') {
    const lines = parseBinderCustomPatternLines(customText);
    return lines.length
      ? lines
      : parseBinderCustomPatternLines(CONFIG.BINDER_NOTATION_CUSTOM_DEFAULT);
  }
  const opt = BINDER_NOTATION_OPTIONS.find((o) => o.id === id);
  return opt?.patterns ? [...opt.patterns] : [...(BINDER_NOTATION_OPTIONS[0].patterns || [])];
}

/**
 * Compile pattern sources to RegExp list. Invalid patterns are skipped and reported.
 * @param {string[]} sources
 * @returns {{ regexes: RegExp[], errors: { source: string, message: string }[] }}
 */
export function compileBinderRegexes(sources) {
  /** @type {RegExp[]} */
  const regexes = [];
  /** @type {{ source: string, message: string }[]} */
  const errors = [];
  for (const source of sources) {
    try {
      // `i` for roman/color friendliness; `u` for emoji property escapes
      regexes.push(new RegExp(source, 'iu'));
    } catch (err) {
      errors.push({
        source,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { regexes, errors };
}

/** Typeahead group order (title near top; year before keyword so "2020" ranks over "2020s") */
export const TYPEAHEAD_GROUP_ORDER = [
  'title',
  'genre',
  'year',
  'binder',
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
