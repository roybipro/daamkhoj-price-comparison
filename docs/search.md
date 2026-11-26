# Search

A search goes through up to three layers. The cheap, fast one answers first and the slower ones
add to it.

| Layer | When | Endpoint | Speed | Cost |
|---|---|---|---|---|
| Price list | every pause in typing, and on Enter | `/api/search/quick` | ~10 ms on the server | free |
| Re-check | ~1 s after results show | `/api/recheck` | 1–5 s | free (reads shop pages) |
| Web search | on Enter | `/api/search` | 40–90 s | paid (Bright Data) |

## The flow in the browser

`src/ts/app.ts`:

1. **Typing:** 50 ms after each keystroke, `searchAsTyped` asks `/api/search/quick?partial=1`.
   Each new keystroke cancels the request before it.
2. **About 1 s after typing stops:** `recheckShown` asks `/api/recheck` to re-read the shop pages
   behind the results, and `applyFresh` (`core/live.ts`) swaps in the new prices.
3. **Enter:** `startLive` asks the list first. If the list corrected the spelling
   ("onplus" → "oneplus"), the paid web search runs with the corrected words. The web answer
   then replaces or adds to what is shown, with a note if it found nothing more.

## Instant search: the price list

`server/price-index.mjs`, `createPriceIndex`.

### Storage: SQLite on disk

The list is committed as JSON (`data/price-index.json`, ~54 MB). When the server loads it, it
copies the list into a private temporary SQLite database (Node's built-in `node:sqlite`) and lets
the JSON go. The database is deleted when it is closed.

| Table | Holds |
|---|---|
| `entries` | one row per price: shop, url, name, price, in_stock, checked_at, image, `pkey` (product key) |
| `words` | every word of each listing's name and address, `in_name` marking the name's own; primary key `(word, id)` |
| `word_counts` | how many names use each word, for spelling and completion |
| `products` | one row per product for suggestions, ordered by how many shops sell it |
| `product_words` | the words of each product |

Words are split by the same tokenizer the matching rules use (`matching.mjs`), not SQLite's
full-text tokenizer, so "128 GB", "128gb" and "128-GB" are all the word `128gb`.

The database is built a few hundred listings at a time, with its indexes filled as rows go in,
so the site never pauses for more than ~85 ms. A newer list is built in the background while the
old one keeps answering; the old one is closed 10 minutes later.

Measured at 109k prices: heap 101 MB → 16 MB, median search 12 ms → 8 ms, same answers.

### How a query is answered

1. **Clean it.** Control characters become spaces; it's cut to 80 characters (`cleanQuery`).
2. **Bangla → English.** `bangla.mjs` reads Bangla in the shops' English: "আইফোন ১৫" → "iphone
   15", "১২৮ জিবি" → "128gb", "এস ২৪" → "s24". The answer says what it was read as
   (`correctedFrom`).
3. **Find candidates.** The words that must match are the query's words that aren't numbers or
   noise ("price", "bd", "best", …). The database returns the listings holding all of them. A
   query of only numbers and sizes ("256gb", "65w", "f91w") looks up each word as written, as
   the start of a longer word ("65" → "65w"), or split in two ("F-91W").
4. **Check each candidate** with `matchesQuery`:
   - every query word is in the name; "15" is a whole number, not part of "2015"; "65" matches "65w";
   - an accessory isn't the product: "case for iPhone 15" and "AirPods Cases" don't match, but
     what comes "with" or "built-in" is in the box: "Power Bank with Built-in Cable" is a power bank;
   - a copy isn't the product: "Dubai copy", "master copy", "replica", "clone";
   - a different CPU isn't the product: an i5 laptop doesn't match "i7";
   - "pro", "max", "plus", "used", "refurbished" and similar words exclude a listing unless asked for.
5. **Drop suspicious prices.** A price under half the median for the same product is likely a
   deposit, a part or a mistake (`dropSuspiciousPrices`).
6. **Group by version** (RAM, storage, CPU, pack size, 5G) with `variantOf`. One shop counts
   once per product, at its cheapest price in stock. Prices in stock come first, each cheapest
   first, then out of stock; a home page card's "from" is the cheapest price in stock, and the
   lowest is only named where there's a real choice of in-stock offers in the same version.

### When the exact search finds nothing

- **Joined and split words** are tried: "powerbank" ⇄ "power bank", "ear buds" ⇄ "earbuds".
  If both forms find prices, they are merged.
- **Spelling** is corrected to the closest word the list uses, the commonest when several are as
  close (`createSpeller`). Words with digits are model numbers and stay as typed.
- **Closest match** (for shoppers only): the search with one word left out, the narrowest that
  still finds something. "galaxy s24 ultra 1tb" shows Galaxy S24 Ultra and says so
  (`broadenedFrom`).

### While a word is being typed (`partial=1`)

- Up to six **suggestions**: products holding every finished word and a word starting with the
  one being typed, most widely sold first.
- The last word is **completed** to the top suggestion's word, or the commonest word starting that
  way among listings with the earlier words: "iph" → "iphone", "galaxy a1" → "galaxy a16".
- A last word the list knows in full is searched as typed: "ryzen 5 5600" stays the 5600, not the
  5600GT.

### Prices older than a week

They are never shown. They are dropped when the list loads, and filtered again on each search.

## Re-checks and freshening

- **`/api/recheck`** (`server/recheck.mjs`) re-reads the shop pages behind a search's first
  results, or every page for one product (`product=`). No paid search is needed: the list knows
  each page. Limits: 30 pages per check, 20 per shop, 3 at a time; a page read in the last half
  hour isn't read again; two shoppers asking for the same page share one read; a shop that
  refuses the server 3 times is left alone for an hour.
- **The freshener** (`server/freshen.mjs`) does the same in the background: every
  `FRESHEN_EVERY_SECONDS` (60) it re-checks one of the 80 most-stocked home page products and one
  of the rest, so popular prices are about an hour old at most.

Re-read prices are written to the database. They last until the next list loads; the next crawl
reads them again anyway.

## Live web search

`server/live-search.mjs`, `server/providers/bright-data.mjs`.

1. **Find pages.** Bright Data's search API runs the query on Bing, in Bangladesh, with
   `safesearch=strict`. It runs two wordings at once ("… price in bangladesh" and
   "… bangladesh") because Bing is unreliable on any one. Google is possible
   (`LIVE_SEARCH_ENGINE=google`) but throttles its redirect links.
2. **Skip what isn't a shop** before opening anything: social sites, price guides, adult domains,
   and results that don't mention the product. Exact matches are opened first.
3. **Read up to 15 pages**, 5 at a time: `robots.txt` checked, private addresses refused
   (`safe-fetch.mjs`), one clear taka price required, and the page's own product name must match.
4. **Clean up and group** exactly as the price list does, then merge with the list's answer. The
   same page in both counts once; the fresher copy wins.

Costs and limits: each search is 2 paid requests. Results are cached for
`LIVE_SEARCH_CACHE_MINUTES` (180). Identical searches running at once share one. A daily limit
(`LIVE_SEARCH_DAILY_LIMIT`, 300 requests) pauses paid searches. The cache and counters are in
memory and reset on restart.

## The old sample catalogue

The browser still carries the sample catalogue the site started with (`src/ts/data/`) and a
search over it (`src/ts/core/search.ts`: name and Bangla name first, then brand and aliases,
then category and specs; 1–2 letter typos only in words of 4+ letters without digits). Since
PR #49 its prices are not shown: if the price list can't be reached, the page says so.
