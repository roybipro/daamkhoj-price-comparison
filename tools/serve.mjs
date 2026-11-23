import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApi, createDefaultLiveSearch, startWarming } from '../server/api.mjs';
import { createRechecker } from '../server/recheck.mjs';
import { createRobots } from '../server/robots.mjs';
import { fetchPublic } from '../server/safe-fetch.mjs';
import { pullIndexFile, watchIndexFile } from '../server/price-index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'dist');
/* Local keys live in .env; a host sets real environment variables instead. */
try {
  process.loadEnvFile(path.join(root, '.env'));
} catch {
  /* No .env: live search reports itself as unavailable and the site shows sample prices. */
}

const liveSearch = createDefaultLiveSearch(process.env);
/* The price list from `npm run crawl`; a new crawl is picked up without a restart. */
const indexFile = process.env.PRICE_INDEX_FILE || path.join(root, 'data', 'price-index.json');
/* Re-reading a page has to fit inside a shopper's wait, so its time limit is short. */
const rechecker = createRechecker({ fetchPage: url => fetchPublic(url, { timeoutMs: 8_000 }), robots: createRobots(url => fetchPublic(url)) });
const searchIndex = watchIndexFile(indexFile, {
  log: console.log,
  /* Each list that loads gets photos for its home-page cards that have none. */
  onLoad: async index => {
    const { filled, missing } = await rechecker.fillPhotos(index);
    console.log(`photos: found ${filled} for home page cards; ${missing} still have none`);
  }
});

/* PRICE_INDEX_URL pulls the list the nightly crawl publishes, on start and every
   PRICE_INDEX_PULL_HOURS (6 by default), so the site stays current without a redeploy. */
if (process.env.PRICE_INDEX_URL) {
  const pull = () => pullIndexFile(process.env.PRICE_INDEX_URL, indexFile).then(
    changed => console.log(`price list: ${changed ? 'downloaded a newer list' : 'already current'}`),
    error => console.log(`price list: download failed (${error.message}); keeping the last one`)
  );
  void pull();
  setInterval(pull, (Number(process.env.PRICE_INDEX_PULL_HOURS) || 6) * 60 * 60 * 1000).unref();
}
const recheck = async (query, options) => rechecker(await searchIndex.index(), query, options);
const api = createApi({ liveSearch, searchIndex, recheck });

/* PRICE_INDEX_REFRESH_HOURS runs the crawl from here, in its own process so a long crawl never
   slows the site: on start if the list is missing or older than that, then on that schedule.
   Off unless set, because every crawl reads thousands of shop pages. */
const refreshHours = Number(process.env.PRICE_INDEX_REFRESH_HOURS);
if (refreshHours > 0) {
  let child = null;
  const crawl = () => {
    if (child) return;
    console.log('price list: refresh started');
    child = spawn(process.execPath, [path.join(root, 'tools', 'crawl.mjs')], { stdio: 'inherit', env: process.env })
      .on('exit', code => { child = null; console.log(`price list: refresh finished (exit ${code})`); });
  };
  /* A crawl belongs to this server: stopping the server stops it too. Saved progress is kept. */
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      child?.kill();
      process.exit(0);
    });
  }
  const everyMs = refreshHours * 60 * 60 * 1000;
  const age = await stat(indexFile).then(info => Date.now() - info.mtimeMs, () => Infinity);
  if (age > everyMs) crawl();
  setInterval(crawl, everyMs).unref();
}
startWarming(liveSearch, process.env);
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 5173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

/* ES modules need an http(s) origin, so this stands in for the static host locally. */
createServer(async (req, res) => {
  const url = new URL(req.url, `http://${host}`);
  if (url.pathname.startsWith('/api/')) return api(req, res, url);

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400, { 'content-type': 'text/plain' }).end('bad request');
    return;
  }
  const target = path.resolve(dir, '.' + pathname);
  if (target !== dir && !target.startsWith(dir + path.sep)) {
    res.writeHead(403, { 'content-type': 'text/plain' }).end('forbidden');
    return;
  }

  const found = await stat(target).catch(() => null);
  const file = found?.isDirectory() ? path.join(target, 'index.html') : target;
  const info = await stat(file).catch(() => null);
  if (!info) {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
    return;
  }

  res.writeHead(200, {
    'content-type': TYPES[path.extname(file)] || 'application/octet-stream',
    'content-length': info.size,
    'cache-control': 'no-store'
  });
  createReadStream(file).pipe(res);
}).listen(port, host, () => {
  console.log(`DaamKhoj — serving dist/ at http://${host}:${port}/ (live search ${liveSearch ? 'on' : 'off: no credentials'})`);
});
