/* The saved price list, and the instant search over it. The file holds what the crawler read:

     { version: 1, shops: { "dazzle.com.bd": { crawledAt, stats, entries: [
         { shop, url, name, price, inStock, checkedAt } ] } } }

   with times as ISO strings. Searching it needs no network and no paid request. */

import { createReadStream, createWriteStream } from 'node:fs';
import { readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { DatabaseSync } from 'node:sqlite';
import { fromBangla } from './bangla.mjs';
import { decodeEntities } from './page-price.mjs';
import { cleanQuery, dropSuspiciousPrices, groupOffers, mergeGroups, validQuery } from './live-search.mjs';
import { buildBrowseSteps, discoverCategoriesSteps, displayName, productKey, runInSlices, runNow } from './browse.mjs';
import { countSpellings, createSpeller, matchesQuery, mentionsInTokens, queryTokens, requiredWords, variantOf, wordSet } from './matching.mjs';

const EMPTY = { version: 1, shops: {} };

/** The saved list, or an empty one if there is none yet. A damaged file is an error, not empty. */
export async function loadIndexFile(file) {
  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return structuredClone(EMPTY);
    throw error;
  }
  const data = JSON.parse(text);
  if (data?.version !== 1 || typeof data.shops !== 'object') throw new Error(`${file} is not a price list`);
  return data;
}

/** How new a list is: its last save, or failing that its latest crawl. ISO times sort as text. */
export const listVersion = data => [data?.updatedAt ?? '', ...Object.values(data?.shops ?? {}).map(shop => shop.crawledAt ?? '')]
  .reduce((latest, time) => (time > latest ? time : latest), '');

/** Written beside the real file and then swapped in, so a crash never leaves half a list. */
export async function saveIndexFile(file, data) {
  data.updatedAt = new Date().toISOString();
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(data));
  await rename(temporary, file);
}

/* A list's version, its shape and how it ends, read from its bytes as they pass, without holding
   or parsing the list: at 54 MB a parse costs about 150 MB of heap, and on Render's 252 MB heap
   two of them at once (the server loading its list at start while the pull checked the
   download) ran it out. The times are the only "updatedAt" and "crawledAt" keys in the file. */
function listScanner() {
  const TIME = /"(?:updatedAt|crawledAt)"\s*:\s*"([^"\\]*)"/g;
  let head = '';
  let tail = '';
  let version = '';
  let shops = false;
  return {
    push(chunk) {
      /* A web stream's pieces may be plain byte arrays, whose toString lists numbers. */
      const piece = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength).toString('latin1');
      if (head.length < 64) head += piece.slice(0, 64 - head.length);
      const text = tail + piece;
      for (const [, time] of text.matchAll(TIME)) if (time > version) version = time;
      shops ||= /(?<!\\)"shops"\s*:\s*\{/.test(text);
      /* Kept so a key cut between two chunks is still found whole. */
      tail = text.slice(-96);
    },
    result() {
      const isList = /^\s*\{\s*"version"\s*:\s*1\s*[,}]/.test(head) && shops && /\}\s*$/.test(tail);
      return { isList, version };
    }
  };
}

/** How new the list in a file is, as listVersion would say, or null when there is none. */
async function fileVersion(file) {
  const scan = listScanner();
  try {
    for await (const chunk of createReadStream(file)) scan.push(chunk);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  return scan.result().version;
}

/**
 * Fetches a published copy of the list (the one the nightly crawl commits) and saves it over the
 * local file when it is newer, so a server that is never redeployed still gets each night's
 * prices. A download that is not a price list, or not newer, leaves the file alone. Says whether
 * it changed. With `cache` (an object kept between calls), the copy last seen is named by its
 * ETag, so an unchanged list answers "not modified" instead of sending 54 MB again.
 */
export async function pullIndexFile(url, file, { fetchImpl = fetch, timeoutMs = 10 * 60_000, maxBytes = 200_000_000, cache = null } = {}) {
  const headers = cache?.etag ? { 'if-none-match': cache.etag } : {};
  /* At 54 MB, reading the whole answer into memory first took over a minute on Render's small
     share of a CPU, so every pull since 2026-11-24 timed out: it is written to disk as it
     arrives, with ten minutes to finish. The list itself is only parsed when the server loads it. */
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs), headers });
  if (response.status === 304) return false;
  if (!response.ok) throw new Error(`price list download answered ${response.status}`);
  const temporary = `${file}.${process.pid}.pull.tmp`;
  try {
    let bytes = 0;
    const scan = listScanner();
    const counted = async function* (chunks) {
      for await (const chunk of chunks) {
        bytes += chunk.length;
        if (bytes > maxBytes) throw new Error('price list download is too large');
        scan.push(chunk);
        yield chunk;
      }
    };
    await pipeline(Readable.fromWeb(response.body ?? new Response('').body), counted, createWriteStream(temporary));
    const { isList, version: incoming } = scan.result();
    if (!isList) throw new Error('the download is not a price list');
    const etag = response.headers?.get?.('etag') ?? null;
    /* Only ever forward: a cache can hand back yesterday's copy, which must not replace a newer
       list deployed with the site. The local list's version is read from its file once. */
    const current = cache?.version ?? await fileVersion(file);
    if (cache) Object.assign(cache, { etag, version: current });
    if (current !== null && incoming <= current) {
      await unlink(temporary).catch(() => {});
      return false;
    }
    await rename(temporary, file);
    if (cache) cache.version = incoming;
    return true;
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

/* Where the list lives while it is searched: a private SQLite database on disk, built from the
   file when it loads and deleted when it closes. On Render's 512 MB plan the list held in memory,
   with the tables that made it fast, used about 100 MB of a 252 MB heap at 109k prices and once
   ran it out. On disk it costs a few MB of cache, however long the list grows. */
const SCHEMA = `
  PRAGMA journal_mode = OFF;
  PRAGMA synchronous = OFF;
  PRAGMA temp_store = FILE;
  PRAGMA cache_size = -8000;
  CREATE TABLE entries (
    id INTEGER PRIMARY KEY, shop TEXT, url TEXT, name TEXT, price REAL, in_stock INTEGER,
    checked_at TEXT, checked_ms REAL, image TEXT, pkey TEXT);
  -- Every word of a listing's name and address; in_name marks the name's own.
  CREATE TABLE words (word TEXT, id INTEGER, in_name INTEGER, PRIMARY KEY (word, id)) WITHOUT ROWID;
  -- How many listings' names use each word.
  CREATE TABLE word_counts (word TEXT PRIMARY KEY, n INTEGER) WITHOUT ROWID;
  -- Products for suggestions, id in the order they are offered: most shops first.
  CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT, words TEXT, shops INTEGER);
  CREATE TABLE product_words (word TEXT, pid INTEGER, PRIMARY KEY (word, pid)) WITHOUT ROWID;
  -- Built as rows arrive, never in one long step at the end: that froze the site for seconds.
  CREATE INDEX entries_by_url ON entries (url);
  CREATE INDEX entries_by_key ON entries (pkey);`;

const ANSWER_TTL_MS = 5 * 60 * 1000;
/* About 60 × 150 KB at most, for the broadest answers. */
const MAX_ANSWERS = 60;

/* Above every character, so `word >= start AND word < start || END` is "starts with". */
const END = String.fromCodePoint(0x10ffff);

const rowToEntry = row => ({
  shop: row.shop,
  url: row.url,
  name: row.name,
  price: row.price,
  inStock: row.in_stock === null ? null : row.in_stock === 1,
  checkedAt: row.checked_at,
  ...(row.image && { image: row.image })
});

/**
 * Instant search over a loaded list. Prices older than `maxAgeMs` are left out rather than
 * shown as current, and at most `maxOffers` are returned, cheapest first within each version.
 */
export function createPriceIndex(input, { now = Date.now, maxAgeMs = 7 * 24 * 60 * 60 * 1000, maxOffers = 300 } = {}) {
  const shopNames = Object.keys(input?.shops ?? {});
  const updatedAt = input?.updatedAt ?? null;
  /* Prices too old to show are not kept at all: the file keeps them for the crawl. */
  const loadedAt = now();
  let source = Object.values(input?.shops ?? {}).flatMap(shop => shop.entries ?? [])
    .filter(entry => !(loadedAt - Date.parse(entry.checkedAt) > maxAgeMs));
  const size = source.length;

  let db = null;
  /* Learned from the names while the database is built. */
  let speller = null;
  let shelves = null;
  let shelvedAt = -Infinity;
  let rebuilding = null;
  /* Set when a re-check changed a price, so the shelves catch up within minutes, not an hour. */
  let shelvesStale = false;

  /* A job done one step at a time: the warm-up after loading advances it a slice at a time, and a
     request that needs it sooner finishes that same job. */
  function stepwise(build) {
    let steps = null;
    let done = false;
    let value = null;
    const advance = () => {
      steps ??= build();
      const next = steps.next();
      if (next.done) { done = true; value = next.value; steps = null; }
    };
    return {
      get() { while (!done) advance(); return value; },
      *warm() { while (!done) { advance(); yield; } }
    };
  }

  /* The database, filled a few hundred listings per step. The listings are then let go: from
     here on they are read from disk. */
  const database = stepwise(function* () {
    const built = new DatabaseSync('');
    built.exec(SCHEMA);
    const addEntry = built.prepare(`INSERT INTO entries VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const addWord = built.prepare(`INSERT INTO words VALUES (?, ?, ?)`);
    const products = new Map();
    const counts = new Map();
    const spellings = new Map();
    built.exec('BEGIN');
    for (let id = 0; id < source.length; id++) {
      const entry = source[id];
      /* Lists crawled before names were fully decoded still hold "&quot;" and "&#x2122;". */
      const name = decodeEntities(String(entry.name ?? ''));
      const key = productKey(name);
      addEntry.run(id, entry.shop ?? null, entry.url ?? null, name, entry.price ?? null,
        typeof entry.inStock === 'boolean' ? Number(entry.inStock) : null, entry.checkedAt ?? null,
        Date.parse(entry.checkedAt) || null, entry.image || null, key);
      const inName = wordSet(name);
      const all = wordSet(`${name} ${entry.url}`);
      for (const word of inName) all.add(word);
      for (const word of all) addWord.run(word, id, inName.has(word) ? 1 : 0);
      for (const word of inName) counts.set(word, (counts.get(word) ?? 0) + 1);
      countSpellings(name, spellings);
      if (key.length >= 3) {
        const product = products.get(key) ?? { key, names: [], shops: new Set(), count: 0 };
        if (product.names.length < 3) product.names.push(name);
        product.shops.add(entry.shop);
        product.count++;
        products.set(key, product);
      }
      if (id % 250 === 249) yield;
    }
    source = null;
    const ranked = [...products.values()].sort((a, b) => b.shops.size - a.shops.size || b.count - a.count);
    products.clear();
    const addProduct = built.prepare(`INSERT INTO products VALUES (?, ?, ?, ?)`);
    const addProductWord = built.prepare(`INSERT INTO product_words VALUES (?, ?)`);
    for (let pid = 0; pid < ranked.length; pid++) {
      const { key, names, shops } = ranked[pid];
      addProduct.run(pid, displayName(key, names), key, shops.size);
      for (const word of new Set(key.split(' '))) addProductWord.run(word, pid);
      if (pid % 1000 === 999) yield;
    }
    ranked.length = 0;
    const addCount = built.prepare('INSERT INTO word_counts VALUES (?, ?)');
    let step = 0;
    for (const [word, n] of counts) {
      addCount.run(word, n);
      if (++step % 2000 === 0) yield;
    }
    counts.clear();
    built.exec('COMMIT');
    yield;
    speller = createSpeller([], spellings);
    return built;
  });
  const ready = () => (db ??= database.get());

  /* Recent answers. A broad search ("samsung", "15") checks over a thousand listings, which took
     0.5–1 s on Render's small share of a CPU; many shoppers type the same ones. Kept a few
     minutes, and dropped as soon as a price they show is read again. */
  const answers = new Map();

  /* Statements are prepared once per shape: a search with three words has its own. */
  const statements = new Map();
  const statement = sql => {
    let prepared = statements.get(sql);
    if (!prepared) {
      prepared = ready().prepare(sql);
      statements.set(sql, prepared);
    }
    return prepared;
  };
  /* The listings holding every one of these words, as SQL and its values. */
  const holdingAll = words => [words.map(() => 'SELECT id FROM words WHERE word = ?').join(' INTERSECT '), words];

  const candidates = (query, oldest) => {
    const required = [...new Set(requiredWords(query))];
    if (required.length) {
      const [ids, values] = holdingAll(required);
      return statement(`SELECT * FROM entries WHERE id IN (${ids}) AND checked_ms >= ? ORDER BY id`).all(...values, oldest);
    }
    /* Only numbers and sizes ("256gb", "65w", "15"). Nearly every name has a "1" in it, so
       filtering names by their digits read most of the list ("1tb" took ~1.8 s on Render).
       Instead, each word is looked up the ways matchesQuery can find it, and only listings
       holding every word are read:
       - the word itself, or the word with a unit after it ("65" → "65w"): a word that starts with it;
       - a model code shops write apart ("f91w" as "F-91W"): a word that is its start, followed by
         a word that starts what is left. */
    const parts = [];
    const values = [];
    for (const token of [...new Set(queryTokens(query))]) {
      const ways = ['SELECT id FROM words WHERE word >= ? AND word < ?'];
      values.push(token, token + END);
      if (/\p{L}/u.test(token) && /\d/.test(token) && token.length >= 4) {
        for (let cut = 1; cut < token.length; cut++) {
          const rest = token.slice(cut);
          const starts = Array.from(rest, (_, i) => rest.slice(0, i + 1));
          ways.push(`SELECT id FROM (SELECT id FROM words WHERE word = ?
            INTERSECT SELECT id FROM words WHERE word IN (${starts.map(() => '?').join(', ')}))`);
          values.push(token.slice(0, cut), ...starts);
        }
      }
      parts.push(`SELECT id FROM (${ways.join(' UNION ')})`);
    }
    return statement(`SELECT * FROM entries WHERE id IN (${parts.join(' INTERSECT ')}) AND checked_ms >= ? ORDER BY id`)
      .all(...values, oldest);
  };

  /** Prices whose names hold every word of the query, freshest list only. */
  function searchExactly(rawQuery) {
    const query = validQuery(rawQuery);
    const matched = candidates(query, now() - maxAgeMs)
      .filter(row => matchesQuery(row.name, query))
      .map(rowToEntry);

    const offers = matched.map(entry => ({
      shop: entry.shop,
      url: entry.url,
      title: entry.name,
      price: entry.price,
      inStock: entry.inStock,
      checkedAt: entry.checkedAt,
      image: entry.image,
      variant: variantOf(entry.name, query)
    }));
    const { kept, dropped } = dropSuspiciousPrices(offers);
    const shown = kept.sort((a, b) => a.price - b.price).slice(0, maxOffers);
    const groups = groupOffers(shown);
    const listed = groups.flatMap(group => group.offers);
    const newest = listed.reduce((latest, offer) => (offer.checkedAt > latest ? offer.checkedAt : latest), '');

    return {
      query,
      source: 'index',
      checkedAt: newest || new Date(now()).toISOString(),
      cached: true,
      found: matched.length,
      priced: listed.length,
      skipped: { notShop: 0, blocked: 0, noPrice: dropped, otherProduct: 0, failed: 0 },
      groups
    };
  }

  /* How many product names use a word, for telling known words from slips. */
  const countOf = word => statement('SELECT n FROM word_counts WHERE word = ?').get(word)?.n ?? 0;

  /** Words shops write both joined and apart, written the other way: "powerbank" → "power bank",
      "ear buds" → "earbuds". Only words the list's names use count. */
  function respace(query) {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const out = [];
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const next = words[i + 1];
      if (next && countOf(word + next) >= 2) {
        out.push(word + next);
        i++;
        continue;
      }
      let best = null;
      /* Tried even when the joined word is known: this runs only when the search found nothing,
         and one shop's "Powerbank" is another's "Power Bank". */
      if (word.length >= 6 && /^\p{L}+$/u.test(word)) {
        for (let cut = 3; cut <= word.length - 3; cut++) {
          const score = Math.min(countOf(word.slice(0, cut)), countOf(word.slice(cut)));
          if (score >= 2 && score >= countOf(word) && (!best || score > best.score)) {
            best = { score, words: [word.slice(0, cut), word.slice(cut)] };
          }
        }
      }
      out.push(...(best?.words ?? [word]));
    }
    return out.join(' ');
  }

  /* A search that finds nothing is tried again with words joined or split the way the list's
     names write them, then with its spelling corrected, and says so. A search that finds
     something is never "corrected", though compound variants ("powerbank" / "power bank") merge. */
  function searchCorrecting(rawQuery) {
    const answer = searchExactly(rawQuery);
    const respaced = respace(answer.query);
    if (respaced !== answer.query.toLowerCase()) {
      const retried = searchExactly(respaced);
      if (!answer.found && retried.found) return { ...retried, correctedFrom: answer.query };
      if (answer.found && retried.found) {
        const groups = mergeGroups(answer.groups, retried.groups);
        const listed = groups.flatMap(group => group.offers);
        return { ...answer, found: answer.found + retried.found, priced: listed.length, groups };
      }
    }
    if (answer.found) return answer;
    const corrected = speller(answer.query);
    if (corrected.toLowerCase() === answer.query.toLowerCase()) return answer;
    const retried = searchExactly(corrected);
    return retried.found ? { ...retried, correctedFrom: answer.query } : answer;
  }

  /* When nothing matches, the closest thing the list has: the search with one word left out,
     keeping the narrowest that still finds something ("apple smartwatch" → "apple watch", not
     every smart watch). The answer says it is a broader search, so the page can say so while the
     web search looks for the real thing. */
  function searchClosest(rawQuery) {
    const answer = searchCorrecting(rawQuery);
    if (answer.found) return answer;
    const words = respace(answer.query).split(/\s+/);
    if (words.length < 2) return answer;
    const pickBest = indices => {
      let best = null;
      for (const skip of indices) {
        let broader;
        try {
          broader = searchCorrecting(words.filter((_, i) => i !== skip).join(' '));
        } catch {
          continue;
        }
        if (broader.found && (!best || broader.found < best.found)) best = broader;
      }
      return best;
    };
    const all = words.map((_, i) => i);
    const sizes = all.filter(i => /^\d+(?:\.\d+)?(?:gb|tb|mah|w|mm|inch)$/i.test(words[i]));
    const rest = all.filter(i => i > 0 && !sizes.includes(i));
    const best = (sizes.length && pickBest(sizes)) || (rest.length && pickBest(rest)) || pickBest([0]);
    return best ? { ...best, broadenedFrom: answer.query } : answer;
  }

  /** The commonest word that starts with `start` (itself included) among the listings holding
      every word in `before`: "a1" after "galaxy" is "a16", while "ip" alone is "iphone". */
  function completeWord(start, before) {
    const range = [start, start + END];
    let counts = null;
    if (before.length) {
      const [ids, values] = holdingAll([...new Set(before)]);
      /* A pool with no listings falls back to the whole list. */
      if (statement(`SELECT 1 FROM (${ids}) LIMIT 1`).get(...values)) {
        counts = statement(`SELECT word, count(*) AS n FROM words WHERE in_name = 1 AND word >= ? AND word < ?
          AND id IN (${ids}) GROUP BY word`).all(...range, ...values);
      }
    }
    counts ??= statement('SELECT word, n FROM word_counts WHERE word >= ? AND word < ?').all(...range);
    let best = start;
    let bestCount = 0;
    for (const { word, n } of counts) {
      if (before.includes(word)) continue;
      if (n > bestCount || (n === bestCount && word.length < best.length)) { best = word; bestCount = n; }
    }
    return best;
  }

  /* Up to six products for the list under the box, most widely sold first: each holds every
     finished word, and a word that starts with the one still being typed. */
  function suggest(typed) {
    const typedWords = String(typed).toLowerCase().split(/[^\p{L}\p{N}+]+/u).filter(Boolean);
    if (!typedWords.length) return [];
    const last = typedWords.pop();
    const finished = [...new Set(typedWords)];
    const each = finished.map(() => ' AND id IN (SELECT pid FROM product_words WHERE word = ?)').join('');
    return statement(`SELECT name, words, shops FROM products
      WHERE id IN (SELECT pid FROM product_words WHERE word >= ? AND word < ?)${each} ORDER BY id LIMIT 6`)
      .all(last, last + END, ...finished)
      .map(row => ({ name: row.name, words: row.words.split(' '), shops: row.shops }));
  }

  /* While a word is still being typed, it is completed to the commonest word that starts that
     way ("iph" → "iphone", "galaxy a1" → "galaxy a16"), and the answer says what was typed. */
  function searchAsTyped(rawQuery, closest) {
    const fallback = closest ? searchClosest : searchCorrecting;
    const typed = String(rawQuery ?? '').trim();
    const words = typed.split(/\s+/);
    const last = words.at(-1).toLowerCase();
    const before = [...wordSet(words.slice(0, -1).join(' '))];
    const suggested = suggest(typed);
    /* Completions to try, best first: the word the top suggestion uses, so the results agree
       with the list under the box, then the commonest word that starts that way. The first that
       finds prices wins; if none does, the search runs as typed. */
    const suggestions = suggested.map(({ name, shops }) => ({ name, shops }));
    if (!/^[\p{L}\p{N}]+$/u.test(last) || (last.length < 2 && !before.length)) return { ...fallback(typed), suggestions };
    /* A last word the list knows in full ("5600", "pro") is what the shopper meant: when it finds
       prices as typed, it is not stretched into a longer word ("5600" → "5600gt", another CPU). */
    if (last.length >= 3 && countOf(last) >= 2) {
      const asTyped = searchCorrecting(typed);
      if (asTyped.found) return { ...asTyped, suggestions };
    }
    const options = [
      suggested[0]?.words.find(word => word.startsWith(last) && !before.includes(word)),
      completeWord(last, before)
    ].filter((word, i, all) => word && word !== last && all.indexOf(word) === i);
    for (const word of options) {
      const completed = [...words.slice(0, -1), word].join(' ');
      const answer = searchCorrecting(completed);
      if (answer.found) return { ...answer, completedFrom: typed, suggestions };
    }
    return { ...fallback(typed), suggestions };
  }

  /* Prices re-read from the shops' pages, written to the list until the next one loads. */
  function update(fresh) {
    const find = statement('SELECT id, price, in_stock, image FROM entries WHERE url = ? ORDER BY id DESC LIMIT 1');
    const write = statement(`UPDATE entries SET price = ?, in_stock = ?, checked_at = ?, checked_ms = ?,
      image = coalesce(nullif(image, ''), ?) WHERE id = ?`);
    let changed = 0;
    let pictured = 0;
    const written = new Set();
    db.exec('BEGIN');
    try {
      for (const item of fresh) {
        const row = item?.url ? find.get(item.url) : undefined;
        if (!row || !(item.price > 0)) continue;
        const inStock = typeof item.inStock === 'boolean' ? Number(item.inStock) : null;
        if (row.price !== item.price || row.in_stock !== inStock) changed++;
        if (item.image && !row.image) pictured++;
        write.run(item.price, inStock, item.checkedAt, Date.parse(item.checkedAt) || null, item.image || null, row.id);
        written.add(item.url);
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    if (changed || pictured) shelvesStale = true;
    /* An answer that shows a page just read again is worked out afresh next time. */
    if (written.size) {
      for (const [key, saved] of answers) {
        if ([...written].some(url => saved.urls.has(url))) answers.delete(key);
      }
    }
    return changed;
  }

  const index = {
    size,
    shops: shopNames.length,
    /** When the list was saved, for a health check to see how old the prices are. */
    updatedAt,

    /** `partial` while the last word may still be half typed; `closest` to fall back to a broader
        search rather than nothing, for a shopper (never for merging with a web search). */
    search: (rawQuery, { partial = false, closest = false } = {}) => {
      /* A search typed in Bangla runs in the shops' English and says what it was read as, the way
         a spelling correction does: "আইফোন ১৫" → "iphone 15". */
      const typed = cleanQuery(rawQuery);
      const key = `${partial ? 'p' : '-'}${closest ? 'c' : '-'}${typed}`;
      const saved = answers.get(key);
      if (saved && now() - saved.at < ANSWER_TTL_MS) {
        answers.delete(key);
        answers.set(key, saved);
        return saved.answer;
      }
      const query = fromBangla(typed, { partial });
      ready();
      const found = partial ? searchAsTyped(query, closest) : closest ? searchClosest(query) : searchCorrecting(query);
      const answer = query === typed ? found : { ...found, correctedFrom: typed };
      answers.delete(key);
      if (answers.size >= MAX_ANSWERS) answers.delete(answers.keys().next().value);
      answers.set(key, { at: now(), answer, urls: new Set(answer.groups.flatMap(group => group.offers.map(offer => offer.url))) });
      return answer;
    },
    update: fresh => {
      ready();
      return update(fresh);
    },

    /** Builds the shelves again at the next ask, as after a batch of photos arrives. */
    reshelve() {
      shelves = null;
      shelvedAt = now();
      shelvesStale = false;
    },

    /** The home page's shelves. Rebuilt hourly: the list doesn't change, but prices age out of it,
        and a card must never offer a price its own search would leave out. Built here at once,
        for tests and tools; a server uses browseSoon, which never makes a request wait. */
    browse() {
      if (shelvesDue()) shelves = null;
      if (!shelves) {
        shelvedAt = now();
        shelvesStale = false;
        shelves = runNow(shelfSteps());
      }
      return shelves;
    },

    /** The shelves as they are, rebuilding in the background when due; waits only if there are none yet. */
    browseSoon() {
      if (!shelves) return index.rebuildShelves();
      if (shelvesDue()) index.rebuildShelves().catch(() => {});
      return Promise.resolve(shelves);
    },

    /** Builds the shelves a few milliseconds at a time; the old ones are served until it is done. */
    rebuildShelves() {
      if (!rebuilding) {
        shelvedAt = now();
        shelvesStale = false;
        rebuilding = runInSlices(shelfSteps())
          .then(built => (shelves = built))
          .finally(() => { rebuilding = null; });
      }
      return rebuilding;
    },

    /** The last list's shelves, shown while this list's are built, so the home page never goes blank. */
    adoptShelves(previous) {
      const theirs = previous?.currentShelves?.();
      if (!shelves && theirs) {
        shelves = theirs;
        shelvedAt = -Infinity;
      }
    },

    currentShelves: () => shelves,

    /** Builds the database in slices so the first visitor never waits. */
    warm() {
      return runInSlices((function* () {
        yield* database.warm();
        ready();
      })());
    },

    /** Lets the database go, deleting its file. */
    close() {
      statements.clear();
      if (db?.isOpen) db.close();
    }
  };

  function shelvesDue() {
    return now() - shelvedAt >= 60 * 60 * 1000 || (shelvesStale && now() - shelvedAt >= 5 * 60 * 1000);
  }

  function* shelfSteps() {
    ready();
    const fresh = now() - maxAgeMs;
    const counts = Object.fromEntries(shopNames.map(shop => [shop, 0]));
    for (const { shop, n } of statement('SELECT shop, count(*) AS n FROM entries WHERE checked_ms >= ? GROUP BY shop').all(fresh)) {
      if (shop in counts) counts[shop] = n;
    }
    /* A page of listings at a time, so the list is never all in memory at once. */
    const page = statement('SELECT id, shop, name FROM entries WHERE id > ? AND checked_ms >= ? ORDER BY id LIMIT 2000');
    const freshEntries = (function* () {
      for (let after = -1; ;) {
        const rows = page.all(after, fresh);
        if (!rows.length) return;
        yield* rows;
        after = rows.at(-1).id;
      }
    })();
    const categories = yield* discoverCategoriesSteps(freshEntries);
    /* Shelf cards filter offers down to `offer.product === productKey(name)`, so only that key's
       own listings are read. */
    const bucket = statement('SELECT * FROM entries WHERE pkey = ? AND checked_ms >= ? ORDER BY id');
    const searchBucket = rawQuery => {
      const query = validQuery(rawQuery);
      const key = productKey(query);
      const rows = key.split(' ').length < 2 || key.length < 5 ? [] : bucket.all(key, fresh);
      const matched = rows.filter(row => matchesQuery(row.name, query)).map(rowToEntry);
      const offers = matched.map(entry => ({
        shop: entry.shop,
        url: entry.url,
        title: entry.name,
        price: entry.price,
        inStock: entry.inStock,
        checkedAt: entry.checkedAt,
        image: entry.image,
        variant: variantOf(entry.name, query)
      }));
      const { kept } = dropSuspiciousPrices(offers);
      const shown = kept.sort((a, b) => a.price - b.price).slice(0, maxOffers);
      return { query, groups: groupOffers(shown) };
    };
    return yield* buildBrowseSteps(searchBucket, counts, categories);
  }
  return index;
}

/**
 * Search over the saved list that follows new crawls without a restart. The file is checked at
 * most once per `checkEveryMs`, and a damaged one is skipped: the last good list keeps serving.
 */
export function watchIndexFile(file, { now = Date.now, checkEveryMs = 30_000, log = () => {}, onLoad = () => {}, ...options } = {}) {
  let index = createPriceIndex(null, { now, ...options });
  let loadedVersion = null;
  let checkedAt = -Infinity;
  let refreshing = null;
  let loads = 0;

  async function doRefresh() {
    checkedAt = now();
    const version = await stat(file).then(info => `${info.mtimeMs}:${info.size}`, () => 'none');
    if (version === loadedVersion) return;
    try {
      const loaded = createPriceIndex(await loadIndexFile(file), { now, ...options });
      loadedVersion = version;
      /* A list that changes again while this one is built is built too; only the newest may
         take over, or a slower older build would finish last and replace it. */
      const generation = ++loads;
      /* The first list is searched at once, built on demand if a search comes first. A newer one
         is built a slice at a time in the background while the last keeps answering, so no
         search waits on it; then it takes over. */
      const takeOver = () => {
        if (generation !== loads) {
          loaded.close();
          return false;
        }
        const previous = index;
        index = loaded;
        log(`price list: ${loaded.size} prices from ${loaded.shops} shops`);
        /* The home page keeps the last list's shelves until the new ones are built. */
        loaded.adoptShelves(previous);
        /* A price re-check that started on the last list may still be reading shop pages. */
        setTimeout(() => previous.close(), 10 * 60 * 1000).unref?.();
        return true;
      };
      const first = index.size === 0;
      if (first) takeOver();
      setTimeout(async () => {
        try {
          await loaded.warm();
          if (!first && !takeOver()) return;
          await loaded.rebuildShelves();
        } catch (error) {
          if (index !== loaded) {
            log(`price list not reloaded: ${error.message}`);
            loaded.close();
            return;
          }
        }
        /* Then whatever should follow a new list, such as finding photos its cards lack. */
        Promise.resolve().then(() => onLoad(loaded)).catch(error => log(`after loading the price list: ${error.message}`));
      }, 0).unref?.();
    } catch (error) {
      log(`price list not reloaded: ${error.message}`);
    }
  }

  function refresh() {
    if (refreshing) return refreshing;
    if (now() - checkedAt < checkEveryMs) return Promise.resolve();
    refreshing = doRefresh().finally(() => { refreshing = null; });
    return refreshing;
  }

  const search = async (rawQuery, options) => {
    await refresh();
    return index.search(rawQuery, options);
  };
  search.browse = async () => {
    await refresh();
    return index.browseSoon();
  };
  /** The list being served, for work that changes it in memory, such as a price re-check. */
  search.index = async () => {
    await refresh();
    return index;
  };
  return search;
}
