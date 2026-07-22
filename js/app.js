import {
  CONFIG,
  DEFAULT_SORT,
  FILTER_TYPE_LABELS,
  GITHUB_TARGET,
  SORT_OPTIONS,
} from './config.js';
import {
  addLeaf,
  applyFilters,
  buildTypeaheadIndex,
  displayLabel,
  leafFromFreeText,
  queryTypeahead,
  removeLeaf,
  removeOtherLeaves,
  sameTypeJoinLabel,
  sortMovies,
  stripLeadingNot,
  toggleLeafNot,
  typeaheadValueLabel,
} from './filters.js';
import { clearHash, hashToLeaves, writeHash } from './hash.js';
import { PosterGrid } from './grid.js';
import { MovieDialog } from './dialog.js';
import { isPrimaryActionEnter } from './utils.js';
import { isAppAlertOpen } from './alert-dialog.js';
import { isPosterZoomOpen } from './poster-zoom.js';
import { t } from './i18n.js';
import { initMenu } from './menu.js';
import {
  initSaveProgressDialog,
  resetDialogScroll,
} from './progress-console.js';
import { initSettingsTransfer } from './settings-transfer-ui.js';
import { initSettingsUi } from './settings-ui.js';
import {
  initGithubSave,
  openGithubDeploymentView,
} from './github-save.js';
import { initLibraryHistory } from './library-history.js';
import { initAppToast, showAppToast } from './app-toast.js';
import { initMetaRefresh } from './meta-refresh.js';
import { initStatsUi } from './stats-ui.js';
import { initLibraryIo } from './library-io.js';
import { initTmdbSearchUi } from './tmdb-search-ui.js';

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


/** Filled by initTmdbSearchUi (deferred so MovieDialog can call it). */
let openLibraryPosterPicker = (_movie, _draft) => {};
/** Filled by initTmdbSearchUi. */
let refreshTmdbResultLibraryMarkers = () => {};

/** Rebuild typeahead index and re-run filters + grid after library add/remove/edit. */
function refreshLibraryAfterMutation() {
  state.typeaheadIndex = buildTypeaheadIndex(state.movies);
  recompute({ resetScroll: false });
  if (isTmdbSearchOpen()) {
    refreshTmdbResultLibraryMarkers();
  }
}

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
  openSettingsDialog,
  closeSettingsDialog,
  reapplySettingsFromStorage,
  isSettingsOpen,
} = initSettingsUi({
  els,
  grid,
  dialog,
  closeMenu,
  focusFilterWhenIdle,
  isAnyModalOpen,
  getMovies: () => state.movies,
  hasBinderFilter: () => state.leaves.some((l) => l.type === 'binder'),
  recompute,
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

const { confirmAndApplyImportedLibrary } = initLibraryIo({
  els: {
    exportBtn: els.exportBtn,
    importBtn: els.importBtn,
    importFileInput: els.importFileInput,
    emptyCollectionBtn: els.emptyCollectionBtn,
  },
  closeMenu,
  getMovies: () => state.movies,
  getDirty: () => state.dirty,
  isDataReady: () => state.dataReady,
  isMetaRefreshRunning,
  setDirty,
  finishLibraryLoad,
  dialog,
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

initStatsUi({
  els: {
    statsBtn: els.statsBtn,
    statsBackdrop: els.statsBackdrop,
    statsBody: els.statsBody,
    statsClose: els.statsClose,
    statsCloseFooter: els.statsCloseFooter,
  },
  closeMenu,
  focusFilterWhenIdle,
  getMovies: () => state.movies,
  getLeaves: () => state.leaves,
  setLeaves: (leaves) => {
    state.leaves = leaves;
  },
  recompute,
});

const tmdbSearchApi = initTmdbSearchUi({
  els,
  closeMenu,
  focusFilterWhenIdle,
  preferDesktopAutoFocus,
  isAnyModalOpen,
  getMovies: () => state.movies,
  isDataReady: () => state.dataReady,
  setDirty,
  refreshLibraryAfterMutation,
  dialog,
  isMetaRefreshOpen,
  isSaveProgressOpen,
});
openLibraryPosterPicker = tmdbSearchApi.openLibraryPosterPicker;
refreshTmdbResultLibraryMarkers = tmdbSearchApi.refreshTmdbResultLibraryMarkers;

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

initSettingsTransfer({
  closeMenu,
  showAppToast,
  openSaveProgressDialog,
  appendSaveLog,
  reapplySettingsFromStorage,
  closeSettingsDialog,
  focusFilterWhenIdle,
  isSettingsOpen,
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
