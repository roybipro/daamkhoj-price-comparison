import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { createMcp, describeAnswer } from '../server/mcp.mjs';

const answer = {
  query: 'iphone 16',
  correctedFrom: 'iphon 16',
  groups: [
    { label: '128GB', comparable: true, offers: [
      { shop: 'a.bd', url: 'https://a.bd/iphone-16', title: 'Apple iPhone 16 128GB', price: 99000, inStock: false, checkedAt: '2026-11-27T05:00:00.000Z' },
      { shop: 'b.bd', url: 'https://b.bd/iphone-16', title: 'iPhone 16 128GB', price: 101500, inStock: true, checkedAt: '2026-11-27T06:00:00.000Z' }
    ] },
    { label: '256GB', comparable: true, offers: [] }
  ]
};

async function serve(options) {
  const handle = createMcp({ siteUrl: 'https://daamkhoj.test/', log: () => {}, ...options });
  const server = createServer((req, res) => handle(req, res)).listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/mcp`;
  const post = async body => {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
  };
  return { url, post, close: () => server.close() };
}

test('the report names the cheapest shop that has it in stock, with links and dates', () => {
  const text = describeAnswer(answer, 'https://daamkhoj.test');
  assert.match(text, /read from "iphon 16"/);
  assert.match(text, /Cheapest available: ৳1,01,500 at b\.bd — https:\/\/b\.bd\/iphone-16/, 'the cheaper out-of-stock offer is not "available"');
  assert.match(text, /৳99,000 · a\.bd · out of stock · checked 2026-11-27/);
  assert.doesNotMatch(text, /256GB/, 'a version with no offers is left out');
  assert.match(text, /https:\/\/daamkhoj\.test\/\?q=iphone%2016/);
  assert.match(describeAnswer({ query: 'zzz', groups: [] }, 'x'), /No shop in the price list has "zzz"/);
});

test('an agent can start, list the tools and compare prices over MCP', async t => {
  const asked = [];
  const searchIndex = async (query, options) => { asked.push([query, options]); return answer; };
  searchIndex.browse = async () => ({ shops: [{ shop: 'a.bd', prices: 1200 }], prices: 1200 });
  searchIndex.index = async () => ({ size: 1200, updatedAt: '2026-11-27T00:00:00.000Z' });
  const rechecked = [];
  const { post, close, url } = await serve({ searchIndex, recheck: async query => { rechecked.push(query); return answer; } });
  t.after(close);

  const init = await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1' } } });
  assert.equal(init.status, 200);
  assert.equal(init.body.result.protocolVersion, '2025-03-26', 'a version it knows is echoed back');
  assert.equal(init.body.result.serverInfo.name, 'daamkhoj');
  assert.equal(init.headers.get('access-control-allow-origin'), '*');
  assert.equal((await post({ jsonrpc: '2.0', id: 9, method: 'initialize', params: { protocolVersion: '1999-01-01' } })).body.result.protocolVersion, '2025-06-18');

  assert.equal((await post({ jsonrpc: '2.0', method: 'notifications/initialized' })).status, 202);

  const tools = (await post({ jsonrpc: '2.0', id: 2, method: 'tools/list' })).body.result.tools;
  assert.deepEqual(tools.map(tool => tool.name), ['compare_prices', 'list_shops']);

  const called = (await post({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'compare_prices', arguments: { query: 'iphon 16' } } })).body.result;
  assert.deepEqual(asked, [['iphon 16', { closest: true }]]);
  assert.match(called.content[0].text, /Cheapest available: ৳1,01,500 at b\.bd/);
  assert.equal(called.structuredContent.groups[0].offers[1].currency, 'BDT');
  assert.equal(called.structuredContent.page, 'https://daamkhoj.test/?q=iphone%2016');

  await post({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'compare_prices', arguments: { query: 'iphone 16', fresh: true } } });
  assert.deepEqual(rechecked, ['iphone 16'], 'fresh re-reads the shop pages');

  const shops = (await post({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'list_shops', arguments: {} } })).body.result;
  assert.match(shops.content[0].text, /1 shops, 1,200 prices/);

  const batch = await post([{ jsonrpc: '2.0', id: 6, method: 'ping' }, { jsonrpc: '2.0', id: 7, method: 'nope' }]);
  assert.deepEqual(batch.body.map(reply => reply.id), [6, 7]);
  assert.equal(batch.body[1].error.code, -32601);

  assert.equal((await fetch(url)).status, 405, 'no event stream on GET');
  assert.equal((await fetch(url, { method: 'OPTIONS' })).status, 204);
});

test('bad input, unknown tools and rate limits answer as errors, never crash', async t => {
  let allowed = 1;
  const searchIndex = async () => answer;
  const { post, close } = await serve({ searchIndex, allowQuick: () => allowed-- > 0 });
  t.after(close);

  assert.equal((await post('{not json')).body.error.code, -32700);
  assert.equal((await post({ id: 1, method: 'ping' })).body.error.code, -32600, 'no jsonrpc: "2.0"');
  assert.equal((await post({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'buy_it' } })).body.error.code, -32602);

  const empty = (await post({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'compare_prices', arguments: { query: ' ' } } })).body.result;
  assert.equal(empty.isError, true);

  assert.equal((await post({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'compare_prices', arguments: { query: 'iphone' } } })).body.result.isError, undefined);
  const limited = (await post({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'compare_prices', arguments: { query: 'iphone' } } })).body.result;
  assert.equal(limited.isError, true);
  assert.match(limited.content[0].text, /Too many/);

  assert.equal((await post('x'.repeat(70_000))).status, 413);
});

test('versions that are not compared get no "cheapest", and odd ids are refused', async t => {
  const unclear = { query: 'dji mini 4 pro', groups: [{ label: '', comparable: false, offers: [
    { shop: 'a.bd', url: 'https://a.bd/props', title: 'Dji Mini 4 pro Propellers', price: 2500, inStock: true, checkedAt: '2026-11-27T00:00:00.000Z' },
    { shop: 'b.bd', url: 'https://b.bd/drone', title: 'DJI Mini 4 Pro with DJI RC-N2', price: 89990, inStock: true, checkedAt: '2026-11-27T00:00:00.000Z' }
  ] }] };
  const text = describeAnswer(unclear, 'https://daamkhoj.test');
  assert.doesNotMatch(text, /Cheapest available/, 'a ৳2,500 listing of another version is not the cheapest drone');
  assert.match(text, /not compared/);

  const { post, close } = await serve({ searchIndex: async () => answer });
  t.after(close);
  assert.equal((await post({ jsonrpc: '2.0', id: { a: 1 }, method: 'ping' })).body.error.code, -32600, 'an id is a string, a number or null');
  assert.equal((await post({ jsonrpc: '2.0', id: 'x', method: 'ping' })).body.result !== undefined, true);
});
