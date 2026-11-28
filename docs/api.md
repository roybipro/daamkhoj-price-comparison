# API

All endpoints are `GET`, answer JSON, and live under `/api/` (`server/api.mjs`). Search engines
are told to skip them (`robots.txt`). Rate limits are per visitor, per minute, told apart by
`CLIENT_IP_HEADER` (see [operations.md](operations.md#rate-limits)).

| Endpoint | What it does | Limit |
|---|---|---|
| [`/api/search/quick`](#apisearchquick) | Answers from the price list, free | 120/min |
| [`/api/recheck`](#apirecheck) | Re-reads the shop pages behind a search, then answers again | 30/min |
| [`/api/search`](#apisearch) | Paid web search, plus the price list's answer | 20/min |
| [`/api/browse`](#apibrowse) | The home page's shelves | 120/min (shared with quick) |
| [`/api/health`](#apihealth) | Is the site serving prices, and how old are they | none |

## Errors

| Status | When | Body |
|---|---|---|
| 400 | The query has nothing to search for (`q` empty, one letter, or only "price", "bd", …) | `{ "error": "Search for a product name" }` |
| 429 | Rate limit, or the daily paid-search limit | `{ "error": "Too many searches. …" }` |
| 502 | A search failed on the way | `{ "error": "Live search could not finish. …" }` |
| 503 | That part isn't set up on this server (no price list, no Bright Data key) | `{ "error": "… is not set up on this server" }` |
| 404 | Unknown `/api/` path | `{ "error": "Not found" }` |

`/api/*` answers only `GET`; a `HEAD` request gets 405, so point uptime monitors at `/`, not at
`/api/health`, if they send `HEAD`.

## The search answer

`/api/search/quick`, `/api/recheck` and `/api/search` answer the same shape:

```json
{
  "query": "iphone 15",
  "source": "index",
  "checkedAt": "2026-01-01T00:00:00.000Z",
  "cached": true,
  "found": 9,
  "priced": 7,
  "skipped": { "notShop": 0, "blocked": 0, "noPrice": 0, "otherProduct": 0, "failed": 0 },
  "groups": [
    {
      "label": "128GB",
      "comparable": true,
      "lowest": "https://shop-a.example/iphone-15-128",
      "offers": [
        {
          "shop": "shop-a.example",
          "url": "https://shop-a.example/iphone-15-128",
          "title": "Apple iPhone 15 128GB",
          "price": 82000,
          "inStock": true,
          "product": "apple iphone 15",
          "checkedAt": "2026-01-01T00:00:00.000Z",
          "image": "https://shop-a.example/iphone-15.jpg"
        }
      ]
    }
  ],
  "suggestions": [{ "name": "Apple iPhone 15", "shops": 12 }]
}
```

| Field | Meaning |
|---|---|
| `query` | What was searched, after Bangla reading, completion or correction |
| `correctedFrom` | Present when the query was read differently from what was typed: Bangla, spelling, joined/split words |
| `completedFrom` | Present when a half-typed last word was completed (`partial=1`) |
| `broadenedFrom` | Present when nothing matched exactly and this is the closest search, one word left out |
| `found` / `priced` | Listings matched / offers shown after cleaning and one-per-shop |
| `groups[]` | One per version. `comparable: false` holds offers whose version is unclear; they are shown but not compared |
| `groups[].lowest` | URL of the cheapest in-stock offer, only when there is a real choice; else `null` |
| `offers[]` | Cheapest first. `inStock` is `true`, `false` or `null` (unknown) |
| `offers[].product` | The product key, so the page can show one card per product |
| `suggestions` | Up to six products for the list under the search box (`partial=1` only) |

## `/api/search/quick`

| Parameter | |
|---|---|
| `q` | The search, English or Bangla, up to 80 characters |
| `partial=1` | The last word may still be half typed: complete it and add `suggestions` |

Answers in milliseconds, with no paid request. Falls back to the closest match when nothing
matches exactly.

## `/api/recheck`

| Parameter | |
|---|---|
| `q` | The search whose first results to re-read |
| `product` | Optional product key: re-read every shop's page for that one product |

Adds `rechecked` (pages read) and `changed` (prices that changed) to the search answer. Pages
read in the last half hour are skipped.

## `/api/search`

| Parameter | |
|---|---|
| `q` | The search |

Runs the paid web search (40–90 s) and merges the price list's answer into it. Adds `found`,
`skipped` counts from the web pages and `cached: true` when the answer came from the 3-hour cache.
Answers 503 if no Bright Data key is set.

## `/api/browse`

```json
{
  "shelves": [
    { "id": "phones", "label": "Phones", "cards": [
      { "name": "Samsung Galaxy A16", "from": 18500, "shop": "shop-a.example", "shops": 9,
        "versions": 3, "image": "https://…", "checkedAt": "2026-01-01T00:00:00.000Z" }
    ] }
  ],
  "shops": [{ "shop": "shop-a.example", "prices": 8000 }],
  "prices": 131574
}
```

A card's `from` is the lowest price of any version. Cards only show products at least two shops
sell. Rebuilt hourly in the background (sooner after re-checks change prices).

## `/api/health`

```json
{ "ok": true, "prices": 131574, "shops": 30, "listUpdatedAt": "2026-01-01T00:00:00.000Z",
  "listAgeHours": 3.6, "uptimeSeconds": 217, "memoryMB": 165, "heapMB": 36 }
```

503 only when no prices are served. `memoryMB` is the whole process (RSS); `heapMB` is the
JavaScript heap, the part that can run out (capped at about half the host's memory).

## Pages outside `/api/`

| Path | |
|---|---|
| `/` and `/?q=…` | The site. Each page gets its own title, description, canonical link, Open Graph tags and JSON-LD from real prices (`server/seo.mjs`); searches with no prices are `noindex` |
| `/robots.txt` | Allows everything but `/api/` |
| `/mcp` | The price list for AI agents, as an MCP server (`POST` only); see [mcp.md](mcp.md) |
| `/sitemap.xml` | The home page, the tabs, and one search address per home page product |
