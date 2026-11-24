/* Live results. Every title, shop name and link here comes from the open web, so all of it
   goes through escapeHtml or safeHttpUrl. Trust stays "Not rated": no shop's details have
   been verified, and a real price must not sit beside an invented score. */

import { escapeHtml, money, pluralCount } from '../core/format.js';
import { shopLogo } from '../core/links.js';
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
  const href = safeHttpUrl(offer.url);
  return `<div class="offer live ${isLowest ? 'pick' : ''}">
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
          title="${escapeHtml(`Open ${offer.title} on ${offer.shop}`)}">Visit shop ${OUT_ICON}</a>`
      : ''}</div>
  </div>`;
}

function liveGroup(group: LiveGroup, checkedAt: string, query: string): string {
  const note = group.comparable
    ? `${pluralCount(group.offers.length, 'shop')} selling this version of “${query}”`
    : 'Not compared, because these pages do not say which version they sell';
  const choice = group.comparable && group.offers.length > 1;
  const pictured = group.offers.map(offer => offer.image && safeHttpUrl(offer.image)).find(Boolean);
  return `<section class="group${group.comparable ? '' : ' unclear'}">
    <div class="group-head">
      ${pictured ? `<span class="gh-img"><img src="${escapeHtml(pictured)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.remove()"></span>` : ''}
      <div class="gh-main">
        <div class="gh-kicker"><span class="pill live">Live</span></div>
        <h3>${escapeHtml(group.label)}<span class="sub">${escapeHtml(note)}</span></h3>
      </div>
      ${choice ? `<div class="gh-price">${priceTag(group.offers[0].price, 'from')}
        <div class="range">up to <span class="num">${money(group.offers[group.offers.length - 1].price)}</span></div></div>` : ''}
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
interface ResultCard { key: string; title: string; image: string | null; from: number; to: number; shops: string[]; inStock: number; checkedAt: string }

const keyOf = (offer: LiveOffer): string => offer.product || offer.title.toLowerCase();

function resultCards(result: LiveResult): ResultCard[] {
  const cards = new Map<string, ResultCard & { pricedFrom: LiveOffer }>();
  for (const offer of result.groups.flatMap(group => group.offers)) {
    const key = keyOf(offer);
    const card = cards.get(key);
    const photo = offer.image ? safeHttpUrl(offer.image) : null;
    const checkedAt = offer.checkedAt ?? result.checkedAt;
    if (!card) {
      cards.set(key, { key, title: offer.title, image: photo, from: offer.price, to: offer.price, shops: [offer.shop], inStock: offer.inStock === false ? 0 : 1, pricedFrom: offer, checkedAt });
      continue;
    }
    if (offer.price < card.from) { card.from = offer.price; card.title = offer.title; }
    if (checkedAt > card.checkedAt) card.checkedAt = checkedAt;
    card.to = Math.max(card.to, offer.price);
    card.image ??= photo;
    if (!card.shops.includes(offer.shop)) card.shops.push(offer.shop);
    if (offer.inStock !== false) card.inStock++;
  }
  /* Sold by the most shops first: those are the real comparisons. Then cheapest first. */
  return [...cards.values()].sort((a, b) => b.shops.length - a.shops.length || a.from - b.from);
}

/* The shop's logo over its initials, which show through if the logo can't load. */
const favicon = (shop: string): string =>
  `<span class="dot" title="${escapeHtml(shop)}"><img src="${escapeHtml(shopLogo(shop))}" alt="" loading="lazy" onerror="this.remove()">${escapeHtml(initials(shop))}</span>`;

/* Shown until the shop's own photo loads, and instead of it when there is none yet. */
const NO_PHOTO = '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 8h14l-1.2 11.2a1.5 1.5 0 0 1-1.5 1.3H7.7a1.5 1.5 0 0 1-1.5-1.3z"/><path d="M9 10V6.5a3 3 0 0 1 6 0V10"/></svg>';

function resultCard(card: ResultCard): string {
  const many = card.shops.length > 1;
  return `<button class="pcard rcard" data-act="product" data-id="${escapeHtml(card.key)}" title="${escapeHtml(`Compare ${card.title}`)}">
    <span class="pc-img">${NO_PHOTO}${card.image
      ? `<img src="${escapeHtml(card.image)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}</span>
    <span class="pc-body">
      <span class="pc-name">${escapeHtml(card.title)}</span>
      ${priceTag(card.from, many || card.to > card.from ? 'from' : '')}
      <span class="pc-shops">${card.shops.slice(0, 4).map(favicon).join('')}${card.shops.length > 4 ? `<span class="dot more">+${card.shops.length - 4}</span>` : ''}
        <span class="pc-meta">${many ? `Compare ${card.shops.length} shops` : '1 shop'}</span></span>
      <span class="pc-fresh${Date.now() - Date.parse(card.checkedAt) < 60 * 60 * 1000 ? ' live' : ''}">Price checked ${escapeHtml(ago(card.checkedAt))}</span>
    </span>
  </button>`;
}

function summaryStrip(cards: ResultCard[]): string {
  const shops = new Set(cards.flatMap(card => card.shops)).size;
  const low = Math.min(...cards.map(card => card.from));
  const high = Math.max(...cards.map(card => card.to));
  return `<dl class="summary">
    <div><dt>Products</dt><dd class="num">${cards.length}</dd></div>
    <div><dt>Shops</dt><dd class="num">${shops}</dd></div>
    <div><dt>Lowest price</dt><dd class="num">${money(low)}</dd></div>
    <div><dt>Highest price</dt><dd class="num">${money(high)}</dd></div>
  </dl>`;
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
  return `${many ? `<button class="link back" data-act="allResults">All results for “${escapeHtml(result.query)}”</button>` : ''}
    <div class="detail-head">
      ${card.image ? `<span class="gh-img big"><img src="${escapeHtml(card.image)}" alt="" referrerpolicy="no-referrer" onerror="this.parentElement.remove()"></span>` : ''}
      <div><h2>${escapeHtml(card.title)}</h2>
        <p>${card.shops.length > 1 ? `${pluralCount(card.shops.length, 'shop')}, ` : '1 shop, '}${card.to > card.from ? `${money(card.from)} to ${money(card.to)}` : money(card.from)}</p></div>
    </div>
    <p class="fine-print">Only the same version is compared. Prices can change, so confirm on the shop's site before you pay.</p>
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
  return '<div class="note">Live prices are not available on this server, so these are <b>sample prices</b>.</div>';
}
