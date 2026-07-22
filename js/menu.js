/**
 * Hamburger main menu: open/close, accordion section memory, sort active state.
 */

import {
  getStoredMenuAccordionGroup,
  setStoredMenuAccordionGroup,
} from './config.js';

/**
 * @param {{
 *   menuBtn: HTMLElement|null,
 *   menuDropdown: HTMLElement|null,
 *   getSortId: () => string,
 *   onSort: (id: string) => void,
 *   focusFilterWhenIdle: () => void,
 * }} opts
 */
export function initMenu(opts) {
  const { menuBtn, menuDropdown, getSortId, onSort, focusFilterWhenIdle } =
    opts;

  function toggleMenu() {
    if (!menuDropdown || !menuBtn) return;
    const open = menuDropdown.classList.toggle('open');
    menuDropdown.hidden = !open;
    menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      resetMenuAccordion();
      syncSortMenuActive();
    }
  }

  function closeMenu() {
    if (!menuDropdown || !menuBtn) return;
    menuDropdown.classList.remove('open');
    menuDropdown.hidden = true;
    menuBtn.setAttribute('aria-expanded', 'false');
    focusFilterWhenIdle();
  }

  /**
   * Open one accordion group; close any other open group in the same frame
   * so CSS transitions run simultaneously (open + close).
   * Remembers the section in localStorage for the next menu open.
   * @param {HTMLElement|null|undefined} group
   */
  function openMenuAccordionGroup(group) {
    if (!group || !menuDropdown) return;
    if (group.classList.contains('is-open')) return;

    menuDropdown.querySelectorAll('.menu-accordion-group').forEach((g) => {
      const open = g === group;
      g.classList.toggle('is-open', open);
      const t = g.querySelector('.menu-accordion-trigger');
      if (t) t.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    const id = group.dataset.menuGroup;
    if (id) setStoredMenuAccordionGroup(id);
  }

  /** Restore the last-opened accordion section (exclusive). */
  function resetMenuAccordion() {
    if (!menuDropdown) return;
    const target = getStoredMenuAccordionGroup();
    menuDropdown.querySelectorAll('.menu-accordion-group').forEach((g) => {
      const open = g.dataset.menuGroup === target;
      g.classList.toggle('is-open', open);
      const t = g.querySelector('.menu-accordion-trigger');
      if (t) t.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  function syncSortMenuActive() {
    if (!menuDropdown) return;
    const sortId = getSortId();
    menuDropdown.querySelectorAll('[data-sort]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.sort === sortId);
    });
  }

  menuBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMenu();
  });

  menuDropdown?.addEventListener('click', (e) => {
    const trigger = e.target.closest?.('.menu-accordion-trigger');
    if (trigger) {
      e.preventDefault();
      e.stopPropagation();
      const group = trigger.closest('.menu-accordion-group');
      if (group) openMenuAccordionGroup(group);
      return;
    }

    const btn = e.target.closest?.('button[data-sort]');
    if (btn) {
      onSort(btn.dataset.sort);
      closeMenu();
    }
  });

  return {
    toggleMenu,
    closeMenu,
    syncSortMenuActive,
    openMenuAccordionGroup,
    resetMenuAccordion,
  };
}
