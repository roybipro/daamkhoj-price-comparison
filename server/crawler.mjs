/* Builds the price list one shop at a time: list its product pages from the sitemap, then read
   each page's own price, slowly and only where robots.txt allows. Searches then read the list,
   so they answer at once instead of waiting a minute for a web search. */

import { absoluteImage, readPage } from './page-price.mjs';
import { productPages } from './sitemap.mjs';

const pause = ms => new Promise(done => setTimeout(done, ms));

/** One entry per version with a price. Shopify prices are in poisha; zero means no price. */
export function readShopifyProduct(json, pageUrl) {
  let product;
  try {
    product = typeof json === 'string' ? JSON.parse(json) : json;
  } catch {
    return [];
  }
  if (!product || !Array.isArray(product.variants)) return [];
  const title = String(product.title ?? '').replace(/\s+/g, ' ').trim();
  if (!title) return [];

  const many = product.variants.length > 1;
  const photo = absoluteImage(String(product.featured_image ?? product.images?.[0] ?? ''), pageUrl);
  return product.variants
    .filter(variant => Number(variant.price) > 0)
    .map(variant => {
      const rawVersion = String(variant.title ?? '').trim();
      const version = rawVersion.toLowerCase().startsWith(title.toLowerCase())
        ? rawVersion.slice(title.length).replace(/^[\s/-]+/, '').trim()
        : rawVersion;
      const named = version && version !== 'Default Title';
      return {
        url: many ? `${pageUrl}?variant=${variant.id}` : pageUrl,
        name: named ? `${title} ${version}` : title,
        price: Math.round(Number(variant.price)) / 100,
        inStock: typeof variant.available === 'boolean' ? variant.available : null,
        ...(photo && { image: photo })
      };
    });
}

function readOne(shop, text, url) {
  if (shop.kind === 'shopify') return readShopifyProduct(text, url);
  const read = readPage(text);
  if (read.price === null) return [];
  const name = read.name || read.title;
  const image = absoluteImage(read.image, url);
  return name ? [{ url, name, price: read.price, inStock: read.inStock, ...(image && { image }) }] : [];
}

/**
 * Re-reads one shop's products. Pages read longest ago go first, so a run cut short by `limit`
 * still refreshes the oldest prices. A page that fails to load keeps its last price, because
 * one bad minute at a shop shouldn't empty the list; a page that now has no clear price, or
 * that robots.txt now refuses, loses it.
 */
export async function crawlShop(shop, deps) {
  const {
    fetchPage, fetchSitemap = fetchPage, robots, previous = [], checked = {}, limit = Infinity,
    delayMs = 1000, sleep = pause, now = Date.now, log = () => {}, onProgress = () => {}, progressEvery = 100
  } = deps;

  /* A refused sitemap and an empty one look alike from here, so the answer goes in the error. */
  let answered = 'no answer';
  const readSitemap = async url => {
    const response = await fetchSitemap(url);
    answered = `HTTP ${response.status}`;
    return response;
  };
  const listed = await productPages(shop.sitemap, { fetchPage: readSitemap, isProduct: url => shop.product.test(url) });
  if (!listed.length) throw new Error(`${shop.shop}: the sitemap listed no product pages (last answer: ${answered})`);

  const pageOf = url => url.replace(/\?variant=\d+$/, '');
  const byPage = new Map();
  for (const entry of previous) {
    const page = pageOf(entry.url);
    byPage.set(page, [...(byPage.get(page) ?? []), entry]);
  }
  const listedSet = new Set(listed.map(page => page.url));
  const checkedMap = new Map(Object.entries(checked).filter(([url]) => listedSet.has(url)));
  const lastRead = page => {
    const entryMin = Math.min(...(byPage.get(page) ?? []).map(entry => Date.parse(entry.checkedAt)), Infinity);
    const checkedAt = checkedMap.has(page) ? Date.parse(checkedMap.get(page)) : Infinity;
    return Math.min(entryMin, checkedAt);
  };
  const seen = page => byPage.has(page) || checkedMap.has(page);
  const order = listed.map(page => page.url)
    .sort((a, b) => Number(seen(a)) - Number(seen(b)) || lastRead(a) - lastRead(b));

  const kept = new Map(listed.filter(page => byPage.has(page.url)).map(page => [page.url, byPage.get(page.url)]));
  const stats = { listed: listed.length, read: 0, priced: 0, noPrice: 0, blocked: 0, failed: 0 };
  const snapshot = () => [...kept.values()].flat();

  for (const page of order.slice(0, limit)) {
    if (stats.read) await sleep(delayMs);
    stats.read++;
    try {
      /* robots.txt is asked about the address actually fetched, which differs for Shopify. */
      /* "/products/phone/" has its JSON at "/products/phone.js", not "/products/phone/.js". */
      const target = shop.kind === 'shopify' ? `${page.replace(/\/+$/, '')}.js` : page;
      const robotState = robots.status ? await robots.status(target) : ((await robots.allows(target)) ? 'allowed' : 'blocked');
      if (robotState === 'unreachable') {
        stats.failed++;
        continue;
      }
      if (robotState === 'blocked') {
        stats.blocked++;
        kept.delete(page);
        checkedMap.delete(page);
        continue;
      }
      const response = await fetchPage(target);
      if (!response.ok) {
        stats.failed++;
        continue;
      }
      const checkedAt = new Date(now()).toISOString();
      const found = readOne(shop, response.text, page)
        .map(item => ({ shop: shop.shop, ...item, checkedAt }));
      if (found.length) {
        stats.priced++;
        kept.set(page, found);
        checkedMap.delete(page);
      } else {
        stats.noPrice++;
        kept.delete(page);
        checkedMap.set(page, checkedAt);
      }
    } catch {
      stats.failed++;
    }
    if (stats.read % progressEvery === 0) {
      log(`${shop.shop}: ${stats.read} of ${Math.min(order.length, limit)} pages read`);
      await onProgress(snapshot(), stats, Object.fromEntries(checkedMap));
    }
  }
  return { entries: snapshot(), stats, checked: Object.fromEntries(checkedMap) };
}
