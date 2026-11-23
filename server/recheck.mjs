/* Live price re-check: the pages behind a search's first results are read again from the shops
   while the shopper looks at them, so the prices shown are minutes old instead of a night old.
   It needs no paid search, because the price list already knows each product's page. It stays
   polite: a page read in the last half hour is not read again, a few pages per shop at most, two
   at a time, robots.txt honoured, and two shoppers asking for the same page share one read. */

import { readShopifyProduct } from './crawler.mjs';
import { INDEX_SHOPS } from './index-shops.mjs';
import { absoluteImage, readPage } from './page-price.mjs';

const pageOf = url => url.replace(/\?variant=\d+$/, '');

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

/** The products a search shows first, in the same order as the page: most shops, then cheapest. */
function productsInOrder(answer, product) {
  const byProduct = new Map();
  for (const offer of answer.groups.flatMap(group => group.offers)) {
    if (product && offer.product !== product) continue;
    byProduct.set(offer.product, [...(byProduct.get(offer.product) ?? []), offer]);
  }
  const shopsOf = offers => new Set(offers.map(offer => offer.shop)).size;
  const lowest = offers => Math.min(...offers.map(offer => offer.price));
  return [...byProduct.values()].sort((a, b) => shopsOf(b) - shopsOf(a) || lowest(a) - lowest(b));
}

/**
 * @param fetchPage resolves to { ok, status, text } and may throw
 * @param robots { allows(url) }
 */
export function createRechecker({
  fetchPage, robots, shops = INDEX_SHOPS, now = Date.now,
  maxPages = 24, perShop = 6, concurrency = 2, freshForMs = 30 * 60 * 1000
}) {
  const kindOf = new Map(shops.map(shop => [shop.shop, shop.kind]));
  const reading = new Map();

  /** Every price one page gives: a Shopify page prices each version, any other page one price. */
  async function read(page, shop) {
    const shopify = kindOf.get(shop) === 'shopify';
    const target = shopify ? `${page.replace(/\/+$/, '')}.js` : page;
    if (!(await robots.allows(target))) return [];
    const response = await fetchPage(target);
    if (!response.ok) return [];
    const checkedAt = new Date(now()).toISOString();
    if (shopify) {
      return readShopifyProduct(response.text, page).map(item => ({ url: item.url, price: item.price, inStock: item.inStock, image: item.image, checkedAt }));
    }
    const found = readPage(response.text);
    if (found.price === null) return [];
    return [{ url: page, price: found.price, inStock: found.inStock, image: absoluteImage(found.image, page), checkedAt }];
  }

  const readOnce = (page, shop) => {
    if (!reading.has(page)) {
      reading.set(page, read(page, shop).catch(() => []).finally(() => reading.delete(page)));
    }
    return reading.get(page);
  };

  /**
   * Re-reads the pages behind a search's first results (or one product's, when `product` names
   * it), applies what they say to the price list, and answers the search again.
   */
  return async function recheck(index, rawQuery, { product = '' } = {}) {
    const answer = index.search(rawQuery);
    const stale = offer => !offer.checkedAt || now() - Date.parse(offer.checkedAt) > freshForMs;

    const pages = new Map();
    const perShopCount = new Map();
    for (const offers of productsInOrder(answer, product)) {
      for (const offer of [...offers].sort((a, b) => a.price - b.price)) {
        if (pages.size >= maxPages) break;
        const page = pageOf(offer.url);
        const used = perShopCount.get(offer.shop) ?? 0;
        if (pages.has(page) || !stale(offer) || used >= perShop) continue;
        pages.set(page, offer.shop);
        perShopCount.set(offer.shop, used + 1);
      }
    }

    const byShop = new Map();
    for (const [page, shop] of pages) byShop.set(shop, [...(byShop.get(shop) ?? []), page]);
    const read = await Promise.all([...byShop].map(([shop, list]) => mapLimited(list, concurrency, page => readOnce(page, shop))));
    const changed = index.update(read.flat(2));

    return { ...index.search(answer.query), rechecked: pages.size, changed };
  };
}
