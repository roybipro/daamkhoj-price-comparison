/* Shops whose sitemaps the price list is built from. Each was checked by hand on 2026-11-21:
   its robots.txt allows product pages, and a sample of 25 pages gave one clear taka price for
   at least half of them. Add a shop here only after the same check.

   `kind: 'shopify'` reads Shopify's per-product JSON, which prices each version separately,
   where the page itself would show several prices at once. Shopify's JSON states no currency;
   these shops sell only in taka, which is why they are listed by hand rather than discovered. */

/* A page directly under the site's root, such as /hp-250-g9-laptop. */
const ONE_LEVEL = /^https?:\/\/[^/]+\/[^/?#]+\/?$/;

export const INDEX_SHOPS = [
  { shop: 'applegadgetsbd.com', sitemap: 'https://www.applegadgetsbd.com/product/sitemap.xml', product: /\/product\/[^/]+\/?$/, kind: 'page' },
  { shop: 'sumashtech.com', sitemap: 'https://www.sumashtech.com/__sitemap__/product.xml', product: /\/product\/[^/]+\/?$/, kind: 'page' },
  { shop: 'dazzle.com.bd', sitemap: 'https://dazzle.com.bd/products/sitemap.xml', product: /\/product\/[^/]+\/?$/, kind: 'page' },
  { shop: 'istockbd.com', sitemap: 'https://istockbd.com/sitemap.xml', product: /\/products\/[^/]+\/?$/, kind: 'shopify' },

  /* Added 2026-11-23 after the same check on 12 pages each (priced of 12): Trust Tech 12,
     Star Tech 11, Binary Logic 11, Gadget & Gear 11, Techland 10, Global Brand 8, Gadget
     Breeze 8. Ryans (4) and Computer Source (1) did not pass. Shops whose product pages sit one
     level deep also list category pages there; those read as "no price" and cost one request. */
  { shop: 'startech.com.bd', sitemap: 'https://www.startech.com.bd/sitemap.xml', product: ONE_LEVEL, kind: 'page' },
  { shop: 'techlandbd.com', sitemap: 'https://www.techlandbd.com/sitemap.xml', product: ONE_LEVEL, kind: 'page' },
  { shop: 'trusttechbd.com', sitemap: 'https://trusttechbd.com/sitemap.xml', product: ONE_LEVEL, kind: 'page' },
  { shop: 'binarylogic.com.bd', sitemap: 'https://www.binarylogic.com.bd/sitemap.xml', product: ONE_LEVEL, kind: 'page' },
  { shop: 'globalbrand.com.bd', sitemap: 'https://www.globalbrand.com.bd/sitemap.xml', product: ONE_LEVEL, kind: 'page' },
  { shop: 'gadgetandgear.com', sitemap: 'https://gadgetandgear.com/sitemap.xml', product: /\/product\/[^/]+\/?$/, kind: 'page' },
  { shop: 'gadgetbreeze.com.bd', sitemap: 'https://gadgetbreeze.com.bd/sitemap_index.xml', product: /\/product\/[^/]+\/?$/, kind: 'page' }
];
