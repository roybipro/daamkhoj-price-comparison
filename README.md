# DaamKhoj — দামখোঁজ

Price comparison for Bangladeshi online shops. Search a product in English or Bangla and see
every shop's price side by side, cheapest first, with each price read from the shop's own page.

**Live:** <https://daamkhoj.onrender.com>

- **37 shops, about 147,000 prices**, crawled twice a day from the shops' sitemaps.
- **Instant search**: results follow your typing, in milliseconds, with suggestions, spelling
  correction ("onplus" → OnePlus) and Bangla ("আইফোন ১৫" → iPhone 15).
- **Fresh prices**: the pages behind your results are re-read while you look at them.
- **Fair comparisons**: only the same version is compared (an i5 laptop is never "cheaper" than
  an i7), accessories aren't the product, and suspicious prices are left out.
- **Web search** on Enter finds shops the crawl doesn't cover.
- **For AI agents**: an MCP server at `https://daamkhoj.onrender.com/mcp` lets Claude, ChatGPT,
  Cursor and other agents ask which shop is cheapest ([docs/mcp.md](docs/mcp.md)).

## Quick start

Requires Node 22.13 or later (the live site runs Node 26).

```bash
npm install         # one dev dependency: typescript
npm run dev         # build, then serve at http://127.0.0.1:5173/
npm test            # build, then the tests (no network calls)
npm run check       # strict typecheck, build, integrity checks
```

The repository includes the latest price list, so search works at once. Copy `.env.example` to
`.env` and add Bright Data keys to turn on the paid web search; without them everything else
works.

| Command | |
|---|---|
| `npm run dev` / `npm start` | Build and serve / serve the existing build (`PORT`, `HOST`) |
| `npm run build` | Emit `dist/` |
| `npm run typecheck` | `tsc --noEmit` only |
| `npm test` | Build, then `tests/*.test.mjs` |
| `npm run check` | Build, then check the built site's references |
| `npm run crawl` | Refresh the price list (hours; `-- --shop=x.com.bd --limit=50` for a sample) |
| `npm run backfill-images` | Photos for home page cards (minutes) |
| `npm run fetch-logos` | Logos for listed shops that have none |

## Documentation

| | |
|---|---|
| [Architecture](docs/architecture.md) | The parts, how a price reaches the screen, where everything lives |
| [Search](docs/search.md) | Instant search on SQLite, matching rules, Bangla, re-checks, web search |
| [Crawler](docs/crawler.md) | The price list file, how a crawl works, the nightly job, adding a shop |
| [API](docs/api.md) | Every endpoint, its parameters and answers |
| [MCP](docs/mcp.md) | The price list for AI agents: tools, connecting, limits |
| [Operations](docs/operations.md) | Hosting, deploys, environment variables, monitoring, troubleshooting |
| [Frontend](docs/frontend.md) | The browser app: build, rendering, tabs, URL state, look |

## Stack

| | |
|---|---|
| Browser | TypeScript 7 → plain ES modules; no framework, no bundler, no runtime dependencies |
| Server | Node's built-in `http`, no framework; price list searched from SQLite (`node:sqlite`) on disk |
| Web search | Bright Data's search API on Bing (`server/providers/bright-data.mjs`) |
| Hosting | Render (free plan) |
| Automation | GitHub Actions: CI and deploy, a price crawl twice a day, an uptime check every 30 min |

## Working on it

- Branch → PR → CI green → merge to `main`. Merging to `main` deploys.
- Don't commit `data/price-index.json` while the *Refresh price list* workflow is running.
- Put no invented data next to real shop names. Prices come only from shops' own pages.
- Be polite to shops: check `robots.txt`, send about one request a second per shop, and don't
  re-read a page within half an hour.
- Server changes that hold more in memory must be measured under the host's heap cap (see
  [Operations](docs/operations.md#memory)).

## Before promoting it

The site reads shops' public pages and uses a scraping-based search provider. Check each shop's
terms and get legal advice on both before promoting the site widely. Shops show as *Not rated*:
no trust data has been verified.

## Licence

Unlicensed for now. Private project, all rights reserved.
