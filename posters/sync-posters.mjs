#!/usr/bin/env node
/**
 * Sync primary movie posters from TMDB into this folder (minimal backup).
 *
 * Downloads each library movie's poster_path at size w342 (grid default) into:
 *   posters/w342/{same path as TMDB file segment}
 *
 * Does not rewrite media-index.json — only the image base URL needs to change
 * (Settings → Poster source → Local, or CONFIG).
 *
 * Usage (from repo root or this directory):
 *   node posters/sync-posters.mjs
 *   node posters/sync-posters.mjs --library data/media-index.json
 *   node posters/sync-posters.mjs --size w342 --concurrency 6
 *   node posters/sync-posters.mjs --dry-run
 *
 * Options:
 *   --library <path>   Library JSON (default: data/media-index.json)
 *   --size <tmdbSize>  TMDB size bucket (default: w342)
 *   --concurrency <n>  Parallel downloads (default: 6)
 *   --dry-run          List work without downloading
 *   --force            Re-download even if the file already exists
 */

import { createWriteStream } from 'node:fs';
import {
  access,
  mkdir,
  readFile,
  rename,
  stat,
  unlink,
} from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const TMDB_IMAGE_ORIGIN = 'https://image.tmdb.org/t/p';

function parseArgs(argv) {
  /** @type {{ library: string, size: string, concurrency: number, dryRun: boolean, force: boolean }} */
  const opts = {
    library: path.join(REPO_ROOT, 'data', 'media-index.json'),
    size: 'w342',
    concurrency: 6,
    dryRun: false,
    force: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--library' && argv[i + 1]) {
      opts.library = path.resolve(argv[++i]);
    } else if (a === '--size' && argv[i + 1]) {
      opts.size = String(argv[++i]).replace(/^\//, '');
    } else if (a === '--concurrency' && argv[i + 1]) {
      const n = Number(argv[++i]);
      if (Number.isFinite(n) && n >= 1) opts.concurrency = Math.floor(n);
    } else if (a === '--dry-run') {
      opts.dryRun = true;
    } else if (a === '--force') {
      opts.force = true;
    } else if (a === '--help' || a === '-h') {
      opts.help = true;
    } else {
      console.error(`Unknown argument: ${a}`);
      opts.help = true;
    }
  }
  return opts;
}

/**
 * TMDB poster_path → relative file under the size folder (no leading slash).
 * @param {unknown} posterPath
 * @returns {string|null}
 */
function normalizePosterRel(posterPath) {
  if (posterPath == null || posterPath === '') return null;
  let p = String(posterPath).trim();
  if (!p || p.startsWith('http://') || p.startsWith('https://')) return null;
  p = p.replace(/^\/+/, '');
  if (!p || p.includes('..')) return null;
  return p;
}

/**
 * @param {string} filePath
 * @returns {Promise<boolean>}
 */
async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} url
 * @param {string} destPath
 */
async function downloadToFile(url, destPath) {
  await mkdir(path.dirname(destPath), { recursive: true });
  const tmp = `${destPath}.part`;
  try {
    const res = await fetch(url, {
      headers: { Accept: 'image/*' },
      redirect: 'follow',
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    if (!res.body) {
      throw new Error('Empty response body');
    }
    // Node 18+: res.body is a web ReadableStream
    const nodeStream = Readable.fromWeb(/** @type {any} */ (res.body));
    await pipeline(nodeStream, createWriteStream(tmp));
    await rename(tmp, destPath);
  } catch (err) {
    try {
      await unlink(tmp);
    } catch {
      /* ignore */
    }
    throw err;
  }
}

/**
 * Simple promise pool.
 * @template T
 * @param {T[]} items
 * @param {number} concurrency
 * @param {(item: T, index: number) => Promise<void>} worker
 */
async function mapPool(items, concurrency, worker) {
  let next = 0;
  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (next < items.length) {
        const i = next;
        next += 1;
        await worker(items[i], i);
      }
    }
  );
  await Promise.all(runners);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(`Usage: node posters/sync-posters.mjs [options]

  --library <path>     Library JSON (default: data/media-index.json)
  --size <tmdbSize>    TMDB size (default: w342)
  --concurrency <n>    Parallel downloads (default: 6)
  --dry-run            Do not download
  --force              Overwrite existing files
`);
    process.exit(opts.help && process.argv.includes('--help') ? 0 : 1);
  }

  const outRoot = path.join(__dirname, opts.size);
  console.log(`Library: ${opts.library}`);
  console.log(`Output:  ${outRoot}`);
  console.log(`Size:    ${opts.size}`);
  console.log(
    `Mode:    ${opts.dryRun ? 'dry-run' : opts.force ? 'force' : 'skip-existing'}`
  );

  const raw = await readFile(opts.library, 'utf8');
  const movies = JSON.parse(raw);
  if (!Array.isArray(movies)) {
    throw new Error('Library JSON must be an array of movies');
  }

  /** @type {Map<string, string>} rel → remote URL */
  const jobs = new Map();
  let missingPath = 0;
  for (const m of movies) {
    const rel = normalizePosterRel(m?.poster_path);
    if (!rel) {
      missingPath += 1;
      continue;
    }
    if (!jobs.has(rel)) {
      jobs.set(rel, `${TMDB_IMAGE_ORIGIN}/${opts.size}/${rel}`);
    }
  }

  const list = [...jobs.entries()].map(([rel, url]) => ({
    rel,
    url,
    dest: path.join(outRoot, rel),
  }));

  console.log(
    `Movies: ${movies.length} · unique primary posters: ${list.length}` +
      (missingPath ? ` · without poster_path: ${missingPath}` : '')
  );

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;
  /** @type {string[]} */
  const failures = [];

  await mapPool(list, opts.concurrency, async (job) => {
    if (!opts.force && (await fileExists(job.dest))) {
      skipped += 1;
      return;
    }
    if (opts.dryRun) {
      console.log(`would fetch ${job.rel}`);
      downloaded += 1;
      return;
    }
    try {
      await downloadToFile(job.url, job.dest);
      downloaded += 1;
      if (downloaded % 25 === 0 || downloaded + skipped + failed === list.length) {
        process.stdout.write(
          `\rFetched ${downloaded} · skipped ${skipped} · failed ${failed}   `
        );
      }
    } catch (err) {
      failed += 1;
      const msg = err instanceof Error ? err.message : String(err);
      failures.push(`${job.rel}: ${msg}`);
      console.error(`\nFAIL ${job.rel}: ${msg}`);
    }
  });

  if (!opts.dryRun && (downloaded || failed)) process.stdout.write('\n');

  console.log('———');
  console.log(
    `Done. downloaded=${downloaded} skipped=${skipped} failed=${failed}`
  );
  if (failures.length) {
    console.log('Failures:');
    for (const line of failures.slice(0, 20)) console.log(`  ${line}`);
    if (failures.length > 20) {
      console.log(`  … and ${failures.length - 20} more`);
    }
    process.exitCode = 1;
  }

  if (!opts.dryRun && downloaded + skipped > 0) {
    console.log(
      `\nUse Settings → Poster source → Local (or set poster source to local) so the app loads from posters/${opts.size}/`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
