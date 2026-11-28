import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApi } from '../server/api.mjs';
import {
  addList, createHistoryStore, dhakaDay, historyUrlFrom, prune, pullHistoryFile, readHistoryFile, summarize, writeHistoryFile
} from '../server/price-history.mjs';

const list = (...entries) => ({ version: 1, shops: { 'a.bd': { entries: entries.map(entry => ({ shop: 'a.bd', ...entry })) } } });
const A = 'https://a.bd/phone';
const B = 'https://a.bd/phone-2';

test('dhakaDay uses the Bangladesh date', () => {
  assert.equal(dhakaDay('2026-11-27T19:00:00Z'), '2026-11-28');
  assert.equal(dhakaDay('2026-11-27T17:59:00Z'), '2026-11-27');
  assert.equal(dhakaDay('not a time'), null);
});

test('addList keeps only the days a price changed, and the last day read', () => {
  const pages = new Map();
  addList(pages, list({ url: A, price: 1000, inStock: true, checkedAt: '2026-11-20T04:00:00Z' }));
  addList(pages, list({ url: A, price: 1000, inStock: true, checkedAt: '2026-11-21T04:00:00Z' }));
  addList(pages, list({ url: A, price: 900, inStock: true, checkedAt: '2026-11-23T04:00:00Z' }));
  /* Read again the same day: the later reading wins, and undoing the day's change removes it. */
  addList(pages, list({ url: A, price: 1000, inStock: true, checkedAt: '2026-11-23T10:00:00Z' }));
  addList(pages, list({ url: A, price: 1000, inStock: false, checkedAt: '2026-11-25T04:00:00Z' }));
  /* An older copy of the list never moves a page back. */
  addList(pages, list({ url: A, price: 500, inStock: true, checkedAt: '2026-11-22T04:00:00Z' }));
  /* No price, no url: skipped. */
  addList(pages, list({ url: B, price: 0, checkedAt: '2026-11-25T04:00:00Z' }, { price: 10, checkedAt: '2026-11-25T04:00:00Z' }));
  assert.deepEqual(pages.get(A), { last: '2026-11-25', points: [['2026-11-20', 1000], ['2026-11-25', null]] });
  assert.equal(pages.size, 1);
});

test('prune drops pages not read for keepDays and moves older points to the cut-off', () => {
  const pages = new Map([
    [A, { last: '2026-11-25', points: [['2026-01-01', 800], ['2026-03-01', 900], ['2026-11-01', 950]] }],
    [B, { last: '2026-02-01', points: [['2026-02-01', 100]] }]
  ]);
  prune(pages, '2026-11-28', 180);
  assert.deepEqual(pages.get(A).points, [['2026-06-01', 900], ['2026-11-01', 950]]);
  assert.equal(pages.has(B), false);
});

test('summarize gives the lowest buyable price each day across pages', () => {
  const summary = summarize([
    { last: '2026-11-24', points: [['2026-11-20', 1000], ['2026-11-22', null]] },
    { last: '2026-11-23', points: [['2026-11-21', 1100], ['2026-11-23', 950]] }
  ]);
  assert.deepEqual(summary.days, [
    ['2026-11-20', 1000], ['2026-11-21', 1000], ['2026-11-22', 1100], ['2026-11-23', 950], ['2026-11-24', null]
  ]);
  assert.deepEqual(summary.lowest, { price: 950, day: '2026-11-23' });
  assert.deepEqual(summary.highest, { price: 1100, day: '2026-11-22' });
  assert.equal(summary.since, '2026-11-20');
  assert.equal(summary.current, null);
  assert.deepEqual(summarize([]), { days: [] });
});

test('the history file round-trips, and the store and /api/history answer from it', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'history-test-'));
  try {
    const file = path.join(dir, 'price-history.ndjson');
    const pages = new Map([[A, { last: '2026-11-22', points: [['2026-11-20', 1000], ['2026-11-22', 900]] }]]);
    await writeHistoryFile(file, pages);
    assert.deepEqual((await readHistoryFile(file)).pages, pages);

    const store = createHistoryStore(file, { watch: false });
    await store.reload();
    const found = await store.lookup([A, 'https://a.bd/unknown']);
    assert.deepEqual(found.days, [['2026-11-20', 1000], ['2026-11-21', 1000], ['2026-11-22', 900]]);

    const api = createApi({ liveSearch: null, priceHistory: store, log: () => {} });
    const call = async query => {
      let status;
      let body = '';
      await api({ method: 'GET', headers: {}, socket: {} }, { writeHead: code => { status = code; }, end: text => { body = text; } }, new URL(`http://x/api/history?${query}`));
      return { status, body: JSON.parse(body) };
    };
    assert.equal((await call(`url=${encodeURIComponent(A)}`)).body.lowest.price, 900);
    assert.equal((await call('')).status, 400);
    assert.equal((await call('url=javascript:alert(1)')).status, 400);
    assert.equal((await call(Array.from({ length: 41 }, (_, i) => `url=https://a.bd/${i}`).join('&'))).status, 400);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('pullHistoryFile only replaces the file with a newer history', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'history-pull-'));
  try {
    const file = path.join(dir, 'price-history.ndjson');
    await writeFile(file, '{"version":1,"updatedAt":"2026-11-28T00:00:00.000Z"}\n');
    const serve = text => async () => new Response(text, { status: 200 });
    assert.equal(await pullHistoryFile('https://x/h', file, { fetchImpl: serve('{"version":1,"updatedAt":"2026-11-27T00:00:00.000Z"}\n') }), false);
    await assert.rejects(pullHistoryFile('https://x/h', file, { fetchImpl: serve('<html>not found</html>\n') }));
    assert.equal(await pullHistoryFile('https://x/h', file, { fetchImpl: serve(`{"version":1,"updatedAt":"2026-11-29T00:00:00.000Z"}\n["${A}","2026-11-29",[["2026-11-29",5]]]\n`) }), true);
    assert.equal((await readHistoryFile(file)).pages.get(A).last, '2026-11-29');
    assert.equal(await pullHistoryFile('https://x/h', file, { fetchImpl: async () => new Response('', { status: 404 }) }), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('historyUrlFrom sits beside the published price list', () => {
  assert.equal(historyUrlFrom({ PRICE_INDEX_URL: 'https://raw.example/main/data/price-index.json' }), 'https://raw.example/main/data/price-history.ndjson');
  assert.equal(historyUrlFrom({ PRICE_HISTORY_URL: 'https://h', PRICE_INDEX_URL: 'https://x/price-index.json' }), 'https://h');
  assert.equal(historyUrlFrom({}), null);
});
