/* Live results. Every title, shop name and link here comes from the open web, so all of it
   goes through escapeHtml or safeHttpUrl. Trust stays "Not rated": no shop's details have
   been verified, and a real price must not sit beside an invented score. */

import { escapeHtml, money, pluralCount } from '../core/format.js';
import { safeHttpUrl } from '../core/live.js';
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

function liveRow(offer: LiveOffer, group: LiveGroup, checkedAt: string): string {
  const isLowest = group.lowest === offer.url;
  const href = safeHttpUrl(offer.url);
  const initial = escapeHtml(offer.shop.slice(0, 2).toUpperCase());
  return `<div class="offer ${isLowest ? 'pick' : ''}">
    <div class="seller">
      <span class="mono" aria-hidden="true">${initial}</span>
      <span class="t">
        <div class="store-name">${escapeHtml(offer.shop)}</div>
        <div class="sub">${escapeHtml(offer.title)}</div>
      </span>
    </div>
    <div class="price">
      <b class="num">${money(offer.price)}</b>
      ${isLowest ? '<span class="save num">Lowest for this version</span>' : ''}
    </div>
    <div class="trust"><div class="meter"><div class="cap"><span class="live-trust">Trust not rated</span></div></div></div>
    <div class="meta">${stockTag(offer)}<span class="tag">Checked ${escapeHtml(clock(checkedAt))}</span></div>
    <div class="acts">${href
      ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer nofollow"
          title="${escapeHtml(`Open ${offer.title} on ${offer.shop}`)}">Open shop page ↗</a>`
      : ''}</div>
  </div>`;
}

function liveGroup(group: LiveGroup, checkedAt: string): string {
  const note = group.comparable
    ? pluralCount(group.offers.length, 'shop')
    : 'Not compared, because these pages do not say which version they sell';
  return `<section class="group">
    <div class="group-head">
      <div class="gh-main">
        <div class="gh-kicker"><span class="pill best">Live</span></div>
        <h3>${escapeHtml(group.label)}<span class="sub">${escapeHtml(note)}</span></h3>
      </div>
      <div class="gh-price">
        <div class="from num">${money(group.offers[0].price)}</div>
        <div class="range num">from</div>
      </div>
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
    return `<div class="lead" role="status"><h2>Checking live prices for “${escapeHtml(live.query)}”…</h2>
      <p>Searching the web and reading each shop's own page. A new search can take a minute or more. Popular searches are usually instant.</p></div>`;
  }
  if (live.status === 'error') {
    return `<div class="empty" role="alert"><h3>Live prices are not available</h3>
      <p>${escapeHtml(live.message)}</p>
      <button class="chip" data-act="retryLive">Try again</button></div>`;
  }
  if (live.status !== 'done') return '';

  const { result } = live;
  const summary = `The web search returned ${pluralCount(result.found, 'result')}, and ${pluralCount(result.priced, 'price')} could be read from shop pages.${leftOut(result)}`;

  if (!result.groups.length) {
    return `<div class="empty"><h3>No clear prices found for “${escapeHtml(result.query)}”</h3>
      <p>${escapeHtml(summary)} Try the full product name, such as “iPhone 15” or “HP 250 G9”.</p></div>`;
  }

  return `<div class="lead"><h2>Live prices for “${escapeHtml(result.query)}”</h2>
      <p>Read from each shop's own page, ${escapeHtml(clock(result.checkedAt))}. Only the same version is compared. Prices can change, so confirm on the shop's site before you pay.</p></div>
    <div class="note">${escapeHtml(summary)}</div>
    ${result.groups.map(group => liveGroup(group, result.checkedAt)).join('')}`;
}

export function liveUnavailableNote(): string {
  return '<div class="note">Live prices are not available on this server, so these are <b>sample prices</b>.</div>';
}
