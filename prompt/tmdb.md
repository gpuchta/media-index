# TMDB API v3 — JavaScript Implementation Prompt

Generate browser-friendly JavaScript (ES modules preferred, no build step required unless noted) that implements a thin client for **The Movie Database (TMDB) API version 3**, matching the behavior of the reference Java client (`TmdbManager` / models under `com.movie.index.tmdb.v3`).

Do **not** hard-code a real API key. Accept it at runtime (constructor, factory, or config object). Document where the key is plugged in.

---

## Goals

1. Search movies by title (optional year).
2. Load full movie details by TMDB id, including credits and keywords.
3. Build image URLs from TMDB path fragments.
4. Return plain JS objects suitable for merging into a personal movie library JSON (see field mapping below).

Out of scope unless requested later: authentication UI, rate-limit UI, v4 Bearer auth, TV shows, people search.

---

## Base configuration

| Constant | Value |
|----------|--------|
| API host | `https://api.themoviedb.org` |
| API version | `3` |
| API base | `https://api.themoviedb.org/3` |
| Image base | `https://image.tmdb.org/t/p` |
| Auth (v3 legacy) | Query parameter `api_key={API_KEY}` on every request |

**API key:** provided later. Design the module like:

```js
export function createTmdbClient({ apiKey }) { ... }
// or
export class TmdbClient {
  constructor({ apiKey }) { ... }
}
```

Throw a clear error if `apiKey` is missing/empty when a request is made.

**HTTP:**
- Method: `GET` only.
- Prefer `fetch`.
- Request header: `Accept: application/json`.
- On non-OK status: throw an error including status code, status text, and URL (do not log the API key in errors if avoidable—redact `api_key` query values in thrown messages).
- Parse body as JSON.

**Encoding:** UTF-8 encode the search `query` with `encodeURIComponent`.

**Optional:** small delay/respect of rate limits is nice-to-have; the Java client waited using response headers via `TmdbRateLimiter`. A simple sequential request chain is enough for v1.

---

## Endpoints to implement

### 1. Search movies by title and year

```
GET {API_BASE}/search/movie?api_key={API_KEY}&query={title}
GET {API_BASE}/search/movie?api_key={API_KEY}&query={title}&year={year}
```

- `title` (string, required): movie title search string.
- `year` (number | null | undefined): if null/undefined, omit the `year` parameter.

**Response shape (JSON):**

```json
{
  "page": 1,
  "total_results": 42,
  "total_pages": 3,
  "results": [ /* TmdbMovie search hits */ ]
}
```

**JS function suggestion:**

```js
searchMoviesByTitleAndYear(title, year?) → Promise<TmdbMovieSearch>
```

Normalize to:

```ts
type TmdbMovieSearch = {
  page: number;
  totalResults: number;
  totalPages: number;
  movies: TmdbMovieSummary[]; // from results[]
};
```

---

### 2. Movie details (with images)

```
GET {API_BASE}/movie/{id}?api_key={API_KEY}&append_to_response=images
```

- `id` (number, required): TMDB movie id.

**Important fields in JSON:**

| JSON path | Type | Notes |
|-----------|------|--------|
| `id` | number | TMDB id |
| `title` | string | |
| `release_date` | string | `"YYYY-MM-DD"` or empty |
| `overview` | string | plot |
| `poster_path` | string \| null | path only, e.g. `/abc.jpg` |
| `backdrop_path` | string \| null | path only |
| `vote_average` | number | ~0–10 |
| `vote_count` | number | |
| `budget` | number | detail only |
| `revenue` | number | detail only |
| `runtime` | number \| null | minutes (use if present; Java model ignored it but library JSON may want it) |
| `genres` | `{ id, name }[]` | map to name strings |
| `production_companies` | `{ id, name, ... }[]` | optional; map to names if present |
| `belongs_to_collection` | `{ id, name, ... } \| null` | optional; use `name` as collection |
| `images.posters` | `{ file_path, width, height }[]` | map to `file_path` list |
| `images.backdrops` | `{ file_path, width, height }[]` | map to `file_path` list |

---

### 3. Credits

```
GET {API_BASE}/movie/{id}/credits?api_key={API_KEY}
```

**JSON:**

```json
{
  "cast": [{ "name": "...", "order": 0, ... }],
  "crew": [{ "name": "...", "job": "Director", ... }]
}
```

**Derive:**
- `actors`: `cast` sorted ascending by `order`, then map to `name`.
- `directors`: `crew` where `job === "Director"`, map to `name` (preserve order as returned, or stable filter order).

---

### 4. Keywords

```
GET {API_BASE}/movie/{id}/keywords?api_key={API_KEY}
```

**JSON:**

```json
{
  "keywords": [{ "id": 1, "name": "forest" }, ...]
}
```

**Derive:** list of `name` strings, sorted alphabetically (case-sensitive localeCompare is fine; Java used `String.compareTo`).

---

### 5. Full movie by id (orchestrated)

Match Java `getMovieById(id)`:

1. Fetch detail (`append_to_response=images`).
2. Fetch credits.
3. Fetch keywords.
4. Merge into one object:
   - From detail: id, title, release date/year, overview, paths, votes, budget, revenue, genres, posters, backdrops, optional runtime/companies/collection.
   - From credits: `directors`, `actors`.
   - From keywords: `keywords` (string array).

**JS function suggestion:**

```js
getMovieById(id) → Promise<TmdbMovieDetail>
```

Requests may be sequential or `Promise.all` for credits+keywords after/in parallel with detail. Prefer:

```js
const [detail, credits, keywords] = await Promise.all([
  fetchDetail(id),
  fetchCredits(id),
  fetchKeywords(id),
]);
```

(detail URL is independent of the other two.)

---

## Image URLs

TMDB returns **paths only** (often starting with `/`). Full URL:

```
https://image.tmdb.org/t/p/{size}/{path}
```

Normalize path: ensure a single leading `/` or strip leading slashes and join cleanly—be consistent. Java stripped leading `/` then built `{base}/{width}/{image}`.

**Poster sizes to support (helpers):**  
`w92`, `w154`, `w185`, `w342`, `w500`, `w780`, `original`

**Backdrop sizes:**  
`w300`, `w780`, `w1280`, `original`

**Default for this project’s poster grid:** `w342`.

```js
posterUrl(path, size = 'w342') → string | ''
backdropUrl(path, size = 'w780') → string | ''
```

Return empty string if `path` is null/undefined/empty.

---

## Normalized types (target JS objects)

Use camelCase in JS. Provide mappers from raw TMDB JSON → these types.

### Search hit / summary

```ts
type TmdbMovieSummary = {
  id: number;
  title: string;
  releaseDate: string | null;  // "YYYY-MM-DD"
  releaseYear: number | null;  // from first segment of releaseDate
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  voteAverage: number;
  voteCount: number;
};
```

### Full detail (after merge)

```ts
type TmdbMovieDetail = TmdbMovieSummary & {
  budget: number;
  revenue: number;
  runtime: number | null;
  genres: string[];           // names only
  posters: string[];          // file_path list
  backdrops: string[];        // file_path list
  directors: string[];
  actors: string[];
  keywords: string[];
  productionCompanies: string[]; // optional, [] if missing
  collection: string | null;     // belongs_to_collection.name
};
```

### Helper: release year

```js
// release_date "1998-09-25" → 1998
// missing/invalid → null
function releaseYearFromDate(releaseDate) { ... }
```

---

## Mapping to personal media index records

When converting a `TmdbMovieDetail` into a library movie object (for export/import into `movies-data.json`), use this mapping. **Do not invent `location`**—that is user-owned and local only.

| Library field | Source |
|---------------|--------|
| `tmdb_id` | `String(id)` or number—match existing data style (`"10010"` string is fine if current JSON uses strings) |
| `title` | `title` |
| `year` | `String(releaseYear)` or number—match existing data |
| `released` | `releaseDate` |
| `overview` | `overview` |
| `poster_path` | `posterPath` |
| `backdrop_path` | `backdropPath` |
| `posters` | `posters` |
| `backdrops` | `backdrops` |
| `vote_average` | `voteAverage` |
| `vote_count` | `voteCount` |
| `budget` | `budget` |
| `revenue` | `revenue` |
| `runtime` | `runtime` |
| `genres` | `genres` |
| `directors` | `directors` |
| `actors` | `actors` |
| `keywords` | `keywords` |
| `production_companies` | `productionCompanies` |
| `collection` | `collection` |
| `location` | leave unset or `""` for caller to fill |
| `popularity` | omit unless detail JSON includes it and caller wants it |

Provide:

```js
toLibraryMovie(detail: TmdbMovieDetail) → object
```

aligned with the project’s existing JSON shape (snake_case keys as in `movies-data.json`).

---

## Module layout (suggested)

```
js/tmdb/
  config.js      # IMAGE_BASE, API_BASE, default poster size; no secrets
  client.js      # createTmdbClient / TmdbClient
  map.js         # raw JSON → summary/detail, toLibraryMovie
  images.js      # posterUrl, backdropUrl
  index.js       # re-exports
```

Or a single `js/tmdb.js` if keeping the app minimal.

**Public API surface to export:**

```js
createTmdbClient({ apiKey })
client.searchMoviesByTitleAndYear(title, year?)
client.getMovieById(id)
posterUrl(path, size?)
backdropUrl(path, size?)
toLibraryMovie(detail)
```

---

## Example usage (for generated docs / comments)

```js
import { createTmdbClient, posterUrl, toLibraryMovie } from './tmdb/index.js';

// API key supplied later (e.g. from local config not committed to git)
const tmdb = createTmdbClient({ apiKey: window.TMDB_API_KEY });

const { movies } = await tmdb.searchMoviesByTitleAndYear('Inception', 2010);
const detail = await tmdb.getMovieById(movies[0].id);
const record = toLibraryMovie(detail);
const img = posterUrl(record.poster_path, 'w342');
```

---

## Security & deployment notes (include as comments in code)

- Never commit a real API key to the repository.
- For a static GitHub Pages app, a TMDB key in front-end code is visible to users; acceptable only for personal/low-risk use. Prefer a user-supplied key in `localStorage` or a non-committed `js/tmdb-secret.js` listed in `.gitignore`.
- CORS: TMDB API allows browser `fetch` from typical origins; if a call fails in the browser, document the error—do not proxy unless the project later adds a backend.

---

## Acceptance checklist

- [ ] No hard-coded API key
- [ ] Search with and without year
- [ ] `getMovieById` merges detail + credits + keywords
- [ ] Directors = crew job `Director`; actors = cast sorted by `order`
- [ ] Keywords sorted by name
- [ ] Genres / posters / backdrops flattened to string arrays
- [ ] Image URL helpers for poster/backdrop sizes including `w342`
- [ ] `toLibraryMovie` produces snake_case library fields
- [ ] Clear errors on HTTP failure (API key redacted in messages)
- [ ] ES module exports usable from the static site

---

## Reference behavior (Java parity)

| Java | JS equivalent |
|------|----------------|
| `TmdbManager.searchMoviesByTitleAndYear` | `searchMoviesByTitleAndYear` |
| `TmdbManager.getMovieById` | `getMovieById` |
| `TmdbMovieSearch` | search result object |
| `TmdbMovie` | summary + detail types |
| `TmdbCredits.getDirectors/getCast` | directors / actors derivation |
| `TmdbKeywords.getKeywords` | keyword name list sorted |
| `TmdbMediaUrl.getPoster342` etc. | `posterUrl` / `backdropUrl` |

Do not port Java HTTP libraries or Gson; use `fetch` and `response.json()`.
