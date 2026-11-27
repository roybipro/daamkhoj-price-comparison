# Architecture

DaamKhoj has three parts: a browser app with no framework, a Node server with no framework, and a
crawler that builds the price list ahead of time. They share one repository and almost no
dependencies: TypeScript is the only package, and it is only used to build.

```
                       ┌──────────────────────── GitHub ────────────────────────┐
                       │  refresh-prices.yml (02:30 + 16:30 BD)                 │
                       │    npm run crawl → data/price-index.json → commit      │
                       │  ci.yml: check + test → Render deploy hook             │
                       │  uptime.yml: GET /api/health every 30 min              │
                       └───────────────┬────────────────────────────────────────┘
                                       │ committed JSON (raw URL, checked every hour)
┌──────────── Browser ────────────┐    ▼
│ src/ts (TypeScript → plain JS)  │  ┌──────────────── Node server (Render) ─────────────────┐
│  type  → /api/search/quick      │──▶ tools/serve.mjs   static files, robots.txt, sitemap   │
│  pause → /api/recheck           │  │ server/api.mjs    routes, rate limits, errors         │
│  Enter → /api/search            │  │ price-index.mjs   JSON → SQLite on disk → search      │
│  home  → /api/browse            │  │ recheck.mjs       re-read shop pages behind results   │
└─────────────────────────────────┘  │ freshen.mjs       re-read popular products all day    │
                                     │ live-search.mjs   paid web search (Bright Data/Bing)  │
                                     └───────────────────────────┬───────────────────────────┘
                                                                 │ robots.txt checked, ~1 req/s per shop
                                                                 ▼
                                                     30 Bangladeshi shop websites
```

## The three ways a price reaches the screen

1. **The price list (instant).** The crawler reads every product page of 30 hand-checked shops
   from their sitemaps and saves the price, stock, photo and time it was read. The server loads
   that list into a SQLite database and answers searches from it in milliseconds. See
   [search.md](search.md) and [crawler.md](crawler.md).
2. **Re-checks (seconds).** While a shopper looks at results, the server re-reads the shop pages
   behind them (`/api/recheck`), so the prices on screen are minutes old instead of a night old.
   A background freshener does the same for popular products all day.
3. **Live web search (about a minute, paid).** When a shopper presses Enter, a web search finds
   shops the crawl doesn't cover, reads each page's own price, and merges the answer with the
   list's. See [search.md](search.md#live-web-search).

Only prices read from a shop's own page, for the product asked about, ever reach a customer.

## Source layout

```
src/                       the browser app (see frontend.md)
├── index.html             shell: header, search box, tabs (Prices, Shops, How it works), footer
├── styles/                tokens → base → components → layout (cascade order matters)
└── ts/
    ├── app.ts             entry: state, event wiring, the search flow, render loop
    ├── types.ts           the domain model
    ├── core/              pure logic, no DOM
    │   ├── live.ts        calls the API, merges re-checked prices into what is shown
    │   ├── urlstate.ts    state ⇄ query string, so every search is a shareable link
    │   ├── theme.ts       light/dark
    │   └── …              format, links, search (offline fallback), trend, catalog
    ├── data/              shop logos, search URL patterns, and the old sample catalogue
    └── ui/                HTML string rendering: views, live results, home shelves

server/                    everything the Node server runs
├── api.mjs                /api/* routes, rate limits, the health check
├── price-index.mjs        loads the saved list, the SQLite search over it, reloads
├── matching.mjs           is a page this product, and which version? spelling correction
├── bangla.mjs             Bangla and Banglish queries → the shops' English
├── browse.mjs             home page shelves: product names, categories, cards
├── live-search.mjs        the two-step web search, its cache and daily limit
├── providers/bright-data.mjs  the search vendor, in one replaceable file
├── recheck.mjs            re-reads the shop pages behind a search's results
├── freshen.mjs            re-reads popular products' pages through the day
├── crawler.mjs            crawls one shop from its sitemap
├── index-shops.mjs        the 33 shops the list is built from, checked by hand
├── sitemap.mjs            product pages from a shop's sitemap
├── page-price.mjs         reads one clear taka price, stock and photo from a page
├── robots.mjs             robots.txt rules
├── safe-fetch.mjs         page fetches that can't reach private networks, size-limited
├── merge-lists.mjs        lays one copy of the list over another, shop by shop
└── seo.mjs                robots.txt, sitemap.xml, per-page titles and structured data

tools/                     command-line entry points
├── serve.mjs              the server: static files + API + background jobs (npm start)
├── build.mjs              clean → tsc → copy static files
├── check.mjs              integrity gate on the built site
├── crawl.mjs              npm run crawl
├── crawl-report.mjs       per-shop table for a crawl run's summary
├── merge-lists.mjs        publish a crawl run elsewhere into data/price-index.json
├── backfill-images.mjs    photos for home page cards
└── fetch-logos.mjs        shop logos into src/assets/shops/

tests/                     node --test, no network calls
├── core.test.mjs          browser logic: search, formatting, rendering rules
├── live.test.mjs          web search, matching, safe fetching, rate limits
└── index.test.mjs         crawler, price list, SQLite search, shelves, API
```

## Principles

- **No invented data beside real shop names.** The sample trust scores, prices and the Side by
  side tab were removed before the site was opened to search engines (PR #49). If the price list
  can't be reached, the page says so.
- **Polite to shops.** `robots.txt` is checked before every page, each shop gets about one request
  a second, and a page read in the last half hour isn't read again.
- **Small host first.** The server runs on Render's free plan (512 MB, heap ~252 MB). Long jobs
  (loading the list, building shelves) run a few milliseconds at a time so the site never
  freezes, and the list lives on disk, not in memory.
- **Fail soft.** A shop page that fails keeps its last price; a broken price list never sinks the
  web search; a damaged list file is skipped and the last good one keeps serving.
