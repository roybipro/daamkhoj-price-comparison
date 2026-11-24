import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApi, createDefaultLiveSearch, startWarming } from '../server/api.mjs';
import { createRechecker } from '../server/recheck.mjs';
import { createRobots } from '../server/robots.mjs';
import { fetchPublic } from '../server/safe-fetch.mjs';
import { pullIndexFile, watchIndexFile } from '../server/price-index.mjs';
import { pageMeta, robotsTxt, sitemapXml, withMeta } from '../server/seo.mjs';
import { createFreshener } from '../server/freshen.mjs';

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
void searchIndex.browse().catch(() => {});

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
/* Between nightly crawls, the pages behind the home page's products are re-read in the
   background: two products a minute by default (FRESHEN_EVERY_SECONDS; 0 turns it off). */
const freshenEvery = Number(process.env.FRESHEN_EVERY_SECONDS ?? 60);
if (freshenEvery > 0) {
  createFreshener({ recheck: rechecker, getIndex: () => searchIndex.index(), log: console.log }).start(freshenEvery * 1000);
}
/* CLIENT_IP_HEADER names the header the host's proxy fills with the visitor's real address
   (cf-connecting-ip on Render, which sits behind Cloudflare), so each visitor gets their own
   rate limit and a made-up X-Forwarded-For buys nothing. Unset, the connection's address is used. */
const api = createApi({ liveSearch, searchIndex, recheck, clientHeader: process.env.CLIENT_IP_HEADER });

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
  /* Every type `npm run fetch-logos` can save a shop's logo as. */
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon'
};

/* SITE_URL is the address search engines are given for every page (canonical links, sitemap). */
const siteUrl = (process.env.SITE_URL || 'https://daamkhoj.onrender.com').replace(/\/+$/, '');
/* A page's head is filled from the price list, but never makes a visitor wait: a lookup slower
   than this gets the plain head. Answers are kept for a while, as crawlers ask for many pages. */
const META_WAIT_MS = 1500;
const metaCache = new Map();
async function headFor(url) {
  const key = `${url.searchParams.get('view') ?? ''}|${(url.searchParams.get('q') ?? '').trim().toLowerCase()}`;
  const kept = metaCache.get(key);
  if (kept && Date.now() - kept.at < 30 * 60 * 1000) return kept.meta;
  const lookup = pageMeta(url, { base: siteUrl, search: (query, options) => searchIndex(query, options) })
    .then(meta => {
      if (metaCache.size >= 2000) metaCache.delete(metaCache.keys().next().value);
      metaCache.set(key, { at: Date.now(), meta });
      return meta;
    })
    .catch(() => null);
  return Promise.race([lookup, new Promise(resolve => setTimeout(resolve, META_WAIT_MS, null))]);
}

/* ES modules need an http(s) origin, so this stands in for the static host locally. */
createServer(async (req, res) => {
  const url = new URL(req.url, `http://${host}`);
  if (url.pathname.startsWith('/api/')) return api(req, res, url);
  if (url.pathname === '/robots.txt') {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' }).end(robotsTxt(siteUrl));
    return;
  }
  if (url.pathname === '/sitemap.xml') {
    const [browse, index] = await Promise.all([searchIndex.browse().catch(() => null), searchIndex.index().catch(() => null)]);
    res.writeHead(200, { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' })
      .end(sitemapXml(siteUrl, { shelves: browse?.shelves ?? [], updatedAt: index?.updatedAt ?? null }));
    return;
  }

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

  /* The page itself gets a head that describes it: its title, description and prices. */
  if (file === path.join(dir, 'index.html')) {
    const [html, meta] = await Promise.all([readFile(file, 'utf8'), headFor(url)]);
    const body = meta ? withMeta(html, meta) : html;
    res.writeHead(200, { 'content-type': TYPES['.html'], 'cache-control': 'no-cache', 'content-length': Buffer.byteLength(body) });
    res.end(req.method === 'HEAD' ? undefined : body);
    return;
  }

  /* A browser keeps what it fetched and asks again with the file's tag; an unchanged file costs a
     tiny "not modified" answer instead of the whole file. Pages, scripts and styles are always
     checked, so a deploy never leaves a visitor with half old, half new modules; images (shop
     logos, icons) are reused for a day without asking. */
  const etag = `W/"${info.size.toString(36)}-${Math.round(info.mtimeMs).toString(36)}"`;
  const image = /^image\//.test(TYPES[path.extname(file)] ?? '');
  const headers = {
    'content-type': TYPES[path.extname(file)] || 'application/octet-stream',
    'cache-control': image ? 'public, max-age=86400' : 'no-cache',
    etag
  };
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers).end();
    return;
  }
  res.writeHead(200, { ...headers, 'content-length': info.size });
  /* A file removed after the stat above (a rebuild while serving) ends this one response, not the server. */
  createReadStream(file).on('error', () => res.destroy()).pipe(res);
}).listen(port, host, () => {
  console.log(`DaamKhoj — serving dist/ at http://${host}:${port}/ (live search ${liveSearch ? 'on' : 'off: no credentials'})`);
});
