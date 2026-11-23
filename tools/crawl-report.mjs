/* node tools/crawl-report.mjs --count
     prints how many current prices the list holds (before a crawl, to compare with after).
   node tools/crawl-report.mjs --since=<ISO time the crawl started> --before=<that count>
     prints a Markdown table of every shop for the GitHub job summary, and exits 1 when the crawl
     looks broken, which fails the job so GitHub emails the repository's owner:
       - the list holds at least 30% fewer current prices than before the crawl, or
       - more than a third of the shops were not refreshed by it.
     One shop that always refuses GitHub's servers (Sumash Tech) does not set it off. */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { loadIndexFile } from '../server/price-index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({
  options: {
    count: { type: 'boolean', default: false },
    since: { type: 'string' },
    before: { type: 'string' },
    file: { type: 'string', default: path.join(root, 'data', 'price-index.json') }
  }
});

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const data = await loadIndexFile(values.file).catch(() => ({ shops: {} }));
const current = entries => entries.filter(entry => Date.now() - Date.parse(entry.checkedAt) <= MAX_AGE_MS).length;
const shops = Object.entries(data.shops ?? {}).map(([shop, record]) => ({
  shop,
  prices: current(record.entries ?? []),
  crawledAt: record.crawledAt ?? '',
  stats: record.stats ?? {}
}));
const total = shops.reduce((sum, shop) => sum + shop.prices, 0);

if (values.count) {
  console.log(total);
  process.exit(0);
}

const since = Date.parse(values.since ?? '');
const before = Number(values.before);
const refreshed = shop => Number.isFinite(since) && Date.parse(shop.crawledAt) >= since;
const stale = shops.filter(shop => !refreshed(shop));

const lines = [
  '## Price list after the crawl',
  '',
  `Current prices: **${total.toLocaleString('en')}**${Number.isFinite(before) ? ` (before: ${before.toLocaleString('en')})` : ''}`,
  '',
  '| Shop | Current prices | Refreshed by this crawl | Pages read | Priced |',
  '|---|---:|---|---:|---:|',
  ...shops.sort((a, b) => b.prices - a.prices).map(shop => refreshed(shop)
    ? `| ${shop.shop} | ${shop.prices} | yes | ${shop.stats.read ?? ''} | ${shop.stats.priced ?? ''} |`
    : `| ${shop.shop} | ${shop.prices} | **no** (last ${shop.crawledAt.slice(0, 10) || 'never'}) | | |`)
];

const problems = [];
if (Number.isFinite(before) && before > 0 && total < before * 0.7) {
  problems.push(`the list fell from ${before} to ${total} current prices`);
}
if (shops.length && stale.length > shops.length / 3) {
  problems.push(`${stale.length} of ${shops.length} shops were not refreshed: ${stale.map(shop => shop.shop).join(', ')}`);
}
if (problems.length) lines.push('', `**Something went wrong:** ${problems.join('; ')}.`);
console.log(lines.join('\n'));
process.exit(problems.length ? 1 : 0);
