/**
 * Settings dialog: open/close/save, live preview, and prefs re-apply after import/clear.
 */

import {
  BINDER_NOTATION_OPTIONS,
  CONFIG,
  FONT_SIZE_OPTIONS,
  LOCALE_OPTIONS,
  THEME_COLOR_FIELDS,
  THEME_OPTIONS,
  applyFontSize,
  applyPosterBacklight,
  applyTheme,
  clampPosterBacklightPercent,
  clampPosterGapPx,
  clampPosterScalePercent,
  compileBinderRegexes,
  getStoredBinderCustomPatterns,
  getStoredBinderNotationId,
  getStoredBulkMetaConfirm2,
  getStoredFontSize,
  getStoredGrayedLocationsSet,
  getStoredGrayedLocationsText,
  getStoredLocale,
  getStoredLocationOverlayEnabled,
  getStoredPosterBacklightPercent,
  getStoredPosterGapPx,
  getStoredPosterScalePercent,
  getStoredPosterSource,
  getStoredTheme,
  getStoredThemeColors,
  normalizeBinderNotationId,
  normalizeFontSize,
  normalizeTheme,
  parseGrayedLocationsList,
  readResolvedThemeColors,
  resolveBinderPatternSources,
  setPosterSourceOverride,
  setStoredBinderCustomPatterns,
  setStoredBinderNotationId,
  setStoredBulkMetaConfirm2,
  setStoredFontSize,
  setStoredGrayedLocationsText,
  setStoredLocale,
  setStoredLocationOverlayEnabled,
  setStoredPosterBacklightPercent,
  setStoredPosterGapPx,
  setStoredPosterScalePercent,
  setStoredPosterSource,
  setStoredTheme,
  setStoredThemeColors,
} from './config.js';
import {
  applyBinderNotation,
  countBinderMatches,
  testBinderLocation,
} from './filters.js';
import { getStoredTmdbApiKey, setStoredTmdbApiKey } from './tmdb.js';
import { getStoredGithubToken, setStoredGithubToken } from './github.js';
import { isAppAlertOpen } from './alert-dialog.js';
import { syncUiLocaleFromSettings, t } from './i18n.js';
import { resetDialogScroll } from './progress-console.js';
import { readEffectiveSettingsSnapshot } from './settings-io.js';
import {
  copyTextToClipboard,
  flashCopyButton,
  isPrimaryActionEnter,
} from './utils.js';

/**
 * @param {{
 *   els: Record<string, any>,
 *   grid: { setScale: Function, setGap: Function, setLocationOverlay: Function, setGrayedLocations: Function, render: Function },
 *   dialog: { isOpen: Function, movie: any, open: Function, render: Function },
 *   closeMenu: () => void,
 *   focusFilterWhenIdle: () => void,
 *   isAnyModalOpen: () => boolean,
 *   getMovies: () => object[],
 *   hasBinderFilter: () => boolean,
 *   recompute: (opts?: { resetScroll?: boolean }) => void,
 * }} opts
 */
export function initSettingsUi(opts) {
  const {
    els,
    grid,
    dialog,
    closeMenu,
    focusFilterWhenIdle,
    isAnyModalOpen,
    getMovies,
    hasBinderFilter,
    recompute,
  } = opts;

  /** Last saved poster layout prefs; used to revert preview on Settings cancel. */
  let savedPosterScalePercent = getStoredPosterScalePercent();
  let savedPosterGapPx = getStoredPosterGapPx();
  let savedPosterBacklightPercent = getStoredPosterBacklightPercent();
  let savedLocationOverlay = getStoredLocationOverlayEnabled();
  let savedGrayedLocationsText = getStoredGrayedLocationsText();
  let savedPosterSource = getStoredPosterSource();
  let savedBulkMetaConfirm2 = getStoredBulkMetaConfirm2();
  let savedBinderNotationId = getStoredBinderNotationId();
  let savedBinderCustomPatterns = getStoredBinderCustomPatterns();
  /** Last saved theme prefs; used to revert Settings theme preview on cancel. */
  let savedThemeId = getStoredTheme();
  /** @type {Record<string, string>} */
  let savedThemeColors = getStoredThemeColors();
  /** Draft custom colors while Settings is open (preview only until Save). */
  /** @type {Record<string, string>} */
  let draftThemeColors = { ...savedThemeColors };
  /** Font size while Settings is open (preview until Save). */
  let savedFontSize = getStoredFontSize();

  applyTheme(savedThemeId, savedThemeColors);
  applyFontSize(savedFontSize);
  syncUiLocaleFromSettings();
  applyPosterBacklight(savedPosterBacklightPercent);
  applyBinderNotation(savedBinderNotationId, savedBinderCustomPatterns);
  grid.setScale(savedPosterScalePercent / 100);
  grid.setGap(savedPosterGapPx);
  grid.setLocationOverlay(savedLocationOverlay);
  grid.setGrayedLocations(getStoredGrayedLocationsSet());

  function syncPosterScaleControl(percent) {
    const n = clampPosterScalePercent(percent);
    if (els.settingsPosterScale) {
      els.settingsPosterScale.value = String(n);
      els.settingsPosterScale.setAttribute('aria-valuenow', String(n));
      els.settingsPosterScale.setAttribute('aria-valuetext', `${n} percent`);
    }
    if (els.settingsPosterScaleValue) {
      els.settingsPosterScaleValue.value = `${n}%`;
      els.settingsPosterScaleValue.textContent = `${n}%`;
    }
    return n;
  }

  function syncPosterGapControl(px) {
    const n = clampPosterGapPx(px);
    if (els.settingsPosterGap) {
      els.settingsPosterGap.value = String(n);
      els.settingsPosterGap.setAttribute('aria-valuenow', String(n));
      els.settingsPosterGap.setAttribute('aria-valuetext', `${n} pixels`);
    }
    if (els.settingsPosterGapValue) {
      els.settingsPosterGapValue.value = `${n}px`;
      els.settingsPosterGapValue.textContent = `${n}px`;
    }
    return n;
  }

  function syncPosterBacklightControl(percent) {
    const n = clampPosterBacklightPercent(percent);
    if (els.settingsPosterBacklight) {
      els.settingsPosterBacklight.value = String(n);
      els.settingsPosterBacklight.setAttribute('aria-valuenow', String(n));
      els.settingsPosterBacklight.setAttribute('aria-valuetext', `${n} percent`);
    }
    if (els.settingsPosterBacklightValue) {
      els.settingsPosterBacklightValue.value = `${n}%`;
      els.settingsPosterBacklightValue.textContent = `${n}%`;
    }
    return n;
  }

  /**
   * Read slider and apply scale to the grid.
   * @param {{ preview?: boolean }} [opts]
   */
  function applyPosterScaleFromSettingsControl({ preview = false } = {}) {
    const n = clampPosterScalePercent(els.settingsPosterScale?.value);
    syncPosterScaleControl(n);
    grid.setScale(n / 100);
    if (!preview) {
      savedPosterScalePercent = setStoredPosterScalePercent(n);
    }
    return n;
  }

  /**
   * Read slider and apply gap to the grid.
   * @param {{ preview?: boolean }} [opts]
   */
  function applyPosterGapFromSettingsControl({ preview = false } = {}) {
    const n = clampPosterGapPx(els.settingsPosterGap?.value);
    syncPosterGapControl(n);
    grid.setGap(n);
    if (!preview) {
      savedPosterGapPx = setStoredPosterGapPx(n);
    }
    return n;
  }

  /**
   * Read slider and apply poster backlight intensity (live CSS).
   * @param {{ preview?: boolean }} [opts]
   */
  function applyPosterBacklightFromSettingsControl({ preview = false } = {}) {
    const n = clampPosterBacklightPercent(els.settingsPosterBacklight?.value);
    syncPosterBacklightControl(n);
    applyPosterBacklight(n);
    if (!preview) {
      savedPosterBacklightPercent = setStoredPosterBacklightPercent(n);
    }
    return n;
  }

  function populateLocaleSelect() {
    const sel = els.settingsLocale;
    if (!sel) return;
    const current = getStoredLocale();
    // Rebuild options from LOCALE_OPTIONS so the list stays in sync with config
    sel.replaceChildren();
    for (const opt of LOCALE_OPTIONS) {
      const o = document.createElement('option');
      o.value = opt.id;
      o.textContent = opt.label;
      if (opt.id === current) o.selected = true;
      sel.appendChild(o);
    }
    sel.value = current;
  }

  function populateBinderNotationSelect() {
    const sel = els.settingsBinderNotation;
    if (!sel) return;
    const current = normalizeBinderNotationId(
      els.settingsBinderNotation.value || savedBinderNotationId
    );
    sel.replaceChildren();
    const binderLabelKey = {
      'letter-page': 'binder.letterPage',
      'color-page': 'binder.colorPage',
      'roman-page': 'binder.romanPage',
      'emoji-page': 'binder.emojiPage',
      custom: 'binder.custom',
    };
    for (const opt of BINDER_NOTATION_OPTIONS) {
      const o = document.createElement('option');
      o.value = opt.id;
      const lk = binderLabelKey[opt.id];
      o.textContent = lk ? t(lk) : opt.label;
      if (opt.id === current) o.selected = true;
      sel.appendChild(o);
    }
    sel.value = current;
  }

  function syncBinderCustomVisibility() {
    const id = normalizeBinderNotationId(els.settingsBinderNotation?.value);
    const isCustom = id === 'custom';
    if (els.settingsBinderCustomWrap) {
      els.settingsBinderCustomWrap.hidden = !isCustom;
    }
    const opt = BINDER_NOTATION_OPTIONS.find((o) => o.id === id);
    if (els.settingsBinderNotationDesc && opt) {
      els.settingsBinderNotationDesc.textContent = `${opt.description} Examples: ${opt.examples}.`;
    }
  }

  /**
   * Preview binder notation against the loaded library; optionally apply live
   * so binder:yes filter updates while Settings is open.
   * @param {{ applyLive?: boolean }} [opts]
   */
  function updateBinderNotationPreview({ applyLive = false } = {}) {
    const id = normalizeBinderNotationId(els.settingsBinderNotation?.value);
    const custom = els.settingsBinderCustom?.value ?? savedBinderCustomPatterns;
    const sources = resolveBinderPatternSources(id, custom);
    const { regexes, errors } = compileBinderRegexes(sources);

    if (applyLive) {
      applyBinderNotation(id, custom);
      // Re-run filters if a binder leaf is active
      if (hasBinderFilter()) {
        recompute({ resetScroll: false });
      }
    }

    const preview = els.settingsBinderPreview;
    if (preview) {
      preview.classList.toggle('is-error', errors.length > 0);
      const total = getMovies().length;
      if (!regexes.length) {
        preview.textContent =
          errors.length > 0
            ? `Invalid pattern(s): ${errors.map((e) => e.message).join('; ')}. Falling back until fixed.`
            : 'No valid patterns.';
      } else {
        const matched = countBinderMatches(getMovies(), regexes);
        const errNote =
          errors.length > 0
            ? ` (${errors.length} invalid pattern${errors.length === 1 ? '' : 's'} skipped)`
            : '';
        preview.textContent = `${matched} of ${total} location${total === 1 ? '' : 's'} match this notation${errNote}.`;
      }
    }
    updateBinderTestResult(regexes);
  }

  /**
   * @param {RegExp[]} [regexes]
   */
  function updateBinderTestResult(regexes) {
    const el = els.settingsBinderTestResult;
    if (!el) return;
    const sample = String(els.settingsBinderTest?.value || '').trim();
    el.classList.remove('is-error', 'is-match');
    if (!sample) {
      el.textContent = '';
      return;
    }
    const matchers =
      regexes ||
      compileBinderRegexes(
        resolveBinderPatternSources(
          els.settingsBinderNotation?.value,
          els.settingsBinderCustom?.value
        )
      ).regexes;
    const hit = testBinderLocation(sample, matchers);
    el.classList.add(hit ? 'is-match' : 'is-error');
    el.textContent = hit
      ? `“${sample}” → In binder`
      : `“${sample}” → Not in binder`;
  }

  function populateThemeSelect() {
    const sel = els.settingsTheme;
    if (!sel) return;
    const current = normalizeTheme(savedThemeId);
    sel.replaceChildren();
    for (const opt of THEME_OPTIONS) {
      const o = document.createElement('option');
      o.value = opt.id;
      const themeKey = `theme.${opt.id}`;
      o.textContent = t(themeKey) !== themeKey ? t(themeKey) : opt.label;
      if (opt.id === current) o.selected = true;
      sel.appendChild(o);
    }
    sel.value = current;
  }

  /**
   * Build Settings color editor (swatches + gradient stop pickers).
   * Values come from base theme + draftThemeColors.
   */
  function ensureThemeColorControls() {
    const host = els.settingsThemeColors;
    if (!host || host.dataset.ready === '1') return;

    const singles = THEME_COLOR_FIELDS.filter((f) => f.group === 'single');
    const header = THEME_COLOR_FIELDS.filter((f) => f.group === 'header');
    const gridFields = THEME_COLOR_FIELDS.filter((f) => f.group === 'grid');
    const overlay = THEME_COLOR_FIELDS.filter((f) => f.group === 'overlay');

    const makeSwatch = (field) => {
      const wrap = document.createElement('label');
      wrap.className = 'theme-color-swatch';
      wrap.htmlFor = `settings-theme-color-${field.key}`;
      const lab = document.createElement('span');
      lab.className = 'theme-color-swatch-label';
      lab.textContent = field.label;
      const input = document.createElement('input');
      input.type = 'color';
      input.className = 'theme-color-input';
      input.id = `settings-theme-color-${field.key}`;
      input.dataset.themeVar = field.key;
      input.value = '#000000';
      input.setAttribute('aria-label', field.label);
      wrap.append(lab, input);
      return wrap;
    };

    const makeGradientBlock = (title, fields, previewId) => {
      const block = document.createElement('div');
      block.className = 'theme-gradient-block';
      const t = document.createElement('div');
      t.className = 'theme-gradient-title';
      t.textContent = title;
      const preview = document.createElement('div');
      preview.className = 'theme-gradient-preview';
      preview.id = previewId;
      preview.setAttribute('role', 'img');
      preview.setAttribute('aria-label', `${title} preview`);
      const stops = document.createElement('div');
      stops.className = 'theme-gradient-stops';
      for (const f of fields) stops.appendChild(makeSwatch(f));
      block.append(t, preview, stops);
      return block;
    };

    const makeOverlayBlock = (title, fields) => {
      const block = document.createElement('div');
      block.className = 'theme-gradient-block';
      const t = document.createElement('div');
      t.className = 'theme-gradient-title';
      t.textContent = title;
      const stops = document.createElement('div');
      stops.className = 'theme-gradient-stops';
      for (const f of fields) stops.appendChild(makeSwatch(f));
      // Mini preview of location overlay colors
      const preview = document.createElement('div');
      preview.className = 'theme-gradient-preview';
      preview.id = 'settings-theme-overlay-preview';
      preview.setAttribute('role', 'img');
      preview.setAttribute('aria-label', 'Location overlay preview');
      preview.textContent = 'A1 · Amazon';
      preview.style.display = 'flex';
      preview.style.alignItems = 'center';
      preview.style.justifyContent = 'center';
      preview.style.fontSize = '0.8rem';
      preview.style.fontWeight = '700';
      preview.style.letterSpacing = '0.03em';
      block.append(t, preview, stops);
      return block;
    };

    const gridEl = document.createElement('div');
    gridEl.className = 'theme-color-grid';
    for (const f of singles) gridEl.appendChild(makeSwatch(f));

    host.replaceChildren(
      gridEl,
      makeGradientBlock('Header gradient', header, 'settings-theme-header-preview'),
      makeGradientBlock('Poster grid gradient', gridFields, 'settings-theme-grid-preview'),
      makeOverlayBlock('Location overlay', overlay)
    );
    host.dataset.ready = '1';
  }

  function syncThemeColorControls() {
    ensureThemeColorControls();
    const host = els.settingsThemeColors;
    if (!host) return;

    // Document already has the preview theme applied; read resolved CSS vars.
    const resolved = readResolvedThemeColors();
    for (const field of THEME_COLOR_FIELDS) {
      const input = host.querySelector(
        `input[type="color"][data-theme-var="${field.key}"]`
      );
      if (input && resolved[field.key]) {
        input.value = resolved[field.key];
      }
    }
    updateThemeGradientPreviews();
  }

  function updateThemeGradientPreviews() {
    const host = els.settingsThemeColors;
    if (!host) return;
    const val = (key) => {
      const input = host.querySelector(
        `input[type="color"][data-theme-var="${key}"]`
      );
      return input?.value || '#000000';
    };
    const headerPreview = host.querySelector('#settings-theme-header-preview');
    const gridPreview = host.querySelector('#settings-theme-grid-preview');
    if (headerPreview) {
      headerPreview.style.background = `linear-gradient(90deg, ${val('header-a')}, ${val('header-b')})`;
    }
    if (gridPreview) {
      gridPreview.style.background = `linear-gradient(90deg, ${val('bg-grid-a')}, ${val('bg-grid-b')})`;
    }
    const overlayPreview = host.querySelector('#settings-theme-overlay-preview');
    if (overlayPreview) {
      const bg = val('poster-loc-bg');
      const fg = val('poster-loc-text');
      overlayPreview.style.background = `color-mix(in srgb, ${bg} 68%, transparent)`;
      overlayPreview.style.color = fg;
      overlayPreview.style.borderColor = `color-mix(in srgb, ${fg} 22%, transparent)`;
    }
  }

  /**
   * Show/hide + copy controls for a password-style settings field.
   * @param {HTMLInputElement|null} input
   * @param {HTMLButtonElement|null} toggleBtn
   * @param {HTMLButtonElement|null} copyBtn
   */
  function wireSecretFieldControls(input, toggleBtn, copyBtn) {
    if (!input) return;

    const setVisible = (visible) => {
      input.type = visible ? 'text' : 'password';
      if (!toggleBtn) return;
      toggleBtn.setAttribute('aria-pressed', visible ? 'true' : 'false');
      const label = visible ? 'Hide key' : 'Show key';
      toggleBtn.setAttribute('aria-label', label);
      toggleBtn.setAttribute('title', label);
      const showIcon = toggleBtn.querySelector('.form-secret-icon-show');
      const hideIcon = toggleBtn.querySelector('.form-secret-icon-hide');
      if (showIcon) showIcon.hidden = visible;
      if (hideIcon) hideIcon.hidden = !visible;
    };

    // Reset helper used when opening Settings
    input._resetSecretVisibility = () => setVisible(false);

    toggleBtn?.addEventListener('click', () => {
      setVisible(input.type === 'password');
    });

    copyBtn?.addEventListener('click', async () => {
      const text = String(input.value || '');
      if (!text) return;
      try {
        await copyTextToClipboard(text);
        flashCopyButton(copyBtn, 'ok');
      } catch {
        flashCopyButton(copyBtn, 'fail');
      }
    });
  }

  function resetSettingsSecretVisibility() {
    els.settingsApiKey?._resetSecretVisibility?.();
    els.settingsGithubApiKey?._resetSecretVisibility?.();
  }

  function openSettingsDialog() {
    if (!els.settingsBackdrop) return;
    if (els.settingsApiKey) {
      els.settingsApiKey.value = getStoredTmdbApiKey();
    }
    if (els.settingsGithubApiKey) {
      els.settingsGithubApiKey.value = getStoredGithubToken();
    }
    resetSettingsSecretVisibility();
    populateLocaleSelect();
    savedPosterScalePercent = getStoredPosterScalePercent();
    savedPosterGapPx = getStoredPosterGapPx();
    savedPosterBacklightPercent = getStoredPosterBacklightPercent();
    savedLocationOverlay = getStoredLocationOverlayEnabled();
    savedGrayedLocationsText = getStoredGrayedLocationsText();
    savedPosterSource = getStoredPosterSource();
    savedBulkMetaConfirm2 = getStoredBulkMetaConfirm2();
    savedBinderNotationId = getStoredBinderNotationId();
    savedBinderCustomPatterns = getStoredBinderCustomPatterns();
    if (els.settingsBulkMetaConfirm2) {
      els.settingsBulkMetaConfirm2.checked = savedBulkMetaConfirm2;
    }
    if (els.settingsLocationOverlay) {
      els.settingsLocationOverlay.checked = savedLocationOverlay;
    }
    grid.setLocationOverlay(savedLocationOverlay);
    if (els.settingsGrayedLocations) {
      els.settingsGrayedLocations.value = savedGrayedLocationsText;
    }
    grid.setGrayedLocations(parseGrayedLocationsList(savedGrayedLocationsText));
    if (els.settingsPosterSource) {
      els.settingsPosterSource.value = savedPosterSource;
    }
    setPosterSourceOverride(null);
    if (els.settingsBinderNotation) {
      els.settingsBinderNotation.value = savedBinderNotationId;
    }
    if (els.settingsBinderCustom) {
      els.settingsBinderCustom.value = savedBinderCustomPatterns;
    }
    if (els.settingsBinderTest) {
      els.settingsBinderTest.value = '';
    }
    populateBinderNotationSelect();
    syncBinderCustomVisibility();
    applyBinderNotation(savedBinderNotationId, savedBinderCustomPatterns);
    updateBinderNotationPreview({ applyLive: false });
    savedThemeId = getStoredTheme();
    savedThemeColors = getStoredThemeColors();
    draftThemeColors = { ...savedThemeColors };
    savedFontSize = getStoredFontSize();
    if (els.settingsFontSize) {
      els.settingsFontSize.value = savedFontSize;
    }
    applyFontSize(savedFontSize);
    populateThemeSelect();
    // Ensure UI matches saved theme + colors when opening
    applyTheme(savedThemeId, draftThemeColors);
    applyPosterBacklight(savedPosterBacklightPercent);
    syncThemeColorControls();
    if (els.settingsPosterScale) {
      els.settingsPosterScale.min = String(CONFIG.POSTER_SCALE_MIN);
      els.settingsPosterScale.max = String(CONFIG.POSTER_SCALE_MAX);
      els.settingsPosterScale.step = String(CONFIG.POSTER_SCALE_STEP);
      els.settingsPosterScale.setAttribute('aria-valuemin', String(CONFIG.POSTER_SCALE_MIN));
      els.settingsPosterScale.setAttribute('aria-valuemax', String(CONFIG.POSTER_SCALE_MAX));
    }
    if (els.settingsPosterGap) {
      els.settingsPosterGap.min = String(CONFIG.POSTER_GAP_MIN);
      els.settingsPosterGap.max = String(CONFIG.POSTER_GAP_MAX);
      els.settingsPosterGap.step = String(CONFIG.POSTER_GAP_STEP);
      els.settingsPosterGap.setAttribute('aria-valuemin', String(CONFIG.POSTER_GAP_MIN));
      els.settingsPosterGap.setAttribute('aria-valuemax', String(CONFIG.POSTER_GAP_MAX));
    }
    if (els.settingsPosterBacklight) {
      els.settingsPosterBacklight.min = String(CONFIG.POSTER_BACKLIGHT_MIN);
      els.settingsPosterBacklight.max = String(CONFIG.POSTER_BACKLIGHT_MAX);
      els.settingsPosterBacklight.step = String(CONFIG.POSTER_BACKLIGHT_STEP);
      els.settingsPosterBacklight.setAttribute(
        'aria-valuemin',
        String(CONFIG.POSTER_BACKLIGHT_MIN)
      );
      els.settingsPosterBacklight.setAttribute(
        'aria-valuemax',
        String(CONFIG.POSTER_BACKLIGHT_MAX)
      );
    }
    syncPosterScaleControl(savedPosterScalePercent);
    syncPosterGapControl(savedPosterGapPx);
    syncPosterBacklightControl(savedPosterBacklightPercent);
    setSettingsStatus('');
    resetDialogScroll(els.settingsBackdrop);
    els.settingsBackdrop.classList.remove('hidden');
    els.settingsBackdrop.setAttribute('aria-hidden', 'false');
    queueMicrotask(() => {
      resetDialogScroll(els.settingsBackdrop);
      els.settingsTheme?.focus();
    });
  }

  /**
   * @param {{ revertPreview?: boolean }} [opts]
   */
  function closeSettingsDialog({ revertPreview = false } = {}) {
    if (!els.settingsBackdrop) return;
    if (revertPreview) {
      const scale = clampPosterScalePercent(savedPosterScalePercent);
      const gap = clampPosterGapPx(savedPosterGapPx);
      const backlight = clampPosterBacklightPercent(savedPosterBacklightPercent);
      syncPosterScaleControl(scale);
      syncPosterGapControl(gap);
      syncPosterBacklightControl(backlight);
      grid.setScale(scale / 100);
      grid.setGap(gap);
      applyPosterBacklight(backlight);
      if (els.settingsLocationOverlay) {
        els.settingsLocationOverlay.checked = savedLocationOverlay;
      }
      grid.setLocationOverlay(savedLocationOverlay);
      if (els.settingsGrayedLocations) {
        els.settingsGrayedLocations.value = savedGrayedLocationsText;
      }
      grid.setGrayedLocations(parseGrayedLocationsList(savedGrayedLocationsText));
      if (els.settingsPosterSource) {
        els.settingsPosterSource.value = savedPosterSource;
      }
      setPosterSourceOverride(null);
      grid.render();
      applyBinderNotation(savedBinderNotationId, savedBinderCustomPatterns);
      if (els.settingsBinderNotation) {
        els.settingsBinderNotation.value = savedBinderNotationId;
      }
      if (els.settingsBinderCustom) {
        els.settingsBinderCustom.value = savedBinderCustomPatterns;
      }
      if (hasBinderFilter()) {
        recompute({ resetScroll: false });
      }
      draftThemeColors = { ...savedThemeColors };
      applyTheme(savedThemeId, savedThemeColors);
      if (els.settingsTheme) els.settingsTheme.value = normalizeTheme(savedThemeId);
      if (els.settingsFontSize) {
        els.settingsFontSize.value = normalizeFontSize(savedFontSize);
      }
      applyFontSize(savedFontSize);
    }
    els.settingsBackdrop.classList.add('hidden');
    els.settingsBackdrop.setAttribute('aria-hidden', 'true');
    setSettingsStatus('');
    focusFilterWhenIdle();
  }

  function setSettingsStatus(message, { error = false } = {}) {
    if (!els.settingsStatus) return;
    if (!message) {
      els.settingsStatus.hidden = true;
      els.settingsStatus.textContent = '';
      els.settingsStatus.classList.remove('is-error');
      return;
    }
    els.settingsStatus.hidden = false;
    els.settingsStatus.textContent = message;
    els.settingsStatus.classList.toggle('is-error', error);
  }

  function saveSettings() {
    const tmdbKey = String(els.settingsApiKey?.value || '').trim();
    const githubKey = String(els.settingsGithubApiKey?.value || '').trim();
    setStoredTmdbApiKey(tmdbKey);
    setStoredGithubToken(githubKey);
    const locale = setStoredLocale(els.settingsLocale?.value);
    const localeLabel =
      LOCALE_OPTIONS.find((o) => o.id === locale)?.label || locale;
    // Re-translate static chrome (menus, settings labels, status panels, …)
    syncUiLocaleFromSettings();
    if (dialog.isOpen() && dialog.movie) dialog.open(dialog.movie);
    recompute({ resetScroll: false });
    const themeId = setStoredTheme(els.settingsTheme?.value);
    savedThemeId = themeId;
    savedThemeColors = setStoredThemeColors(draftThemeColors);
    draftThemeColors = { ...savedThemeColors };
    applyTheme(themeId, savedThemeColors);
    const themeLabel =
      THEME_OPTIONS.find((o) => o.id === themeId)?.label || themeId;
    const customNote = Object.keys(savedThemeColors).length
      ? 'with custom colors'
      : 'default colors';
    savedFontSize = setStoredFontSize(els.settingsFontSize?.value);
    applyFontSize(savedFontSize);
    if (els.settingsFontSize) {
      els.settingsFontSize.value = savedFontSize;
    }
    const fontSizeLabel =
      FONT_SIZE_OPTIONS.find((o) => o.id === savedFontSize)?.label ||
      savedFontSize;
    const scalePercent = applyPosterScaleFromSettingsControl({ preview: false });
    const gapPx = applyPosterGapFromSettingsControl({ preview: false });
    const backlightPercent = applyPosterBacklightFromSettingsControl({
      preview: false,
    });
    savedLocationOverlay = setStoredLocationOverlayEnabled(
      !!els.settingsLocationOverlay?.checked
    );
    grid.setLocationOverlay(savedLocationOverlay);
    savedGrayedLocationsText = setStoredGrayedLocationsText(
      els.settingsGrayedLocations?.value ?? ''
    );
    if (els.settingsGrayedLocations) {
      els.settingsGrayedLocations.value = savedGrayedLocationsText;
    }
    grid.setGrayedLocations(parseGrayedLocationsList(savedGrayedLocationsText));
    savedPosterSource = setStoredPosterSource(els.settingsPosterSource?.value);
    setPosterSourceOverride(null);
    if (els.settingsPosterSource) {
      els.settingsPosterSource.value = savedPosterSource;
    }
    grid.render();
    savedBulkMetaConfirm2 = setStoredBulkMetaConfirm2(
      !!els.settingsBulkMetaConfirm2?.checked
    );
    if (els.settingsBulkMetaConfirm2) {
      els.settingsBulkMetaConfirm2.checked = savedBulkMetaConfirm2;
    }
    savedBinderNotationId = setStoredBinderNotationId(
      els.settingsBinderNotation?.value
    );
    savedBinderCustomPatterns = setStoredBinderCustomPatterns(
      els.settingsBinderCustom?.value ?? ''
    );
    applyBinderNotation(savedBinderNotationId, savedBinderCustomPatterns);
    if (hasBinderFilter()) {
      recompute({ resetScroll: false });
    }
    const binderLabel =
      BINDER_NOTATION_OPTIONS.find((o) => o.id === savedBinderNotationId)
        ?.label || savedBinderNotationId;
    const parts = [
      tmdbKey ? 'TMDB API key saved' : 'TMDB API key cleared',
      githubKey ? 'GitHub API key saved' : 'GitHub API key cleared',
      `language ${localeLabel}`,
      `poster size ${scalePercent}%`,
      `spacing ${gapPx}px`,
      `lighting ${backlightPercent}%`,
      `location overlay ${savedLocationOverlay ? 'on' : 'off'}`,
      savedGrayedLocationsText
        ? `grayed locations ${savedGrayedLocationsText}`
        : 'grayed locations none',
      `poster source ${savedPosterSource === 'local' ? 'local' : 'TMDB'}`,
      `bulk second confirm ${savedBulkMetaConfirm2 ? 'on' : 'off'}`,
      `binder notation ${binderLabel}`,
      `theme ${themeLabel} (${customNote})`,
      `font size ${fontSizeLabel}`,
    ];
    setSettingsStatus(`${parts.join('. ')}.`);
    // Brief confirmation then close (keep applied layout/theme; do not revert)
    window.setTimeout(() => closeSettingsDialog({ revertPreview: false }), 400);
  }


  function isSettingsOpen() {
    return Boolean(
      els.settingsBackdrop && !els.settingsBackdrop.classList.contains('hidden')
    );
  }

  /**
   * Push effective localStorage settings into live UI + in-memory prefs.
   * Used after Import settings and Clear session.
   */
  function reapplySettingsFromStorage() {
    const snap = readEffectiveSettingsSnapshot();

    savedThemeId = snap.theme;
    savedThemeColors = { ...snap.themeColors };
    draftThemeColors = { ...snap.themeColors };
    savedFontSize = snap.fontSize;
    savedPosterScalePercent = snap.posterScale;
    savedPosterGapPx = snap.posterGap;
    savedPosterBacklightPercent = snap.posterBacklight;
    savedLocationOverlay = snap.locationOverlay;
    savedGrayedLocationsText = snap.grayedLocations;
    savedPosterSource = snap.posterSource;
    savedBulkMetaConfirm2 = snap.bulkMetaConfirm2;
    savedBinderNotationId = snap.binderNotationId;
    savedBinderCustomPatterns = snap.binderCustomPatterns;

    setPosterSourceOverride(null);
    applyTheme(savedThemeId, savedThemeColors);
    applyFontSize(savedFontSize);
    syncUiLocaleFromSettings();
    applyPosterBacklight(savedPosterBacklightPercent);
    applyBinderNotation(savedBinderNotationId, savedBinderCustomPatterns);
    grid.setScale(savedPosterScalePercent / 100);
    grid.setGap(savedPosterGapPx);
    grid.setLocationOverlay(savedLocationOverlay);
    grid.setGrayedLocations(parseGrayedLocationsList(savedGrayedLocationsText));
    grid.render();

    if (dialog.isOpen() && dialog.movie) {
      dialog.open(dialog.movie);
    }
    recompute({ resetScroll: false });
  }

  els.settingsBtn?.addEventListener('click', () => {
    closeMenu();
    openSettingsDialog();
  });

  els.settingsClose?.addEventListener('click', () =>
    closeSettingsDialog({ revertPreview: true })
  );
  els.settingsCancel?.addEventListener('click', () =>
    closeSettingsDialog({ revertPreview: true })
  );
  els.settingsBackdrop?.addEventListener('click', (e) => {
    if (e.target === els.settingsBackdrop)
      closeSettingsDialog({ revertPreview: true });
  });
  els.settingsForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    saveSettings();
  });
  els.settingsPosterScale?.addEventListener('input', () => {
    applyPosterScaleFromSettingsControl({ preview: true });
  });
  els.settingsPosterGap?.addEventListener('input', () => {
    applyPosterGapFromSettingsControl({ preview: true });
  });
  els.settingsPosterBacklight?.addEventListener('input', () => {
    applyPosterBacklightFromSettingsControl({ preview: true });
  });
  els.settingsLocationOverlay?.addEventListener('change', () => {
    grid.setLocationOverlay(!!els.settingsLocationOverlay.checked);
  });
  els.settingsGrayedLocations?.addEventListener('input', () => {
    grid.setGrayedLocations(
      parseGrayedLocationsList(els.settingsGrayedLocations?.value)
    );
  });
  els.settingsPosterSource?.addEventListener('change', () => {
    setPosterSourceOverride(els.settingsPosterSource?.value);
    grid.render();
    if (dialog.isOpen()) dialog.render();
  });
  els.settingsBinderNotation?.addEventListener('change', () => {
    syncBinderCustomVisibility();
    updateBinderNotationPreview({ applyLive: true });
  });
  els.settingsBinderCustom?.addEventListener('input', () => {
    updateBinderNotationPreview({ applyLive: true });
  });
  els.settingsBinderTest?.addEventListener('input', () => {
    updateBinderTestResult();
  });
  els.settingsTheme?.addEventListener('change', () => {
    draftThemeColors = {};
    applyTheme(els.settingsTheme.value, null);
    syncThemeColorControls();
  });
  els.settingsThemeResetColors?.addEventListener('click', () => {
    draftThemeColors = {};
    applyTheme(els.settingsTheme?.value, null);
    syncThemeColorControls();
  });
  els.settingsThemeColors?.addEventListener('input', (e) => {
    const input = e.target?.closest?.('input[type="color"][data-theme-var]');
    if (!input) return;
    const key = input.dataset.themeVar;
    if (!key) return;
    draftThemeColors = {
      ...draftThemeColors,
      [key]: String(input.value || '').toLowerCase(),
    };
    applyTheme(els.settingsTheme?.value, draftThemeColors);
    updateThemeGradientPreviews();
  });
  els.settingsFontSize?.addEventListener('change', () => {
    applyFontSize(els.settingsFontSize?.value);
  });
  wireSecretFieldControls(
    els.settingsApiKey,
    els.settingsApiKeyToggle,
    els.settingsApiKeyCopy
  );
  wireSecretFieldControls(
    els.settingsGithubApiKey,
    els.settingsGithubApiKeyToggle,
    els.settingsGithubApiKeyCopy
  );

  document.addEventListener(
    'keydown',
    (e) => {
      const isPeriod = e.key === '.' || e.code === 'Period';
      if (!isPeriod || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      if (els.settingsBackdrop && !els.settingsBackdrop.classList.contains('hidden')) {
        e.preventDefault();
        return;
      }
      if (isAnyModalOpen()) return;
      e.preventDefault();
      closeMenu();
      openSettingsDialog();
    },
    true
  );

  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Escape') return;
      if (isAppAlertOpen()) return;
      if (!els.settingsBackdrop || els.settingsBackdrop.classList.contains('hidden')) {
        return;
      }
      if (els.tmdbPosterBackdrop && !els.tmdbPosterBackdrop.classList.contains('hidden')) {
        return;
      }
      if (els.statsBackdrop && !els.statsBackdrop.classList.contains('hidden')) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      closeSettingsDialog({ revertPreview: true });
    },
    true
  );

  document.addEventListener(
    'keydown',
    (e) => {
      if (!isPrimaryActionEnter(e)) return;
      if (isAppAlertOpen()) return;
      if (!els.settingsBackdrop || els.settingsBackdrop.classList.contains('hidden')) {
        return;
      }
      if (els.tmdbPosterBackdrop && !els.tmdbPosterBackdrop.classList.contains('hidden')) {
        return;
      }
      if (els.statsBackdrop && !els.statsBackdrop.classList.contains('hidden')) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      saveSettings();
    },
    true
  );

  return {
    openSettingsDialog,
    closeSettingsDialog,
    reapplySettingsFromStorage,
    isSettingsOpen,
  };
}
