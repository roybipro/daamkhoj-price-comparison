/* Search provider: turns a query into web results via Bright Data's SERP API. It is the only
   module that knows this vendor, so replacing it means replacing this file. Any provider has
   to return [{ title, link, description }].

   Bing is the default because its results link straight to shop pages. Most Google results
   link through google.com/goto, and Google throttles a server following those after about
   three, so most shop pages never get opened.

   Bing is unreliable on any one wording: "iPhone 15 price in bangladesh" returned Apple and
   Walmart while "iPhone 15 bangladesh" found shops, and "galaxy a16" went the opposite way.
   So every search runs each wording at once and merges them, which costs one paid request
   per wording but no extra waiting beyond the slower answer. */

const ENDPOINT = 'https://api.brightdata.com/request';
/* Bing through this provider took 37 to 86 seconds in testing, whatever the settings. */
const TIMEOUT_MS = 100_000;

const ENGINES = {
  bing: {
    origin: 'https://www.bing.com/search',
    wordings: [query => `${query} price in bangladesh`, query => `${query} bangladesh`],
    /* strict is not optional: without it, a grocery search came back full of adult sites. */
    params: { cc: 'bd', setLang: 'en-US', safesearch: 'strict', brd_json: '1' }
  },
  google: {
    origin: 'https://www.google.com/search',
    wordings: [query => `${query} price`],
    params: { gl: 'bd', hl: 'en', brd_json: '1' }
  }
};

export function createBrightDataSearch({ apiKey, zone, engine = 'bing', fetchImpl = fetch, timeoutMs = TIMEOUT_MS }) {
  const setup = ENGINES[engine];
  if (!setup) throw new Error(`unknown search engine "${engine}"`);

  async function request(words, signal) {
    const target = new URL(setup.origin);
    target.search = new URLSearchParams({ q: words, ...setup.params }).toString();

    const response = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      /* Searching from Bangladesh matters: from elsewhere, results were often foreign shops. */
      body: JSON.stringify({ zone, url: target.href, format: 'raw', country: 'bd' }),
      signal
    });
    if (!response.ok) throw new Error(`search provider answered ${response.status}`);
    return response.text();
  }

  async function searchWords(words) {
    /* Empty answers do come back with a 200, so one retry is worth its cost. It shares the first
       request's time limit: a fresh one would let a search outlast the browser's wait. */
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(
      new DOMException('The operation was aborted due to timeout', 'TimeoutError')
    ), timeoutMs);
    let text;
    try {
      const signal = controller.signal;
      text = (await request(words, signal)) || (await request(words, signal));
    } finally {
      clearTimeout(timeout);
    }
    if (!text) throw new Error('search provider returned nothing');

    const organic = JSON.parse(text).organic;
    return (Array.isArray(organic) ? organic : []).map(result => ({
      title: String(result.title ?? ''),
      link: String(result.link ?? ''),
      description: String(result.description ?? '')
    }));
  }

  async function search(query) {
    const answers = await Promise.allSettled(setup.wordings.map(wording => searchWords(wording(query))));
    const lists = answers.filter(answer => answer.status === 'fulfilled').map(answer => answer.value);
    /* One wording failing is fine; all of them failing is an outage. */
    if (!lists.length) throw answers[0].reason;

    /* Taking turns keeps a poor answer from pushing a good one out of the pages we open. */
    const merged = new Map();
    for (let rank = 0; rank < Math.max(...lists.map(list => list.length)); rank++) {
      for (const list of lists) {
        const result = list[rank];
        if (result && !merged.has(result.link)) merged.set(result.link, result);
      }
    }
    return [...merged.values()];
  }

  /* The daily limit counts paid requests, so it needs to know what one search costs. */
  search.requests = setup.wordings.length;
  return search;
}
