import { CONFIG } from './config.js';
import { isAppAlertOpen, showAppConfirm } from './alert-dialog.js';
import { attachPosterHotCorner, posterZoomUrl } from './poster-zoom.js';
import { t } from './i18n.js';
import {
  posterUrl,
  formatRuntime,
  escapeHtml,
  flashCopyButton,
  copyTextToClipboard,
  isPrimaryActionEnter,
} from './utils.js';

/**
 * Movie detail dialog with draft edits.
 * Save / Escape — commit draft to the movie (mark dirty if changed) and close.
 * Cancel / header × / backdrop click — discard draft and close.
 */
export class MovieDialog {
  constructor({
    backdrop,
    body,
    btnClose,
    btnPrev,
    btnNext,
    btnDelete,
    btnUpdateMeta,
    btnTmdb,
    btnSave,
    btnCancel,
    onChange,
    onDelete,
    onSelectPoster,
    /** Re-fetch TMDB metadata for the open movie (single confirm). */
    onUpdateMetadata,
    /** Apply a filter leaf from a dialog pill (genre/director/actor/collection). */
    onFilterPill,
    /** Whether a type+value is in the current search filters. */
    isFilterActive,
    /** @type {() => object[]} current visible list (filtered + sorted) */
    getMovieList,
  }) {
    this.backdrop = backdrop;
    this.body = body;
    this.btnClose = btnClose;
    this.btnPrev = btnPrev;
    this.btnNext = btnNext;
    this.btnDelete = btnDelete;
    this.btnUpdateMeta = btnUpdateMeta || null;
    this.btnTmdb = btnTmdb;
    this.btnSave = btnSave;
    this.btnCancel = btnCancel;
    this.onChange = onChange;
    this.onDelete = onDelete;
    this.onSelectPoster = onSelectPoster;
    this.onUpdateMetadata =
      typeof onUpdateMetadata === 'function' ? onUpdateMetadata : null;
    this.onFilterPill = onFilterPill;
    this.isFilterActive =
      typeof isFilterActive === 'function' ? isFilterActive : () => false;
    this.getMovieList = typeof getMovieList === 'function' ? getMovieList : () => [];

    /** @type {object|null} Live movie object in the collection */
    this.movie = null;
    /** Draft editable fields while the dialog is open */
    this.draft = null;
    this.returnFocus = null;
    /** True while a single-movie TMDB refresh is in flight */
    this._metaUpdating = false;
    this._keyHandler = (e) => this.onKey(e);

    this.btnSave.addEventListener('click', () => this.saveAndClose());
    this.btnCancel.addEventListener('click', () => this.discardAndClose());
    this.btnClose.addEventListener('click', () => this.discardAndClose());
    this.btnDelete.addEventListener('click', () => this.handleDelete());
    this.btnUpdateMeta?.addEventListener('click', () => this.handleUpdateMetadata());
    this.btnTmdb.addEventListener('click', () => this.openTmdb());
    this.btnPrev?.addEventListener('click', () => this.navigate(-1));
    this.btnNext?.addEventListener('click', () => this.navigate(1));

    this.backdrop.addEventListener('click', (e) => {
      if (e.target === this.backdrop) this.discardAndClose();
    });

    // Event delegation: location pill is replaced often (edit ↔ display).
    // Per-node listeners on the temporary button are easy to lose; body stays put.
    this.body.addEventListener('click', (e) => {
      if (this._metaUpdating) return;
      const btn = e.target.closest?.('button[data-edit="location"]');
      if (!btn || !this.body.contains(btn)) return;
      e.preventDefault();
      this.beginEditLocation(btn);
    });
  }

  open(movie, returnFocus) {
    const wasOpen = this.isOpen();
    this.movie = movie;
    this.draft = {
      location: movie.location ?? '',
      keywords: Array.isArray(movie.keywords) ? [...movie.keywords] : [],
      poster_path: movie.poster_path ?? '',
      posters: Array.isArray(movie.posters) ? [...movie.posters] : [],
    };
    if (returnFocus !== undefined) {
      this.returnFocus = returnFocus || document.activeElement;
    } else if (!wasOpen) {
      this.returnFocus = document.activeElement;
    }
    this.render();
    this.body.scrollTop = 0;
    if (!wasOpen) {
      this.backdrop.classList.remove('hidden');
      this.backdrop.setAttribute('aria-hidden', 'false');
      // Capture so Enter/Escape win over lower layers (e.g. Search Movies under us)
      document.addEventListener('keydown', this._keyHandler, true);
    }
    // Defer focus until after layout/stacking (e.g. opened above TMDB search)
    const focusAfterOpen = () => {
      this.body.scrollTop = 0;
      // Empty location → start editing so user can type a slot immediately
      const locEmpty = !String(this.draft?.location || '').trim();
      if (locEmpty) {
        const locBtn = this.body.querySelector('button[data-edit="location"]');
        if (locBtn) {
          this.beginEditLocation(locBtn);
          // beginEditLocation replaces the button — query the live input
          const input = this.body.querySelector(
            '.location-edit-wrap input, input[data-edit="location"]'
          );
          input?.focus({ preventScroll: true });
          input?.select();
          input
            ?.closest('.field-row')
            ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          return;
        }
      }
      if (!wasOpen) this.btnSave.focus();
    };
    queueMicrotask(() => {
      requestAnimationFrame(focusAfterOpen);
    });
  }

  /**
   * Commit draft to the current movie if needed, then open prev/next in the
   * current list (filtered + sorted). Wraps at both ends.
   * @param {-1|1} delta
   */
  navigate(delta) {
    if (!this.movie || !this.isOpen()) return;
    if (this._metaUpdating) return;
    if (isAppAlertOpen()) return;

    this.commitOpenLocationEdit();
    if (this.draftChanged()) {
      this.movie.location = this.draft.location;
      this.movie.keywords = [...this.draft.keywords];
      this.movie.poster_path = this.draft.poster_path ?? '';
      this.movie.posters = Array.isArray(this.draft.posters)
        ? [...this.draft.posters]
        : [];
      if (typeof this.onChange === 'function') this.onChange(this.movie);
    }

    const list = this.getMovieList() || [];
    const n = list.length;
    if (!n) return;

    let i = list.indexOf(this.movie);
    if (i < 0 && this.movie?.tmdb_id != null) {
      const tid = String(this.movie.tmdb_id);
      i = list.findIndex((m) => m && String(m.tmdb_id) === tid);
    }
    if (i < 0) i = 0;

    const nextIndex = (i + delta + n * 10) % n; // + n*10 avoids negative mod issues
    const next = list[nextIndex];
    if (!next || next === this.movie) {
      // Single-item list or same reference after wrap — still refresh draft state
      if (next === this.movie) {
        this.draft = {
          location: this.movie.location ?? '',
          keywords: Array.isArray(this.movie.keywords) ? [...this.movie.keywords] : [],
          poster_path: this.movie.poster_path ?? '',
          posters: Array.isArray(this.movie.posters) ? [...this.movie.posters] : [],
        };
        this.render();
        this.body.scrollTop = 0;
      }
      return;
    }
    this.open(next);
  }

  /** Current draft poster state for the open movie (or null). */
  getPosterDraft() {
    if (!this.draft) return null;
    return {
      poster_path: this.draft.poster_path ?? '',
      posters: Array.isArray(this.draft.posters) ? [...this.draft.posters] : [],
    };
  }

  /**
   * Apply poster pick to draft only (does not write the library or set dirty).
   * Collection is updated when the user Saves / Escape-saves the movie dialog.
   */
  applyPosterDraft(posterPath, posters) {
    if (!this.draft) return;
    this.draft.poster_path = posterPath ?? '';
    this.draft.posters = Array.isArray(posters) ? [...posters] : [];
    this.render();
  }

  close() {
    this.backdrop.classList.add('hidden');
    this.backdrop.setAttribute('aria-hidden', 'true');
    document.removeEventListener('keydown', this._keyHandler, true);
    this.movie = null;
    this.draft = null;
    // Do not focus returnFocus here for the filter field — app handles
    // desktop-only filter focus via pmi:modals-maybe-idle.
    // Only restore non-input return targets if needed later; clear for now.
    this.returnFocus = null;
    document.dispatchEvent(new CustomEvent('pmi:modals-maybe-idle'));
  }

  isOpen() {
    return !this.backdrop.classList.contains('hidden');
  }

  /** Layers that sit above the movie dialog and own keyboard first. */
  hasHigherModal() {
    if (isAppAlertOpen()) return true;
    const posterPick = document.getElementById('tmdb-poster-backdrop');
    if (posterPick && !posterPick.classList.contains('hidden')) return true;
    const zoom = document.getElementById('poster-zoom-backdrop');
    if (zoom && !zoom.classList.contains('hidden')) return true;
    return false;
  }

  onKey(e) {
    if (!this.isOpen()) return;
    // Defer to alert / poster picker / zoom (they also use capture)
    if (this.hasHigherModal()) return;

    // Block keyboard close/nav while a TMDB refresh is in flight
    if (this._metaUpdating) {
      if (
        e.key === 'Escape' ||
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight' ||
        isPrimaryActionEnter(e)
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }

    // Location / keyword fields own Enter & Escape while focused
    const fieldEdit = e.target?.closest?.(
      '.location-edit-wrap, input[data-edit="location"], #keyword-add, .keyword-add'
    );
    if (fieldEdit && (e.key === 'Enter' || e.key === 'Escape')) {
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      // Spec: Escape does the same as Save
      this.saveAndClose();
      return;
    }

    // Enter → Save when focus is not in a field/control that consumes Enter
    if (isPrimaryActionEnter(e)) {
      e.preventDefault();
      e.stopPropagation();
      this.saveAndClose();
      return;
    }

    // ← / → browse the current list (same as header prev/next)
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      // Don't steal arrows while typing in location / keyword fields
      const t = e.target;
      if (
        t &&
        (t.matches('input, textarea, select') || t.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      this.navigate(e.key === 'ArrowLeft' ? -1 : 1);
      return;
    }

    if (e.key === 'Tab') {
      this.trapFocus(e);
    }
  }

  trapFocus(e) {
    const focusables = this.backdrop.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const list = Array.from(focusables).filter(
      (el) => el.offsetParent !== null || el === document.activeElement
    );
    if (!list.length) return;
    const first = list[0];
    const last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  draftChanged() {
    if (!this.movie || !this.draft) return false;
    const origLoc = this.movie.location ?? '';
    const draftLoc = this.draft.location ?? '';
    if (origLoc !== draftLoc) return true;
    const origKw = Array.isArray(this.movie.keywords) ? this.movie.keywords : [];
    const draftKw = this.draft.keywords || [];
    if (origKw.length !== draftKw.length) return true;
    for (let i = 0; i < origKw.length; i += 1) {
      if (String(origKw[i]) !== String(draftKw[i])) return true;
    }
    const origPoster = this.movie.poster_path ?? '';
    const draftPoster = this.draft.poster_path ?? '';
    if (String(origPoster) !== String(draftPoster)) return true;
    const origPosters = Array.isArray(this.movie.posters) ? this.movie.posters : [];
    const draftPosters = Array.isArray(this.draft.posters) ? this.draft.posters : [];
    if (origPosters.length !== draftPosters.length) return true;
    for (let i = 0; i < origPosters.length; i += 1) {
      if (String(origPosters[i]) !== String(draftPosters[i])) return true;
    }
    return false;
  }

  /** Commit draft → movie; mark dirty only if something changed; close. */
  saveAndClose() {
    if (this._metaUpdating) return;
    if (!this.movie || !this.draft) {
      this.close();
      return;
    }
    // Commit any open location input first
    this.commitOpenLocationEdit();
    const changed = this.draftChanged();
    if (changed) {
      this.movie.location = this.draft.location;
      this.movie.keywords = [...this.draft.keywords];
      this.movie.poster_path = this.draft.poster_path ?? '';
      this.movie.posters = Array.isArray(this.draft.posters)
        ? [...this.draft.posters]
        : [];
      this.onChange(this.movie);
    }
    this.close();
  }

  /** Discard draft and close (header ×, Cancel, backdrop). */
  discardAndClose() {
    if (this._metaUpdating) return;
    this.close();
  }

  async handleDelete() {
    if (!this.movie || this._metaUpdating) return;
    const ok = await showAppConfirm(t('dialog.deleteConfirm'), {
      title: t('dialog.deleteTitle'),
      okLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
    });
    if (!ok) return;
    const m = this.movie;
    this.close();
    this.onDelete(m);
  }

  openTmdb() {
    if (!this.movie?.tmdb_id) return;
    const url = `${CONFIG.TMDB_MOVIE_BASE}${this.movie.tmdb_id}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  /**
   * Apply current draft location / keywords / poster onto the live movie so a
   * TMDB refresh can preserve unsaved local edits during merge.
   */
  applyDraftPreserveFieldsToMovie() {
    if (!this.movie || !this.draft) return;
    this.commitOpenLocationEdit();
    this.movie.location = this.draft.location ?? '';
    this.movie.keywords = Array.isArray(this.draft.keywords)
      ? [...this.draft.keywords]
      : [];
    this.movie.poster_path = this.draft.poster_path ?? '';
    this.movie.posters = Array.isArray(this.draft.posters)
      ? [...this.draft.posters]
      : [];
  }

  /**
   * Enable/disable footer controls while a single-movie metadata update runs.
   * @param {boolean} busy
   */
  setMetadataUpdateBusy(busy) {
    this._metaUpdating = !!busy;
    if (this.btnUpdateMeta) {
      this.btnUpdateMeta.disabled = busy || !this.movie?.tmdb_id;
      this.btnUpdateMeta.textContent = busy
        ? t('refresh.refreshingEllipsis')
        : t('dialog.update');
    }
    if (this.btnDelete) this.btnDelete.disabled = busy;
    if (this.btnTmdb) this.btnTmdb.disabled = busy || !this.movie?.tmdb_id;
    if (this.btnSave) this.btnSave.disabled = busy;
    if (this.btnCancel) this.btnCancel.disabled = busy;
    if (this.btnPrev) this.btnPrev.disabled = busy;
    if (this.btnNext) this.btnNext.disabled = busy;
    if (this.btnClose) this.btnClose.disabled = busy;
  }

  async handleUpdateMetadata() {
    if (!this.movie || this._metaUpdating) return;
    if (typeof this.onUpdateMetadata !== 'function') return;
    await this.onUpdateMetadata(this.movie);
  }

  /** @returns {HTMLButtonElement} */
  makeLocationButton() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pill editable';
    btn.dataset.type = 'location';
    btn.dataset.edit = 'location';
    btn.textContent = String(this.draft?.location || '').trim() || '—';
    return btn;
  }

  /**
   * End in-place location edit if open. Empty input keeps the previous draft value.
   * @param {{ commit?: boolean }} [opts] commit=false restores the value from when edit began
   */
  commitOpenLocationEdit({ commit = true } = {}) {
    const wrap = this.body?.querySelector(
      '.location-edit-wrap, [data-edit="location"].editing'
    );
    if (!wrap || !this.draft) return;
    const input = wrap.matches('input')
      ? wrap
      : wrap.querySelector('input');
    if (commit && input) {
      const next = input.value.trim();
      if (next) this.draft.location = next;
      // empty → keep previous draft value
    } else if (!commit && this._locationEditPrev != null) {
      this.draft.location = this._locationEditPrev;
    }
    this._locationEditPrev = null;
    if (this._locationEditSession) {
      this._locationEditSession.closed = true;
      this._locationEditSession = null;
    }
    wrap.replaceWith(this.makeLocationButton());
  }

  render() {
    const m = this.movie;
    const d = this.draft;
    if (!m || !d) {
      this.body.innerHTML = '';
      return;
    }

    const url = posterUrl(d.poster_path || m.poster_path);
    // TMDB vote_average is 0–10; bar fill uses avg/10 as percent width
    const avg = Math.max(0, Math.min(10, Number(m.vote_average) || 0));
    const pct = (avg / 10) * 100;
    const avgLabel = avg.toFixed(1);
    const voteCount = m.vote_count ?? 0;

    this.btnTmdb.hidden = !m.tmdb_id;
    this.btnTmdb.disabled = this._metaUpdating || !m.tmdb_id;
    if (this.btnUpdateMeta) {
      this.btnUpdateMeta.hidden = !m.tmdb_id;
      this.btnUpdateMeta.disabled = this._metaUpdating || !m.tmdb_id;
      if (!this._metaUpdating) this.btnUpdateMeta.textContent = t('dialog.update');
    }
    if (this.btnDelete) this.btnDelete.textContent = t('common.delete');
    if (this.btnCancel) this.btnCancel.textContent = t('common.cancel');
    if (this.btnSave) this.btnSave.textContent = t('common.save');
    if (this.btnTmdb) this.btnTmdb.textContent = t('dialog.tmdb');
    const headerTitle = document.getElementById('movie-dialog-title');
    if (headerTitle) headerTitle.textContent = t('dialog.movieDetails');

    const titleForAria = m.title || t('dialog.untitled');
    const voteAria = t('dialog.voteAria', { avg: avgLabel, count: voteCount });
    const voteTitle = t('dialog.voteTitle', { avg: avgLabel, count: voteCount });
    const voteLabel = t('dialog.voteLabel', {
      avg: avgLabel,
      count: String(voteCount),
    });

    this.body.innerHTML = `
      <div class="dialog-fields">
        <div class="field-row field-row-hero" id="field-hero">
          <div class="field-label field-label-poster">
            <button
              type="button"
              class="dialog-poster${url ? '' : ' dialog-poster-empty'}"
              style="${url ? `background-image:url('${escapeHtml(url)}')` : ''}"
              aria-label="${escapeHtml(t('dialog.choosePoster', { title: titleForAria }))}"
              id="dialog-poster-btn"
            ></button>
          </div>
          <div class="field-values field-values-hero">
            <h2 class="dialog-title">${escapeHtml(m.title || t('dialog.untitled'))}</h2>
            <p class="dialog-overview">${escapeHtml(m.overview || t('dialog.noDescription'))}</p>
          </div>
        </div>
        <div class="field-row">
          <span class="field-label">${escapeHtml(t('dialog.runtime'))}</span>
          <div class="field-values">
            <span class="pill">${escapeHtml(formatRuntime(m.runtime))}</span>
          </div>
        </div>
        <div class="field-row">
          <span class="field-label">${escapeHtml(t('dialog.vote'))}</span>
          <div class="field-values">
            <span
              class="vote-bar"
              role="img"
              aria-label="${escapeHtml(voteAria)}"
              title="${escapeHtml(voteTitle)}"
            >
              <span class="vote-track">
                <!-- Full red→green gradient = 0–10; gray covers score…10 -->
                <span class="vote-remainder" style="left:${pct}%"></span>
                <span class="vote-label-text">${escapeHtml(voteLabel)}</span>
              </span>
            </span>
          </div>
        </div>
        <div class="field-row" id="field-location">
          <span class="field-label">${escapeHtml(t('dialog.location'))}</span>
          <div class="field-values">
            <button type="button" class="pill editable" data-type="location" data-edit="location">${escapeHtml(d.location || '—')}</button>
          </div>
        </div>
        <div class="field-row">
          <span class="field-label">${escapeHtml(t('dialog.released'))}</span>
          <div class="field-values">
            <span class="pill" data-type="year">${escapeHtml(m.released || m.year || '—')}</span>
          </div>
        </div>
        ${this.pillsRow(t('dialog.genre'), m.genres, 'genre')}
        ${this.pillsRow(t('dialog.director'), m.directors, 'director')}
        ${this.pillsRow(t('dialog.cast'), m.actors, 'actor')}
        ${this.pillsRow(t('dialog.companies'), m.production_companies, 'company')}
        ${this.pillsRow(t('dialog.collection'), m.collection, 'collection')}
        <div class="field-row" id="field-keywords">
          <span class="field-label">${escapeHtml(t('dialog.keywords'))}</span>
          <div class="field-values field-values-keywords">
            <span id="keyword-pills"></span>
            <input
              type="text"
              class="keyword-add"
              id="keyword-add"
              placeholder="${escapeHtml(t('dialog.addKeyword'))}"
              aria-label="${escapeHtml(t('dialog.addKeyword'))}"
            />
          </div>
        </div>
        <div class="field-row field-row-json" id="field-json">
          <button
            type="button"
            class="field-label field-label-toggle"
            id="json-toggle"
            aria-expanded="false"
            aria-controls="json-panel"
          >
            <span>${escapeHtml(t('dialog.json'))}</span>
            <span class="json-expand-icon" aria-hidden="true">▸</span>
          </button>
          <div class="field-values field-values-json">
            <pre id="json-panel" class="json-panel" hidden></pre>
            <div class="json-actions" id="json-actions" hidden>
              <button type="button" class="btn" id="json-copy-btn">Copy</button>
            </div>
          </div>
        </div>
      </div>
    `;

    this.renderKeywords(d.keywords);

    const posterBtn = this.body.querySelector('#dialog-poster-btn');
    posterBtn?.addEventListener('click', () => {
      if (this.movie && typeof this.onSelectPoster === 'function') {
        this.onSelectPoster(this.movie);
      }
    });
    const zoomPath = d.poster_path || m.poster_path;
    if (posterBtn && zoomPath) {
      attachPosterHotCorner(
        posterBtn,
        () => posterZoomUrl(this.draft?.poster_path || this.movie?.poster_path),
        () => this.movie?.title || 'Poster'
      );
    }

    this.wireFilterPills();
    // Location pill clicks: delegated from constructor (survives edit ↔ display swaps)

    const kwAdd = this.body.querySelector('#keyword-add');
    kwAdd?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const v = kwAdd.value.trim();
        if (!v || !this.draft) return;
        const exists = this.draft.keywords.some(
          (k) => String(k).toLowerCase() === v.toLowerCase()
        );
        if (!exists) {
          this.draft.keywords.push(v);
          this.renderKeywords(this.draft.keywords);
        }
        kwAdd.value = '';
      }
    });

    const jsonToggle = this.body.querySelector('#json-toggle');
    const jsonPanel = this.body.querySelector('#json-panel');
    const jsonActions = this.body.querySelector('#json-actions');
    const jsonCopyBtn = this.body.querySelector('#json-copy-btn');
    const jsonIcon = jsonToggle?.querySelector('.json-expand-icon');
    jsonToggle?.addEventListener('click', () => {
      if (!jsonPanel || !this.movie) return;
      const open = jsonPanel.hidden;
      if (open) {
        // Snapshot includes draft location/keywords so open panel matches edit state
        const snapshot = {
          ...this.movie,
          location: this.draft?.location ?? this.movie.location,
          keywords: this.draft?.keywords ?? this.movie.keywords,
          poster_path: this.draft?.poster_path ?? this.movie.poster_path,
          posters: this.draft?.posters ?? this.movie.posters,
        };
        jsonPanel.textContent = JSON.stringify(snapshot, null, 2);
        jsonPanel.hidden = false;
        if (jsonActions) jsonActions.hidden = false;
        jsonToggle.setAttribute('aria-expanded', 'true');
        if (jsonIcon) jsonIcon.textContent = '▾';
        if (jsonCopyBtn) jsonCopyBtn.textContent = 'Copy';
      } else {
        jsonPanel.hidden = true;
        jsonPanel.textContent = '';
        if (jsonActions) jsonActions.hidden = true;
        jsonToggle.setAttribute('aria-expanded', 'false');
        if (jsonIcon) jsonIcon.textContent = '▸';
      }
    });

    jsonCopyBtn?.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const text = jsonPanel?.textContent || '';
      if (!text) return;
      try {
        await copyTextToClipboard(text);
        flashCopyButton(jsonCopyBtn, 'ok');
      } catch {
        flashCopyButton(jsonCopyBtn, 'fail');
      }
    });
  }

  /**
   * Normalize a string, string[], or { name }[] into display names.
   */
  normalizeNameList(list) {
    if (list == null || list === '') return [];
    if (typeof list === 'string') {
      const s = list.trim();
      return s ? [s] : [];
    }
    if (!Array.isArray(list)) return [];
    return list
      .map((item) => {
        if (item == null) return '';
        if (typeof item === 'string') return item.trim();
        if (typeof item === 'object' && item.name != null) return String(item.name).trim();
        return String(item).trim();
      })
      .filter(Boolean);
  }

  /** Types that can be added as search filters when the pill is clicked. */
  static FILTERABLE_PILL_TYPES = new Set([
    'genre',
    'director',
    'actor',
    'collection',
    'company',
  ]);

  pillsRow(label, list, type) {
    const typeAttr = type ? ` data-type="${escapeHtml(type)}"` : '';
    const filterable = type && MovieDialog.FILTERABLE_PILL_TYPES.has(type);
    const items = this.normalizeNameList(list);
    if (!items.length) {
      return `
        <div class="field-row">
          <span class="field-label">${escapeHtml(label)}</span>
          <div class="field-values">
            <span class="pill"${typeAttr}>—</span>
          </div>
        </div>`;
    }
    const pills = items
      .map((v) => {
        if (filterable) {
          const active = this.isFilterActive(type, v);
          const activeCls = active ? ' is-filter-active' : '';
          const pressed = active ? 'true' : 'false';
          return `<button type="button" class="pill pill-filter${activeCls}" data-type="${escapeHtml(type)}" data-filter-value="${escapeHtml(v)}" aria-pressed="${pressed}" title="Filter by ${escapeHtml(type)}: ${escapeHtml(v)}">${escapeHtml(v)}</button>`;
        }
        return `<span class="pill"${typeAttr}>${escapeHtml(v)}</span>`;
      })
      .join('');
    return `
      <div class="field-row">
        <span class="field-label">${escapeHtml(label)}</span>
        <div class="field-values">${pills}</div>
      </div>`;
  }

  /** Update solid active style on filter pills to match current leaves. */
  syncFilterPillActiveState() {
    if (!this.body) return;
    this.body.querySelectorAll('button.pill-filter').forEach((btn) => {
      const on = this.isFilterActive(btn.dataset.type, btn.dataset.filterValue);
      btn.classList.toggle('is-filter-active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  wireFilterPills() {
    this.syncFilterPillActiveState();
    if (typeof this.onFilterPill !== 'function') return;
    this.body.querySelectorAll('button.pill-filter').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const type = btn.dataset.type;
        const value = btn.dataset.filterValue;
        if (!type || value == null || value === '') return;
        this.onFilterPill({ type, value, not: false });
        this.syncFilterPillActiveState();
      });
    });
  }

  renderKeywords(keywords) {
    const host = this.body.querySelector('#keyword-pills');
    if (!host) return;
    host.innerHTML = '';
    for (const kw of keywords) {
      const pill = document.createElement('span');
      pill.className = 'pill';
      pill.dataset.type = 'keyword';
      pill.appendChild(document.createTextNode(kw));
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'x';
      x.setAttribute('aria-label', `Remove keyword ${kw}`);
      x.textContent = '×';
      x.addEventListener('click', () => {
        if (!this.draft) return;
        this.draft.keywords = this.draft.keywords.filter((k) => k !== kw);
        this.renderKeywords(this.draft.keywords);
      });
      pill.appendChild(x);
      host.appendChild(pill);
    }
  }

  beginEditLocation(btn) {
    if (!this.draft || this._metaUpdating) return;

    // Already editing — focus the live input (or repair a broken wrap)
    const openWrap = this.body.querySelector('.location-edit-wrap');
    if (openWrap) {
      const existing = openWrap.querySelector('input');
      if (existing) {
        existing.focus();
        existing.select();
        return;
      }
      // Wrap without input (stuck state) → restore a clickable pill, then re-enter
      openWrap.replaceWith(this.makeLocationButton());
    }

    const target =
      btn &&
      btn.isConnected &&
      btn.matches?.('button[data-edit="location"]')
        ? btn
        : this.body.querySelector('button[data-edit="location"]');
    if (!target) return;

    const prev = this.draft.location || '';
    this._locationEditPrev = prev;

    const input = document.createElement('input');
    input.type = 'text';
    input.value = prev;
    input.className = 'pill location-edit-input';
    input.setAttribute('aria-label', 'Location');
    input.dataset.type = 'location';
    input.dataset.edit = 'location';

    // Do not nest <input> inside <button> (invalid HTML): Space would activate
    // the button and exit edit mode instead of inserting a space character.
    const wrap = document.createElement('span');
    wrap.className = 'pill editable editing location-edit-wrap';
    wrap.dataset.type = 'location';
    wrap.dataset.edit = 'location';
    wrap.appendChild(input);
    target.replaceWith(wrap);
    input.focus();
    input.select();

    /** @type {{ closed: boolean }} */
    const session = { closed: false };
    this._locationEditSession = session;

    const end = (mode) => {
      if (session.closed) return;
      session.closed = true;
      if (this._locationEditSession === session) {
        this._locationEditSession = null;
      }
      if (!wrap.isConnected) return;
      if (mode === 'cancel') {
        this.draft.location = prev;
        this._locationEditPrev = null;
        wrap.replaceWith(this.makeLocationButton());
        return;
      }
      // commit — empty keeps previous draft value
      const next = input.value.trim();
      if (next) this.draft.location = next;
      this._locationEditPrev = null;
      wrap.replaceWith(this.makeLocationButton());
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        end('commit');
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        end('cancel');
      }
    });
    input.addEventListener('blur', () => {
      // Defer so a click on another control can run first; still commit the value
      queueMicrotask(() => {
        if (!session.closed && wrap.isConnected) end('commit');
      });
    });
  }
}
