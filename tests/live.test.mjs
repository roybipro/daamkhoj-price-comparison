/* Live search rules, tested with no network: every outside call is a stand-in. */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createApi, createRateLimiter } from '../server/api.mjs';
import { createLiveSearch, groupOffers, LiveSearchError } from '../server/live-search.mjs';
import { matchesQuery, variantOf } from '../server/matching.mjs';
import { readPage } from '../server/page-price.mjs';
import { createBrightDataSearch } from '../server/providers/bright-data.mjs';
import { createRobots, isAllowed, parseRobots } from '../server/robots.mjs';
import { assertPublicUrl, fetchPublic, isPrivateAddress } from '../server/safe-fetch.mjs';

const product = (name, price, extra = {}) => `<html><head><title>${name} | Shop</title>
  <script type="application/ld+json">${JSON.stringify({
    '@type': 'Product', name, offers: { '@type': 'Offer', price, priceCurrency: 'BDT', availability: 'https://schema.org/InStock', ...extra }
  })}</script></head></html>`;

test('reads a clear taka price from structured data', () => {
  const page = readPage(product('iPhone 15', '74,499'));
  assert.equal(page.price, 74499);
  assert.equal(page.name, 'iPhone 15');
  assert.equal(page.inStock, true);
});

test('reads stock from the page', () => {
  assert.equal(readPage(product('X', 100, { availability: 'https://schema.org/OutOfStock' })).inStock, false);
});

test('a price that is not clearly taka does not count', () => {
  assert.equal(readPage(product('X', 100, { priceCurrency: 'USD' })).reason, 'not-taka');
  assert.equal(readPage('<span itemprop="price" content="114999"></span>').reason, 'not-taka');
});

test('a page with several products or prices gives no price', () => {
  const two = `<script type="application/ld+json">[{"@type":"Product","name":"A","offers":{"price":1,"priceCurrency":"BDT"}},
    {"@type":"Product","name":"B","offers":{"price":2,"priceCurrency":"BDT"}}]</script>`;
  assert.equal(readPage(two).reason, 'ambiguous');

  const range = `<script type="application/ld+json">{"@type":"Product","name":"A","offers":[
    {"price":10,"priceCurrency":"BDT"},{"price":20,"priceCurrency":"BDT"}]}</script>`;
  assert.equal(readPage(range).reason, 'ambiguous');
});

test('broken structured data and zero prices give no price', () => {
  assert.equal(readPage('<script type="application/ld+json">{oops</script>').price, null);
  assert.equal(readPage(product('X', 0)).price, null);
});

test('reads the Open Graph price when it states the currency', () => {
  const page = readPage('<meta property="product:price:amount" content="53500"><meta property="product:price:currency" content="BDT">');
  assert.equal(page.price, 53500);
});

test('only the product searched for matches', () => {
  assert.ok(matchesQuery('Apple iPhone 15 128GB', 'iphone 15'));
  assert.ok(matchesQuery('Casio F-91W Digital Watch', 'casio f91w'));
  assert.ok(matchesQuery('ACI Miniket Rice 5 KG', 'miniket rice 5kg'));
  assert.ok(matchesQuery('iPhone 15 Pro', 'iphone 15 pro'));
  for (const [name, query] of [
    ['iPhone 15 Pro Max', 'iphone 15'],
    ['iPhone 14', 'iphone 15'],
    ['Galaxy A16 5G Back Cover', 'galaxy a16'],
    ['Used iPhone 15', 'iphone 15'],
    ['Pre-owned iPhone 15', 'iphone 15'],
    ['Miniket Rice 25kg', 'miniket rice 5kg'],
    ['Model 2015 Watch', 'watch 15']
  ]) assert.ok(!matchesQuery(name, query), name);
});

test('different versions never share a comparison', () => {
  const query = 'hp 250 g9';
  const i3 = variantOf('HP 250 G9 i3 12th Gen 8GB RAM 512GB SSD', query);
  const i7 = variantOf('HP 250 G9 Core i7 12th Gen 8GB RAM 512GB SSD', query);
  assert.notEqual(i3.key, i7.key);
  assert.equal(i7.label, 'Core i7 · 12th gen · 8GB RAM · 512GB');
  assert.equal(variantOf('Xiaomi Redmi 14C (8/256GB)', 'redmi 14c').label, '8GB RAM · 256GB');
  assert.equal(variantOf('iPhone 15', 'iphone 15').clear, false);
});

test('packaged goods compare only within one brand and size', () => {
  const query = 'miniket rice 5kg';
  assert.equal(variantOf('ACI Miniket Rice 5kg', query).label, 'ACI · 5kg');
  assert.notEqual(variantOf('ACI Miniket Rice 5kg', query).key, variantOf('Shukran Miniket Rice 5kg', query).key);
  assert.equal(variantOf('Miniket Rice Premium 5 kg', query).clear, false);
});

test('names a lowest price only for a real choice between buyable offers', () => {
  const offer = (url, price, inStock = true, clear = true) => ({
    shop: url, url, title: url, price, inStock, variant: clear ? { key: 'k', label: 'K', clear } : { key: '', label: 'Version not clear', clear }
  });
  const [group, unclear] = groupOffers([offer('c', 300), offer('a', 100, false), offer('b', 200), offer('d', 50, true, false)]);
  assert.equal(group.lowest, 'b');
  assert.deepEqual(group.offers.map(item => item.url), ['a', 'b', 'c']);
  assert.equal(unclear.comparable, false);
  assert.equal(unclear.lowest, null);
  assert.equal(groupOffers([offer('solo', 10)])[0].lowest, null);
});

test('robots rules follow the standard', () => {
  const rules = parseRobots('User-agent: *\nDisallow: /*?*\nDisallow: /private\nAllow: /private/ok\n\nUser-agent: other\nDisallow: /');
  assert.ok(isAllowed(rules, 'https://s.bd/phone'));
  assert.ok(!isAllowed(rules, 'https://s.bd/phone?x=1'));
  assert.ok(!isAllowed(rules, 'https://s.bd/private/no'));
  assert.ok(isAllowed(rules, 'https://s.bd/private/ok'));
  assert.ok(isAllowed(parseRobots('User-agent: *\nDisallow: /*.pdf$'), 'https://s.bd/a.pdf.html'));
  assert.ok(!isAllowed(parseRobots('User-agent: DaamKhojBot\nDisallow: /\n\nUser-agent: *\nAllow: /'), 'https://s.bd/a'));
});

test('a site whose rules cannot be read stays out, and missing rules allow', async () => {
  const failing = createRobots(async () => ({ status: 503, text: '' }));
  assert.equal(await failing.allows('https://down.bd/p'), false);
  const crashed = createRobots(async () => { throw new Error('no route'); });
  assert.equal(await crashed.allows('https://gone.bd/p'), false);
  const missing = createRobots(async () => ({ status: 404, text: '' }));
  assert.equal(await missing.allows('https://open.bd/p'), true);
});

test('private addresses are refused, including through a redirect', async () => {
  for (const address of ['127.0.0.1', '10.0.0.5', '169.254.169.254', '192.168.1.1', '172.16.0.1', '::1', 'fd00::1', '::ffff:127.0.0.1']) {
    assert.ok(isPrivateAddress(address), address);
  }
  assert.ok(!isPrivateAddress('103.4.145.2'));

  const resolve = async host => [{ address: host === 'inside.example' ? '10.0.0.1' : '93.184.216.34' }];
  await assert.rejects(assertPublicUrl('file:///etc/passwd', resolve));
  await assert.rejects(assertPublicUrl('http://localhost/', resolve));
  await assert.rejects(assertPublicUrl('http://169.254.169.254/latest', resolve));
  await assert.rejects(assertPublicUrl('http://inside.example/', resolve));
  await assert.rejects(assertPublicUrl('http://shop.example:8080/', resolve));

  const fetchImpl = async () => new Response(null, { status: 302, headers: { location: 'http://inside.example/secret' } });
  await assert.rejects(fetchPublic('https://shop.example/', { fetchImpl, resolve }), /private host/);
});

test('a huge page is cut off at the size limit', async () => {
  const resolve = async () => [{ address: '93.184.216.34' }];
  const fetchImpl = async () => new Response('x'.repeat(5000), { headers: { 'content-type': 'text/html' } });
  const page = await fetchPublic('https://shop.example/', { fetchImpl, resolve, maxBytes: 1000 });
  assert.equal(page.text.length, 1000);
});

function fakeLive(pages, overrides = {}) {
  let searches = 0;
  const live = createLiveSearch({
    search: async () => { searches++; return Object.keys(pages).map(link => ({ title: link, link, description: '' })); },
    resolveLink: async link => link,
    fetchPage: async url => pages[url],
    robots: { allows: async url => !url.includes('blocked') },
    ...overrides
  });
  return { live, count: () => searches };
}

const ok = text => ({ ok: true, status: 200, url: '', text });
const pagesFor = entries => Object.fromEntries(Object.entries(entries).map(([url, text]) => [url, { ...ok(text), url }]));

test('only prices read from pages of the right product reach the customer', async () => {
  const { live } = fakeLive(pagesFor({
    'https://www.a.bd/p': product('iPhone 15 128GB', 74000),
    'https://b.bd/p': product('iPhone 15 128GB', 70000),
    'https://c.bd/case': product('iPhone 15 Case', 500),
    'https://d.bd/p': '<title>iPhone 15 guide</title>',
    'https://blocked.bd/p': product('iPhone 15 128GB', 1),
    'https://www.youtube.com/watch': product('iPhone 15 128GB', 2),
    'https://www.mobiledokan.co/iphone': product('iPhone 15 128GB', 114999)
  }));

  const result = await live.run('iPhone 15');
  assert.equal(result.priced, 2);
  assert.deepEqual(result.skipped, { notShop: 2, blocked: 1, noPrice: 1, otherProduct: 1, failed: 0 });
  assert.equal(result.groups[0].label, '128GB');
  assert.equal(result.groups[0].lowest, 'https://b.bd/p');
  assert.equal(result.groups[0].offers[1].shop, 'a.bd');
});

test('adult sites are never opened, even when the engine returns them', async () => {
  const opened = [];
  const { live } = fakeLive({ 'https://www.xhamster.com/x': undefined, 'https://kingbokep.tv/y': undefined }, {
    fetchPage: async url => { opened.push(url); return { ok: false, status: 500, url, text: '' }; },
    robots: { allows: async url => { opened.push(url); return true; } }
  });
  const result = await live.run('miniket rice 5kg');
  assert.deepEqual(opened, []);
  assert.equal(result.skipped.notShop, 2);
});

test('warming saves results for instant searches and survives a failure', async () => {
  let searches = 0;
  const pages = pagesFor({ 'https://a.bd/p': product('iPhone 15', 7) });
  const logs = [];
  const live = createLiveSearch({
    search: async query => {
      searches++;
      if (query === 'broken') throw new Error('provider down');
      return [{ title: 'x', link: 'https://a.bd/p', description: '' }];
    },
    resolveLink: async link => link,
    fetchPage: async url => pages[url],
    robots: { allows: async () => true }
  });
  await live.warm(['broken', 'iPhone 15'], line => logs.push(line));
  assert.equal(searches, 2);
  assert.equal(logs.length, 2);
  assert.equal((await live.run('iphone 15')).cached, true);
  assert.equal(searches, 2);
  await live.warm(['iPhone 15']);
  assert.equal(searches, 3);
});

test('warming respects the daily limit', async () => {
  const { live, count } = fakeLive(pagesFor({ 'https://a.bd/p': product('iPhone 15', 7) }), { dailyLimit: 1 });
  await live.warm(['iphone 15', 'iphone 14', 'iphone 13']);
  assert.equal(count(), 1);
});

test('one failing page does not sink the search', async () => {
  const { live } = fakeLive({ 'https://a.bd/p': { ...ok(product('iPhone 15 128GB', 7)), url: 'https://a.bd/p' }, 'https://b.bd/p': undefined });
  const result = await live.run('iphone 15');
  assert.equal(result.priced, 1);
  assert.equal(result.skipped.failed, 1);
});

test('repeat searches reuse the saved result until it expires', async () => {
  let time = 1_000_000;
  const { live, count } = fakeLive(pagesFor({ 'https://a.bd/p': product('iPhone 15', 7) }), { now: () => time, ttlMs: 1000 });
  assert.equal((await live.run('iPhone 15')).cached, false);
  assert.equal((await live.run('  iphone   15 ')).cached, true);
  assert.equal(count(), 1);
  time += 2000;
  await live.run('iphone 15');
  assert.equal(count(), 2);
});

test('simultaneous identical searches pay once', async () => {
  const { live, count } = fakeLive(pagesFor({ 'https://a.bd/p': product('iPhone 15', 7) }));
  await Promise.all([live.run('iphone 15'), live.run('iphone 15')]);
  assert.equal(count(), 1);
});

test('the daily limit stops paid searches but not saved ones', async () => {
  const { live, count } = fakeLive(pagesFor({ 'https://a.bd/p': product('iPhone 15', 7) }), { dailyLimit: 1 });
  await live.run('iphone 15');
  await assert.rejects(live.run('galaxy a16'), error => error instanceof LiveSearchError && error.code === 'budget');
  assert.equal((await live.run('iphone 15')).cached, true);
  assert.equal(count(), 1);
});

test('meaningless searches never reach the paid provider', async () => {
  const { live, count } = fakeLive({});
  for (const query of ['', ' ', 'x', 'price in bangladesh']) {
    await assert.rejects(live.run(query), error => error.code === 'query', query);
  }
  assert.equal(count(), 0);
});

test('the provider retries an empty answer and keeps the key out of errors', async () => {
  const bodies = ['', JSON.stringify({ organic: [{ title: 'T', link: 'https://a.bd', description: 'D' }] })];
  const calls = [];
  const search = createBrightDataSearch({
    apiKey: 'SECRET', zone: 'z', engine: 'google',
    fetchImpl: async (url, init) => { calls.push(init); return new Response(bodies[calls.length - 1]); }
  });
  assert.deepEqual(await search('iphone'), [{ title: 'T', link: 'https://a.bd', description: 'D' }]);
  assert.equal(calls.length, 2);
  const target = new URL(JSON.parse(calls[0].body).url);
  assert.equal(target.searchParams.get('gl'), 'bd');
  assert.equal(calls[0].headers.authorization, 'Bearer SECRET');

  const refused = createBrightDataSearch({ apiKey: 'SECRET', zone: 'z', fetchImpl: async () => new Response('no', { status: 401 }) });
  await assert.rejects(refused('iphone'), error => !error.message.includes('SECRET'));
});

function callApi(api, query = 'iphone 15', method = 'GET') {
  return new Promise(resolve => {
    const res = { writeHead(status) { this.status = status; }, end(body) { resolve({ status: this.status, body: JSON.parse(body) }); } };
    api({ method, socket: { remoteAddress: '1.1.1.1' } }, res, new URL(`http://x/api/search?q=${encodeURIComponent(query)}`));
  });
}

test('the API reports each failure without leaking details', async () => {
  assert.equal((await callApi(createApi({ liveSearch: null }))).status, 503);
  const fine = { run: async query => ({ query, groups: [] }) };
  assert.equal((await callApi(createApi({ liveSearch: fine }), 'x', 'POST')).status, 405);
  assert.equal((await callApi(createApi({ liveSearch: fine }))).status, 200);

  const logs = [];
  const broken = { run: async () => { throw new Error('secret detail'); } };
  const failed = await callApi(createApi({ liveSearch: broken, log: line => logs.push(line) }));
  assert.equal(failed.status, 502);
  assert.ok(!JSON.stringify(failed.body).includes('secret detail'));
  assert.equal(logs.length, 1);

  const budget = { run: async () => { throw new LiveSearchError('budget', 'Daily live search limit reached'); } };
  assert.equal((await callApi(createApi({ liveSearch: budget }))).status, 429);
});

test('the search engine is a setting, and a mistyped one fails at startup', async () => {
  let url;
  const fetchImpl = async (_, init) => { url = new URL(JSON.parse(init.body).url); return new Response('{"organic":[]}'); };
  await createBrightDataSearch({ apiKey: 'k', zone: 'z', fetchImpl })('iphone');
  assert.equal(url.hostname, 'www.bing.com');
  assert.equal(url.searchParams.get('cc'), 'bd');
  assert.equal(url.searchParams.get('safesearch'), 'strict');
  assert.throws(() => createBrightDataSearch({ apiKey: 'k', zone: 'z', engine: 'gogle' }));
});

test('a client searching too fast is slowed down', async () => {
  const api = createApi({ liveSearch: { run: async () => ({}) }, allowClient: createRateLimiter({ limit: 1 }) });
  assert.equal((await callApi(api)).status, 200);
  assert.equal((await callApi(api)).status, 429);
});
