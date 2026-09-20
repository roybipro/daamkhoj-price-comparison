# DaamKhoj — দামখোঁজ

Price and trust comparison for Bangladeshi online shops. Search a product, see every
retailer's price side by side, and read a trust score you can actually argue with next
to each one — because the cheapest listing in Bangladesh is not always the safest.

**The prices, ratings and policies in this repository are sample data**, labelled as such
in the header, the footer and the *How it works* tab. Shop identities are real; the numbers
are placeholders until live feeds are wired in (see [Going live](#going-live)).

## Quick start

```bash
npm install       # one dev dependency: typescript
npm run dev       # build, then serve dist/ at http://127.0.0.1:5173/
npm run check     # strict typecheck, build, then catalogue and reference integrity
npm run build     # emit dist/ (the deployable artifact)
npm run typecheck # tsc --noEmit only
```

TypeScript is compiled, not transpiled at runtime: `src/ts/**/*.ts` → `dist/js/**/*.js` as
plain ES modules. The shipped site has **zero runtime dependencies** — no framework, no
polyfills, no bundler. Requires Node 20+ to build.

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
    │   └── search-patterns.ts  verified per-shop search URL templates
    ├── core/             pure logic, no DOM — reusable server-side
    │   ├── format.ts         money, escaping, normalisation
    │   ├── trust.ts          seven weighted signals + risk rules → 0–100
    │   ├── links.ts          product deep links and logo URLs
    │   ├── price-history.ts  deterministic 12-week series for the trend chart
    │   ├── catalog.ts        joins data into offers with market stats
    │   └── search.ts         tolerant search (English, Bangla, Banglish)
    └── ui/               HTML string rendering, no DOM access beyond what it's given
        ├── fragments.ts      offer rows, group cards, meters, logos
        └── views.ts          results, shops, compare, methodology, chrome
tools/
├── build.mjs             clean → tsc → copy static files
├── serve.mjs             zero-dependency static server for dist/
└── check.mjs             integrity gate (see below)
```

`tsconfig.json` runs `strict` plus `noUnusedLocals`, `noUnusedParameters`,
`noImplicitOverride` and `verbatimModuleSyntax` (type-only imports must be marked `import type`).

Data flows one way: `data → core → ui → DOM`. Rendering is string templates into one
container with a single delegated click handler — no virtual DOM, and the whole page is
under 30 KB gzipped.

### What `npm run check` guards

It builds first, then inspects the artifact the browser will actually load: every emitted
module's imports resolve, every `src`/`href` in `index.html` points at a file that exists,
trust weights sum to exactly 100, no listing references an unknown shop or product, no
product is left without listings, and any closed shop must carry a documented reason.

## The trust model

Seven signals add to 100; risk rules subtract. The weights live in
`src/ts/data/meta.ts` and are printed verbatim in the *How it works* tab, so a shop can
dispute a specific number rather than the whole score.

| Signal | Weight | What it measures |
| --- | --- | --- |
| Verified business & history | 20 | Trade licence, years trading, physical shops |
| Buyer rating & review volume | 20 | The shop — or the exact marketplace seller — weighted by review count |
| Payment & refund safety | 15 | Card gateway, mobile wallets, whether funds are held |
| Return & exchange window | 15 | Published days to send an item back |
| Authenticity & warranty | 15 | Authorised distribution, and how far the price sits under market |
| Delivery coverage & speed | 5 | Districts served and quoted days |
| Reachable support | 10 | A hotline that answers, plus a service desk |

Risk rules:
- More than **18% under the market average** cuts the authenticity score and raises a warning.
- Marketplace listings from sellers with **under 60 reviews** are flagged separately — the
  platform is not the one who ships your order.
- A **shut-down business** has its offers dropped from the average but still displayed, in
  red, with the reason. Evaly is in the catalogue specifically for this case.

`value = trust × 0.5 + savings × 0.35 + speed × 0.15` ranks "best deal", which is why the
top-ranked row is sometimes not the cheapest one.

## Adding a shop or a product

1. Add the record to `src/ts/data/stores.ts` or `products.ts`.
2. Add listings to `src/ts/data/offers.ts`: `[productId, storeId, price, mrp, etaDays, deliveryFee, sellerName, sellerRating, sellerReviews]`.
3. If you know the shop's own search URL works, add a template to
   `data/search-patterns.js` (`{q}` is the encoded query). Otherwise leave it out and the
   link falls back to a site-scoped search — a guessed deep link only ever 404s.
4. `npm run check` catches typos in ids, unknown categories and products with no offers.

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

## Deployment

`npm run build` emits `dist/`, which is already the shape Qoder Sites and any static host
expects (`index.html` at the root, relative assets, no server runtime). The site is a single
route, so no SPA fallback is needed.

## Licence

Unlicensed for now — private project, all rights reserved.
