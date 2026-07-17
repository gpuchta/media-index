import { CONFIG } from './config.js';
import { isAppAlertOpen, showAppConfirm } from './alert-dialog.js';
import { posterUrl, formatRuntime, escapeHtml } from './utils.js';

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
    btnDelete,
    btnTmdb,
    btnSave,
    btnCancel,
    onChange,
    onDelete,
    onSelectPoster,
  }) {
    this.backdrop = backdrop;
    this.body = body;
    this.btnClose = btnClose;
    this.btnDelete = btnDelete;
    this.btnTmdb = btnTmdb;
    this.btnSave = btnSave;
    this.btnCancel = btnCancel;
    this.onChange = onChange;
    this.onDelete = onDelete;
    this.onSelectPoster = onSelectPoster;

    /** @type {object|null} Live movie object in the collection */
    this.movie = null;
    /** Draft editable fields while the dialog is open */
    this.draft = null;
    this.returnFocus = null;
    this._keyHandler = (e) => this.onKey(e);

    this.btnSave.addEventListener('click', () => this.saveAndClose());
    this.btnCancel.addEventListener('click', () => this.discardAndClose());
    this.btnClose.addEventListener('click', () => this.discardAndClose());
    this.btnDelete.addEventListener('click', () => this.handleDelete());
    this.btnTmdb.addEventListener('click', () => this.openTmdb());

    this.backdrop.addEventListener('click', (e) => {
      if (e.target === this.backdrop) this.discardAndClose();
    });
  }

  open(movie, returnFocus) {
    this.movie = movie;
    this.draft = {
      location: movie.location ?? '',
      keywords: Array.isArray(movie.keywords) ? [...movie.keywords] : [],
      poster_path: movie.poster_path ?? '',
      posters: Array.isArray(movie.posters) ? [...movie.posters] : [],
    };
    this.returnFocus = returnFocus || document.activeElement;
    this.render();
    this.body.scrollTop = 0;
    this.backdrop.classList.remove('hidden');
    this.backdrop.setAttribute('aria-hidden', 'false');
    document.addEventListener('keydown', this._keyHandler);
    queueMicrotask(() => {
      this.body.scrollTop = 0;
      this.btnSave.focus();
    });
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
    document.removeEventListener('keydown', this._keyHandler);
    this.movie = null;
    this.draft = null;
    if (this.returnFocus && typeof this.returnFocus.focus === 'function') {
      this.returnFocus.focus();
    }
    this.returnFocus = null;
  }

  isOpen() {
    return !this.backdrop.classList.contains('hidden');
  }

  onKey(e) {
    if (e.key === 'Escape') {
      // App alert/confirm sits above the movie dialog
      if (isAppAlertOpen()) return;
      // Field-level Escape cancels in-place edit first
      if (e.target.matches('input') && e.target.closest('.pill.editing')) return;
      e.preventDefault();
      // Spec: Escape does the same as Save
      this.saveAndClose();
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
    this.close();
  }

  async handleDelete() {
    if (!this.movie) return;
    const ok = await showAppConfirm('Delete this movie?', {
      title: 'Delete movie',
      okLabel: 'Delete',
      cancelLabel: 'Cancel',
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

  commitOpenLocationEdit() {
    const btn = this.body.querySelector('[data-edit="location"].editing');
    if (!btn) return;
    const input = btn.querySelector('input');
    if (!input || !this.draft) return;
    const next = input.value.trim();
    if (next) this.draft.location = next;
    btn.classList.remove('editing');
    btn.textContent = this.draft.location || '—';
  }

  render() {
    const m = this.movie;
    const d = this.draft;
    if (!m || !d) {
      this.body.innerHTML = '';
      return;
    }

    const url = posterUrl(d.poster_path || m.poster_path);
    const avg = Number(m.vote_average) || 0;
    const pct = Math.max(0, Math.min(100, (avg / 10) * 100));

    this.btnTmdb.hidden = !m.tmdb_id;
    this.btnTmdb.disabled = !m.tmdb_id;

    this.body.innerHTML = `
      <div class="dialog-hero">
        <button
          type="button"
          class="dialog-poster${url ? '' : ' dialog-poster-empty'}"
          style="${url ? `background-image:url('${escapeHtml(url)}')` : ''}"
          aria-label="Choose alternate poster for ${escapeHtml(m.title || 'movie')}"
          id="dialog-poster-btn"
        ></button>
        <div class="dialog-overview-wrap">
          <h2 class="dialog-title" id="dialog-title">${escapeHtml(m.title || 'Untitled')}</h2>
          <p class="dialog-overview">${escapeHtml(m.overview || 'No description available.')}</p>
        </div>
      </div>
      <div class="dialog-fields">
        <div class="field-row">
          <span class="field-label">Runtime</span>
          <span class="pill">${escapeHtml(formatRuntime(m.runtime))}</span>
        </div>
        <div class="field-row">
          <span class="field-label">Vote</span>
          <span class="vote-bar" title="${avg.toFixed(1)} / 10 · ${m.vote_count ?? 0} votes">
            <span class="vote-track"><span class="vote-fill" style="width:${pct}%"></span></span>
            <span class="vote-num">${avg.toFixed(1)}</span>
          </span>
        </div>
        <div class="field-row" id="field-location">
          <span class="field-label">Location</span>
          <button type="button" class="pill editable" data-type="location" data-edit="location">${escapeHtml(d.location || '—')}</button>
        </div>
        <div class="field-row">
          <span class="field-label">Released</span>
          <span class="pill" data-type="year">${escapeHtml(m.released || m.year || '—')}</span>
        </div>
        ${this.pillsRow('Genre', m.genres, 'genre')}
        ${this.pillsRow('Director', m.directors, 'director')}
        ${this.pillsRow('Actors', m.actors, 'actor')}
        ${this.pillsRow('Production companies', m.production_companies, 'company')}
        ${this.pillsRow('Collection', m.collection, 'collection')}
        <div class="field-row" id="field-keywords">
          <span class="field-label">Keywords</span>
          <span id="keyword-pills"></span>
          <input
            type="text"
            class="keyword-add"
            id="keyword-add"
            placeholder="Add keyword…"
            aria-label="Add keyword"
          />
        </div>
        <div class="field-row field-row-json" id="field-json">
          <button
            type="button"
            class="field-label field-label-toggle"
            id="json-toggle"
            aria-expanded="false"
            aria-controls="json-panel"
          >
            <span>JSON</span>
            <span class="json-expand-icon" aria-hidden="true">▸</span>
          </button>
          <pre id="json-panel" class="json-panel" hidden></pre>
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

    const locBtn = this.body.querySelector('[data-edit="location"]');
    locBtn?.addEventListener('click', () => this.beginEditLocation(locBtn));

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
        jsonToggle.setAttribute('aria-expanded', 'true');
        if (jsonIcon) jsonIcon.textContent = '▾';
      } else {
        jsonPanel.hidden = true;
        jsonPanel.textContent = '';
        jsonToggle.setAttribute('aria-expanded', 'false');
        if (jsonIcon) jsonIcon.textContent = '▸';
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

  pillsRow(label, list, type) {
    const typeAttr = type ? ` data-type="${escapeHtml(type)}"` : '';
    const items = this.normalizeNameList(list);
    if (!items.length) {
      return `
        <div class="field-row">
          <span class="field-label">${escapeHtml(label)}</span>
          <span class="pill"${typeAttr}>—</span>
        </div>`;
    }
    const pills = items
      .map((v) => `<span class="pill"${typeAttr}>${escapeHtml(v)}</span>`)
      .join('');
    return `
      <div class="field-row">
        <span class="field-label">${escapeHtml(label)}</span>
        ${pills}
      </div>`;
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
    if (!this.draft) return;
    const prev = this.draft.location || '';
    const input = document.createElement('input');
    input.type = 'text';
    input.value = prev;
    input.setAttribute('aria-label', 'Location');
    btn.classList.add('editing');
    btn.replaceChildren(input);
    input.focus();
    input.select();

    const commit = () => {
      const next = input.value.trim();
      if (next) {
        this.draft.location = next;
      }
      // empty → keep previous draft value
      btn.classList.remove('editing');
      btn.textContent = this.draft.location || '—';
    };

    const cancel = () => {
      btn.classList.remove('editing');
      btn.textContent = prev || '—';
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        cancel();
      }
    });
    input.addEventListener('blur', () => {
      if (btn.classList.contains('editing')) commit();
    });
  }
}
