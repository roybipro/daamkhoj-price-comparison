/* Search provider: turns a query into web results via Bright Data's SERP API. It is the only
   module that knows this vendor, so replacing it means replacing this file. Any provider has
   to return [{ title, link, description }].

   Bing is the default because its results link straight to shop pages. Most Google results
   link through google.com/goto, and Google throttles a server following those after about
   three, so most shop pages never get opened. */

const ENDPOINT = 'https://api.brightdata.com/request';
/* Bing through this provider took 37 to 86 seconds in testing, whatever the settings. */
const TIMEOUT_MS = 100_000;

const ENGINES = {
  bing: query => ({
    origin: 'https://www.bing.com/search',
    /* strict is not optional: without it, a grocery search came back full of adult sites. */
    params: { q: `${query} price in bangladesh`, cc: 'bd', setLang: 'en-US', safesearch: 'strict', brd_json: '1' }
  }),
  google: query => ({
    origin: 'https://www.google.com/search',
    params: { q: `${query} price`, gl: 'bd', hl: 'en', brd_json: '1' }
  })
};

export function createBrightDataSearch({ apiKey, zone, engine = 'bing', fetchImpl = fetch }) {
  const build = ENGINES[engine];
  if (!build) throw new Error(`unknown search engine "${engine}"`);

  async function request(query) {
    const { origin, params } = build(query);
    const target = new URL(origin);
    target.search = new URLSearchParams(params).toString();

    const response = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ zone, url: target.href, format: 'raw' }),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (!response.ok) throw new Error(`search provider answered ${response.status}`);
    return response.text();
  }

  return async function search(query) {
    /* Empty answers do come back with a 200, so one retry is worth its cost. */
    const text = (await request(query)) || (await request(query));
    if (!text) throw new Error('search provider returned nothing');

    const organic = JSON.parse(text).organic;
    return (Array.isArray(organic) ? organic : []).map(result => ({
      title: String(result.title ?? ''),
      link: String(result.link ?? ''),
      description: String(result.description ?? '')
    }));
  };
}
