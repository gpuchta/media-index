Create a static movie database web page which shows a poster grid of hundreds or even thousands of movies. Reference code files in directory /Users/gpuchta/projects/personal-media-index/web-safe/ as technical questions may reference parts of its detail implementation as well as layout.

**Reference code role:** use it as layout and behavior inspiration (poster fill, dialog structure, filter colors). Do not port Firebase, service workers, or legacy library choices unless they clearly help. Prefer modern static-site patterns suitable for GitHub Pages.

# Technical Requirements

The project will be published on GitHub Pages. Movie data is in a JSON file and loaded dynamically by the page. The JSON file must be downloaded again if the user hits refresh.

**Cache busting:** append a cache-busting query parameter derived from the app build or a short hash of the data file path is not enough on GitHub Pages alone—prefer loading the data file with a query string that changes when the data changes (e.g. `?v=` + ISO date from the data filename, or a constant you bump when replacing data). Document the chosen approach. On `file://` there is no HTTP cache; a normal reload re-reads the file.

The app code must render enough posters to fill the screen. Scrolling will dynamically add more posters. Use a sliding window so posters not in view are removed and only injected when they are about to come into view when scrolling up or down.

The project must also work when opening `index.html` via the file explorer (`file://`). All referenced asset paths must be relative. Avoid APIs that fail under `file://` where possible (e.g. do not rely on service workers for core load). If `fetch` of local JSON is blocked by the browser under `file://`, document a minimal workaround (e.g. short local static server note) but still structure paths for GitHub Pages + relative assets.

**Target browsers:** latest Chrome, Firefox, Safari, and Edge (last two major versions). No Internet Explorer.

**Scope — out of scope unless added later:**
* Adding new movies / TMDB search-import
* Auth, multi-user, cloud sync
* Backend / API server

# Page Layout

The UI must have a static header that does not scroll with the grid content, but hides when scrolling down and shows when scrolling up. If the static header hides due to the user scrolling down, remove the top margin of the element containing the movie posters. Do the reverse when the static header shows again. The first row contains:

1. Menu dropdown hamburger icon (left)
2. Search / typeahead filter input (center/flex)
3. Current movie count honoring active filters (right)

The second row displays the active filter criteria (from user actions and/or URL hash).

Below the header is the scrollable movie poster grid. The grid adjusts to device size (phone, tablet, laptop, large display) and orientation (portrait, landscape) using CSS breakpoints from the chosen CSS framework.

**Mobile header:** on narrow viewports, keep hamburger + input + count on one row if possible; allow the count to shrink or wrap under the input only if necessary. Second filter row may wrap pills to multiple lines.

**Empty results:** when filters match zero movies, show a centered empty state message (e.g. "No movies match these filters") and count `0`. Do not leave a blank grid with no explanation.

**Loading / error:**
* Show a simple loading indicator while JSON is loading.
* If JSON fails to load, show a clear error message with the attempted path; do not silently show an empty library.

# URL Hash Encoding

The URL hash reflects the active filter **leaf list** so refresh and shared links restore filters.

Operators / structure (spaces as written):

* `" AND "` for AND
* `" OR "` for OR
* `" NOT "` for NOT (prefix of a leaf or group)
* `" ( "` for opening a group
* `" ) "` for closing a group

**Leaf format (canonical write):** always double-quote the value:

```text
type:"value"
NOT type:"value"
```

`type` is one of:

* `title`, `location`, `director`, `actor`, `collection`, `company`, `keyword`, `year`, `genre`, `vote`

**Serialization rules (must match implementation):**

* Group leaves by type (first-seen type order).
* Within a type, multiple **positive** leaves → `( type:"A" OR type:"B" )`.
* Within a type, multiple **negated** leaves → `NOT type:"A" AND NOT type:"B"`.
* Within a type, mixed → `( type:"A" OR type:"B" ) AND NOT type:"C"`.
* Across types → join groups with ` AND `.
* Escape `\` and `"` inside quoted values.

**Browser fragment encoding (required):**

Setting `location.hash` causes the browser to percent-encode the fragment, e.g.:

```text
#actor:%22Jude%20Law%22%20AND%20director:%22Anna%20Boden%22
```

On read, **percent-decode the whole fragment once** (`decodeURIComponent`) before tokenizing so `%20AND%20` becomes ` AND ` and quoted multi-word names round-trip. Also accept residual `%20` as whitespace and legacy unquoted `type:Jude%20Law` when possible.

Examples:

* Logical (as written by the app before the browser encodes):
  * `actor:"Jude Law" AND director:"Anna Boden"`
  * `( actor:"Jude Law" OR actor:"Julia Roberts" )`
  * `( genre:"Action" OR genre:"Comedy" )` when two same-type positive leaves
  * `NOT genre:"Horror" AND NOT genre:"Comedy"` when two same-type negated leaves
  * `genre:"Action" AND NOT genre:"Horror"` (mixed same type)
  * `NOT year:"2010"`
  * `year:"1990-2000"`
  * `keyword:"russian mafia"`
  * `location:"A"`
* After browser encoding, the same filters still parse (see decode rule above).

**Invalid hash:**

* Clear the unreadable fragment from the URL.
* **Do not** wipe in-memory filters that the user already built in this session when a `hashchange` parse fails (keep chips; log a warning).
* On cold load with an invalid/empty hash, start with no filters.

Browser back/forward must restore filters (listen to `hashchange` / history).

**Sort order is not stored in the hash** (session-only unless local storage is used for sort preference — see Local storage).

# Grid

Default sort order: **year descending** (then title ascending as stable tie-breaker). Sort is changed via the hamburger menu:

* Year (desc) — default
* Year (asc)
* Title (asc)
* Title (desc)
* Release Date (asc) — use `released` when present, else `year`
* Release Date (desc)

**Sort persistence:** remember last sort choice in `sessionStorage` for the tab session. Do not put sort in the URL hash.

**Cell size:** design cell is **256×388** (width × height) at comfortable desktop widths. On smaller viewports, scale cells down proportionally to fit more columns, keeping the same aspect ratio (~2:3). Minimum practical width ~120px. Use CSS breakpoints / `minmax` grid rather than a single fixed pixel size on all devices.

**Virtualization buffer:** default **2 rows** above and below the viewport. Expose as a named constant (or small config object) at the top of the app module so it can be tuned without hunting through code. No user-facing control required in v1.

Scroll position **resets to top** after filter changes.

Resize / orientation changes must reflow the grid **without visible jump** of the logical scroll position (preserve approximate first visible index / anchor when possible).

# Poster

The poster must fill the provided cell (see reference code). The image is vertically and horizontally centered and stretched 100% on either the vertical or horizontal axis (cover-style: fill cell, may crop overflow, remain centered). Do **not** show title or year under the poster (unlike the reference).

**Missing / broken poster image:** use a dark neutral placeholder (solid or subtle pattern). Optional: show a faded film-icon or first letter of the title; keep it minimal. Do not break layout if `poster_path` is missing or the TMDB URL 404s.

**Lazy loading:** load background/poster images only for cells in or near the sliding window.

# Scrollbar

Hide all scrollbars for a consistent mobile-like experience, while keeping scroll still possible (wheel, trackpad, touch, keyboard).

# Filters

Support boolean filtering with AND, OR, and NOT. **Current implementation (v1)** uses a **flat list of leaves** compiled with fixed rules—not an arbitrary nested expression tree.

## Operator rules (implemented)

* **OR within the same filter type (positive leaves)** — e.g. two actors → movie matches if it has either actor.
* **AND within the same filter type (negated leaves)** — e.g. `-Horror` and `-Comedy` → movie must satisfy **both** NOTs (neither Horror nor Comedy as a genre match). Multiple `NOT` chips of one type are joined with **AND**, not OR.
* **Mixed same type** — positives are OR'd, then AND'd with each NOT: `( Action OR Comedy ) AND NOT Horror`.
* **AND across different filter types** — e.g. actor Jude Law **and** director Anna Boden.
* **NOT** — via filter chip context menu **Toggle** on a leaf, or by adding with a leading `-` (e.g. `-2010`). Chip shows `NOT …` with strike-through style.
* **Grouping in the hash** — parentheses when serializing multi-value same-type OR groups; negated same-type leaves serialize as `NOT a AND NOT b`. Users do not insert parentheses manually.
* Adding a filter via typeahead/free-text **appends a leaf** to the list (duplicates ignored). There is no separate “join mode” control in v1.

### Required example (must work end-to-end)

Cross-type AND (typeahead: Jude Law → Anna Boden):

```text
actor:"Jude Law" AND director:"Anna Boden"
```

Matches **Captain Marvel** (and any other title that has both) in the library data. Must survive URL hash round-trip after browser percent-encoding.

Same-type OR (positives):

```text
( actor:"Jude Law" OR actor:"Julia Roberts" )
```

Same-type AND (negated):

```text
NOT genre:"Horror" AND NOT genre:"Comedy"
```

### Not implemented yet (future)

Arbitrary nested trees such as:

```text
( actor:Jude Law AND director:Anna Boden ) OR ( actor:Julia Roberts )
```

require a real expression tree, an “OR new group” (or equivalent) UI, and hash serialization that does **not** collapse to type-groups only. Track as a later enhancement; do not document as current behavior.

### Match semantics (per leaf)

* **title** — case-insensitive **exact** match on `title` (typeahead lists titles by substring, e.g. “superman”)
* **location** — case-insensitive substring on `location`
* **director / actor / genre / company / collection** — case-insensitive **exact** match on list/string fields
* **keyword** — case-insensitive substring on `keywords[]` only
* **year** — single year or inclusive `YYYY-YYYY` vs `year` / `released`
* **vote** — percent 0–100 → `vote_average ≥ percent/10`; only one vote leaf (new replaces old)

Allow filtering by:

* title
* location — complete and partial (see Location Format)
* director
* actor
* movie collection name
* production company name
* keywords
* release year / year range
* genre
* vote average

The leaf list is applied to the whole movie collection whenever it changes. The URL hash always mirrors the active leaves (via the type-group serialization above).

## Typeahead input

Use the filter input at the top of the page with typeahead to:

1. Select a known filter value from the typeahead index (built from loaded data), or
2. Enter free text (see free-text resolution below)

### Typeahead index sources

Build unique values from the movie collection for:

| Type | Source |
|------|--------|
| **title** | movie `title` (unique); listed first so “superman” surfaces title hits |
| genre | `genres[]` |
| **year** | 4-digit years from `year` / `released` (via same year helper as filtering); sorted **newest first** |
| location | `location` |
| director | `directors[]` |
| actor | `actors[]` |
| collection | `collection` |
| company | `production_companies[]` |
| keyword | `keywords[]` |

**Group / match order** (`TYPEAHEAD_GROUP_ORDER`):  
`title`, `genre`, `year`, `location`, `director`, `actor`, `collection`, `company`, `keyword`.

Put **title first** so name queries prefer titles; put **year before keyword** so typing `2020` ranks `year:2020` above keyword `2020s`.

Typing narrows the list with case-insensitive substring match. Each typeahead row is prefixed with a colored type pill + filter text, e.g. `[title] Superman`, `[genre] Action`, `[year] 2020`.

On select (click or Enter on highlighted row): append a leaf of that **type** and recompute. Second-row chips show **criteria text + ▾** (not the type name as the main label). Type color tints the chip border/text. If the input has a leading `-`, the leaf is added with `not: true` and the typeahead row may show a `NOT ` prefix.

Keyboard: ArrowUp/ArrowDown move highlight; Enter applies highlight or free-text path; Escape closes the dropdown.

### Free-text path

When Enter is pressed and the current text is **not** applied as a highlighted typeahead selection, resolve in this order (optional leading `-` sets `not: true` for any of these):

1. Explicit `type:value` for any filter type (optional quotes on value), e.g. `actor:Jude Law`, `-genre:Action`
2. Year range `YYYY-YYYY` or single year `YYYY` → year filter
3. Vote pattern `NN` or `NN%` (0–100) → vote filter
4. Exact case-insensitive match against the typeahead index (first hit in group order)
5. Otherwise → **keyword** filter

### Negated add (leading `-`)

A single leading hyphen means “add this filter as NOT …” for **all** filter types. Examples:

* `-2010` → `NOT year:"2010"`
* Typeahead: `-2020` → highlight **year 2020** → `NOT year:"2020"` (not keyword `2020s`)
* `-1990-2000` → `NOT year:"1990-2000"`
* `-70` or `-70%` → `NOT vote:"70"`
* `-genre:Action` or exact `-Action` → `NOT genre:"Action"`
* `-actor:Jude Law` → `NOT actor:"Jude Law"`
* `-assassin` → `NOT keyword:"assassin"` when not an exact index hit

Bare year ranges `1990-2000` (no leading `-` before the first year) are never treated as negation. Typeahead queries strip the leading `-` for matching only; the selected leaf keeps `not: true`.

Duplicate leaf criteria (same type + same value, same NOT state) are ignored (no-op). Vote leaves: only one vote threshold at a time (new replaces previous, including NOT state).

## Year filter

* **Typeahead:** 4-digit release years from the library appear under type `year`; selecting one adds `year:"YYYY"`.
* **Free text:** `2002` or `1990-2000`. Accept only 4-digit years. Inclusive range.
* Compare against movie `year` (string/number) and fall back to year portion of `released` if needed.
* **Negate:** `-2010` or typeahead with leading `-`.

## Vote average filter

Entered as a **percent** 0–100 (e.g. `70` or `70%`). Means **vote_average ≥ percent/10** (TMDB scale is ~0–10; so 70% → ≥ 7.0). Shown on the second row as e.g. `≥ 70%`. Vote filters of different thresholds: keep the **strictest** (≥ max threshold) if multiple vote leaves would AND confusingly; prefer replacing a previous vote filter when a new one is added (single vote threshold at a time).

## Keyword match

* Substring match, case-insensitive
* Against the movie `keywords` array **only** (not title/overview)

## Location match

Partial, case-insensitive substring against the `location` string. Examples:

* `A` → all locations containing `A` (e.g. A1, A11)
* `12` → locations containing `12` (e.g. A12, F12)
* `Amazon` → all Amazon variants

## Second-row display

Keep grouping readable (no "NOT hungarian notation" clutter). Prefer:

* Chips ordered by first-seen filter **type**, then leaves within that type
* Explicit **AND** separators between type groups
* Within a type: **OR** between consecutive positive chips; **AND** when either chip is negated (so multiple NOTs of the same type show as `NOT A AND NOT B`)
* **NOT** only on the affected button, e.g. label becomes `¬ Action` or `NOT Action` with a muted/strike-friendly style (pick one consistent style)

## Filter context menu

Each second-row filter chip menu starts with a non-interactive **type label** (like the hamburger “Sort” label), title-cased from the leaf type (e.g. `Actor`, `Genre`, `Year`), then:

1. **Toggle** — negate filter (NOT on/off)
2. **Remove** — remove this filter leaf
3. **Remove Others** — keep only this leaf; drop every other active filter
4. **Remove All** — clear all filters and hash

# Vote display (dialog / pills)

Movie data provides `vote_average` and `vote_count`. Use `vote_average` (0–10 scale) to size a red→green gradient bar on a light gray track (fill width proportional to score/10). Optionally show numeric average; vote_count is secondary (tooltip or small text if space allows).

# Location Format

Locations are free-form strings in the data. Common shapes:

* **Physical binder:** one or more letters + page number, e.g. `A1`, `F42` (DVD / Blu-ray)
* **Streaming / digital:** service or status name as stored, e.g. `Amazon`, `Netflix`, `Rented`, `Cinema Now`, `FandangoNOW`, `Todo`

Do **not** invent a separate free/rent/purchased schema unless already present in the string. Filtering is string/partial match only. When **editing** location, accept any non-empty trimmed string (no strict pattern validation in v1); trim whitespace on save.

# Poster Image

Posters come from TMDB. Data stores only the path (e.g. `/d6oLngnU5yTLBAwRTIfZNqO6W5.jpg`). Prepend the base URL.

Default size: **`w342`** (good balance for 256-wide cells). Optionally use `w185` on very small cells / `w500` on large displays if easy; v1 may stay on `w342` only.

```html
style="background-image: url(&quot;https://image.tmdb.org/t/p/w342/d6oLngnU5yTLBAwRTIfZNqO6W5.jpg&quot;);"
```

# Editing Movie Information

Clicking a grid poster opens a detail dialog. Poster is scaled to **25% of dialog width** on wide layouts; description sits to the right. If description is taller than the poster, it continues below at full dialog width.

**Change poster from the detail dialog:** clicking the dialog poster opens the TMDB **Choose poster** dialog (requires a stored API key). Choosing a poster and **Save** on that picker only updates the **movie-dialog draft** (preview). The library `poster_path` / `posters` and dirty flag update only when the user confirms the movie dialog with **Save** or **Escape** (same as location/keywords). Cancel on the movie dialog discards the poster draft. Promote rules: demote old primary into `posters` if missing; set new `poster_path`; remove new primary from `posters` to avoid duplicates.

On **narrow screens** (&lt; ~576px): stack poster on top (full width or max ~60% width centered), then description, then fields — do not force side-by-side 25% if unusable.

Elements in normal flow. **Layout:** each field **label on its own line**, pills/values on the following line(s) in normal flex-wrap flow, with double indent on the value row (`DIALOG_FIELD_LABEL_ABOVE_v1` in CSS).

* movie duration pill (from `runtime`; show e.g. `1h 13m` or `73 min`; hide or show `—` if missing)
* average vote pill (gradient bar as above)
* location label and **editable** pill
* released label and release date pill (read-only)
* genre label and genre pills (read-only)
* director label and director pills (read-only)
* actor label and actor pills (read-only)
* company label and production company pills (read-only)
* keywords label and keyword pills (each with **×** to delete)
* single editable keyword field (add when non-empty and user presses Enter; trim; ignore duplicates)

**Editable in v1:** location and keywords only. Other fields are display-only.

Editable pills: click to turn into an input; blur or Enter commits the **draft** field; Escape cancels that field edit.

**Missing fields:** omit empty sections or show an em dash; do not crash on null/undefined arrays.

## Dialog chrome and actions

* **Header:** empty bar with **×** — discard draft changes and close.
* **Footer layout:** **Delete** on the left; **TMDB**, **Cancel**, and **Save** grouped on the right (e.g. `.dialog-footer-actions` with `margin-left: auto`).

Actions:

* **Delete** — confirm `"Delete this movie?"`; remove from in-memory collection; mark dirty; close. No undo in v1.
* **TMDB** — open `https://www.themoviedb.org/movie/{tmdb_id}` in a new tab. Hide/disable if `tmdb_id` missing.
* **Save** — commit draft location/keywords to the live movie if changed; mark dirty only if something changed; close. **Escape** does the same as Save (after finishing any open field edit).
* **Cancel** / **×** / backdrop click — discard draft; close without applying edits.

**Save model (draft):** while the dialog is open, location/keyword edits update a **draft** only. The library movie is updated on **Save** / **Escape**, not on each field commit. Delete still applies immediately after confirm.

**Dirty state:** any delete or successful Save with changes sets a global "unsaved changes" flag (hamburger dirty dot + banner). Clear after successful export. Warn on `beforeunload` if dirty (best-effort).

# Hamburger Menu

Menu items (v1):

1. **Sort** label + items: Year desc (default), Year asc, Title asc/desc, Release Date asc/desc
2. **Application** label + items:
   * **Search Movies** — opens the TMDB search dialog
   * **Settings** — opens the Settings dialog (TMDB API key)
   * **Export JSON** — download current full library (see Exporting Data)

## Settings dialog

Opened from hamburger → **Application** → **Settings**.

* **TMDB API key** (password input) — prefilled from `localStorage` key `pmi:tmdbApiKey`
* **Save** — write key to `localStorage` (empty clears the key); used for all TMDB search/poster requests
* **Cancel** / **×** / Escape / backdrop — close without saving changes made in the field

## TMDB Search dialog

Opened from hamburger → **Application** → **Search Movies**. Stacked fields:

1. **Movie title** (required)
2. **Release year** (optional, 4-digit YYYY)

API key is **not** entered here; it must be set under Settings.

### Search

* **Search** — call TMDB v3 `search/movie` with the stored API key, title, optional `year`, and `page`. If no key is stored, show an error directing the user to Settings.
* If a 4-digit year is provided: pass `year` to the API **and** client-filter results so `release_date` year matches.
* **Infinite scroll:** as the user scrolls the results list near the bottom, fetch the next page (while `page < totalPages`) and **append** rows; dedupe by TMDB id. Status text may show “scroll for more (page n/m)”.
* **Cancel** / **×** / backdrop on the search dialog — close without requiring a search.

Implementation: `js/tmdb.js` — `getStoredTmdbApiKey`, `setStoredTmdbApiKey`, `searchMoviesByTitleAndYear(apiKey, title, year, page)`, `getGenreMap`, `getMovieById`, `toLibraryMovie`.

## GitHub Contents API (`js/github.js`)

Browser client for [Repository contents](https://docs.github.com/en/rest/repos/contents) (`X-GitHub-Api-Version: 2026-03-10`).

* **`getFileContent({ token, owner, repo, path, ref? })`** — GET file; returns `{ exists: false }` on 404, or `{ exists: true, content, sha, ... }` with UTF-8 decoded `content`.
* **`putFileContent({ token, owner, repo, path, content, message, sha?, branch?, ... })`** — PUT create/update; `content` is plain text (Base64-encoded for the API); **`sha` required to update**.
* **`upsertFileContent({ ... })`** — GET then PUT: create if missing, update with current `sha` if present.
* Token helpers: `getStoredGithubToken` / `setStoredGithubToken` (`localStorage` key `pmi:githubToken`).
* Encoding helpers: `encodeGithubContent` / `decodeGithubContent` (UTF-8 safe Base64).

Not yet wired into Settings UI unless added later; call with a PAT that has Contents read/write on the target repo.

### Result row layout

Each hit shows (left → right / stacked text):

```text
[poster ~30% width]  Title
                     Release {year}
                     TMDB          ← link text "TMDB"; opens themoviedb.org/movie/{id}
                     [genre pills] ← resolved from genre_ids via /genre/movie/list when available
                     [Add to Collection]
```

* Poster is a button; click opens the **Choose poster** dialog (does not add to the library by itself).
* Genre pills use flow/wrap layout under the meta lines.

### Choose poster dialog (search-result poster only)

* Opened by clicking a **search result poster**.
* Loads alternate posters via `getMovieById` (`append_to_response=images`).
* Default / currently chosen path is highlighted; user can pick another.
* **Save** — applies the selected path only to that **search result** thumbnail and in-memory search hit (`posterPath`). Does **not** add to the library.
* **Cancel** / **×** — discard picker without changing the result row.

### Add to Collection

* Button on each search result.
* Fetches full detail with `getMovieById` (detail + credits + keywords + images).
* Converts with **`toLibraryMovie(detail, { posterPath })`** using the **current search-result poster** (default or user-picked).
* Maps into library snake_case shape (`tmdb_id`, `title`, `year`, `released`, `runtime`, `overview`, `poster_path`, `posters`, `backdrops`, `genres`, `directors`, `actors`, `keywords`, `production_companies`, `collection`, votes, etc.). `location` defaults to `''` for brand-new adds.
* **Override:** if a movie with the same `tmdb_id` already exists, confirm replace, then:
  * **Keep** the old entry’s **`location`**
  * **Merge keywords:** start from TMDB keywords, then append any old keywords not already present (case-insensitive)
* Pushes into `state.movies`, sets dirty, rebuilds typeahead, **re-applies filters/sort** (`refreshLibraryAfterMutation` / `recompute`).
* Status message confirms added vs replaced.

# Local Storage

**In use today:**

* `pmi:tmdbApiKey` — TMDB API key (written from Settings → Save)
* `pmi:sort` (`sessionStorage`) — last sort choice for the tab

**Optional / not required for v1 library persistence:**

* Persist **dirty in-memory movie data** only if implemented carefully.

**If persisting movie edits in localStorage:**

* Key namespace e.g. `pmi:movies` + `pmi:meta` (schema version, saved-at timestamp)
* On load: fetch JSON from `/data/...`. If localStorage has edits with newer `saved-at` than last export acknowledgment, prefer localStorage and keep dirty true until export.
* Provide menu action **Reset to file data** that discards local edits and reloads the JSON file (confirm first).
* If merge rules feel too heavy, **skip movie persistence** and only keep dirty in-memory until export; still OK for v1. Sort preference in `sessionStorage` alone is fine.

Do not block core UX on localStorage availability (private mode failures → memory only).

# Exporting Data

Hamburger → **Application** → **Export JSON** — download the **full current in-memory collection** (including edits/deletes), **not** the filtered subset. Pretty-print JSON (2-space indent) as a `.json` array matching the input shape as closely as possible.

Filename:

`movies-data-<YYYY-MM-DD>-<HHmmss>.json`

Example: `movies-data-2026-07-15-143502.json` (local time).

After export starts successfully, clear the dirty indicator.

**Import:** not required in v1 (user replaces the file in `/data` and deploys, or reloads after swapping the data file).

# Color Scheme

Use a dark theme. Current CSS tokens may use olive/gray header and grid gradients (e.g. header `#776f57` → `#202427`, grid `#56564f…`); exact hex may be tuned.

* **Header:** left-to-right gradient
* **Grid background:** angled / subtle gradient
* Readable body text on dark chrome (~`#e0e0e0`)

Filter pills / type colors (use CSS framework tokens closest to these):

* title: `#adb5bd`
* location: `#ffc107`
* director: `#007bff`
* actor: `#f15766`
* movie collection name: `#c75dda`
* production company name: `#63beae`
* keywords: `#6c757d`
* release year / year range: `#17a2b8`
* genre and vote average: `#28a745`

# Data File

Load movie data from the `/data` directory. Current file (config `DATA_PATH`):

`data/movies-data.json`

Cache-bust with `DATA_VERSION` query param when fetching. Dated backups may live under `backup/`; they are not loaded by the app unless configured.

Use a single configurable relative path constant in `js/config.js` so renaming the data file is one-line.

Data is a **JSON array** of movie objects. Important fields (non-exhaustive): `title`, `year`, `released`, `runtime`, `overview`, `poster_path`, `location`, `genres`, `directors`, `actors`, `production_companies`, `collection`, `keywords`, `vote_average`, `vote_count`, `tmdb_id`.

# Header hide on scroll

Static header hides on scroll down and shows on scroll up. When hidden:

* Collapse its layout slot (e.g. negative `margin-bottom` from measured `--header-height`)
* Mark `#app` with `header-is-hidden` and drop poster grid top padding so content moves up
* Remeasure the virtualized grid after show/hide

# Accessibility & Keyboard (lightweight)

* Dialog: focus trap while open; Escape = Save (commit draft); restore focus to the poster that opened it when feasible
* Typeahead: arrow keys + Enter to select; Escape closes dropdown
* Do not rely on color alone for NOT state (use text prefix as well)
* Interactive controls should be focusable buttons/inputs

# Implementation stack (current)

No build step. Plain HTML + CSS + ES modules under:

* `index.html`, `css/app.css`
* `js/config.js`, `app.js`, `filters.js`, `hash.js`, `grid.js`, `dialog.js`, `utils.js`, `tmdb.js`, `github.js`

Serve via a local static server for `fetch` of JSON (`python3 -m http.server`); `file://` may block data load.

Requirements docs: `prompt/prompt.md`. Broader TMDB API design notes: `prompt/tmdb.md`.
