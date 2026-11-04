/* Regression tests for the scoring, search and rendering rules. They run against the built
   modules in dist/, the same code the browser loads: `npm test` builds first. */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { get } from 'node:http';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { buildCatalog, byBestValue } from '../dist/js/core/catalog.js';
import { createSearch } from '../dist/js/core/search.js';
import { scoreTrust, UNDER_MARKET_RULE } from '../dist/js/core/trust.js';
import { STORES } from '../dist/js/data/stores.js';
import { TRUST_WEIGHTS } from '../dist/js/data/meta.js';
import { offerRow } from '../dist/js/ui/fragments.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = buildCatalog();
const live = catalog.offers.filter(offer => !offer.suppressed);
const search = createSearch(catalog);

const publishedBand = score => (score >= 82 ? 'Trusted' : score >= 68 ? 'Good' : score >= 50 ? 'Caution' : 'Risky');

test('the tier label always matches the band published for the displayed score', () => {
  for (const offer of live) assert.equal(offer.trust.tier.label, publishedBand(offer.trust.score), offer.id);
});

test('the 12-week series ends on the all-in price the market line is measured in', () => {
  for (const offer of live) assert.equal(offer.history.at(-1), offer.landed, offer.id);
});

test('listing ids do not depend on row order and are unique', () => {
  const ids = catalog.offers.map(offer => offer.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const offer of catalog.offers) assert.equal(offer.id, `${offer.productId}--${offer.storeId}`);
});

test('the sample data demonstrates the under-market warning', () => {
  const flagged = live.filter(offer => offer.savedVsMarket > UNDER_MARKET_RULE);
  assert.ok(flagged.length > 0);
  for (const offer of flagged) assert.ok(offer.trust.flags.some(flag => flag.includes('under the market')), offer.id);
});

test('best value never ranks a Caution listing above a Good one', () => {
  for (const [productId, offers] of catalog.byProduct) {
    const ranked = offers.filter(offer => !offer.suppressed).sort(byBestValue);
    const top = Math.max(...ranked.map(offer => offer.trust.score));
    if (top >= 68) assert.ok(ranked[0].trust.score >= 68, productId);
  }
});

test('a seller cannot raise its authenticity score through its own name', () => {
  const daraz = STORES.find(store => store.id === 'daraz');
  const score = seller => scoreTrust(daraz, { price: 100, seller, eta: 3, ship: 0, sellerRating: 4, sellerReviews: 500 }, 100, TRUST_WEIGHTS)
    .signals.authenticity.v;
  assert.equal(score('Official Authorized Partner Store'), score('Rahim Traders'));
});

test('search tolerates typos and searches specs without inventing matches', () => {
  const hits = query => search.products(query).map(hit => hit.product.id);
  assert.deepEqual(hits('iphnoe'), ['iphone-15']);
  assert.deepEqual(hits('ifone'), ['iphone-15']);
  assert.ok(hits('laptop 16gb').includes('ideapad-slim-3'));
  for (const unknown of ['nokia', 'asus', 'iphone 16', 'xyzzy']) assert.deepEqual(hits(unknown), [], unknown);
});

test('a closed shop cannot be shortlisted or linked to', () => {
  const closed = catalog.offers.find(offer => offer.suppressed);
  const html = offerRow(closed, { weights: TRUST_WEIGHTS });
  assert.ok(!html.includes('data-act="compare"'));
  assert.ok(!html.includes(closed.store.url + '"'));
  assert.ok(!html.includes('<a '));
});

test('nothing shipped calls the median an average or implies live prices', async () => {
  const files = [path.join(root, 'dist/index.html')];
  for (const dir of ['core', 'ui', 'data']) {
    for (const name of await readdir(path.join(root, 'dist/js', dir))) files.push(path.join(root, 'dist/js', dir, name));
  }
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    for (const banned of ['market average', 'Market average', 'over average', "Today's best deals", 'right now', 'Trade licence']) {
      assert.ok(!text.includes(banned), `${path.basename(file)} still says "${banned}"`);
    }
  }
});

test('a malformed URL gets a 400 and leaves the dev server running', async () => {
  const port = 5198;
  const server = spawn(process.execPath, ['tools/serve.mjs'], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'ignore'] });
  try {
    await new Promise(resolve => server.stdout.once('data', resolve));
    const status = url => new Promise((resolve, reject) => {
      get(`http://127.0.0.1:${port}${url}`, res => { res.resume(); resolve(res.statusCode); }).on('error', reject);
    });
    assert.equal(await status('/%E0'), 400);
    assert.equal(await status('/'), 200);
  } finally {
    server.kill();
  }
});
