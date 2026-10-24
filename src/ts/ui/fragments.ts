import type { Group, Offer, Shop, TrustAssessment, TrustWeight } from '../types.js';
import type { TrendChart } from '../core/trend.js';
import { buildTrend, weekLabel } from '../core/trend.js';
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

export function trendPanel(chart: TrendChart): string {
  const { plot } = chart;
  const line = (points: { x: number; y: number }[]): string =>
    points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  const grid = chart.ticks.map(tick => `<line class="t-grid" x1="${plot.left}" x2="${plot.right}" y1="${tick.y.toFixed(1)}" y2="${tick.y.toFixed(1)}"/>
      <text class="t-tick" x="${plot.left - 8}" y="${(tick.y + 4).toFixed(1)}" text-anchor="end">${money(tick.value)}</text>`).join('');

  /* Odd weeks, not even: the last week is index 11, and labelling even weeks left the
     current price — the one point readers look for — without an axis label. */
  const weeks = chart.weekXs.map((x, week) => week % 2 === 1
    ? `<text class="t-wk" x="${x.toFixed(1)}" y="${plot.bottom + 16}" text-anchor="middle">${weekLabel(week)}</text>` : '').join('');

  const average = chart.average
    ? `<line class="t-avg" x1="${plot.left}" x2="${plot.right}" y1="${chart.average.y.toFixed(1)}" y2="${chart.average.y.toFixed(1)}"/>
      <text class="t-avg-lab" x="${plot.right}" y="${(chart.average.y - 6).toFixed(1)}" text-anchor="end">market average ${money(chart.average.value)}</text>` : '';

  const traces = chart.series.map(s => `<polyline class="t-line" style="stroke:${escapeHtml(s.accent)}" points="${line(s.points)}"/>
      <circle class="t-low" cx="${s.lowest.x.toFixed(1)}" cy="${s.lowest.y.toFixed(1)}" r="3"/>
      <circle class="t-now" cx="${s.points[s.points.length - 1].x.toFixed(1)}" cy="${s.points[s.points.length - 1].y.toFixed(1)}" r="2.5" style="fill:${escapeHtml(s.accent)}"/>`).join('');

  const legend = chart.series.map(s => `<li class="t-legend">
      <span class="dot" style="background:${escapeHtml(s.accent)}"></span>
      <span class="t-name">${escapeHtml(s.shop)}${s.seller ? ` · ${escapeHtml(s.seller)}` : ''}</span>
      <span class="num">${money(s.current)}</span>
      <span class="sub">low ${money(s.lowest.value)} · ${weekLabel(s.lowest.week)}</span>
    </li>`).join('');

  return `<div class="trend-wrap">
    <svg class="trend" viewBox="0 0 ${chart.width} ${chart.height}" role="img"
      aria-label="Twelve week price history for ${pluralCount(chart.series.length, 'shop')} in this comparison">
      ${grid}${average}${traces}${weeks}
    </svg>
    <ul class="t-legend-list">${legend}</ul>
    ${chart.hidden ? `<p class="t-note">Showing ${chart.series.length} of ${chart.series.length + chart.hidden} shops — the rest stay as sparklines in the list.</p>` : ''}
    <p class="t-note">Sample history generated for the demo, not recorded prices.</p>
  </div>`;
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
  trend: boolean;
  weights: TrustWeight[];
  selected: string[];
  maxCompare: number;
}

export function groupCard(group: Group, options: GroupCardOptions): string {
  const { open, showToggle, trend, weights, selected, maxCompare } = options;
  const { product, live, dropped, best, category, stats, market } = group;
  const visible = open ? live : live.slice(0, 3);
  const chart = trend ? buildTrend(live, market.median) : null;
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
        ${live.length > 1 ? `<button class="t-btn" data-act="trend" data-id="${product.id}"
          aria-expanded="${trend}" aria-controls="trend-${escapeHtml(product.id)}">${trend ? 'Hide 12-week trend' : 'Show 12-week trend'}</button>` : ''}
      </div>
      <div class="gh-price">
        <div class="from num">${live.length ? money(stats.min) : '—'}</div>
        <div class="range num">${live.length ? `from · ${pluralCount(live.length, 'shop')}` : 'not in these filters'}</div>
        <div class="avg num">${live.length ? `Market average ${money(market.median)} · highest ${money(stats.max)}` : ''}</div>
      </div>
    </div>
    <div class="offers">
      ${visible.length
        ? visible.map(offer => offerRow(offer, rowOptions(offer))).join('')
        : '<div class="offer"><p class="sub" style="grid-column:1/-1;color:var(--ink-3)">No shop matches these filters for this product.</p></div>'}
      ${open ? dropped.map(offer => offerRow(offer, rowOptions(offer))).join('') : ''}
    </div>
    ${chart ? `<div class="trend-panel" id="trend-${escapeHtml(product.id)}" role="region" aria-label="Twelve week trend for ${escapeHtml(product.name)}">${trendPanel(chart)}</div>` : ''}
    ${showToggle && live.length > 3 ? `<button class="more" data-act="expand" data-id="${product.id}" aria-expanded="${open}">
      ${open ? 'Show fewer shops' : `Show ${live.length - 3} more ${pluralNoun(live.length - 3, 'shop')}`}</button>` : ''}
  </section>`;
}
