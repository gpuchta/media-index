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
} from './filters.js';
import { clearHash, hashToLeaves, writeHash } from './hash.js';
import { PosterGrid } from './grid.js';
import { MovieDialog } from './dialog.js';
import {
  downloadJson,
  formatExportFilename,
  escapeHtml,
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
import { isAppAlertOpen, showAppAlert, showAppConfirm } from './alert-dialog.js';

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
  settingsBtn: document.getElementById('settings-btn'),
  settingsBackdrop: document.getElementById('settings-backdrop'),
  settingsForm: document.getElementById('settings-form'),
  settingsApiKey: document.getElementById('settings-tmdb-api-key'),
  settingsGithubApiKey: document.getElementById('settings-github-api-key'),
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

const grid = new PosterGrid({
  main: els.main,
  spacer: els.spacer,
  windowEl: els.windowEl,
  onSelect: (movie, el) => dialog.open(movie, el),
});

const dialog = new MovieDialog({
  backdrop: els.backdrop,
  body: els.dialogBody,
  btnClose: els.dialogClose,
  btnDelete: els.dialogDelete,
  btnTmdb: els.dialogTmdb,
  btnSave: els.dialogSave,
  btnCancel: els.dialogCancel,
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

els.settingsBtn?.addEventListener('click', () => {
  closeMenu();
  openSettingsDialog();
});

els.settingsClose?.addEventListener('click', () => closeSettingsDialog());
els.settingsCancel?.addEventListener('click', () => closeSettingsDialog());
els.settingsBackdrop?.addEventListener('click', (e) => {
  if (e.target === els.settingsBackdrop) closeSettingsDialog();
});
els.settingsForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  saveSettings();
});

els.tmdbClose?.addEventListener('click', () => closeTmdbSearchDialog());
els.tmdbCancel?.addEventListener('click', () => closeTmdbSearchDialog());
els.tmdbBackdrop?.addEventListener('click', (e) => {
  if (e.target === els.tmdbBackdrop) closeTmdbSearchDialog();
});

els.tmdbForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  await runTmdbSearch();
});

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
    e.preventDefault();
    e.stopPropagation();
    closeSettingsDialog();
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
  const text = els.saveProgressConsole?.textContent || '';
  if (!text) {
    appendSaveLog('(nothing to copy yet)');
    return;
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    appendSaveLog('Console output copied to clipboard.');
  } catch (err) {
    appendSaveLog(`Copy failed: ${err?.message || err}`);
  }
}

/**
 * Upsert the full in-memory library to GitHub (Contents API).
 * Target owner/repo/path come from CONFIG.GITHUB_DATA_COMMITS_URL.
 * Progress is written to the Save progress dialog console.
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

      appendSaveLog('Uploading update…');
      await putFileContent({
        token,
        owner,
        repo,
        path,
        content,
        sha: existing.sha,
        message: `Update ${path}`,
      });
      appendSaveLog('File updated successfully.');
    } else {
      appendSaveLog('Remote file not found; creating…');
      await putFileContent({
        token,
        owner,
        repo,
        path,
        content,
        message: `Create ${path}`,
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

function openSettingsDialog() {
  if (!els.settingsBackdrop) return;
  if (els.settingsApiKey) {
    els.settingsApiKey.value = getStoredTmdbApiKey();
  }
  if (els.settingsGithubApiKey) {
    els.settingsGithubApiKey.value = getStoredGithubToken();
  }
  setSettingsStatus('');
  resetDialogScroll(els.settingsBackdrop);
  els.settingsBackdrop.classList.remove('hidden');
  els.settingsBackdrop.setAttribute('aria-hidden', 'false');
  queueMicrotask(() => {
    resetDialogScroll(els.settingsBackdrop);
    els.settingsApiKey?.focus();
  });
}

function closeSettingsDialog() {
  if (!els.settingsBackdrop) return;
  els.settingsBackdrop.classList.add('hidden');
  els.settingsBackdrop.setAttribute('aria-hidden', 'true');
  setSettingsStatus('');
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
  const parts = [
    tmdbKey ? 'TMDB API key saved' : 'TMDB API key cleared',
    githubKey ? 'GitHub API key saved' : 'GitHub API key cleared',
  ];
  setSettingsStatus(`${parts.join('. ')}.`);
  // Brief confirmation then close
  window.setTimeout(() => closeSettingsDialog(), 400);
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
    row.querySelector('.tmdb-result-poster')?.addEventListener('click', () => {
      openTmdbPosterPicker(m);
    });
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
        { title: 'Replace movie', okLabel: 'Replace', cancelLabel: 'Cancel' }
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
  // No filters: total only. With filters: "matched of total".
  els.movieCount.textContent = state.leaves.length
    ? `${shown} of ${total}`
    : String(total);
  renderActiveFilters();
  grid.setMovies(state.filtered, { resetScroll, preserveAnchor: !resetScroll });

  const empty = state.movies.length > 0 && state.filtered.length === 0;
  const newInstall = state.dataReady && state.movies.length === 0;
  els.statusEmpty.classList.toggle('hidden', !empty);
  els.statusNewInstall?.classList.toggle('hidden', !newInstall);

  if (!fromHash && !state.suppressHashWrite) {
    writeHash(state.leaves);
  }
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
    els.movieCount.textContent = '0';
  }
}

loadData();
