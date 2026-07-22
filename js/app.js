import {
  BINDER_NOTATION_OPTIONS,
  CONFIG,
  DEFAULT_SORT,
  FILTER_TYPE_LABELS,
  FONT_SIZE_OPTIONS,
  GITHUB_TARGET,
  LOCALE_OPTIONS,
  SORT_OPTIONS,
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
  getStoredFontSize,
  getStoredGrayedLocationsSet,
  getStoredGrayedLocationsText,
  getStoredLocale,
  getStoredLocationOverlayEnabled,
  getStoredBulkMetaConfirm2,
  getStoredPosterBacklightPercent,
  getStoredPosterGapPx,
  getStoredPosterScalePercent,
  getStoredPosterSource,
  getStoredTheme,
  getStoredThemeColors,
  normalizeBinderNotationId,
  normalizeFontSize,
  normalizePosterSource,
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
  addLeaf,
  applyBinderNotation,
  applyFilters,
  buildTypeaheadIndex,
  countBinderMatches,
  displayLabel,
  leafFromFreeText,
  queryTypeahead,
  removeLeaf,
  removeOtherLeaves,
  sameTypeJoinLabel,
  sortMovies,
  stripLeadingNot,
  testBinderLocation,
  toggleLeafNot,
  typeaheadValueLabel,
} from './filters.js';
import { clearHash, hashToLeaves, writeHash } from './hash.js';
import { PosterGrid } from './grid.js';
import { MovieDialog } from './dialog.js';
import {
  copyTextToClipboard,
  downloadJson,
  formatExportFilename,
  escapeHtml,
  flashCopyButton,
  isPrimaryActionEnter,
  mergePosterLists,
  posterUrl,
  promotePosterSelection,
} from './utils.js';
import {
  getMovieById,
  getStoredTmdbApiKey,
  mergeKeywords,
  searchMoviesByTitleAndYear,
  setStoredTmdbApiKey,
  toLibraryMovie,
} from './tmdb.js';
import {
  getStoredGithubToken,
  setStoredGithubToken,
} from './github.js';
import {
  diffLibraries,
  parseLibraryJson,
} from './library-diff.js';
import { isAppAlertOpen, showAppAlert, showAppConfirm } from './alert-dialog.js';
import { attachPosterHotCorner, isPosterZoomOpen, posterZoomUrl } from './poster-zoom.js';
import { buildLibraryStats, statsSectionTitle } from './stats.js';
import { applyDomI18n, syncUiLocaleFromSettings, t } from './i18n.js';
import { readEffectiveSettingsSnapshot } from './settings-io.js';
import { initMenu } from './menu.js';
import {
  initSaveProgressDialog,
  resetDialogScroll,
} from './progress-console.js';
import { initSettingsTransfer } from './settings-transfer-ui.js';
import {
  initGithubSave,
  openGithubDeploymentView,
} from './github-save.js';
import { initLibraryHistory } from './library-history.js';
import { initAppToast, showAppToast } from './app-toast.js';
import { initMetaRefresh } from './meta-refresh.js';

const state = {
  movies: [],
  filtered: [],
  leaves: [],
  sortId: DEFAULT_SORT,
  dirty: false,
  /** True after a successful load (including missing file → new install). */
  dataReady: false,
  typeaheadIndex: null,
  typeaheadItems: [],
  typeaheadActive: -1,
  suppressHashWrite: false,
};

const els = {
  header: document.getElementById('site-header'),
  main: document.getElementById('main'),
  menuBtn: document.getElementById('menu-btn'),
  menuDropdown: document.getElementById('menu-dropdown'),
  filterInput: document.getElementById('filter-input'),
  typeahead: document.getElementById('typeahead'),
  movieCount: document.getElementById('movie-count'),
  activeFilters: document.getElementById('active-filters'),
  dirtyBanner: document.getElementById('dirty-banner'),
  saveJsonBtn: document.getElementById('save-json-btn'),
  libraryHistoryBtn: document.getElementById('library-history-btn'),
  githubDeploymentBtn: document.getElementById('github-deployment-btn'),
  historyBackdrop: document.getElementById('history-backdrop'),
  historyScroll: document.getElementById('history-scroll'),
  historySubtitle: document.getElementById('history-subtitle'),
  historyStatus: document.getElementById('history-status'),
  historyList: document.getElementById('history-list'),
  historySentinel: document.getElementById('history-sentinel'),
  historyLoadMore: document.getElementById('history-load-more'),
  historyEnd: document.getElementById('history-end'),
  historyClose: document.getElementById('history-close'),
  historyCloseFooter: document.getElementById('history-close-footer'),
  historyOpenGithub: document.getElementById('history-open-github'),
  exportBtn: document.getElementById('export-btn'),
  importBtn: document.getElementById('import-btn'),
  importFileInput: document.getElementById('import-file-input'),
  emptyCollectionBtn: document.getElementById('empty-collection-btn'),
  tmdbSearchBtn: document.getElementById('tmdb-search-btn'),
  statsBtn: document.getElementById('stats-btn'),
  metaRefreshBtn: document.getElementById('meta-refresh-btn'),
  statsBackdrop: document.getElementById('stats-backdrop'),
  statsBody: document.getElementById('stats-body'),
  statsClose: document.getElementById('stats-close'),
  statsCloseFooter: document.getElementById('stats-close-footer'),
  settingsBtn: document.getElementById('settings-btn'),
  exportSettingsBtn: document.getElementById('export-settings-btn'),
  exportSettingsClipboardBtn: document.getElementById(
    'export-settings-clipboard-btn'
  ),
  importSettingsBtn: document.getElementById('import-settings-btn'),
  importSettingsFileInput: document.getElementById('import-settings-file-input'),
  importSettingsClipboardBtn: document.getElementById(
    'import-settings-clipboard-btn'
  ),
  clearSessionBtn: document.getElementById('clear-session-btn'),
  clipboardImportBackdrop: document.getElementById('clipboard-import-backdrop'),
  clipboardImportText: document.getElementById('clipboard-import-text'),
  clipboardImportConsole: document.getElementById('clipboard-import-console'),
  clipboardImportClose: document.getElementById('clipboard-import-close'),
  clipboardImportCancel: document.getElementById('clipboard-import-cancel'),
  clipboardImportRun: document.getElementById('clipboard-import-run'),
  clipboardImportPasteBtn: document.getElementById('clipboard-import-paste-btn'),
  settingsBackdrop: document.getElementById('settings-backdrop'),
  settingsForm: document.getElementById('settings-form'),
  settingsApiKey: document.getElementById('settings-tmdb-api-key'),
  settingsApiKeyToggle: document.getElementById('settings-tmdb-api-key-toggle'),
  settingsApiKeyCopy: document.getElementById('settings-tmdb-api-key-copy'),
  settingsGithubApiKey: document.getElementById('settings-github-api-key'),
  settingsGithubApiKeyToggle: document.getElementById('settings-github-api-key-toggle'),
  settingsGithubApiKeyCopy: document.getElementById('settings-github-api-key-copy'),
  settingsLocale: document.getElementById('settings-locale'),
  settingsBulkMetaConfirm2: document.getElementById('settings-bulk-meta-confirm2'),
  settingsPosterScale: document.getElementById('settings-poster-scale'),
  settingsPosterScaleValue: document.getElementById('settings-poster-scale-value'),
  settingsPosterGap: document.getElementById('settings-poster-gap'),
  settingsPosterGapValue: document.getElementById('settings-poster-gap-value'),
  settingsPosterBacklight: document.getElementById('settings-poster-backlight'),
  settingsPosterBacklightValue: document.getElementById(
    'settings-poster-backlight-value'
  ),
  settingsLocationOverlay: document.getElementById('settings-location-overlay'),
  settingsGrayedLocations: document.getElementById('settings-grayed-locations'),
  settingsPosterSource: document.getElementById('settings-poster-source'),
  settingsBinderNotation: document.getElementById('settings-binder-notation'),
  settingsBinderNotationDesc: document.getElementById(
    'settings-binder-notation-desc'
  ),
  settingsBinderCustomWrap: document.getElementById('settings-binder-custom-wrap'),
  settingsBinderCustom: document.getElementById('settings-binder-custom'),
  settingsBinderPreview: document.getElementById('settings-binder-preview'),
  settingsBinderTest: document.getElementById('settings-binder-test'),
  settingsBinderTestResult: document.getElementById('settings-binder-test-result'),
  settingsTheme: document.getElementById('settings-theme'),
  settingsThemeColors: document.getElementById('settings-theme-colors'),
  settingsThemeResetColors: document.getElementById('settings-theme-reset-colors'),
  settingsFontSize: document.getElementById('settings-font-size'),
  settingsStatus: document.getElementById('settings-status'),
  settingsClose: document.getElementById('settings-close'),
  settingsCancel: document.getElementById('settings-cancel'),
  saveProgressBackdrop: document.getElementById('save-progress-backdrop'),
  saveProgressTitle: document.getElementById('save-progress-title'),
  saveProgressConsole: document.getElementById('save-progress-console'),
  saveProgressClose: document.getElementById('save-progress-close'),
  saveProgressCopy: document.getElementById('save-progress-copy'),
  saveProgressOk: document.getElementById('save-progress-ok'),
  metaRefreshBackdrop: document.getElementById('meta-refresh-backdrop'),
  metaRefreshRunning: document.getElementById('meta-refresh-running'),
  metaRefreshDone: document.getElementById('meta-refresh-done'),
  metaRefreshProgressbar: document.getElementById('meta-refresh-progressbar'),
  metaRefreshBar: document.getElementById('meta-refresh-bar'),
  metaRefreshCount: document.getElementById('meta-refresh-count'),
  metaRefreshPct: document.getElementById('meta-refresh-pct'),
  metaRefreshMovie: document.getElementById('meta-refresh-movie'),
  metaRefreshStatus: document.getElementById('meta-refresh-status'),
  metaRefreshDoneHeading: document.getElementById('meta-refresh-done-heading'),
  metaRefreshDoneSummary: document.getElementById('meta-refresh-done-summary'),
  metaRefreshDoneFailed: document.getElementById('meta-refresh-done-failed'),
  metaRefreshFailures: document.getElementById('meta-refresh-failures'),
  metaRefreshFailureList: document.getElementById('meta-refresh-failure-list'),
  metaRefreshCancel: document.getElementById('meta-refresh-cancel'),
  metaRefreshClose: document.getElementById('meta-refresh-close'),
  metaRefreshCloseX: document.getElementById('meta-refresh-close-x'),
  appToast: document.getElementById('app-toast'),
  tmdbBackdrop: document.getElementById('tmdb-search-backdrop'),
  tmdbForm: document.getElementById('tmdb-search-form'),
  tmdbTitle: document.getElementById('tmdb-movie-title'),
  tmdbYear: document.getElementById('tmdb-movie-year'),
  tmdbStatus: document.getElementById('tmdb-search-status'),
  tmdbResults: document.getElementById('tmdb-search-results'),
  tmdbClose: document.getElementById('tmdb-search-close'),
  tmdbCancel: document.getElementById('tmdb-search-cancel'),
  tmdbPosterBackdrop: document.getElementById('tmdb-poster-backdrop'),
  tmdbPosterTitle: document.getElementById('tmdb-poster-title'),
  tmdbPosterSubtitle: document.getElementById('tmdb-poster-subtitle'),
  tmdbPosterStatus: document.getElementById('tmdb-poster-status'),
  tmdbPosterGrid: document.getElementById('tmdb-poster-grid'),
  tmdbPosterClose: document.getElementById('tmdb-poster-close'),
  tmdbPosterCancel: document.getElementById('tmdb-poster-cancel'),
  tmdbPosterSave: document.getElementById('tmdb-poster-save'),
  statusLoading: document.getElementById('status-loading'),
  statusError: document.getElementById('status-error'),
  statusEmpty: document.getElementById('status-empty'),
  statusNewInstall: document.getElementById('status-new-install'),
  loadingPath: document.getElementById('loading-path'),
  errorDetail: document.getElementById('error-detail'),
  spacer: document.getElementById('grid-spacer'),
  windowEl: document.getElementById('grid-window'),
  backdrop: document.getElementById('dialog-backdrop'),
  dialogBody: document.getElementById('dialog-body'),
  dialogClose: document.getElementById('dialog-close'),
  dialogPrev: document.getElementById('dialog-prev'),
  dialogNext: document.getElementById('dialog-next'),
  dialogDelete: document.getElementById('dialog-delete'),
  dialogUpdateMeta: document.getElementById('dialog-update-meta'),
  dialogTmdb: document.getElementById('dialog-tmdb'),
  dialogSave: document.getElementById('dialog-save'),
  dialogCancel: document.getElementById('dialog-cancel'),
};

// —— Sort from session ——
try {
  let saved = sessionStorage.getItem(CONFIG.SESSION_SORT_KEY);
  // Legacy year sorts removed; map to release-date equivalents.
  if (saved === 'year-desc') saved = 'released-desc';
  else if (saved === 'year-asc') saved = 'released-asc';
  if (saved && SORT_OPTIONS.some((o) => o.id === saved)) {
    state.sortId = saved;
  }
} catch {
  /* private mode */
}

/** True if any full-screen/modal layer is open (not the hamburger menu). */
function isAnyModalOpen() {
  const shown = (el) => el && !el.classList.contains('hidden');
  return (
    dialog?.isOpen?.() ||
    isAppAlertOpen() ||
    isPosterZoomOpen() ||
    shown(els.settingsBackdrop) ||
    shown(els.statsBackdrop) ||
    shown(els.tmdbBackdrop) ||
    shown(els.tmdbPosterBackdrop) ||
    shown(els.saveProgressBackdrop) ||
    shown(els.clipboardImportBackdrop) ||
    shown(els.metaRefreshBackdrop) ||
    shown(els.historyBackdrop)
  );
}

/** Search Movies (TMDB) dialog is visible. */
function isTmdbSearchOpen() {
  return Boolean(els.tmdbBackdrop && !els.tmdbBackdrop.classList.contains('hidden'));
}

/**
 * Layers that can sit above Search Movies while it stays open underneath
 * (movie detail after add, poster picker, alert/confirm, poster zoom).
 */
function isModalAboveTmdbSearch() {
  const shown = (el) => el && !el.classList.contains('hidden');
  return (
    dialog?.isOpen?.() ||
    isAppAlertOpen() ||
    isPosterZoomOpen() ||
    shown(els.tmdbPosterBackdrop)
  );
}

/** True if keyboard focus is already inside the Search Movies dialog. */
function isFocusInsideTmdbSearch() {
  const root = els.tmdbBackdrop;
  if (!root) return false;
  const ae = document.activeElement;
  return Boolean(ae && root.contains(ae));
}

/**
 * Focus the Search Movies title field and optionally select all text.
 * Used when an overlay above search closes, or the tab/window returns after
 * being in the background — not while the user is working inside the dialog.
 * @param {{ selectAll?: boolean }} [opts]
 */
function focusTmdbSearchTitle({ selectAll = true } = {}) {
  const input = els.tmdbTitle;
  if (!input || !isTmdbSearchOpen()) return;
  if (isModalAboveTmdbSearch()) return;
  requestAnimationFrame(() => {
    queueMicrotask(() => {
      if (!isTmdbSearchOpen() || isModalAboveTmdbSearch()) return;
      try {
        input.focus({ preventScroll: true });
      } catch {
        input.focus();
      }
      if (selectAll) {
        try {
          input.select();
        } catch {
          /* ignore unsupported select */
        }
      }
    });
  });
}

/**
 * Restore Search Movies title (select-all) only when the dialog is topmost and
 * focus is not already on year / results / other controls inside it.
 */
function maybeRestoreTmdbSearchFocus() {
  if (!isTmdbSearchOpen() || isModalAboveTmdbSearch()) return false;
  // Leave the user alone if they are already in title, year, buttons, etc.
  if (isFocusInsideTmdbSearch()) return false;
  focusTmdbSearchTitle({ selectAll: true });
  return true;
}

/**
 * Whether auto-focusing the filter field is appropriate.
 * Prefer “no touch / no coarse pointer” over primary-pointer-only checks:
 * iPadOS and hybrid Android often report (hover: hover) and (pointer: fine)
 * while still being touch devices.
 */
function preferDesktopAutoFocus() {
  try {
    if (window.matchMedia('(any-pointer: coarse)').matches) return false;
    if (window.matchMedia('(hover: none)').matches) return false;
  } catch {
    /* ignore */
  }
  const maxTouch = Number(navigator.maxTouchPoints) || 0;
  if (maxTouch > 0) {
    const platform = String(navigator.platform || '');
    // iPadOS 13+ can report as MacIntel with multi-touch
    if (platform === 'MacIntel' && maxTouch > 1) return false;
    // Phones / most tablets
    if (maxTouch > 1) return false;
  }
  try {
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  } catch {
    return true;
  }
}

/**
 * When every modal is closed, put caret in the filter field for immediate typing.
 * If Search Movies is still open after a stacked modal closes, restore its title
 * only when focus is not already inside that dialog (so year/results stay usable).
 * Desktop only for the grid filter.
 * All post-modal filter focus must go through this helper (not returnFocus).
 */
function focusFilterWhenIdle() {
  // Overlay above search dismissed → restore title unless user is already in the form
  if (maybeRestoreTmdbSearchFocus()) return;
  if (isTmdbSearchOpen()) return; // search still owns the UI; don't focus grid filter
  if (!preferDesktopAutoFocus()) return;
  requestAnimationFrame(() => {
    queueMicrotask(() => {
      if (isAnyModalOpen()) return;
      if (els.menuDropdown?.classList.contains('open')) return;
      try {
        els.filterInput?.focus({ preventScroll: true });
      } catch {
        els.filterInput?.focus();
      }
    });
  });
}

document.addEventListener('pmi:modals-maybe-idle', () => {
  focusFilterWhenIdle();
});

// Tab / window returns from background while Search is topmost → title + select all.
// Only after a real window blur (not focus moves between inputs inside the page).
let tmdbSearchWindowBlurred = false;
window.addEventListener('blur', () => {
  tmdbSearchWindowBlurred = true;
});
window.addEventListener('focus', () => {
  if (!tmdbSearchWindowBlurred) return;
  tmdbSearchWindowBlurred = false;
  if (isTmdbSearchOpen() && !isModalAboveTmdbSearch()) {
    focusTmdbSearchTitle({ selectAll: true });
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (isTmdbSearchOpen() && !isModalAboveTmdbSearch()) {
    focusTmdbSearchTitle({ selectAll: true });
  }
});

const grid = new PosterGrid({
  main: els.main,
  spacer: els.spacer,
  windowEl: els.windowEl,
  // Do not pass filterInput as returnFocus — that bypassed the desktop-only gate.
  // Close fires pmi:modals-maybe-idle → focusFilterWhenIdle() when appropriate.
  onSelect: (movie) => dialog.open(movie),
});

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

const dialog = new MovieDialog({
  backdrop: els.backdrop,
  body: els.dialogBody,
  btnClose: els.dialogClose,
  btnPrev: els.dialogPrev,
  btnNext: els.dialogNext,
  btnDelete: els.dialogDelete,
  btnUpdateMeta: els.dialogUpdateMeta,
  btnTmdb: els.dialogTmdb,
  btnSave: els.dialogSave,
  btnCancel: els.dialogCancel,
  getMovieList: () => state.filtered,
  onChange: () => {
    setDirty(true);
    refreshLibraryAfterMutation();
  },
  onDelete: (movie) => {
    const i = state.movies.indexOf(movie);
    if (i >= 0) state.movies.splice(i, 1);
    setDirty(true);
    refreshLibraryAfterMutation();
  },
  onSelectPoster: (movie) => {
    openLibraryPosterPicker(movie, dialog.getPosterDraft());
  },
  onUpdateMetadata: (movie) => {
    void startSingleMovieMetadataRefresh(movie);
  },
  onFilterPill: (leaf) => {
    toggleFilterLeaf(leaf);
  },
  isFilterActive: (type, value) =>
    state.leaves.some(
      (l) =>
        l.type === type &&
        String(l.value).toLowerCase() === String(value ?? '').toLowerCase()
    ),
});

initAppToast(els.appToast);

// —— Header hide on scroll down ——
let lastScroll = 0;
let headerHidden = false;
els.main.addEventListener(
  'scroll',
  () => {
    const y = els.main.scrollTop;
    const delta = y - lastScroll;
    if (y < 40) {
      showHeader();
    } else if (delta > 8 && y > 80) {
      hideHeader();
    } else if (delta < -8) {
      showHeader();
    }
    lastScroll = y;
  },
  { passive: true }
);

function hideHeader() {
  if (headerHidden) return;
  headerHidden = true;
  // Capture height before transform so we can collapse the header's layout slot
  // and drop the poster area's top spacing while the bar is off-screen.
  document.documentElement.style.setProperty(
    '--header-height',
    `${els.header.offsetHeight}px`
  );
  els.header.classList.add('is-hidden');
  document.getElementById('app')?.classList.add('header-is-hidden');
  // Layout height of #main changes; remeasure the virtualized grid.
  requestAnimationFrame(() => {
    grid.measure();
    grid.render();
  });
}

function showHeader() {
  if (!headerHidden) return;
  headerHidden = false;
  els.header.classList.remove('is-hidden');
  document.getElementById('app')?.classList.remove('header-is-hidden');
  requestAnimationFrame(() => {
    grid.measure();
    grid.render();
  });
}

// —— Menu ——
const { closeMenu, syncSortMenuActive } = initMenu({
  menuBtn: els.menuBtn,
  menuDropdown: els.menuDropdown,
  getSortId: () => state.sortId,
  onSort: setSort,
  focusFilterWhenIdle,
});

const {
  isMetaRefreshOpen,
  isMetaRefreshRunning,
  startSingleMovieMetadataRefresh,
} = initMetaRefresh({
  els: {
    metaRefreshBtn: els.metaRefreshBtn,
    metaRefreshBackdrop: els.metaRefreshBackdrop,
    metaRefreshRunning: els.metaRefreshRunning,
    metaRefreshDone: els.metaRefreshDone,
    metaRefreshProgressbar: els.metaRefreshProgressbar,
    metaRefreshBar: els.metaRefreshBar,
    metaRefreshCount: els.metaRefreshCount,
    metaRefreshPct: els.metaRefreshPct,
    metaRefreshMovie: els.metaRefreshMovie,
    metaRefreshStatus: els.metaRefreshStatus,
    metaRefreshDoneHeading: els.metaRefreshDoneHeading,
    metaRefreshDoneSummary: els.metaRefreshDoneSummary,
    metaRefreshDoneFailed: els.metaRefreshDoneFailed,
    metaRefreshFailures: els.metaRefreshFailures,
    metaRefreshFailureList: els.metaRefreshFailureList,
    metaRefreshCancel: els.metaRefreshCancel,
    metaRefreshClose: els.metaRefreshClose,
    metaRefreshCloseX: els.metaRefreshCloseX,
  },
  closeMenu,
  focusFilterWhenIdle,
  getMovies: () => state.movies,
  isDataReady: () => state.dataReady,
  setDirty,
  refreshLibraryAfterMutation,
  dialog,
});

const {
  openSaveProgressDialog,
  isSaveProgressOpen,
  appendSaveLog,
  appendSaveLogMessage,
} = initSaveProgressDialog({
  backdrop: els.saveProgressBackdrop,
  title: els.saveProgressTitle,
  console: els.saveProgressConsole,
  closeBtn: els.saveProgressClose,
  okBtn: els.saveProgressOk,
  copyBtn: els.saveProgressCopy,
  focusFilterWhenIdle,
});

const { saveJsonToGithub, isSaveInFlight } = initGithubSave({
  saveJsonBtn: els.saveJsonBtn,
  getMovies: () => state.movies,
  setDirty,
  openSaveProgressDialog,
  appendSaveLog,
  appendSaveLogMessage,
});

els.saveJsonBtn?.addEventListener('click', () => {
  closeMenu();
  void saveJsonToGithub();
});

els.githubDeploymentBtn?.addEventListener('click', () => {
  closeMenu();
  void openGithubDeploymentView();
});

initLibraryHistory({
  els: {
    historyBackdrop: els.historyBackdrop,
    historyScroll: els.historyScroll,
    historySubtitle: els.historySubtitle,
    historyStatus: els.historyStatus,
    historyList: els.historyList,
    historySentinel: els.historySentinel,
    historyLoadMore: els.historyLoadMore,
    historyEnd: els.historyEnd,
    historyClose: els.historyClose,
    historyCloseFooter: els.historyCloseFooter,
    historyOpenGithub: els.historyOpenGithub,
    libraryHistoryBtn: els.libraryHistoryBtn,
  },
  closeMenu,
  focusFilterWhenIdle,
  showAppToast,
  isMetaRefreshRunning,
  confirmAndApplyImportedLibrary,
});

els.exportBtn.addEventListener('click', () => {
  closeMenu();
  exportData();
});

els.importBtn?.addEventListener('click', () => {
  closeMenu();
  startLibraryImport();
});

els.importFileInput?.addEventListener('change', () => {
  const file = els.importFileInput?.files?.[0] || null;
  // Allow re-selecting the same file later
  if (els.importFileInput) els.importFileInput.value = '';
  if (file) void importLibraryFromFile(file);
});

els.emptyCollectionBtn?.addEventListener('click', () => {
  closeMenu();
  void emptyCollection();
});

els.tmdbSearchBtn?.addEventListener('click', () => {
  closeMenu();
  openTmdbSearchDialog();
});

// Platform-specific shortcut hints in the menu (⌘ vs Ctrl)
const isApplePlatform =
  /Mac|iPhone|iPad|iPod/i.test(navigator.platform || '') ||
  /Mac OS X|Macintosh/i.test(navigator.userAgent || '');
const settingsShortcutHint = document.getElementById('settings-shortcut-hint');
if (settingsShortcutHint) {
  settingsShortcutHint.textContent = isApplePlatform ? '⌘.' : 'Ctrl+.';
}
const tmdbSearchShortcutHint = document.getElementById('tmdb-search-shortcut-hint');
if (tmdbSearchShortcutHint) {
  tmdbSearchShortcutHint.textContent = isApplePlatform ? '⌘K' : 'Ctrl+K';
}

// Ctrl+K / ⌘K — open Search Movies (skip when another modal owns the UI)
document.addEventListener(
  'keydown',
  (e) => {
    const isK = e.key === 'k' || e.key === 'K' || e.code === 'KeyK';
    if (!isK || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
    // Already on TMDB search — still swallow the chord
    if (els.tmdbBackdrop && !els.tmdbBackdrop.classList.contains('hidden')) {
      e.preventDefault();
      return;
    }
    if (isAnyModalOpen()) return;
    e.preventDefault();
    closeMenu();
    openTmdbSearchDialog();
  },
  true
);

// Ctrl+S only — Save to GitHub (not ⌘S: reserved by OS/browser on Apple)
document.addEventListener(
  'keydown',
  (e) => {
    const isS = e.key === 's' || e.key === 'S' || e.code === 'KeyS';
    if (!isS || !e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    // Always take the chord so the browser does not open “Save Page”
    e.preventDefault();
    if (isSaveInFlight()) return;
    if (isAnyModalOpen()) return;
    if (!state.dataReady) return;
    closeMenu();
    void saveJsonToGithub();
  },
  true
);

els.statsBtn?.addEventListener('click', () => {
  closeMenu();
  openStatsDialog();
});

els.settingsBtn?.addEventListener('click', () => {
  closeMenu();
  openSettingsDialog();
});

initSettingsTransfer({
  closeMenu,
  showAppToast,
  openSaveProgressDialog,
  appendSaveLog,
  reapplySettingsFromStorage,
  closeSettingsDialog,
  focusFilterWhenIdle,
  isSettingsOpen: () =>
    Boolean(
      els.settingsBackdrop && !els.settingsBackdrop.classList.contains('hidden')
    ),
  exportSettingsBtn: els.exportSettingsBtn,
  exportSettingsClipboardBtn: els.exportSettingsClipboardBtn,
  importSettingsBtn: els.importSettingsBtn,
  importSettingsFileInput: els.importSettingsFileInput,
  importSettingsClipboardBtn: els.importSettingsClipboardBtn,
  clearSessionBtn: els.clearSessionBtn,
  clipboardImportBackdrop: els.clipboardImportBackdrop,
  clipboardImportText: els.clipboardImportText,
  clipboardImportConsole: els.clipboardImportConsole,
  clipboardImportClose: els.clipboardImportClose,
  clipboardImportCancel: els.clipboardImportCancel,
  clipboardImportRun: els.clipboardImportRun,
  clipboardImportPasteBtn: els.clipboardImportPasteBtn,
});

// Ctrl+. / ⌘+. — open Settings (skip when another modal owns the UI)
document.addEventListener(
  'keydown',
  (e) => {
    const isPeriod = e.key === '.' || e.code === 'Period';
    if (!isPeriod || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
    // Already on Settings — still swallow the chord
    if (els.settingsBackdrop && !els.settingsBackdrop.classList.contains('hidden')) {
      e.preventDefault();
      return;
    }
    // Don't stack Settings over movie dialog, TMDB, save progress, zoom, etc.
    if (isAnyModalOpen()) return;
    e.preventDefault();
    closeMenu();
    openSettingsDialog();
  },
  true
);

els.settingsClose?.addEventListener('click', () => closeSettingsDialog({ revertPreview: true }));
els.settingsCancel?.addEventListener('click', () => closeSettingsDialog({ revertPreview: true }));
els.settingsBackdrop?.addEventListener('click', (e) => {
  if (e.target === els.settingsBackdrop) closeSettingsDialog({ revertPreview: true });
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
  // Preview only until Save
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
  // Switching base theme clears draft overrides and reloads that theme’s defaults
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
  // Live preview until Save / Cancel
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

els.tmdbClose?.addEventListener('click', () => closeTmdbSearchDialog());
els.tmdbCancel?.addEventListener('click', () => closeTmdbSearchDialog());
els.tmdbBackdrop?.addEventListener('click', (e) => {
  if (e.target === els.tmdbBackdrop) closeTmdbSearchDialog();
});

els.tmdbForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  await runTmdbSearch();
});

// Escape closes Search Movies when it is the top layer
document.addEventListener(
  'keydown',
  (e) => {
    if (e.key !== 'Escape') return;
    if (isAppAlertOpen()) return;
    if (!els.tmdbBackdrop || els.tmdbBackdrop.classList.contains('hidden')) return;
    // Higher layers own Escape (movie detail, poster picker, zoom, bulk refresh, save log)
    if (dialog?.isOpen?.()) return;
    if (els.tmdbPosterBackdrop && !els.tmdbPosterBackdrop.classList.contains('hidden')) {
      return;
    }
    if (isPosterZoomOpen()) return;
    if (isMetaRefreshOpen()) return;
    if (isSaveProgressOpen()) return;
    e.preventDefault();
    e.stopPropagation();
    closeTmdbSearchDialog();
  },
  true
);

// Escape closes Statistics when open
document.addEventListener(
  'keydown',
  (e) => {
    if (e.key !== 'Escape') return;
    if (isAppAlertOpen()) return;
    if (!els.statsBackdrop || els.statsBackdrop.classList.contains('hidden')) return;
    e.preventDefault();
    e.stopPropagation();
    closeStatsDialog();
  },
  true
);

// Enter → Close on Statistics when focus is not on a control
document.addEventListener(
  'keydown',
  (e) => {
    if (!isPrimaryActionEnter(e)) return;
    if (isAppAlertOpen()) return;
    if (!els.statsBackdrop || els.statsBackdrop.classList.contains('hidden')) return;
    // Higher layers win
    if (els.tmdbPosterBackdrop && !els.tmdbPosterBackdrop.classList.contains('hidden')) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    closeStatsDialog();
  },
  true
);

// Escape closes Settings when open
document.addEventListener(
  'keydown',
  (e) => {
    if (e.key !== 'Escape') return;
    if (isAppAlertOpen()) return;
    if (!els.settingsBackdrop || els.settingsBackdrop.classList.contains('hidden')) {
      return;
    }
    // Poster picker has its own capture handler; if both open, poster takes precedence
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

// Enter → Save settings when focus is not in a field/dropdown/color control
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

els.tmdbPosterClose?.addEventListener('click', () => closeTmdbPosterDialog());
els.tmdbPosterCancel?.addEventListener('click', () => closeTmdbPosterDialog());
els.tmdbPosterSave?.addEventListener('click', () => saveTmdbPosterSelection());
els.tmdbPosterBackdrop?.addEventListener('click', (e) => {
  if (e.target === els.tmdbPosterBackdrop) closeTmdbPosterDialog();
});

// Escape closes poster picker (capture so movie-dialog Escape does not also fire)
document.addEventListener(
  'keydown',
  (e) => {
    if (e.key !== 'Escape') return;
    if (isAppAlertOpen()) return;
    if (!els.tmdbPosterBackdrop || els.tmdbPosterBackdrop.classList.contains('hidden')) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    closeTmdbPosterDialog();
  },
  true
);

// Enter → Ok on poster picker when focus is not on a field/control
document.addEventListener(
  'keydown',
  (e) => {
    if (!isPrimaryActionEnter(e)) return;
    if (isAppAlertOpen()) return;
    if (!els.tmdbPosterBackdrop || els.tmdbPosterBackdrop.classList.contains('hidden')) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    saveTmdbPosterSelection();
  },
  true
);

// Enter → Search on TMDB search when focus is not on a field/control
// (text fields still submit via the form’s native Enter → submit path)
document.addEventListener(
  'keydown',
  (e) => {
    if (!isPrimaryActionEnter(e)) return;
    if (isAppAlertOpen()) return;
    if (!els.tmdbBackdrop || els.tmdbBackdrop.classList.contains('hidden')) return;
    // Higher layers keep Enter (movie detail opens above search after add)
    if (dialog?.isOpen?.()) return;
    if (els.tmdbPosterBackdrop && !els.tmdbPosterBackdrop.classList.contains('hidden')) {
      return;
    }
    if (isMetaRefreshOpen()) return;
    if (isSaveProgressOpen()) return;
    e.preventDefault();
    e.stopPropagation();
    runTmdbSearch();
  },
  true
);

document.addEventListener('click', (e) => {
  if (!els.menuDropdown.contains(e.target) && e.target !== els.menuBtn) {
    closeMenu();
  }
  // close chip menus
  if (!e.target.closest('.filter-chip-wrap')) {
    closeAllChipMenus();
  }
  if (!e.target.closest('.search-wrap')) {
    closeTypeahead();
  }
});

function setSort(id) {
  state.sortId = id;
  try {
    sessionStorage.setItem(CONFIG.SESSION_SORT_KEY, id);
  } catch {
    /* ignore */
  }
  recompute({ resetScroll: true });
  syncSortMenuActive();
}

// —— Dirty ——
function setDirty(v) {
  state.dirty = v;
  els.menuBtn.classList.toggle('has-dirty', v);
  els.dirtyBanner.classList.toggle('visible', v);
}

window.addEventListener('beforeunload', (e) => {
  if (!state.dirty) return;
  e.preventDefault();
  e.returnValue = '';
});

function exportData() {
  downloadJson(formatExportFilename(CONFIG.DATA_PATH), state.movies);
  setDirty(false);
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

/**
 * Open the system file picker for a library JSON export (same shape as Export).
 * Browser SPA can read local files via input[type=file] + File API — no server.
 */
function startLibraryImport() {
  if (!state.dataReady) {
    void showAppAlert('Library is still loading. Try again in a moment.', {
      title: 'Import',
    });
    return;
  }
  if (isMetaRefreshRunning()) {
    void showAppAlert('Wait for the metadata update to finish before importing.', {
      title: 'Import',
    });
    return;
  }
  const input = els.importFileInput;
  if (!input) {
    void showAppAlert('Import is not available in this browser.', {
      title: 'Import',
    });
    return;
  }
  input.click();
}

/**
 * Confirm and replace the in-browser library with a parsed movie array.
 * @param {object[]} imported
 * @param {{
 *   sourceLabel: string,
 *   title?: string,
 *   okLabel?: string,
 *   toastPrefix?: string,
 * }} opts
 * @returns {Promise<boolean>} true if the library was replaced
 */
async function confirmAndApplyImportedLibrary(imported, opts) {
  const sourceLabel = String(opts?.sourceLabel || 'import').trim() || 'import';
  const title = opts?.title || 'Import library';
  const okLabel = opts?.okLabel || 'Replace library';
  const toastPrefix = opts?.toastPrefix || 'Imported';

  if (!Array.isArray(imported)) {
    await showAppAlert(
      `Could not load “${sourceLabel}”.\n\nExpected a JSON array of movies.`,
      { title: `${title} failed` }
    );
    return false;
  }

  const objectCount = imported.filter(
    (m) => m && typeof m === 'object' && !Array.isArray(m)
  ).length;
  if (imported.length > 0 && objectCount === 0) {
    await showAppAlert(
      `“${sourceLabel}” is a JSON array, but it does not look like movie objects.`,
      { title: `${title} failed` }
    );
    return false;
  }

  const before = state.movies;
  const after = imported;
  const diff = diffLibraries(before, after);
  const fromN = before.length;
  const toN = after.length;

  if (diff.totalTouched === 0 && fromN === toN) {
    await showAppAlert(
      `“${sourceLabel}” matches your current library (${toN} movie${
        toN === 1 ? '' : 's'
      }). Nothing to change.`,
      { title }
    );
    return false;
  }

  const dirtyNote = state.dirty
    ? '\n\nYou have unsaved changes in this browser; this will replace them too.'
    : '';
  const ok = await showAppConfirm(
    `Replace your current library with “${sourceLabel}”?\n\n` +
      `Current: ${fromN} movie${fromN === 1 ? '' : 's'}\n` +
      `Import:  ${toN} movie${toN === 1 ? '' : 's'}\n\n` +
      `Compared to now: +${diff.addedCount} added · −${diff.removedCount} removed · ~${diff.changedCount} changed.\n\n` +
      `This only updates the library in this browser. Use Save to GitHub (or Export) to keep the result.` +
      dirtyNote,
    {
      title,
      okLabel,
      cancelLabel: 'Cancel',
    }
  );
  if (!ok) return false;

  if (dialog.isOpen()) {
    dialog.close();
  }

  finishLibraryLoad(after);
  setDirty(true);
  showAppToast(
    `${toastPrefix} ${toN} movie${toN === 1 ? '' : 's'}` +
      (diff.totalTouched
        ? ` (+${diff.addedCount} · −${diff.removedCount} · ~${diff.changedCount})`
        : '')
  );
  return true;
}

/**
 * Replace the in-browser library with movies from a user-selected JSON file.
 * @param {File} file
 */
async function importLibraryFromFile(file) {
  if (!file) return;
  const name = String(file.name || 'file').trim() || 'file';

  let text;
  try {
    text = await file.text();
  } catch (err) {
    console.error(err);
    await showAppAlert(
      `Could not read “${name}”.\n\n${err?.message || err}`,
      { title: 'Import failed' }
    );
    return;
  }

  const imported = parseLibraryJson(text);
  if (imported == null) {
    await showAppAlert(
      `“${name}” is not a valid library file.\n\n` +
        `Expected a JSON array of movies (same format as Export / media-index.json).`,
      { title: 'Import failed' }
    );
    return;
  }

  await confirmAndApplyImportedLibrary(imported, {
    sourceLabel: name,
    title: 'Import library',
    okLabel: 'Replace library',
    toastPrefix: 'Imported',
  });
}

/**
 * Clear every movie from the in-browser library (after confirmation).
 * Does not touch GitHub until the user Saves.
 */
async function emptyCollection() {
  if (!state.dataReady) {
    await showAppAlert('Library is still loading. Try again in a moment.', {
      title: 'Empty collection',
    });
    return;
  }
  if (isMetaRefreshRunning()) {
    await showAppAlert(
      'Wait for the metadata update to finish before emptying the collection.',
      { title: 'Empty collection' }
    );
    return;
  }

  const n = state.movies.length;
  if (n === 0) {
    await showAppAlert('The collection is already empty.', {
      title: 'Empty collection',
    });
    return;
  }

  const dirtyNote = state.dirty
    ? '\n\nYou also have unsaved changes; those will be discarded with the library.'
    : '';
  const ok = await showAppConfirm(
    `Remove all ${n} movie${n === 1 ? '' : 's'} from this collection?\n\n` +
      `This only clears the library in this browser. Use Save to GitHub (or Export a backup first) if you need to keep or restore data.` +
      dirtyNote,
    {
      title: 'Empty collection',
      okLabel: 'Empty collection',
      cancelLabel: 'Cancel',
    }
  );
  if (!ok) return;

  if (dialog.isOpen()) {
    dialog.close();
  }

  finishLibraryLoad([]);
  setDirty(true);
  showAppToast(`Emptied collection (${n} movie${n === 1 ? '' : 's'} removed)`);
}

// —— TMDB Search dialog ——
/** Session for infinite-scroll search pagination */
let tmdbSearchSession = {
  apiKey: '',
  title: '',
  year: '',
  page: 0,
  totalPages: 0,
  totalResults: 0,
  movies: [],
  loading: false,
  filteredByYear: null,
};

function resetTmdbSearchSession() {
  tmdbSearchSession = {
    apiKey: '',
    title: '',
    year: '',
    page: 0,
    totalPages: 0,
    totalResults: 0,
    movies: [],
    loading: false,
    filteredByYear: null,
  };
}

/** Reset dialog body scroll so content always opens at the top. */
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
    if (state.leaves.some((l) => l.type === 'binder')) {
      recompute({ resetScroll: false });
    }
  }

  const preview = els.settingsBinderPreview;
  if (preview) {
    preview.classList.toggle('is-error', errors.length > 0);
    const total = state.movies.length;
    if (!regexes.length) {
      preview.textContent =
        errors.length > 0
          ? `Invalid pattern(s): ${errors.map((e) => e.message).join('; ')}. Falling back until fixed.`
          : 'No valid patterns.';
    } else {
      const matched = countBinderMatches(state.movies, regexes);
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
    if (state.leaves.some((l) => l.type === 'binder')) {
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

const STATS_TOP_N = 10;
const STATS_SECTION_ORDER = ['directors', 'actors', 'genres', 'collections', 'companies'];
/** @type {Record<string, boolean>} section key → expanded to show all */
const statsSectionExpanded = Object.create(null);

function openStatsDialog() {
  if (!els.statsBackdrop || !els.statsBody) return;
  // Reset expand state each open
  for (const key of STATS_SECTION_ORDER) statsSectionExpanded[key] = false;
  renderStatsBody();
  resetDialogScroll(els.statsBackdrop);
  els.statsBackdrop.classList.remove('hidden');
  els.statsBackdrop.setAttribute('aria-hidden', 'false');
  queueMicrotask(() => {
    resetDialogScroll(els.statsBackdrop);
    els.statsCloseFooter?.focus();
  });
}

function closeStatsDialog() {
  if (!els.statsBackdrop) return;
  els.statsBackdrop.classList.add('hidden');
  els.statsBackdrop.setAttribute('aria-hidden', 'true');
  if (els.statsBody) els.statsBody.innerHTML = '';
  focusFilterWhenIdle();
}

function isFilterLeafActive(type, value) {
  const valLc = String(value ?? '').toLowerCase();
  return state.leaves.some(
    (l) => l.type === type && String(l.value).toLowerCase() === valLc
  );
}

function renderStatsBody() {
  const host = els.statsBody;
  if (!host) return;
  const stats = buildLibraryStats(state.movies);
  host.innerHTML = '';

  if (!state.movies.length) {
    const p = document.createElement('p');
    p.className = 'stats-empty';
    p.textContent = 'No movies in the collection yet.';
    host.appendChild(p);
    return;
  }

  for (const key of STATS_SECTION_ORDER) {
    const section = stats[key];
    if (!section) continue;
    const expanded = !!statsSectionExpanded[key];
    const title = statsSectionTitle(section, STATS_TOP_N, expanded);
    const visibleRows =
      expanded || section.rows.length <= STATS_TOP_N
        ? section.rows
        : section.rows.slice(0, STATS_TOP_N);

    const wrap = document.createElement('section');
    wrap.className = 'stats-section';
    wrap.dataset.statsSection = key;
    wrap.setAttribute('aria-label', title);

    const h = document.createElement('h3');
    h.className = 'stats-section-title';
    h.textContent = title;
    wrap.appendChild(h);

    if (!section.rows.length) {
      const empty = document.createElement('p');
      empty.className = 'stats-empty';
      empty.textContent = `No ${section.label.toLowerCase()} in the library.`;
      wrap.appendChild(empty);
      host.appendChild(wrap);
      continue;
    }

    const grid = document.createElement('div');
    grid.className = 'stats-chip-grid';
    for (const row of visibleRows) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'stats-chip';
      btn.dataset.type = section.filterType;
      btn.dataset.filterValue = row.name;
      btn.setAttribute('data-type', section.filterType);
      const active = isFilterLeafActive(section.filterType, row.name);
      btn.classList.toggle('is-filter-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      btn.title = `Filter by ${section.filterType}: ${row.name}`;
      btn.textContent = `${row.name} (${row.count})`;
      btn.addEventListener('click', () => {
        // Already active → drop it; otherwise replace all filters with this facet
        if (isFilterLeafActive(section.filterType, row.name)) {
          const valLc = String(row.name).toLowerCase();
          state.leaves = state.leaves.filter(
            (l) =>
              !(
                l.type === section.filterType &&
                String(l.value).toLowerCase() === valLc
              )
          );
        } else {
          state.leaves = addLeaf([], {
            type: section.filterType,
            value: row.name,
            not: false,
          });
        }
        recompute({ resetScroll: true });
        renderStatsBody();
      });
      grid.appendChild(btn);
    }
    wrap.appendChild(grid);

    if (section.rows.length > STATS_TOP_N) {
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'stats-show-more';
      more.textContent = expanded ? t('stats.showLess') : t('stats.showMore');
      more.setAttribute(
        'aria-expanded',
        expanded ? 'true' : 'false'
      );
      more.setAttribute(
        'aria-label',
        expanded ? t('stats.showLess') : t('stats.showMore')
      );
      more.addEventListener('click', () => {
        statsSectionExpanded[key] = !expanded;
        renderStatsBody();
        // Keep the section in view after re-render
        const el = els.statsBody?.querySelector(`[data-stats-section="${key}"]`);
        el?.scrollIntoView({ block: 'nearest' });
      });
      wrap.appendChild(more);
    }

    host.appendChild(wrap);
  }
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
  if (state.leaves.some((l) => l.type === 'binder')) {
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

function openTmdbSearchDialog() {
  if (!els.tmdbBackdrop) return;
  resetTmdbSearchSession();
  els.tmdbTitle.value = '';
  els.tmdbYear.value = '';
  setTmdbStatus('');
  els.tmdbResults.hidden = true;
  els.tmdbResults.innerHTML = '';
  resetDialogScroll(els.tmdbBackdrop);
  els.tmdbBackdrop.classList.remove('hidden');
  els.tmdbBackdrop.setAttribute('aria-hidden', 'false');
  queueMicrotask(() => {
    resetDialogScroll(els.tmdbBackdrop);
    focusTmdbSearchTitle({ selectAll: true });
  });
}

function closeTmdbSearchDialog() {
  if (!els.tmdbBackdrop) return;
  resetTmdbSearchSession();
  els.tmdbBackdrop.classList.add('hidden');
  els.tmdbBackdrop.setAttribute('aria-hidden', 'true');
  focusFilterWhenIdle();
}

function setTmdbStatus(message, { error = false } = {}) {
  if (!els.tmdbStatus) return;
  if (!message) {
    els.tmdbStatus.hidden = true;
    els.tmdbStatus.textContent = '';
    els.tmdbStatus.classList.remove('is-error');
    return;
  }
  els.tmdbStatus.hidden = false;
  els.tmdbStatus.textContent = message;
  els.tmdbStatus.classList.toggle('is-error', error);
}

/**
 * Poster picker modes:
 * - search: Save updates the search-result thumbnail only
 * - library: Save updates the library movie poster_path and marks dirty
 */
let tmdbPosterPick = {
  mode: null, // 'search' | 'library'
  searchMovie: null,
  libraryMovie: null,
  detail: null,
  selectedPath: null,
};

/**
 * Find a library movie by TMDB id.
 * @param {unknown} tmdbId
 * @returns {object|null}
 */
function findLibraryMovieByTmdbId(tmdbId) {
  if (tmdbId == null || tmdbId === '') return null;
  const id = String(tmdbId);
  return state.movies.find((m) => String(m.tmdb_id) === id) || null;
}

/**
 * Mark a search result row as in-library / not, update pill, meta, and action label.
 * @param {HTMLElement} row
 * @param {object} searchMovie
 * @param {object|null} [libraryMovie] if omitted, looked up by searchMovie.id
 */
function applyTmdbResultLibraryState(row, searchMovie, libraryMovie) {
  if (!row) return;
  const lib =
    libraryMovie !== undefined
      ? libraryMovie
      : findLibraryMovieByTmdbId(searchMovie?.id);
  const inLib = !!lib;
  const title = String(searchMovie?.title || 'Untitled');
  const loc = lib ? String(lib.location || '').trim() : '';

  row.classList.toggle('is-in-library', inLib);

  const titleRow = row.querySelector('.tmdb-result-title-row');
  let pill = row.querySelector('.tmdb-in-library-pill');
  if (inLib) {
    if (!pill && titleRow) {
      pill = document.createElement('span');
      pill.className = 'pill tmdb-in-library-pill';
      titleRow.appendChild(pill);
    }
    if (pill) {
      pill.textContent = loc ? `In library · ${loc}` : 'In library';
      pill.hidden = false;
    }
  } else if (pill) {
    pill.remove();
  }

  const addBtn = row.querySelector('.tmdb-add-btn');
  if (addBtn) {
    addBtn.textContent = inLib ? 'Update' : 'Add to Collection';
    addBtn.classList.toggle('is-update', inLib);
  }

  const posterEl = row.querySelector('.tmdb-result-poster');
  if (posterEl) {
    const base = `Choose alternate poster for ${title}`;
    posterEl.setAttribute(
      'aria-label',
      inLib
        ? `${base} (already in library${loc ? `, ${loc}` : ''})`
        : base
    );
  }

  row.setAttribute(
    'aria-label',
    inLib
      ? `${title}, already in library${loc ? `, location ${loc}` : ''}`
      : title
  );
}

/**
 * Refresh in-library chrome for one result after add/replace (or all rows).
 * @param {unknown} [tmdbId] if set, only that row; otherwise all visible rows
 */
function refreshTmdbResultLibraryMarkers(tmdbId) {
  if (!els.tmdbResults) return;
  const rows =
    tmdbId != null && tmdbId !== ''
      ? [
          els.tmdbResults.querySelector(
            `.tmdb-result-row[data-tmdb-id="${CSS.escape(String(tmdbId))}"]`
          ),
        ].filter(Boolean)
      : [...els.tmdbResults.querySelectorAll('.tmdb-result-row')];
  for (const row of rows) {
    const id = row.dataset.tmdbId;
    const searchMovie =
      tmdbSearchSession.movies.find((m) => String(m.id) === String(id)) || {
        id,
        title: row.querySelector('.tmdb-result-title')?.textContent || '',
      };
    applyTmdbResultLibraryState(row, searchMovie);
  }
}

function appendTmdbResultRows(movies) {
  if (!els.tmdbResults || !movies.length) return;
  els.tmdbResults.hidden = false;
  for (const m of movies) {
    const row = document.createElement('div');
    row.className = 'tmdb-result-row';
    row.dataset.tmdbId = String(m.id);
    const year = m.releaseYear || '—';
    const img = posterUrl(m.posterPath);
    const tmdbHref = `${CONFIG.TMDB_MOVIE_BASE}${m.id}`;
    const libraryMovie = findLibraryMovieByTmdbId(m.id);
    const inLib = !!libraryMovie;
    const loc = libraryMovie ? String(libraryMovie.location || '').trim() : '';
    const posterHtml = img
      ? `<button type="button" class="tmdb-result-poster" style="background-image:url('${escapeHtml(img)}')" aria-label="Choose alternate poster for ${escapeHtml(m.title || 'movie')}"></button>`
      : `<button type="button" class="tmdb-result-poster tmdb-result-poster-empty" aria-label="Choose alternate poster for ${escapeHtml(m.title || 'movie')}"></button>`;
    const genres = Array.isArray(m.genres) ? m.genres.filter(Boolean) : [];
    const genrePills = genres.length
      ? `<div class="tmdb-result-genres">${genres
          .map((g) => `<span class="pill tmdb-genre-pill">${escapeHtml(g)}</span>`)
          .join('')}</div>`
      : '';
    const pillHtml = inLib
      ? `<span class="pill tmdb-in-library-pill">${escapeHtml(
          loc ? `In library · ${loc}` : 'In library'
        )}</span>`
      : '';
    const actionLabel = inLib ? 'Update' : 'Add to Collection';
    row.innerHTML = `
      ${posterHtml}
      <div class="tmdb-result-body">
        <div class="tmdb-result-title-row">
          <span class="tmdb-result-title">${escapeHtml(m.title || 'Untitled')}</span>
          ${pillHtml}
        </div>
        <span class="tmdb-result-meta">Release ${escapeHtml(String(year))}</span>
        ${genrePills}
        <div class="tmdb-result-actions">
          <button type="button" class="btn tmdb-add-btn${inLib ? ' is-update' : ''}">${escapeHtml(actionLabel)}</button>
          <a
            class="btn tmdb-open-btn"
            href="${escapeHtml(tmdbHref)}"
            target="_blank"
            rel="noopener noreferrer"
          >TMDB</a>
        </div>
      </div>
    `;
    applyTmdbResultLibraryState(row, m, libraryMovie);
    // Poster click → pick alternate poster for this search result only
    const posterEl = row.querySelector('.tmdb-result-poster');
    posterEl?.addEventListener('click', () => {
      openTmdbPosterPicker(m);
    });
    if (posterEl && m.posterPath) {
      attachPosterHotCorner(
        posterEl,
        () => posterZoomUrl(m.posterPath),
        () => m.title || 'Poster'
      );
    }
    // Add / Update collection using current result poster
    row.querySelector('.tmdb-add-btn')?.addEventListener('click', () => {
      addSearchResultToCollection(m);
    });
    els.tmdbResults.appendChild(row);
  }
}

function updateSearchResultPoster(tmdbId, posterPath) {
  const movie = tmdbSearchSession.movies.find((x) => String(x.id) === String(tmdbId));
  if (movie) movie.posterPath = posterPath;

  const row = els.tmdbResults?.querySelector(
    `.tmdb-result-row[data-tmdb-id="${CSS.escape(String(tmdbId))}"]`
  );
  const posterEl = row?.querySelector('.tmdb-result-poster');
  if (!posterEl) return;
  const url = posterUrl(posterPath);
  if (url) {
    posterEl.style.backgroundImage = `url("${url.replace(/"/g, '\\"')}")`;
    posterEl.classList.remove('tmdb-result-poster-empty');
  } else {
    posterEl.style.backgroundImage = '';
    posterEl.classList.add('tmdb-result-poster-empty');
  }
}

function renderTmdbResults(movies, { append = false } = {}) {
  if (!els.tmdbResults) return;
  if (!append) {
    els.tmdbResults.innerHTML = '';
  }
  if (!movies.length && !append) {
    els.tmdbResults.hidden = true;
    return;
  }
  if (!movies.length) return;
  appendTmdbResultRows(movies);
}

function updateTmdbSearchStatus() {
  const s = tmdbSearchSession;
  const n = s.movies.length;
  if (!n && s.page > 0) {
    setTmdbStatus(
      s.year
        ? `No movies found with release year ${s.year}.`
        : 'No movies found.'
    );
    return;
  }
  if (!n) return;
  const more =
    s.page < s.totalPages
      ? ` · scroll for more (page ${s.page}/${s.totalPages})`
      : '';
  if (s.filteredByYear != null) {
    setTmdbStatus(`${n} result(s) for release year ${s.filteredByYear}${more}`);
  } else {
    setTmdbStatus(`${n} shown · ${s.totalResults} total${more}`);
  }
}

async function loadTmdbSearchPage(page) {
  const s = tmdbSearchSession;
  if (s.loading) return null;
  if (page > 1 && page > s.totalPages) return null;
  s.loading = true;
  try {
    const result = await searchMoviesByTitleAndYear(
      s.apiKey,
      s.title,
      s.year || null,
      page
    );
    s.page = result.page;
    s.totalPages = result.totalPages;
    s.totalResults = result.totalResults;
    s.filteredByYear = result.filteredByYear;

    const seen = new Set(s.movies.map((m) => m.id));
    const fresh = result.movies.filter((m) => !seen.has(m.id));
    s.movies.push(...fresh);
    return { result, fresh, page };
  } finally {
    s.loading = false;
  }
}

function onTmdbResultsScroll() {
  const el = els.tmdbResults;
  if (!el || el.hidden) return;
  const s = tmdbSearchSession;
  if (s.loading || s.page < 1 || s.page >= s.totalPages) return;
  const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 80;
  if (!nearBottom) return;
  loadMoreTmdbResults();
}

async function loadMoreTmdbResults() {
  const s = tmdbSearchSession;
  if (s.loading || s.page >= s.totalPages) return;
  setTmdbStatus(`Loading page ${s.page + 1} of ${s.totalPages}…`);
  try {
    const loaded = await loadTmdbSearchPage(s.page + 1);
    if (loaded?.fresh?.length) {
      renderTmdbResults(loaded.fresh, { append: true });
    }
    updateTmdbSearchStatus();
  } catch (err) {
    console.error(err);
    setTmdbStatus(err.message || String(err), { error: true });
  }
}

// Infinite scroll on results list
els.tmdbResults?.addEventListener('scroll', onTmdbResultsScroll, { passive: true });

function setTmdbPosterStatus(message, { error = false, pathFlash = false } = {}) {
  if (!els.tmdbPosterStatus) return;
  if (!message) {
    els.tmdbPosterStatus.hidden = true;
    els.tmdbPosterStatus.textContent = '';
    els.tmdbPosterStatus.classList.remove('is-error', 'tmdb-poster-path-flash');
    return;
  }
  els.tmdbPosterStatus.hidden = false;
  els.tmdbPosterStatus.textContent = message;
  els.tmdbPosterStatus.classList.toggle('is-error', error);
  els.tmdbPosterStatus.classList.toggle('tmdb-poster-path-flash', pathFlash);
}

/** Briefly show selected poster file path in the status line. */
let posterPathFlashTimer = 0;
function showPosterPathFlash(path) {
  if (!path) return;
  setTmdbPosterStatus(path, { pathFlash: true });
  clearTimeout(posterPathFlashTimer);
  posterPathFlashTimer = window.setTimeout(() => {
    if (els.tmdbPosterBackdrop?.classList.contains('hidden')) return;
    const n = els.tmdbPosterGrid?.querySelectorAll('.tmdb-poster-option').length ?? 0;
    setTmdbPosterStatus(
      n ? `${n} poster(s) — current poster is first and highlighted.` : ''
    );
  }, 2500);
}

async function getTmdbApiKeyOrPrompt() {
  const apiKey = getStoredTmdbApiKey();
  if (!apiKey) {
    await showAppAlert(
      'No TMDB API key stored. Open Menu → Configuration → Settings, enter your key, and Save.',
      { title: 'TMDB API key' }
    );
    return '';
  }
  return apiKey;
}

/** Open poster grid for a search-result hit; Save only updates the result thumbnail. */
async function openTmdbPosterPicker(searchMovie) {
  const apiKey = await getTmdbApiKeyOrPrompt();
  if (!apiKey || !searchMovie?.id) return;

  tmdbPosterPick = {
    mode: 'search',
    searchMovie,
    libraryMovie: null,
    detail: null,
    selectedPath: searchMovie.posterPath || null,
  };
  await loadAndShowPosterPicker({
    tmdbId: searchMovie.id,
    apiKey,
    currentPath: searchMovie.posterPath || null,
    titleHint: searchMovie.title || '',
    yearHint: searchMovie.releaseYear || '',
    saveHint: 'Save applies the poster to this search result only.',
    extraPaths: [],
  });
}

/**
 * Open poster grid for a library movie.
 * Picker Save only updates the movie-dialog draft; collection is written when
 * the movie dialog is Saved / Escape-saved.
 */
async function openLibraryPosterPicker(libraryMovie, posterDraft = null) {
  const apiKey = await getTmdbApiKeyOrPrompt();
  if (!apiKey) return;
  if (!libraryMovie?.tmdb_id) {
    await showAppAlert('This movie has no TMDB id; cannot load alternate posters.', {
      title: 'Poster',
    });
    return;
  }

  const draft = posterDraft || {
    poster_path: libraryMovie.poster_path || '',
    posters: Array.isArray(libraryMovie.posters) ? [...libraryMovie.posters] : [],
  };
  // posters = alternates only (no primary)
  const current = draft.poster_path || null;
  const alternates = (Array.isArray(draft.posters) ? draft.posters : []).filter(
    (p) => p !== current
  );

  tmdbPosterPick = {
    mode: 'library',
    searchMovie: null,
    libraryMovie,
    detail: null,
    selectedPath: current,
  };
  await loadAndShowPosterPicker({
    tmdbId: libraryMovie.tmdb_id,
    apiKey,
    currentPath: current,
    titleHint: libraryMovie.title || '',
    yearHint: libraryMovie.year || '',
    saveHint: 'Confirm in the movie dialog with Save (or Escape) to update the collection.',
    extraPaths: alternates,
  });
}

/**
 * Build picker list: current poster_path first (highlighted), then alternates
 * (local posters collection + TMDB images). Primary is not duplicated.
 * @param {object} detail — from getMovieById
 * @param {string|null|undefined} currentPath — active poster_path / search poster
 * @param {string[]} [extraPaths] — e.g. library movie.posters (alternates)
 */
function buildPosterPathList(detail, currentPath, extraPaths = []) {
  const paths = [];
  const seen = new Set();
  const add = (p) => {
    if (!p || seen.has(p)) return;
    seen.add(p);
    paths.push(p);
  };
  // 1) Current primary first (highlighted)
  add(currentPath);
  // 2) Local alternate collection
  for (const p of extraPaths || []) add(p);
  // 3) TMDB default + image posters
  add(detail?.posterPath);
  for (const p of detail?.posters || []) add(p);
  return paths;
}

async function loadAndShowPosterPicker({
  tmdbId,
  apiKey,
  currentPath,
  titleHint,
  yearHint,
  saveHint,
  extraPaths = [],
}) {
  if (els.tmdbPosterTitle) {
    els.tmdbPosterTitle.textContent = 'Choose poster';
  }
  if (els.tmdbPosterSubtitle) {
    els.tmdbPosterSubtitle.textContent = titleHint
      ? `Pick a poster for “${titleHint}”.`
      : 'Pick a poster.';
  }
  if (els.tmdbPosterGrid) els.tmdbPosterGrid.innerHTML = '';
  setTmdbPosterStatus('Loading posters…');
  if (els.tmdbPosterSave) els.tmdbPosterSave.disabled = true;

  resetDialogScroll(els.tmdbPosterBackdrop);
  els.tmdbPosterBackdrop?.classList.remove('hidden');
  els.tmdbPosterBackdrop?.setAttribute('aria-hidden', 'false');
  queueMicrotask(() => resetDialogScroll(els.tmdbPosterBackdrop));

  try {
    const detail = await getMovieById(apiKey, tmdbId);
    tmdbPosterPick.detail = detail;

    const paths = buildPosterPathList(detail, currentPath, extraPaths);
    // Highlight current poster (now first when present)
    tmdbPosterPick.selectedPath =
      (currentPath && paths.includes(currentPath) ? currentPath : null) ||
      paths[0] ||
      null;

    if (!paths.length) {
      setTmdbPosterStatus('No posters available for this movie.', { error: true });
      return;
    }

    setTmdbPosterStatus(`${paths.length} poster(s) — current poster is first and highlighted.`);
    renderTmdbPosterGrid(paths, tmdbPosterPick.selectedPath);
    if (els.tmdbPosterSave) els.tmdbPosterSave.disabled = false;
    if (els.tmdbPosterSubtitle) {
      const y = yearHint || detail.releaseYear || '';
      const name = detail.title || titleHint || 'Movie';
      els.tmdbPosterSubtitle.textContent = y
        ? `${name} (${y}) — ${saveHint}`
        : `${name} — ${saveHint}`;
    }
  } catch (err) {
    console.error(err);
    setTmdbPosterStatus(err.message || String(err), { error: true });
  }
}

function renderTmdbPosterGrid(paths, selectedPath) {
  if (!els.tmdbPosterGrid) return;
  els.tmdbPosterGrid.innerHTML = '';
  paths.forEach((path, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className =
      'tmdb-poster-option' + (path === selectedPath ? ' is-selected' : '');
    btn.setAttribute('role', 'option');
    btn.setAttribute('aria-selected', path === selectedPath ? 'true' : 'false');
    btn.dataset.path = path;
    const url = posterUrl(path);
    btn.setAttribute('aria-label', `Poster option ${i + 1}`);
    btn.addEventListener('click', () => {
      tmdbPosterPick.selectedPath = path;
      els.tmdbPosterGrid.querySelectorAll('.tmdb-poster-option').forEach((el) => {
        const sel = el.dataset.path === path;
        el.classList.toggle('is-selected', sel);
        el.setAttribute('aria-selected', sel ? 'true' : 'false');
      });
      showPosterPathFlash(path);
    });
    // Load image; remove path from collections only on 404 / load error
    if (url) {
      const img = new Image();
      img.onload = () => {
        if (!btn.isConnected) return;
        btn.style.backgroundImage = `url("${url.replace(/"/g, '\\"')}")`;
      };
      img.onerror = () => {
        removePosterPathOn404(path);
        btn.remove();
      };
      img.src = url;
      attachPosterHotCorner(
        btn,
        () => posterZoomUrl(path),
        () => `Poster option ${i + 1}`
      );
    }
    els.tmdbPosterGrid.appendChild(btn);
  });
}

/** Drop a poster path only when the image failed (404). Do not remove on swap. */
function removePosterPathOn404(path) {
  if (!path) return;
  if (tmdbPosterPick.detail?.posters) {
    tmdbPosterPick.detail.posters = tmdbPosterPick.detail.posters.filter((p) => p !== path);
  }
  const lib = tmdbPosterPick.libraryMovie;
  if (lib) {
    if (Array.isArray(lib.posters)) {
      lib.posters = lib.posters.filter((p) => p !== path);
    }
    // If the broken path was primary, leave poster_path until user saves another;
    // still mark dirty because posters list changed.
    setDirty(true);
  }
  if (tmdbPosterPick.selectedPath === path) {
    const fallback =
      tmdbPosterPick.libraryMovie?.poster_path ||
      tmdbPosterPick.detail?.posterPath ||
      els.tmdbPosterGrid?.querySelector('.tmdb-poster-option')?.dataset.path ||
      null;
    tmdbPosterPick.selectedPath = fallback;
    if (fallback) {
      els.tmdbPosterGrid?.querySelectorAll('.tmdb-poster-option').forEach((el) => {
        const sel = el.dataset.path === fallback;
        el.classList.toggle('is-selected', sel);
        el.setAttribute('aria-selected', sel ? 'true' : 'false');
      });
    }
  }
}

function closeTmdbPosterDialog() {
  clearTimeout(posterPathFlashTimer);
  tmdbPosterPick = {
    mode: null,
    searchMovie: null,
    libraryMovie: null,
    detail: null,
    selectedPath: null,
  };
  els.tmdbPosterBackdrop?.classList.add('hidden');
  els.tmdbPosterBackdrop?.setAttribute('aria-hidden', 'true');
  if (els.tmdbPosterGrid) els.tmdbPosterGrid.innerHTML = '';
  setTmdbPosterStatus('');
  focusFilterWhenIdle();
}

/** Save poster selection: search result thumbnail or library movie. */
function saveTmdbPosterSelection() {
  const posterPath =
    tmdbPosterPick.selectedPath ||
    tmdbPosterPick.detail?.posterPath ||
    tmdbPosterPick.searchMovie?.posterPath ||
    tmdbPosterPick.libraryMovie?.poster_path;

  if (!posterPath) {
    setTmdbPosterStatus('Select a poster before saving.', { error: true });
    return;
  }

  if (tmdbPosterPick.mode === 'search') {
    const searchMovie = tmdbPosterPick.searchMovie;
    if (!searchMovie?.id) {
      setTmdbPosterStatus('Nothing to save yet.', { error: true });
      return;
    }
    updateSearchResultPoster(searchMovie.id, posterPath);
    closeTmdbPosterDialog();
    setTmdbStatus(`Poster updated for “${searchMovie.title || 'movie'}”.`);
    return;
  }

  if (tmdbPosterPick.mode === 'library') {
    const movie = tmdbPosterPick.libraryMovie;
    if (!movie) {
      setTmdbPosterStatus('Nothing to save yet.', { error: true });
      return;
    }
    // Work against movie-dialog draft (or movie if dialog closed)
    const draft = dialog.isOpen() && dialog.movie === movie
      ? dialog.getPosterDraft()
      : {
          poster_path: movie.poster_path || '',
          posters: Array.isArray(movie.posters) ? [...movie.posters] : [],
        };
    const currentPath = draft?.poster_path || movie.poster_path || '';
    const merged = mergePosterLists(
      draft?.posters,
      movie.posters,
      tmdbPosterPick.detail?.posters,
      tmdbPosterPick.detail?.posterPath
    );
    const alternates = merged.filter((p) => p !== currentPath);
    const promoted = promotePosterSelection(
      alternates,
      currentPath,
      posterPath
    );

    // Draft only — library + dirty flag update when movie dialog Save / Escape
    if (dialog.isOpen() && dialog.movie === movie) {
      dialog.applyPosterDraft(promoted.posterPath, promoted.posters);
    } else {
      // Fallback if detail dialog is not open
      movie.poster_path = promoted.posterPath;
      movie.posters = promoted.posters;
      setDirty(true);
      refreshLibraryAfterMutation();
    }
    closeTmdbPosterDialog();
    return;
  }

  setTmdbPosterStatus('Nothing to save yet.', { error: true });
}

/** Add/override collection using the poster currently shown on the search result. */
async function addSearchResultToCollection(searchMovie) {
  const apiKey = getStoredTmdbApiKey();
  if (!apiKey) {
    setTmdbStatus('Set a TMDB API key in Menu → Settings first.', { error: true });
    return;
  }
  if (!searchMovie?.id) return;

  setTmdbStatus(`Adding “${searchMovie.title || 'movie'}”…`);
  try {
    const detail = await getMovieById(apiKey, searchMovie.id);
    const posterPath = searchMovie.posterPath || detail.posterPath;
    if (!posterPath) {
      setTmdbStatus('No poster available; pick one by clicking the result poster first.', {
        error: true,
      });
      return;
    }

    const existing = state.movies.find(
      (m) => String(m.tmdb_id) === String(detail.id)
    );
    let preservedLocation = '';
    let preservedKeywords = [];
    if (existing) {
      const ok = await showAppConfirm(
        `“${detail.title}” is already in your collection. Replace it with this TMDB version?`,
        { title: 'Replace Movie',
          okLabel: 'Replace',
          cancelLabel: 'Cancel' }
      );
      if (!ok) {
        setTmdbStatus('Add cancelled.');
        return;
      }
      preservedLocation = existing.location != null ? String(existing.location) : '';
      preservedKeywords = Array.isArray(existing.keywords)
        ? existing.keywords.map((k) => String(k)).filter(Boolean)
        : [];
      const i = state.movies.indexOf(existing);
      if (i >= 0) state.movies.splice(i, 1);
    }

    const record = toLibraryMovie(detail, { posterPath });
    // Keep local location when overriding an existing library entry
    if (existing) {
      record.location = preservedLocation;
      // Keep old keywords that TMDB no longer returns (merge, no duplicates)
      record.keywords = mergeKeywords(preservedKeywords, record.keywords);
    }
    state.movies.push(record);
    setDirty(true);
    refreshLibraryAfterMutation();
    setTmdbStatus(
      existing
        ? `Replaced “${detail.title}” in your collection.`
        : `Added “${detail.title}” to your collection.`
    );
    // Open detail dialog; leave TMDB search open underneath
    dialog.open(record);
  } catch (err) {
    console.error(err);
    setTmdbStatus(err.message || String(err), { error: true });
  }
}

/** Rebuild typeahead index and re-run filters + grid after library add/remove/edit. */
function refreshLibraryAfterMutation() {
  state.typeaheadIndex = buildTypeaheadIndex(state.movies);
  recompute({ resetScroll: false });
  // Keep Search Movies in-library markers in sync (add / replace / delete)
  if (isTmdbSearchOpen()) {
    refreshTmdbResultLibraryMarkers();
  }
}

async function runTmdbSearch() {
  const apiKey = getStoredTmdbApiKey();
  const title = String(els.tmdbTitle?.value || '').trim();
  const year = String(els.tmdbYear?.value || '').trim();

  if (!apiKey) {
    setTmdbStatus('Set a TMDB API key in Menu → Settings first.', { error: true });
    return;
  }
  if (!title) {
    setTmdbStatus('Enter a movie title.', { error: true });
    els.tmdbTitle?.focus();
    return;
  }
  if (year && !/^\d{4}$/.test(year)) {
    setTmdbStatus('Release year must be 4 digits (YYYY).', { error: true });
    els.tmdbYear?.focus();
    return;
  }

  resetTmdbSearchSession();
  tmdbSearchSession.apiKey = apiKey;
  tmdbSearchSession.title = title;
  tmdbSearchSession.year = year;

  setTmdbStatus('Searching…');
  renderTmdbResults([]);
  const submitBtn = document.getElementById('tmdb-search-submit');
  if (submitBtn) submitBtn.disabled = true;

  try {
    const loaded = await loadTmdbSearchPage(1);
    if (!loaded) return;
    renderTmdbResults(loaded.fresh, { append: false });
    updateTmdbSearchStatus();
    // If year filtering emptied page 1 but more pages exist, prefetch until we
    // have some hits or pages run out (best-effort, max a few pages).
    let guard = 0;
    while (
      tmdbSearchSession.movies.length === 0 &&
      tmdbSearchSession.page < tmdbSearchSession.totalPages &&
      guard < 5
    ) {
      guard += 1;
      const more = await loadTmdbSearchPage(tmdbSearchSession.page + 1);
      if (more?.fresh?.length) {
        renderTmdbResults(more.fresh, { append: true });
      }
    }
    updateTmdbSearchStatus();
  } catch (err) {
    console.error(err);
    setTmdbStatus(err.message || String(err), { error: true });
    renderTmdbResults([]);
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

// —— Filters UI ——
function recompute({ resetScroll = true, fromHash = false } = {}) {
  const filtered = applyFilters(state.movies, state.leaves);
  state.filtered = sortMovies(filtered, state.sortId);
  const total = state.movies.length;
  const shown = state.filtered.length;
  // No filters: dark badge on total. With filters: [shown] of [total] (badges on numbers only).
  if (els.movieCount) {
    if (state.leaves.length) {
      els.movieCount.innerHTML =
        `<span class="movie-count-num">${shown}</span>` +
        `<span class="movie-count-of">of</span>` +
        `<span class="movie-count-num">${total}</span>`;
    } else {
      els.movieCount.innerHTML = `<span class="movie-count-num">${total}</span>`;
    }
  }
  renderActiveFilters();
  grid.setMovies(state.filtered, { resetScroll, preserveAnchor: !resetScroll });

  const empty = state.movies.length > 0 && state.filtered.length === 0;
  const newInstall = state.dataReady && state.movies.length === 0;
  els.statusEmpty.classList.toggle('hidden', !empty);
  els.statusNewInstall?.classList.toggle('hidden', !newInstall);

  if (!fromHash && !state.suppressHashWrite) {
    writeHash(state.leaves);
  }

  // Keep movie-dialog filter pills in sync with active leaves
  if (dialog.isOpen()) dialog.syncFilterPillActiveState();
}

function renderActiveFilters() {
  const host = els.activeFilters;
  host.innerHTML = '';
  if (!state.leaves.length) return;

  // Group by type for light separators (AND between groups)
  const order = [];
  const groups = new Map();
  for (const leaf of state.leaves) {
    if (!groups.has(leaf.type)) {
      groups.set(leaf.type, []);
      order.push(leaf.type);
    }
    groups.get(leaf.type).push(leaf);
  }

  order.forEach((type, gi) => {
    if (gi > 0) {
      const sep = document.createElement('span');
      sep.className = 'filter-sep';
      sep.textContent = 'AND';
      host.appendChild(sep);
    }
    const group = groups.get(type);
    group.forEach((leaf, li) => {
      if (li > 0) {
        const sep = document.createElement('span');
        sep.className = 'filter-sep';
        // Positives OR; negated (or mixed) joins use AND
        sep.textContent = sameTypeJoinLabel(group[li - 1], leaf);
        host.appendChild(sep);
      }
      const globalIndex = state.leaves.indexOf(leaf);
      host.appendChild(createChip(leaf, globalIndex));
    });
  });
}

/** Title-case filter type for chip context menu header (e.g. actor → Actor). */
function filterTypeMenuLabel(type) {
  const key = type ? `filter.type.${type}` : '';
  if (key && t(key) !== key) return t(key);
  const raw = FILTER_TYPE_LABELS[type] || type || 'Filter';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function createChip(leaf, index) {
  const wrap = document.createElement('div');
  wrap.className = 'filter-chip-wrap';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'filter-chip' + (leaf.not ? ' is-not' : '');
  btn.dataset.type = leaf.type;
  btn.setAttribute('aria-haspopup', 'true');

  const text = document.createElement('span');
  text.className = 'chip-text';
  const label = displayLabel(leaf);
  text.textContent = leaf.not ? `${t('filter.menu.not')} ${label}` : label;
  btn.appendChild(text);

  const chev = document.createElement('span');
  chev.setAttribute('aria-hidden', 'true');
  chev.textContent = ' ▾';
  btn.appendChild(chev);

  const menu = document.createElement('div');
  menu.className = 'chip-menu';
  const typeLabel = filterTypeMenuLabel(leaf.type);
  menu.innerHTML = `
    <div class="menu-label">${typeLabel}</div>
    <button type="button" data-action="toggle">${t('filter.menu.not')}</button>
    <button type="button" data-action="remove">${t('filter.menu.remove')}</button>
    <button type="button" data-action="remove-others">${t('filter.menu.only')}</button>
    <button type="button" data-action="remove-all">${t('menu.clearAll')}</button>
  `;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const wasOpen = menu.classList.contains('open');
    closeAllChipMenus();
    if (!wasOpen) menu.classList.add('open');
  });

  menu.addEventListener('click', (e) => {
    const action = e.target.closest('button')?.dataset.action;
    if (!action) return;
    e.stopPropagation();
    if (action === 'toggle') {
      state.leaves = toggleLeafNot(state.leaves, index);
    } else if (action === 'remove') {
      state.leaves = removeLeaf(state.leaves, index);
    } else if (action === 'remove-others') {
      state.leaves = removeOtherLeaves(state.leaves, index);
    } else if (action === 'remove-all') {
      state.leaves = [];
    }
    recompute({ resetScroll: true });
  });

  wrap.appendChild(btn);
  wrap.appendChild(menu);
  return wrap;
}

function closeAllChipMenus() {
  els.activeFilters.querySelectorAll('.chip-menu.open').forEach((m) => m.classList.remove('open'));
}

function applyLeaf(leaf) {
  if (!leaf) return;
  state.leaves = addLeaf(state.leaves, leaf);
  recompute({ resetScroll: true });
}

/** Add filter, or remove it if the same type+value is already active. */
function toggleFilterLeaf(leaf) {
  if (!leaf) return;
  const type = leaf.type;
  const value = String(leaf.value ?? '').trim();
  if (!type || !value) return;
  const valLc = value.toLowerCase();
  const idx = state.leaves.findIndex(
    (l) => l.type === type && String(l.value).toLowerCase() === valLc
  );
  if (idx >= 0) {
    state.leaves = removeLeaf(state.leaves, idx);
  } else {
    state.leaves = addLeaf(state.leaves, { type, value, not: !!leaf.not });
  }
  recompute({ resetScroll: true });
}

/** True when the filter input has a leading `-` (negated add). */
function inputWantsNot() {
  return stripLeadingNot(els.filterInput.value).not;
}

// —— Typeahead ——
els.filterInput.addEventListener('input', () => {
  refreshTypeahead();
});

els.filterInput.addEventListener('keydown', (e) => {
  const open = els.typeahead.classList.contains('open');
  if (e.key === 'ArrowDown' && open) {
    e.preventDefault();
    moveTypeahead(1);
  } else if (e.key === 'ArrowUp' && open) {
    e.preventDefault();
    moveTypeahead(-1);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const negate = inputWantsNot();
    if (open && state.typeaheadActive >= 0 && state.typeaheadItems[state.typeaheadActive]) {
      const item = state.typeaheadItems[state.typeaheadActive];
      applyLeaf({ type: item.type, value: item.value, not: negate });
    } else {
      applyLeaf(leafFromFreeText(els.filterInput.value, state.typeaheadIndex));
    }
    els.filterInput.value = '';
    closeTypeahead();
  } else if (e.key === 'Escape') {
    closeTypeahead();
    els.filterInput.blur();
  }
});

els.filterInput.addEventListener('focus', () => {
  if (els.filterInput.value.trim()) refreshTypeahead();
});

function refreshTypeahead() {
  if (!state.typeaheadIndex) {
    closeTypeahead();
    return;
  }
  // Strip leading `-` so `-Jude` still finds Jude Law; selection keeps NOT
  const q = stripLeadingNot(els.filterInput.value).text;
  const items = queryTypeahead(state.typeaheadIndex, q);
  state.typeaheadItems = items;
  state.typeaheadActive = items.length ? 0 : -1;
  renderTypeahead(items);
}

function renderTypeahead(items) {
  const host = els.typeahead;
  if (!items.length) {
    closeTypeahead();
    return;
  }
  const negate = inputWantsNot();
  host.innerHTML = '';
  let lastType = null;
  items.forEach((item, i) => {
    if (item.type !== lastType) {
      lastType = item.type;
      const g = document.createElement('div');
      g.className = 'typeahead-group-label';
      g.textContent = item.type;
      host.appendChild(g);
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'typeahead-item' + (i === state.typeaheadActive ? ' is-active' : '');
    btn.setAttribute('role', 'option');
    btn.dataset.index = String(i);
    const notPrefix = negate ? 'NOT ' : '';
    btn.innerHTML = `<span class="type-pill" data-type="${item.type}">${item.type}</span><span></span>`;
    btn.querySelector('span:last-child').textContent =
      notPrefix + typeaheadValueLabel(item.type, item.value);
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      applyLeaf({ type: item.type, value: item.value, not: inputWantsNot() });
      els.filterInput.value = '';
      closeTypeahead();
    });
    host.appendChild(btn);
  });
  host.classList.add('open');
  els.filterInput.setAttribute('aria-expanded', 'true');
}

function moveTypeahead(delta) {
  const n = state.typeaheadItems.length;
  if (!n) return;
  state.typeaheadActive = (state.typeaheadActive + delta + n) % n;
  els.typeahead.querySelectorAll('.typeahead-item').forEach((el, i) => {
    el.classList.toggle('is-active', i === state.typeaheadActive);
    if (i === state.typeaheadActive) el.scrollIntoView({ block: 'nearest' });
  });
}

function closeTypeahead() {
  els.typeahead.classList.remove('open');
  els.typeahead.innerHTML = '';
  state.typeaheadItems = [];
  state.typeaheadActive = -1;
  els.filterInput.setAttribute('aria-expanded', 'false');
}

// —— Hash ——
function loadFiltersFromHash() {
  try {
    const leaves = hashToLeaves(location.hash);
    state.leaves = leaves;
    return true;
  } catch (err) {
    // Do not wipe in-memory filters on a bad hash — keep what the user built
    // and drop only the unreadable fragment. Prevents “all chips vanished”
    // when the browser rewrites encoding in ways we fail to parse.
    console.warn('Invalid filter hash; leaving current filters', err, location.hash);
    try {
      clearHash();
    } catch {
      /* ignore */
    }
    return false;
  }
}

window.addEventListener('hashchange', () => {
  state.suppressHashWrite = true;
  const ok = loadFiltersFromHash();
  // Only recompute from hash when parse succeeded; otherwise keep state.leaves
  if (ok) {
    recompute({ resetScroll: true, fromHash: true });
  }
  state.suppressHashWrite = false;
});

// —— Data load ——
function finishLibraryLoad(movies) {
  state.movies = movies;
  state.dataReady = true;
  state.typeaheadIndex = buildTypeaheadIndex(state.movies);
  els.statusLoading.classList.add('hidden');
  els.statusError.classList.add('hidden');
  loadFiltersFromHash();
  recompute({ resetScroll: true, fromHash: true });
  focusFilterWhenIdle();
}

async function loadData() {
  if (!GITHUB_TARGET) {
    console.warn(
      'CONFIG.GITHUB_DATA_COMMITS_URL is missing or invalid; loading fallback path',
      CONFIG.DATA_PATH,
      '(Save / Restore / Deployments will not work until fixed — see docs/README.md)'
    );
  }

  const path = CONFIG.DATA_PATH;
  const url = `${path}?v=${encodeURIComponent(CONFIG.DATA_VERSION)}`;
  els.loadingPath.textContent = path;
  els.statusLoading.classList.remove('hidden');
  els.statusError.classList.add('hidden');
  els.statusNewInstall?.classList.add('hidden');
  state.dataReady = false;

  try {
    const res = await fetch(url);
    // Missing data file → empty library (new installation). User can add movies
    // via Search Movies, then Export (or Save to GitHub) to create the file.
    if (res.status === 404) {
      finishLibraryLoad([]);
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('Expected a JSON array of movies');
    finishLibraryLoad(data);
  } catch (err) {
    console.error(err);
    state.dataReady = false;
    els.statusLoading.classList.add('hidden');
    els.statusNewInstall?.classList.add('hidden');
    els.statusError.classList.remove('hidden');
    els.errorDetail.textContent = `${err.message || err} (tried ${url})`;
    if (els.movieCount) {
      els.movieCount.innerHTML = '<span class="movie-count-num">0</span>';
    }
  }
}

loadData();
