/* The price list: building it from sitemaps, and searching it. No network calls. */

import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { createApi } from '../server/api.mjs';
import { crawlShop, readShopifyProduct } from '../server/crawler.mjs';
import { mergeGroups } from '../server/live-search.mjs';
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
  const good = JSON.stringify({ version: 1, shops: { 'a.bd': { entries: [entry('a.bd', 'Galaxy A16', 20000)] } } });
  const serve = (body, status = 200) => async () => new Response(body, { status });

  assert.equal(await pullIndexFile('https://x/list.json', file, { fetchImpl: serve(good) }), true);
  assert.equal((await loadIndexFile(file)).shops['a.bd'].entries.length, 1);
  assert.equal(await pullIndexFile('https://x/list.json', file, { fetchImpl: serve(good) }), false, 'the same list is not rewritten');

  await assert.rejects(pullIndexFile('https://x/list.json', file, { fetchImpl: serve('<html>rate limited</html>') }));
  await assert.rejects(pullIndexFile('https://x/list.json', file, { fetchImpl: serve(JSON.stringify({ version: 2 })) }), /not a price list/);
  await assert.rejects(pullIndexFile('https://x/list.json', file, { fetchImpl: serve('', 404) }), /404/);
  assert.equal((await loadIndexFile(file)).shops['a.bd'].entries.length, 1, 'the last good list stays');
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
