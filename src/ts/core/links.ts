import { SEARCH_PATTERNS } from '../data/search-patterns.js';
import type { Product, Shop } from '../types.js';

export const hostOf = (url: string): string => url.replace(/^https?:\/\//, '').replace(/^www\./, '');

/* Public favicon service so the tile shows the shop's real mark; the UI falls back
   to the coloured monogram when a brand publishes no retrievable icon. */
export const iconUrl = (store: Shop): string =>
  `https://www.google.com/s2/favicons?domain=${hostOf(store.url)}&sz=64`;

export function productQuery(product: Product): string {
  const bare = product.name.replace(product.brand, '').replace(/\(.*?\)/g, '').trim();
  return bare ? `${product.brand} ${bare}` : product.name;
}

/* Lands on the product rather than the homepage: the shop's own search where that
   pattern is verified against the live site, otherwise a site-scoped search.
   An unverified deep-link pattern would only ever 404. */
export function productLink(store: Shop, product: Product): string {
  const query = productQuery(product);
  const template = SEARCH_PATTERNS[store.id];
  if (template) return template.replace('{q}', encodeURIComponent(query));
  return 'https://www.google.com/search?q=' + encodeURIComponent(`site:${hostOf(store.url)} ${query}`);
}

export const homeUrl = (store: Shop): string => `https://${hostOf(store.url)}`;
