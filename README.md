# DaamKhoj — দামখোঁজ

Price and trust comparison for Bangladeshi online shops. Search a product, see every
retailer's price side by side, and read a trust score you can actually argue with next
to each one — because the cheapest listing in Bangladesh is not always the safest.

**Search results marked Live are real prices** read from shops' own pages (see
[Live search](#live-search)). **Everything else in this repository is sample data**, labelled
as such in a banner on every page, the header, the footer and the *How it works* tab. The page
is marked `noindex` for the same reason. Shop identities are real; the numbers are placeholders until live feeds are wired in (see [Going live](#going-live)).

## Quick start

```bash
npm install       # one dev dependency: typescript
npm run dev       # build, then serve dist/ at http://127.0.0.1:5173/
npm run check     # strict typecheck, build, then catalogue and reference integrity
npm test          # build, then the regression tests in tests/
npm run build     # emit dist/ (the deployable artifact)
npm run typecheck # tsc --noEmit only
```

TypeScript is compiled, not transpiled at runtime: `src/ts/**/*.ts` → `dist/js/**/*.js` as
plain ES modules. The shipped site has **zero runtime dependencies** — no framework, no
polyfills, no bundler. Requires Node 20.12+ to build. Copy `.env.example` to `.env` to turn on
live search; without it the site runs on sample prices.

## Design

Two palettes — light and dark — from one token file. `src/styles/tokens.css` holds every
colour as a custom property, and `[data-theme="dark"]` overrides them wholesale; nothing
below that file hard-codes a colour, so the modes cannot drift apart. The header toggle
writes the choice to `localStorage`, and an inline script in `index.html` resolves
`stored → prefers-color-scheme → dark` before first paint so the page never flashes the
wrong theme. Trust tiers are CSS classes rather than inline hex, because the greens and
ambers that read well on near-black do not read well on paper.

Both themes hold at least 5:1 contrast on every text element — comfortably past WCAG AA.

## Architecture

```
src/
├── index.html            shell: header, search, tabs, footer
├── assets/favicon.svg
├── styles/               tokens → base → components → layout (cascade order matters)
└── ts/
    ├── types.ts              the domain model everything else speaks
    ├── app.ts                entry: state, event wiring, render loop
    ├── data/             hand-maintained catalogue, nothing derived
    │   ├── meta.ts           snapshot date, categories, trust weight table
    │   ├── stores.ts         26 shops and their trust signals
    │   ├── products.ts       21 products, with Bangla/Banglish search aliases
    │   ├── offers.ts         117 listings as compact tuples
    │   └── search-patterns.ts  per-shop search URL templates
    ├── core/             pure logic, no DOM — reusable server-side
    │   ├── format.ts         money, escaping, normalisation
    │   ├── trust.ts          seven weighted signals + risk rules → 0–100
    │   ├── links.ts          product deep links and logo URLs
    │   ├── price-history.ts  deterministic 12-week series for the trend chart
    │   ├── trend.ts          chart geometry from those series — coordinates, never markup
    │   ├── catalog.ts        joins data into offers with market stats
    │   ├── urlstate.ts       encode/restore a shareable comparison in the query string
    │   └── search.ts         tolerant search (English, Bangla, Banglish)
    └── ui/               HTML string rendering, no DOM access beyond what it's given
        ├── fragments.ts      offer rows, group cards, meters, logos
        └── views.ts          results, shops, compare, methodology, chrome
tools/
├── build.mjs             clean → tsc → copy static files (the clean step is skipped for `--no-emit`)
├── serve.mjs             zero-dependency static server for dist/
└── check.mjs             integrity gate (see below)
server/
├── api.mjs               GET /api/search, rate limits, error handling
├── live-search.mjs       the two-step search, saved results, daily limit
├── providers/            the search vendor, in one replaceable file
├── page-price.mjs        reads one clear taka price from a page
├── matching.mjs          is it this product, and which version?
├── robots.mjs            robots.txt rules
└── safe-fetch.mjs        keeps page fetches off private networks and size-limited
tests/
├── core.test.mjs         regression tests for scoring, search and rendering rules
└── live.test.mjs         live search rules, with no network calls
```

`tsconfig.json` runs `strict` plus `noUnusedLocals`, `noUnusedParameters`,
`noImplicitOverride` and `verbatimModuleSyntax` (type-only imports must be marked `import type`).

Data flows one way: `data → core → ui → DOM`. Rendering is string templates into one
container with a single delegated click handler — no virtual DOM, and the whole page is
about 37 KB gzipped.

The address bar is part of that flow rather than an extra: `core/urlstate.ts` turns the
state into a query string (`?q=`, `view=`, `sort=`, `trust=`, `shop=`, `cod=`, `pick=`) and
reads it back, so any search, filter or shortlist is a link you can paste to someone. It
uses `replaceState`, never `pushState` — filtering is one continuous view. Unknown shop ids,
out-of-range trust steps and hand-edited `pick=` listings that don't exist are dropped on
read, and a shortlist mixing products is ignored rather than half-restored. `app.ts` is the
only module that touches `window.history`.

### What `npm run check` guards

It builds first, then inspects the artifact the browser will actually load: every emitted
module's imports resolve, every `src`/`href` in `index.html` points at a file that exists,
trust weights sum to exactly 100, no listing references an unknown shop or product, no
shop lists a product twice, prices and ratings are in range, no product is left without listings, and any closed shop must carry a documented reason.

## The trust model

Seven signals add to 100; risk rules subtract. The weights live in
`src/ts/data/meta.ts` and are printed verbatim in the *How it works* tab, so a shop can
dispute a specific number rather than the whole score.

| Signal | Weight | What it measures |
| --- | --- | --- |
| Business history | 20 | Years trading, type of business, physical shops |
| Buyer rating & review volume | 20 | The shop — or the exact marketplace seller — weighted by review count |
| Payment & refund safety | 15 | Card gateway, mobile wallets, and marketplaces, assumed to hold funds |
| Return & exchange window | 15 | Published days to send an item back |
| Authenticity & warranty | 15 | Official warranty, type of seller, and how far the price sits under market |
| Delivery coverage & speed | 5 | Districts served and quoted days |
| Reachable support | 10 | A published hotline, plus a service desk |

Risk rules:
- More than **18% under the market median** cuts the authenticity score and raises a warning.
- Marketplace listings from sellers with **under 60 reviews** are flagged separately — the
  platform is not the one who ships your order.
- A **shut-down business** has its offers dropped from the median but still displayed, in
  red, with the reason. They can't be shortlisted or followed to the shop's site.
- Any other recorded incident takes **25 points** off the score. Evaly is in the catalogue specifically for this case.

Every product sold by more than one shop can expand a 12-week price chart, plotting up to
six shops against the market median and ring-marking each one's cheapest week. The series
comes from `core/price-history.ts` — a hash of the listing id, so the chart is identical for
every visitor — and the panel labels it as generated sample history, not recorded prices.

`value = trust × 0.5 + savings × 0.35 + speed × 0.15` ranks "best deal", which is why the
top-ranked row is sometimes not the cheapest one. A listing below the Good tier (68) never
ranks above one that reached it.

## Adding a shop or a product

1. Add the record to `src/ts/data/stores.ts` or `products.ts`.
2. Add listings to `src/ts/data/offers.ts`: `[productId, storeId, price, mrp, etaDays, deliveryFee, sellerName, sellerRating, sellerReviews]`.
3. If you know the shop's own search URL works, add a template to
   `data/search-patterns.ts` (`{q}` is the encoded query). Otherwise leave it out and the
   link falls back to a site-scoped search — a guessed deep link only ever 404s.
4. `npm run check` catches typos in ids, unknown categories and products with no offers.

## Live search

Submitting a search (not typing) calls `GET /api/search?q=…`, which:

1. Runs a web search through a third-party SERP provider, currently Bright Data, because Google
   has no official API for this. `LIVE_SEARCH_ENGINE` picks `bing` (default) or `google`. Most
   Google results link through `google.com/goto`, which throttled the server after about three
   links in testing, so few shop pages get opened. Google sued one such provider, SerpApi, in
   December 2025, and scraping-based search carries similar risk on any engine.
2. Opens each shop page found, honouring `robots.txt` and refusing private network addresses.
3. Keeps a price only if the page states one clear price in BDT, for the product searched.
4. Groups by version (CPU, RAM, storage, or brand and pack size), and only names a lowest price
   between in-stock offers of the same version. Pages that don't state a version are shown but
   not compared.

Shops show as *Not rated*: no trust data has been verified, and a real price must not sit beside
an invented score.

A new search takes about a minute, nearly all of it waiting for the search provider (37 to 86
seconds in testing, against 3 to 18 for reading pages). So most customers shouldn't trigger one:
results are saved for 3 hours (`LIVE_SEARCH_CACHE_MINUTES`), and `LIVE_SEARCH_WARM` keeps a list
of popular searches refreshed in the background. Each new search is also a paid request, so
identical searches share one, each client gets 20 searches a minute, and a daily limit
(`LIVE_SEARCH_DAILY_LIMIT`, default 300) pauses paid searches, including background ones. These
counters and saved results are in memory, so they reset on restart and aren't shared between
server instances. Bing runs with `safesearch=strict`, and adult domains are refused before any
request, because an unfiltered grocery search returned adult sites in testing.

This needs a host that can run Node (`npm run build && HOST=0.0.0.0 npm start`), with the two
Bright Data variables set as environment variables. On a purely static host the site still works,
and search falls back to sample prices with a notice.

## Going live

Real prices need real sources, in rough order of difficulty:

1. **Marketplace APIs** — Daraz and Pickaboo publish seller/catalogue APIs under an app key.
2. **Direct partnerships or published feeds** for retailers such as Star Tech and Ryans.
3. **A scheduled collector** writing to a store database, with per-listing `lastSeen` timestamps
   so the UI can show price age instead of a static snapshot date.
4. **Warranty verification** by IMEI against brand portals, and trade-licence/BTRIS lookups
   to replace the sampled `since`/`showrooms` fields.

Collection must run server-side: browser requests to those domains are blocked by CORS and
bot protection, and any credentials have to stay off the client.

## Before going public

The code is ready to deploy as a demo, and CI runs `npm run check` and `npm test` on every
push. Sample scores still sit next to real shop names, so before removing `noindex` or
promoting the site, replace them with real data or get the shops' names out of the demo.
Live search also reads shops' pages and depends on a scraping provider, so check each shop's
terms and get legal advice on both before launch.
The Evaly shutdown text in `data/stores.ts` is a factual claim and needs a citable source.

## Deployment

`npm run build` emits `dist/`, which is already the shape Qoder Sites and any static host
expects (`index.html` at the root, relative assets, no server runtime), though live search
needs Node as described above. The site is a single route, so no SPA fallback is needed.

## Licence

Unlicensed for now — private project, all rights reserved.
