/* The home page when a price list is available: what to do here, then shelves of popular
   products by category, then the shops the prices come from. Every card, name and photo comes
   from shops' pages, so all of it goes through escapeHtml or safeHttpUrl. */

import { escapeHtml, money, pluralCount } from '../core/format.js';
import { shopLogo } from '../core/links.js';
import { safeHttpUrl } from '../core/live.js';
import type { BrowseCard, BrowseData, BrowseShelf, RenderContext } from '../types.js';
import { priceTag } from './fragments.js';

const stroke = (paths: string, size = 26): string =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

/* Drawn rather than photographed, so a shelf reads the same whatever the shops publish. */
const ICONS: Record<string, string> = {
  all: stroke('<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>'),
  popular: stroke('<path d="m12 3.5 2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.9l-5.3 2.7 1-5.8-4.2-4.1 5.9-.9z"/>'),
  trending: stroke('<path d="M3 17 9.5 10.5l4 4L21 7"/><path d="M15 7h6v6"/>'),
  phones: stroke('<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>'),
  laptops: stroke('<rect x="4.5" y="5" width="15" height="10" rx="1.5"/><path d="M2.5 18.5h19"/>'),
  tablets: stroke('<rect x="4.5" y="2.5" width="15" height="19" rx="2.5"/><circle cx="12" cy="18.3" r=".6" fill="currentColor"/>'),
  audio: stroke('<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4.5" height="6.5" rx="1.5"/><rect x="16.5" y="14" width="4.5" height="6.5" rx="1.5"/>'),
  watches: stroke('<rect x="6.5" y="6.5" width="11" height="11" rx="3"/><path d="M9 6.5 9.6 2.5h4.8L15 6.5M9 17.5l.6 4h4.8l.6-4M12 9.5V12l1.5 1.5"/>'),
  accessories: stroke('<path d="M9 2.5v5M15 2.5v5M7 7.5h10v3a5 5 0 0 1-10 0v-3zM12 15.5v6"/>'),
  power: stroke('<path d="M9 2.5v5M15 2.5v5M7 7.5h10v3a5 5 0 0 1-10 0v-3zM12 15.5v6"/>'),
  gaming: stroke('<path d="M7 8.5h10a4 4 0 0 1 4 4v1.5a3 3 0 0 1-5.3 2l-1.2-1.5h-5l-1.2 1.5A3 3 0 0 1 3 14v-1.5a4 4 0 0 1 4-4zM8 11v3M6.5 12.5h3M15.5 12h.01M17.5 13.5h.01"/>'),
  screens: stroke('<rect x="2.5" y="4" width="19" height="12.5" rx="1.5"/><path d="M8.5 20.5h7M12 16.5v4"/>'),
  pc: stroke('<rect x="2.5" y="6.5" width="19" height="11" rx="2"/><path d="M6 10h.01M9 10h.01M12 10h.01M15 10h.01M18 10h.01M7.5 14h9"/>'),
  more: stroke('<circle cx="5.5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="18.5" cy="12" r="1.3" fill="currentColor"/>')
};
const icon = (id: string, size?: number): string =>
  size ? (ICONS[id] ?? ICONS.all).replace(/width="26" height="26"/, `width="${size}" height="${size}"`) : ICONS[id] ?? ICONS.all;

/* Consumer-first shelf order on the home page, after Popular and Trending. */
const SHELF_ORDER = ['phones', 'laptops', 'tablets', 'audio', 'watches', 'pc', 'screens', 'gaming', 'power', 'more'];

/* High-demand lines shoppers look up most often, used to populate the Trending shelf. */
const TRENDING_LINES: RegExp[] = [
  /\biphone\s*\d+/i,
  /\bgalaxy\s*(s2\d|a\d+)/i,
  /\b(redmi\s*note|poco)\b/i,
  /\b(macbook|thinkpad|ideapad|vivobook)\b/i,
  /\b(ipad|galaxy\s*tab|honor\s*pad|xiaomi\s*pad)\b/i,
  /\b(airpods|galaxy\s*buds|soundcore|edifier)\b/i,
  /\b(apple\s*watch|galaxy\s*watch|amazfit|huawei\s*(watch|band)|kieslect)\b/i,
  /\b(ryzen\s*[579]|rtx\s*[345]0\d0|corsair|kingston\s*fury)\b/i,
  /\b(jbl\s*(flip|charge|xtreme|go|clip)|marshall)\b/i,
  /\b(anker|baseus|ugreen)\b/i,
  /\b(jisulife|handheld\s*fan)\b/i,
  /\b(ps5|playstation|xbox|osmo|gopro|insta360)\b/i,
  /\b(cudy|tp-link|archer|deco)\b/i
];

function buildFeaturedShelves(shelves: BrowseShelf[]): { popular: BrowseShelf; trending: BrowseShelf; ordered: BrowseShelf[] } {
  const rankOf = (id: string): number => {
    const idx = SHELF_ORDER.indexOf(id);
    return idx >= 0 ? idx : SHELF_ORDER.length;
  };
  const ordered = [...shelves].sort((a, b) => rankOf(a.id) - rankOf(b.id));

  /* Popular across shops: round-robin the most widely stocked pictured products across categories
     so the top row mixes phones, laptops, audio, watches, PC gear and chargers. */
  const byCategory = ordered.map(shelf =>
    [...shelf.cards].sort((a, b) => Number(Boolean(b.image)) - Number(Boolean(a.image)) || b.shops - a.shops || b.versions - a.versions)
  );
  const popularCards: BrowseCard[] = [];
  const seenPopular = new Set<string>();
  const maxDepth = Math.max(0, ...byCategory.map(list => list.length));
  for (let i = 0; i < maxDepth && popularCards.length < 40; i++) {
    for (const list of byCategory) {
      const candidate = list[i];
      if (!candidate || seenPopular.has(candidate.name)) continue;
      if (popularCards.length < 15 && !candidate.image) continue;
      seenPopular.add(candidate.name);
      popularCards.push(candidate);
      if (popularCards.length >= 40) break;
    }
  }
  popularCards.sort((a, b) => b.shops - a.shops || Number(Boolean(b.image)) - Number(Boolean(a.image)));

  /* Trending searches: pick top-compared products from each high-demand line in turn. */
  const allCards = ordered.flatMap(shelf => shelf.cards)
    .sort((a, b) => Number(Boolean(b.image)) - Number(Boolean(a.image)) || b.shops - a.shops || b.versions - a.versions);
  const lineBuckets = TRENDING_LINES.map(pattern => allCards.filter(item => pattern.test(item.name)));
  const trendingCards: BrowseCard[] = [];
  const seenTrending = new Set<string>();
  const maxBucket = Math.max(0, ...lineBuckets.map(bucket => bucket.length));
  for (let i = 0; i < maxBucket && trendingCards.length < 40; i++) {
    for (const bucket of lineBuckets) {
      const candidate = bucket[i];
      if (!candidate || seenTrending.has(candidate.name)) continue;
      seenTrending.add(candidate.name);
      trendingCards.push(candidate);
      if (trendingCards.length >= 40) break;
    }
  }

  return {
    popular: { id: 'popular', label: 'Popular across shops', cards: popularCards },
    trending: { id: 'trending', label: 'Trending searches', cards: trendingCards },
    ordered
  };
}

function card(item: BrowseCard, shelf: string): string {
  const photo = item.image ? safeHttpUrl(item.image) : null;
  const badge = shelf === 'popular'
    ? `<span class="pc-badge">Popular · ${item.shops} shops</span>`
    : shelf === 'trending'
      ? '<span class="pc-badge trending">Trending</span>'
      : '';
  return `<button class="pcard" data-act="query" data-q="${escapeHtml(item.name)}" title="${escapeHtml(`Compare ${item.name} across ${item.shops} shops`)}">
    <span class="pc-img">${badge}${icon(shelf, 40)}${photo
      ? `<img src="${escapeHtml(photo)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}</span>
    <span class="pc-body">
      <span class="pc-name">${escapeHtml(item.name)}</span>
      ${priceTag(item.from, 'from')}
      <span class="pc-meta">${pluralCount(item.shops, 'shop')}${item.versions > 1 ? `, ${pluralCount(item.versions, 'version')}` : ''}</span>
      <span class="pc-shop"><img src="${escapeHtml(shopLogo(item.shop))}" alt="" loading="lazy" onerror="this.remove()">Lowest at ${escapeHtml(item.shop.replace(/^www\./, ''))}</span>
    </span>
  </button>`;
}

function shelfRow(shelf: BrowseShelf): string {
  const shown = shelf.cards.slice(0, 10);
  const sub = shelf.id === 'popular'
    ? '<span class="shelf-sub">Stocked by the most Bangladeshi shops</span>'
    : shelf.id === 'trending'
      ? '<span class="shelf-sub">Most searched phones, laptops &amp; gadgets</span>'
      : '';
  return `<section class="shelf" aria-labelledby="shelf-${escapeHtml(shelf.id)}">
    <div class="shelf-head">
      <div><h2 id="shelf-${escapeHtml(shelf.id)}">${escapeHtml(shelf.label)}</h2>${sub}</div>
      ${shelf.cards.length > shown.length
        ? `<button class="link" data-act="shelf" data-id="${escapeHtml(shelf.id)}">See all ${shelf.cards.length} →</button>` : ''}
    </div>
    <div class="cards row">${shown.map(item => card(item, shelf.id)).join('')}</div>
  </section>`;
}

/** The Shops tab: the shops whose prices are in the list, and how many each has. */
export function shopsView(data: BrowseData): string {
  return `<div class="lead"><h2>The ${data.shops.length} shops we read prices from</h2>
    <p>Prices are read from each shop's own product pages twice a day, and the most popular products about every hour. We don't rate shops: check the shop's own site for its warranty and return terms before you pay.</p></div>
    ${shopStrip(data)}`;
}

function shopStrip(data: BrowseData): string {
  return `<section class="shop-strip" aria-labelledby="shop-strip-h">
    <h2 id="shop-strip-h">Prices read from these shops</h2>
    <p>${data.prices.toLocaleString('en-US')} prices, each read from the shop's own page and refreshed at least twice a day.</p>
    <div class="shop-tiles">${data.shops.map(({ shop, prices }) => {
      const host = shop.replace(/^www\./, '');
      return `<a class="shop-tile" href="https://${escapeHtml(host)}" target="_blank" rel="noopener noreferrer nofollow">
        <span class="mono md"><img src="${escapeHtml(shopLogo(host))}" alt="" onerror="this.remove()">${escapeHtml(host.slice(0, 2).toUpperCase())}</span>
        <span><b>${escapeHtml(host)}</b><span class="num">${prices.toLocaleString('en-US')} prices</span></span>
      </a>`;
    }).join('')}</div>
  </section>`;
}

export function browseView(ctx: RenderContext, data: BrowseData): string {
  const { shelf } = ctx.state;
  const { popular, trending, ordered } = buildFeaturedShelves(data.shelves);
  const featured = [popular, trending].filter(item => item.cards.length > 0);
  const allShelves = [...featured, ...ordered];
  const chosen = allShelves.find(item => item.id === shelf);
  const total = data.shelves.reduce((sum, item) => sum + item.cards.length, 0);
  const tabs = [
    { id: '', label: 'All', count: total },
    ...allShelves.map(item => ({ id: item.id, label: item.label, count: item.cards.length }))
  ];

  return `<div class="cat-tabs" role="tablist" aria-label="Categories">${tabs.map(tab =>
      `<button role="tab" class="cat-tab" data-act="shelf" data-id="${escapeHtml(tab.id)}" aria-selected="${tab.id === (chosen?.id ?? '')}">
        ${icon(tab.id || 'all', 22)}<span>${escapeHtml(tab.label)}</span><span class="n num">${tab.count}</span></button>`).join('')}</div>

    ${chosen
      ? `<section class="shelf"><div class="shelf-head"><h2>${escapeHtml(chosen.label)}</h2>
          <button class="link" data-act="shelf" data-id="">All categories</button></div>
          <div class="cards grid-cards">${chosen.cards.slice(0, ctx.state.shelfLimit).map(item => card(item, chosen.id)).join('')}</div>
          ${chosen.cards.length > ctx.state.shelfLimit
            ? `<button class="more more-all" data-act="moreCards">Show more (${chosen.cards.length - ctx.state.shelfLimit} left)</button>` : ''}</section>`
      : allShelves.map(shelfRow).join('')}

    ${shopStrip(data)}
    <p class="fine-print">Each card's price is the lowest for any version; open it to compare the same version across shops. Lowest found ${money(Math.min(...data.shelves.flatMap(item => item.cards.map(c => c.from))))} across ${pluralCount(total, 'product')}.</p>`;
}
