/* The two-step search: find candidate pages with a search provider, then read each page's own
   price. Only prices read from a page, for the product asked about, ever reach a customer. */

import { matchesQuery, queryTokens, variantOf } from './matching.mjs';
import { readPage } from './page-price.mjs';

/* Social sites, and price guides whose figures are not a shop's offer. */
const NOT_SHOPS = /(^|\.)(youtube|facebook|tiktok|instagram|reddit|wikipedia|x|twitter|pinterest|quora|gsmarena|mobiledokan)\.[a-z.]+$/i;

export class LiveSearchError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/* A second line behind the engine's own filter: these are refused before any request to them. */
const ADULT = /(porn|xnxx|xvideos|xhamster|eporner|redtube|tiava|bokep|onlyfans|sex)/i;

const utcDay = time => new Date(time).toISOString().slice(0, 10);
const hostOf = url => new URL(url).hostname.replace(/^www\./, '');

async function mapLimited(items, limit, work) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await work(items[index]);
    }
  }));
  return results;
}

/** Same version together; the lowest price is only named where there is a real choice. */
export function groupOffers(offers) {
  const groups = new Map();
  for (const offer of offers) {
    const key = offer.variant.clear ? offer.variant.key : '';
    const group = groups.get(key) ?? { label: offer.variant.label, comparable: Boolean(key), offers: [] };
    group.offers.push({ shop: offer.shop, url: offer.url, title: offer.title, price: offer.price, inStock: offer.inStock });
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    group.offers.sort((a, b) => a.price - b.price);
    const buyable = group.offers.filter(offer => offer.inStock !== false);
    group.lowest = group.comparable && buyable.length > 1 ? buyable[0].url : null;
  }
  const lead = group => group.offers[0].price;
  return [...groups.values()].sort((a, b) => Number(b.comparable) - Number(a.comparable) || lead(a) - lead(b));
}

export function createLiveSearch(deps) {
  const {
    search, resolveLink, fetchPage, robots, now = Date.now,
    maxPages = 10, concurrency = 5, ttlMs = 3 * 60 * 60 * 1000, maxEntries = 500, dailyLimit = 300
  } = deps;

  const cache = new Map();
  const running = new Map();
  let budget = { day: '', used: 0 };

  async function inspect(result, query) {
    let url;
    try {
      url = await resolveLink(result.link);
      if (!url) return { skip: 'failed' };
      const { hostname } = new URL(url);
      if (NOT_SHOPS.test(hostname) || ADULT.test(hostname)) return { skip: 'notShop' };
      if (!(await robots.allows(url))) return { skip: 'blocked' };

      const page = await fetchPage(url);
      if (!page.ok) return { skip: 'failed' };

      const read = readPage(page.text);
      if (read.price === null) return { skip: 'noPrice' };

      const title = read.name || read.title;
      if (!matchesQuery(title, query)) return { skip: 'otherProduct' };

      return {
        offer: {
          shop: hostOf(page.url),
          url: page.url,
          title,
          price: read.price,
          inStock: read.inStock,
          variant: variantOf(title, query)
        }
      };
    } catch {
      return { skip: 'failed' };
    }
  }

  async function fresh(query) {
    const today = utcDay(now());
    if (budget.day !== today) budget = { day: today, used: 0 };
    if (budget.used >= dailyLimit) throw new LiveSearchError('budget', 'Daily live search limit reached');
    budget.used++;

    const results = await search(query);
    const inspected = await mapLimited(results.slice(0, maxPages), concurrency, result => inspect(result, query));

    const seen = new Set();
    const offers = [];
    const skipped = { notShop: 0, blocked: 0, noPrice: 0, otherProduct: 0, failed: 0 };
    for (const item of inspected) {
      if (item.skip) skipped[item.skip]++;
      else if (!seen.has(item.offer.url)) {
        seen.add(item.offer.url);
        offers.push(item.offer);
      }
    }

    return {
      query,
      checkedAt: new Date(now()).toISOString(),
      found: results.length,
      priced: offers.length,
      skipped,
      groups: groupOffers(offers)
    };
  }

  const clean = rawQuery => String(rawQuery ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);

  function save(key, value) {
    cache.delete(key);
    if (cache.size >= maxEntries) cache.delete(cache.keys().next().value);
    cache.set(key, { at: now(), value });
  }

  return {
    /** Refreshes saved results in the background, so these searches never make anyone wait.
        One at a time, and one failure doesn't stop the rest. */
    async warm(queries, log = () => {}) {
      for (const raw of queries) {
        const query = clean(raw);
        try {
          save(query.toLowerCase(), await fresh(query));
          log(`refreshed "${query}"`);
        } catch (error) {
          log(`could not refresh "${query}": ${error.message}`);
        }
      }
    },

    async run(rawQuery) {
      const query = clean(rawQuery);
      if (query.length < 2 || !queryTokens(query).length) throw new LiveSearchError('query', 'Search for a product name');

      const key = query.toLowerCase();
      const saved = cache.get(key);
      if (saved && now() - saved.at < ttlMs) return { ...saved.value, cached: true };
      if (running.has(key)) return running.get(key);

      const work = fresh(query)
        .then(value => {
          save(key, value);
          return { ...value, cached: false };
        })
        .finally(() => running.delete(key));
      running.set(key, work);
      return work;
    }
  };
}
