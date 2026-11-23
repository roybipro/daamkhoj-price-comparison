/* node tools/merge-lists.mjs --into=data/price-index.json --from=<another copy of the list>

   Lays over the list in --into every shop that --from crawled more recently (or that --into
   lacks), and saves it. The nightly crawl uses it to save on top of whatever reached main while
   it ran; it also publishes a crawl run elsewhere, one shop or several. */

import { parseArgs } from 'node:util';
import { mergeLists } from '../server/merge-lists.mjs';
import { loadIndexFile, saveIndexFile } from '../server/price-index.mjs';

const { values } = parseArgs({ options: { into: { type: 'string' }, from: { type: 'string' } } });
if (!values.into || !values.from) {
  console.error('usage: node tools/merge-lists.mjs --into=<list file> --from=<list file>');
  process.exit(1);
}

const { list, taken } = mergeLists(await loadIndexFile(values.into), await loadIndexFile(values.from));
await saveIndexFile(values.into, list);
const count = shop => list.shops[shop]?.entries?.length ?? 0;
console.log(taken.length
  ? `from ${values.from}: ${taken.map(shop => `${shop} (${count(shop)})`).join(', ')}`
  : `nothing in ${values.from} is newer than ${values.into}`);
