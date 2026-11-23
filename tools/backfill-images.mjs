/* npm run backfill-images [-- --delay=1000]

   Fetches product photos for the pages behind the home page's shelves, so a price list crawled
   before photos were saved shows them now instead of after the next few nightly runs. Only the
   cheapest page per shop for each shelved product is read, one page a second per shop, and only
   where robots.txt allows. Pages that already have a photo are skipped. */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { INDEX_SHOPS } from '../server/index-shops.mjs';
import { absoluteImage, readImage } from '../server/page-price.mjs';
import { createPriceIndex, loadIndexFile, saveIndexFile } from '../server/price-index.mjs';
import { createRobots } from '../server/robots.mjs';
import { fetchPublic } from '../server/safe-fetch.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({
  options: {
    delay: { type: 'string', default: '1000' },
    file: { type: 'string', default: process.env.PRICE_INDEX_FILE || path.join(root, 'data', 'price-index.json') }
  }
});
const delayMs = Number(values.delay);
const pause = ms => new Promise(done => setTimeout(done, ms));

const data = await loadIndexFile(values.file);
const index = createPriceIndex(data, { maxOffers: 400 });
const pageOf = url => url.replace(/\?variant=\d+$/, '');

/* The entries for each page, so one photo reaches every version listed from it. */
const byPage = new Map();
for (const { entries = [] } of Object.values(data.shops)) {
  for (const entry of entries) byPage.set(pageOf(entry.url), [...(byPage.get(pageOf(entry.url)) ?? []), entry]);
}

const wanted = new Map();
for (const query of index.browse().shelves.flatMap(shelf => shelf.cards.map(card => card.name))) {
  const offers = index.search(query).groups.flatMap(group => group.offers);
  for (const shop of new Set(offers.map(offer => offer.shop))) {
    const cheapest = offers.filter(offer => offer.shop === shop).sort((a, b) => a.price - b.price)[0];
    const page = pageOf(cheapest.url);
    if (!byPage.get(page)?.some(entry => entry.image)) wanted.set(page, shop);
  }
}
console.log(`${wanted.size} pages need a photo`);

const robots = createRobots(url => fetchPublic(url));
const kindOf = Object.fromEntries(INDEX_SHOPS.map(shop => [shop.shop, shop.kind]));
let found = 0;
await Promise.all([...new Set(wanted.values())].map(async shop => {
  const pages = [...wanted].filter(([, owner]) => owner === shop).map(([page]) => page);
  for (const [i, page] of pages.entries()) {
    if (i) await pause(delayMs);
    const target = kindOf[shop] === 'shopify' ? `${page.replace(/\/+$/, '')}.js` : page;
    try {
      if (!(await robots.allows(target))) continue;
      const response = await fetchPublic(target);
      if (!response.ok) continue;
      let raw = '';
      if (kindOf[shop] === 'shopify') {
        const product = JSON.parse(response.text);
        raw = String(product.featured_image ?? product.images?.[0] ?? '');
      } else {
        raw = readImage(response.text);
      }
      const image = absoluteImage(raw, page);
      if (!image) continue;
      for (const entry of byPage.get(page) ?? []) entry.image = image;
      found++;
    } catch {
      /* One page failing leaves the rest to try. */
    }
  }
  console.log(`${shop}: done`);
}));

await saveIndexFile(values.file, data);
console.log(`photos found for ${found} of ${wanted.size} pages → ${path.relative(root, values.file)}`);
