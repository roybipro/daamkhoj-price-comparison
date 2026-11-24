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
  maxPages = 30, perShop = 20, concurrency = 3, freshForMs = 30 * 60 * 1000
}) {
  const kindOf = new Map(shops.map(shop => [shop.shop, shop.kind]));
  const reading = new Map();

  /* A shop that keeps refusing this server (some block data-centre addresses) is left alone for an
     hour, so re-checks don't wait on it and photos come from another shop's page instead. */
  const trouble = new Map();
  const reachable = shop => !((trouble.get(shop)?.until ?? 0) > now());
  function noteAnswer(shop, ok) {
    if (ok) {
      trouble.delete(shop);
      return;
    }
    const record = trouble.get(shop) ?? { failures: 0, until: 0 };
    record.failures++;
    if (record.failures >= 3) {
      record.failures = 0;
      record.until = now() + 60 * 60 * 1000;
    }
    trouble.set(shop, record);
  }

  /** Every price one page gives: a Shopify page prices each version, any other page one price. */
  async function read(page, shop) {
    const shopify = kindOf.get(shop) === 'shopify';
    const target = shopify ? `${page.replace(/\/+$/, '')}.js` : page;
    if (!(await robots.allows(target))) return [];
    const response = await fetchPage(target);
    noteAnswer(shop, response.ok);
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
      reading.set(page, read(page, shop).catch(() => { noteAnswer(shop, false); return []; }).finally(() => reading.delete(page)));
    }
    return reading.get(page);
  };

  /** Every price the given pages give, a few pages at a time per shop. */
  async function readPages(pages) {
    const byShop = new Map();
    for (const [page, shop] of pages) byShop.set(shop, [...(byShop.get(shop) ?? []), page]);
    const read = await Promise.all([...byShop].map(([shop, list]) => mapLimited(list, concurrency, page => readOnce(page, shop))));
    return read.flat(2);
  }

  /**
   * Re-reads the pages behind a search's first results (or one product's, when `product` names
   * it), applies what they say to the price list, and answers the search again.
   */
  async function recheck(index, rawQuery, { product = '' } = {}) {
    const answer = index.search(rawQuery);
    const stale = offer => !offer.checkedAt || now() - Date.parse(offer.checkedAt) > freshForMs;

    const pages = new Map();
    const perShopCount = new Map();
    const products = productsInOrder(answer, product)
      .map(offers => [...offers].sort((a, b) => a.price - b.price));
    const tryPick = offer => {
      if (pages.size >= maxPages) return false;
      const page = pageOf(offer.url);
      const used = perShopCount.get(offer.shop) ?? 0;
      if (pages.has(page) || !stale(offer) || used >= perShop || !reachable(offer.shop)) return false;
      pages.set(page, offer.shop);
      perShopCount.set(offer.shop, used + 1);
      return true;
    };
    /* Cards without a photo get one page read first, then one offer per card per pass so the
       earliest multi-shop cards do not spend a shop's quota before single-shop cards on screen. */
    for (const offers of products) {
      if (!offers.some(offer => offer.image)) offers.some(tryPick);
    }
    const deepest = Math.max(0, ...products.map(offers => offers.length));
    for (let i = 0; i < deepest && pages.size < maxPages; i++) {
      for (const offers of products) if (offers[i]) tryPick(offers[i]);
    }

    const changed = index.update(await readPages(pages));
    return { ...index.search(answer.query), rechecked: pages.size, changed };
  }

  /**
   * Photos for the home page's cards that have none, each read from one of its shops' pages
   * (a second shop's when the first can't answer), so no card is left blank for want of a
   * crawl. Runs after a price list loads; what it finds lives in memory with the list.
   */
  async function fillPhotos(index, { limit = 150 } = {}) {
    const tried = new Set();
    const missing = async () => (await index.browseSoon()).shelves.flatMap(shelf => shelf.cards).filter(card => !card.image);
    const initial = await missing();
    const before = initial.length;
    for (let pass = 0; pass < 2; pass++) {
      const currentMissing = pass === 0 ? initial : await missing();
      const pages = new Map();
      for (const card of currentMissing) {
        if (pages.size >= limit) break;
        let offers;
        try {
          offers = index.search(card.name).groups.flatMap(group => group.offers);
        } catch {
          continue;
        }
        const pick = offers
          .filter(offer => reachable(offer.shop) && !tried.has(pageOf(offer.url)))
          .sort((a, b) => a.price - b.price)[0];
        if (!pick) continue;
        tried.add(pageOf(pick.url));
        pages.set(pageOf(pick.url), pick.shop);
      }
      if (!pages.size) break;
      const fresh = await readPages(pages);
      index.update(fresh);
      if (fresh.some(item => item.image)) {
        /* A slice at a time, so the photos arriving never freeze searches. */
        await index.rebuildShelves();
      }
    }
    const after = (await missing()).length;
    return { filled: before - after, missing: after };
  }

  recheck.fillPhotos = fillPhotos;
  return recheck;
}
