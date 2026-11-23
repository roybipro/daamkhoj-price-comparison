/* The saved price list, and the instant search over it. The file holds what the crawler read:

     { version: 1, shops: { "dazzle.com.bd": { crawledAt, stats, entries: [
         { shop, url, name, price, inStock, checkedAt } ] } } }

   with times as ISO strings. Searching it needs no network and no paid request. */

import { readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dropSuspiciousPrices, groupOffers, validQuery } from './live-search.mjs';
import { buildBrowse, discoverCategories } from './browse.mjs';
import { createSpeller, matchesQuery, mentionsInTokens, requiredWords, variantOf, wordSet } from './matching.mjs';

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

/** Written beside the real file and then swapped in, so a crash never leaves half a list. */
export async function saveIndexFile(file, data) {
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(data));
  await rename(temporary, file);
}

/**
 * Fetches a published copy of the list (the one the nightly crawl commits) and saves it over the
 * local file, so a server that is never redeployed still gets each night's prices. A download
 * that is not a price list is refused and the last good file stays. Says whether it changed.
 */
export async function pullIndexFile(url, file, { fetchImpl = fetch, timeoutMs = 60_000, maxBytes = 100_000_000 } = {}) {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`price list download answered ${response.status}`);
  const text = await response.text();
  if (text.length > maxBytes) throw new Error('price list download is too large');
  const data = JSON.parse(text);
  if (data?.version !== 1 || typeof data.shops !== 'object' || data.shops === null) throw new Error('the download is not a price list');
  const current = await readFile(file, 'utf8').catch(() => '');
  if (current === text) return false;
  const temporary = `${file}.${process.pid}.pull.tmp`;
  await writeFile(temporary, text);
  await rename(temporary, file);
  return true;
}

/**
 * Instant search over a loaded list. Prices older than `maxAgeMs` are left out rather than
 * shown as current, and at most `maxOffers` are returned, cheapest first within each version.
 */
export function createPriceIndex(data, { now = Date.now, maxAgeMs = 7 * 24 * 60 * 60 * 1000, maxOffers = 300 } = {}) {
  const entries = Object.values(data?.shops ?? {}).flatMap(shop => shop.entries ?? []);
  let shelves = null;
  let shelvedAt = -Infinity;
  /* Each entry's words, split once, and for each word the entries that use it: a search starts
     from its rarest word's entries instead of reading every name in the list. */
  let words = null;
  let postings = null;
  const candidates = query => {
    if (!words) {
      words = entries.map(entry => wordSet(`${entry.name} ${entry.url}`));
      postings = new Map();
      words.forEach((set, i) => {
        for (const word of set) {
          const list = postings.get(word);
          if (list) list.push(i);
          else postings.set(word, [i]);
        }
      });
    }
    const lists = requiredWords(query).map(word => postings.get(word) ?? []);
    if (!lists.length) return entries.map((_, i) => i);
    return lists.reduce((smallest, list) => (list.length < smallest.length ? list : smallest));
  };
  let speller = null;

  /** Prices whose names hold every word of the query, freshest list only. */
  function searchExactly(rawQuery) {
    const query = validQuery(rawQuery);
    const oldest = now() - maxAgeMs;
    const matched = candidates(query)
      .filter(i => mentionsInTokens(words[i], query) && Date.parse(entries[i].checkedAt) >= oldest && matchesQuery(entries[i].name, query))
      .map(i => entries[i]);

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

  /* A search that finds nothing is tried again with its spelling corrected from the names in
     the list, and says so. A search that finds something is never "corrected". */
  function searchCorrecting(rawQuery) {
    const answer = searchExactly(rawQuery);
    if (answer.found) return answer;
    speller ??= createSpeller(entries.map(entry => entry.name));
    const corrected = speller(answer.query);
    if (corrected.toLowerCase() === answer.query.toLowerCase()) return answer;
    const retried = searchExactly(corrected);
    return retried.found ? { ...retried, correctedFrom: answer.query } : answer;
  }

  const index = {
    size: entries.length,
    shops: Object.keys(data?.shops ?? {}).length,

    search: rawQuery => searchCorrecting(rawQuery),

    /** The home page's shelves. Rebuilt hourly: the list doesn't change, but prices age out of it,
        and a card must never offer a price its own search would leave out. */
    browse() {
      if (now() - shelvedAt >= 60 * 60 * 1000) {
        shelves = null;
        shelvedAt = now();
      }
      const fresh = now() - maxAgeMs;
      const counts = Object.fromEntries(Object.entries(data?.shops ?? {}).map(([shop, { entries: listed = [] }]) =>
        [shop, listed.filter(entry => Date.parse(entry.checkedAt) >= fresh).length]));
      shelves ??= buildBrowse(query => searchExactly(query), counts,
        discoverCategories(entries.filter(entry => Date.parse(entry.checkedAt) >= fresh)));
      return shelves;
    }
  };
  return index;
}

/**
 * Search over the saved list that follows new crawls without a restart. The file is checked at
 * most once per `checkEveryMs`, and a damaged one is skipped: the last good list keeps serving.
 */
export function watchIndexFile(file, { now = Date.now, checkEveryMs = 30_000, log = () => {}, ...options } = {}) {
  let index = createPriceIndex(null, { now, ...options });
  let loadedVersion = null;
  let checkedAt = -Infinity;

  async function refresh() {
    if (now() - checkedAt < checkEveryMs) return;
    checkedAt = now();
    const version = await stat(file).then(info => `${info.mtimeMs}:${info.size}`, () => 'none');
    if (version === loadedVersion) return;
    try {
      index = createPriceIndex(await loadIndexFile(file), { now, ...options });
      loadedVersion = version;
      log(`price list: ${index.size} prices from ${index.shops} shops`);
      /* Shelve now, in the background, so the first visitor's home page doesn't wait for it. */
      const loaded = index;
      setTimeout(() => { try { loaded.browse(); } catch { /* reported when asked for */ } }, 0).unref?.();
    } catch (error) {
      log(`price list not reloaded: ${error.message}`);
    }
  }

  const search = async rawQuery => {
    await refresh();
    return index.search(rawQuery);
  };
  search.browse = async () => {
    await refresh();
    return index.browse();
  };
  return search;
}
