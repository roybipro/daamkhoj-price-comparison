/* Live results. Every title, shop name and link here comes from the open web, so all of it
   goes through escapeHtml or safeHttpUrl. Trust stays "Not rated": no shop's details have
   been verified, and a real price must not sit beside an invented score. */

import { escapeHtml, money, pluralCount } from '../core/format.js';
import { shopLogo } from '../core/links.js';
import { historyFor, type PriceHistory } from '../core/history.js';
import { ago, safeHttpUrl } from '../core/live.js';
import { OUT_ICON, priceTag } from './fragments.js';
import type { LiveGroup, LiveOffer, LiveResult, LiveState } from '../types.js';

const clock = (iso: string): string => {
  const time = new Date(iso);
  return Number.isNaN(time.getTime())
    ? ''
    : time.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

function stockTag(offer: LiveOffer): string {
  if (offer.inStock === true) return '<span class="tag ok">In stock</span>';
  if (offer.inStock === false) return '<span class="tag warn">Out of stock</span>';
  return '<span class="tag">Stock not stated</span>';
}

/* "Checked 5 min ago", green while it is under an hour old; the exact time on hover. */
function checkedTag(iso: string): string {
  const fresh = Date.now() - Date.parse(iso) < 60 * 60 * 1000;
  return `<span class="tag${fresh ? ' ok' : ''}" title="${escapeHtml(clock(iso))}">Checked ${escapeHtml(ago(iso))}</span>`;
}

/* Two letters stand in for a logo, since live shops come from the open web. */
const initials = (shop: string): string => shop.replace(/^www\./, '').slice(0, 2).toUpperCase();

function liveRow(offer: LiveOffer, group: LiveGroup, checkedAt: string): string {
  const isLowest = group.lowest === offer.url;
  const isOut = offer.inStock === false;
  const href = safeHttpUrl(offer.url);
  return `<div class="offer live${isLowest ? ' pick' : ''}${isOut ? ' out' : ''}">
    <div class="seller">
      <span class="mono" aria-hidden="true"><img src="${escapeHtml(shopLogo(offer.shop))}" alt="" loading="lazy" onerror="this.remove()">${escapeHtml(initials(offer.shop))}</span>
      <span class="t">
        <div class="store-name">${escapeHtml(offer.shop)}</div>
        <div class="sub">${escapeHtml(offer.title)}</div>
      </span>
    </div>
    <div class="price">
      <div class="p-line">${isLowest ? priceTag(offer.price) : `<b class="num">${money(offer.price)}</b>`}</div>
      ${isLowest ? '<span class="save">Lowest for this version</span>' : ''}
    </div>
    <div class="meta">${stockTag(offer)}${checkedTag(offer.checkedAt ?? checkedAt)}<span class="tag live-trust">Shop not rated yet</span></div>
    <div class="acts">${href
      ? `<a class="shop-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer nofollow"
          aria-label="${escapeHtml(`Visit shop: ${offer.title} on ${offer.shop}`)}"
          title="${escapeHtml(`Open ${offer.title} on ${offer.shop}`)}">Visit shop ${OUT_ICON}</a>`
      : ''}</div>
  </div>`;
}

function liveGroup(group: LiveGroup, checkedAt: string, query: string): string {
  const buyable = group.offers.filter(offer => offer.inStock !== false);
  const allOut = buyable.length === 0;
  const note = group.comparable
    ? `${pluralCount(group.offers.length, 'shop')} selling this version of “${query}”`
    : 'Not compared, because these pages do not say which version they sell';
  const choice = group.comparable && group.offers.length > 1;
  const startOffer = buyable[0] ?? group.offers[0];
  const endOffer = buyable[buyable.length - 1] ?? group.offers[group.offers.length - 1];
  const pictured = [...buyable, ...group.offers].map(offer => offer.image && safeHttpUrl(offer.image)).find(Boolean);
  return `<section class="group${group.comparable ? '' : ' unclear'}">
    <div class="group-head">
      ${pictured ? `<span class="gh-img"><img src="${escapeHtml(pictured)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.remove()"></span>` : ''}
      <div class="gh-main">
        <div class="gh-kicker"><span class="pill live">Live</span>${allOut ? '<span class="tag warn">Out of stock</span>' : ''}</div>
        <h3>${escapeHtml(group.label)}<span class="sub">${escapeHtml(note)}</span></h3>
      </div>
      ${choice ? `<div class="gh-price">${priceTag(startOffer.price, 'from')}
        ${endOffer.price > startOffer.price ? `<div class="range">up to <span class="num">${money(endOffer.price)}</span></div>` : ''}</div>` : ''}
    </div>
    <div class="offers">${group.offers.map(offer => liveRow(offer, group, checkedAt)).join('')}</div>
  </section>`;
}

function leftOut(result: LiveResult): string {
  const { notShop, blocked, noPrice, otherProduct, failed } = result.skipped;
  const parts = [
    otherProduct && `${otherProduct} for a different product`,
    noPrice && `${noPrice} with no clear taka price`,
    notShop && `${notShop} not shop pages`,
    blocked && `${blocked} that ask not to be read automatically`,
    failed && `${failed} that did not load`
  ].filter(Boolean);
  return parts.length ? ` Left out: ${parts.join(', ')}.` : '';
}

/** One search result card: a product, the shops selling it, and where its price starts. */
interface ResultCard {
  key: string;
  title: string;
  image: string | null;
  from: number;
  to: number;
  shops: string[];
  buyableShops: number;
  confirmedInStock: number;
  outOfStock: boolean;
  checkedAt: string;
}

const keyOf = (offer: LiveOffer): string => offer.product || offer.title.toLowerCase();

function resultCards(result: LiveResult): ResultCard[] {
  const buckets = new Map<string, LiveOffer[]>();
  for (const offer of result.groups.flatMap(group => group.offers)) {
    const key = keyOf(offer);
    const list = buckets.get(key);
    if (list) list.push(offer);
    else buckets.set(key, [offer]);
  }
  const cards: ResultCard[] = [];
  for (const [key, offers] of buckets) {
    const buyable = offers.filter(offer => offer.inStock !== false);
    const basis = buyable.length ? buyable : offers;
    const cheapest = basis.reduce((low, offer) => (offer.price < low.price ? offer : low));
    const highest = basis.reduce((high, offer) => (offer.price > high.price ? offer : high));
    const shops = [...new Set(offers.map(offer => offer.shop))];
    const buyableShops = new Set(buyable.map(offer => offer.shop)).size;
    const confirmedInStock = new Set(offers.filter(offer => offer.inStock === true).map(offer => offer.shop)).size;
    const photo = [cheapest, ...buyable, ...offers].map(offer => (offer.image ? safeHttpUrl(offer.image) : null)).find(Boolean) ?? null;
    const checkedAt = offers.reduce((latest, offer) => {
      const time = offer.checkedAt ?? result.checkedAt;
      return time > latest ? time : latest;
    }, '');
    cards.push({
      key,
      title: cheapest.title,
      image: photo,
      from: cheapest.price,
      to: highest.price,
      shops,
      buyableShops,
      confirmedInStock,
      outOfStock: buyable.length === 0,
      checkedAt
    });
  }
  /* Available products first, then sold by the most buyable shops, then cheapest first. */
  return cards.sort((a, b) =>
    Number(a.outOfStock) - Number(b.outOfStock) ||
    b.buyableShops - a.buyableShops ||
    b.shops.length - a.shops.length ||
    a.from - b.from
  );
}

/* The shop's logo over its initials, which show through if the logo can't load. */
const favicon = (shop: string): string =>
  `<span class="dot" title="${escapeHtml(shop)}"><img src="${escapeHtml(shopLogo(shop))}" alt="" loading="lazy" onerror="this.remove()">${escapeHtml(initials(shop))}</span>`;

/* Shown until the shop's own photo loads, and instead of it when there is none yet. */
const NO_PHOTO = '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 8h14l-1.2 11.2a1.5 1.5 0 0 1-1.5 1.3H7.7a1.5 1.5 0 0 1-1.5-1.3z"/><path d="M9 10V6.5a3 3 0 0 1 6 0V10"/></svg>';

function resultCard(card: ResultCard): string {
  const many = card.shops.length > 1;
  const stockLine = card.outOfStock
    ? '<span class="tag warn">Out of stock</span>'
    : card.confirmedInStock > 0
      ? `<span class="pc-stock ok">In stock${card.confirmedInStock > 1 ? ` · ${card.confirmedInStock} shops` : ''}</span>`
      : '';
  return `<button class="pcard rcard${card.outOfStock ? ' out' : ''}" data-act="product" data-id="${escapeHtml(card.key)}" title="${escapeHtml(`Compare ${card.title}`)}">
    <span class="pc-img">${card.outOfStock ? '<span class="pc-badge out">Out of stock</span>' : ''}${NO_PHOTO}${card.image
      ? `<img src="${escapeHtml(card.image)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}</span>
    <span class="pc-body">
      <span class="pc-name">${escapeHtml(card.title)}</span>
      ${priceTag(card.from, many || card.to > card.from ? 'from' : '')}
      ${stockLine}
      <span class="pc-shops">${card.shops.slice(0, 4).map(favicon).join('')}${card.shops.length > 4 ? `<span class="dot more">+${card.shops.length - 4}</span>` : ''}
        <span class="pc-meta">${many ? `Compare ${card.shops.length} shops` : '1 shop'}</span></span>
      <span class="pc-fresh${Date.now() - Date.parse(card.checkedAt) < 60 * 60 * 1000 ? ' live' : ''}">Price checked ${escapeHtml(ago(card.checkedAt))}</span>
    </span>
  </button>`;
}

function summaryStrip(cards: ResultCard[]): string {
  const buyableCards = cards.filter(card => !card.outOfStock);
  const pricedCards = buyableCards.length ? buyableCards : cards;
  const shops = new Set(cards.flatMap(card => card.shops)).size;
  const low = Math.min(...pricedCards.map(card => card.from));
  const high = Math.max(...pricedCards.map(card => card.to));
  return `<dl class="summary">
    <div><dt>Products</dt><dd class="num">${cards.length}</dd></div>
    <div><dt>Shops</dt><dd class="num">${shops}</dd></div>
    <div><dt>Lowest price</dt><dd class="num">${money(low)}</dd></div>
    <div><dt>Highest price</dt><dd class="num">${money(high)}</dd></div>
  </dl>`;
}

/* "23 Nov" for a Bangladesh date; the date is already local, so it is read as UTC. */
const dayLabel = (day: string): string =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

const CHART = { width: 640, height: 140, left: 6, right: 6, top: 12, bottom: 22 };

/* A step line of the day's lowest price: a price holds until the day it changes. Days when
   every shop was out of stock leave a gap. */
function historyLine(days: PriceHistory['days']): string {
  const prices = days.map(([, price]) => price).filter((price): price is number => price !== null);
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const pad = (high - low) * 0.12 || Math.max(low * 0.05, 1);
  const bottom = low - pad;
  const span = high + pad - bottom;
  const plotW = CHART.width - CHART.left - CHART.right;
  const plotH = CHART.height - CHART.top - CHART.bottom;
  const x = (index: number): number => CHART.left + (plotW * index) / Math.max(days.length - 1, 1);
  const y = (price: number): number => CHART.top + plotH * (1 - (price - bottom) / span);
  let path = '';
  let previous: number | null = null;
  days.forEach(([, price], index) => {
    if (price === null) { previous = null; return; }
    path += previous === null
      ? `M${x(index).toFixed(1)} ${y(price).toFixed(1)}`
      : `H${x(index).toFixed(1)}V${y(price).toFixed(1)}`;
    previous = price;
  });
  let lastIndex = days.length - 1;
  while (lastIndex > 0 && days[lastIndex][1] === null) lastIndex--;
  const last = days[lastIndex][1] as number;
  const lowIndex = days.findIndex(([, price]) => price === low);
  return `<svg class="ph-chart" viewBox="0 0 ${CHART.width} ${CHART.height}" preserveAspectRatio="none" aria-hidden="true">
      <line class="ph-base" x1="${CHART.left}" x2="${CHART.width - CHART.right}" y1="${y(low).toFixed(1)}" y2="${y(low).toFixed(1)}"/>
      <path class="ph-line" d="${path}" vector-effect="non-scaling-stroke"/>
      ${high > low ? `<circle class="ph-low" cx="${x(lowIndex).toFixed(1)}" cy="${y(low).toFixed(1)}" r="3.5" vector-effect="non-scaling-stroke"/>` : ''}
      <circle class="ph-now" cx="${x(lastIndex).toFixed(1)}" cy="${y(last).toFixed(1)}" r="4" vector-effect="non-scaling-stroke"/>
    </svg>
    <div class="ph-axis"><span>${escapeHtml(dayLabel(days[0][0]))}</span><span>${escapeHtml(dayLabel(days[days.length - 1][0]))}</span></div>`;
}

/** Whether now is a good time to buy, from real prices only: today's lowest against the lowest
    and highest the crawls have seen since tracking began. */
function historyPanel(history: PriceHistory, card: ResultCard): string {
  const { since, lowest, highest } = history;
  if (history.days.length < 2 || !since || !lowest || !highest) return '';
  /* The line ends on the price shown on this page now, which the shops' pages were just re-read
     for, rather than on the last crawl's reading. Today is a Bangladesh date, as the history's are. */
  const today = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const days = history.days.filter(([day]) => day < today);
  days.push([today, card.outOfStock ? null : card.from]);
  /* Only today's price left: nothing to compare it with yet. */
  if (days.length < 2 || !days.some(([day, price]) => day < today && price !== null)) return '';
  const from = dayLabel(since);
  const now = card.from;
  const low = Math.min(lowest.price, now);
  const verdict = card.outOfStock
    ? `<span class="tag warn">Out of stock now</span> Lowest since ${escapeHtml(from)}: <b class="num">${money(lowest.price)}</b>`
    : highest.price === lowest.price && now === lowest.price
      ? `<span class="tag">Unchanged</span> The same price since ${escapeHtml(from)}`
      : now <= lowest.price
        ? `<span class="tag ok">Lowest price</span> The lowest it has been since ${escapeHtml(from)}`
        : `<span class="tag warn">${money(now - lowest.price)} above its lowest</span> It was <b class="num">${money(lowest.price)}</b> on ${escapeHtml(dayLabel(lowest.day))}`;
  const label = `Lowest price each day since ${from}: from ${money(low)} to ${money(Math.max(highest.price, now))}`;
  return `<section class="price-history" aria-label="${escapeHtml(label)}">
      <div class="ph-head"><h3>Price history</h3><p class="ph-verdict">${verdict}</p></div>
      ${historyLine(days)}
      <dl class="ph-stats">
        <div><dt>Lowest</dt><dd class="num">${money(low)}</dd></div>
        <div><dt>Highest</dt><dd class="num">${money(Math.max(highest.price, now))}</dd></div>
        <div><dt>Tracked since</dt><dd>${escapeHtml(from)}</dd></div>
      </dl>
      <p class="ph-note">The lowest price among these shops each day, as our twice-daily price checks read their pages.</p>
    </section>`;
}

/** One product's page: its versions compared across shops, from the same answer. */
function productDetail(result: LiveResult, card: ResultCard, many: boolean): string {
  const groups = result.groups
    .map(group => {
      const offers = group.offers.filter(offer => keyOf(offer) === card.key);
      const buyable = offers.filter(offer => offer.inStock !== false);
      return { ...group, offers, lowest: group.comparable && buyable.length > 1 ? buyable[0].url : null };
    })
    .filter(group => group.offers.length);
  const statusNote = card.outOfStock ? ' · Out of stock at checked shops' : '';
  const urls = [...new Set(groups.flatMap(group => group.offers.map(offer => offer.url)))];
  const history = historyFor(card.key);
  /* app.ts finds this box after rendering and fetches the history once. */
  const historyBox = `<div data-history="${escapeHtml(card.key)}" data-urls="${escapeHtml(JSON.stringify(urls))}">${history ? historyPanel(history, card) : ''}</div>`;
  return `${many ? `<button class="link back" data-act="allResults">All results for “${escapeHtml(result.query)}”</button>` : ''}
    <div class="detail-head">
      ${card.image ? `<span class="gh-img big"><img src="${escapeHtml(card.image)}" alt="" referrerpolicy="no-referrer" onerror="this.parentElement.remove()"></span>` : ''}
      <div><h2>${escapeHtml(card.title)}</h2>
        <p>${card.shops.length > 1 ? `${pluralCount(card.shops.length, 'shop')}, ` : '1 shop, '}${card.to > card.from ? `${money(card.from)} to ${money(card.to)}` : money(card.from)}${escapeHtml(statusNote)}</p></div>
    </div>
    <p class="fine-print">Only the same version is compared. Prices can change, so confirm on the shop's site before you pay.</p>
    ${historyBox}
    ${groups.map(group => liveGroup(group, result.checkedAt, result.query)).join('')}`;
}

export function liveView(live: LiveState, view: { product: string; limit: number } = { product: '', limit: 40 }): string {
  if (live.status === 'loading') {
    return `<div class="lead loading" role="status"><h2>Searching other shops for “${escapeHtml(live.query)}”</h2>
      <p>It isn't in our price list yet, so we're searching the web and reading each shop's own page. This takes about a minute; you can keep browsing meanwhile.</p>
      <div class="progress" aria-hidden="true"><i></i></div>
      <p style="margin-top:14px"><button class="chip" data-act="clearQuery">Cancel</button></p></div>`;
  }
  if (live.status === 'error') {
    return `<div class="empty" role="alert"><h3>Live prices are not available</h3>
      <p>${escapeHtml(live.message)}</p>
      <button class="chip" data-act="retryLive">Try again</button></div>`;
  }
  if (live.status !== 'done') return '';

  const { result } = live;
  const fromList = result.source === 'index';
  const summary = fromList
    ? `${pluralCount(result.priced, 'price')} from our price list of shops' own pages.${leftOut(result)}`
    : `The web search returned ${pluralCount(result.found, 'result')}, and ${pluralCount(result.priced, 'price')} could be read from shop pages${
      result.indexed ? `, including ${result.indexed} from our price list` : ''}.${leftOut(result)}`;
  const typed = live.typed ?? result.correctedFrom;
  const corrected = result.broadenedFrom
    ? `<div class="note" role="status">No exact match for “${escapeHtml(result.broadenedFrom)}” in our price list yet. Showing the closest: <b>“${escapeHtml(result.query)}”</b>.${
      fromList && !live.note ? ' <button class="link" data-act="searchWeb">Search the web for it</button>' : ''}</div>`
    : typed
      ? `<div class="note" role="status">Showing results for <b>“${escapeHtml(result.query)}”</b>. You typed “${escapeHtml(typed)}”.</div>`
      : '';
  const checking = live.checking
    ? '<p class="checking" role="status"><i aria-hidden="true"></i>Checking these prices on the shops\' own sites…</p>'
    : result.rechecked ? `<p class="checking done" role="status">Prices checked on the shops' sites just now.</p>` : '';
  const status = `${checking}${live.pending
    ? '<div class="note" role="status">Checking more shops on the web. Their prices will be added here as they arrive.</div>'
    : live.note ? `<div class="note" role="status">${escapeHtml(live.note)}</div>` : ''}`;

  if (!result.groups.length && fromList && !live.note) {
    return `${corrected}<div class="empty"><h3>Nothing in our price list matches “${escapeHtml(result.query)}” yet</h3>
      <p>Search the web to look for it on other shops' sites. That takes a minute.</p>
      <button class="btn-primary" data-act="searchWeb">Search the web</button></div>`;
  }
  if (!result.groups.length) {
    return `${corrected}${status}<div class="empty"><h3>No clear prices found for “${escapeHtml(result.query)}”</h3>
      <p>${escapeHtml(summary)} Try the full product name, such as “iPhone 15” or “HP 250 G9”.</p></div>`;
  }

  const cards = resultCards(result);
  const open = cards.find(card => card.key === view.product) ?? (cards.length === 1 ? cards[0] : undefined);
  if (open) return `${corrected}${status}${productDetail(result, open, cards.length > 1)}`;

  return `<div class="lead"><h2>Results for “${escapeHtml(result.query)}”</h2>
      <p>Prices read from each shop's own page. Open a product to compare its versions across shops.</p></div>
    ${corrected}${status}
    ${summaryStrip(cards)}
    <div class="cards grid-cards results">${cards.slice(0, view.limit).map(resultCard).join('')}</div>
    ${cards.length > view.limit ? `<button class="more more-all" data-act="moreResults">Show more (${cards.length - view.limit} left)</button>` : ''}
    <p class="fine-print">${escapeHtml(summary)}</p>`;
}

export function liveUnavailableNote(): string {
  return '<div class="note">Prices couldn\'t be loaded. Please try again in a minute.</div>';
}
