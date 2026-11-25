# Crawler and price list

The crawler builds `data/price-index.json`, the list instant search answers from.

## The file

```json
{
  "version": 1,
  "updatedAt": "2026-01-01T00:00:00.000Z",
  "shops": {
    "example.com.bd": {
      "crawledAt": "2026-01-01T00:00:00.000Z",
      "stats": { "listed": 0, "read": 0, "priced": 0, "noPrice": 0, "blocked": 0, "failed": 0 },
      "checked": { "<page url>": "<time it was read with no price>" },
      "entries": [
        { "shop": "example.com.bd", "url": "https://example.com.bd/product/x",
          "name": "Product name 8/256GB", "price": 45000, "inStock": true,
          "checkedAt": "2026-01-01T00:00:00.000Z", "image": "https://…" }
      ]
    }
  }
}
```

Times are ISO 8601 strings in UTC. Prices are taka. `inStock` is `true`, `false` or `null`
(unknown). It's committed to git, because Render's free disk is wiped on every deploy.

## How a crawl works

`tools/crawl.mjs` runs `crawlShop` (`server/crawler.mjs`) for every shop in
`server/index-shops.mjs`, side by side:

1. **List product pages** from the shop's sitemap (`server/sitemap.mjs`), keeping addresses that
   match the shop's product pattern. An empty sitemap is an error, so a broken shop never wipes
   its saved prices.
2. **Order them:** never-read pages first, then those read longest ago. A run cut short still
   refreshes the oldest prices.
3. **Read each page,** one at a time per shop, with a 1 s pause (`--delay`):
   - `robots.txt` is asked about the exact address fetched;
   - ordinary shops: one clear taka price, stock and photo from the page (`page-price.mjs`:
     structured data, then the page itself);
   - Shopify shops (`kind: 'shopify'`): the product's `.js` JSON, which prices each version
     separately.
4. **Keep it safe:**
   - a page that fails to load keeps its last price;
   - a page that now has no clear price, or that `robots.txt` now refuses, loses it;
   - progress is saved as it goes;
   - with `--minutes`, no page is started after that time, so a run with a deadline saves.

```bash
npm run crawl                                          # every shop
npm run crawl -- --shop=dazzle.com.bd,istockbd.com     # some shops
npm run crawl -- --shop=dazzle.com.bd --limit=50       # a sample
npm run crawl -- --limit=8000 --minutes=270            # what the nightly job runs
```

## The nightly job

`.github/workflows/refresh-prices.yml` runs at **02:30** and **16:30** Bangladesh time
(20:30 and 10:30 UTC), or by hand from the Actions tab with a smaller `limit` for a test.

1. Crawl up to 8,000 pages per shop, starting no page after 270 minutes (the job is killed at
   330, and a killed job commits nothing).
2. Refuse to save a list with fewer than 1,000 prices.
3. Merge shop by shop onto whatever reached `main` meanwhile (`tools/merge-lists.mjs`), so a
   commit made during the crawl never conflicts with it.
4. Commit to `main` as `github-actions[bot]` and call the Render deploy hook.
5. Write a per-shop table to the run's summary (`tools/crawl-report.mjs`). The run fails, so
   GitHub emails the owner, if the list lost 30% of its current prices or a third of the shops
   went unrefreshed.

The server also downloads the newest list from GitHub on start and every
`PRICE_INDEX_PULL_HOURS` (6) when `PRICE_INDEX_URL` is set, so prices arrive without a deploy.
It picks up a changed file within 30 seconds.

**Never commit `data/price-index.json` while a refresh run is in progress**
(`gh run list --workflow refresh-prices.yml`).

## Publishing a crawl run elsewhere

Some shops refuse data-centre addresses (Sumash Tech refuses GitHub's and Render's servers), so
their prices only refresh from a crawl on a home connection:

```bash
npm run crawl -- --shop=sumashtech.com --file=/tmp/crawl.json
node tools/merge-lists.mjs --into=data/price-index.json --from=/tmp/crawl.json
```

Then commit on a branch and open a PR as usual.

## Adding a shop

A shop is added only after a check by hand:

1. Its `robots.txt` allows product pages.
2. A sample of its pages gives one clear taka price for at least half of them. Crawl one with
   `npm run crawl -- --shop=<new shop> --limit=25` after adding it.
3. It sells to shoppers. A price guide with no cart, such as Mobile Dokan, is left out.

Then add it to `INDEX_SHOPS` in `server/index-shops.mjs`:

```js
{ shop: 'example.com.bd', sitemap: 'https://example.com.bd/sitemap.xml', product: /\/product\/[^/]+\/?$/, kind: 'page' }
// kind: 'shopify' reads Shopify's product JSON instead of the page
```

and run `npm run fetch-logos -- --shop=example.com.bd` for its logo.

## Photos

The crawl saves a photo with each price: the page's structured data, else its sharing image,
else Shopify's product JSON. `npm run backfill-images` fetches photos for home page cards that
lack one without waiting for the nightly crawl to reach them. Re-checks also fill missing photos.
