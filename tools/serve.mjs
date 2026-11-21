import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApi, createDefaultLiveSearch, startWarming } from '../server/api.mjs';
import { watchIndexFile } from '../server/price-index.mjs';

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
const searchIndex = watchIndexFile(process.env.PRICE_INDEX_FILE || path.join(root, 'data', 'price-index.json'), { log: console.log });
const api = createApi({ liveSearch, searchIndex });

/* PRICE_INDEX_REFRESH_HOURS runs the crawl from here, in its own process so a long crawl never
   slows the site: on start if the list is missing or older than that, then on that schedule.
   Off unless set, because every crawl reads thousands of shop pages. */
const refreshHours = Number(process.env.PRICE_INDEX_REFRESH_HOURS);
if (refreshHours > 0) {
  const indexFile = process.env.PRICE_INDEX_FILE || path.join(root, 'data', 'price-index.json');
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
  if (url.pathname === '/api/search' || url.pathname === '/api/search/quick') return api(req, res, url);

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
