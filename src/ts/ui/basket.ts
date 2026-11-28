/* The Build tab: the products a shopper added, and what they cost in all, each from its cheapest
   shop or everything from one shop. Names, shops and links come from shops' pages, so all of it
   goes through escapeHtml or safeHttpUrl. */

import {
  adviceForm, basketItems, basketPrices, currentAdvice, planBasket, type Advice, type BasketItem, type BasketOffer, type BasketPlan
} from '../core/basket.js';
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

const USES: [string, string][] = [['gaming', 'Gaming'], ['editing', 'Video & photo editing'], ['office', 'Office & study']];

/* "Build me a PC": a budget and a use, answered with parts that fit together. */
function advisorForm(): string {
  const state = currentAdvice();
  return `<section class="advisor" aria-labelledby="adv-h">
    <h3 id="adv-h">Build me a PC</h3>
    <p class="adv-sub">Pick a budget and what it's for. We'll choose in-stock parts that fit together (socket, memory type, power) from the shops' own prices.</p>
    <div class="adv-row">
      <label class="adv-field"><span>Budget (৳)</span>
        <input id="adv-budget" type="number" inputmode="numeric" min="25000" max="1500000" step="1000" value="${adviceForm.budget}"></label>
      <label class="adv-field"><span>For</span>
        <select id="adv-use">${USES.map(([value, label]) => `<option value="${value}"${adviceForm.use === value ? ' selected' : ''}>${label}</option>`).join('')}</select></label>
      <button class="btn-primary" data-act="advise"${state.status === 'loading' ? ' disabled' : ''}>${state.status === 'loading' ? 'Choosing parts…' : 'Suggest a build'}</button>
    </div>
    ${state.status === 'error' ? `<p class="note" role="alert">${escapeHtml(state.message)}</p>` : ''}
    ${state.status === 'done' ? advicePreview(state.advice) : ''}
  </section>`;
}

function advicePreview(advice: Advice): string {
  if (!advice.parts.length) return `<p class="note" role="status">${escapeHtml(advice.notes[0] ?? 'No parts in stock fit this budget.')}</p>`;
  const over = advice.total > advice.budget;
  return `<div class="adv-result" role="status">
    <div class="adv-total"><span>Suggested build</span><b class="num${over ? ' over' : ''}">${money(advice.total)}</b>
      <span class="adv-of">of ${money(advice.budget)}</span></div>
    <ul class="adv-parts">${advice.parts.map(part => {
      const href = safeHttpUrl(part.url);
      return `<li><span class="adv-role">${escapeHtml(part.label)}</span>
        <span class="adv-name">${escapeHtml(part.name)}</span>
        <span class="adv-price"><b class="num">${money(part.price)}</b> ${href
          ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer nofollow">${escapeHtml(shopName(part.shop))} ${OUT_ICON}</a>` : escapeHtml(shopName(part.shop))}</span></li>`;
    }).join('')}</ul>
    ${advice.missing.length ? `<p class="fine-print">Nothing in stock fit for: ${escapeHtml(advice.missing.join(', '))}.</p>` : ''}
    <ul class="adv-notes">${advice.notes.map(note => `<li>${escapeHtml(note)}</li>`).join('')}</ul>
    <div class="adv-acts">
      <button class="btn-primary" data-act="useAdvice">${basketItems().length ? 'Use this build (replaces yours)' : 'Use this build'}</button>
      <button class="chip" data-act="dismissAdvice">Close</button>
    </div>
    <p class="fine-print">Chosen by rules from today's prices, not by a person: check each part on the shop's site before you pay.</p>
  </div>`;
}

export function basketView(): string {
  const items = basketItems();
  if (!items.length) {
    return `<div class="lead"><h2>Your build</h2>
      <p>Add the parts of a PC, or any products you want together, and see what they cost in all: each from its cheapest shop, or everything from one shop.</p></div>
      ${advisorForm()}
      <div class="empty"><h3>Nothing in your build yet</h3>
      <p>Let us suggest one above, or search for a product, open it, and press <b>Add to build</b>.</p>
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
    ${advisorForm()}
    ${loading ? '<p class="checking" role="status"><i aria-hidden="true"></i>Checking prices…</p>' : ''}
    ${summary}
    <ul class="bk-list">${items.map(item => itemRow(item, plan)).join('')}</ul>
    ${plan.missing.length && !loading ? `<p class="fine-print">${pluralCount(plan.missing.length, 'product')} without a current in-stock price ${plan.missing.length === 1 ? 'is' : 'are'} left out of the totals.</p>` : ''}
    ${plan.shops.length > 1 ? shopRows(plan, items.length) : ''}
    <p class="fine-print">Totals leave out delivery. Prices can change, so confirm on each shop's site before you pay.
      <button class="link" data-act="buildClear">Empty the build</button></p>`;
}
