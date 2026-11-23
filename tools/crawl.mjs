/* npm run crawl [-- --shop=dazzle.com.bd,istockbd.com] [--limit=200] [--delay=1000]

   Refreshes the price list from each shop's sitemap. Shops run side by side, each one page at a
   time with a pause between pages, so no shop sees more than about one request a second.
   Progress is saved as it goes, so an interrupted run keeps what it read. */

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { crawlShop } from '../server/crawler.mjs';
import { INDEX_SHOPS } from '../server/index-shops.mjs';
import { loadIndexFile, saveIndexFile } from '../server/price-index.mjs';
import { createRobots } from '../server/robots.mjs';
import { fetchPublic } from '../server/safe-fetch.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({
  options: {
    shop: { type: 'string' },
    limit: { type: 'string' },
    delay: { type: 'string', default: '1000' },
    file: { type: 'string', default: process.env.PRICE_INDEX_FILE || path.join(root, 'data', 'price-index.json') }
  }
});

const wanted = values.shop ? new Set(values.shop.split(',').map(name => name.trim())) : null;
const shops = INDEX_SHOPS.filter(shop => !wanted || wanted.has(shop.shop));
if (wanted && shops.length !== wanted.size) {
  console.error(`unknown shop; choose from ${INDEX_SHOPS.map(shop => shop.shop).join(', ')}`);
  process.exit(1);
}
const limit = values.limit ? Number(values.limit) : Infinity;
const delayMs = Number(values.delay);
if (!(limit > 0) || !(delayMs >= 0)) {
  console.error('--limit must be a positive number and --delay a number of milliseconds');
  process.exit(1);
}

const fetchPage = url => fetchPublic(url);
/* A big shop's product sitemap is several megabytes, well past the page limit. */
const fetchSitemap = url => fetchPublic(url, { maxBytes: 50_000_000, timeoutMs: 60_000 });
const robots = createRobots(fetchPage);

await mkdir(path.dirname(values.file), { recursive: true });
const data = await loadIndexFile(values.file);

/* Shops finish at different times, so saves are queued: one write at a time, latest data. */
let saving = Promise.resolve();
const save = () => (saving = saving.then(() => saveIndexFile(values.file, data))
  .catch(error => console.error(`save failed: ${error.message}`)));

const started = Date.now();
const results = await Promise.allSettled(shops.map(async shop => {
  const previous = data.shops[shop.shop]?.entries ?? [];
  const checked = data.shops[shop.shop]?.checked ?? {};
  const record = (entries, stats, checkedPages) => {
    data.shops[shop.shop] = {
      crawledAt: new Date().toISOString(),
      stats,
      entries,
      ...(Object.keys(checkedPages ?? {}).length ? { checked: checkedPages } : {})
    };
    return save();
  };
  const { entries, stats, checked: checkedPages } = await crawlShop(shop, {
    fetchPage, fetchSitemap, robots, previous, checked, limit, delayMs, log: console.log, onProgress: record
  });
  await record(entries, stats, checkedPages);
  console.log(`${shop.shop}: ${stats.priced} of ${stats.read} pages priced (${stats.listed} listed), ${entries.length} prices kept`);
}));
await saving;

const failed = results.filter(result => result.status === 'rejected');
for (const failure of failed) console.error(`failed: ${failure.reason.message}`);
console.log(`done in ${Math.round((Date.now() - started) / 1000)}s → ${path.relative(root, values.file)}`);
process.exit(failed.length ? 1 : 0);
