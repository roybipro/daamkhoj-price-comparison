/* The two-step search: find candidate pages with a search provider, then read each page's own
   price. Only prices read from a page, for the product asked about, ever reach a customer. */

import { matchesQuery, mentionsProduct, queryTokens, variantOf } from './matching.mjs';
import { productKey } from './browse.mjs';
import { absoluteImage, readPage } from './page-price.mjs';

/* Social sites, and price guides whose figures are not a shop's offer. */
const NOT_SHOPS = /(^|\.)((youtube|facebook|tiktok|instagram|reddit|wikipedia|x|twitter|pinterest|quora|gsmarena|mobiledokan|mobilebd|mobileinto|mobilekotha|mrp)\.[a-z.]+|mobile\.bd)$/i;

export class LiveSearchError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export const cleanQuery = rawQuery => String(rawQuery ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);

/** The query to search for, or a LiveSearchError when there is nothing to search for. */
export function validQuery(rawQuery) {
  const query = cleanQuery(rawQuery);
  if (query.length < 2 || !queryTokens(query).length) throw new LiveSearchError('query', 'Search for a product name');
  return query;
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

/* A real product can sell well below its usual price, but under half is far more likely to be a
   deposit, a part or a mistake, and it would be named the lowest price. */
export function dropSuspiciousPrices(offers) {
  /* Only like is compared with like: in a search for "realme buds", ৳1,400 earbuds are not
     suspicious beside ৳8,000 ones, so each product is judged against its own prices. */
  const byProduct = new Map();
  for (const offer of offers) {
    const key = offer.product ?? productKey(offer.title ?? '');
    byProduct.set(key, [...(byProduct.get(key) ?? []), offer]);
  }
  const kept = [...byProduct.values()].flatMap(same => {
    if (same.length < 3) return same;
    const sorted = same.map(offer => offer.price).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    return same.filter(offer => offer.price >= median / 2);
  });
  /* Kept in the order they came, so a cheapest-first list stays cheapest first. */
  const keep = new Set(kept);
  const ordered = offers.filter(offer => keep.has(offer));
  return { kept: ordered, dropped: offers.length - ordered.length };
}

/* Sorted cheapest first; the lowest price is only named where there is a real choice. */
function finishGroups(groups) {
  for (const group of groups) {
    group.offers.sort((a, b) => a.price - b.price);
    /* One shop selling a version in several colours or pages is still one shop: its cheapest
       price you can buy stands for it, or its cheapest at all when none is in stock. */
    /* Per product, not per group: where versions are unclear, one group holds many products, and
       each of a shop's different products must stay. */
    const pick = new Map();
    const slot = offer => `${offer.shop}|${offer.product ?? productKey(offer.title ?? '')}`;
    for (const offer of group.offers) {
      const held = pick.get(slot(offer));
      if (!held || (held.inStock === false && offer.inStock !== false)) pick.set(slot(offer), offer);
    }
    group.offers = group.offers.filter(offer => pick.get(slot(offer)) === offer);
    const buyable = group.offers.filter(offer => offer.inStock !== false);
    group.lowest = group.comparable && buyable.length > 1 ? buyable[0].url : null;
  }
  const lead = group => group.offers[0].price;
  return groups.sort((a, b) => Number(b.comparable) - Number(a.comparable) || lead(a) - lead(b));
}

/* `product` names the product a price is for, so a page can show one card per product. */
const shown = ({ shop, url, title, price, inStock, checkedAt, image, product }) => ({
  shop, url, title, price, inStock, product: product ?? productKey(title), ...(checkedAt && { checkedAt }), ...(image && { image })
});

/** Same version together. */
export function groupOffers(offers) {
  const groups = new Map();
  for (const offer of offers) {
    const key = offer.variant.clear ? offer.variant.key : '';
    const group = groups.get(key) ?? { label: offer.variant.label, comparable: Boolean(key), offers: [] };
    group.offers.push(shown(offer));
    groups.set(key, group);
  }
  return finishGroups([...groups.values()]);
}

/** Joins already grouped results, such as the price list's and a web search's. The same page in
    both counts once, and the first list's copy wins, so put the freshest first. */
export function mergeGroups(...lists) {
  const groups = new Map();
  for (const group of lists.flat()) {
    const key = `${group.comparable}|${group.label.toLowerCase()}`;
    const into = groups.get(key) ?? { label: group.label, comparable: group.comparable, offers: [] };
    for (const offer of group.offers) {
      if (!into.offers.some(other => other.url === offer.url)) into.offers.push({ ...offer });
    }
    groups.set(key, into);
  }
  return finishGroups([...groups.values()]);
}

export function createLiveSearch(deps) {
  const {
    search, resolveLink, fetchPage, robots, now = Date.now,
    maxPages = 15, concurrency = 5, ttlMs = 3 * 60 * 60 * 1000, maxEntries = 500, dailyLimit = 300
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
          image: absoluteImage(read.image, page.url),
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
    const cost = search.requests ?? 1;
    if (budget.used + cost > dailyLimit) throw new LiveSearchError('budget', 'Daily live search limit reached');
    budget.used += cost;

    /* A retried empty answer is paid for too, so the limit counts what was really spent. */
    let paid = 0;
    const results = await search(query, { onRequest: () => { paid++; } })
      .finally(() => { if (paid > cost) budget.used += paid - cost; });
    /* Off-topic results are never opened and don't use up a slot. Exact matches go first. */
    const describe = result => `${result.title} ${result.description} ${result.link}`;
    const onTopic = results.filter(result => mentionsProduct(describe(result), query));
    const ranked = [
      ...onTopic.filter(result => matchesQuery(describe(result), query)),
      ...onTopic.filter(result => !matchesQuery(describe(result), query))
    ];
    const inspected = await mapLimited(ranked.slice(0, maxPages), concurrency, result => inspect(result, query));

    const seen = new Set();
    const read = [];
    const skipped = { notShop: 0, blocked: 0, noPrice: 0, otherProduct: results.length - onTopic.length, failed: 0 };
    for (const item of inspected) {
      if (item.skip) skipped[item.skip]++;
      else if (!seen.has(item.offer.url)) {
        seen.add(item.offer.url);
        read.push(item.offer);
      }
    }
    const { kept: offers, dropped } = dropSuspiciousPrices(read);
    skipped.noPrice += dropped;

    const groups = groupOffers(offers);
    return {
      query,
      checkedAt: new Date(now()).toISOString(),
      found: results.length,
      priced: groups.reduce((sum, group) => sum + group.offers.length, 0),
      skipped,
      groups
    };
  }

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
        const query = cleanQuery(raw);
        try {
          save(query.toLowerCase(), await fresh(query));
          log(`refreshed "${query}"`);
        } catch (error) {
          log(`could not refresh "${query}": ${error.message}`);
        }
      }
    },

    async run(rawQuery) {
      const query = validQuery(rawQuery);

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
