/**
 * Statistics dialog: facet chips that set filters on the library.
 */

import { addLeaf } from './filters.js';
import { isAppAlertOpen } from './alert-dialog.js';
import { t } from './i18n.js';
import { resetDialogScroll } from './progress-console.js';
import { isPrimaryActionEnter } from './utils.js';
import { buildLibraryStats, statsSectionTitle } from './stats.js';

const STATS_TOP_N = 10;
const STATS_SECTION_ORDER = [
  'directors',
  'actors',
  'genres',
  'collections',
  'companies',
];

/**
 * @param {{
 *   els: {
 *     statsBtn: HTMLElement|null,
 *     statsBackdrop: HTMLElement|null,
 *     statsBody: HTMLElement|null,
 *     statsClose: HTMLElement|null,
 *     statsCloseFooter: HTMLElement|null,
 *   },
 *   closeMenu: () => void,
 *   focusFilterWhenIdle: () => void,
 *   getMovies: () => object[],
 *   getLeaves: () => object[],
 *   setLeaves: (leaves: object[]) => void,
 *   recompute: (opts?: { resetScroll?: boolean }) => void,
 * }} opts
 */
export function initStatsUi(opts) {
  const {
    els,
    closeMenu,
    focusFilterWhenIdle,
    getMovies,
    getLeaves,
    setLeaves,
    recompute,
  } = opts;

  /** @type {Record<string, boolean>} section key → expanded to show all */
  const statsSectionExpanded = Object.create(null);

  function openStatsDialog() {
    if (!els.statsBackdrop || !els.statsBody) return;
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
    return getLeaves().some(
      (l) => l.type === type && String(l.value).toLowerCase() === valLc
    );
  }

  function renderStatsBody() {
    const host = els.statsBody;
    if (!host) return;
    const movies = getMovies();
    const stats = buildLibraryStats(movies);
    host.innerHTML = '';

    if (!movies.length) {
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

      const chipGrid = document.createElement('div');
      chipGrid.className = 'stats-chip-grid';
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
          if (isFilterLeafActive(section.filterType, row.name)) {
            const valLc = String(row.name).toLowerCase();
            setLeaves(
              getLeaves().filter(
                (l) =>
                  !(
                    l.type === section.filterType &&
                    String(l.value).toLowerCase() === valLc
                  )
              )
            );
          } else {
            setLeaves(
              addLeaf([], {
                type: section.filterType,
                value: row.name,
                not: false,
              })
            );
          }
          recompute({ resetScroll: true });
          renderStatsBody();
        });
        chipGrid.appendChild(btn);
      }
      wrap.appendChild(chipGrid);

      if (section.rows.length > STATS_TOP_N) {
        const more = document.createElement('button');
        more.type = 'button';
        more.className = 'stats-show-more';
        more.textContent = expanded ? t('stats.showLess') : t('stats.showMore');
        more.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        more.setAttribute(
          'aria-label',
          expanded ? t('stats.showLess') : t('stats.showMore')
        );
        more.addEventListener('click', () => {
          statsSectionExpanded[key] = !expanded;
          renderStatsBody();
          const el = els.statsBody?.querySelector(
            `[data-stats-section="${key}"]`
          );
          el?.scrollIntoView({ block: 'nearest' });
        });
        wrap.appendChild(more);
      }

      host.appendChild(wrap);
    }
  }

  els.statsBtn?.addEventListener('click', () => {
    closeMenu();
    openStatsDialog();
  });
  els.statsClose?.addEventListener('click', () => closeStatsDialog());
  els.statsCloseFooter?.addEventListener('click', () => closeStatsDialog());
  els.statsBackdrop?.addEventListener('click', (e) => {
    if (e.target === els.statsBackdrop) closeStatsDialog();
  });

  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Escape') return;
      if (isAppAlertOpen()) return;
      if (!els.statsBackdrop || els.statsBackdrop.classList.contains('hidden'))
        return;
      e.preventDefault();
      e.stopPropagation();
      closeStatsDialog();
    },
    true
  );

  document.addEventListener(
    'keydown',
    (e) => {
      if (!isPrimaryActionEnter(e)) return;
      if (isAppAlertOpen()) return;
      if (!els.statsBackdrop || els.statsBackdrop.classList.contains('hidden'))
        return;
      e.preventDefault();
      e.stopPropagation();
      closeStatsDialog();
    },
    true
  );

  return {
    openStatsDialog,
    closeStatsDialog,
    isStatsOpen: () =>
      Boolean(
        els.statsBackdrop && !els.statsBackdrop.classList.contains('hidden')
      ),
  };
}
