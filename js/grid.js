import { CONFIG } from './config.js';
import { attachPosterHotCorner, posterZoomUrl } from './poster-zoom.js';
import { posterUrl } from './utils.js';

/**
 * Sliding-window virtualized poster grid.
 * Only cells near the viewport are in the DOM.
 */
export class PosterGrid {
  constructor(opts) {
    this.main = opts.main;
    this.spacer = opts.spacer;
    this.windowEl = opts.windowEl;
    this.onSelect = opts.onSelect;

    this.movies = [];
    this.cols = 1;
    /** Multiplier over CONFIG.CELL_* design size (1 = 100%). */
    this.scale = 1;
    this.cellW = CONFIG.CELL_WIDTH;
    this.cellH = CONFIG.CELL_HEIGHT;
    this.gap = CONFIG.CELL_GAP;
    this.bufferRows = CONFIG.VIRTUAL_BUFFER_ROWS;

    this._raf = 0;
    this._anchorIndex = 0;
    this._onScroll = () => this.scheduleRender();
    this._onResize = () => this.handleResize();

    this.main.addEventListener('scroll', this._onScroll, { passive: true });
    window.addEventListener('resize', this._onResize);

    this.windowEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-index]');
      if (!btn) return;
      const idx = Number(btn.dataset.index);
      const movie = this.movies[idx];
      if (movie) this.onSelect(movie, btn);
    });
  }

  setMovies(movies, { resetScroll = false, preserveAnchor = false } = {}) {
    if (preserveAnchor) {
      this._anchorIndex = this.firstVisibleIndex();
    }
    this.movies = movies;
    this.measure();
    if (resetScroll) {
      this.main.scrollTop = 0;
      this._anchorIndex = 0;
    } else if (preserveAnchor) {
      this.restoreAnchor(this._anchorIndex);
    }
    this.render();
  }

  firstVisibleIndex() {
    const rowH = this.cellH + this.gap;
    const row = Math.floor(Math.max(0, this.main.scrollTop - this.gap) / rowH);
    return row * this.cols;
  }

  restoreAnchor(index) {
    const row = Math.floor(index / this.cols);
    const rowH = this.cellH + this.gap;
    this.main.scrollTop = row * rowH;
  }

  /**
   * Set poster size multiplier (1 = design size) and remeasure.
   * @param {number} scale
   */
  setScale(scale) {
    const n = Number(scale);
    this.scale = Number.isFinite(n) && n > 0 ? n : 1;
    this.handleResize();
  }

  measure() {
    const style = getComputedStyle(this.windowEl);
    const padL = parseFloat(style.paddingLeft) || this.gap;
    const padR = parseFloat(style.paddingRight) || this.gap;
    const width = this.main.clientWidth - padL - padR;
    const scale = this.scale > 0 ? this.scale : 1;
    const idealW = CONFIG.CELL_WIDTH * scale;
    const minW = Math.max(48, CONFIG.CELL_MIN_WIDTH * scale);
    const gap = this.gap;

    // Fit as many columns as possible with ideal cell width, scale down if needed
    let cols = Math.max(1, Math.floor((width + gap) / (idealW + gap)));
    let cellW = (width - gap * (cols - 1)) / cols;
    if (cellW < minW && cols > 1) {
      cols = Math.max(1, Math.floor((width + gap) / (minW + gap)));
      cellW = (width - gap * (cols - 1)) / cols;
    }
    // Cap at design width when there is leftover space on huge screens
    if (cellW > idealW) {
      cols = Math.max(1, Math.floor((width + gap) / (idealW + gap)));
      cellW = Math.min(idealW, (width - gap * (cols - 1)) / cols);
    }

    const cellH = cellW * (CONFIG.CELL_HEIGHT / CONFIG.CELL_WIDTH);
    this.cols = cols;
    this.cellW = cellW;
    this.cellH = cellH;
    this.windowEl.style.setProperty('--cols', String(cols));
    this.windowEl.style.setProperty('--cell-gap', `${gap}px`);
  }

  totalRows() {
    return Math.ceil(this.movies.length / this.cols) || 0;
  }

  contentHeight() {
    const rows = this.totalRows();
    if (!rows) return 0;
    return rows * this.cellH + (rows - 1) * this.gap + this.gap * 2;
  }

  scheduleRender() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = 0;
      this.render();
    });
  }

  handleResize() {
    const anchor = this.firstVisibleIndex();
    this.measure();
    this.restoreAnchor(anchor);
    this.render();
  }

  render() {
    const n = this.movies.length;
    const rows = this.totalRows();
    const rowH = this.cellH + this.gap;
    const height = this.contentHeight();
    this.spacer.style.height = `${height}px`;

    if (!n) {
      this.windowEl.innerHTML = '';
      return;
    }

    const scrollTop = this.main.scrollTop;
    const viewH = this.main.clientHeight;
    let startRow = Math.floor(scrollTop / rowH) - this.bufferRows;
    let endRow = Math.ceil((scrollTop + viewH) / rowH) + this.bufferRows;
    startRow = Math.max(0, startRow);
    endRow = Math.min(rows - 1, endRow);

    const startIndex = startRow * this.cols;
    const endIndex = Math.min(n, (endRow + 1) * this.cols);

    const offsetY = startRow * rowH;
    this.windowEl.style.transform = `translateY(${offsetY}px)`;

    const frag = document.createDocumentFragment();
    for (let i = startIndex; i < endIndex; i += 1) {
      const movie = this.movies[i];
      frag.appendChild(this.createCell(movie, i));
    }
    this.windowEl.replaceChildren(frag);
  }

  createCell(movie, index) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'poster-cell';
    btn.dataset.index = String(index);
    btn.setAttribute('role', 'listitem');
    btn.setAttribute('aria-label', movie.title || 'Movie');

    const letter = document.createElement('span');
    letter.className = 'poster-placeholder';
    letter.textContent = (movie.title || '?').trim().charAt(0) || '?';
    btn.appendChild(letter);

    const url = posterUrl(movie.poster_path);
    if (url) {
      const bg = document.createElement('div');
      bg.className = 'poster-bg';
      bg.style.backgroundImage = `url("${url.replace(/"/g, '\\"')}")`;
      // Detect broken images lightly
      const img = new Image();
      img.onload = () => {
        /* keep bg */
      };
      img.onerror = () => {
        bg.remove();
        btn.querySelector('.poster-hot-corner')?.remove();
      };
      img.src = url;
      btn.appendChild(bg);
      attachPosterHotCorner(
        btn,
        () => posterZoomUrl(movie.poster_path),
        () => movie.title || 'Poster'
      );
    }

    return btn;
  }

  destroy() {
    this.main.removeEventListener('scroll', this._onScroll);
    window.removeEventListener('resize', this._onResize);
  }
}
