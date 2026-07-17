# Personal Media Index — Getting Started Guide

This guide is for first-time users of **Personal Media Index**—a small web app for cataloging physical (and digital) movies so you can stop living out of plastic disc cases.

**Primary use case:** move discs into **binders with page slots** (e.g. location `A1`, `F42` for binder letter + page) instead of bulky jewel/keep cases. The app is the index for that system: each movie’s **location** records where the disc sits, so you can search and filter by title, people, genres, keywords, and location instead of flipping cases or guessing which binder holds what. That makes finding a title fast, and it helps you **optimize binder usage**—fill pages densely and reorganize without losing track.

<div style="text-align: center">
  <img src="README/storage-binder.jpg" alt="Disk Storage Binder" width="70%">
</div>

**What the two external services do (high level):**

| Service | Role in this project |
|--------|----------------------|
| **GitHub** | **Pages** hosts the website (the app you open in a browser). The same repo **stores the library data file** (JSON) when you save from the app. Commits update both the site and the data for the next deployment. |
| **TMDB** ([The Movie Database](https://www.themoviedb.org/)) | Used to **search for movies** and **retrieve metadata** (title, year, overview, cast/crew, genres, keywords, posters, and related detail) when you add or update entries. |

You can browse an already-published library without keys. A **TMDB API key** is needed to search and fetch metadata/posters; a **GitHub token** is needed to write the data file back to the repository from the browser.

The sections below walk through forking and configuration, API keys, deployment, saving data, and day-to-day workflows (search, add, poster, location, keywords, delete).

## Quick Start (forkers)

1. **Fork** this repo on GitHub; clone your fork.
2. **Edit** `js/config.js` — set `GITHUB_DATA_COMMITS_URL` to your data file’s commits page:  
   `https://github.com/YOUR_USER/YOUR_REPO/commits/main/data/media-index.json`
3. **Push** the config change. Enable **GitHub Pages** (site root = repo root).
4. **Serve locally** (optional): `python3 -m http.server 8080` → http://localhost:8080/
5. **Settings** (☰ → Configuration → Settings): add **TMDB API key** and **GitHub PAT** (Contents read/write). Save. Keys stay in the browser only — never commit them.
6. **Use the app:** Search Movies → add titles → set location/keywords → **Save to GitHub** (or **Export** for a local backup).

| Need | Where |
|------|--------|
| GitHub owner / repo / data path | Derived from `GITHUB_DATA_COMMITS_URL` in `js/config.js` |
| API keys | Settings → localStorage only |
| Details | Sections below |

---

## 1. Clone the project and open it

### Clone

```bash
git clone https://github.com/gpuchta/media-index.git
cd media-index
```

If you forked the repo on GitHub first, clone **your** fork instead so you can push and save data back to your own repository.

### Open the app locally

Browsers often block loading the movie JSON when you open `index.html` directly as a file. Serve the folder with a small local web server instead:

```bash
python3 -m http.server 8080
```

Then open: **http://localhost:8080/**

There is no build step—HTML, CSS, and JavaScript are used as-is.

### What you need access to

As outlined above: **TMDB** for search and metadata, **GitHub** for hosting (Pages) and storing the data file. For local editing you will typically create free accounts on both and obtain the keys described in [§3 Set up API keys](#3-set-up-api-keys).

---

## 2. Configure your fork (GitHub target)

The app does **not** hard-code separate owner/repo/path settings. Forkers set **one** value in the repo:

**File:** `js/config.js`  
**Key:** `GITHUB_DATA_COMMITS_URL`

Use the **commits history URL** for your library data file, for example:

```js
GITHUB_DATA_COMMITS_URL:
  'https://github.com/YOUR_USER/YOUR_REPO/commits/main/data/media-index.json',
```

### How to get that URL

1. Open your fork on GitHub.  
2. Browse to the data file (default: `data/media-index.json`).  
3. Open the file’s **History** / commits view (or copy the commits URL for that path).  
4. Paste the full URL into `GITHUB_DATA_COMMITS_URL` and commit/push.

Expected shape:

```text
https://github.com/{owner}/{repo}/commits/{branch}/{path-to-json}
```

### What the app derives from it

| Derived value | Used for |
|---------------|----------|
| Owner, repo, path | **Save to GitHub** (Contents API) and loading the data file path |
| Branch | Documented in the commits URL (history links) |
| Commits URL | Menu → **GitHub → Data Changes** |
| Actions URL | Menu → **GitHub → Deployments** (`https://github.com/{owner}/{repo}/actions/`) |

The relative **load** path (e.g. `data/media-index.json`) is taken from the path segment of this URL so load and save stay aligned.

### What not to put in `config.js`

- **Do not** put TMDB or GitHub **API keys** in `config.js` or any committed file. Keys go only in the app **Settings** dialog (browser `localStorage`).  
- The commits URL is **not** a secret; it is safe to commit in your fork.

### After changing the URL

Commit and push `js/config.js`. On localhost and on GitHub Pages, reload the app so it picks up the new config. Then set API keys in Settings (next section) before searching or saving.

---

## 3. Set up API keys

Open the app → hamburger menu (☰) → **Settings**.

Enter:

1. **TMDB API key** — from [themoviedb.org](https://www.themoviedb.org/settings/api) (create a free account, then request an API key).
2. **GitHub API key** — a [Personal Access Token (PAT)](https://github.com/settings/tokens) with permission to **read and write repository contents** on the target repo (classic token: `repo` scope for a private repo, or Contents read/write on a fine-grained token limited to this repository).

Click **Save** in Settings.

### Where the keys are stored

Keys are stored **only in this browser**, using **localStorage**:

| Setting | Storage key |
|---------|-------------|
| TMDB API key | `pmi:tmdbApiKey` |
| GitHub personal access token | `pmi:githubToken` |

They are **not** written into the repository, the JSON data file, or the server. Clearing site data, using another browser/profile, or private browsing without persistence means you will need to enter them again.

### Security implications (read this)

- **localStorage is not a vault.** Anyone with access to your computer and this browser profile can read the keys (DevTools → Application → Local Storage).
- **Do not use a token with more power than needed.** Prefer a fine-grained PAT limited to the media-index repo and Contents permission.
- **Treat a GitHub token like a password.** If it leaks, revoke it on GitHub immediately and create a new one.
- **Shared or public machines:** avoid saving keys, or remove them when you are done (open Settings, clear the fields, Save).
- **TMDB keys** are less sensitive than GitHub tokens but can still be abused against your TMDB account quota—don’t publish them.
- The app talks to TMDB and GitHub **from your browser**. Your keys stay client-side; this project does not ship a backend that stores them for you.

---

## 4. How deployment works

This project is a **static site** (plain HTML/CSS/JS + a JSON data file). It is meant to run on **GitHub Pages**.

Once GitHub Pages is enabled for the repository (publish from the repo root or the folder that contains `index.html`, `css/`, `js/`, and `data/`):

- **Any commit that lands on the branch Pages is configured to use typically triggers a new deployment automatically.**
- After a short wait, the live site refreshes with the latest code and data file from that branch.

You do **not** run a separate deploy command for normal use. Saving the library via the app (see below) commits the data file to GitHub; that commit is enough to roll into the next Pages build when Pages watches that branch.

Check deployment status anytime from the menu: **GitHub → Deployments** (opens the repo’s Actions page).

---

## 5. How to save your data

Edits live **in memory** until you persist them. Unsaved changes show a dirty indicator on the menu button and a banner: *Unsaved changes*.

There are two ways to keep your work:

### Export (download a file)

**Menu → Actions → Export**

- Downloads the **full** library as a JSON file (not just the movies currently filtered on screen).
- A good file naming convention looks like: `media-index-2026-07-15-143502.json`.
- Useful as a local backup or if you do not want to write to GitHub yet.
- After a successful export, the “unsaved changes” indicator clears.

### Save to the repository (GitHub)

**Menu → Actions → Save to GitHub**

- Requires a GitHub API key in Settings.
- Requires a valid `GITHUB_DATA_COMMITS_URL` in `js/config.js` (see [§2](#2-configure-your-fork-github-target)).
- Uploads the **full** in-memory library to the data file path derived from that URL (e.g. `data/media-index.json`), via the GitHub Contents API.
- Creates or updates that file with a commit (you will see a short progress dialog with a log of each step).
- After success, the dirty indicator clears. That commit can then be picked up by Pages deployment as described above.

**Menu → GitHub → Data Changes** opens the commit history URL from config (derived commits page).  
**Menu → GitHub → Deployments** opens the repo’s Actions page (also derived from the same config).

### Practical tip

Use **Export** for a quick local backup. Use **Save to GitHub** when you want the shared/live library (and GitHub Pages) to update. Closing the tab with unsaved changes may prompt a browser warning—still better to Export or Save to GitHub deliberately.

---

## 6. Working with movies

### Search movies and add them to the collection

1. Open **Menu → Collection → Search Movies** (TMDB key required).
2. Enter a **title** (required) and optionally a **release year**.
3. Click **Search**. Scroll the results list to load more pages.
4. On a result:
   - **Add to Collection** — fetches full TMDB details and adds the movie to your library.
   - If that TMDB id is already in the library, you will be asked to confirm a replace. Location is kept; keywords are merged carefully.
5. The library is marked dirty—**Export** or **Save to GitHub** when you want to persist the add.

### Set an alternate poster

You can change the poster **before** adding, or **after** the movie is already in the library.

**From search results (before add):**

1. Click the **poster image** on a search result (not the “Add” button).
2. A **Choose poster** dialog lists alternate images from TMDB.
3. Pick one and **Save** on the picker—this only updates that search row’s poster.
4. Click **Add to Collection** so the chosen poster is stored on the new entry.

**From an existing movie:**

1. Click the movie’s poster on the main grid to open the detail dialog.
2. Click the **poster** inside the dialog to open the same style of poster picker (TMDB key required).
3. Choose an image and **Save** on the picker (updates the dialog preview).
4. **Save** (or press Escape after finishing edits) on the movie dialog to commit the poster change to the library.
5. Persist with **Export** or **Save to GitHub** (menu).

### Set location (what “location” means)

**Location** is a free-form note for **where you keep or access the movie**—not a geographic place.

Common examples from this project’s data:

| Kind | Examples |
|------|----------|
| Physical media (binder / shelf) | `A1`, `F42` (letter + page or slot) |
| Streaming / digital | `Amazon`, `Netflix`, `Rented`, `Cinema Now`, `FandangoNOW` |
| Other status | `Todo`, or any short label you invent |

There is no fixed schema—type whatever helps you find the disc or service later. Filters treat location as a **partial, case-insensitive string match** (e.g. filter `A` matches `A1` and `A11`).

**How to edit:**

1. Open the movie from the grid.
2. Edit the **location** field in the dialog.
3. **Save** the dialog (or Escape after edits).
4. **Export** or **Save to GitHub** (menu) to persist.

New movies from TMDB start with an empty location until you set one.

### Add keywords

Keywords are short tags on a movie (from TMDB and/or your own). They help filtering and typeahead.

1. Open the movie from the grid.
2. In the keywords area, type a keyword and press **Enter** to add it (duplicates are ignored; values are trimmed).
3. Click **×** on a keyword pill to remove it.
4. **Save** the dialog, then **Export** or **Save to GitHub** (menu).

### Delete a movie from the collection

1. Open the movie from the grid.
2. Click **Delete** (bottom-left of the dialog).
3. Confirm when prompted.
4. The movie is removed from the in-memory library immediately (no undo in the current version).
5. **Export** or **Save to GitHub** (menu) so the deletion is written to a file or the repo. Until you do, a reload of the site will still show the old data from the last saved JSON.

---

## Quick reference — menu map

Matches the hamburger menu labels in the app:

| Section | Item | What it does |
|---------|------|----------------|
| **Collection** | Search Movies | TMDB search and add |
| **Sort** | Title (asc) / Title (desc) / Release Date (asc) / Release Date (desc) | Order the poster grid |
| **Actions** | Save to GitHub | Write full library to GitHub data file |
| **Actions** | Export | Download full library as JSON |
| **GitHub** | Data Changes | Open data file commit history |
| **GitHub** | Deployments | Open GitHub Actions / deploy status |
| **Configuration** | Settings | TMDB + GitHub API keys |
