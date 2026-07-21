/**
 * Lightweight UI i18n for static chrome.
 * UI languages: en (fallback), de, es, fr.
 * Settings locale (TMDB language) maps by ISO 639-1 base code; others fall back to en.
 */

import { getStoredLocale, normalizeLocale } from './config.js';

export const UI_LOCALES = Object.freeze(['en', 'de', 'es', 'fr']);

/** @type {string} */
let currentUiLocale = 'en';

/**
 * @param {unknown} settingsLocale ISO 639-1 from Settings
 * @returns {'en'|'de'|'es'|'fr'}
 */
export function resolveUiLocale(settingsLocale) {
  const base = normalizeLocale(settingsLocale);
  if (UI_LOCALES.includes(base)) return /** @type {'en'|'de'|'es'|'fr'} */ (base);
  return 'en';
}

export function getUiLocale() {
  return currentUiLocale;
}

/**
 * Translate a key. Missing keys fall back to English, then the key itself.
 * Simple `{name}` interpolation.
 * @param {string} key
 * @param {Record<string, string|number>|null} [vars]
 * @returns {string}
 */
export function t(key, vars = null) {
  const k = String(key || '');
  const dict = catalogs[currentUiLocale] || catalogs.en;
  let s = dict[k] ?? catalogs.en[k] ?? k;
  if (vars && typeof vars === 'object') {
    for (const [name, val] of Object.entries(vars)) {
      s = s.split(`{${name}}`).join(String(val));
    }
  }
  return s;
}

/**
 * Apply data-i18n* attributes under root (default: document).
 * - data-i18n → textContent
 * - data-i18n-html → innerHTML (trusted catalog strings only)
 * - data-i18n-placeholder, data-i18n-title, data-i18n-aria-label, data-i18n-aria-valuetext
 * @param {ParentNode} [root]
 */
export function applyDomI18n(root = document) {
  const scope = root || document;

  scope.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (!key) return;
    el.textContent = t(key);
  });

  scope.querySelectorAll('[data-i18n-html]').forEach((el) => {
    const key = el.getAttribute('data-i18n-html');
    if (!key) return;
    el.innerHTML = t(key);
  });

  /** @type {const} */
  const attrs = [
    ['data-i18n-placeholder', 'placeholder'],
    ['data-i18n-title', 'title'],
    ['data-i18n-aria-label', 'aria-label'],
    ['data-i18n-aria-valuetext', 'aria-valuetext'],
  ];
  for (const [dataAttr, attr] of attrs) {
    scope.querySelectorAll(`[${dataAttr}]`).forEach((el) => {
      const key = el.getAttribute(dataAttr);
      if (!key) return;
      el.setAttribute(attr, t(key));
    });
  }

  // document title
  if (root === document || root === document.documentElement || root === document.body) {
    document.title = t('app.title');
    document.documentElement.lang = currentUiLocale;
  }
}

/**
 * Sync UI locale from Settings storage and refresh DOM chrome.
 * @returns {string} applied UI locale
 */
export function syncUiLocaleFromSettings() {
  currentUiLocale = resolveUiLocale(getStoredLocale());
  if (typeof document !== 'undefined') {
    applyDomI18n(document);
    document.dispatchEvent(
      new CustomEvent('pmi:locale-changed', {
        detail: { locale: currentUiLocale },
      })
    );
  }
  return currentUiLocale;
}

/** English catalog (source of truth for keys). */
const en = {
  'app.title': 'Personal Media Index',

  'common.ok': 'OK',
  'common.cancel': 'Cancel',
  'common.close': 'Close',
  'common.save': 'Save',
  'common.copy': 'Copy',
  'common.delete': 'Delete',
  'common.continue': 'Continue',
  'common.notice': 'Notice',
  'common.confirm': 'Confirm',
  'common.search': 'Search',
  'common.menu': 'Menu',
  'common.loading': 'Loading…',
  'common.error': 'Error',
  'common.optional': '(optional)',

  'menu.collection': 'Collection',
  'menu.addUpdate': 'Add/Update',
  'menu.refreshTmdb': 'Refresh (TMDB)',
  'menu.restoreGithub': 'Restore (GitHub)',
  'menu.import': 'Import',
  'menu.statistics': 'Statistics',
  'menu.clearAll': 'Clear All',
  'menu.sort': 'Sort',
  'menu.sortTitleAsc': 'Title (asc)',
  'menu.sortTitleDesc': 'Title (desc)',
  'menu.sortReleasedAsc': 'Release Date (asc)',
  'menu.sortReleasedDesc': 'Release Date (desc)',
  'menu.save': 'Save',
  'menu.saveGithub': 'Save (GitHub)',
  'menu.export': 'Export',
  'menu.releases': 'Releases',
  'menu.deployments': 'Deployments (GitHub)',
  'menu.configuration': 'Configuration',
  'menu.settings': 'Settings',
  'menu.exportSettings': 'Export settings',
  'menu.importSettings': 'Import settings',
  'menu.importSettingsClipboard': 'Import from Clipboard',
  'menu.clearSession': 'Clear session',

  'settingsIo.exportDone': 'Settings exported',
  'settingsIo.importTitle': 'Import settings',
  'settingsIo.importUnavailable': 'Import settings is not available in this browser.',
  'settingsIo.importStarting': 'Importing “{name}”…',
  'settingsIo.importEmpty': 'Nothing to import — paste or provide JSON content first.',
  'settingsIo.importReadFailed': 'Could not read file: {error}',
  'settingsIo.importParseFailed': 'Invalid JSON: {error}',
  'settingsIo.importFailed': 'Import failed',
  'settingsIo.clipboardTitle': 'Import from Clipboard',
  'settingsIo.clipboardPasteLabel': 'Paste settings JSON',
  'settingsIo.clipboardLogLabel': 'Import log',
  'settingsIo.clipboardPlaceholder': 'Paste settings.json content here…',
  'settingsIo.clipboardPasteBtn': 'Paste',
  'settingsIo.clipboardImportBtn': 'Import',
  'settingsIo.clipboardSource': 'clipboard',
  'settingsIo.clipboardPasteUnsupported':
    'Clipboard API not available — paste into the field with ⌘V / Ctrl+V.',
  'settingsIo.clipboardPasteFailed': 'Could not read clipboard: {error}',
  'settingsIo.clipboardPasted': 'Pasted {n} character(s) from the system clipboard.',
  'settingsIo.statusApplied': 'applied',
  'settingsIo.statusDefault': 'missing → default',
  'settingsIo.statusInvalid': 'invalid → default',
  'settingsIo.statusIgnored': 'unknown key ignored',
  'settingsIo.statusSecret': 'applied from import file (sensitive)',
  'settingsIo.secretWarning':
    'WARNING: This file contained API key(s): {keys}. They were applied to this browser.',
  'settingsIo.secretClearHint':
    'To remove stored secrets and all local settings, use Menu → Configuration → Clear session.',
  'settingsIo.importSummary':
    'Done. Applied {applied}, defaults {defaults}, invalid {invalid}, ignored {ignored}, secrets {secrets}.',
  'settingsIo.finished': 'Finished.',
  'settingsIo.clearConfirm':
    'Are you sure?\n\nThis permanently removes all localStorage data for this site in this browser, including settings and API keys.\n\nYour movie library on GitHub is not affected. Unsaved library edits in this tab remain until you leave or reload.',
  'settingsIo.clearAction': 'Clear session',
  'settingsIo.clearResult':
    'Session cleared.\n\nlocalStorage keys before: {before}\nlocalStorage keys remaining: {after}\n\n(Remaining should normally be 0.)',

  'header.filterLabel': 'Filter movies',
  'header.filterPlaceholder': 'Filter… (−name or −type:value = NOT)',
  'header.dirtyBanner': 'Unsaved changes — Save or export collection',
  'header.activeFilters': 'Active filters',
  'header.moviePosters': 'Movie posters',

  'status.loading': 'Loading library…',
  'status.loadError': 'Could not load movie data',
  'status.fileProtocolHint':
    'If you opened <code>index.html</code> via <code>file://</code>, use a local server:<br /><code>python3 -m http.server 8080</code>',
  'status.emptyFilters': 'No movies match these filters',
  'status.emptyFiltersHint': 'Try removing a filter or changing the criteria.',
  'status.newInstall': 'New Installation',
  'status.newInstall1': 'Create your media index by searching and adding movies.',
  'status.newInstall2': 'When finished, perform an Export of the current data.',
  'status.newInstall3': 'Remember to add your GitHub and TMDB api keys in settings.',

  'filter.type.title': 'Title',
  'filter.type.location': 'Location',
  'filter.type.director': 'Director',
  'filter.type.actor': 'Actor',
  'filter.type.collection': 'Collection',
  'filter.type.company': 'Company',
  'filter.type.keyword': 'Keyword',
  'filter.type.year': 'Year',
  'filter.type.genre': 'Genre',
  'filter.type.vote': 'Vote',
  'filter.type.binder': 'Binder',
  'filter.binder.yes': 'In binder',
  'filter.binder.no': 'Not in binder',
  'filter.menu.remove': 'Remove',
  'filter.menu.not': 'NOT',
  'filter.menu.only': 'Only this',
  'filter.by': 'Filter by {type}: {name}',

  'dialog.movieDetails': 'Movie Details',
  'dialog.prev': 'Previous movie',
  'dialog.next': 'Next movie',
  'dialog.discardClose': 'Discard changes and close',
  'dialog.update': 'Update',
  'dialog.tmdb': 'TMDB',
  'dialog.runtime': 'Runtime',
  'dialog.vote': 'Vote',
  'dialog.location': 'Location',
  'dialog.released': 'Released',
  'dialog.genre': 'Genre',
  'dialog.director': 'Director',
  'dialog.cast': 'Cast',
  'dialog.companies': 'Companies',
  'dialog.collection': 'Collection',
  'dialog.keywords': 'Keywords',
  'dialog.json': 'JSON',
  'dialog.addKeyword': 'Add keyword…',
  'dialog.noDescription': 'No description available.',
  'dialog.untitled': 'Untitled',
  'dialog.choosePoster': 'Choose alternate poster for {title}',
  'dialog.voteAria': 'Vote average {avg} out of 10 from {count} votes',
  'dialog.voteTitle': '{avg} out of 10 · {count} votes',
  'dialog.voteLabel': 'Vote Average {avg} out of 10 ({count} votes)',
  'dialog.deleteConfirm': 'Delete this movie?',
  'dialog.deleteTitle': 'Delete Movie',

  'settings.title': 'Settings',
  'settings.appearance': 'Appearance',
  'settings.theme': 'Theme',
  'settings.customizeColors': 'Customize colors',
  'settings.resetColors': 'Reset colors',
  'settings.fontSize': 'Font size',
  'settings.fontLarge': 'Large',
  'settings.fontSmall': 'Small',
  'settings.appearanceHint':
    'Live preview on the grid. Color pickers tweak the selected theme. Font size: Large is the default; Small uses the previous compact text.',
  'settings.posterGrid': 'Poster grid',
  'settings.size': 'Size',
  'settings.spacing': 'Spacing',
  'settings.lighting': 'Lighting',
  'settings.location': 'Location',
  'settings.showLocation': 'Show location on posters',
  'settings.grayedLocations': 'Grayed locations',
  'settings.posterSource': 'Poster source',
  'settings.posterSourceTmdb': 'TMDB (online CDN)',
  'settings.posterSourceLocal': 'Local (posters/w342)',
  'settings.posterHint':
    'Size, gap, glow, location badge, and grayed list. Poster source: TMDB CDN or files from node posters/sync-posters.mjs. Preview updates live.',
  'settings.binders': 'Binders',
  'settings.notation': 'Notation',
  'settings.customPatterns': 'Custom patterns',
  'settings.testLocation': 'Test location',
  'settings.language': 'Language',
  'settings.metadataLanguage': 'Metadata language',
  'settings.languageHint': 'Preferred language for TMDB titles and app UI (when translated).',
  'settings.library': 'Library',
  'settings.bulkRefresh': 'Bulk refresh',
  'settings.bulkRefreshConfirm': 'Require second confirmation for Refresh (TMDB)',
  'settings.bulkRefreshHint':
    'Menu → Collection → Refresh (TMDB) re-fetches every movie from TMDB. Location is kept; keywords are merged. A second “are you sure?” step is on by default.',
  'settings.connections': 'Connections',
  'settings.tmdbKey': 'TMDB API key',
  'settings.githubKey': 'GitHub API key',
  'settings.connectionsHint':
    'Keys stay in this browser only. TMDB for search and posters; GitHub for library read/write.',
  'settings.showKey': 'Show key',
  'settings.copyKey': 'Copy key',

  'theme.dark': 'Dark',
  'theme.light': 'Light',
  'theme.midnight': 'Midnight',
  'theme.forest': 'Forest',
  'theme.sunset': 'Sunset',
  'theme.slate': 'Slate',

  'binder.letterPage': 'Letter + page (A1)',
  'binder.colorPage': 'Color + page (Blue A)',
  'binder.romanPage': 'Roman + page (VIII A)',
  'binder.emojiPage': 'Emoji + page (😀1)',
  'binder.custom': 'Custom…',

  'stats.title': 'Statistics',
  'stats.directors': 'Directors',
  'stats.actors': 'Actors',
  'stats.genres': 'Genres',
  'stats.collections': 'Collections',
  'stats.companies': 'Companies',
  'stats.showMore': 'Show more',
  'stats.showLess': 'Show less',
  'stats.topOf': 'Top {n} {label} of {total}',
  'stats.countLabel': '{n} {label}',
  'stats.none': 'No {label}',

  'search.title': 'Search Movies',
  'search.movieTitle': 'Movie title',
  'search.year': 'Release year',
  'search.add': 'Add to Collection',
  'search.update': 'Update',
  'search.inLibrary': 'In library',
  'search.inLibraryLoc': 'In library · {loc}',

  'poster.choose': 'Choose poster',
  'poster.ok': 'Ok',

  'history.title': 'Library history',
  'history.openGithub': 'Open on GitHub',
  'history.loadingMore': 'Loading more…',
  'history.end': 'End of history',
  'history.loading': 'Loading commits…',
  'history.none': 'No commits found for this file.',
  'history.showMore': 'Show more',
  'history.showLess': 'Show less',
  'history.download': 'Download',
  'history.restore': 'Restore',
  'history.showing': 'Showing {n} commit(s){more}.',
  'history.scrollMore': ' · scroll for more',
  'history.downloadTitle': 'Download this version as JSON',
  'history.restoreTitle': 'Replace the current library with this version',

  'refresh.title': 'Refresh (TMDB)',
  'refresh.preparing': 'Preparing…',
  'refresh.refreshing': 'Refreshing {index} of {total}',
  'refresh.refreshingEllipsis': 'Refreshing…',
  'refresh.complete': 'Refresh complete',
  'refresh.cancelled': 'Refresh cancelled',
  'refresh.failed': 'Refresh failed',
  'refresh.failedCount': '{n} failed',
  'refresh.failedList': 'Failed',
  'refresh.summary': 'Refreshed {ok} of {total} movie(s){cancel}.',
  'refresh.beforeCancel': ' before cancel',
  'refresh.cancel': 'Cancel',

  'saveProgress.title': 'Save to GitHub',
  'alert.ok': 'OK',
  'alert.cancel': 'Cancel',

  'msg.import.title': 'Import',
  'msg.import.failed': 'Import failed',
  'msg.import.library': 'Import library',
  'msg.import.replace': 'Replace library',
  'msg.empty.title': 'Clear All',
  'msg.empty.confirm': 'Empty collection',
  'msg.history.title': 'Library history',
  'msg.restore.title': 'Restore library version',
  'msg.restore.action': 'Restore',
  'msg.github.key': 'GitHub API key',
  'msg.tmdb.key': 'TMDB API key required',
};

/** @type {Record<string, string>} */
const de = {
  ...en,
  'app.title': 'Persönlicher Medienindex',
  'common.ok': 'OK',
  'common.cancel': 'Abbrechen',
  'common.close': 'Schließen',
  'common.save': 'Speichern',
  'common.copy': 'Kopieren',
  'common.delete': 'Löschen',
  'common.continue': 'Weiter',
  'common.notice': 'Hinweis',
  'common.confirm': 'Bestätigen',
  'common.search': 'Suchen',
  'common.menu': 'Menü',
  'common.loading': 'Laden…',
  'common.error': 'Fehler',
  'common.optional': '(optional)',

  'menu.collection': 'Sammlung',
  'menu.addUpdate': 'Hinzufügen/Aktualisieren',
  'menu.refreshTmdb': 'Aktualisieren (TMDB)',
  'menu.restoreGithub': 'Wiederherstellen (GitHub)',
  'menu.import': 'Importieren',
  'menu.statistics': 'Statistik',
  'menu.clearAll': 'Alles löschen',
  'menu.sort': 'Sortierung',
  'menu.sortTitleAsc': 'Titel (aufsteigend)',
  'menu.sortTitleDesc': 'Titel (absteigend)',
  'menu.sortReleasedAsc': 'Kinostart (aufsteigend)',
  'menu.sortReleasedDesc': 'Kinostart (absteigend)',
  'menu.save': 'Speichern',
  'menu.saveGithub': 'Speichern (GitHub)',
  'menu.export': 'Exportieren',
  'menu.releases': 'Releases',
  'menu.deployments': 'Deployments (GitHub)',
  'menu.configuration': 'Konfiguration',
  'menu.settings': 'Einstellungen',
  'menu.exportSettings': 'Einstellungen exportieren',
  'menu.importSettings': 'Einstellungen importieren',
  'menu.importSettingsClipboard': 'Aus Zwischenablage importieren',
  'menu.clearSession': 'Sitzung löschen',

  'settingsIo.exportDone': 'Einstellungen exportiert',
  'settingsIo.importTitle': 'Einstellungen importieren',
  'settingsIo.importUnavailable':
    'Einstellungen importieren ist in diesem Browser nicht verfügbar.',
  'settingsIo.importStarting': 'Importiere „{name}“…',
  'settingsIo.importEmpty':
    'Nichts zu importieren — zuerst JSON-Inhalt einfügen.',
  'settingsIo.importReadFailed': 'Datei konnte nicht gelesen werden: {error}',
  'settingsIo.importParseFailed': 'Ungültiges JSON: {error}',
  'settingsIo.importFailed': 'Import fehlgeschlagen',
  'settingsIo.clipboardTitle': 'Aus Zwischenablage importieren',
  'settingsIo.clipboardPasteLabel': 'Einstellungen-JSON einfügen',
  'settingsIo.clipboardLogLabel': 'Importprotokoll',
  'settingsIo.clipboardPlaceholder': 'Inhalt von settings.json hier einfügen…',
  'settingsIo.clipboardPasteBtn': 'Einfügen',
  'settingsIo.clipboardImportBtn': 'Importieren',
  'settingsIo.clipboardSource': 'Zwischenablage',
  'settingsIo.clipboardPasteUnsupported':
    'Zwischenablage-API nicht verfügbar — mit ⌘V / Strg+V ins Feld einfügen.',
  'settingsIo.clipboardPasteFailed':
    'Zwischenablage konnte nicht gelesen werden: {error}',
  'settingsIo.clipboardPasted':
    '{n} Zeichen aus der Systemzwischenablage eingefügt.',
  'settingsIo.statusApplied': 'angewendet',
  'settingsIo.statusDefault': 'fehlend → Standard',
  'settingsIo.statusInvalid': 'ungültig → Standard',
  'settingsIo.statusIgnored': 'unbekannter Schlüssel ignoriert',
  'settingsIo.statusSecret': 'aus Importdatei angewendet (sensibel)',
  'settingsIo.secretWarning':
    'WARNUNG: Diese Datei enthielt API-Schlüssel: {keys}. Sie wurden in diesem Browser angewendet.',
  'settingsIo.secretClearHint':
    'Um gespeicherte Geheimnisse und alle lokalen Einstellungen zu entfernen: Menü → Konfiguration → Sitzung löschen.',
  'settingsIo.importSummary':
    'Fertig. Angewendet {applied}, Standards {defaults}, ungültig {invalid}, ignoriert {ignored}, Geheimnisse {secrets}.',
  'settingsIo.finished': 'Beendet.',
  'settingsIo.clearConfirm':
    'Sind Sie sicher?\n\nDadurch werden alle localStorage-Daten dieser Website in diesem Browser dauerhaft gelöscht, einschließlich Einstellungen und API-Schlüssel.\n\nIhre Filmbibliothek auf GitHub bleibt unberührt. Nicht gespeicherte Bibliotheksänderungen in diesem Tab bleiben bis zum Verlassen oder Neuladen erhalten.',
  'settingsIo.clearAction': 'Sitzung löschen',
  'settingsIo.clearResult':
    'Sitzung gelöscht.\n\nlocalStorage-Schlüssel vorher: {before}\nlocalStorage-Schlüssel verbleibend: {after}\n\n(Verbleibend sollte normalerweise 0 sein.)',

  'header.filterLabel': 'Filme filtern',
  'header.filterPlaceholder': 'Filter… (−Name oder −Typ:Wert = NICHT)',
  'header.dirtyBanner': 'Ungespeicherte Änderungen — Speichern oder exportieren',
  'header.activeFilters': 'Aktive Filter',
  'header.moviePosters': 'Filmplakate',

  'status.loading': 'Bibliothek wird geladen…',
  'status.loadError': 'Filmdaten konnten nicht geladen werden',
  'status.fileProtocolHint':
    'Wenn Sie <code>index.html</code> über <code>file://</code> geöffnet haben, nutzen Sie einen lokalen Server:<br /><code>python3 -m http.server 8080</code>',
  'status.emptyFilters': 'Keine Filme entsprechen diesen Filtern',
  'status.emptyFiltersHint': 'Entfernen Sie einen Filter oder ändern Sie die Kriterien.',
  'status.newInstall': 'Neue Installation',
  'status.newInstall1': 'Erstellen Sie Ihren Medienindex, indem Sie Filme suchen und hinzufügen.',
  'status.newInstall2': 'Wenn Sie fertig sind, exportieren Sie die aktuellen Daten.',
  'status.newInstall3': 'Vergessen Sie nicht, GitHub- und TMDB-API-Schlüssel in den Einstellungen einzutragen.',

  'filter.type.title': 'Titel',
  'filter.type.location': 'Standort',
  'filter.type.director': 'Regisseur',
  'filter.type.actor': 'Schauspieler',
  'filter.type.collection': 'Sammlung',
  'filter.type.company': 'Firma',
  'filter.type.keyword': 'Schlagwort',
  'filter.type.year': 'Jahr',
  'filter.type.genre': 'Genre',
  'filter.type.vote': 'Bewertung',
  'filter.type.binder': 'Ordner',
  'filter.binder.yes': 'Im Ordner',
  'filter.binder.no': 'Nicht im Ordner',
  'filter.menu.remove': 'Entfernen',
  'filter.menu.not': 'NICHT',
  'filter.menu.only': 'Nur dieses',
  'filter.by': 'Filtern nach {type}: {name}',

  'dialog.movieDetails': 'Filmdetails',
  'dialog.prev': 'Vorheriger Film',
  'dialog.next': 'Nächster Film',
  'dialog.discardClose': 'Änderungen verwerfen und schließen',
  'dialog.update': 'Aktualisieren',
  'dialog.tmdb': 'TMDB',
  'dialog.runtime': 'Laufzeit',
  'dialog.vote': 'Bewertung',
  'dialog.location': 'Standort',
  'dialog.released': 'Kinostart',
  'dialog.genre': 'Genre',
  'dialog.director': 'Regie',
  'dialog.cast': 'Besetzung',
  'dialog.companies': 'Firmen',
  'dialog.collection': 'Sammlung',
  'dialog.keywords': 'Schlagwörter',
  'dialog.json': 'JSON',
  'dialog.addKeyword': 'Schlagwort hinzufügen…',
  'dialog.noDescription': 'Keine Beschreibung verfügbar.',
  'dialog.untitled': 'Ohne Titel',
  'dialog.choosePoster': 'Anderes Poster wählen für {title}',
  'dialog.voteAria': 'Durchschnitt {avg} von 10 aus {count} Stimmen',
  'dialog.voteTitle': '{avg} von 10 · {count} Stimmen',
  'dialog.voteLabel': 'Bewertung {avg} von 10 ({count} Stimmen)',
  'dialog.deleteConfirm': 'Diesen Film löschen?',
  'dialog.deleteTitle': 'Film löschen',

  'settings.title': 'Einstellungen',
  'settings.appearance': 'Erscheinungsbild',
  'settings.theme': 'Design',
  'settings.customizeColors': 'Farben anpassen',
  'settings.resetColors': 'Farben zurücksetzen',
  'settings.fontSize': 'Schriftgröße',
  'settings.fontLarge': 'Groß',
  'settings.fontSmall': 'Klein',
  'settings.appearanceHint':
    'Live-Vorschau im Raster. Farbwähler passen das Design an. Schriftgröße: Groß ist Standard; Klein ist kompakter.',
  'settings.posterGrid': 'Poster-Raster',
  'settings.size': 'Größe',
  'settings.spacing': 'Abstand',
  'settings.lighting': 'Beleuchtung',
  'settings.location': 'Standort',
  'settings.showLocation': 'Standort auf Postern anzeigen',
  'settings.grayedLocations': 'Ausgegraute Standorte',
  'settings.posterSource': 'Poster-Quelle',
  'settings.posterSourceTmdb': 'TMDB (Online-CDN)',
  'settings.posterSourceLocal': 'Lokal (posters/w342)',
  'settings.posterHint':
    'Größe, Abstand, Leuchten, Standort-Badge und Ausgrauen. Poster-Quelle: TMDB-CDN oder Dateien von node posters/sync-posters.mjs. Vorschau live.',
  'settings.binders': 'Ordner',
  'settings.notation': 'Notation',
  'settings.customPatterns': 'Eigene Muster',
  'settings.testLocation': 'Standort testen',
  'settings.language': 'Sprache',
  'settings.metadataLanguage': 'Metadatensprache',
  'settings.languageHint': 'Bevorzugte Sprache für TMDB-Titel und die App-Oberfläche (wenn übersetzt).',
  'settings.library': 'Bibliothek',
  'settings.bulkRefresh': 'Massenaktualisierung',
  'settings.bulkRefreshConfirm': 'Zweite Bestätigung für Aktualisieren (TMDB) verlangen',
  'settings.bulkRefreshHint':
    'Menü → Sammlung → Aktualisieren (TMDB) holt alle Filme von TMDB. Standort bleibt; Schlagwörter werden zusammengeführt. Eine zweite Bestätigung ist standardmäßig an.',
  'settings.connections': 'Verbindungen',
  'settings.tmdbKey': 'TMDB-API-Schlüssel',
  'settings.githubKey': 'GitHub-API-Schlüssel',
  'settings.connectionsHint':
    'Schlüssel bleiben nur in diesem Browser. TMDB für Suche und Poster; GitHub für Bibliothek lesen/schreiben.',
  'settings.showKey': 'Schlüssel anzeigen',
  'settings.copyKey': 'Schlüssel kopieren',

  'theme.dark': 'Dunkel',
  'theme.light': 'Hell',
  'theme.midnight': 'Mitternacht',
  'theme.forest': 'Wald',
  'theme.sunset': 'Sonnenuntergang',
  'theme.slate': 'Schiefer',

  'binder.letterPage': 'Buchstabe + Seite (A1)',
  'binder.colorPage': 'Farbe + Seite (Blau A)',
  'binder.romanPage': 'Römisch + Seite (VIII A)',
  'binder.emojiPage': 'Emoji + Seite (😀1)',
  'binder.custom': 'Benutzerdefiniert…',

  'stats.title': 'Statistik',
  'stats.directors': 'Regisseure',
  'stats.actors': 'Schauspieler',
  'stats.genres': 'Genres',
  'stats.collections': 'Sammlungen',
  'stats.companies': 'Firmen',
  'stats.showMore': 'Mehr anzeigen',
  'stats.showLess': 'Weniger anzeigen',
  'stats.topOf': 'Top {n} {label} von {total}',
  'stats.countLabel': '{n} {label}',
  'stats.none': 'Keine {label}',

  'search.title': 'Filme suchen',
  'search.movieTitle': 'Filmtitel',
  'search.year': 'Erscheinungsjahr',
  'search.add': 'Zur Sammlung hinzufügen',
  'search.update': 'Aktualisieren',
  'search.inLibrary': 'In der Bibliothek',
  'search.inLibraryLoc': 'In der Bibliothek · {loc}',

  'poster.choose': 'Poster wählen',
  'poster.ok': 'Ok',

  'history.title': 'Bibliotheksverlauf',
  'history.openGithub': 'Auf GitHub öffnen',
  'history.loadingMore': 'Weitere werden geladen…',
  'history.end': 'Ende des Verlaufs',
  'history.loading': 'Commits werden geladen…',
  'history.none': 'Keine Commits für diese Datei gefunden.',
  'history.showMore': 'Mehr anzeigen',
  'history.showLess': 'Weniger anzeigen',
  'history.download': 'Herunterladen',
  'history.restore': 'Wiederherstellen',
  'history.showing': '{n} Commit(s) angezeigt{more}.',
  'history.scrollMore': ' · scrollen für mehr',
  'history.downloadTitle': 'Diese Version als JSON herunterladen',
  'history.restoreTitle': 'Aktuelle Bibliothek durch diese Version ersetzen',

  'refresh.title': 'Aktualisieren (TMDB)',
  'refresh.preparing': 'Vorbereitung…',
  'refresh.refreshing': 'Aktualisiere {index} von {total}',
  'refresh.refreshingEllipsis': 'Aktualisiere…',
  'refresh.complete': 'Aktualisierung abgeschlossen',
  'refresh.cancelled': 'Aktualisierung abgebrochen',
  'refresh.failed': 'Aktualisierung fehlgeschlagen',
  'refresh.failedCount': '{n} fehlgeschlagen',
  'refresh.failedList': 'Fehlgeschlagen',
  'refresh.summary': '{ok} von {total} Film(en) aktualisiert{cancel}.',
  'refresh.beforeCancel': ' vor Abbruch',
  'refresh.cancel': 'Abbrechen',

  'saveProgress.title': 'Auf GitHub speichern',
  'alert.ok': 'OK',
  'alert.cancel': 'Abbrechen',

  'msg.import.title': 'Importieren',
  'msg.import.failed': 'Import fehlgeschlagen',
  'msg.import.library': 'Bibliothek importieren',
  'msg.import.replace': 'Bibliothek ersetzen',
  'msg.empty.title': 'Alles löschen',
  'msg.empty.confirm': 'Sammlung leeren',
  'msg.history.title': 'Bibliotheksverlauf',
  'msg.restore.title': 'Bibliotheksversion wiederherstellen',
  'msg.restore.action': 'Wiederherstellen',
  'msg.github.key': 'GitHub-API-Schlüssel',
  'msg.tmdb.key': 'TMDB-API-Schlüssel erforderlich',
};

/** @type {Record<string, string>} */
const es = {
  ...en,
  'app.title': 'Índice personal de medios',
  'common.ok': 'Aceptar',
  'common.cancel': 'Cancelar',
  'common.close': 'Cerrar',
  'common.save': 'Guardar',
  'common.copy': 'Copiar',
  'common.delete': 'Eliminar',
  'common.continue': 'Continuar',
  'common.notice': 'Aviso',
  'common.confirm': 'Confirmar',
  'common.search': 'Buscar',
  'common.menu': 'Menú',
  'common.loading': 'Cargando…',
  'common.error': 'Error',
  'common.optional': '(opcional)',

  'menu.collection': 'Colección',
  'menu.addUpdate': 'Añadir/Actualizar',
  'menu.refreshTmdb': 'Actualizar (TMDB)',
  'menu.restoreGithub': 'Restaurar (GitHub)',
  'menu.import': 'Importar',
  'menu.statistics': 'Estadísticas',
  'menu.clearAll': 'Borrar todo',
  'menu.sort': 'Ordenar',
  'menu.sortTitleAsc': 'Título (asc)',
  'menu.sortTitleDesc': 'Título (desc)',
  'menu.sortReleasedAsc': 'Fecha de estreno (asc)',
  'menu.sortReleasedDesc': 'Fecha de estreno (desc)',
  'menu.save': 'Guardar',
  'menu.saveGithub': 'Guardar (GitHub)',
  'menu.export': 'Exportar',
  'menu.releases': 'Releases',
  'menu.deployments': 'Despliegues (GitHub)',
  'menu.configuration': 'Configuración',
  'menu.settings': 'Ajustes',
  'menu.exportSettings': 'Exportar ajustes',
  'menu.importSettings': 'Importar ajustes',
  'menu.importSettingsClipboard': 'Importar desde el portapapeles',
  'menu.clearSession': 'Borrar sesión',

  'settingsIo.exportDone': 'Ajustes exportados',
  'settingsIo.importTitle': 'Importar ajustes',
  'settingsIo.importUnavailable':
    'Importar ajustes no está disponible en este navegador.',
  'settingsIo.importStarting': 'Importando “{name}”…',
  'settingsIo.importEmpty':
    'Nada que importar — pegue o proporcione contenido JSON primero.',
  'settingsIo.importReadFailed': 'No se pudo leer el archivo: {error}',
  'settingsIo.importParseFailed': 'JSON no válido: {error}',
  'settingsIo.importFailed': 'Error al importar',
  'settingsIo.clipboardTitle': 'Importar desde el portapapeles',
  'settingsIo.clipboardPasteLabel': 'Pegar JSON de ajustes',
  'settingsIo.clipboardLogLabel': 'Registro de importación',
  'settingsIo.clipboardPlaceholder': 'Pegue aquí el contenido de settings.json…',
  'settingsIo.clipboardPasteBtn': 'Pegar',
  'settingsIo.clipboardImportBtn': 'Importar',
  'settingsIo.clipboardSource': 'portapapeles',
  'settingsIo.clipboardPasteUnsupported':
    'API del portapapeles no disponible — pegue en el campo con ⌘V / Ctrl+V.',
  'settingsIo.clipboardPasteFailed':
    'No se pudo leer el portapapeles: {error}',
  'settingsIo.clipboardPasted':
    'Se pegaron {n} carácter(es) del portapapeles del sistema.',
  'settingsIo.statusApplied': 'aplicado',
  'settingsIo.statusDefault': 'faltante → valor predeterminado',
  'settingsIo.statusInvalid': 'no válido → valor predeterminado',
  'settingsIo.statusIgnored': 'clave desconocida ignorada',
  'settingsIo.statusSecret': 'aplicado desde el archivo de importación (sensible)',
  'settingsIo.secretWarning':
    'ADVERTENCIA: Este archivo contenía clave(s) API: {keys}. Se aplicaron en este navegador.',
  'settingsIo.secretClearHint':
    'Para quitar secretos guardados y todos los ajustes locales, use Menú → Configuración → Borrar sesión.',
  'settingsIo.importSummary':
    'Listo. Aplicados {applied}, predeterminados {defaults}, no válidos {invalid}, ignorados {ignored}, secretos {secrets}.',
  'settingsIo.finished': 'Finalizado.',
  'settingsIo.clearConfirm':
    '¿Está seguro?\n\nEsto elimina permanentemente todos los datos de localStorage de este sitio en este navegador, incluidos ajustes y claves API.\n\nSu biblioteca de películas en GitHub no se ve afectada. Los cambios de biblioteca no guardados en esta pestaña permanecen hasta que salga o recargue.',
  'settingsIo.clearAction': 'Borrar sesión',
  'settingsIo.clearResult':
    'Sesión borrada.\n\nClaves de localStorage antes: {before}\nClaves de localStorage restantes: {after}\n\n(Lo restante debería ser normalmente 0.)',

  'header.filterLabel': 'Filtrar películas',
  'header.filterPlaceholder': 'Filtro… (−nombre o −tipo:valor = NO)',
  'header.dirtyBanner': 'Cambios sin guardar — Guarde o exporte la colección',
  'header.activeFilters': 'Filtros activos',
  'header.moviePosters': 'Pósters de películas',

  'status.loading': 'Cargando biblioteca…',
  'status.loadError': 'No se pudieron cargar los datos',
  'status.fileProtocolHint':
    'Si abrió <code>index.html</code> con <code>file://</code>, use un servidor local:<br /><code>python3 -m http.server 8080</code>',
  'status.emptyFilters': 'Ninguna película coincide con estos filtros',
  'status.emptyFiltersHint': 'Pruebe a quitar un filtro o cambiar los criterios.',
  'status.newInstall': 'Nueva instalación',
  'status.newInstall1': 'Cree su índice buscando y añadiendo películas.',
  'status.newInstall2': 'Cuando termine, exporte los datos actuales.',
  'status.newInstall3': 'Recuerde añadir las claves de GitHub y TMDB en ajustes.',

  'filter.type.title': 'Título',
  'filter.type.location': 'Ubicación',
  'filter.type.director': 'Director',
  'filter.type.actor': 'Actor',
  'filter.type.collection': 'Colección',
  'filter.type.company': 'Compañía',
  'filter.type.keyword': 'Palabra clave',
  'filter.type.year': 'Año',
  'filter.type.genre': 'Género',
  'filter.type.vote': 'Valoración',
  'filter.type.binder': 'Carpeta',
  'filter.binder.yes': 'En carpeta',
  'filter.binder.no': 'Fuera de carpeta',
  'filter.menu.remove': 'Quitar',
  'filter.menu.not': 'NO',
  'filter.menu.only': 'Solo este',
  'filter.by': 'Filtrar por {type}: {name}',

  'dialog.movieDetails': 'Detalles de la película',
  'dialog.prev': 'Película anterior',
  'dialog.next': 'Película siguiente',
  'dialog.discardClose': 'Descartar cambios y cerrar',
  'dialog.update': 'Actualizar',
  'dialog.tmdb': 'TMDB',
  'dialog.runtime': 'Duración',
  'dialog.vote': 'Valoración',
  'dialog.location': 'Ubicación',
  'dialog.released': 'Estreno',
  'dialog.genre': 'Género',
  'dialog.director': 'Director',
  'dialog.cast': 'Reparto',
  'dialog.companies': 'Compañías',
  'dialog.collection': 'Colección',
  'dialog.keywords': 'Palabras clave',
  'dialog.json': 'JSON',
  'dialog.addKeyword': 'Añadir palabra clave…',
  'dialog.noDescription': 'No hay descripción disponible.',
  'dialog.untitled': 'Sin título',
  'dialog.choosePoster': 'Elegir póster alternativo para {title}',
  'dialog.voteAria': 'Media {avg} de 10 con {count} votos',
  'dialog.voteTitle': '{avg} de 10 · {count} votos',
  'dialog.voteLabel': 'Valoración media {avg} de 10 ({count} votos)',
  'dialog.deleteConfirm': '¿Eliminar esta película?',
  'dialog.deleteTitle': 'Eliminar película',

  'settings.title': 'Ajustes',
  'settings.appearance': 'Apariencia',
  'settings.theme': 'Tema',
  'settings.customizeColors': 'Personalizar colores',
  'settings.resetColors': 'Restablecer colores',
  'settings.fontSize': 'Tamaño de fuente',
  'settings.fontLarge': 'Grande',
  'settings.fontSmall': 'Pequeño',
  'settings.appearanceHint':
    'Vista previa en vivo. Los selectores de color ajustan el tema. Fuente: Grande es el valor predeterminado; Pequeño es más compacto.',
  'settings.posterGrid': 'Cuadrícula de pósters',
  'settings.size': 'Tamaño',
  'settings.spacing': 'Espaciado',
  'settings.lighting': 'Iluminación',
  'settings.location': 'Ubicación',
  'settings.showLocation': 'Mostrar ubicación en los pósters',
  'settings.grayedLocations': 'Ubicaciones en gris',
  'settings.posterSource': 'Fuente de pósters',
  'settings.posterSourceTmdb': 'TMDB (CDN en línea)',
  'settings.posterSourceLocal': 'Local (posters/w342)',
  'settings.posterHint':
    'Tamaño, espacio, brillo, insignia de ubicación y lista en gris. Fuente: CDN de TMDB o archivos de node posters/sync-posters.mjs. Vista previa en vivo.',
  'settings.binders': 'Carpetas',
  'settings.notation': 'Notación',
  'settings.customPatterns': 'Patrones personalizados',
  'settings.testLocation': 'Probar ubicación',
  'settings.language': 'Idioma',
  'settings.metadataLanguage': 'Idioma de metadatos',
  'settings.languageHint': 'Idioma preferido para títulos de TMDB y la interfaz (si está traducida).',
  'settings.library': 'Biblioteca',
  'settings.bulkRefresh': 'Actualización masiva',
  'settings.bulkRefreshConfirm': 'Pedir segunda confirmación para Actualizar (TMDB)',
  'settings.bulkRefreshHint':
    'Menú → Colección → Actualizar (TMDB) vuelve a obtener cada película de TMDB. La ubicación se conserva; las palabras clave se fusionan. La segunda confirmación está activada por defecto.',
  'settings.connections': 'Conexiones',
  'settings.tmdbKey': 'Clave API de TMDB',
  'settings.githubKey': 'Clave API de GitHub',
  'settings.connectionsHint':
    'Las claves solo se guardan en este navegador. TMDB para búsqueda y pósters; GitHub para leer/escribir la biblioteca.',
  'settings.showKey': 'Mostrar clave',
  'settings.copyKey': 'Copiar clave',

  'theme.dark': 'Oscuro',
  'theme.light': 'Claro',
  'theme.midnight': 'Medianoche',
  'theme.forest': 'Bosque',
  'theme.sunset': 'Atardecer',
  'theme.slate': 'Pizarra',

  'binder.letterPage': 'Letra + página (A1)',
  'binder.colorPage': 'Color + página (Azul A)',
  'binder.romanPage': 'Romano + página (VIII A)',
  'binder.emojiPage': 'Emoji + página (😀1)',
  'binder.custom': 'Personalizado…',

  'stats.title': 'Estadísticas',
  'stats.directors': 'Directores',
  'stats.actors': 'Actores',
  'stats.genres': 'Géneros',
  'stats.collections': 'Colecciones',
  'stats.companies': 'Compañías',
  'stats.showMore': 'Mostrar más',
  'stats.showLess': 'Mostrar menos',
  'stats.topOf': 'Top {n} {label} de {total}',
  'stats.countLabel': '{n} {label}',
  'stats.none': 'Sin {label}',

  'search.title': 'Buscar películas',
  'search.movieTitle': 'Título',
  'search.year': 'Año de estreno',
  'search.add': 'Añadir a la colección',
  'search.update': 'Actualizar',
  'search.inLibrary': 'En la biblioteca',
  'search.inLibraryLoc': 'En la biblioteca · {loc}',

  'poster.choose': 'Elegir póster',
  'poster.ok': 'Ok',

  'history.title': 'Historial de la biblioteca',
  'history.openGithub': 'Abrir en GitHub',
  'history.loadingMore': 'Cargando más…',
  'history.end': 'Fin del historial',
  'history.loading': 'Cargando commits…',
  'history.none': 'No hay commits para este archivo.',
  'history.showMore': 'Mostrar más',
  'history.showLess': 'Mostrar menos',
  'history.download': 'Descargar',
  'history.restore': 'Restaurar',
  'history.showing': 'Mostrando {n} commit(s){more}.',
  'history.scrollMore': ' · desplace para ver más',
  'history.downloadTitle': 'Descargar esta versión como JSON',
  'history.restoreTitle': 'Reemplazar la biblioteca actual con esta versión',

  'refresh.title': 'Actualizar (TMDB)',
  'refresh.preparing': 'Preparando…',
  'refresh.refreshing': 'Actualizando {index} de {total}',
  'refresh.refreshingEllipsis': 'Actualizando…',
  'refresh.complete': 'Actualización completada',
  'refresh.cancelled': 'Actualización cancelada',
  'refresh.failed': 'Actualización fallida',
  'refresh.failedCount': '{n} fallidas',
  'refresh.failedList': 'Fallidas',
  'refresh.summary': 'Actualizadas {ok} de {total} película(s){cancel}.',
  'refresh.beforeCancel': ' antes de cancelar',
  'refresh.cancel': 'Cancelar',

  'saveProgress.title': 'Guardar en GitHub',
  'alert.ok': 'Aceptar',
  'alert.cancel': 'Cancelar',

  'msg.import.title': 'Importar',
  'msg.import.failed': 'Error al importar',
  'msg.import.library': 'Importar biblioteca',
  'msg.import.replace': 'Reemplazar biblioteca',
  'msg.empty.title': 'Borrar todo',
  'msg.empty.confirm': 'Vaciar colección',
  'msg.history.title': 'Historial de la biblioteca',
  'msg.restore.title': 'Restaurar versión de la biblioteca',
  'msg.restore.action': 'Restaurar',
  'msg.github.key': 'Clave API de GitHub',
  'msg.tmdb.key': 'Se requiere clave API de TMDB',
};

/** @type {Record<string, string>} */
const fr = {
  ...en,
  'app.title': 'Index média personnel',
  'common.ok': 'OK',
  'common.cancel': 'Annuler',
  'common.close': 'Fermer',
  'common.save': 'Enregistrer',
  'common.copy': 'Copier',
  'common.delete': 'Supprimer',
  'common.continue': 'Continuer',
  'common.notice': 'Information',
  'common.confirm': 'Confirmer',
  'common.search': 'Rechercher',
  'common.menu': 'Menu',
  'common.loading': 'Chargement…',
  'common.error': 'Erreur',
  'common.optional': '(facultatif)',

  'menu.collection': 'Collection',
  'menu.addUpdate': 'Ajouter/Mettre à jour',
  'menu.refreshTmdb': 'Actualiser (TMDB)',
  'menu.restoreGithub': 'Restaurer (GitHub)',
  'menu.import': 'Importer',
  'menu.statistics': 'Statistiques',
  'menu.clearAll': 'Tout effacer',
  'menu.sort': 'Tri',
  'menu.sortTitleAsc': 'Titre (croissant)',
  'menu.sortTitleDesc': 'Titre (décroissant)',
  'menu.sortReleasedAsc': 'Date de sortie (croissant)',
  'menu.sortReleasedDesc': 'Date de sortie (décroissant)',
  'menu.save': 'Enregistrer',
  'menu.saveGithub': 'Enregistrer (GitHub)',
  'menu.export': 'Exporter',
  'menu.releases': 'Releases',
  'menu.deployments': 'Déploiements (GitHub)',
  'menu.configuration': 'Configuration',
  'menu.settings': 'Paramètres',
  'menu.exportSettings': 'Exporter les paramètres',
  'menu.importSettings': 'Importer les paramètres',
  'menu.importSettingsClipboard': 'Importer depuis le presse-papiers',
  'menu.clearSession': 'Effacer la session',

  'settingsIo.exportDone': 'Paramètres exportés',
  'settingsIo.importTitle': 'Importer les paramètres',
  'settingsIo.importUnavailable':
    'L’import des paramètres n’est pas disponible dans ce navigateur.',
  'settingsIo.importStarting': 'Import de « {name} »…',
  'settingsIo.importEmpty':
    'Rien à importer — collez d’abord du contenu JSON.',
  'settingsIo.importReadFailed': 'Impossible de lire le fichier : {error}',
  'settingsIo.importParseFailed': 'JSON invalide : {error}',
  'settingsIo.importFailed': 'Échec de l’import',
  'settingsIo.clipboardTitle': 'Importer depuis le presse-papiers',
  'settingsIo.clipboardPasteLabel': 'Coller le JSON des paramètres',
  'settingsIo.clipboardLogLabel': 'Journal d’import',
  'settingsIo.clipboardPlaceholder':
    'Collez ici le contenu de settings.json…',
  'settingsIo.clipboardPasteBtn': 'Coller',
  'settingsIo.clipboardImportBtn': 'Importer',
  'settingsIo.clipboardSource': 'presse-papiers',
  'settingsIo.clipboardPasteUnsupported':
    'API presse-papiers indisponible — collez dans le champ avec ⌘V / Ctrl+V.',
  'settingsIo.clipboardPasteFailed':
    'Impossible de lire le presse-papiers : {error}',
  'settingsIo.clipboardPasted':
    '{n} caractère(s) collés depuis le presse-papiers système.',
  'settingsIo.statusApplied': 'appliqué',
  'settingsIo.statusDefault': 'manquant → valeur par défaut',
  'settingsIo.statusInvalid': 'invalide → valeur par défaut',
  'settingsIo.statusIgnored': 'clé inconnue ignorée',
  'settingsIo.statusSecret': 'appliqué depuis le fichier d’import (sensible)',
  'settingsIo.secretWarning':
    'AVERTISSEMENT : ce fichier contenait des clé(s) API : {keys}. Elles ont été appliquées dans ce navigateur.',
  'settingsIo.secretClearHint':
    'Pour supprimer les secrets stockés et tous les paramètres locaux : Menu → Configuration → Effacer la session.',
  'settingsIo.importSummary':
    'Terminé. Appliqués {applied}, défauts {defaults}, invalides {invalid}, ignorés {ignored}, secrets {secrets}.',
  'settingsIo.finished': 'Terminé.',
  'settingsIo.clearConfirm':
    'Êtes-vous sûr ?\n\nCela supprime définitivement toutes les données localStorage de ce site dans ce navigateur, y compris les paramètres et les clés API.\n\nVotre bibliothèque de films sur GitHub n’est pas affectée. Les modifications non enregistrées de la bibliothèque dans cet onglet restent jusqu’à la fermeture ou le rechargement.',
  'settingsIo.clearAction': 'Effacer la session',
  'settingsIo.clearResult':
    'Session effacée.\n\nClés localStorage avant : {before}\nClés localStorage restantes : {after}\n\n(Le reste devrait normalement être 0.)',

  'header.filterLabel': 'Filtrer les films',
  'header.filterPlaceholder': 'Filtre… (−nom ou −type:valeur = NON)',
  'header.dirtyBanner': 'Modifications non enregistrées — Enregistrez ou exportez',
  'header.activeFilters': 'Filtres actifs',
  'header.moviePosters': 'Affiches de films',

  'status.loading': 'Chargement de la bibliothèque…',
  'status.loadError': 'Impossible de charger les données',
  'status.fileProtocolHint':
    'Si vous avez ouvert <code>index.html</code> via <code>file://</code>, utilisez un serveur local&nbsp;:<br /><code>python3 -m http.server 8080</code>',
  'status.emptyFilters': 'Aucun film ne correspond à ces filtres',
  'status.emptyFiltersHint': 'Essayez de retirer un filtre ou de modifier les critères.',
  'status.newInstall': 'Nouvelle installation',
  'status.newInstall1': 'Créez votre index en recherchant et en ajoutant des films.',
  'status.newInstall2': 'Quand vous avez terminé, exportez les données actuelles.',
  'status.newInstall3': 'N’oubliez pas d’ajouter vos clés API GitHub et TMDB dans les paramètres.',

  'filter.type.title': 'Titre',
  'filter.type.location': 'Emplacement',
  'filter.type.director': 'Réalisateur',
  'filter.type.actor': 'Acteur',
  'filter.type.collection': 'Collection',
  'filter.type.company': 'Société',
  'filter.type.keyword': 'Mot-clé',
  'filter.type.year': 'Année',
  'filter.type.genre': 'Genre',
  'filter.type.vote': 'Note',
  'filter.type.binder': 'Classeur',
  'filter.binder.yes': 'Dans le classeur',
  'filter.binder.no': 'Hors classeur',
  'filter.menu.remove': 'Retirer',
  'filter.menu.not': 'NON',
  'filter.menu.only': 'Celui-ci seul',
  'filter.by': 'Filtrer par {type} : {name}',

  'dialog.movieDetails': 'Détails du film',
  'dialog.prev': 'Film précédent',
  'dialog.next': 'Film suivant',
  'dialog.discardClose': 'Annuler les modifications et fermer',
  'dialog.update': 'Mettre à jour',
  'dialog.tmdb': 'TMDB',
  'dialog.runtime': 'Durée',
  'dialog.vote': 'Note',
  'dialog.location': 'Emplacement',
  'dialog.released': 'Sortie',
  'dialog.genre': 'Genre',
  'dialog.director': 'Réalisation',
  'dialog.cast': 'Distribution',
  'dialog.companies': 'Sociétés',
  'dialog.collection': 'Collection',
  'dialog.keywords': 'Mots-clés',
  'dialog.json': 'JSON',
  'dialog.addKeyword': 'Ajouter un mot-clé…',
  'dialog.noDescription': 'Aucune description disponible.',
  'dialog.untitled': 'Sans titre',
  'dialog.choosePoster': 'Choisir une autre affiche pour {title}',
  'dialog.voteAria': 'Moyenne {avg} sur 10 d’après {count} votes',
  'dialog.voteTitle': '{avg} sur 10 · {count} votes',
  'dialog.voteLabel': 'Note moyenne {avg} sur 10 ({count} votes)',
  'dialog.deleteConfirm': 'Supprimer ce film ?',
  'dialog.deleteTitle': 'Supprimer le film',

  'settings.title': 'Paramètres',
  'settings.appearance': 'Apparence',
  'settings.theme': 'Thème',
  'settings.customizeColors': 'Personnaliser les couleurs',
  'settings.resetColors': 'Réinitialiser les couleurs',
  'settings.fontSize': 'Taille de police',
  'settings.fontLarge': 'Grande',
  'settings.fontSmall': 'Petite',
  'settings.appearanceHint':
    'Aperçu en direct sur la grille. Les sélecteurs de couleur ajustent le thème. Police : Grande par défaut ; Petite pour un texte plus compact.',
  'settings.posterGrid': 'Grille d’affiches',
  'settings.size': 'Taille',
  'settings.spacing': 'Espacement',
  'settings.lighting': 'Éclairage',
  'settings.location': 'Emplacement',
  'settings.showLocation': 'Afficher l’emplacement sur les affiches',
  'settings.grayedLocations': 'Emplacements grisés',
  'settings.posterSource': 'Source des affiches',
  'settings.posterSourceTmdb': 'TMDB (CDN en ligne)',
  'settings.posterSourceLocal': 'Local (posters/w342)',
  'settings.posterHint':
    'Taille, écart, lueur, badge d’emplacement et liste grisée. Source : CDN TMDB ou fichiers via node posters/sync-posters.mjs. Aperçu en direct.',
  'settings.binders': 'Classeurs',
  'settings.notation': 'Notation',
  'settings.customPatterns': 'Motifs personnalisés',
  'settings.testLocation': 'Tester l’emplacement',
  'settings.language': 'Langue',
  'settings.metadataLanguage': 'Langue des métadonnées',
  'settings.languageHint': 'Langue préférée pour les titres TMDB et l’interface (si traduite).',
  'settings.library': 'Bibliothèque',
  'settings.bulkRefresh': 'Actualisation en masse',
  'settings.bulkRefreshConfirm': 'Exiger une seconde confirmation pour Actualiser (TMDB)',
  'settings.bulkRefreshHint':
    'Menu → Collection → Actualiser (TMDB) recharge chaque film depuis TMDB. L’emplacement est conservé ; les mots-clés sont fusionnés. Une seconde confirmation est activée par défaut.',
  'settings.connections': 'Connexions',
  'settings.tmdbKey': 'Clé API TMDB',
  'settings.githubKey': 'Clé API GitHub',
  'settings.connectionsHint':
    'Les clés restent dans ce navigateur uniquement. TMDB pour la recherche et les affiches ; GitHub pour lire/écrire la bibliothèque.',
  'settings.showKey': 'Afficher la clé',
  'settings.copyKey': 'Copier la clé',

  'theme.dark': 'Sombre',
  'theme.light': 'Clair',
  'theme.midnight': 'Minuit',
  'theme.forest': 'Forêt',
  'theme.sunset': 'Coucher de soleil',
  'theme.slate': 'Ardoise',

  'binder.letterPage': 'Lettre + page (A1)',
  'binder.colorPage': 'Couleur + page (Bleu A)',
  'binder.romanPage': 'Romain + page (VIII A)',
  'binder.emojiPage': 'Emoji + page (😀1)',
  'binder.custom': 'Personnalisé…',

  'stats.title': 'Statistiques',
  'stats.directors': 'Réalisateurs',
  'stats.actors': 'Acteurs',
  'stats.genres': 'Genres',
  'stats.collections': 'Collections',
  'stats.companies': 'Sociétés',
  'stats.showMore': 'Afficher plus',
  'stats.showLess': 'Afficher moins',
  'stats.topOf': 'Top {n} {label} sur {total}',
  'stats.countLabel': '{n} {label}',
  'stats.none': 'Aucun(e) {label}',

  'search.title': 'Rechercher des films',
  'search.movieTitle': 'Titre du film',
  'search.year': 'Année de sortie',
  'search.add': 'Ajouter à la collection',
  'search.update': 'Mettre à jour',
  'search.inLibrary': 'Dans la bibliothèque',
  'search.inLibraryLoc': 'Dans la bibliothèque · {loc}',

  'poster.choose': 'Choisir l’affiche',
  'poster.ok': 'Ok',

  'history.title': 'Historique de la bibliothèque',
  'history.openGithub': 'Ouvrir sur GitHub',
  'history.loadingMore': 'Chargement…',
  'history.end': 'Fin de l’historique',
  'history.loading': 'Chargement des commits…',
  'history.none': 'Aucun commit pour ce fichier.',
  'history.showMore': 'Afficher plus',
  'history.showLess': 'Afficher moins',
  'history.download': 'Télécharger',
  'history.restore': 'Restaurer',
  'history.showing': '{n} commit(s) affiché(s){more}.',
  'history.scrollMore': ' · faites défiler pour plus',
  'history.downloadTitle': 'Télécharger cette version en JSON',
  'history.restoreTitle': 'Remplacer la bibliothèque actuelle par cette version',

  'refresh.title': 'Actualiser (TMDB)',
  'refresh.preparing': 'Préparation…',
  'refresh.refreshing': 'Actualisation {index} sur {total}',
  'refresh.refreshingEllipsis': 'Actualisation…',
  'refresh.complete': 'Actualisation terminée',
  'refresh.cancelled': 'Actualisation annulée',
  'refresh.failed': 'Échec de l’actualisation',
  'refresh.failedCount': '{n} échec(s)',
  'refresh.failedList': 'Échecs',
  'refresh.summary': '{ok} film(s) actualisé(s) sur {total}{cancel}.',
  'refresh.beforeCancel': ' avant annulation',
  'refresh.cancel': 'Annuler',

  'saveProgress.title': 'Enregistrer sur GitHub',
  'alert.ok': 'OK',
  'alert.cancel': 'Annuler',

  'msg.import.title': 'Importer',
  'msg.import.failed': 'Échec de l’import',
  'msg.import.library': 'Importer la bibliothèque',
  'msg.import.replace': 'Remplacer la bibliothèque',
  'msg.empty.title': 'Tout effacer',
  'msg.empty.confirm': 'Vider la collection',
  'msg.history.title': 'Historique de la bibliothèque',
  'msg.restore.title': 'Restaurer une version de la bibliothèque',
  'msg.restore.action': 'Restaurer',
  'msg.github.key': 'Clé API GitHub',
  'msg.tmdb.key': 'Clé API TMDB requise',
};

/** @type {Record<string, Record<string, string>>} */
const catalogs = {
  en,
  de,
  es,
  fr,
};
