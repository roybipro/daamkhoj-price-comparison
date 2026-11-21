/* GET /api/search/quick?q=… answers from the saved price list at once, with no paid request.
   GET /api/search?q=… runs the paid web search and adds the price list's answer to it.
   Credentials come from the environment and stay on the server; nothing here returns or logs them. */

import { createBrightDataSearch } from './providers/bright-data.mjs';
import { createLiveSearch, LiveSearchError, mergeGroups } from './live-search.mjs';
import { createRobots } from './robots.mjs';
import { fetchPublic, resolveResultLink } from './safe-fetch.mjs';

const STATUS = { query: 400, rate: 429, budget: 429 };

export function createRateLimiter({ limit = 20, windowMs = 60_000, now = Date.now, maxClients = 10_000 } = {}) {
  const clients = new Map();
  return client => {
    const time = now();
    let entry = clients.get(client);
    if (!entry || time - entry.start >= windowMs) {
      if (clients.size >= maxClients) clients.clear();
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
  liveSearch, searchIndex = null, allowClient = createRateLimiter(), allowQuick = createRateLimiter({ limit: 60 }), log = console.error
}) {
  const failed = (res, error, what) => {
    if (error instanceof LiveSearchError) return send(res, STATUS[error.code] ?? 400, { error: error.message });
    log(`${what} failed: ${error.message}`);
    return send(res, 502, { error: 'Live search could not finish. Please try again.' });
  };

  async function quick(req, res, url) {
    if (!searchIndex) return send(res, 503, { error: 'The price list is not set up on this server' });
    /* Free to answer, so a looser limit: it only stops a client hammering the server. */
    if (!allowQuick(req.socket.remoteAddress ?? 'unknown')) {
      return send(res, STATUS.rate, { error: 'Too many searches. Please wait a minute and try again.' });
    }
    try {
      return send(res, 200, await searchIndex(url.searchParams.get('q')));
    } catch (error) {
      return failed(res, error, 'price list search');
    }
  }

  return async function handle(req, res, url) {
    if (req.method !== 'GET') return send(res, 405, { error: 'Use GET' });
    if (url.pathname.endsWith('/quick')) return quick(req, res, url);
    if (!liveSearch) return send(res, 503, { error: 'Live search is not set up on this server' });
    if (!allowClient(req.socket.remoteAddress ?? 'unknown')) {
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
