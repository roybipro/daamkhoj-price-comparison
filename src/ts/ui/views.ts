import type { Offer, RenderContext, ShopProfile, TrustWeight } from '../types.js';
import { escapeHtml, money } from '../core/format.js';
import { homeUrl } from '../core/links.js';
import { groupCard, logo } from './fragments.js';

const TRENDING = ['Mobile', 'Laptop', 'Earbuds', 'Rice', 'Soybean oil', 'Router', 'iPhone', 'Power bank'];

export function resultsView(ctx: RenderContext): string {
  const { state, catalog, groups } = ctx;
  const priceCount = groups.reduce((n, g) => n + g.live.length + g.dropped.length, 0);
  const shopFilter = state.storeId ? catalog.stores.find(s => s.id === state.storeId) : undefined;
  const shopHints = state.q ? ctx.search.stores(state.q) : [];

  const heading = state.q
    ? `<div class="lead"><h2>${priceCount} prices across ${groups.length} products for “${escapeHtml(state.q)}”</h2>
        <p>Every shop selling it, side by side, with a trust score next to the price. The cheapest listing is not always the safest one — low scores stay visible, they are never hidden.</p></div>`
    : `<div class="lead"><h2>Today's best deals in Bangladesh</h2>
        <p>Type a product above — in English, Bangla or Banglish. ${catalog.totals.offers} prices from ${catalog.totals.stores} shops across ${catalog.totals.products} products are being compared right now.</p></div>`;

  const hints = shopHints.length ? `<div class="note">That matches a shop: ${shopHints.map(store =>
    `<button class="chip" data-act="shop" data-id="${store.id}">${escapeHtml(store.name)} · trust ${store.score}</button>`).join(' ')}</div>` : '';

  const applied = [
    state.minTrust ? `trust ${state.minTrust}+` : '',
    state.codOnly ? 'cash on delivery only' : ''
  ].filter(Boolean).join(' · ');

  const showAll = Boolean(state.q) || state.showAll;
  const shown = showAll ? groups : groups.slice(0, 6);

  return `${heading}${hints}
    ${shopFilter ? `<div class="note">Showing <b>${escapeHtml(shopFilter.name)}</b> only. <button class="chip" data-act="shop" data-id="">Back to all shops</button></div>` : ''}
    ${applied ? `<div class="note">Filters active: ${escapeHtml(applied)}</div>` : ''}
    ${shown.map((group, i) => groupCard(group, {
      open: showAll || state.open.has(group.product.id) || i === 0,
      showToggle: !state.q,
      weights: ctx.weights,
      selected: state.compare,
      maxCompare: state.maxCompare
    })).join('')}
    ${!groups.length ? `<div class="empty"><h3>Nothing matches “${escapeHtml(state.q)}” yet</h3>
      <p>The sample catalogue is still small. Try a broader word, or pick one of the searches below.</p>
      <div class="chips" style="justify-content:center">${TRENDING.map(t =>
        `<button class="chip" data-act="query" data-q="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join('')}</div></div>` : ''}
    ${!showAll && groups.length > shown.length ? `<button class="more" data-act="all"
      style="border:1px dashed var(--line);border-radius:var(--r);background:var(--card)">Show the other ${groups.length - shown.length} products</button>` : ''}`;
}

function signalSummary(store: ShopProfile, weights: TrustWeight[]): string {
  const signals = store.signals;
  if (!signals) return '';
  const rows = weights.slice(0, 4).map(weight => {
    const signal = signals[weight.id];
    return `<div class="sig"><span class="sig-n">${Math.round(signal.v * weight.weight)}<i>/${weight.weight}</i></span><span><b>${escapeHtml(weight.label)}</b><em>${escapeHtml(signal.why)}</em></span></div>`;
  }).join('');
  return `<div class="sig-list">${rows}</div>`;
}

export function storesView(ctx: RenderContext): string {
  const { catalog, weights } = ctx;
  const list = [...catalog.stores].sort((a, b) => b.score - a.score);
  return `<div class="lead"><h2>The ${catalog.totals.stores} shops we track</h2>
    <p>A price tells you what you pay; a shop tells you whether you get it. These scores come from business history, buyer reviews, payment safety, returns, warranty, delivery and support.</p></div>
    <div class="grid">${list.map(store => `<article class="panel">
      <div class="row1">
        ${logo(store)}
        <div><h4>${escapeHtml(store.name)}</h4><div class="site">${escapeHtml(store.url)} · ${store.since}${store.closed ? `–${store.closed}` : ''}</div></div>
        <div class="score-big"><div class="n num tier-${store.tier.id}">${store.score}</div><div class="l">${store.tier.label}</div></div>
      </div>
      <p class="blurb">${escapeHtml(store.blurb)}</p>
      <div class="facts">
        <span class="tag">${store.offerCount} offers</span>
        <span class="tag">${store.kind === 'marketplace' ? 'Marketplace' : store.kind === 'brand' ? 'Manufacturer' : 'Retailer'}</span>
        <span class="tag">${store.coverage === 'nationwide' ? 'Nationwide' : store.coverage === 'none' ? 'No delivery' : 'Limited area'}</span>
        ${store.cod ? '<span class="tag ok">Cash on delivery</span>' : ''}
        ${store.officialWarranty ? '<span class="tag ok">Official warranty</span>' : ''}
        ${store.returnsDays ? `<span class="tag">${store.returnsDays}-day returns</span>` : ''}
        ${store.incidents.map(i => `<span class="tag warn">${escapeHtml(i.t)}</span>`).join('')}
      </div>
      ${signalSummary(store, weights)}
      <div class="facts" style="margin-top:10px">${store.categories.map(c =>
        `<span class="tag" style="background:var(--paper-2)">${escapeHtml(catalog.categories.get(c)?.en ?? c)}</span>`).join('')}</div>
      <div style="margin-top:11px;display:flex;gap:8px">
        <button class="cmp" data-act="shop" data-id="${store.id}">See this shop's prices</button>
        <a class="cmp" href="${homeUrl(store)}" target="_blank" rel="noopener noreferrer nofollow" style="text-decoration:none">Website ↗</a>
      </div>
    </article>`).join('')}</div>`;
}

export function compareView(ctx: RenderContext): string {
  const picked = ctx.state.compare
    .map(id => ctx.offersById.get(id))
    .filter((offer): offer is Offer => Boolean(offer));

  if (!picked.length) {
    return `<div class="empty"><h3>Nothing selected yet</h3>
      <p>Pick 2–4 shops for one product from the search results — the bar at the bottom then puts their prices and risk side by side.</p>
      <button class="chip" data-act="view" data-view="results">Back to search</button></div>`;
  }

  const row = (label: string, format: (offer: Offer) => string, pick?: (offer: Offer) => number, dir: 'min' | 'max' = 'min'): string => {
    let best: number | null = null;
    if (pick) {
      const values = picked.map(pick).filter(Number.isFinite);
      if (values.length) best = dir === 'min' ? Math.min(...values) : Math.max(...values);
    }
    return `<tr><th scope="row">${label}</th>${picked.map(offer => {
      const value = pick ? pick(offer) : null;
      return `<td class="${best !== null && value === best ? 'win num' : 'num'}">${format(offer)}</td>`;
    }).join('')}</tr>`;
  };

  const vsAverage = (offer: Offer): string => {
    const gap = offer.market.median - offer.landed;
    return gap > 0 ? `<span style="color:var(--taka);font-weight:700">−${money(gap)}</span>`
      : gap < 0 ? `+${money(-gap)}` : 'At the average';
  };

  const cheapest = [...picked].sort((a, b) => a.landed - b.landed)[0];
  const safest = [...picked].sort((a, b) => b.trust.score - a.trust.score)[0];

  return `<div class="lead"><h2>${escapeHtml(picked[0].product.name)} — ${picked.length} shops side by side</h2>
    <p>${escapeHtml(picked[0].product.spec)} · market average ${money(picked[0].market.median)}. Cheapest and safest are not always the same shop — ✦ marks the best value in each row.</p></div>
    <div class="cmp-table"><table class="table cmp-grid">
      <thead><tr><th></th>${picked.map(offer => `<th>${logo(offer.store, 'md')}<div style="margin-top:6px">${escapeHtml(offer.store.name)}</div></th>`).join('')}</tr></thead>
      <tbody>
        ${row('All-in price', o => money(o.landed), o => o.landed)}
        ${row('Vs market average', vsAverage)}
        ${row('Trust score', o => `${o.trust.score} <span class="tier-${o.trust.tier.id}" style="font-weight:700">(${o.trust.tier.label})</span>`, o => o.trust.score, 'max')}
        ${row('Value score', o => `${o.value} <span style="color:var(--ink-3);font-weight:400">/100</span>`, o => o.value, 'max')}
        ${row('Cash on delivery', o => o.store.cod ? 'Yes' : 'No')}
        ${row('Return window', o => o.store.returnsDays ? `${o.store.returnsDays} days` : 'None', o => o.store.returnsDays, 'max')}
        ${row('Warranty', o => o.store.officialWarranty ? 'Official' : o.store.kind === 'marketplace' ? 'Depends on the seller' : "Shop's own")}
        ${row('Delivery', o => `${o.eta} days${o.ship ? ` · +${money(o.ship)}` : ''}`, o => o.eta)}
        ${row('Payment methods', o => o.store.payments.length ? escapeHtml(o.store.payments.join(', ')) : '—')}
        ${row('Seller', o => o.seller ? escapeHtml(o.seller) : "Shop's own stock")}
        ${row('Seller rating', o => o.seller ? `${o.sellerRating.toFixed(1)}/5 (${o.sellerReviews})` : `${o.store.rating.toFixed(1)}/5`)}
        ${row('Risk flags', o => o.trust.flags.length ? o.trust.flags.map(escapeHtml).join('<br>') : '<span style="color:var(--brand-2)">No risk flagged</span>')}
        ${row('', o => `<a class="cmp" style="text-decoration:none;display:inline-block" href="${escapeHtml(o.link)}" target="_blank" rel="noopener noreferrer nofollow">Find this product ↗</a>`)}
      </tbody>
    </table></div>
    <div class="note" style="margin-top:16px">${cheapest.id === safest.id
      ? `<b>Reading this:</b> ${escapeHtml(cheapest.store.name)} wins outright — lowest price at ${money(cheapest.landed)} and the highest trust score of the set (${safest.trust.score}).`
      : `<b>Reading this:</b> the lowest price is ${escapeHtml(cheapest.store.name)} at ${money(cheapest.landed)}, the safest is ${escapeHtml(safest.store.name)} at ${money(safest.landed)} with a trust score of ${safest.trust.score}. Whether the gap is worth the risk is yours to decide — that judgement is the whole point of the score.`}</div>`;
}

export function howView(ctx: RenderContext): string {
  const { weights, snapshot } = ctx;
  const total = weights.reduce((sum, w) => sum + w.weight, 0);
  const tiers: [string, string][] = [
    ['Trusted · 82+', 'tier-strong'], ['Good · 68–81', 'tier-good'], ['Caution · 50–67', 'tier-caution'],
    ['Risky · under 50', 'tier-risk'], ['Closed — do not buy', 'tier-closed']
  ];
  return `<div class="lead"><h2>How the trust score is built</h2>
    <p>Not a black box. Seven checked signals add up to 100, then risk rules take points away. Hover or focus any score in the results to see its breakdown.</p></div>
    <table class="table"><thead><tr><th>Signal</th><th>What we look at</th><th style="text-align:right">Weight</th></tr></thead><tbody>
      ${weights.map(w => `<tr><td class="w">${escapeHtml(w.label)}</td><td>${escapeHtml(w.check)}</td><td class="num" style="text-align:right">${w.weight}</td></tr>`).join('')}
      <tr><td class="w">Total</td><td></td><td class="num" style="text-align:right">${total}</td></tr>
    </tbody></table>
    <div class="grid" style="margin-top:16px">
      <div class="panel"><h4>Risk rules</h4><p class="blurb">
        • A price more than 18% under the market average loses authenticity points and gets a visible warning.<br>
        • On a marketplace the shop is not the seller — listings from sellers with under 60 reviews are flagged separately.<br>
        • If a business has shut down, its offers are dropped from the comparison but still shown, in red, with the reason.
      </p></div>
      <div class="panel"><h4>What the numbers mean</h4><p class="blurb">
        ${tiers.map(([label, tierClass]) => `<span class="tag ${tierClass}">${label}</span>`).join('')}
      </p></div>
      <div class="panel"><h4>Where the data comes from</h4><p class="blurb"><b>${escapeHtml(snapshot.label)}</b> — every price, rating and policy in this build is sample data placed for the demo, not a live feed. A live version needs: Daraz and Pickaboo seller APIs, published price feeds or direct partnerships with each shop, IMEI warranty checks, and trade-licence and BTRIS registration lookups.</p></div>
      <div class="panel"><h4>What we don't do</h4><p class="blurb">No commissions from shops, no paid rankings, and buying a higher position is not possible. Corrections to a shop's information are published as corrections, not quietly edited.</p></div>
    </div>`;
}

export function toolbarView(ctx: RenderContext): string {
  const { state, catalog } = ctx;
  if (state.view !== 'results') return '';
  return `<div class="toolbar">
    <span class="count" aria-live="polite">Comparing <b class="num">${catalog.totals.offers}</b> prices · <b class="num">${catalog.totals.stores}</b> shops · <b class="num">${catalog.totals.products}</b> products</span>
    <label class="control">Sort
      <select id="sort">${Object.entries(state.sortLabels).map(([id, label]) =>
        `<option value="${id}"${state.sort === id ? ' selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select>
    </label>
    <label class="control">Min trust
      <select id="minTrust">${[0, 60, 70, 80].map(v =>
        `<option value="${v}"${state.minTrust === v ? ' selected' : ''}>${v ? `${v}+` : 'Any'}</option>`).join('')}</select>
    </label>
    <label class="control">Shop
      <select id="storeId"><option value="">All shops</option>${catalog.stores.map(s =>
        `<option value="${s.id}"${state.storeId === s.id ? ' selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}</select>
    </label>
    <button class="toggle" data-act="cod" aria-pressed="${state.codOnly}"><input type="checkbox" ${state.codOnly ? 'checked' : ''} tabindex="-1">Cash on delivery only</button>
    ${state.minTrust || state.codOnly || state.storeId ? '<button class="toggle" data-act="reset">Clear filters ✕</button>' : ''}
  </div>`;
}

export function trayView(ctx: RenderContext): string {
  const { state, offersById } = ctx;
  if (!state.compare.length || state.view === 'compare') return '';
  const picked = state.compare
    .map(id => offersById.get(id))
    .filter((offer): offer is Offer => Boolean(offer));
  const lowest = Math.min(...picked.map(o => o.landed));

  return `<div class="tray"><div class="wrap tray-in">
    <span class="lbl">Comparing ${picked.length}/${state.maxCompare} · ${escapeHtml(picked[0].product.name)}</span>
    <div class="slots">${picked.map(offer => `<span class="slot">${logo(offer.store, 'xs')}${escapeHtml(offer.store.name)} ·
      <b class="num">${money(offer.landed)}</b>
      <button data-act="remove" data-id="${offer.id}" aria-label="Remove ${escapeHtml(offer.store.name)}">×</button></span>`).join('')}</div>
    <div class="actions">
      <button class="btn-ghost" data-act="clear">Clear</button>
      <button class="btn-primary" data-act="view" data-view="compare" ${picked.length < 2 ? 'disabled' : ''}>Compare · lowest ${money(lowest)}</button>
    </div>
  </div></div>`;
}

export function suggestionsView(ctx: RenderContext): string {
  const query = ctx.state.q.trim();
  if (!query || document.activeElement !== ctx.input) return '';

  const items = [
    ...ctx.search.products(query).slice(0, 6).map(hit => ({
      kind: 'product' as const, id: hit.product.id, label: hit.product.name,
      sub: ctx.catalog.categories.get(hit.product.cat)?.en ?? ''
    })),
    ...ctx.search.stores(query).slice(0, 3).map(store => ({
      kind: 'store' as const, id: store.id, label: store.name, sub: `trust ${store.score}`
    }))
  ];
  ctx.state.suggest = items;
  if (!items.length) return '';

  let section = '';
  return `<div class="suggest" id="suggest" role="listbox" aria-label="Search suggestions">${items.map((item, i) => {
    const head = item.kind !== section ? `<div class="sgroup">${item.kind === 'product' ? 'Products' : 'Shops'}</div>` : '';
    section = item.kind;
    const active = ctx.state.suggestIndex === i;
    const tile = item.kind === 'store'
      ? logo(ctx.catalog.stores.find(s => s.id === item.id) ?? ctx.catalog.stores[0], 'xs')
      : '<span class="mono xs">✦</span>';
    return `${head}<div role="option" id="opt-${i}" class="${active ? 'on' : ''}" data-i="${i}" aria-selected="${active}">
      ${tile}<span>${escapeHtml(item.label)}</span><span class="k">${escapeHtml(item.sub)}</span></div>`;
  }).join('')}</div>`;
}
