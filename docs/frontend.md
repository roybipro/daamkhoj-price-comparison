# Frontend

The browser app is TypeScript compiled to plain ES modules (`src/ts/**/*.ts` →
`dist/js/**/*.js`). There is no framework, bundler or runtime dependency.

## Build

`tools/build.mjs` clears `dist/`, runs `tsc`, and copies `index.html`, styles and assets.
`tsconfig.json` runs `strict` plus `noUnusedLocals`, `noUnusedParameters`, `noImplicitOverride`
and `verbatimModuleSyntax` (type-only imports must say `import type`).

`npm run check` builds, then checks the files the browser will load:
- every module's imports resolve;
- every `src`/`href` in `index.html` exists;
- the built-in catalogue's references line up.

## How a page is drawn

- **One-way data flow:** state → HTML strings → one container. A single delegated click handler
  serves the page. There is no virtual DOM.
- **`app.ts`** holds the state, wires events, runs the search flow (see
  [search.md](search.md#the-flow-in-the-browser)) and calls `render()`.
- **`ui/`** turns state into HTML:
  - `browse.ts` draws the home page shelves;
  - `live.ts` draws search results and product views;
  - `views.ts` draws the tabs and chrome;
  - `fragments.ts` holds shared pieces.

  Everything that came from a shop's page goes through `escapeHtml` or `safeHttpUrl`.
- **`core/live.ts`** talks to the API. "Unavailable" (404/503 or no JSON, as on a static host) is
  a normal answer, not an error.

## Tabs

| Tab | `view=` | Shows |
|---|---|---|
| Prices | (default) | The home page shelves, or search results and product views |
| Shops | `stores` | The 37 shops in the price list, with how many prices each has |
| How it works | `how` | How prices are found, read and kept fresh |

## Saved products and price history

- **Save** on a product page keeps it in this browser (`localStorage` `daamkhoj.saved.v1`, at
  most 30, no account; `src/ts/core/saved.ts`). The home page then opens with a **Saved** shelf:
  each product's price today from the price list (the same quick search that found it, so it
  matches the product page), with "Down ৳…"/"Up ৳…" against the price when it was saved. A
  saved card reopens its search and product.
- A product page fetches its **price history** once (`src/ts/core/history.ts`, `/api/history`)
  and draws it in `src/ts/ui/live.ts`; the line ends on the price shown now.

- **Build** tab (`?view=build`; `src/ts/core/basket.ts`, `src/ts/ui/basket.ts`): products added
  with **Add to build** (one button per version when a product page lists several, since a build
  needs a version), kept in this browser (`daamkhoj.basket.v1`, at most 15). Each is priced from
  the quick search that found it, in-stock offers only, and the build is totalled two ways: the
  cheapest mix of shops, and the cheapest single shop that has everything (with the shops that
  have the most of it when none has all).

- **Build me a PC** (top of the Build tab): a budget and a use ask `/api/advisor`; the suggested
  parts can replace the build in one press, after which the Build tab prices them as usual.

## The address bar

`core/urlstate.ts` turns the state into a query string and back. That makes every search a link
you can share:

| Parameter | Meaning |
|---|---|
| `q` | The search |
| `view` | The tab |
| `sort`, `shop` | Result sorting and a shop filter |
| `trust`, `cod`, `pick` | Older filters, kept so old links still work |

Filtering uses `replaceState`, but a new search or view is a history step, so the back button
undoes the last step instead of leaving the site.

## Look

- **Fonts:** Lato for text, Hind Siliguri for Bangla, and Montserrat for headings, from Google
  Fonts.
- **Colours:** every colour is a custom property in `src/styles/tokens.css`, and
  `[data-theme="dark"]` overrides them all. Nothing below that file hard-codes a colour.
- **Theme:** an inline script in `index.html` picks the saved choice (`localStorage`
  `daamkhoj:theme`), else dark, before the first paint, so the page never flashes
  the wrong theme.
- **CSS order:** the styles load as tokens → base → components → layout, and that order matters.

## Shop logos and photos

- **Logos:** each listed shop's own icon is saved in `src/assets/shops/` by
  `npm run fetch-logos` and mapped in `data/shop-logos.ts`. Shops that only the web search finds
  use a favicon service.
- **Photos:** product photos come from the price list. See [crawler.md](crawler.md#photos).
