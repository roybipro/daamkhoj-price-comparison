/* The price list: building it from sitemaps, and searching it. No network calls. */

import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { createApi } from '../server/api.mjs';
import { crawlShop, readShopifyProduct } from '../server/crawler.mjs';
import { mergeGroups } from '../server/live-search.mjs';
import { createPriceIndex, loadIndexFile, saveIndexFile, watchIndexFile } from '../server/price-index.mjs';
import { parseSitemap, productPages } from '../server/sitemap.mjs';

const urlset = urls => `<?xml version="1.0"?><urlset>${urls.map(url => `<url><loc>${url}</loc><lastmod>2026-11-20</lastmod></url>`).join('')}</urlset>`;
const indexOf = maps => `<?xml version="1.0"?><sitemapindex>${maps.map(url => `<sitemap><loc>${url}</loc></sitemap>`).join('')}</sitemapindex>`;
const product = (name, price) => `<script type="application/ld+json">${JSON.stringify({ '@type': 'Product', name, offers: { price, priceCurrency: 'BDT', availability: 'https://schema.org/InStock' } })}</script>`;
const site = pages => async url => (url in pages ? { ok: true, status: 200, url, text: pages[url] } : { ok: false, status: 404, url, text: '' });
const allowAll = { allows: async () => true };
const noWait = async () => {};

test('a sitemap gives its pages, decoded, and the sitemaps it points to', () => {
  const pages = parseSitemap(urlset(['https://a.bd/product/x?a=1&amp;b=2', 'not-a-url']));
  assert.deepEqual(pages.pages, [{ url: 'https://a.bd/product/x?a=1&b=2', lastmod: '2026-11-20' }]);
  assert.deepEqual(parseSitemap(indexOf(['https://a.bd/p.xml'])).maps, ['https://a.bd/p.xml']);
  assert.deepEqual(parseSitemap('<html>not xml</html>'), { maps: [], pages: [] });
});

test('only product sitemaps are followed, and only the shop\'s own product pages kept', async () => {
  const fetched = [];
  const pages = {
    'https://www.a.bd/sitemap.xml': indexOf(['https://www.a.bd/blog-sitemap.xml', 'https://www.a.bd/products-1.xml', 'https://www.a.bd/products-2.xml']),
    'https://www.a.bd/products-1.xml': urlset(['https://www.a.bd/product/one', 'https://other.bd/product/spam', 'https://www.a.bd/about']),
    'https://www.a.bd/products-2.xml': urlset(['https://a.bd/product/two', 'https://www.a.bd/product/one'])
  };
  const found = await productPages('https://www.a.bd/sitemap.xml', {
    fetchPage: async url => { fetched.push(url); return site(pages)(url); },
    isProduct: url => /\/product\//.test(url)
  });
  assert.deepEqual(found.map(page => page.url), ['https://www.a.bd/product/one', 'https://a.bd/product/two']);
  assert.ok(!fetched.includes('https://www.a.bd/blog-sitemap.xml'));
});

test('a sitemap that points back at itself is read once', async () => {
  let reads = 0;
  const loop = indexOf(['https://a.bd/product-sitemap.xml']);
  await productPages('https://a.bd/product-sitemap.xml', { fetchPage: async () => { reads++; return { ok: true, text: loop }; }, isProduct: () => true });
  assert.equal(reads, 1);
});

test('Shopify versions are priced one by one, and a zero price is no price', () => {
  const json = {
    title: 'iPhone 15',
    variants: [
      { id: 1, title: 'Blue / 128GB', price: 8199000, available: true },
      { id: 2, title: 'Blue / 512GB', price: 0, available: false },
      { id: 3, title: 'Pink / 256GB', price: 9999900, available: false }
    ]
  };
  assert.deepEqual(readShopifyProduct(json, 'https://s.bd/products/iphone-15'), [
    { url: 'https://s.bd/products/iphone-15?variant=1', name: 'iPhone 15 Blue / 128GB', price: 81990, inStock: true },
    { url: 'https://s.bd/products/iphone-15?variant=3', name: 'iPhone 15 Pink / 256GB', price: 99999, inStock: false }
  ]);
  const single = readShopifyProduct({ title: 'Cable', variants: [{ id: 9, title: 'Default Title', price: 50000 }] }, 'https://s.bd/products/cable');
  assert.deepEqual(single, [{ url: 'https://s.bd/products/cable', name: 'Cable', price: 500, inStock: null }]);
  assert.deepEqual(readShopifyProduct('{broken', 'https://s.bd/x'), []);
});

const shop = { shop: 'a.bd', sitemap: 'https://a.bd/sitemap.xml', product: /\/product\//, kind: 'page' };

test('the crawler reads each listed page, slowly, and only where robots.txt allows', async () => {
  const pages = {
    'https://a.bd/sitemap.xml': urlset(['https://a.bd/product/ok', 'https://a.bd/product/private', 'https://a.bd/product/plain']),
    'https://a.bd/product/ok': product('Galaxy A55 5G 8/256GB', 45000),
    'https://a.bd/product/private': product('Secret', 1),
    'https://a.bd/product/plain': '<html><title>No price here</title></html>'
  };
  const opened = [];
  const pauses = [];
  const { entries, stats } = await crawlShop(shop, {
    fetchPage: async url => { opened.push(url); return site(pages)(url); },
    robots: { allows: async url => !url.includes('private') },
    sleep: async ms => { pauses.push(ms); },
    delayMs: 700,
    now: () => Date.parse('2026-11-21T10:00:00Z')
  });
  assert.ok(!opened.includes('https://a.bd/product/private'));
  assert.deepEqual(pauses, [700, 700]);
  assert.deepEqual(entries, [{ shop: 'a.bd', url: 'https://a.bd/product/ok', name: 'Galaxy A55 5G 8/256GB', price: 45000, inStock: true, checkedAt: '2026-11-21T10:00:00.000Z' }]);
  assert.deepEqual(stats, { listed: 3, read: 3, priced: 1, noPrice: 1, blocked: 1, failed: 0 });
});

test('a page that fails keeps its last price; one gone from the sitemap or now unpriced loses it', async () => {
  const old = (url, price) => ({ shop: 'a.bd', url, name: 'Old', price, inStock: true, checkedAt: '2026-11-01T00:00:00.000Z' });
  const previous = [old('https://a.bd/product/down', 100), old('https://a.bd/product/gone', 200), old('https://a.bd/product/unpriced', 300)];
  const pages = {
    'https://a.bd/sitemap.xml': urlset(['https://a.bd/product/down', 'https://a.bd/product/unpriced']),
    'https://a.bd/product/unpriced': '<html></html>'
  };
  const { entries } = await crawlShop(shop, { fetchPage: site(pages), robots: allowAll, previous, sleep: noWait });
  assert.deepEqual(entries.map(entry => entry.url), ['https://a.bd/product/down']);
});

test('a run cut short reads new pages first, then the longest unread', async () => {
  const at = (url, checkedAt) => ({ shop: 'a.bd', url, name: 'X', price: 1, inStock: null, checkedAt });
  const previous = [at('https://a.bd/product/fresh', '2026-11-20T00:00:00Z'), at('https://a.bd/product/stale', '2026-11-01T00:00:00Z')];
  const opened = [];
  const pages = { 'https://a.bd/sitemap.xml': urlset(['https://a.bd/product/fresh', 'https://a.bd/product/stale', 'https://a.bd/product/new']) };
  await crawlShop(shop, {
    fetchPage: async url => { opened.push(url); return site(pages)(url); },
    robots: allowAll, previous, limit: 2, sleep: noWait
  });
  assert.deepEqual(opened.slice(1), ['https://a.bd/product/new', 'https://a.bd/product/stale']);
});

test('Shopify shops are read through the product JSON, asking robots.txt about that address', async () => {
  const asked = [];
  const pages = {
    'https://s.bd/sitemap.xml': urlset(['https://s.bd/products/phone']),
    'https://s.bd/products/phone.js': JSON.stringify({ title: 'Phone', variants: [{ id: 5, title: '128GB', price: 1000000, available: true }] })
  };
  const { entries } = await crawlShop({ shop: 's.bd', sitemap: 'https://s.bd/sitemap.xml', product: /\/products\//, kind: 'shopify' }, {
    fetchPage: site(pages), robots: { allows: async url => { asked.push(url); return true; } }, sleep: noWait
  });
  assert.deepEqual(asked, ['https://s.bd/products/phone.js']);
  assert.equal(entries[0].price, 10000);
  assert.equal(entries[0].name, 'Phone 128GB');
});

test('an empty sitemap is an error, so a broken shop never wipes its saved prices', async () => {
  await assert.rejects(crawlShop(shop, { fetchPage: async () => ({ ok: false }), robots: allowAll, sleep: noWait }), /no product pages/);
});

const NOW = Date.parse('2026-11-21T12:00:00Z');
const entry = (shop, name, price, extra = {}) => ({ shop, url: `https://${shop}/product/${name.toLowerCase().replace(/\W+/g, '-')}`, name, price, inStock: true, checkedAt: '2026-11-21T03:00:00.000Z', ...extra });
const listOf = (...entries) => {
  const shops = {};
  for (const item of entries) (shops[item.shop] ??= { crawledAt: item.checkedAt, entries: [] }).entries.push(item);
  return { version: 1, shops };
};

test('the price list answers with the same versions compared, and each price\'s own read time', () => {
  const index = createPriceIndex(listOf(
    entry('a.bd', 'Samsung Galaxy A55 5G 8/256GB', 45000),
    entry('b.bd', 'Galaxy A55 5G (8GB/256GB)', 44000, { checkedAt: '2026-11-21T05:00:00.000Z' }),
    entry('c.bd', 'Galaxy A55 5G 8/128GB', 39000),
    entry('c.bd', 'Galaxy A55 Silicone Case', 900),
    entry('d.bd', 'Galaxy A35 5G 8/256GB', 33000)
  ), { now: () => NOW });
  const result = index.search('galaxy a55');
  assert.equal(result.source, 'index');
  assert.equal(result.priced, 3);
  assert.deepEqual(result.groups.map(group => group.label), ['8GB RAM · 128GB · 5G', '8GB RAM · 256GB · 5G']);
  const first = result.groups[1];
  assert.deepEqual(first.offers.map(offer => offer.price), [44000, 45000]);
  assert.equal(first.lowest, first.offers[0].url);
  assert.equal(first.offers[0].checkedAt, '2026-11-21T05:00:00.000Z');
  assert.equal(result.checkedAt, '2026-11-21T05:00:00.000Z');
  assert.ok(!JSON.stringify(result).includes('Case'));
});

test('old prices and suspiciously low ones are left out of the price list\'s answers', () => {
  const index = createPriceIndex(listOf(
    entry('a.bd', 'iPhone 15 128GB', 82000),
    entry('b.bd', 'iPhone 15 128GB', 83000),
    entry('c.bd', 'iPhone 15 128GB', 84000),
    entry('d.bd', 'iPhone 15 128GB', 30000),
    entry('e.bd', 'iPhone 15 128GB', 60000, { checkedAt: '2026-11-01T00:00:00.000Z' })
  ), { now: () => NOW });
  const result = index.search('iphone 15');
  assert.deepEqual(result.groups.flatMap(group => group.offers.map(offer => offer.shop)), ['a.bd', 'b.bd', 'c.bd']);
  assert.equal(result.skipped.noPrice, 1);
});

test('the price list refuses meaningless searches like the web search does', () => {
  assert.throws(() => createPriceIndex(listOf()).search(' '), error => error.code === 'query');
});

test('merged results count a page once and keep the first copy', () => {
  const group = (label, offers) => ({ label, comparable: true, lowest: null, offers });
  const offer = (url, price, checkedAt) => ({ shop: 'a.bd', url, title: 'T', price, inStock: true, ...(checkedAt && { checkedAt }) });
  const merged = mergeGroups(
    [group('128GB', [offer('https://a.bd/1', 900)])],
    [group('128gb', [offer('https://a.bd/1', 950, 'old'), offer('https://b.bd/2', 800, 'old')]), group('256GB', [offer('https://c.bd/3', 1200, 'old')])]
  );
  assert.equal(merged.length, 2);
  assert.deepEqual(merged[0].offers.map(item => [item.url, item.price]), [['https://b.bd/2', 800], ['https://a.bd/1', 900]]);
  assert.equal(merged[0].lowest, 'https://b.bd/2');
});

test('a saved list survives a round trip, a missing one is empty, a damaged one is an error', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'daamkhoj-'));
  const file = path.join(dir, 'list.json');
  assert.deepEqual(await loadIndexFile(file), { version: 1, shops: {} });
  const data = listOf(entry('a.bd', 'Phone', 1));
  await saveIndexFile(file, data);
  assert.deepEqual(await loadIndexFile(file), data);
  await writeFile(file, '{"oops"');
  await assert.rejects(loadIndexFile(file));
});

test('the server picks up a new crawl without restarting, and keeps the last good list', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'daamkhoj-'));
  const file = path.join(dir, 'list.json');
  let time = NOW;
  const search = watchIndexFile(file, { now: () => time, checkEveryMs: 1000 });
  assert.equal((await search('iphone 15')).priced, 0);

  await saveIndexFile(file, listOf(entry('a.bd', 'iPhone 15 128GB', 82000)));
  assert.equal((await search('iphone 15')).priced, 0, 'checks the file at most once a second');
  time += 1001;
  assert.equal((await search('iphone 15')).priced, 1);

  await writeFile(file, 'damaged');
  time += 5000;
  assert.equal((await search('iphone 15')).priced, 1);
});

function call(api, pathname, query = 'iphone 15') {
  return new Promise(resolve => {
    const res = { writeHead(status) { this.status = status; }, end(body) { resolve({ status: this.status, body: JSON.parse(body) }); } };
    api({ method: 'GET', socket: { remoteAddress: '1.1.1.1' } }, res, new URL(`http://x${pathname}?q=${encodeURIComponent(query)}`));
  });
}

test('the quick search needs no paid key, and the full search adds the price list to its own', async () => {
  const listed = { query: 'iphone 15', source: 'index', priced: 1, groups: [{ label: '128GB', comparable: true, lowest: null, offers: [{ shop: 'a.bd', url: 'https://a.bd/1', title: 'iPhone 15 128GB', price: 82000, inStock: true, checkedAt: 'x' }] }] };
  const web = { query: 'iphone 15', priced: 1, groups: [{ label: '128GB', comparable: true, lowest: null, offers: [{ shop: 'b.bd', url: 'https://b.bd/2', title: 'iPhone 15 128GB', price: 81000, inStock: true }] }] };

  const quickOnly = createApi({ liveSearch: null, searchIndex: async () => listed });
  assert.deepEqual((await call(quickOnly, '/api/search/quick')).body, listed);
  assert.equal((await call(quickOnly, '/api/search')).status, 503);
  assert.equal((await call(createApi({ liveSearch: null }), '/api/search/quick')).status, 503);
  assert.equal((await call(quickOnly, '/api/search/quick', ' ')).status, 200, 'the index decides what is meaningless');

  const both = await call(createApi({ liveSearch: { run: async () => web }, searchIndex: async () => listed }), '/api/search');
  assert.equal(both.status, 200);
  assert.deepEqual(both.body.groups[0].offers.map(offer => offer.shop), ['b.bd', 'a.bd']);
  assert.equal(both.body.priced, 2);

  const broken = await call(createApi({ liveSearch: { run: async () => web }, searchIndex: async () => { throw new Error('disk'); }, log: () => {} }), '/api/search');
  assert.equal(broken.body.priced, 1, 'a broken price list never sinks the web search');
});
