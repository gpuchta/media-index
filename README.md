# Personal Media Index

Static movie library: poster grid, boolean filters (URL hash), edit location/keywords, export JSON.

Works on **GitHub Pages** and any static host. Paths are relative.

## Quick start

Browsers block `fetch` of local JSON under `file://`. Serve the folder:

```bash
cd personal-media-index-new
python3 -m http.server 8080
```

Open http://localhost:8080/

## Data

Configure the JSON path in `js/config.js`:

- `DATA_PATH` — relative path to the movie array JSON  
- `DATA_VERSION` — cache-bust query (`?v=…`) for GitHub Pages when you replace data  

Current file: `data/movies-backup-2026-07-15-143500.json`

## Stack

No build step. Plain HTML + CSS + ES modules.

| Piece | Approach |
|--------|----------|
| Layout / theme | Custom CSS (dark theme) |
| Virtualized grid | Sliding window (`js/grid.js`), buffer rows from `CONFIG.VIRTUAL_BUFFER_ROWS` |
| Filters + hash | `js/filters.js`, `js/hash.js` |
| Dialog / export | `js/dialog.js`, `js/app.js` |

## Features (v1)

- Virtualized poster grid (hide off-screen cells)
- Header hides on scroll down, shows on scroll up
- Typeahead filters (genre, actor, director, …) + free-text keywords / year / vote
- URL hash filter tree (`AND` / `OR` / `NOT` / groups)
- Sort via hamburger menu (sessionStorage)
- Movie dialog: location + keywords editable; delete; TMDB link
- Dirty indicator + export full library as JSON

## GitHub Pages

Publish the repo root (or `/docs`) containing `index.html`, `css/`, `js/`, and `data/`.
