/* The Build tab: the products a shopper added, and what they cost in all, each from its cheapest
   shop or everything from one shop. Names, shops and links come from shops' pages, so all of it
   goes through escapeHtml or safeHttpUrl. */

import { basketItems, basketPrices, planBasket, type BasketItem, type BasketOffer, type BasketPlan } from '../core/basket.js';
import { escapeHtml, money, pluralCount } from '../core/format.js';
import { shopLogo } from '../core/links.js';
import { safeHttpUrl } from '../core/live.js';
import { OUT_ICON } from './fragments.js';

const shopName = (shop: string): string => shop.replace(/^www\./, '');

function visit(offer: BasketOffer): string {
  const href = safeHttpUrl(offer.url);
  return href
    ? `<a class="shop-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer nofollow"
        title="${escapeHtml(`Open ${offer.title} on ${offer.shop}`)}">${escapeHtml(shopName(offer.shop))} ${OUT_ICON}</a>`
    : escapeHtml(shopName(offer.shop));
}

function itemRow(item: BasketItem, plan: BasketPlan): string {
  const photo = item.image ? safeHttpUrl(item.image) : null;
  const status = basketPrices(item.key);
  const pick = plan.mix.picks.get(item.key);
  const price = status?.status === 'loading' || !status
    ? '<span class="bk-wait">Checking prices…</span>'
    : pick
      ? `<b class="num">${money(pick.price)}</b><span class="bk-at">at ${visit(pick)}</span>`
      : status.status === 'unknown'
        ? '<span class="tag">No current price</span>'
        : '<span class="tag warn">Out of stock everywhere</span>';
  return `<li class="bk-item">
    <span class="bk-img">${photo ? `<img src="${escapeHtml(photo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}</span>
    <span class="bk-main">
      <button class="link bk-name" data-act="openBuild" data-id="${escapeHtml(item.key)}">${escapeHtml(item.title)}</button>
      ${item.version ? `<span class="bk-version">${escapeHtml(item.version)}</span>` : ''}
      <span class="bk-price">${price}</span>
    </span>
    <button class="chip bk-remove" data-act="buildRemove" data-id="${escapeHtml(item.key)}" aria-label="${escapeHtml(`Remove ${item.title}`)}">Remove</button>
  </li>`;
}

function shopRows(plan: BasketPlan, count: number): string {
  const rows = plan.shops.slice(0, 6).map(shop => `<tr>
      <td><span class="bk-shop"><img src="${escapeHtml(shopLogo(shop.shop))}" alt="" loading="lazy" onerror="this.remove()">${escapeHtml(shopName(shop.shop))}</span></td>
      <td>${shop.picks.size} of ${count}</td>
      <td class="num">${money(shop.total)}</td>
    </tr>`).join('');
  return `<table class="bk-table"><caption>Shops with the most of your build in stock</caption>
    <thead><tr><th scope="col">Shop</th><th scope="col">Has</th><th scope="col">Total for those</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
}

export function basketView(): string {
  const items = basketItems();
  if (!items.length) {
    return `<div class="lead"><h2>Your build</h2>
      <p>Add the parts of a PC, or any products you want together, and see what they cost in all: each from its cheapest shop, or everything from one shop.</p></div>
      <div class="empty"><h3>Nothing in your build yet</h3>
      <p>Search for a product, open it, and press <b>Add to build</b>.</p>
      <button class="chip" data-act="focusSearch">Search for a product</button></div>`;
  }
  const offers = new Map(items.map(item => {
    const status = basketPrices(item.key);
    return [item.key, status?.status === 'done' ? status.offers : []];
  }));
  const plan = planBasket(items.map(item => item.key), offers);
  const loading = items.some(item => !basketPrices(item.key) || basketPrices(item.key)?.status === 'loading');
  const priced = items.length - plan.missing.length;
  const saving = plan.oneShop ? plan.oneShop.total - plan.mix.total : 0;
  const best = plan.shops[0];

  const summary = priced ? `<dl class="summary bk-summary">
      <div><dt>Cheapest mix</dt><dd class="num">${money(plan.mix.total)}</dd>
        <p class="bk-sub">${pluralCount(priced, 'product')} from ${pluralCount(plan.mix.shops, 'shop')}</p></div>
      <div><dt>From one shop</dt>${plan.oneShop
        ? `<dd class="num">${money(plan.oneShop.total)}</dd><p class="bk-sub">at ${escapeHtml(shopName(plan.oneShop.shop))}${saving > 0 ? `, ${money(saving)} more than the mix` : ', the same as the mix'}</p>`
        : `<dd>None</dd><p class="bk-sub">No shop has all ${items.length} in stock${best ? `; ${escapeHtml(shopName(best.shop))} has ${best.picks.size}` : ''}</p>`}</div>
    </dl>` : '';

  return `<div class="lead"><h2>Your build</h2>
      <p>${pluralCount(items.length, 'product')}, priced from our latest check of each shop's page. Buying from one shop can mean one delivery and one warranty desk.</p></div>
    ${loading ? '<p class="checking" role="status"><i aria-hidden="true"></i>Checking prices…</p>' : ''}
    ${summary}
    <ul class="bk-list">${items.map(item => itemRow(item, plan)).join('')}</ul>
    ${plan.missing.length && !loading ? `<p class="fine-print">${pluralCount(plan.missing.length, 'product')} without a current in-stock price ${plan.missing.length === 1 ? 'is' : 'are'} left out of the totals.</p>` : ''}
    ${plan.shops.length > 1 ? shopRows(plan, items.length) : ''}
    <p class="fine-print">Totals leave out delivery. Prices can change, so confirm on each shop's site before you pay.
      <button class="link" data-act="buildClear">Empty the build</button></p>`;
}
