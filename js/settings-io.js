/**
 * Settings import / export / clear-session helpers.
 *
 * Known localStorage keys under pmi:*. API keys are excluded from export;
 * if present in an import file they are still applied, with a red warning.
 */

import {
  CONFIG,
  clampPosterBacklightPercent,
  clampPosterGapPx,
  clampPosterScalePercent,
  formatGrayedLocationsList,
  getStoredBinderCustomPatterns,
  getStoredBinderNotationId,
  getStoredBulkMetaConfirm2,
  getStoredFontSize,
  getStoredGrayedLocationsText,
  getStoredLocale,
  getStoredLocationOverlayEnabled,
  getStoredMenuAccordionGroup,
  getStoredPosterBacklightPercent,
  getStoredPosterGapPx,
  getStoredPosterScalePercent,
  getStoredPosterSource,
  getStoredTheme,
  getStoredThemeColors,
  normalizeBinderNotationId,
  normalizeFontSize,
  normalizeLocale,
  normalizeMenuAccordionGroup,
  normalizePosterSource,
  normalizeTheme,
  normalizeThemeColors,
  setStoredBinderCustomPatterns,
  setStoredBinderNotationId,
  setStoredBulkMetaConfirm2,
  setStoredFontSize,
  setStoredGrayedLocationsText,
  setStoredLocale,
  setStoredLocationOverlayEnabled,
  setStoredMenuAccordionGroup,
  setStoredPosterBacklightPercent,
  setStoredPosterGapPx,
  setStoredPosterScalePercent,
  setStoredPosterSource,
  setStoredTheme,
  setStoredThemeColors,
} from './config.js';
import {
  GITHUB_TOKEN_STORAGE,
  getStoredGithubToken,
  setStoredGithubToken,
} from './github.js';
import {
  TMDB_API_KEY_STORAGE,
  getStoredTmdbApiKey,
  setStoredTmdbApiKey,
} from './tmdb.js';

/** @typedef {'applied' | 'default' | 'invalid' | 'ignored' | 'secret'} SettingsImportStatus */

/**
 * @typedef {{
 *   key: string,
 *   label: string,
 *   status: SettingsImportStatus,
 *   detail?: string,
 * }} SettingsImportLine
 */

export const SETTINGS_EXPORT_FILENAME = 'settings.json';

/** Storage keys that must never appear in an export file. */
export const SETTINGS_SECRET_KEYS = Object.freeze([
  TMDB_API_KEY_STORAGE,
  GITHUB_TOKEN_STORAGE,
]);

const SECRET_KEY_SET = new Set(SETTINGS_SECRET_KEYS);

/**
 * Parse a boolean-like import value.
 * @param {unknown} raw
 * @returns {boolean|null} null if not recognizably boolean
 */
function parseBool(raw) {
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') {
    if (raw === 1) return true;
    if (raw === 0) return false;
    return null;
  }
  const s = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (s === '1' || s === 'true' || s === 'yes' || s === 'on') return true;
  if (s === '0' || s === 'false' || s === 'no' || s === 'off') return false;
  return null;
}

/**
 * @param {unknown} raw
 * @returns {number|null}
 */
function parseNumber(raw) {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number(raw.trim());
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * @param {unknown} raw
 * @returns {Record<string, string>|null} null if unusable
 */
function parseThemeColorsValue(raw) {
  if (raw == null || raw === '') return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return normalizeThemeColors(raw);
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return normalizeThemeColors(parsed);
      }
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * @param {unknown} raw
 * @param {string} normalized
 * @returns {boolean} true if raw already names this option (case-insensitive)
 */
function rawMatchesId(raw, normalized) {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
  const n = String(normalized).toLowerCase();
  if (s === n) return true;
  // locale legacy en_US → en
  if (s.includes('_') && s.split('_')[0] === n) return true;
  return false;
}

/**
 * Non-secret settings that participate in import/export.
 * apply(raw): raw is undefined when the key is missing from the file.
 * @type {ReadonlyArray<{
 *   key: string,
 *   label: string,
 *   exportValue: () => unknown,
 *   apply: (raw: unknown|undefined) => { status: 'applied'|'default'|'invalid', detail?: string, value?: unknown },
 * }>}
 */
const SETTINGS_FIELDS = Object.freeze([
  {
    key: CONFIG.LOCALE_STORAGE,
    label: 'locale',
    exportValue: () => getStoredLocale(),
    apply(raw) {
      if (raw === undefined) {
        const v = setStoredLocale(CONFIG.LOCALE_DEFAULT);
        return { status: 'default', detail: 'missing → default', value: v };
      }
      const id = normalizeLocale(raw);
      if (String(raw).trim() !== '' && !rawMatchesId(raw, id)) {
        const v = setStoredLocale(CONFIG.LOCALE_DEFAULT);
        return {
          status: 'invalid',
          detail: `invalid “${String(raw)}” → default`,
          value: v,
        };
      }
      const v = setStoredLocale(id);
      return { status: 'applied', value: v };
    },
  },
  {
    key: CONFIG.THEME_STORAGE,
    label: 'theme',
    exportValue: () => getStoredTheme(),
    apply(raw) {
      if (raw === undefined) {
        const v = setStoredTheme(CONFIG.THEME_DEFAULT);
        return { status: 'default', detail: 'missing → default', value: v };
      }
      const id = normalizeTheme(raw);
      if (String(raw).trim() !== '' && !rawMatchesId(raw, id)) {
        const v = setStoredTheme(CONFIG.THEME_DEFAULT);
        return {
          status: 'invalid',
          detail: `invalid “${String(raw)}” → default`,
          value: v,
        };
      }
      const v = setStoredTheme(id);
      return { status: 'applied', value: v };
    },
  },
  {
    key: CONFIG.THEME_COLORS_STORAGE,
    label: 'theme colors',
    exportValue: () => getStoredThemeColors(),
    apply(raw) {
      if (raw === undefined) {
        const v = setStoredThemeColors({});
        return { status: 'default', detail: 'missing → default (none)', value: v };
      }
      const map = parseThemeColorsValue(raw);
      if (map == null) {
        const v = setStoredThemeColors({});
        return {
          status: 'invalid',
          detail: 'invalid theme colors → default (none)',
          value: v,
        };
      }
      const v = setStoredThemeColors(map);
      return { status: 'applied', value: v };
    },
  },
  {
    key: CONFIG.FONT_SIZE_STORAGE,
    label: 'font size',
    exportValue: () => getStoredFontSize(),
    apply(raw) {
      if (raw === undefined) {
        const v = setStoredFontSize(CONFIG.FONT_SIZE_DEFAULT);
        return { status: 'default', detail: 'missing → default', value: v };
      }
      const id = normalizeFontSize(raw);
      const s = String(raw ?? '')
        .trim()
        .toLowerCase();
      if (s && s !== 'small' && s !== 'large') {
        const v = setStoredFontSize(CONFIG.FONT_SIZE_DEFAULT);
        return {
          status: 'invalid',
          detail: `invalid “${String(raw)}” → default`,
          value: v,
        };
      }
      const v = setStoredFontSize(id);
      return { status: 'applied', value: v };
    },
  },
  {
    key: CONFIG.POSTER_SCALE_STORAGE,
    label: 'poster scale',
    exportValue: () => getStoredPosterScalePercent(),
    apply(raw) {
      if (raw === undefined) {
        const v = setStoredPosterScalePercent(CONFIG.POSTER_SCALE_DEFAULT);
        return { status: 'default', detail: 'missing → default', value: v };
      }
      const n = parseNumber(raw);
      if (n == null) {
        const v = setStoredPosterScalePercent(CONFIG.POSTER_SCALE_DEFAULT);
        return {
          status: 'invalid',
          detail: `invalid “${String(raw)}” → default`,
          value: v,
        };
      }
      const v = setStoredPosterScalePercent(clampPosterScalePercent(n));
      return { status: 'applied', value: v };
    },
  },
  {
    key: CONFIG.POSTER_GAP_STORAGE,
    label: 'poster gap',
    exportValue: () => getStoredPosterGapPx(),
    apply(raw) {
      if (raw === undefined) {
        const v = setStoredPosterGapPx(CONFIG.POSTER_GAP_DEFAULT);
        return { status: 'default', detail: 'missing → default', value: v };
      }
      const n = parseNumber(raw);
      if (n == null) {
        const v = setStoredPosterGapPx(CONFIG.POSTER_GAP_DEFAULT);
        return {
          status: 'invalid',
          detail: `invalid “${String(raw)}” → default`,
          value: v,
        };
      }
      const v = setStoredPosterGapPx(clampPosterGapPx(n));
      return { status: 'applied', value: v };
    },
  },
  {
    key: CONFIG.POSTER_BACKLIGHT_STORAGE,
    label: 'poster lighting',
    exportValue: () => getStoredPosterBacklightPercent(),
    apply(raw) {
      if (raw === undefined) {
        const v = setStoredPosterBacklightPercent(CONFIG.POSTER_BACKLIGHT_DEFAULT);
        return { status: 'default', detail: 'missing → default', value: v };
      }
      const n = parseNumber(raw);
      if (n == null) {
        const v = setStoredPosterBacklightPercent(CONFIG.POSTER_BACKLIGHT_DEFAULT);
        return {
          status: 'invalid',
          detail: `invalid “${String(raw)}” → default`,
          value: v,
        };
      }
      const v = setStoredPosterBacklightPercent(clampPosterBacklightPercent(n));
      return { status: 'applied', value: v };
    },
  },
  {
    key: CONFIG.LOCATION_OVERLAY_STORAGE,
    label: 'location overlay',
    exportValue: () => getStoredLocationOverlayEnabled(),
    apply(raw) {
      if (raw === undefined) {
        const v = setStoredLocationOverlayEnabled(CONFIG.LOCATION_OVERLAY_DEFAULT);
        return { status: 'default', detail: 'missing → default', value: v };
      }
      const b = parseBool(raw);
      if (b == null) {
        const v = setStoredLocationOverlayEnabled(CONFIG.LOCATION_OVERLAY_DEFAULT);
        return {
          status: 'invalid',
          detail: `invalid “${String(raw)}” → default`,
          value: v,
        };
      }
      const v = setStoredLocationOverlayEnabled(b);
      return { status: 'applied', value: v };
    },
  },
  {
    key: CONFIG.GRAYED_LOCATIONS_STORAGE,
    label: 'grayed locations',
    exportValue: () => getStoredGrayedLocationsText(),
    apply(raw) {
      if (raw === undefined) {
        const v = setStoredGrayedLocationsText(CONFIG.GRAYED_LOCATIONS_DEFAULT);
        return { status: 'default', detail: 'missing → default', value: v };
      }
      if (typeof raw === 'object' && raw != null) {
        const v = setStoredGrayedLocationsText(CONFIG.GRAYED_LOCATIONS_DEFAULT);
        return {
          status: 'invalid',
          detail: 'invalid type → default',
          value: v,
        };
      }
      const v = setStoredGrayedLocationsText(formatGrayedLocationsList(raw));
      return { status: 'applied', value: v };
    },
  },
  {
    key: CONFIG.POSTER_SOURCE_STORAGE,
    label: 'poster source',
    exportValue: () => getStoredPosterSource(),
    apply(raw) {
      if (raw === undefined) {
        const v = setStoredPosterSource(CONFIG.POSTER_SOURCE_DEFAULT);
        return { status: 'default', detail: 'missing → default', value: v };
      }
      const id = normalizePosterSource(raw);
      const s = String(raw ?? '')
        .trim()
        .toLowerCase();
      if (s && s !== 'tmdb' && s !== 'local') {
        const v = setStoredPosterSource(CONFIG.POSTER_SOURCE_DEFAULT);
        return {
          status: 'invalid',
          detail: `invalid “${String(raw)}” → default`,
          value: v,
        };
      }
      const v = setStoredPosterSource(id);
      return { status: 'applied', value: v };
    },
  },
  {
    key: CONFIG.BULK_META_CONFIRM2_STORAGE,
    label: 'bulk refresh confirm',
    exportValue: () => getStoredBulkMetaConfirm2(),
    apply(raw) {
      if (raw === undefined) {
        const v = setStoredBulkMetaConfirm2(CONFIG.BULK_META_CONFIRM2_DEFAULT);
        return { status: 'default', detail: 'missing → default', value: v };
      }
      const b = parseBool(raw);
      if (b == null) {
        const v = setStoredBulkMetaConfirm2(CONFIG.BULK_META_CONFIRM2_DEFAULT);
        return {
          status: 'invalid',
          detail: `invalid “${String(raw)}” → default`,
          value: v,
        };
      }
      const v = setStoredBulkMetaConfirm2(b);
      return { status: 'applied', value: v };
    },
  },
  {
    key: CONFIG.BINDER_NOTATION_STORAGE,
    label: 'binder notation',
    exportValue: () => getStoredBinderNotationId(),
    apply(raw) {
      if (raw === undefined) {
        const v = setStoredBinderNotationId(CONFIG.BINDER_NOTATION_DEFAULT);
        return { status: 'default', detail: 'missing → default', value: v };
      }
      const id = normalizeBinderNotationId(raw);
      if (String(raw).trim() !== '' && String(raw).trim() !== id) {
        const v = setStoredBinderNotationId(CONFIG.BINDER_NOTATION_DEFAULT);
        return {
          status: 'invalid',
          detail: `invalid “${String(raw)}” → default`,
          value: v,
        };
      }
      const v = setStoredBinderNotationId(id);
      return { status: 'applied', value: v };
    },
  },
  {
    key: CONFIG.BINDER_NOTATION_CUSTOM_STORAGE,
    label: 'binder custom patterns',
    exportValue: () => getStoredBinderCustomPatterns(),
    apply(raw) {
      if (raw === undefined) {
        const v = setStoredBinderCustomPatterns(
          CONFIG.BINDER_NOTATION_CUSTOM_DEFAULT
        );
        return { status: 'default', detail: 'missing → default', value: v };
      }
      if (typeof raw === 'object' && raw != null) {
        const v = setStoredBinderCustomPatterns(
          CONFIG.BINDER_NOTATION_CUSTOM_DEFAULT
        );
        return {
          status: 'invalid',
          detail: 'invalid type → default',
          value: v,
        };
      }
      const v = setStoredBinderCustomPatterns(String(raw ?? ''));
      return { status: 'applied', value: v };
    },
  },
  {
    key: CONFIG.MENU_ACCORDION_STORAGE,
    label: 'menu section',
    exportValue: () => getStoredMenuAccordionGroup(),
    apply(raw) {
      if (raw === undefined) {
        const v = setStoredMenuAccordionGroup(CONFIG.MENU_ACCORDION_DEFAULT);
        return { status: 'default', detail: 'missing → default', value: v };
      }
      const id = normalizeMenuAccordionGroup(raw);
      if (String(raw).trim() !== '' && String(raw).trim() !== id) {
        const v = setStoredMenuAccordionGroup(CONFIG.MENU_ACCORDION_DEFAULT);
        return {
          status: 'invalid',
          detail: `invalid “${String(raw)}” → default`,
          value: v,
        };
      }
      const v = setStoredMenuAccordionGroup(id);
      return { status: 'applied', value: v };
    },
  },
]);

const KNOWN_KEY_SET = new Set([
  ...SETTINGS_FIELDS.map((f) => f.key),
  ...SETTINGS_SECRET_KEYS,
]);

/**
 * Build a plain object of current non-secret settings (export payload).
 * API keys are never included.
 * @returns {Record<string, unknown>}
 */
export function buildSettingsExportObject() {
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const field of SETTINGS_FIELDS) {
    out[field.key] = field.exportValue();
  }
  return out;
}

/**
 * @param {unknown} data
 * @returns {Record<string, unknown>|null}
 */
export function normalizeSettingsImportPayload(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const obj = /** @type {Record<string, unknown>} */ (data);
  // Optional wrappers: { settings: {...} } or { version, settings }
  if (
    obj.settings &&
    typeof obj.settings === 'object' &&
    !Array.isArray(obj.settings)
  ) {
    return /** @type {Record<string, unknown>} */ (obj.settings);
  }
  return obj;
}

/**
 * Apply an imported settings object to localStorage.
 * Missing known keys → defaults. Invalid → log + default. Unknown keys ignored.
 * Secret keys present → applied + marked secret for a red warning.
 *
 * @param {unknown} data
 * @returns {{
 *   ok: boolean,
 *   error?: string,
 *   lines: SettingsImportLine[],
 *   secretsApplied: string[],
 * }}
 */
export function applySettingsImport(data) {
  const payload = normalizeSettingsImportPayload(data);
  if (!payload) {
    return {
      ok: false,
      error: 'Expected a JSON object of settings.',
      lines: [],
      secretsApplied: [],
    };
  }

  /** @type {SettingsImportLine[]} */
  const lines = [];
  /** @type {string[]} */
  const secretsApplied = [];

  // Unknown keys — ignore (report)
  for (const key of Object.keys(payload)) {
    if (!KNOWN_KEY_SET.has(key)) {
      lines.push({
        key,
        label: key,
        status: 'ignored',
        detail: 'unknown key ignored',
      });
    }
  }

  for (const field of SETTINGS_FIELDS) {
    const has = Object.prototype.hasOwnProperty.call(payload, field.key);
    const raw = has ? payload[field.key] : undefined;
    const result = field.apply(raw);
    lines.push({
      key: field.key,
      label: field.label,
      status: result.status,
      detail: result.detail,
    });
  }

  // Secrets: apply only when present in the file
  /** @type {{ key: string, label: string, set: (v: string) => string }[]} */
  const secrets = [
    {
      key: TMDB_API_KEY_STORAGE,
      label: 'TMDB API key',
      set: setStoredTmdbApiKey,
    },
    {
      key: GITHUB_TOKEN_STORAGE,
      label: 'GitHub API key',
      set: setStoredGithubToken,
    },
  ];
  for (const secret of secrets) {
    if (!Object.prototype.hasOwnProperty.call(payload, secret.key)) continue;
    const raw = payload[secret.key];
    if (raw != null && typeof raw === 'object') {
      lines.push({
        key: secret.key,
        label: secret.label,
        status: 'invalid',
        detail: 'invalid type — not applied',
      });
      continue;
    }
    secret.set(String(raw ?? ''));
    secretsApplied.push(secret.label);
    lines.push({
      key: secret.key,
      label: secret.label,
      status: 'secret',
      detail: 'applied from import file (sensitive)',
    });
  }

  return { ok: true, lines, secretsApplied };
}

/**
 * Wipe all localStorage for this origin.
 * @returns {{ before: number, after: number }}
 */
export function clearLocalStorageSession() {
  let before = 0;
  try {
    before = localStorage.length;
  } catch {
    before = 0;
  }
  try {
    localStorage.clear();
  } catch {
    /* private mode */
  }
  let after = 0;
  try {
    after = localStorage.length;
  } catch {
    after = 0;
  }
  return { before, after };
}

/**
 * Snapshot of current effective settings (for UI re-apply after import/clear).
 * @returns {{
 *   locale: string,
 *   theme: string,
 *   themeColors: Record<string, string>,
 *   fontSize: 'small'|'large',
 *   posterScale: number,
 *   posterGap: number,
 *   posterBacklight: number,
 *   locationOverlay: boolean,
 *   grayedLocations: string,
 *   posterSource: 'tmdb'|'local',
 *   bulkMetaConfirm2: boolean,
 *   binderNotationId: string,
 *   binderCustomPatterns: string,
 *   tmdbApiKey: string,
 *   githubToken: string,
 * }}
 */
export function readEffectiveSettingsSnapshot() {
  return {
    locale: getStoredLocale(),
    theme: getStoredTheme(),
    themeColors: getStoredThemeColors(),
    fontSize: getStoredFontSize(),
    posterScale: getStoredPosterScalePercent(),
    posterGap: getStoredPosterGapPx(),
    posterBacklight: getStoredPosterBacklightPercent(),
    locationOverlay: getStoredLocationOverlayEnabled(),
    grayedLocations: getStoredGrayedLocationsText(),
    posterSource: getStoredPosterSource(),
    bulkMetaConfirm2: getStoredBulkMetaConfirm2(),
    binderNotationId: getStoredBinderNotationId(),
    binderCustomPatterns: getStoredBinderCustomPatterns(),
    tmdbApiKey: getStoredTmdbApiKey(),
    githubToken: getStoredGithubToken(),
  };
}

export { SECRET_KEY_SET, SETTINGS_FIELDS };
