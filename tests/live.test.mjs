/* Live search rules, tested with no network: every outside call is a stand-in. */

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { gzipSync } from 'node:zlib';

import { createApi, createRateLimiter } from '../server/api.mjs';
import { createLiveSearch, groupOffers, LiveSearchError } from '../server/live-search.mjs';
import { matchesQuery, variantOf } from '../server/matching.mjs';
import { readPage } from '../server/page-price.mjs';
import { createBrightDataSearch } from '../server/providers/bright-data.mjs';
import { createRobots, isAllowed, parseRobots } from '../server/robots.mjs';
import { assertPublicUrl, fetchPublic, isPrivateAddress, publicRequest, resolveResultLink } from '../server/safe-fetch.mjs';

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

test('a character code past Unicode does not lose the page\'s price', () => {
  const page = readPage(product('iPhone 15 &#99999999; &#x110000; &#2547;', '74,499'));
  assert.equal(page.price, 74499);
  assert.equal(page.name, 'iPhone 15 &#99999999; &#x110000; ৳');
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

test('a private IPv4 address hidden inside an IPv6 one is still refused', async () => {
  /* The URL parser rewrites [::ffff:127.0.0.1] as [::ffff:7f00:1], which once slipped through. */
  for (const address of ['::ffff:7f00:1', '::ffff:a9fe:a9fe', '::127.0.0.1', '64:ff9b::a00:1', '2002:c0a8:101::', 'fe80::1%en0', '2001:db8::1', '::']) {
    assert.ok(isPrivateAddress(address), address);
  }
  for (const address of ['::ffff:808:808', '2606:4700::1111', '2404:6800:4003::200e']) {
    assert.ok(!isPrivateAddress(address), address);
  }
  const resolve = async () => [{ address: '93.184.216.34' }];
  for (const url of ['http://[::ffff:127.0.0.1]/', 'http://[::ffff:169.254.169.254]/latest/meta-data', 'http://[64:ff9b::7f00:1]/']) {
    await assert.rejects(assertPublicUrl(url, resolve), /private host/, url);
  }
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
    search: async query => { searches++; return Object.keys(pages).map(link => ({ title: query, link, description: '' })); },
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

const ldBlock = data => `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
const nextFlight = data => {
  const payload = `1d:[["$","$L35",null,{"jsonLd":${JSON.stringify(data)}}]]`;
  return `<script>self.__next_f.push([1,${JSON.stringify(payload)}])</script>`;
};

test('a product described twice with one price is still one clear price', () => {
  const page = readPage(`<html>${ldBlock({ '@graph': [{
    '@type': 'Product', name: 'Pran Miniket Rice 5kg',
    Offers: { '@type': 'Offer', price: '470', priceCurrency: 'BDT', availability: 'https://schema.org/InStock' }
  }] })}${ldBlock({ '@graph': [{
    '@type': 'Product', name: 'Pran Miniket Rice 5kg',
    offers: [{ '@type': 'Offer', availability: 'https://schema.org/InStock',
      priceSpecification: [{ '@type': 'UnitPriceSpecification', price: '470.00', priceCurrency: 'BDT' }] }]
  }] })}</html>`);
  assert.equal(page.price, 470);
  assert.equal(page.inStock, true);
});

test('the same product with two prices, or two products, stays unclear', () => {
  const offer = price => ({ '@type': 'Offer', price, priceCurrency: 'BDT' });
  const samePair = readPage(`${ldBlock({ '@type': 'Product', name: 'Rice', offers: offer(470) })}${ldBlock({ '@type': 'Product', name: 'Rice', offers: offer(500) })}`);
  assert.equal(samePair.reason, 'ambiguous');
  const related = readPage(`${ldBlock({ '@type': 'Product', name: 'Rice', offers: offer(470) })}${ldBlock({ '@type': 'Product', name: 'Oil', offers: offer(470) })}`);
  assert.equal(related.reason, 'ambiguous');
  const sale = readPage(ldBlock({ '@type': 'Product', name: 'Rice', offers: { priceCurrency: 'BDT',
    priceSpecification: [{ price: 470, priceCurrency: 'BDT' }, { price: 500, priceCurrency: 'BDT' }] } }));
  assert.equal(sale.reason, 'ambiguous');
});

test('reads structured data a Next.js page embeds in its script payload', () => {
  const page = readPage(`<title>Rice</title>${nextFlight([
    { '@context': 'https://schema.org', '@type': 'Product', name: 'Shop Pran Miniket Rice 5kg at Shwapno.com',
      offers: { '@type': 'Offer', priceCurrency: 'BDT', price: 470, availability: 'https://schema.org/InStock' } },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [] }
  ])}`);
  assert.equal(page.price, 470);
  assert.equal(page.name, 'Pran Miniket Rice 5kg');
});

test('broken or several embedded products give no price', () => {
  assert.equal(readPage('<script>self.__next_f.push([1,"{\\"@context\\":\\"https://schema.org\\",\\"@type\\":\\"Product\\",\\"offers\\":{"])</script>').price, null);
  const two = readPage(nextFlight([
    { '@context': 'https://schema.org', '@type': 'Product', name: 'Rice', offers: { priceCurrency: 'BDT', price: 470 } },
    { '@context': 'https://schema.org', '@type': 'Product', name: 'Oil', offers: { priceCurrency: 'BDT', price: 900 } }
  ]));
  assert.equal(two.reason, 'ambiguous');
});

test('pack sizes and spellings match however a shop writes them', () => {
  for (const name of ['Pusti Soyabean Oil 5Ltr.', 'Teer Soyabean Oil 5 ltr', 'Fresh Soybean Oil 5L', 'Paragon Soyabean Oil 5 Litres', 'Rupchanda Soybean Oil 5 Liter']) {
    assert.ok(matchesQuery(name, 'soybean oil 5 litre'), name);
  }
  assert.ok(!matchesQuery('Pusti Soyabean Oil 2 Ltr', 'soybean oil 5 litre'));
  assert.ok(!matchesQuery('Pusti Soyabean Oil 50 Ltr', 'soybean oil 5 litre'));
  assert.deepEqual(variantOf('Pusti Soyabean Oil 5Ltr.', 'soybean oil').key, variantOf('Pusti Soybean Oil 5 Litres', 'soybean oil').key);
  assert.equal(variantOf('Pran Rice 500 gm', 'rice').label, 'Pran · 500g');
  /* A sub-brand after a hyphen is still the same brand. */
  assert.equal(variantOf('Pran-Latina Mango Juice-1ltr', 'mango juice 1 litre').key, variantOf('Pran Mango Juice 1 Litre', 'mango juice 1 litre').key);
});

test('results about something else are never opened', async () => {
  const opened = [];
  const live = createLiveSearch({
    search: async () => [
      { title: 'Spicer MN Homes For Sale - Zillow', link: 'https://www.zillow.com/spicer-mn/', description: 'Real estate' },
      { title: 'Teer Fortified Soyabean Oil - Online Grocery Shop', link: 'https://shop.example/teer-soyabean-oil-5-ltr', description: '' }
    ],
    resolveLink: async link => link,
    robots: { allows: async () => true },
    fetchPage: async url => { opened.push(url); return { ok: true, url, text: product('Teer Soyabean Oil 5 Ltr', 900) }; }
  });
  const result = await live.run('soybean oil 5 litre');
  assert.deepEqual(opened, ['https://shop.example/teer-soyabean-oil-5-ltr']);
  assert.equal(result.priced, 1);
  assert.equal(result.skipped.otherProduct, 1);
});

test('price guides are not treated as shops', async () => {
  const hosts = ['https://www.mobilebd.co/phone/a16', 'https://mobile.bd/phones/a16', 'https://mobileinto.com/bd/Samsung-Galaxy-A16/', 'https://www.mobilekotha.com/samsung-galaxy-a16', 'https://www.mrp.com.bd/samsung-galaxy-a16'];
  const opened = [];
  const live = createLiveSearch({
    search: async () => hosts.map(link => ({ title: 'Galaxy A16', link, description: '' })),
    resolveLink: async link => link,
    robots: { allows: async () => true },
    fetchPage: async url => { opened.push(url); return { ok: false }; }
  });
  const result = await live.run('galaxy a16');
  assert.deepEqual(opened, []);
  assert.equal(result.skipped.notShop, 5);
});

test('Bing searches from Bangladesh with both wordings and merges the answers', async () => {
  const bodies = [];
  const answer = { 'rice price in bangladesh': ['https://a.bd', 'https://b.bd'], 'rice bangladesh': ['https://a.bd', 'https://c.bd'] };
  const fetchImpl = async (_, init) => {
    const body = JSON.parse(init.body);
    bodies.push(body);
    const links = answer[new URL(body.url).searchParams.get('q')];
    return new Response(JSON.stringify({ organic: links.map(link => ({ title: 'T', link, description: '' })) }));
  };
  const search = createBrightDataSearch({ apiKey: 'k', zone: 'z', fetchImpl });
  const results = await search('rice');
  assert.deepEqual(results.map(result => result.link), ['https://a.bd', 'https://b.bd', 'https://c.bd']);
  assert.ok(bodies.every(body => body.country === 'bd'));
  assert.equal(search.requests, 2);
});

test('one failing wording still gives results; all failing is an error', async () => {
  let calls = 0;
  const flaky = async () => {
    calls++;
    return calls === 1 ? new Response('no', { status: 500 }) : new Response('{"organic":[{"title":"T","link":"https://a.bd"}]}');
  };
  assert.equal((await createBrightDataSearch({ apiKey: 'k', zone: 'z', fetchImpl: flaky })('rice')).length, 1);
  const down = createBrightDataSearch({ apiKey: 'k', zone: 'z', fetchImpl: async () => new Response('no', { status: 500 }) });
  await assert.rejects(down('rice'));
});

test('the daily limit counts every paid request a search makes', async () => {
  const search = async () => [];
  search.requests = 2;
  const live = createLiveSearch({ search, resolveLink: async link => link, fetchPage: async () => ({ ok: false }), robots: { allows: async () => true }, dailyLimit: 3 });
  await live.run('iphone 15');
  await assert.rejects(live.run('galaxy a16'), error => error.code === 'budget');
});

test('a price range is not one clear price', () => {
  const page = readPage(ldBlock({ '@type': 'Product', name: 'iPhone 15', offers: [{ '@type': 'AggregateOffer', lowPrice: '10000', highPrice: '100999', offerCount: 45,
    priceSpecification: [{ price: '10000', priceCurrency: 'BDT' }] }] }));
  assert.equal(page.reason, 'ambiguous');
  const single = readPage(ldBlock({ '@type': 'Product', name: 'iPhone 15', offers: { '@type': 'AggregateOffer', lowPrice: '500', highPrice: '500',
    offers: [{ '@type': 'Offer', price: '500', priceCurrency: 'BDT' }] } }));
  assert.equal(single.price, 500);
});

test('a price under half the typical one never reaches the customer', async () => {
  const { live } = fakeLive(pagesFor({
    'https://a.bd/p': product('iPhone 15 128GB', 74000),
    'https://b.bd/p': product('iPhone 15 128GB', 76000),
    'https://c.bd/p': product('iPhone 15 128GB', 78000),
    'https://d.bd/p': product('iPhone 15 128GB', 10000)
  }));
  const result = await live.run('iphone 15');
  assert.equal(result.priced, 3);
  assert.equal(result.skipped.noPrice, 1);
  assert.equal(result.groups[0].lowest, 'https://a.bd/p');
});

test('exact matches are opened first when there are too many results', async () => {
  const opened = [];
  const live = createLiveSearch({
    search: async () => [
      { title: 'Galaxy', link: 'https://nasa.example/galaxy', description: '' },
      { title: 'Galaxy A16', link: 'https://shop.example/a16', description: '' }
    ],
    resolveLink: async link => link,
    robots: { allows: async () => true },
    fetchPage: async url => { opened.push(url); return { ok: false }; },
    maxPages: 1
  });
  await live.run('galaxy a16');
  assert.deepEqual(opened, ['https://shop.example/a16']);
});

test('5G on a phone is a network, not a pack size, and splits versions', () => {
  assert.equal(variantOf('Samsung Galaxy A16 5G', 'galaxy a16').clear, false);
  assert.notEqual(variantOf('Samsung Galaxy A16 5G 128GB', 'galaxy a16').key, variantOf('Samsung Galaxy A16 128GB', 'galaxy a16').key);
  assert.notEqual(variantOf('Samsung Galaxy A16 5G 8GB 256GB', 'galaxy a16').key, variantOf('Samsung Galaxy A16 5G 6GB 128GB', 'galaxy a16').key);
});

test('a retry shares the first request\'s time limit, so a search cannot outlast the browser', async () => {
  const signals = [];
  const search = createBrightDataSearch({
    apiKey: 'k', zone: 'z', engine: 'google', timeoutMs: 60,
    fetchImpl: async (_, init) => {
      signals.push(init.signal);
      if (signals.length === 1) {
        await new Promise(done => setTimeout(done, 40));
        return new Response('');
      }
      return new Promise((_, fail) => init.signal.addEventListener('abort', () => fail(init.signal.reason)));
    }
  });
  const started = Date.now();
  await assert.rejects(search('iphone'));
  assert.equal(signals.length, 2);
  assert.equal(signals[0], signals[1]);
  assert.ok(Date.now() - started < 150, 'the retry got a fresh time limit');
});

test('a Google link is followed to the shop, even when Google redirects relatively', async () => {
  const away = async () => new Response(null, { status: 302, headers: { location: 'https://shop.example/p' } });
  assert.equal(await resolveResultLink('https://www.google.com/url?q=1', { fetchImpl: away }), 'https://shop.example/p');

  const relative = async () => new Response('<a href="https://shop.example/p2">go</a>', { status: 302, headers: { location: '/url?q=2' } });
  assert.equal(await resolveResultLink('https://www.google.com/url?q=2', { fetchImpl: relative }), 'https://shop.example/p2');

  assert.equal(await resolveResultLink('https://shop.example/direct'), 'https://shop.example/direct');
});

test('a retried empty answer counts against the daily limit', async () => {
  let calls = 0;
  const search = createBrightDataSearch({
    apiKey: 'k', zone: 'z',
    fetchImpl: async () => {
      calls++;
      /* Every wording comes back empty once, then answers. */
      return new Response(calls <= 2 ? '' : JSON.stringify({ organic: [] }));
    }
  });
  const live = createLiveSearch({ search, resolveLink: async link => link, fetchPage: async () => ({ ok: false }), robots: { allows: async () => true }, dailyLimit: 5 });
  await live.run('iphone 15');
  assert.equal(calls, 4);
  /* 4 of 5 used, and the next search needs 2. */
  await assert.rejects(live.run('galaxy a16'), error => error.code === 'budget');
});

/* A real server on this machine, reached through a name the test resolves however it likes. */
async function localServer(handler) {
  const server = createServer(handler);
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  return { port: server.address().port, close: () => new Promise(done => server.close(done)) };
}

test('the connection itself refuses a private address, so a host cannot switch answers after the check', async () => {
  const { port, close } = await localServer((_, res) => res.end('secret'));
  try {
    const local = async () => [{ address: '127.0.0.1', family: 4 }];
    await assert.rejects(publicRequest(`http://shop.example:${port}/`, {}, { resolve: local }), /private host/);

    /* Rebinding: the first lookup (the check) says public, the second (the connection) private. */
    let lookups = 0;
    const rebinding = async () => (lookups++ === 0 ? [{ address: '93.184.216.34', family: 4 }] : [{ address: '127.0.0.1', family: 4 }]);
    await assert.rejects(fetchPublic('http://rebind.example/', {
      resolve: rebinding,
      fetchImpl: (url, init) => publicRequest(`http://rebind.example:${port}/`, init, { resolve: rebinding })
    }), /private host/);
    assert.equal(lookups, 2);
  } finally {
    await close();
  }
});

test('pages come back decoded, and redirects are left to the caller to check', async () => {
  const { port, close } = await localServer((req, res) => {
    if (req.url === '/move') return res.writeHead(301, { location: '/there' }).end('moved');
    res.writeHead(200, { 'content-type': 'text/html', 'content-encoding': 'gzip' }).end(gzipSync('<title>ok ৳</title>'));
  });
  try {
    const options = { resolve: async () => [{ address: '127.0.0.1', family: 4 }], isPrivate: () => false };
    const page = await publicRequest(`http://shop.example:${port}/`, {}, options);
    assert.equal(page.status, 200);
    assert.equal(await page.text(), '<title>ok ৳</title>');

    const moved = await publicRequest(`http://shop.example:${port}/move`, {}, options);
    assert.equal(moved.status, 301);
    assert.equal(moved.headers.get('location'), '/there');
  } finally {
    await close();
  }
});
