/* Shareable address bar. The whole comparison is encoded into the query string and read
   back on load, so a link carries the exact search, filters and shortlist you were looking
   at. Pure string in, string out — app.ts is the only place that touches history. */

import type { SortKey, State, ViewName } from '../types.js';

const SORTS: readonly SortKey[] = ['value', 'price', 'trust', 'eta'];
const VIEWS: readonly ViewName[] = ['results', 'stores', 'compare', 'how'];
const TRUST_STEPS = [60, 70, 80];
const MAX_QUERY = 80;
/* The tray disables Compare below two picks, so a restored shortlist has to clear
   the same bar — otherwise a hand-edited link renders a one-shop "side by side". */
const MIN_PICKS = 2;

/** Only the ids the live catalogue actually knows about survive a hand-edited link. */
export interface UrlStateValid {
  stores: ReadonlySet<string>;
  offers: ReadonlySet<string>;
  maxCompare: number;
}

export function encodeState(state: State): string {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.view !== 'results') params.set('view', state.view);
  if (state.sort !== 'value') params.set('sort', state.sort);
  if (state.minTrust) params.set('trust', String(state.minTrust));
  if (state.storeId) params.set('shop', state.storeId);
  if (state.codOnly) params.set('cod', '1');
  if (state.compare.length) params.set('pick', state.compare.join(','));
  return params.toString();
}

export function decodeState(search: string, valid: UrlStateValid): Partial<State> {
  const params = new URLSearchParams(search);
  const state: Partial<State> = {};

  const query = params.get('q')?.trim();
  if (query) state.q = query.slice(0, MAX_QUERY);

  const view = params.get('view');
  if (view && (VIEWS as readonly string[]).includes(view)) state.view = view as ViewName;

  const sort = params.get('sort');
  if (sort && (SORTS as readonly string[]).includes(sort)) state.sort = sort as SortKey;

  const trust = Number(params.get('trust'));
  if (TRUST_STEPS.includes(trust)) state.minTrust = trust;

  const shop = params.get('shop');
  if (shop && valid.stores.has(shop)) state.storeId = shop;

  if (params.get('cod') === '1') state.codOnly = true;

  const picks = params.get('pick');
  if (picks) {
    const ids = [...new Set(picks.split(',').map(id => id.trim()))].filter(id => valid.offers.has(id));
    /* A shortlist only reads as one product's line-up, so a link that mixes products
       is treated as no shortlist at all rather than a partial one. */
    const singleProduct = ids.length > 0 && ids.every(id => {
      const [productId] = id.split('--');
      return productId === ids[0].split('--')[0];
    });
    if (ids.length >= MIN_PICKS && ids.length <= valid.maxCompare && singleProduct) state.compare = ids;
  }

  return state;
}
