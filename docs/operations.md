# Operations

How the live site at <https://daamkhoj.onrender.com> is built, deployed, watched and fixed.

## Hosting

| | |
|---|---|
| Host | Render web service `daamkhoj`, free plan (512 MB), Singapore |
| Build | `npm ci && npm run build` |
| Start | `npm start` (`node tools/serve.mjs`) |
| Node | 26 (`NODE_VERSION`); the code needs 22.13+ for `node:sqlite` |
| Sleep | The free plan sleeps after 15 min idle; an UptimeRobot monitor loads `/` every 5 min to keep it awake |

## Deploying

The normal path: branch → PR → CI green → merge to `main`. CI (`.github/workflows/ci.yml`) runs
`npm run check` and `npm test`, and on `main` calls the `RENDER_DEPLOY_HOOK` secret, which
deploys. The price refresh does **not** deploy: the server downloads the new list itself within
the hour. A deploy restarts the free instance, and the site is starting up for about a minute.

Render's own auto-deploy doesn't fire for this repository, so the hook is the only automatic
trigger. To deploy by hand: Render dashboard → *daamkhoj* → *Manual Deploy*. Changing an
environment variable on Render also deploys the latest `main`.

A deploy takes 1–2 minutes. The new server answers at once; the home page shelves come back
within about a minute (it shows the last shelves meanwhile).

## Environment variables

Set on Render; for local runs copy `.env.example` to `.env`.

| Variable | Default | |
|---|---|---|
| `HOST` / `PORT` | `127.0.0.1` / `5173` | Render needs `HOST=0.0.0.0` |
| `SITE_URL` | `https://daamkhoj.onrender.com` | Base for canonical links and the sitemap |
| `CLIENT_IP_HEADER` | none | Header holding each visitor's real address; `cf-connecting-ip` on Render |
| `PRICE_INDEX_FILE` | `data/price-index.json` | Where the list is read and saved |
| `PRICE_INDEX_URL` | none | Raw GitHub URL of the list: checked on start and every… |
| `PRICE_INDEX_PULL_HOURS` | `1` | …this many hours; downloaded only when it changed (ETag) and newer |
| `PRICE_HISTORY_FILE` | `data/price-history.ndjson` | Where the price history is read |
| `PRICE_HISTORY_URL` | beside `PRICE_INDEX_URL` | Raw URL of the price history, pulled a minute after start and then like the list |
| `PRICE_INDEX_REFRESH_HOURS` | none | Let the server crawl by itself (needs a persistent disk) |
| `FRESHEN_EVERY_SECONDS` | `60` | Background re-check of popular products; `0` turns it off |
| `BRIGHTDATA_API_KEY`, `BRIGHTDATA_SERP_ZONE` | none | Turn on the paid web search |
| `LIVE_SEARCH_ENGINE` | `bing` | `bing` or `google` |
| `LIVE_SEARCH_CACHE_MINUTES` | `180` | How long web search answers are kept |
| `LIVE_SEARCH_DAILY_LIMIT` | `300` | Paid requests per UTC day (a search is 2) |
| `LIVE_SEARCH_WARM` | none | Comma-separated searches kept fresh in the background (each refresh is paid) |

## Scheduled jobs (GitHub Actions)

| Workflow | When | Does |
|---|---|---|
| `refresh-prices.yml` | 02:30 and 16:30 Bangladesh time | Crawls and saves the list to `main`; the server picks it up within the hour. See [crawler.md](crawler.md#the-nightly-job) |
| `uptime.yml` | every 30 min | Fails (so GitHub emails) if `/api/health` doesn't answer, serves under 1,000 prices, or the list is over 48 h old |
| `ci.yml` | every push and PR | Check, test, and deploy from `main` |

## Watching it

- **`/api/health`**: price count, shop count, list age, uptime, `memoryMB` (whole process) and
  `heapMB` (the part that can run out).
- **Render logs**: on start the server logs `price list: N prices from M shops`, then
  `photos: …` once the shelves are built.
- **Crawl runs**: each run's summary page has a per-shop table.

## Memory

Node's heap on the free plan is about 252 MB (half of 512). Since PR #55 the price list is
searched from SQLite on disk: at 131k prices the live heap is about 36 MB and the whole process
about 165 MB (it was 321 MB). The peak is while a new list loads, when its JSON is parsed
(about 55 MB at 38 MB of JSON) before being copied to disk and let go.

Before merging a server change that keeps more in memory, measure it under the real cap:

```bash
node --max-old-space-size=252 tools/serve.mjs
# then search while it loads, and read heapMB from /api/health
```

## Rate limits

Visitors are told apart by `CLIENT_IP_HEADER`. Never use the first `X-Forwarded-For` entry: a
visitor can write it, and Render appends the real address after it instead of replacing it.
Behind Cloudflare, `cf-connecting-ip` can't be forged (Cloudflare answers 403). Limits and
saved web search answers are in memory: they reset on restart and aren't shared between
instances.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Site down, Render events show exit code 134 | Heap ran out | Find what keeps more in memory; measure as above |
| `listAgeHours` over 24 | The refresh workflow failed or stopped committing | Actions tab → *Refresh price list*; read the run summary |
| One shop's prices go stale | The shop refuses data-centre addresses (Sumash Tech) | Crawl it from a home connection and merge (see [crawler.md](crawler.md#publishing-a-crawl-run-elsewhere)) |
| A merge didn't deploy | The deploy hook wasn't called | Check the CI run's *Ask Render to deploy* step; deploy by hand |
| The site is slow to first answer | The free plan slept | Check the UptimeRobot monitor; the real fix is a paid plan |
| Web search answers 429 all day | Daily paid limit reached | Raise `LIVE_SEARCH_DAILY_LIMIT` or wait for midnight UTC |
| An uptime monitor shows a false outage | It sends `HEAD` to `/api/health`, which answers 405 | Point it at `/` |
| Committing the list conflicts | A refresh run was in progress | Wait for it (`gh run list --workflow refresh-prices.yml`), then rebase |
