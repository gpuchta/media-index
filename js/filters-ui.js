/**
 * Filter chips, typeahead, and URL hash sync for the library grid.
 */

import { FILTER_TYPE_LABELS } from './config.js';
import {
  addLeaf,
  applyFilters,
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
import { t } from './i18n.js';

/**
 * @param {{
 *   els: Record<string, any>,
 *   state: {
 *     movies: object[],
 *     filtered: object[],
 *     leaves: object[],
 *     sortId: string,
 *     typeaheadIndex: any,
 *     typeaheadItems: any[],
 *     typeaheadActive: number,
 *     suppressHashWrite: boolean,
 *     dataReady: boolean,
 *   },
 *   grid: { setMovies: Function },
 *   dialog: { isOpen: Function, syncFilterPillActiveState: Function },
 * }} opts
 */
export function initFiltersUi(opts) {
  const { els, state, grid, dialog } = opts;

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


  return {
    recompute,
    renderActiveFilters,
    applyLeaf,
    toggleFilterLeaf,
    closeAllChipMenus,
    closeTypeahead,
    loadFiltersFromHash,
    refreshTypeahead,
  };
}
