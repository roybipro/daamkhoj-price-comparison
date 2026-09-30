import type { Group, Offer, Shop, TrustAssessment, TrustWeight } from '../types.js';
import { escapeHtml, money, pluralCount, pluralNoun } from '../core/format.js';
import { homeUrl, iconUrl } from '../core/links.js';

export function logo(store: Shop & { icon?: string }, size?: 'xs' | 'md'): string {
  return `<span class="mono ${size ?? ''}" style="color:${store.accent}">
    <img src="${store.icon ?? iconUrl(store)}" alt="${escapeHtml(store.name)} logo" onerror="this.remove()">${store.monogram}</span>`;
}

export function sparkline(points: number[]): string {
  const low = Math.min(...points);
  const high = Math.max(...points);
  const span = high - low || 1;
  const coords = points.map((p, i) => `${(i / (points.length - 1)) * 76},${20 - ((p - low) / span) * 15}`).join(' ');
  return `<svg class="spark" width="78" height="22" viewBox="0 0 78 22" aria-hidden="true"><polyline points="${coords}"/></svg>`;
}

export function meter(offer: Offer): string {
  const { score, tier } = offer.trust;
  return `<div class="meter">
    <div class="bar"><i data-tier="${tier.id}" style="width:${score}%"></i></div>
    <div class="cap"><span>Trust ${score}</span><span class="tier-${tier.id}">${tier.label}</span></div>
  </div>`;
}

export function signalBreakdown(trust: TrustAssessment, weights: TrustWeight[]): string {
  return weights.map(weight => {
    const signal = trust.signals[weight.id];
    return `<div class="sig">
      <span class="sig-n">${Math.round(signal.v * weight.weight)}<i>/${weight.weight}</i></span>
      <span><b>${escapeHtml(weight.label)}</b><em>${escapeHtml(signal.why)}</em></span>
    </div>`;
  }).join('');
}

export function tags(offer: Offer): string {
  const shop = offer.store;
  const list = [
    offer.ship ? `<span class="tag">+${money(offer.ship)} delivery</span>` : '<span class="tag ok">Free delivery</span>',
    `<span class="tag">${offer.eta}-day delivery</span>`
  ];
  if (shop.cod) list.push('<span class="tag ok">Cash on delivery</span>');
  list.push(shop.returnsDays
    ? `<span class="tag">${shop.returnsDays}-day returns</span>`
    : '<span class="tag warn">No return window</span>');

  if (shop.officialWarranty) list.push('<span class="tag ok">Official warranty</span>');
  else if (shop.kind === 'marketplace') {
    list.push(offer.seller
      ? `<span class="tag ${offer.sellerRating < 3.5 ? 'warn' : ''}">Third-party seller</span>`
      : '<span class="tag">Marketplace listing</span>');
  }
  for (const flag of offer.trust.flags) list.push(`<span class="tag warn">${escapeHtml(flag)}</span>`);
  return list.join('');
}

export interface OfferRowOptions {
  isBest?: boolean;
  selected?: boolean;
  compareFull?: boolean;
  weights: TrustWeight[];
}

export function offerRow(offer: Offer, options: OfferRowOptions): string {
  const { isBest = false, selected = false, compareFull = false, weights } = options;
  const dropped = offer.suppressed;
  const gapToAverage = offer.market.median - offer.landed;
  const struck = offer.mrp > offer.price ? `<span class="mrp num">${money(offer.mrp)}</span>` : '';
  const delta = gapToAverage > 0
    ? `<span class="save num">−${money(gapToAverage)} under market average</span>`
    : gapToAverage < 0
      ? `<span class="save num over">${money(-gapToAverage)} over average</span>`
      : '';

  return `<div class="offer ${isBest ? 'pick' : ''} ${dropped ? 'dropped' : ''}" data-offer="${offer.id}">
    <div class="seller">
      ${logo(offer.store)}
      <span class="t">
        <div class="store-name">${escapeHtml(offer.store.name)}</div>
        <div class="sub">${offer.seller ? escapeHtml(offer.seller) : 'Shop’s own stock'} · ${escapeHtml(offer.store.url)}</div>
      </span>
    </div>
    <div class="price">
      <b class="num">${money(offer.price)}</b>${struck}
      ${delta}
      <span class="total num">All-in ${money(offer.landed)} · 12-week trend ${sparkline(offer.history)}</span>
    </div>
    <div class="trust" tabindex="0" aria-label="Trust score ${offer.trust.score} out of 100">
      ${meter(offer)}
      <div class="tip"><h5>How this ${offer.trust.score} was built</h5>${signalBreakdown(offer.trust, weights)}</div>
    </div>
    <div class="meta">${tags(offer)}</div>
    <div class="acts">
      <button class="cmp" data-act="compare" data-id="${offer.id}" aria-pressed="${selected}"
        ${!selected && compareFull ? 'disabled' : ''}>${selected ? '✓ Added' : '+ Compare'}</button>
      <a href="${escapeHtml(dropped ? homeUrl(offer.store) : offer.link)}" target="_blank" rel="noopener noreferrer nofollow"
        title="${escapeHtml(dropped ? `Open ${offer.store.name}` : `Find ${offer.product.name} on ${offer.store.name}`)}">
        ${dropped ? 'Visit site' : 'Find this product'} ↗</a>
    </div>
    ${dropped ? `<div class="reason">Excluded: ${offer.trust.flags.map(escapeHtml).join(' · ')} — this price is not counted in the comparison.</div>` : ''}
  </div>`;
}

export interface GroupCardOptions {
  open: boolean;
  showToggle: boolean;
  weights: TrustWeight[];
  selected: string[];
  maxCompare: number;
}

export function groupCard(group: Group, options: GroupCardOptions): string {
  const { open, showToggle, weights, selected, maxCompare } = options;
  const { product, live, dropped, best, category, stats } = group;
  const visible = open ? live : live.slice(0, 3);
  const rowOptions = (offer: Offer) => ({
    isBest: Boolean(best && offer.id === best.id),
    selected: selected.includes(offer.id),
    compareFull: selected.length >= maxCompare,
    weights
  });

  return `<section class="group" data-product="${product.id}">
    <div class="group-head">
      <div class="gh-main">
        <div class="gh-kicker">
          <span class="pill cat">${escapeHtml(category.en)}</span>
          ${best && best.trust.score >= 68 ? '<span class="pill best">Best deal — cheap and safe</span>' : ''}
        </div>
        <h3>${escapeHtml(product.name)}<span class="sub">${escapeHtml(product.brand)} · ${escapeHtml(product.spec)}</span></h3>
      </div>
      <div class="gh-price">
        <div class="from num">${live.length ? money(stats.min) : '—'}</div>
        <div class="range num">${live.length ? `from · ${pluralCount(live.length, 'shop')}` : 'not in these filters'}</div>
        <div class="avg num">${live.length ? `Average ${money(stats.median)} · highest ${money(stats.max)}` : ''}</div>
      </div>
    </div>
    <div class="offers">
      ${visible.length
        ? visible.map(offer => offerRow(offer, rowOptions(offer))).join('')
        : '<div class="offer"><p class="sub" style="grid-column:1/-1;color:var(--ink-3)">No shop matches these filters for this product.</p></div>'}
      ${open ? dropped.map(offer => offerRow(offer, rowOptions(offer))).join('') : ''}
    </div>
    ${showToggle && live.length > 3 ? `<button class="more" data-act="expand" data-id="${product.id}" aria-expanded="${open}">
      ${open ? 'Show fewer shops' : `Show ${live.length - 3} more ${pluralNoun(live.length - 3, 'shop')}`}</button>` : ''}
  </section>`;
}
