/**
 * TMDB search dialog, poster picker, and add-to-collection flow.
 */

import { CONFIG } from './config.js';
import {
  getMovieById,
  getStoredTmdbApiKey,
  mergeKeywords,
  searchMoviesByTitleAndYear,
  toLibraryMovie,
} from './tmdb.js';
import { isAppAlertOpen, showAppAlert, showAppConfirm } from './alert-dialog.js';
import { showAppToast } from './app-toast.js';
import { attachPosterHotCorner, isPosterZoomOpen, posterZoomUrl } from './poster-zoom.js';
import { resetDialogScroll } from './progress-console.js';
import {
  escapeHtml,
  isPrimaryActionEnter,
  mergePosterLists,
  posterUrl,
  promotePosterSelection,
} from './utils.js';
import { t } from './i18n.js';

/**
 * @param {{
 *   els: Record<string, any>,
 *   closeMenu: () => void,
 *   focusFilterWhenIdle: () => void,
 *   focusTmdbSearchTitle: (opts?: { selectAll?: boolean }) => void,
 *   isAnyModalOpen: () => boolean,
 *   getMovies: () => object[],
 *   isDataReady: () => boolean,
 *   setDirty: (v: boolean) => void,
 *   refreshLibraryAfterMutation: () => void,
 *   dialog: any,
 *   isMetaRefreshOpen: () => boolean,
 *   isSaveProgressOpen: () => boolean,
 * }} opts
 */
export function initTmdbSearchUi(opts) {
  const {
    els,
    closeMenu,
    focusFilterWhenIdle,
    focusTmdbSearchTitle,
    isAnyModalOpen,
    getMovies,
    isDataReady,
    setDirty,
    refreshLibraryAfterMutation,
    dialog,
    isMetaRefreshOpen,
    isSaveProgressOpen,
  } = opts;

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
    return getMovies().find((m) => String(m.tmdb_id) === id) || null;
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

      const existing = getMovies().find(
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
        const i = getMovies().indexOf(existing);
        if (i >= 0) getMovies().splice(i, 1);
      }

      const record = toLibraryMovie(detail, { posterPath });
      // Keep local location when overriding an existing library entry
      if (existing) {
        record.location = preservedLocation;
        // Keep old keywords that TMDB no longer returns (merge, no duplicates)
        record.keywords = mergeKeywords(preservedKeywords, record.keywords);
      }
      getMovies().push(record);
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


  function isTmdbSearchOpen() {
    return Boolean(els.tmdbBackdrop && !els.tmdbBackdrop.classList.contains('hidden'));
  }

  els.tmdbSearchBtn?.addEventListener('click', () => {
    closeMenu();
    openTmdbSearchDialog();
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

  els.tmdbPosterClose?.addEventListener('click', () => closeTmdbPosterDialog());
  els.tmdbPosterCancel?.addEventListener('click', () => closeTmdbPosterDialog());
  els.tmdbPosterSave?.addEventListener('click', () => saveTmdbPosterSelection());
  els.tmdbPosterBackdrop?.addEventListener('click', (e) => {
    if (e.target === els.tmdbPosterBackdrop) closeTmdbPosterDialog();
  });

  // Escape closes Search Movies when it is the top layer
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Escape') return;
      if (isAppAlertOpen()) return;
      if (!els.tmdbBackdrop || els.tmdbBackdrop.classList.contains('hidden')) return;
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

  // Escape closes poster picker
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Escape') return;
      if (isAppAlertOpen()) return;
      if (!els.tmdbPosterBackdrop || els.tmdbPosterBackdrop.classList.contains('hidden')) return;
      e.preventDefault();
      e.stopPropagation();
      closeTmdbPosterDialog();
    },
    true
  );

  // Enter → Save poster selection when focus is not on a field/control
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

  // Ctrl+K / ⌘K — open Search Movies
  document.addEventListener(
    'keydown',
    (e) => {
      const isK = e.key === 'k' || e.key === 'K' || e.code === 'KeyK';
      if (!isK || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
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

  return {
    isTmdbSearchOpen,
    openTmdbSearchDialog,
    closeTmdbSearchDialog,
    refreshTmdbResultLibraryMarkers,
    openLibraryPosterPicker,
  };
}
