import {
  CONFIG,
  DEFAULT_SORT,
  FILTER_TYPE_LABELS,
  GITHUB_TARGET,
  LOCALE_OPTIONS,
  SORT_OPTIONS,
  THEME_COLOR_FIELDS,
  THEME_OPTIONS,
  applyPosterBacklight,
  applyTheme,
  clampPosterBacklightPercent,
  clampPosterGapPx,
  clampPosterScalePercent,
  getStoredLocale,
  getStoredLocationOverlayEnabled,
  getStoredPosterBacklightPercent,
  getStoredPosterGapPx,
  getStoredPosterScalePercent,
  getStoredTheme,
  getStoredThemeColors,
  normalizeTheme,
  readResolvedThemeColors,
  setStoredLocale,
  setStoredLocationOverlayEnabled,
  setStoredPosterBacklightPercent,
  setStoredPosterGapPx,
  setStoredPosterScalePercent,
  setStoredTheme,
  setStoredThemeColors,
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
  mergePosterLists,
  posterUrl,
  promotePosterSelection,
} from './utils.js';
import {
  getMovieById,
  getStoredTmdbApiKey,
  searchMoviesByTitleAndYear,
  setStoredTmdbApiKey,
  toLibraryMovie,
} from './tmdb.js';
import {
  computeGitBlobSha,
  getFileContent,
  getStoredGithubToken,
  putFileContent,
  setStoredGithubToken,
} from './github.js';
import {
  diffLibraries,
  formatLibraryCommitMessage,
  parseLibraryJson,
} from './library-diff.js';
import { isAppAlertOpen, showAppAlert, showAppConfirm } from './alert-dialog.js';
import { attachPosterHotCorner, isPosterZoomOpen, posterZoomUrl } from './poster-zoom.js';
import { buildLibraryStats, statsSectionTitle } from './stats.js';

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
  viewJsonBtn: document.getElementById('view-json-btn'),
  githubDeploymentBtn: document.getElementById('github-deployment-btn'),
  exportBtn: document.getElementById('export-btn'),
  tmdbSearchBtn: document.getElementById('tmdb-search-btn'),
  statsBtn: document.getElementById('stats-btn'),
  statsBackdrop: document.getElementById('stats-backdrop'),
  statsBody: document.getElementById('stats-body'),
  statsClose: document.getElementById('stats-close'),
  statsCloseFooter: document.getElementById('stats-close-footer'),
  settingsBtn: document.getElementById('settings-btn'),
  settingsBackdrop: document.getElementById('settings-backdrop'),
  settingsForm: document.getElementById('settings-form'),
  settingsApiKey: document.getElementById('settings-tmdb-api-key'),
  settingsApiKeyToggle: document.getElementById('settings-tmdb-api-key-toggle'),
  settingsApiKeyCopy: document.getElementById('settings-tmdb-api-key-copy'),
  settingsGithubApiKey: document.getElementById('settings-github-api-key'),
  settingsGithubApiKeyToggle: document.getElementById('settings-github-api-key-toggle'),
  settingsGithubApiKeyCopy: document.getElementById('settings-github-api-key-copy'),
  settingsLocale: document.getElementById('settings-locale'),
  settingsPosterScale: document.getElementById('settings-poster-scale'),
  settingsPosterScaleValue: document.getElementById('settings-poster-scale-value'),
  settingsPosterGap: document.getElementById('settings-poster-gap'),
  settingsPosterGapValue: document.getElementById('settings-poster-gap-value'),
  settingsPosterBacklight: document.getElementById('settings-poster-backlight'),
  settingsPosterBacklightValue: document.getElementById(
    'settings-poster-backlight-value'
  ),
  settingsLocationOverlay: document.getElementById('settings-location-overlay'),
  settingsTheme: document.getElementById('settings-theme'),
  settingsThemeColors: document.getElementById('settings-theme-colors'),
  settingsThemeResetColors: document.getElementById('settings-theme-reset-colors'),
  settingsStatus: document.getElementById('settings-status'),
  settingsClose: document.getElementById('settings-close'),
  settingsCancel: document.getElementById('settings-cancel'),
  saveProgressBackdrop: document.getElementById('save-progress-backdrop'),
  saveProgressConsole: document.getElementById('save-progress-console'),
  saveProgressClose: document.getElementById('save-progress-close'),
  saveProgressCopy: document.getElementById('save-progress-copy'),
  saveProgressOk: document.getElementById('save-progress-ok'),
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
    shown(els.saveProgressBackdrop)
  );
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
 * Desktop only — auto-focus is disruptive on mobile (keyboard popup, scroll jumps).
 * All post-modal filter focus must go through this helper (not returnFocus).
 */
function focusFilterWhenIdle() {
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
/** Last saved theme prefs; used to revert Settings theme preview on cancel. */
let savedThemeId = getStoredTheme();
/** @type {Record<string, string>} */
let savedThemeColors = getStoredThemeColors();
/** Draft custom colors while Settings is open (preview only until Save). */
/** @type {Record<string, string>} */
let draftThemeColors = { ...savedThemeColors };
applyTheme(savedThemeId, savedThemeColors);
applyPosterBacklight(savedPosterBacklightPercent);
grid.setScale(savedPosterScalePercent / 100);
grid.setGap(savedPosterGapPx);
grid.setLocationOverlay(savedLocationOverlay);

const dialog = new MovieDialog({
  backdrop: els.backdrop,
  body: els.dialogBody,
  btnClose: els.dialogClose,
  btnPrev: els.dialogPrev,
  btnNext: els.dialogNext,
  btnDelete: els.dialogDelete,
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
els.menuBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleMenu();
});

els.menuDropdown.addEventListener('click', (e) => {
  const trigger = e.target.closest('.menu-accordion-trigger');
  if (trigger) {
    e.preventDefault();
    e.stopPropagation();
    const group = trigger.closest('.menu-accordion-group');
    if (group) openMenuAccordionGroup(group);
    return;
  }

  const btn = e.target.closest('button[data-sort]');
  if (btn) {
    setSort(btn.dataset.sort);
    closeMenu();
    return;
  }
});

els.saveJsonBtn?.addEventListener('click', () => {
  closeMenu();
  saveJsonToGithub();
});

els.viewJsonBtn?.addEventListener('click', () => {
  closeMenu();
  openGithubDataCommitsView();
});

els.githubDeploymentBtn?.addEventListener('click', () => {
  closeMenu();
  openGithubDeploymentView();
});

els.saveProgressClose?.addEventListener('click', () => closeSaveProgressDialog());
els.saveProgressOk?.addEventListener('click', () => closeSaveProgressDialog());
els.saveProgressCopy?.addEventListener('click', () => {
  copySaveProgressLog();
});
els.saveProgressBackdrop?.addEventListener('click', (e) => {
  if (e.target === els.saveProgressBackdrop) closeSaveProgressDialog();
});

// Escape closes Save progress dialog when open (above other dialogs)
document.addEventListener(
  'keydown',
  (e) => {
    if (e.key !== 'Escape') return;
    if (isAppAlertOpen()) return;
    if (!isSaveProgressOpen()) return;
    e.preventDefault();
    e.stopPropagation();
    closeSaveProgressDialog();
  },
  true
);

els.exportBtn.addEventListener('click', () => {
  closeMenu();
  exportData();
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

els.statsBtn?.addEventListener('click', () => {
  closeMenu();
  openStatsDialog();
});

els.statsClose?.addEventListener('click', () => closeStatsDialog());
els.statsCloseFooter?.addEventListener('click', () => closeStatsDialog());
els.statsBackdrop?.addEventListener('click', (e) => {
  if (e.target === els.statsBackdrop) closeStatsDialog();
});

els.settingsBtn?.addEventListener('click', () => {
  closeMenu();
  openSettingsDialog();
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

function toggleMenu() {
  const open = els.menuDropdown.classList.toggle('open');
  els.menuDropdown.hidden = !open;
  els.menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open) {
    resetMenuAccordion();
    syncSortMenuActive();
  }
}

function closeMenu() {
  els.menuDropdown.classList.remove('open');
  els.menuDropdown.hidden = true;
  els.menuBtn.setAttribute('aria-expanded', 'false');
  focusFilterWhenIdle();
}

/** Default accordion section when the menu opens. */
const MENU_ACCORDION_DEFAULT = 'collection';

/**
 * Open one accordion group; close any other open group in the same frame
 * so CSS transitions run simultaneously (open + close).
 */
function openMenuAccordionGroup(group) {
  if (!group || !els.menuDropdown) return;
  if (group.classList.contains('is-open')) return;

  els.menuDropdown.querySelectorAll('.menu-accordion-group').forEach((g) => {
    const open = g === group;
    g.classList.toggle('is-open', open);
    const t = g.querySelector('.menu-accordion-trigger');
    if (t) t.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
}

/** Reset to Sort open (exclusive). */
function resetMenuAccordion() {
  if (!els.menuDropdown) return;
  els.menuDropdown.querySelectorAll('.menu-accordion-group').forEach((g) => {
    const open = g.dataset.menuGroup === MENU_ACCORDION_DEFAULT;
    g.classList.toggle('is-open', open);
    const t = g.querySelector('.menu-accordion-trigger');
    if (t) t.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
}

function syncSortMenuActive() {
  els.menuDropdown.querySelectorAll('[data-sort]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.sort === state.sortId);
  });
}

function setSort(id) {
  state.sortId = id;
  try {
    sessionStorage.setItem(CONFIG.SESSION_SORT_KEY, id);
  } catch {
    /* ignore */
  }
  recompute({ resetScroll: true });
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

async function getGithubTokenOrPrompt() {
  const token = getStoredGithubToken();
  if (!token) {
    await showAppAlert(
      'No GitHub API key stored. Open Menu → Configuration → Settings, enter your GitHub API key, and Save.',
      { title: 'GitHub API key' }
    );
    return '';
  }
  return token;
}

/**
 * Require a valid GITHUB_DATA_COMMITS_URL parse result.
 * @returns {Promise<typeof GITHUB_TARGET>}
 */
async function requireGithubTarget() {
  if (!GITHUB_TARGET) {
    await showAppAlert(
      'GitHub target is not configured or invalid.\n\n' +
        'In js/config.js set GITHUB_DATA_COMMITS_URL to your data file’s commits page, e.g.\n' +
        'https://github.com/YOUR_USER/YOUR_REPO/commits/main/data/media-index.json\n\n' +
        'See docs/README.md (Configure your fork).',
      { title: 'GitHub configuration' }
    );
    return null;
  }
  return GITHUB_TARGET;
}

/** Open GitHub commit history for the library data file in a new tab. */
async function openGithubDataCommitsView() {
  const target = await requireGithubTarget();
  if (!target) return;
  window.open(target.commitsUrl, '_blank', 'noopener,noreferrer');
}

/** Open GitHub Actions (deployments) in a new tab. */
async function openGithubDeploymentView() {
  const target = await requireGithubTarget();
  if (!target) return;
  window.open(target.deploymentUrl, '_blank', 'noopener,noreferrer');
}

/** Guard against double-clicks while a remote save is in flight. */
let saveJsonInFlight = false;

function openSaveProgressDialog() {
  if (!els.saveProgressBackdrop) return;
  if (els.saveProgressConsole) {
    els.saveProgressConsole.textContent = '';
  }
  resetDialogScroll(els.saveProgressBackdrop);
  els.saveProgressBackdrop.classList.remove('hidden');
  els.saveProgressBackdrop.setAttribute('aria-hidden', 'false');
  queueMicrotask(() => {
    resetDialogScroll(els.saveProgressBackdrop);
    els.saveProgressOk?.focus();
  });
}

function closeSaveProgressDialog() {
  if (!els.saveProgressBackdrop) return;
  els.saveProgressBackdrop.classList.add('hidden');
  els.saveProgressBackdrop.setAttribute('aria-hidden', 'true');
  focusFilterWhenIdle();
}

function isSaveProgressOpen() {
  return Boolean(
    els.saveProgressBackdrop && !els.saveProgressBackdrop.classList.contains('hidden')
  );
}

/** Append a timestamped line to the Save JSON progress console. */
function appendSaveLog(message) {
  const el = els.saveProgressConsole;
  if (!el) return;
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const ts = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const line = `[${ts}] ${message}`;
  el.textContent = el.textContent ? `${el.textContent}\n${line}` : line;
  el.scrollTop = el.scrollHeight;
}

async function copySaveProgressLog() {
  const btn = els.saveProgressCopy;
  const text = els.saveProgressConsole?.textContent || '';
  if (!text) {
    appendSaveLog('(nothing to copy yet)');
    return;
  }
  try {
    await copyTextToClipboard(text);
    flashCopyButton(btn, 'ok');
  } catch (err) {
    flashCopyButton(btn, 'fail');
    appendSaveLog(`Copy failed: ${err?.message || err}`);
  }
}

/**
 * Log every line of a multi-line commit-style message to the Save console
 * (full, untruncated change list for the operator).
 * @param {string} text
 */
function appendSaveLogMessage(text) {
  const lines = String(text || '').split('\n');
  for (const line of lines) {
    appendSaveLog(line === '' ? ' ' : line);
  }
}

/**
 * Upsert the full in-memory library to GitHub (Contents API).
 * Target owner/repo/path come from CONFIG.GITHUB_DATA_COMMITS_URL.
 * Progress is written to the Save progress dialog console.
 * Commit message lists movie changes (truncated); console shows the full list.
 */
async function saveJsonToGithub() {
  if (saveJsonInFlight) return;

  const token = await getGithubTokenOrPrompt();
  if (!token) return;

  const target = await requireGithubTarget();
  if (!target) return;

  const { owner, repo, path, branch } = target;

  saveJsonInFlight = true;
  if (els.saveJsonBtn) els.saveJsonBtn.disabled = true;
  openSaveProgressDialog();

  try {
    appendSaveLog('Starting GitHub save…');
    appendSaveLog(`Movies in library: ${state.movies.length}`);
    appendSaveLog(`From commits URL (branch ${branch} for history links)`);
    appendSaveLog(`Target: ${owner}/${repo}/${path}`);
    appendSaveLog('Serializing library JSON…');
    const content = JSON.stringify(state.movies, null, 2);
    const bytes = new TextEncoder().encode(content).length;
    appendSaveLog(`Payload: ${content.length} chars (~${bytes} bytes)`);

    appendSaveLog('Checking remote file…');
    const existing = await getFileContent({ token, owner, repo, path });

    /** @type {object[]} */
    let remoteMovies = [];
    let isCreate = false;

    if (existing.exists) {
      const shaShort = existing.sha ? `${existing.sha.slice(0, 7)}…` : '(unknown)';
      appendSaveLog(`Remote file exists (sha ${shaShort}).`);

      // Skip PUT when local payload matches the remote blob (no empty commit).
      if (existing.sha) {
        appendSaveLog('Comparing local payload to remote…');
        const localSha = await computeGitBlobSha(content);
        if (localSha === existing.sha) {
          appendSaveLog(
            `No changes detected (sha ${localSha.slice(0, 7)}… matches remote). Skipping commit.`
          );
          setDirty(false);
          appendSaveLog(`Done. ${owner}/${repo}/${path}`);
          return;
        }
        appendSaveLog(
          `Local differs from remote (local ${localSha.slice(0, 7)}… ≠ remote ${shaShort}).`
        );
      }

      const parsed = parseLibraryJson(existing.content);
      if (parsed == null) {
        appendSaveLog(
          'Warning: remote file is not a JSON array; treating remote as empty for the change summary.'
        );
        remoteMovies = [];
      } else {
        remoteMovies = parsed;
        appendSaveLog(`Remote library: ${remoteMovies.length} movie(s).`);
      }
    } else {
      isCreate = true;
      appendSaveLog('Remote file not found; will create.');
      remoteMovies = [];
    }

    const diff = diffLibraries(remoteMovies, state.movies);
    const fullMessage = formatLibraryCommitMessage(diff, {
      create: isCreate,
      maxPerSection: Infinity,
    });
    const commitMessage = formatLibraryCommitMessage(diff, {
      create: isCreate,
      // Truncate each of Added / Removed / Changed independently
      maxPerSection: 15,
    });

    appendSaveLog('Change summary (full):');
    appendSaveLogMessage(fullMessage);
    appendSaveLog('Commit message (truncated for GitHub):');
    appendSaveLogMessage(commitMessage);

    if (existing.exists) {
      appendSaveLog('Uploading update…');
      await putFileContent({
        token,
        owner,
        repo,
        path,
        content,
        sha: existing.sha,
        message: commitMessage,
      });
      appendSaveLog('File updated successfully.');
    } else {
      appendSaveLog('Uploading create…');
      await putFileContent({
        token,
        owner,
        repo,
        path,
        content,
        message: commitMessage,
      });
      appendSaveLog('File created successfully.');
    }

    setDirty(false);
    appendSaveLog(`Done. ${owner}/${repo}/${path}`);
  } catch (err) {
    const msg = err?.message || String(err);
    appendSaveLog(`ERROR: ${msg}`);
  } finally {
    saveJsonInFlight = false;
    if (els.saveJsonBtn) els.saveJsonBtn.disabled = false;
    appendSaveLog('Finished.');
  }
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
function resetDialogScroll(backdrop) {
  const body = backdrop?.querySelector?.('.dialog-body');
  if (body) body.scrollTop = 0;
}

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

function populateThemeSelect() {
  const sel = els.settingsTheme;
  if (!sel) return;
  const current = normalizeTheme(savedThemeId);
  sel.replaceChildren();
  for (const opt of THEME_OPTIONS) {
    const o = document.createElement('option');
    o.value = opt.id;
    o.textContent = opt.label;
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
  if (els.settingsLocationOverlay) {
    els.settingsLocationOverlay.checked = savedLocationOverlay;
  }
  grid.setLocationOverlay(savedLocationOverlay);
  savedThemeId = getStoredTheme();
  savedThemeColors = getStoredThemeColors();
  draftThemeColors = { ...savedThemeColors };
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
    draftThemeColors = { ...savedThemeColors };
    applyTheme(savedThemeId, savedThemeColors);
    if (els.settingsTheme) els.settingsTheme.value = normalizeTheme(savedThemeId);
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
      more.textContent = expanded ? 'Show less' : 'Show more';
      more.setAttribute(
        'aria-expanded',
        expanded ? 'true' : 'false'
      );
      more.setAttribute(
        'aria-label',
        expanded
          ? `Show top ${STATS_TOP_N} ${section.label.toLowerCase()}`
          : `Show all ${section.rows.length} ${section.label.toLowerCase()}`
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
  const scalePercent = applyPosterScaleFromSettingsControl({ preview: false });
  const gapPx = applyPosterGapFromSettingsControl({ preview: false });
  const backlightPercent = applyPosterBacklightFromSettingsControl({
    preview: false,
  });
  savedLocationOverlay = setStoredLocationOverlayEnabled(
    !!els.settingsLocationOverlay?.checked
  );
  grid.setLocationOverlay(savedLocationOverlay);
  const parts = [
    tmdbKey ? 'TMDB API key saved' : 'TMDB API key cleared',
    githubKey ? 'GitHub API key saved' : 'GitHub API key cleared',
    `language ${localeLabel}`,
    `poster size ${scalePercent}%`,
    `spacing ${gapPx}px`,
    `lighting ${backlightPercent}%`,
    `location overlay ${savedLocationOverlay ? 'on' : 'off'}`,
    `theme ${themeLabel} (${customNote})`,
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
    els.tmdbTitle?.focus();
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
    const posterHtml = img
      ? `<button type="button" class="tmdb-result-poster" style="background-image:url('${escapeHtml(img)}')" aria-label="Choose alternate poster for ${escapeHtml(m.title || 'movie')}"></button>`
      : `<button type="button" class="tmdb-result-poster tmdb-result-poster-empty" aria-label="Choose alternate poster for ${escapeHtml(m.title || 'movie')}"></button>`;
    const genres = Array.isArray(m.genres) ? m.genres.filter(Boolean) : [];
    const genrePills = genres.length
      ? `<div class="tmdb-result-genres">${genres
          .map((g) => `<span class="pill tmdb-genre-pill">${escapeHtml(g)}</span>`)
          .join('')}</div>`
      : '';
    row.innerHTML = `
      ${posterHtml}
      <div class="tmdb-result-body">
        <span class="tmdb-result-title">${escapeHtml(m.title || 'Untitled')}</span>
        <span class="tmdb-result-meta">Release ${escapeHtml(String(year))}</span>
        ${genrePills}
        <div class="tmdb-result-actions">
          <button type="button" class="btn tmdb-add-btn">Add to Collection</button>
          <a
            class="btn tmdb-open-btn"
            href="${escapeHtml(tmdbHref)}"
            target="_blank"
            rel="noopener noreferrer"
          >TMDB</a>
        </div>
      </div>
    `;
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
    // Add to Collection → add/override library using current result poster
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
      // Keep old keywords that TMDB no longer returns
      const incoming = Array.isArray(record.keywords) ? record.keywords : [];
      const seen = new Set(incoming.map((k) => String(k).toLowerCase()));
      const merged = incoming.slice();
      for (const k of preservedKeywords) {
        const key = String(k).toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(k);
        }
      }
      record.keywords = merged;
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
  text.textContent = leaf.not ? `NOT ${label}` : label;
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
    <button type="button" data-action="toggle">Toggle</button>
    <button type="button" data-action="remove">Remove</button>
    <button type="button" data-action="remove-others">Remove Others</button>
    <button type="button" data-action="remove-all">Remove All</button>
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
    btn.querySelector('span:last-child').textContent = notPrefix + item.value;
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
      '(Save / Data Changes / Deployments will not work until fixed — see docs/README.md)'
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
