/* GET /api/browse gives the home page's shelves of popular products, from the saved price list.
   GET /api/recheck?q=… re-reads the shops' pages behind a search's first results and answers again.
   GET /api/search/quick?q=… answers from the saved price list at once, with no paid request.
   GET /api/search?q=… runs the paid web search and adds the price list's answer to it.
   GET /api/health says whether the site is serving prices, and how old they are, for uptime checks.
   Credentials come from the environment and stay on the server; nothing here returns or logs them. */

import { createBrightDataSearch } from './providers/bright-data.mjs';
import { createLiveSearch, LiveSearchError, mergeGroups } from './live-search.mjs';
import { createRobots } from './robots.mjs';
import { fetchPublic, resolveResultLink } from './safe-fetch.mjs';

const STATUS = { query: 400, rate: 429, budget: 429 };

/**
 * Who is asking, for the rate limits. A visitor can send any X-Forwarded-For, and Render adds the
 * real address after it instead of replacing it, so the header's first entry proves nothing.
 * Only a header the host sets and a visitor cannot (`trustedHeader`, from CLIENT_IP_HEADER, such
 * as cf-connecting-ip behind Cloudflare) is believed. If it is missing, the last X-Forwarded-For
 * entry (added by the host's own proxy) is used. With no header named, the connection's address.
 */
export function clientAddressFrom(req, trustedHeader = '') {
  const header = String(trustedHeader ?? '').trim().toLowerCase();
  if (header) {
    const named = String(req.headers?.[header] ?? '').split(',')[0].trim();
    if (named) return named;
    const forwarded = String(req.headers?.['x-forwarded-for'] ?? '').split(',').map(entry => entry.trim()).filter(Boolean);
    if (forwarded.length) return forwarded.at(-1);
  }
  return req.socket?.remoteAddress || 'unknown';
}

export function createRateLimiter({ limit = 20, windowMs = 60_000, now = Date.now, maxClients = 10_000 } = {}) {
  const clients = new Map();
  return client => {
    const time = now();
    let entry = clients.get(client);
    if (!entry || time - entry.start >= windowMs) {
      clients.delete(client);
      if (clients.size >= maxClients) clients.delete(clients.keys().next().value);
      entry = { start: time, count: 0 };
      clients.set(client, entry);
    }
    entry.count++;
    return entry.count <= limit;
  };
}

const minutes = value => (Number(value) > 0 ? Number(value) * 60_000 : undefined);

/** Keeps LIVE_SEARCH_WARM's searches saved. Off unless set, because every refresh is paid. */
export function startWarming(liveSearch, env, log = console.log) {
  const queries = String(env.LIVE_SEARCH_WARM ?? '').split(',').map(query => query.trim()).filter(Boolean);
  if (!liveSearch || !queries.length) return;
  const everyMs = minutes(env.LIVE_SEARCH_CACHE_MINUTES) ?? 3 * 60 * 60 * 1000;
  const refresh = () => liveSearch.warm(queries, log);
  void refresh();
  /* Refresh a little before results expire, so nobody lands in the gap. */
  setInterval(refresh, everyMs * 0.9).unref();
}

export function createDefaultLiveSearch(env) {
  const apiKey = env.BRIGHTDATA_API_KEY;
  const zone = env.BRIGHTDATA_SERP_ZONE;
  if (!apiKey || !zone) return null;

  const fetchPage = url => fetchPublic(url);
  return createLiveSearch({
    search: createBrightDataSearch({ apiKey, zone, engine: env.LIVE_SEARCH_ENGINE || undefined }),
    resolveLink: resolveResultLink,
    fetchPage,
    robots: createRobots(fetchPage),
    dailyLimit: Number(env.LIVE_SEARCH_DAILY_LIMIT) || undefined,
    ttlMs: minutes(env.LIVE_SEARCH_CACHE_MINUTES)
  });
}

function send(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  });
  res.end(JSON.stringify(body));
}

/** The web search's answer with the price list's added; the web's fresher copy of a page wins. */
function combine(web, listed) {
  const groups = mergeGroups(web.groups ?? [], listed.groups ?? []);
  return { ...web, groups, indexed: listed.priced ?? 0, priced: groups.reduce((sum, group) => sum + group.offers.length, 0) };
}

export function createApi({
  liveSearch, searchIndex = null, recheck = null,
  allowClient = createRateLimiter(), allowQuick = createRateLimiter({ limit: 120 }), allowRecheck = createRateLimiter({ limit: 30 }),
  clientHeader = '', log = console.error
}) {
  /* Said once in the log, so a host can see whether its proxy really sends the named header. */
  let reported = !clientHeader;
  const clientAddress = req => {
    if (!reported) {
      reported = true;
      const sent = Boolean(req.headers?.[String(clientHeader).trim().toLowerCase()]);
      log(`rate limits: ${sent ? `visitors told apart by ${clientHeader}` : `no ${clientHeader} header; using the last X-Forwarded-For entry`}`);
    }
    return clientAddressFrom(req, clientHeader);
  };
  const failed = (res, error, what) => {
    if (error instanceof LiveSearchError) return send(res, STATUS[error.code] ?? 400, { error: error.message });
    log(`${what} failed: ${error.message}`);
    return send(res, 502, { error: 'Live search could not finish. Please try again.' });
  };

  async function quick(req, res, url) {
    if (!searchIndex) return send(res, 503, { error: 'The price list is not set up on this server' });
    /* Free to answer, so a looser limit: it only stops a client hammering the server. */
    if (!allowQuick(clientAddress(req))) {
      return send(res, STATUS.rate, { error: 'Too many searches. Please wait a minute and try again.' });
    }
    try {
      /* partial=1 while the shopper is still typing the last word. */
      /* A shopper sees the closest thing the list has rather than nothing. */
      return send(res, 200, await searchIndex(url.searchParams.get('q'), { partial: url.searchParams.get('partial') === '1', closest: true }));
    } catch (error) {
      return failed(res, error, 'price list search');
    }
  }

  /* Re-reads the shops' pages behind a search's first results, or one product's, and answers again. */
  async function recheckPrices(req, res, url) {
    if (!recheck) return send(res, 503, { error: 'Live price checks are not set up on this server' });
    if (!allowRecheck(clientAddress(req))) {
      return send(res, STATUS.rate, { error: 'Too many requests. Please wait a minute and try again.' });
    }
    try {
      return send(res, 200, await recheck(url.searchParams.get('q'), { product: url.searchParams.get('product') ?? '' }));
    } catch (error) {
      return failed(res, error, 'price re-check');
    }
  }

  async function browse(req, res) {
    if (!searchIndex?.browse) return send(res, 503, { error: 'The price list is not set up on this server' });
    if (!allowQuick(clientAddress(req))) {
      return send(res, STATUS.rate, { error: 'Too many requests. Please wait a minute and try again.' });
    }
    try {
      return send(res, 200, await searchIndex.browse());
    } catch (error) {
      return failed(res, error, 'browse');
    }
  }

  /* For an uptime check and the host's health check: 503 only when no prices are being served.
     Old prices still answer 200, with their age, so a host never restarts a working server for it. */
  async function health(req, res) {
    try {
      const index = searchIndex?.index ? await searchIndex.index() : null;
      const prices = index?.size ?? 0;
      const updatedAt = index?.updatedAt ?? null;
      const ageHours = updatedAt ? Math.round((Date.now() - Date.parse(updatedAt)) / 360_000) / 10 : null;
      return send(res, prices ? 200 : 503, {
        ok: prices > 0, prices, shops: index?.shops ?? 0, listUpdatedAt: updatedAt, listAgeHours: ageHours,
        uptimeSeconds: Math.round(process.uptime()), memoryMB: Math.round(process.memoryUsage().rss / 1e6)
      });
    } catch (error) {
      log(`health check failed: ${error.message}`);
      return send(res, 503, { ok: false });
    }
  }

  return async function handle(req, res, url) {
    if (req.method !== 'GET') return send(res, 405, { error: 'Use GET' });
    if (url.pathname === '/api/health') return health(req, res);
    if (url.pathname === '/api/browse') return browse(req, res);
    if (url.pathname === '/api/recheck') return recheckPrices(req, res, url);
    if (url.pathname === '/api/search/quick') return quick(req, res, url);
    if (url.pathname !== '/api/search') return send(res, 404, { error: 'Not found' });
    if (!liveSearch) return send(res, 503, { error: 'Live search is not set up on this server' });
    if (!allowClient(clientAddress(req))) {
      return send(res, STATUS.rate, { error: 'Too many searches. Please wait a minute and try again.' });
    }
    try {
      const query = url.searchParams.get('q');
      const web = await liveSearch.run(query);
      /* The price list is extra here: if it breaks, the web search still answers. */
      const listed = searchIndex
        ? await searchIndex(query).catch(error => { log(`price list search failed: ${error.message}`); return null; })
        : null;
      return send(res, 200, listed ? combine(web, listed) : web);
    } catch (error) {
      return failed(res, error, 'live search');
    }
  };
}
