import { SEARCH_PATTERNS } from '../data/search-patterns.js';
import { SHOP_LOGOS } from '../data/shop-logos.js';
import type { Product, Shop, ShopLink } from '../types.js';

export const hostOf = (url: string): string => url.replace(/^https?:\/\//, '').replace(/^www\./, '');

/* Local bundled shop icon first, falling back to a public favicon lookup and monogram. */
export const iconUrl = (store: Shop): string => {
  const host = hostOf(store.url).replace(/\/.*$/, '');
  return SHOP_LOGOS[host] ?? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
};

/** What to type into a shop's own search: the product's name, without the details in brackets.
    A one-word brand the name leaves out is added ("Apple iPhone 15"); longer "brands" in the
    sample data are descriptions ("Loose mill", "Local farm") that would only spoil a search. */
export function productQuery(product: Product): string {
  const bare = product.name.replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim();
  const brand = product.brand.trim();
  const addBrand = !/\s/.test(brand) && !bare.toLowerCase().includes(brand.toLowerCase());
  return addBrand ? `${brand} ${bare}` : bare;
}

export const homeUrl = (store: Shop): string => `https://${hostOf(store.url)}`;

/* The shop's own search, where that address was checked against the live site; otherwise its
   home page. Never a web search: a sample product a shop doesn't stock only finds nothing.
   A shop that has closed, or whose site no longer exists, gets no link at all. */
export function productLink(store: Shop, product: Product): ShopLink | null {
  if (store.closed || store.siteDown) return null;
  const template = SEARCH_PATTERNS[store.id];
  if (template) return { url: template.replace('{q}', encodeURIComponent(productQuery(product))), searches: true };
  return { url: homeUrl(store), searches: false };
}

/** A shop's logo by its web address: its own icon, served from this site, for every shop in the
    price list; a favicon service's guess for shops a web search found. */
export const shopLogo = (shop: string): string => {
  const host = hostOf(shop).replace(/\/.*$/, '');
  return SHOP_LOGOS[host] ?? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
};
