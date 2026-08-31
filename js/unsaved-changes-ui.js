/**
 * Menu → Save → Unsaved Changes: fetch GitHub library, show local-vs-remote diff.
 */

import { isAppAlertOpen } from './alert-dialog.js';
import {
  buildLibraryDiff,
  getGithubTokenOrPrompt,
  requireGithubTarget,
} from './github-save.js';
import { formatLibraryDiffSubject, movieKey } from './library-diff.js';
import { t } from './i18n.js';
import { resetDialogScroll } from './progress-console.js';
import { isPrimaryActionEnter } from './utils.js';

/**
 * @param {{
 *   els: {
 *     unsavedBtn: HTMLElement|null,
 *     unsavedBackdrop: HTMLElement|null,
 *     unsavedTitle: HTMLElement|null,
 *     unsavedBody: HTMLElement|null,
 *     unsavedClose: HTMLElement|null,
 *     unsavedCloseFooter: HTMLElement|null,
 *   },
 *   closeMenu: () => void,
 *   focusFilterWhenIdle: () => void,
 *   getMovies: () => object[],
 *   dialog: { open: Function, isOpen: Function, openPreview?: Function },
 *   isMovieDialogOpen: () => boolean,
 * }} opts
 */
export function initUnsavedChangesUi(opts) {
  const {
    els,
    closeMenu,
    focusFilterWhenIdle,
    getMovies,
    dialog,
    isMovieDialogOpen,
  } = opts;

  let inFlight = false;
  let fetchGen = 0;

  function isOpen() {
    return Boolean(
      els.unsavedBackdrop && !els.unsavedBackdrop.classList.contains('hidden')
    );
  }

  function setBusy(busy) {
    inFlight = !!busy;
    if (els.unsavedBtn) els.unsavedBtn.disabled = busy;
  }

  function openShell() {
    const backdrop = els.unsavedBackdrop;
    if (!backdrop) return;
    if (els.unsavedTitle) els.unsavedTitle.textContent = t('unsaved.title');
    if (els.unsavedCloseFooter) {
      els.unsavedCloseFooter.textContent = t('common.close');
    }
    backdrop.classList.remove('hidden');
    backdrop.setAttribute('aria-hidden', 'false');
    resetDialogScroll(backdrop);
  }

  function closeDialog() {
    fetchGen += 1;
    inFlight = false;
    setBusy(false);
    const backdrop = els.unsavedBackdrop;
    if (!backdrop) return;
    backdrop.classList.add('hidden');
    backdrop.setAttribute('aria-hidden', 'true');
    if (els.unsavedBody) els.unsavedBody.innerHTML = '';
    document.dispatchEvent(new CustomEvent('pmi:modals-maybe-idle'));
    focusFilterWhenIdle();
  }

  function showStatus(text, { error = false } = {}) {
    const body = els.unsavedBody;
    if (!body) return;
    body.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'unsaved-status' + (error ? ' is-error' : '');
    p.setAttribute('role', 'status');
    p.textContent = text;
    body.appendChild(p);
  }

  /**
   * Prefer the live library object so movie-dialog edits persist.
   * @param {string} key
   * @param {object|null|undefined} fallback
   */
  function resolveLiveMovie(key, fallback) {
    const movies = getMovies() || [];
    const live = movies.find((m) => movieKey(m) === key);
    return live || fallback || null;
  }

  function openMovieFromDiff(entry, { preview = false } = {}) {
    if (!entry) return;
    const fallback = entry.after || entry.movie || entry.before || null;
    const movie = preview
      ? fallback
      : resolveLiveMovie(entry.key, fallback);
    if (!movie || typeof dialog?.open !== 'function') return;
    if (preview && typeof dialog.openPreview === 'function') {
      dialog.openPreview(movie);
    } else {
      dialog.open(movie);
    }
  }

  function titleButton(entry, { preview = false } = {}) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'unsaved-title-btn';
    btn.textContent = entry.label;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openMovieFromDiff(entry, { preview });
    });
    return btn;
  }

  function appendSection(host, heading, entries, { preview = false, fields = false } = {}) {
    if (!entries.length) return;
    const section = document.createElement('section');
    section.className = 'unsaved-section';
    const h = document.createElement('h3');
    h.className = 'unsaved-heading';
    h.textContent = heading;
    section.appendChild(h);
    const ul = document.createElement('ul');
    ul.className = 'unsaved-list';
    for (const entry of entries) {
      const li = document.createElement('li');
      li.className = 'unsaved-item';
      li.appendChild(titleButton(entry, { preview }));
      if (fields && entry.fields?.length) {
        const meta = document.createElement('span');
        meta.className = 'unsaved-fields';
        meta.textContent = entry.fields.join(', ');
        li.appendChild(meta);
      }
      ul.appendChild(li);
    }
    section.appendChild(ul);
    host.appendChild(section);
  }

  function renderDiff(result) {
    const body = els.unsavedBody;
    if (!body) return;
    body.innerHTML = '';

    const summary = document.createElement('p');
    summary.className = 'unsaved-summary';
    summary.textContent = formatLibraryDiffSubject(result.diff, {
      create: result.isCreate,
    });
    body.appendChild(summary);

    if (result.identicalSha || result.diff.totalTouched === 0) {
      const empty = document.createElement('p');
      empty.className = 'unsaved-status';
      empty.textContent = t('unsaved.none');
      body.appendChild(empty);
      return;
    }

    appendSection(body, t('unsaved.added'), result.diff.added, {
      preview: false,
    });
    appendSection(body, t('unsaved.removed'), result.diff.removed, {
      preview: true,
    });
    appendSection(body, t('unsaved.changed'), result.diff.changed, {
      preview: false,
      fields: true,
    });
  }

  async function startUnsavedChanges() {
    if (inFlight) return;
    closeMenu();

    const token = await getGithubTokenOrPrompt();
    if (!token) return;
    const target = await requireGithubTarget();
    if (!target) return;

    openShell();
    showStatus(t('unsaved.loading'));
    const myGen = ++fetchGen;
    setBusy(true);
    try {
      const result = await buildLibraryDiff({
        token,
        target,
        movies: getMovies() || [],
      });
      if (myGen !== fetchGen) return;
      renderDiff(result);
    } catch (err) {
      if (myGen !== fetchGen) return;
      const msg = err instanceof Error ? err.message : String(err);
      showStatus(msg || t('unsaved.error'), { error: true });
    } finally {
      if (myGen === fetchGen) setBusy(false);
    }
  }

  els.unsavedBtn?.addEventListener('click', () => {
    void startUnsavedChanges();
  });
  els.unsavedClose?.addEventListener('click', () => closeDialog());
  els.unsavedCloseFooter?.addEventListener('click', () => closeDialog());
  els.unsavedBackdrop?.addEventListener('click', (e) => {
    if (e.target === els.unsavedBackdrop) closeDialog();
  });

  document.addEventListener(
    'keydown',
    (e) => {
      if (!isOpen()) return;
      if (isAppAlertOpen()) return;
      if (typeof isMovieDialogOpen === 'function' && isMovieDialogOpen()) return;
      if (dialog?.isOpen?.()) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeDialog();
        return;
      }
      if (isPrimaryActionEnter(e) && e.target === els.unsavedCloseFooter) {
        e.preventDefault();
        closeDialog();
      }
    },
    true
  );

  return {
    isUnsavedChangesOpen: isOpen,
    closeUnsavedChanges: closeDialog,
  };
}
