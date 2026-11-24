/* The price list: building it from sitemaps, and searching it. No network calls. */

import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { createApi } from '../server/api.mjs';
import { crawlShop, readShopifyProduct } from '../server/crawler.mjs';
import { mergeGroups } from '../server/live-search.mjs';
import { matchesQuery } from '../server/matching.mjs';
import { pageMeta, robotsTxt, sitemapXml, withMeta } from '../server/seo.mjs';
import { createPriceIndex, loadIndexFile, pullIndexFile, saveIndexFile, watchIndexFile } from '../server/price-index.mjs';
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

test('a run with a deadline starts no page after it, and keeps the prices it had not re-read', async () => {
  const urls = ['one', 'two', 'three', 'four', 'old'].map(name => `https://a.bd/product/${name}`);
  const pages = { 'https://a.bd/sitemap.xml': urlset(urls) };
  for (const url of urls) pages[url] = product('Phone', 1000);
  const previous = [{ shop: 'a.bd', url: urls[4], name: 'Old phone', price: 900, inStock: true, checkedAt: '2026-11-01T00:00:00.000Z' }];
  let time = Date.parse('2026-11-21T10:00:00Z');
  const opened = [];
  const { entries, stats, stoppedEarly } = await crawlShop(shop, {
    fetchPage: async url => { opened.push(url); return site(pages)(url); },
    robots: allowAll, previous, delayMs: 1000,
    sleep: async ms => { time += ms; },
    now: () => time,
    stopAt: time + 2500
  });
  assert.equal(stoppedEarly, true);
  assert.equal(stats.read, 3);
  assert.deepEqual(opened.slice(1), urls.slice(0, 3));
  assert.deepEqual(entries.map(entry => [entry.url, entry.price]).sort(), [[urls[4], 900], [urls[2], 1000], [urls[0], 1000], [urls[1], 1000]].sort());
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

test('a Shopify page listed with a trailing slash is still read through its JSON', async () => {
  const pages = {
    'https://s.bd/sitemap.xml': urlset(['https://s.bd/products/phone/']),
    'https://s.bd/products/phone.js': JSON.stringify({ title: 'Phone', variants: [{ id: 5, title: 'Default Title', price: 500000, available: true }] })
  };
  const { entries } = await crawlShop({ shop: 's.bd', sitemap: 'https://s.bd/sitemap.xml', product: /\/products\//, kind: 'shopify' }, {
    fetchPage: site(pages), robots: { allows: async () => true }, sleep: noWait
  });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].price, 5000);
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

test('a search typed in Bangla finds the English listings and says what it was read as', async () => {
  const { fromBangla, skeleton } = await import('../server/bangla.mjs');
  assert.equal(fromBangla('আইফোন ১৫ প্রো ম্যাক্স এর দাম কত'), 'iphone 15 pro max');
  /* One name, several spellings; model codes and sizes in Bangla letters and digits. */
  assert.equal(fromBangla('স্যামসাং গ্যালাক্সি এ১৬'), 'samsung galaxy a16');
  assert.equal(fromBangla('সামসাং গেলাক্সি এ ১৬'), 'samsung galaxy a16');
  assert.equal(skeleton('শাওমী'), skeleton('শাওমি'));
  assert.equal(skeleton('অ্যাপল'), skeleton('এপল'));
  assert.equal(fromBangla('আইফোন ১৫ ১২৮ জিবি কালো'), 'iphone 15 128gb black');
  assert.equal(fromBangla('অ্যাংকার পাওয়ার ব্যাংক'), 'anker power bank');
  /* A half-typed name completes, but never into a colour; English is left alone. */
  assert.equal(fromBangla('স্যাম', { partial: true }), 'samsung');
  assert.equal(fromBangla('সা', { partial: true }), 'সা');
  assert.equal(fromBangla('iPhone 15'), 'iPhone 15');
  assert.equal(fromBangla('আইফোন iPhone'), 'iphone iPhone');

  const index = createPriceIndex(listOf(
    entry('a.bd', 'iPhone 15 128GB', 82000),
    entry('b.bd', 'Apple iPhone 15 128GB', 83000)
  ), { now: () => NOW });
  for (const options of [{}, { closest: true }, { partial: true, closest: true }]) {
    const answer = index.search('আইফোন ১৫ এর দাম', options);
    assert.equal(answer.query, 'iphone 15');
    assert.equal(answer.correctedFrom, 'আইফোন ১৫ এর দাম');
    assert.equal(answer.priced, 2);
  }
  assert.equal(index.search('iphone 15').correctedFrom, undefined);
  assert.throws(() => index.search('দাম কত'), error => error.code === 'query');
});

test('merged results count a page once and keep the first copy', () => {
  const group = (label, offers) => ({ label, comparable: true, lowest: null, offers });
  const offer = (url, price, checkedAt) => ({ shop: new URL(url).hostname, url, title: 'T', price, inStock: true, ...(checkedAt && { checkedAt }) });
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

test('a shop counts once per version: its cheapest price in stock, or its cheapest if none are', () => {
  const index = createPriceIndex(listOf(
    entry('s.bd', 'iPhone 14 Blue 128GB USA', 65000, { inStock: false, url: 'https://s.bd/p?variant=1' }),
    entry('s.bd', 'iPhone 14 Red 128GB Global', 68000, { url: 'https://s.bd/p?variant=2' }),
    entry('s.bd', 'iPhone 14 Black 128GB Global', 69000, { url: 'https://s.bd/p?variant=3' }),
    entry('t.bd', 'iPhone 14 128GB', 70000),
    entry('s.bd', 'iPhone 14 Blue 512GB USA', 110000, { inStock: false, url: 'https://s.bd/p?variant=4' }),
    entry('s.bd', 'iPhone 14 Red 512GB USA', 111000, { inStock: false, url: 'https://s.bd/p?variant=5' })
  ), { now: () => NOW });
  const [small, large] = index.search('iphone 14').groups;
  assert.deepEqual(small.offers.map(offer => [offer.shop, offer.price]), [['s.bd', 68000], ['t.bd', 70000]]);
  assert.deepEqual(large.offers.map(offer => offer.price), [110000]);
});

test('a product page\'s photo is read from its structured data, its sharing image, or Shopify\'s JSON', async () => {
  const { readImage, absoluteImage, readPage } = await import('../server/page-price.mjs');
  const ld = image => `<script type="application/ld+json">${JSON.stringify({ '@type': 'Product', name: 'Phone', image, offers: { price: 100, priceCurrency: 'BDT' } })}</script>`;
  assert.equal(readImage(ld('https://a.bd/p.jpg')), 'https://a.bd/p.jpg');
  assert.equal(readImage(ld(['/one.jpg', '/two.jpg'])), '/one.jpg');
  assert.equal(readImage(ld({ '@type': 'ImageObject', url: '/obj.png' })), '/obj.png');
  assert.equal(readImage('<meta property="og:image" content="https://a.bd/og.jpg?a=1&amp;b=2">'), 'https://a.bd/og.jpg?a=1&b=2');
  assert.equal(readPage(ld('/p.jpg')).image, '/p.jpg');
  assert.equal(absoluteImage('/p.jpg', 'https://a.bd/product/x'), 'https://a.bd/p.jpg');
  assert.equal(absoluteImage('//cdn.shopify.com/x.png', 'https://s.bd/products/x'), 'https://cdn.shopify.com/x.png');
  assert.equal(absoluteImage('javascript:alert(1)', 'https://a.bd/'), '');

  const [variant] = readShopifyProduct({ title: 'Phone', featured_image: '//cdn.shopify.com/p.png', variants: [{ id: 1, title: 'Default Title', price: 100000, available: true }] }, 'https://s.bd/products/phone');
  assert.equal(variant.image, 'https://cdn.shopify.com/p.png');
});

test('shelves show products at least two shops sell, priced from their cheapest version', async () => {
  const { buildBrowse } = await import('../server/browse.mjs');
  const index = createPriceIndex({ version: 1, shops: {
    'a.bd': { entries: [entry('a.bd', 'Galaxy A16 5G 8/256GB Official', 30000, { image: 'https://a.bd/a16.jpg' }), entry('a.bd', 'Pixel 10 128GB', 80000)] },
    'b.bd': { entries: [entry('b.bd', 'Galaxy A16 4G 6/128GB Official', 21000)] }
  } }, { now: () => NOW });
  const shelves = buildBrowse(query => index.search(query), { 'a.bd': 2, 'b.bd': 1 }, [
    { id: 'phones', label: 'Phones', products: ['Galaxy A16', 'Pixel 10'] },
    { id: 'empty', label: 'Nothing', products: ['Pixel 10'] }
  ]);
  assert.deepEqual(shelves.shelves.map(shelf => shelf.id), ['phones'], 'a shelf with no comparison is left out');
  const [card] = shelves.shelves[0].cards;
  assert.equal(shelves.shelves[0].cards.length, 1, 'one shop is not a comparison');
  assert.equal(card.name, 'Galaxy A16');
  assert.equal(card.from, 21000);
  assert.equal(card.shop, 'b.bd');
  assert.equal(card.shops, 2);
  assert.equal(card.versions, 2);
  assert.equal(card.image, 'https://a.bd/a16.jpg', 'a photo from any shop stands in when the cheapest has none');
  assert.deepEqual(shelves.shops, [{ shop: 'a.bd', prices: 2 }, { shop: 'b.bd', prices: 1 }]);
  assert.equal(shelves.prices, 3);
});

test('the browse endpoint serves the shelves, and says so when there is no price list', async () => {
  const shelves = { shelves: [], shops: [], prices: 0 };
  const search = async () => ({});
  search.browse = async () => shelves;
  assert.deepEqual((await call(createApi({ liveSearch: null, searchIndex: search }), '/api/browse')).body, shelves);
  assert.equal((await call(createApi({ liveSearch: null }), '/api/browse')).status, 503);
});

test('a published list is pulled over the local one, and a bad download never replaces it', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'pull-'));
  const file = path.join(dir, 'price-index.json');
  const good = JSON.stringify({ version: 1, shops: { 'a.bd': { crawledAt: '2026-11-21T00:00:00.000Z', entries: [entry('a.bd', 'Galaxy A16', 20000)] } } });
  const serve = (body, status = 200) => async () => new Response(body, { status });

  assert.equal(await pullIndexFile('https://x/list.json', file, { fetchImpl: serve(good) }), true);
  assert.equal((await loadIndexFile(file)).shops['a.bd'].entries.length, 1);
  assert.equal(await pullIndexFile('https://x/list.json', file, { fetchImpl: serve(good) }), false, 'the same list is not rewritten');

  await assert.rejects(pullIndexFile('https://x/list.json', file, { fetchImpl: serve('<html>rate limited</html>') }));
  await assert.rejects(pullIndexFile('https://x/list.json', file, { fetchImpl: serve(JSON.stringify({ version: 2 })) }), /not a price list/);
  await assert.rejects(pullIndexFile('https://x/list.json', file, { fetchImpl: serve('', 404) }), /404/);
  assert.equal((await loadIndexFile(file)).shops['a.bd'].entries.length, 1, 'the last good list stays');

  /* A cached copy from before the local list was updated is older, so it is ignored. */
  const newer = { version: 1, updatedAt: '2026-11-23T16:00:00.000Z', shops: { 'a.bd': { crawledAt: '2026-11-21T00:00:00.000Z', entries: [entry('a.bd', 'Galaxy A16', 20000, { image: 'https://a.bd/p.jpg' })] } } };
  await writeFile(file, JSON.stringify(newer));
  assert.equal(await pullIndexFile('https://x/list.json', file, { fetchImpl: serve(good) }), false, 'an older copy never replaces a newer list');
  assert.equal((await loadIndexFile(file)).shops['a.bd'].entries[0].image, 'https://a.bd/p.jpg');

  const crawled = JSON.stringify({ version: 1, shops: { 'a.bd': { crawledAt: '2026-11-24T00:00:00.000Z', entries: [entry('a.bd', 'Galaxy A16', 19000)] } } });
  assert.equal(await pullIndexFile('https://x/list.json', file, { fetchImpl: serve(crawled) }), true, 'a newer crawl is taken');
  assert.equal((await loadIndexFile(file)).shops['a.bd'].entries[0].price, 19000);
});

test('shelves are rebuilt as prices age, so a card never offers a price its search leaves out', () => {
  let time = NOW;
  const index = createPriceIndex({ version: 1, shops: {
    'a.bd': { entries: [entry('a.bd', 'Galaxy A16 5G 8/256GB', 30000)] },
    'b.bd': { entries: [entry('b.bd', 'Galaxy A16 5G 8/256GB', 29000)] }
  } }, { now: () => time });
  const cards = () => index.browse().shelves.flatMap(shelf => shelf.cards).filter(card => /galaxy a16/i.test(card.name));
  assert.equal(cards().length, 1);
  time += 8 * 24 * 60 * 60 * 1000;
  assert.equal(cards().length, 0);
});

test('a server never waits on a shelf rebuild: old shelves are served while new ones build in slices', async () => {
  const { runInSlices } = await import('../server/browse.mjs');
  /* A sliced job lets other work run before it ends. */
  let other = false;
  setImmediate(() => { other = true; });
  const finished = await runInSlices((function* () {
    const until = performance.now() + 40;
    while (performance.now() < until) yield;
    return other;
  })(), 5);
  assert.equal(finished, true, 'other work ran while the job was still going');

  let time = NOW;
  const index = createPriceIndex(listOf(
    entry('a.bd', 'Galaxy A16 5G 8/256GB', 30000),
    entry('b.bd', 'Galaxy A16 5G 8/256GB', 29000)
  ), { now: () => time });
  /* No shelves yet: the first ask waits for them. */
  const first = await index.browseSoon();
  assert.equal(first.shelves.length, 1);
  /* An hour later a rebuild is due: the ask is answered from the old shelves at once. */
  time += 61 * 60 * 1000;
  assert.equal(await index.browseSoon(), first);
  const rebuilt = await index.rebuildShelves();
  assert.notEqual(rebuilt, first);
  assert.equal(await index.browseSoon(), rebuilt);

  /* A new list shows the last one's shelves until its own are built. */
  const next = createPriceIndex(listOf(entry('a.bd', 'iPhone 15 128GB', 82000)), { now: () => time });
  next.adoptShelves(index);
  assert.equal(await next.browseSoon(), rebuilt);
});

test('prices too old to show are not kept in memory', () => {
  const index = createPriceIndex(listOf(
    entry('a.bd', 'iPhone 15 128GB', 82000),
    entry('b.bd', 'iPhone 15 128GB', 83000, { checkedAt: '2026-11-01T00:00:00.000Z' })
  ), { now: () => NOW });
  assert.equal(index.size, 1);
});

test('two copies of the list merge shop by shop, the later crawl of each shop winning whole', async () => {
  const { mergeLists } = await import('../server/merge-lists.mjs');
  const shop = (crawledAt, ...names) => ({ crawledAt, entries: names.map(name => entry('x.bd', name, 1000)) });
  /* main: a local crawl refreshed sumash and added a new shop while the nightly crawl ran. */
  const main = { version: 1, shops: {
    'sumash.bd': shop('2026-11-23T23:00:00Z', 'Fresh A', 'Fresh B'),
    'new.bd': shop('2026-11-23T23:10:00Z', 'Only on main'),
    'big.bd': shop('2026-11-22T01:00:00Z', 'Old big', 'Gone from big')
  } };
  /* the nightly crawl: re-read big (and dropped a page), failed on sumash (kept its old record). */
  const crawl = { version: 1, shops: {
    'sumash.bd': shop('2026-11-21T17:00:00Z', 'Stale A'),
    'big.bd': shop('2026-11-24T01:00:00Z', 'New big')
  } };
  const { list, taken } = mergeLists(main, crawl);
  assert.deepEqual(taken, ['big.bd']);
  assert.deepEqual(list.shops['big.bd'].entries.map(e => e.name), ['New big'], 'a page the newer crawl dropped stays dropped');
  assert.deepEqual(list.shops['sumash.bd'].entries.map(e => e.name), ['Fresh A', 'Fresh B'], 'an older crawl never overwrites a newer one');
  assert.deepEqual(list.shops['new.bd'].entries.map(e => e.name), ['Only on main']);
});

test('a misspelt search is corrected from the list\'s own words, and says so; a good one never is', () => {
  const index = createPriceIndex({ version: 1, shops: {
    'a.bd': { entries: [entry('a.bd', 'OnePlus Buds 3 TWS Earbuds', 6500), entry('a.bd', 'Samsung Galaxy A16 5G 8/256GB', 30000)] },
    'b.bd': { entries: [entry('b.bd', 'OnePlus Buds 3 Earbuds', 6300), entry('b.bd', 'Galaxy Buds 3 Pro', 18000)] }
  } }, { now: () => NOW });

  const fixed = index.search('onplus buds');
  assert.equal(fixed.query, 'oneplus buds');
  assert.equal(fixed.correctedFrom, 'onplus buds');
  assert.equal(fixed.priced, 2);

  assert.equal(index.search('samsng galaxy a16').query, 'samsung galaxy a16', 'a model number stays as typed');
  assert.equal(index.search('galaxy buds').correctedFrom, undefined, 'a search that finds something is left alone');
  const nothing = index.search('zzzzqq phone');
  assert.equal(nothing.correctedFrom, undefined);
  assert.equal(nothing.priced, 0);
});

test('shelves are found from the listings themselves, one product per name, in the right category', async () => {
  const { discoverCategories, productKey } = await import('../server/browse.mjs');
  assert.equal(productKey('Apple iPhone 16 Pro Max 256GB Desert Titanium'), 'iphone 16 pro max');
  assert.equal(productKey('iPhone 17 Mist Blue / 256GB'), 'iphone 17');
  assert.equal(productKey('MacBook Air M4 13.6-inch 16GB 256GB'), 'macbook air m4');
  assert.equal(productKey('JBL Tune 110 In-Ear Headphones'), 'jbl tune 110 ear headphones');
  assert.equal(productKey('Samsung 55 inch Crystal UHD TV'), 'samsung crystal uhd tv');
  assert.equal(productKey('Samsung Galaxy A16 5G (8/256GB) - Official'), 'galaxy a16');
  assert.equal(productKey('Apple Watch Series 10 GPS 42mm'), 'apple watch series 10');
  assert.equal(productKey('Anker 511 Charger Nano Pro, 20W'), 'anker 511 charger nano pro');

  const listings = [
    entry('a.bd', 'Apple iPhone 16 Pro Max 256GB Desert Titanium', 150000), entry('b.bd', 'Apple iPhone 16 Pro Max 512GB Black Titanium', 170000),
    entry('a.bd', 'Apple Watch Series 10 GPS 42mm', 45000), entry('b.bd', 'Apple Watch Series 10 46mm Jet Black', 47000),
    entry('a.bd', 'iPhone 16 Pro Max Silicone Case with MagSafe', 6000),
    entry('a.bd', 'Only One Shop Gadget X1', 1000)
  ];
  const categories = discoverCategories(listings);
  assert.deepEqual(categories.map(category => [category.id, category.products]), [
    ['watches', ['Apple Watch Series 10']],
    ['phones', ['iPhone 16 Pro Max']]
  ]);
});

test('while typing, a half-typed word is completed from the list and real products are suggested', () => {
  const index = createPriceIndex({ version: 1, shops: {
    'a.bd': { entries: [entry('a.bd', 'iPhone 17 128GB', 110000), entry('a.bd', 'iPhone 17 Pro Max 256GB', 160000), entry('a.bd', 'Galaxy A16 5G', 21000), entry('a.bd', 'IP68 Waterproof Case', 500)] },
    'b.bd': { entries: [entry('b.bd', 'iPhone 17 256GB', 125000), entry('b.bd', 'Galaxy A16 5G 8/256GB', 22000), entry('b.bd', 'Galaxy A17 5G', 26000)] }
  } }, { now: () => NOW });

  const iph = index.search('iph', { partial: true });
  assert.equal(iph.query, 'iphone');
  assert.equal(iph.completedFrom, 'iph');
  assert.ok(iph.priced >= 2);
  assert.ok(iph.suggestions.some(item => item.name === 'iPhone 17' && item.shops === 2), JSON.stringify(iph.suggestions));

  assert.equal(index.search('ip', { partial: true }).query, 'iphone', 'the commonest word wins over a rare one typed in full');
  assert.equal(index.search('galaxy a1', { partial: true }).query, 'galaxy a16', 'completed among Galaxy listings, as the top suggestion');
  const whole = index.search('iphone 17', { partial: true });
  assert.equal(whole.completedFrom, undefined, 'a whole word stays as typed');
  assert.deepEqual(index.search('zzzz', { partial: true }).suggestions, []);
});

test('a whole model number typed last is searched as typed, not stretched into a longer one', () => {
  const index = createPriceIndex(listOf(
    entry('a.bd', 'AMD Ryzen 5 5600 Processor', 12000),
    entry('b.bd', 'AMD Ryzen 5 5600 Desktop Processor', 12500),
    entry('a.bd', 'AMD Ryzen 5 5600GT Processor', 18500),
    entry('b.bd', 'AMD Ryzen 5 5600GT AM4 Processor', 19000),
    entry('c.bd', 'AMD Ryzen 5 5600GT Processor with Radeon Graphics', 18900)
  ), { now: () => NOW });
  /* The 5600GT is sold by more shops, so it leads the suggestions; the 5600 is still what was asked. */
  const answer = index.search('ryzen 5 5600', { partial: true, closest: true });
  assert.equal(answer.query, 'ryzen 5 5600');
  assert.equal(answer.completedFrom, undefined);
  const names = answer.groups.flatMap(group => group.offers.map(offer => offer.title ?? offer.name));
  assert.ok(names.length >= 2 && names.every(name => !/5600GT/i.test(name)), JSON.stringify(names));
  /* A half-typed number is still finished. */
  assert.match(index.search('ryzen 5 560', { partial: true, closest: true }).query, /ryzen 5 5600/);
});

test('re-checked prices replace the listed ones in memory, and the answer says when they were read', () => {
  const index = createPriceIndex({ version: 1, shops: {
    'a.bd': { entries: [entry('a.bd', 'Galaxy A16 5G', 21000)] },
    'b.bd': { entries: [entry('b.bd', 'Galaxy A16 5G', 22000)] }
  } }, { now: () => NOW });
  const url = index.search('galaxy a16').groups.flatMap(group => group.offers).find(offer => offer.shop === 'a.bd').url;
  assert.equal(index.update([{ url, price: 19500, inStock: false, checkedAt: '2026-11-21T11:59:00.000Z' }]), 1);
  const offer = index.search('galaxy a16').groups.flatMap(group => group.offers).find(item => item.url === url);
  assert.equal(offer.price, 19500);
  assert.equal(offer.inStock, false);
  assert.equal(offer.checkedAt, '2026-11-21T11:59:00.000Z');
  assert.equal(index.update([{ url: 'https://nowhere/x', price: 1, checkedAt: 'x' }, { url, price: 0, checkedAt: 'x' }]), 0, 'unknown pages and non-prices are ignored');
});

test('a live re-check reads only stale pages behind the first results, politely, and answers again', async () => {
  const { createRechecker } = await import('../server/recheck.mjs');
  const stale = '2026-11-20T00:00:00.000Z';
  const index = createPriceIndex({ version: 1, shops: {
    'a.bd': { entries: [entry('a.bd', 'Galaxy A16 5G', 21000, { checkedAt: stale })] },
    'd.bd': { entries: [entry('d.bd', 'Galaxy A16 5G', 20000, { checkedAt: stale })] },
    's.bd': { entries: [
      { shop: 's.bd', url: 'https://s.bd/products/a16?variant=1', name: 'Galaxy A16 5G 128GB', price: 22000, inStock: true, checkedAt: stale },
      { shop: 's.bd', url: 'https://s.bd/products/a16?variant=2', name: 'Galaxy A16 5G 256GB', price: 25000, inStock: true, checkedAt: stale }
    ] },
    'c.bd': { entries: [entry('c.bd', 'Galaxy A16 5G', 23000, { checkedAt: '2026-11-21T11:50:00.000Z' })] }
  } }, { now: () => NOW });

  const fetched = [];
  const pages = {
    'https://a.bd/product/galaxy-a16-5g': `<script type="application/ld+json">${JSON.stringify({ '@type': 'Product', name: 'Galaxy A16 5G', offers: { price: 20500, priceCurrency: 'BDT', availability: 'InStock' } })}</script>`,
    'https://s.bd/products/a16.js': JSON.stringify({ title: 'Galaxy A16 5G', variants: [{ id: 1, title: '128GB', price: 2150000, available: true }, { id: 2, title: '256GB', price: 2450000, available: false }] })
  };
  const recheck = createRechecker({
    fetchPage: async url => { fetched.push(url); return url in pages ? { ok: true, status: 200, text: pages[url] } : { ok: false, status: 500, text: '' }; },
    robots: { allows: async url => !url.includes('d.bd') },
    shops: [{ shop: 's.bd', kind: 'shopify' }],
    now: () => NOW
  });

  const answer = await recheck(index, 'galaxy a16');
  assert.ok(!fetched.some(url => url.includes('c.bd')), 'a price read ten minutes ago is not read again');
  assert.ok(!fetched.some(url => url.includes('d.bd')), 'robots.txt is honoured');
  assert.equal(fetched.filter(url => url.startsWith('https://s.bd/')).length, 1, 'one read prices every Shopify version');
  const prices = Object.fromEntries(answer.groups.flatMap(group => group.offers).map(offer => [offer.url, offer]));
  assert.equal(prices['https://a.bd/product/galaxy-a16-5g'].price, 20500);
  assert.equal(prices['https://a.bd/product/galaxy-a16-5g'].checkedAt, new Date(NOW).toISOString());
  assert.equal(prices['https://s.bd/products/a16?variant=1'].price, 21500);
  assert.equal(prices['https://s.bd/products/a16?variant=2'].inStock, false);
  assert.equal(answer.changed, 3);

  const again = await recheck(index, 'galaxy a16');
  assert.equal(again.rechecked, 1, 'just-read pages are skipped; only the page robots refused stays stale');

  /* Pictured multi-shop cards must not exhaust a shop's per-recheck quota before unpictured single-shop cards. */
  const fanIndex = createPriceIndex(listOf(
    entry('a.bd', 'JisuLife Handheld Fan Pro1', 3000, { checkedAt: stale }),
    entry('b.bd', 'JisuLife Handheld Fan Pro1', 3100, { checkedAt: stale, image: 'https://b.bd/pro1.jpg' }),
    entry('a.bd', 'AGX HF40 Portable Handheld Fan', 999, { checkedAt: stale })
  ), { now: () => NOW });
  const fanFetched = [];
  const fanRecheck = createRechecker({
    fetchPage: async url => {
      fanFetched.push(url);
      return { ok: true, status: 200, text: `<script type="application/ld+json">${JSON.stringify({ '@type': 'Product', name: 'AGX HF40', image: 'https://a.bd/agx.jpg', offers: { price: 999, priceCurrency: 'BDT' } })}</script>` };
    },
    robots: { allows: async () => true },
    perShop: 1,
    now: () => NOW
  });
  const fanAnswer = await fanRecheck(fanIndex, 'handheld fan');
  assert.deepEqual(fanFetched, ['https://a.bd/product/agx-hf40-portable-handheld-fan', 'https://b.bd/product/jisulife-handheld-fan-pro1']);
  const agx = fanAnswer.groups.flatMap(group => group.offers).find(offer => /AGX HF40/i.test(offer.title));
  assert.equal(agx.image, 'https://a.bd/agx.jpg');
});

test('the re-check endpoint runs the server\'s re-check, and says so when there is none', async () => {
  const asked = [];
  const api = createApi({ liveSearch: null, recheck: async (query, options) => { asked.push([query, options]); return { query, groups: [], rechecked: 0 }; } });
  assert.equal((await call(api, '/api/recheck', 'galaxy a16')).status, 200);
  assert.deepEqual(asked, [['galaxy a16', { product: '' }]]);
  assert.equal((await call(createApi({ liveSearch: null }), '/api/recheck')).status, 503);
  assert.equal((await call(createApi({ liveSearch: null }), '/api/nothing')).status, 404);
});

test('words shops write joined or apart are found either way, and nothing found falls back to the closest', () => {
  const index = createPriceIndex({ version: 1, shops: {
    'a.bd': { entries: [entry('a.bd', 'Anker 335 Power Bank 20000mAh', 3500), entry('a.bd', 'JBL Tune Earbuds', 4000), entry('a.bd', 'Anker Nano Charger 30W', 1800), entry('a.bd', 'Apple Watch SE 3', 30000)] },
    'b.bd': { entries: [entry('b.bd', 'Baseus Powerbank 10000mAh', 2000), entry('b.bd', 'Xiaomi Powerbank 20000mAh', 2600), entry('b.bd', 'Apple Watch SE 3 GPS', 31000), entry('b.bd', 'Amazfit Smart Watch', 9000), entry('b.bd', 'Romoss Power Bank 30000mAh', 3900), entry('b.bd', 'QCY T13 Earbuds', 1900), entry('b.bd', 'Kieslect Smart Watch', 3000), entry('b.bd', 'Colmi Smart Watch', 2500)] }
  } }, { now: () => NOW });

  const split = index.search('anker powerbank');
  assert.equal(split.query, 'anker power bank', 'one shop writes Powerbank, Anker writes Power Bank');
  assert.equal(split.correctedFrom, 'anker powerbank');
  assert.equal(index.search('jbl ear buds').query, 'jbl earbuds');
  assert.equal(index.search('xiaomi powerbank 20000').priced, 1, 'a bare number matches it with its unit, 20000mAh');

  assert.equal(index.search('anker zzzz').found, 0, 'a plain search never broadens: a web search merges with it');
  const closest = index.search('anker zzzz', { closest: true });
  assert.equal(closest.query, 'anker');
  assert.equal(closest.broadenedFrom, 'anker zzzz');
  assert.equal(index.search('apple smartwatch', { closest: true }).query, 'apple watch', 'the narrowest search that finds something');
});

test('home cards without a photo get one from a shop that answers, not one that keeps refusing', async () => {
  const { createRechecker } = await import('../server/recheck.mjs');
  const index = createPriceIndex({ version: 1, shops: {
    'no.bd': { entries: [entry('no.bd', 'Galaxy A16 5G', 21000), entry('no.bd', 'Galaxy A17 5G', 26000), entry('no.bd', 'Redmi Note 14', 24000)] },
    'ok.bd': { entries: [entry('ok.bd', 'Galaxy A16 5G', 22000), entry('ok.bd', 'Galaxy A17 5G', 27000), entry('ok.bd', 'Redmi Note 14', 25000)] }
  } }, { now: () => NOW });
  const page = (name, price) => `<script type="application/ld+json">${JSON.stringify({ '@type': 'Product', name, image: `https://ok.bd/${name.replace(/\W+/g, '-')}.jpg`, offers: { price, priceCurrency: 'BDT' } })}</script>`;
  const asked = [];
  const recheck = createRechecker({
    fetchPage: async url => {
      asked.push(url);
      if (url.includes('no.bd')) return { ok: false, status: 403, text: '' };
      const name = url.includes('a16') ? 'Galaxy A16 5G' : url.includes('a17') ? 'Galaxy A17 5G' : 'Redmi Note 14';
      return { ok: true, status: 200, text: page(name, 1000) };
    },
    robots: { allows: async () => true },
    now: () => NOW
  });
  const cards = () => index.browse().shelves.flatMap(shelf => shelf.cards);
  assert.ok(cards().length >= 3 && cards().every(card => !card.image));

  const { filled, missing } = await recheck.fillPhotos(index);
  assert.equal(missing, 0);
  assert.equal(filled, cards().length);
  assert.ok(cards().every(card => card.image?.startsWith('https://ok.bd/')));
  assert.ok(asked.filter(url => url.includes('no.bd')).length <= 3, 'a shop that keeps refusing is left alone');
});

test('productKey keeps M4 after screen sizes, strips unbracketed RAM/ROM, and buildBrowse drops mismatched accessories', async () => {
  const { buildBrowse, productKey } = await import('../server/browse.mjs');
  assert.equal(productKey('MacBook Air 15-inch M4 16GB / 256GB'), 'macbook air m4');
  assert.equal(productKey('Galaxy A16 5G 8/256GB Official'), 'galaxy a16');

  const [deduped] = readShopifyProduct({ title: 'AirPods 4', variants: [{ id: 1, title: 'AirPods 4', price: 1499900, available: true }] }, 'https://s.bd/products/airpods-4');
  assert.equal(deduped.name, 'AirPods 4');

  const index = createPriceIndex({ version: 1, shops: {
    'a.bd': { entries: [entry('a.bd', 'iPhone 17 Pro Max 256GB', 175000)] },
    'b.bd': { entries: [entry('b.bd', 'Green Lion Camera Lens for iPhone 17 Pro Max', 1990)] }
  } }, { now: () => NOW });
  const shelves = buildBrowse(query => index.search(query), { 'a.bd': 1, 'b.bd': 1 }, [{ id: 'phones', label: 'Phones', products: ['iPhone 17 Pro Max'] }]);
  assert.equal(shelves.shelves.length, 0);
});

test('a model code ending in W is not a size, routers are not watches, and card names keep their hyphens', async () => {
  const { discoverCategories, displayName, productKey } = await import('../server/browse.mjs');

  /* B8: "F-91W" is a watch, not 91 watts; two models must not share a card. */
  assert.notEqual(productKey('Casio Vintage F-91W-1DG Digital Resin Band Unisex Watch'), productKey('Casio Vintage F-105W-1ADF Digital Resin Band Unisex Watch'));
  assert.equal(productKey('Micropack KM-205W Wireless Keyboard'), productKey('Micropack KM205W Wireless Keyboard'));
  assert.notEqual(productKey('Micropack KM-205W Wireless Keyboard'), productKey('Micropack KM-270W Wireless Keyboard'));
  /* A size written against a word is still a size. */
  assert.equal(productKey('UGREEN S550 Universal Travel Power Adapter-65W'), 'ugreen s550 universal travel power adapter');

  /* B6: "Dual Band" is a router; a Huawei Band is a watch. */
  const listing = (shop, name) => ({ shop, name });
  const shelves = discoverCategories([
    listing('a.bd', 'Cudy M1500 AX1500 Dual Band Wi-Fi 6 Mesh Router'), listing('b.bd', 'Cudy M1500 AX1500 Dual Band Wi-Fi 6 Mesh Router'),
    listing('a.bd', 'Huawei Band 11 Pro'), listing('b.bd', 'Huawei Band 11 Pro')
  ]);
  const shelfOf = name => shelves.find(shelf => shelf.products.some(product => product.startsWith(name)))?.id;
  assert.equal(shelfOf('Cudy'), 'pc');
  assert.equal(shelfOf('Huawei'), 'watches');

  /* B7: names as the shops write them, and still the same search. */
  for (const [name, shown] of [
    ['Sony BRAVIA 7 K-75XR70 75-Inch Mini LED QLED 4K HDR Google TV', 'Sony BRAVIA 7 K-75XR70 Mini'],
    ['T-Wolf G580 Wired Mouse with Grip Tape', 'T-Wolf G580 Wired Mouse'],
    ['Apple USB-C to Lightning Cable (1m)', 'Apple USB-C to Lightning Cable'],
    ['Micropack KM-205W Wireless Keyboard', 'Micropack KM-205W Wireless Keyboard']
  ]) {
    const key = productKey(name);
    assert.equal(displayName(key, [name]), shown);
    assert.equal(productKey(displayName(key, [name])), key);
  }
});

test('crawlShop remembers unpriced pages so they do not starve priced pages, and keeps saved prices if robots.txt is unreachable', async () => {
  const { createRobots } = await import('../server/robots.mjs');
  const pages = {
    'https://a.bd/sitemap.xml': urlset(['https://a.bd/product/category', 'https://a.bd/product/phone']),
    'https://a.bd/product/category': '<html><title>Category</title></html>',
    'https://a.bd/product/phone': product('Phone 15', 50000)
  };
  let time = Date.parse('2026-11-21T00:00:00Z');
  const first = await crawlShop(shop, { fetchPage: site(pages), robots: allowAll, sleep: noWait, now: () => time });
  assert.equal(first.entries.length, 1);
  assert.ok('https://a.bd/product/category' in first.checked);

  time += 60_000;
  const opened = [];
  const second = await crawlShop(shop, {
    fetchPage: async url => { opened.push(url); return site(pages)(url); },
    robots: allowAll, previous: first.entries, checked: first.checked, limit: 1, sleep: noWait, now: () => time
  });
  assert.deepEqual(opened.slice(1), ['https://a.bd/product/category'], 'oldest checked page goes next');
  assert.equal(second.entries[0].price, 50000, 'existing priced entry is preserved');

  const downRobots = createRobots(async () => ({ status: 503, text: '' }));
  const preserved = await crawlShop(shop, {
    fetchPage: site(pages), robots: downRobots, previous: first.entries, sleep: noWait, now: () => time
  });
  assert.equal(preserved.entries.length, 1, 'unreachable robots.txt must not wipe saved prices');
  assert.equal(preserved.stats.failed, 2);
});

test('watchIndexFile concurrent cold-start requests wait for the initial load', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'daamkhoj-cold-'));
  const file = path.join(dir, 'list.json');
  await saveIndexFile(file, listOf(entry('a.bd', 'iPhone 15 128GB', 82000)));
  const search = watchIndexFile(file, { checkEveryMs: 1000 });
  const [browsed, found] = await Promise.all([search.browse(), search('iphone 15')]);
  assert.equal(browsed.prices, 1);
  assert.equal(found.priced, 1);
});

test('compound searches merge joined and spaced spellings without splitting strong single words', () => {
  const index = createPriceIndex({ version: 1, shops: {
    'a.bd': { entries: [
      entry('a.bd', 'Baseus Powerbank 10000mAh', 2000),
      entry('a.bd', 'MagSafe Charger 15W', 4500),
      entry('a.bd', 'MagSafe Power Bank 5000mAh', 3500)
    ] },
    'b.bd': { entries: [
      entry('b.bd', 'Baseus Power Bank 20000mAh', 2800),
      entry('b.bd', 'Anker Power Bank 10000mAh', 2500),
      entry('b.bd', 'MagSafe Wallet', 2200),
      entry('b.bd', 'Mag Wallet', 900),
      entry('b.bd', 'Safe Box', 1200)
    ] }
  } }, { now: () => NOW });

  const merged = index.search('baseus powerbank');
  assert.equal(merged.priced, 2, 'merges Baseus Powerbank and Baseus Power Bank');
  const magsafe = index.search('magsafe powerbank');
  assert.equal(magsafe.query, 'magsafe power bank', 'keeps magsafe whole while splitting powerbank');
  assert.equal(magsafe.priced, 1);
});

test('a search of only numbers finds what checking every name would, written any way', () => {
  const names = ['Kingston NV2 256 GB SSD', 'Lexar 256GB microSD', 'Lexar 512GB microSD', 'Anker 65W Charger', 'Anker 65 W GaN',
    'Casio F-91W', 'Xiaomi Power Bank 20000mAh', 'Romoss 10000 mAh', 'Galaxy S24 256GB', 'Phone 1256GB Case', 'Model A15 16 Kit'];
  const index = createPriceIndex(listOf(...names.map((name, i) => entry(`s${i}.bd`, name, 1000 + i))), { now: () => NOW });
  for (const query of ['256gb', '65w', '65', '20000', '91w', '1516', '512gb']) {
    const everyName = names.filter(name => matchesQuery(name, query)).length;
    assert.equal(index.search(query).found, everyName, query);
  }
  assert.equal(index.search('256gb').found, 3);
});

test('search engines get robots.txt, one sitemap address per product, and a head built from real prices', async () => {
  const base = 'https://example.test';
  assert.match(robotsTxt(base), /Disallow: \/api\/[\s\S]*Sitemap: https:\/\/example\.test\/sitemap\.xml/);

  const map = sitemapXml(base, { updatedAt: '2026-11-24T05:00:00.000Z', shelves: [
    { cards: [{ name: 'iPhone 17' }, { name: 'JBL Flip 7' }] }, { cards: [{ name: 'iphone 17' }] }
  ] });
  assert.equal((map.match(/<url>/g) ?? []).length, 5);
  assert.ok(map.includes('<loc>https://example.test/?q=iphone+17</loc><lastmod>2026-11-24</lastmod>'));

  const offers = [
    { shop: 'a.bd', url: 'https://a.bd/1', title: 'LG 24MR400 Monitor', price: 12000, inStock: true },
    { shop: 'b.bd', url: 'https://b.bd/1', title: 'LG 24MR400 IPS Monitor', price: 11500, inStock: false }
  ];
  const search = async query => ({ query, groups: query === 'lg monitor' ? [{ offers }] : [] });
  const meta = await pageMeta(new URL('https://x/?q=lg+monitor'), { base, search });
  assert.equal(meta.title, 'LG Monitor price in Bangladesh — from ৳11,500 at 2 shops | DaamKhoj');
  assert.equal(meta.canonical, 'https://example.test/?q=lg+monitor');
  assert.equal(meta.jsonLd.offers.lowPrice, 11500);
  assert.equal(meta.jsonLd.offers.offers[1].availability, 'https://schema.org/OutOfStock');
  assert.ok(!meta.noindex);
  assert.equal((await pageMeta(new URL('https://x/?q=nothing+here'), { base, search })).noindex, true);

  const page = '<html><head><title>Old</title><meta name="description" content="old"></head><body></body></html>';
  const filled = withMeta(page, { title: '</title><script>x</script>', description: 'a "b"', canonical: `${base}/`, jsonLd: { name: '</script>' } });
  assert.ok(filled.includes('<title>&lt;/title&gt;&lt;script&gt;x&lt;/script&gt;</title>'));
  assert.ok(filled.includes('content="a &quot;b&quot;"'));
  assert.ok(!filled.includes('"name":"</script>"'));
  assert.ok(filled.includes('<link rel="canonical" href="https://example.test/">'));
});

test('the shipped page is open to search engines and shows no sample trust scores', async () => {
  const html = await readFile(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'index.html'), 'utf8');
  assert.ok(!/name="robots" content="noindex"/.test(html));
  assert.ok(!/trust score/i.test(html));
  assert.ok(!/data-view="compare"/.test(html));
});
