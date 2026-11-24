import type { RenderContext } from '../types.js';
import { escapeHtml } from '../core/format.js';
import { browseView, shopsView } from './browse.js';
import { liveView } from './live.js';

const showsLive = (ctx: RenderContext): boolean => ctx.state.live.status !== 'idle' && ctx.state.live.status !== 'unavailable';

const placeholderCard = '<div class="pcard sk-card"><div class="pc-img"></div><span class="sk sk-line"></span><span class="sk sk-line short"></span></div>';
const shelvesLoadingView = (): string =>
  `<div class="shelf-wait" role="status" aria-label="Loading prices">${[0, 1].map(() =>
    `<section class="shelf" aria-hidden="true"><div class="shelf-head"><span class="sk sk-title"></span></div>
      <div class="cards row">${placeholderCard.repeat(6)}</div></section>`).join('')}</div>`;

export function resultsView(ctx: RenderContext): string {
  const { state } = ctx;
  if (showsLive(ctx)) return liveView(state.live, { product: state.product, limit: state.resultLimit });
  if (state.browse.status === 'ready' && (!state.q || state.live.status === 'idle')) return browseView(ctx, state.browse.data);
  /* Until the shelves arrive, placeholders hold their place. */
  if (state.browse.status === 'loading' && !state.q) return shelvesLoadingView();
  /* No price list answered. Sample prices beside real shop names are never shown in its place. */
  return pricesUnavailableView(state.q);
}

const pricesUnavailableView = (query: string): string =>
  `<div class="empty"><h3>Prices couldn't be loaded</h3>
    <p>${query ? `We couldn't look up “${escapeHtml(query)}” just now. ` : ''}Please try again in a minute.</p>
    <div class="chips" style="justify-content:center"><button class="chip" data-act="retry">Try again</button></div></div>`;

export function storesView(ctx: RenderContext): string {
  const { browse } = ctx.state;
  if (browse.status === 'ready') return shopsView(browse.data);
  if (browse.status === 'loading') return shelvesLoadingView();
  return pricesUnavailableView('');
}

export function howView(): string {
  return `<div class="lead"><h2>How DaamKhoj works</h2>
    <p>Every price comes from a shop's own website, with the time it was read. We line them up so you can see who sells the same product for less.</p></div>
    <div class="grid" style="margin-top:16px">
      <div class="panel"><h4>Where prices come from</h4><p class="blurb">Every night we read the product pages that Bangladeshi online shops list for search engines, and save each page's taka price, stock and photo. Prices older than a week are left out.</p></div>
      <div class="panel"><h4>When you search</h4><p class="blurb">Results come from that list at once. We then open the shops' pages again and update any price that changed, so each card says when its price was checked. We skip pages that ask not to be read automatically, and pages without one clear taka price.</p></div>
      <div class="panel"><h4>Only the same product is compared</h4><p class="blurb">Storage, memory and model are matched, so a 128 GB phone is never compared with a 256 GB one, and accessories are kept apart from the product itself.</p></div>
      <div class="panel"><h4>What we don't do</h4><p class="blurb">DaamKhoj sells nothing, takes no commission and has no paid rankings. We don't rate shops. A price can still be out of date or wrong, so check it on the shop's site before you pay.</p></div>
    </div>`;
}

export function toolbarView(): string {
  return '';
}

export function trayView(): string {
  return '';
}

export function suggestionsView(ctx: RenderContext): string {
  const query = ctx.state.q.trim();
  if (!query || document.activeElement !== ctx.input) {
    /* The keyboard handlers read this list, so it can't outlive the one on screen. */
    ctx.state.suggest = [];
    return '';
  }

  /* Products from the price list only. */
  const items = ctx.state.liveSuggest.map(item => ({
    kind: 'live' as const, id: item.name, label: item.name, sub: item.shops > 1 ? `${item.shops} shops` : '1 shop'
  }));
  ctx.state.suggest = items;
  if (!items.length) return '';

  return `<div class="suggest" id="suggest" role="listbox" aria-label="Search suggestions"><div class="sgroup">Products</div>${items.map((item, i) => {
    const active = ctx.state.suggestIndex === i;
    const tile = '<span class="mono xs">✦</span>';
    return `<div role="option" id="opt-${i}" class="${active ? 'on' : ''}" data-i="${i}" aria-selected="${active}">
      ${tile}<span>${escapeHtml(item.label)}</span><span class="k">${escapeHtml(item.sub)}</span></div>`;
  }).join('')}</div>`;
}
