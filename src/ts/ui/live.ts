/* Live results. Every title, shop name and link here comes from the open web, so all of it
   goes through escapeHtml or safeHttpUrl. Trust stays "Not rated": no shop's details have
   been verified, and a real price must not sit beside an invented score. */

import { escapeHtml, money, pluralCount } from '../core/format.js';
import { safeHttpUrl } from '../core/live.js';
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

/* Two letters stand in for a logo, since live shops come from the open web. */
const initials = (shop: string): string => shop.replace(/^www\./, '').slice(0, 2).toUpperCase();

function liveRow(offer: LiveOffer, group: LiveGroup, checkedAt: string): string {
  const isLowest = group.lowest === offer.url;
  const href = safeHttpUrl(offer.url);
  return `<div class="offer live ${isLowest ? 'pick' : ''}">
    <div class="seller">
      <span class="mono" aria-hidden="true">${escapeHtml(initials(offer.shop))}</span>
      <span class="t">
        <div class="store-name">${escapeHtml(offer.shop)}</div>
        <div class="sub">${escapeHtml(offer.title)}</div>
      </span>
    </div>
    <div class="price">
      <div class="p-line">${isLowest ? priceTag(offer.price) : `<b class="num">${money(offer.price)}</b>`}</div>
      ${isLowest ? '<span class="save">Lowest for this version</span>' : ''}
    </div>
    <div class="meta">${stockTag(offer)}<span class="tag">Checked ${escapeHtml(clock(offer.checkedAt ?? checkedAt))}</span><span class="tag live-trust">Shop not rated yet</span></div>
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

export function liveView(live: LiveState): string {
  if (live.status === 'loading') {
    return `<div class="lead loading" role="status"><h2>Checking prices for “${escapeHtml(live.query)}”</h2>
      <p>Searching the web and reading each shop's own page. A new search can take a minute or more. Popular searches are usually instant.</p>
      <div class="progress" aria-hidden="true"><i></i></div></div>`;
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
  const corrected = live.typed
    ? `<div class="note" role="status">Showing results for <b>“${escapeHtml(result.query)}”</b>. You typed “${escapeHtml(live.typed)}”.</div>`
    : '';
  const status = live.pending
    ? '<div class="note" role="status">Checking more shops on the web. This can take a minute, and their prices will be added here.</div>'
    : live.note ? `<div class="note" role="status">${escapeHtml(live.note)}</div>` : '';
  const when = fromList
    ? 'Read from each shop\'s own page; each price shows when.'
    : `Read from each shop's own page, ${escapeHtml(clock(result.checkedAt))}.`;

  if (!result.groups.length) {
    return `${corrected}<div class="empty"><h3>No clear prices found for “${escapeHtml(result.query)}”</h3>
      <p>${escapeHtml(summary)} Try the full product name, such as “iPhone 15” or “HP 250 G9”.</p></div>`;
  }

  return `<div class="lead"><h2>Live prices for “${escapeHtml(result.query)}”</h2>
      <p>${when} Only the same version is compared. Prices can change, so confirm on the shop's site before you pay.</p></div>
    ${corrected}${status}
    <div class="note">${escapeHtml(summary)}</div>
    ${result.groups.map(group => liveGroup(group, result.checkedAt, result.query)).join('')}`;
}

export function liveUnavailableNote(): string {
  return '<div class="note">Live prices are not available on this server, so these are <b>sample prices</b>.</div>';
}
