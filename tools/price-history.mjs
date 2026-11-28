/* node tools/price-history.mjs --add=data/price-index.json [--history=data/price-history.ndjson]
   node tools/price-history.mjs --from-git            (rebuild from every list committed to git)

   Adds a price list's readings to the price history (server/price-history.mjs), dropping what is
   over 180 days old, and saves it. The nightly crawl runs --add after it saves each new list. */

import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { addList, dhakaDay, prune, readHistoryFile, writeHistoryFile } from '../server/price-history.mjs';
import { loadIndexFile } from '../server/price-index.mjs';

const { values } = parseArgs({
  options: {
    add: { type: 'string', multiple: true },
    'from-git': { type: 'boolean' },
    history: { type: 'string', default: 'data/price-history.ndjson' },
    list: { type: 'string', default: 'data/price-index.json' }
  }
});
if (!values.add?.length && !values['from-git']) {
  console.error('usage: node tools/price-history.mjs --add=<list file> | --from-git');
  process.exit(1);
}

let pages;
if (values['from-git']) {
  /* Oldest first, each committed copy of the list. */
  pages = new Map();
  const commits = execFileSync('git', ['log', '--reverse', '--format=%H', '--', values.list], { encoding: 'utf8' }).split('\n').filter(Boolean);
  const dir = await mkdtemp(path.join(tmpdir(), 'daamkhoj-lists-'));
  try {
    for (const [at, commit] of commits.entries()) {
      const file = path.join(dir, 'list.json');
      await writeFile(file, execFileSync('git', ['show', `${commit}:${values.list}`], { maxBuffer: 500_000_000 }));
      const added = addList(pages, await loadIndexFile(file));
      console.log(`${at + 1}/${commits.length} ${commit.slice(0, 7)}: ${added} new pages, ${pages.size} in all`);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
} else {
  ({ pages } = await readHistoryFile(values.history));
}
for (const file of values.add ?? []) {
  const added = addList(pages, await loadIndexFile(file));
  console.log(`${file}: ${added} new pages, ${pages.size} in all`);
}
prune(pages, dhakaDay(Date.now()));
await writeHistoryFile(values.history, pages);
const changed = [...pages.values()].filter(page => page.points.length > 1).length;
console.log(`saved ${values.history}: ${pages.size} pages, ${changed} with a price change`);
