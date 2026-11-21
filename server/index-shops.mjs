/* Shops whose sitemaps the price list is built from. Each was checked by hand on 2026-11-21:
   its robots.txt allows product pages, and a sample of 25 pages gave one clear taka price for
   at least half of them. Add a shop here only after the same check.

   `kind: 'shopify'` reads Shopify's per-product JSON, which prices each version separately,
   where the page itself would show several prices at once. Shopify's JSON states no currency;
   these shops sell only in taka, which is why they are listed by hand rather than discovered. */

export const INDEX_SHOPS = [
  { shop: 'applegadgetsbd.com', sitemap: 'https://www.applegadgetsbd.com/product/sitemap.xml', product: /\/product\/[^/]+\/?$/, kind: 'page' },
  { shop: 'sumashtech.com', sitemap: 'https://www.sumashtech.com/__sitemap__/product.xml', product: /\/product\/[^/]+\/?$/, kind: 'page' },
  { shop: 'dazzle.com.bd', sitemap: 'https://dazzle.com.bd/products/sitemap.xml', product: /\/product\/[^/]+\/?$/, kind: 'page' },
  { shop: 'istockbd.com', sitemap: 'https://istockbd.com/sitemap.xml', product: /\/products\/[^/]+\/?$/, kind: 'shopify' }
];
