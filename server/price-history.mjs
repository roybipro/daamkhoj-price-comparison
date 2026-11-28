/* Real price history: what each shop page asked, day by day, as the crawls read it.

   The file, data/price-history.ndjson, is one JSON value per line, so it can be written and read
   a line at a time and never held whole:
     line 1:  {"version":1,"updatedAt":"<ISO time>","keepDays":180}
     then:    ["<page url>","<last day read>",[["<day>",<price or null>],…]]
   A page's points are only the days its price changed; null means "out of stock" that day. Its
   price holds from each point to the next, and the series ends on the last day it was read.
   Days are Bangladesh dates (UTC+6), the day a shopper would say the price was seen.

   The nightly crawl adds each new list to the file (tools/price-history.mjs). The server copies
   it into a SQLite database on disk, so a lookup costs a few rows, not the file in memory. */

import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rename, rm, stat, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { DatabaseSync } from 'node:sqlite';

export const KEEP_DAYS = 180;
const DAY_MS = 24 * 60 * 60 * 1000;
const DHAKA_MS = 6 * 60 * 60 * 1000;

/** The Bangladesh date of a moment, as "YYYY-MM-DD", or null for a time that isn't one. */
export function dhakaDay(time) {
  const ms = typeof time === 'number' ? time : Date.parse(time);
  return Number.isFinite(ms) ? new Date(ms + DHAKA_MS).toISOString().slice(0, 10) : null;
}

const addDays = (day, count) => new Date(Date.parse(`${day}T00:00:00Z`) + count * DAY_MS).toISOString().slice(0, 10);
const isDay = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

/**
 * Adds one price list's readings to `pages` (url → { last, points }). Only a reading newer than
 * what is known moves a page on; a page read again on the same day takes the later reading, and
 * an unchanged price adds nothing. Lists must be added oldest first.
 */
export function addList(pages, list) {
  let added = 0;
  for (const shop of Object.values(list?.shops ?? {})) {
    for (const entry of shop?.entries ?? []) {
      const day = dhakaDay(entry?.checkedAt);
      const price = Number(entry?.price);
      if (!day || typeof entry.url !== 'string' || !(price > 0)) continue;
      const value = entry.inStock === false ? null : Math.round(price);
      const page = pages.get(entry.url);
      if (!page) {
        pages.set(entry.url, { last: day, points: [[day, value]] });
        added++;
        continue;
      }
      if (day < page.last) continue;
      const lastPoint = page.points.at(-1);
      if (lastPoint[0] === day) {
        lastPoint[1] = value;
        /* The day's later reading can undo a change made earlier that day. */
        const before = page.points.at(-2);
        if (before && before[1] === value) page.points.pop();
      } else if (lastPoint[1] !== value) {
        page.points.push([day, value]);
      }
      page.last = day;
    }
  }
  return added;
}

/** Drops what is older than `keepDays` before `today`: a page not read since then goes, and an
    older price still holding on the cut-off day is moved to start there. */
export function prune(pages, today, keepDays = KEEP_DAYS) {
  const cutoff = addDays(today, -keepDays);
  for (const [url, page] of pages) {
    if (page.last < cutoff) { pages.delete(url); continue; }
    const keepFrom = page.points.findLastIndex(([day]) => day <= cutoff);
    if (keepFrom > 0) page.points.splice(0, keepFrom);
    if (page.points[0][0] < cutoff) page.points[0][0] = cutoff;
  }
}

/** Reads a history file into `pages` (or hands each page to `onPage`); a missing file is an
    empty history. */
export async function readHistoryFile(file, onPage = null) {
  const pages = new Map();
  let header = null;
  try {
    await stat(file);
  } catch (error) {
    if (error.code === 'ENOENT') return { header, pages };
    throw error;
  }
  const lines = createInterface({ input: createReadStream(file, 'utf8'), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    if (!header) {
      header = JSON.parse(line);
      if (header?.version !== 1) throw new Error(`${file} is not a price history`);
      continue;
    }
    const [url, last, points] = JSON.parse(line);
    if (onPage) onPage(url, last, points);
    else pages.set(url, { last, points });
  }
  if (!header) throw new Error(`${file} is not a price history`);
  return { header, pages };
}

/** Written beside the real file and then swapped in, a line per page, sorted so a day's change
    to the file is only the lines that changed. */
export async function writeHistoryFile(file, pages, keepDays = KEEP_DAYS) {
  const temporary = `${file}.${process.pid}.tmp`;
  const urls = [...pages.keys()].sort();
  async function* lines() {
    yield `${JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), keepDays })}\n`;
    for (const url of urls) {
      const { last, points } = pages.get(url);
      yield `${JSON.stringify([url, last, points])}\n`;
    }
  }
  await pipeline(Readable.from(lines()), createWriteStream(temporary));
  await rename(temporary, file);
}

/** A page's price on `day`: undefined when the page wasn't tracked that day, null when it was
    out of stock. */
function valueOn(page, day) {
  if (day < page.points[0][0] || day > page.last) return undefined;
  let value;
  for (const [pointDay, price] of page.points) {
    if (pointDay > day) break;
    value = price;
  }
  return value;
}

/**
 * One product's history from its shop pages' series: the lowest price any of them asked each
 * day (null on a day all were out of stock), and the lowest and highest of those, with the day
 * each was first seen. Empty when no page has a history.
 */
export function summarize(pageSeries) {
  const series = pageSeries.filter(page => page?.points?.length && isDay(page.last) && isDay(page.points[0][0]));
  if (!series.length) return { days: [] };
  let day = series.reduce((first, page) => (page.points[0][0] < first ? page.points[0][0] : first), series[0].points[0][0]);
  const end = series.reduce((last, page) => (page.last > last ? page.last : last), series[0].last);
  const days = [];
  /* At most a year of days, so a damaged date can't make a long loop. */
  for (let guard = 0; day <= end && guard < 400; guard++, day = addDays(day, 1)) {
    const prices = series.map(page => valueOn(page, day)).filter(price => typeof price === 'number');
    days.push([day, prices.length ? Math.min(...prices) : null]);
  }
  const priced = days.filter(([, price]) => price !== null);
  if (!priced.length) return { days };
  const lowest = priced.reduce((low, point) => (point[1] < low[1] ? point : low));
  const highest = priced.reduce((high, point) => (point[1] > high[1] ? point : high));
  return {
    days,
    since: days[0][0],
    current: days.at(-1)[1],
    lowest: { price: lowest[1], day: lowest[0] },
    highest: { price: highest[1], day: highest[0] }
  };
}

/**
 * The server's copy of the history: the file copied into a SQLite database on disk, rebuilt when
 * the file changes. `lookup(urls)` answers with summarize()'s shape.
 */
export function createHistoryStore(file, { log = () => {}, checkEveryMs = 60_000, watch = true } = {}) {
  let db = null;
  let dir = null;
  let loadedMtime = 0;
  let loading = null;

  async function load() {
    let mtime;
    try {
      mtime = (await stat(file)).mtimeMs;
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    if (mtime === loadedMtime) return;
    const nextDir = await mkdtemp(path.join(tmpdir(), 'daamkhoj-history-'));
    const next = new DatabaseSync(path.join(nextDir, 'history.db'));
    try {
      next.exec('PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF; CREATE TABLE pages (url TEXT PRIMARY KEY, series TEXT NOT NULL) WITHOUT ROWID');
      const insert = next.prepare('INSERT OR REPLACE INTO pages (url, series) VALUES (?, ?)');
      let count = 0;
      next.exec('BEGIN');
      await readHistoryFile(file, (url, last, points) => {
        insert.run(url, JSON.stringify([last, points]));
        /* Committed in slices, so a long load never holds one huge transaction. */
        if (++count % 5000 === 0) { next.exec('COMMIT'); next.exec('BEGIN'); }
      });
      next.exec('COMMIT');
      const old = { db, dir };
      db = next;
      dir = nextDir;
      loadedMtime = mtime;
      old.db?.close();
      if (old.dir) await rm(old.dir, { recursive: true, force: true });
      log(`price history: ${count} shop pages`);
    } catch (error) {
      next.close();
      await rm(nextDir, { recursive: true, force: true });
      throw error;
    }
  }

  function reload() {
    loading ??= load().catch(error => log(`price history: could not load (${error.message})`)).finally(() => { loading = null; });
    return loading;
  }

  void reload();
  if (watch) setInterval(reload, checkEveryMs).unref();

  return {
    reload,
    async lookup(urls) {
      if (loading) await loading;
      if (!db) return { days: [] };
      const find = db.prepare('SELECT series FROM pages WHERE url = ?');
      const series = urls.map(url => find.get(url)).filter(Boolean).map(row => {
        const [last, points] = JSON.parse(row.series);
        return { last, points };
      });
      return summarize(series);
    }
  };
}

/** Where the published history is: PRICE_HISTORY_URL, or beside the published price list. */
export function historyUrlFrom(env) {
  if (env.PRICE_HISTORY_URL) return env.PRICE_HISTORY_URL;
  const list = env.PRICE_INDEX_URL;
  return list && /price-index\.json(\?|$)/.test(list) ? list.replace('price-index.json', 'price-history.ndjson') : null;
}

/** The updatedAt on a history file's first line, or null when there is no file. */
async function headerOf(file) {
  try {
    await stat(file);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  const lines = createInterface({ input: createReadStream(file, 'utf8'), crlfDelay: Infinity });
  for await (const line of lines) {
    lines.close();
    return JSON.parse(line)?.updatedAt ?? null;
  }
  return null;
}

/**
 * Fetches the published history and saves it over the local file when it is newer, written to
 * disk as it arrives. Says whether it changed. `cache` keeps the ETag between calls.
 */
export async function pullHistoryFile(url, file, { fetchImpl = fetch, timeoutMs = 10 * 60_000, maxBytes = 200_000_000, cache = null } = {}) {
  const headers = cache?.etag ? { 'if-none-match': cache.etag } : {};
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs), headers });
  /* 404: not published yet (the first crawl after this feature makes it). */
  if (response.status === 304 || response.status === 404) return false;
  if (!response.ok) throw new Error(`price history download answered ${response.status}`);
  const temporary = `${file}.${process.pid}.pull.tmp`;
  try {
    let bytes = 0;
    let head = '';
    const counted = async function* (chunks) {
      for await (const chunk of chunks) {
        bytes += chunk.length;
        if (bytes > maxBytes) throw new Error('price history download is too large');
        if (!head.includes('\n')) head += Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength).toString('utf8');
        yield chunk;
      }
    };
    await pipeline(Readable.fromWeb(response.body ?? new Response('').body), counted, createWriteStream(temporary));
    let incoming = null;
    try {
      incoming = JSON.parse(head.slice(0, head.indexOf('\n')));
    } catch {
      /* Checked just below. */
    }
    if (incoming?.version !== 1 || typeof incoming.updatedAt !== 'string') throw new Error('the download is not a price history');
    /* Only ever forward, as with the price list: a cache can hand back an older copy. */
    const current = cache?.version ?? await headerOf(file);
    if (cache) Object.assign(cache, { etag: response.headers?.get?.('etag') ?? null, version: current });
    if (current && incoming.updatedAt <= current) {
      await unlink(temporary).catch(() => {});
      return false;
    }
    await rename(temporary, file);
    if (cache) cache.version = incoming.updatedAt;
    return true;
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}
