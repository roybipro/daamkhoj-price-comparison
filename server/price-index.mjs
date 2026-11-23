/* The saved price list, and the instant search over it. The file holds what the crawler read:

     { version: 1, shops: { "dazzle.com.bd": { crawledAt, stats, entries: [
         { shop, url, name, price, inStock, checkedAt } ] } } }

   with times as ISO strings. Searching it needs no network and no paid request. */

import { readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dropSuspiciousPrices, groupOffers, validQuery } from './live-search.mjs';
import { buildBrowse } from './browse.mjs';
import { matchesQuery, mentionsInTokens, variantOf, wordSet } from './matching.mjs';

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
 * Instant search over a loaded list. Prices older than `maxAgeMs` are left out rather than
 * shown as current, and at most `maxOffers` are returned, cheapest first within each version.
 */
export function createPriceIndex(data, { now = Date.now, maxAgeMs = 7 * 24 * 60 * 60 * 1000, maxOffers = 120 } = {}) {
  const entries = Object.values(data?.shops ?? {}).flatMap(shop => shop.entries ?? []);
  let shelves = null;
  /* Each entry's words, split once: a search then only checks those words. */
  let words = null;

  const index = {
    size: entries.length,
    shops: Object.keys(data?.shops ?? {}).length,

    search(rawQuery) {
      const query = validQuery(rawQuery);
      const oldest = now() - maxAgeMs;
      words ??= entries.map(entry => wordSet(`${entry.name} ${entry.url}`));
      const matched = entries.filter((entry, i) =>
        mentionsInTokens(words[i], query)
        && Date.parse(entry.checkedAt) >= oldest
        && matchesQuery(entry.name, query));

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
    },

    /** The home page's shelves. Worked out once per list, since a list never changes. */
    browse() {
      const fresh = now() - maxAgeMs;
      const counts = Object.fromEntries(Object.entries(data?.shops ?? {}).map(([shop, { entries: listed = [] }]) =>
        [shop, listed.filter(entry => Date.parse(entry.checkedAt) >= fresh).length]));
      shelves ??= buildBrowse(query => index.search(query), counts);
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
