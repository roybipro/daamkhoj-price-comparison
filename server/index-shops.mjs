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
  { shop: 'gadgetbreeze.com.bd', sitemap: 'https://gadgetbreeze.com.bd/sitemap_index.xml', product: /\/product\/[^/]+\/?$/, kind: 'page' },

  /* Added 2026-11-23 after the same check (priced of the first 12 pages, then of 20 read with
     their names and prices looked over): PC House 12 and 20/20, Ultra Tech 12 and 19/20, Smart
     12 and 20/20, Gadget Mart 12 and 20/20, Ryans 10/12 and 32/40, Transcom Digital 10 and
     15/20, KRY 9 and 13/20, Diamu 9 and 16/20, UCC 8 and 10/20, Vertech 8 and 15/20. Ultra Tech
     puts a placeholder price on some out-of-stock items (an Asus TUF monitor at 5,000 taka in
     its own product data); they are marked out of stock, and a price far below other shops'
     is dropped. Mobile Dokan BD passed 12/12 but is a price guide with no cart, so it is not
     here; Skyland, Potaka IT, BD Stall, Pentanik, Walton, Best Electronics and TechShop BD gave
     no readable price, and Pickaboo and BDShop's sitemaps list no product pages. */
  { shop: 'ryans.com', sitemap: 'https://www.ryans.com/sitemap.xml', product: ONE_LEVEL, kind: 'page' },
  { shop: 'pchouse.com.bd', sitemap: 'https://www.pchouse.com.bd/sitemap.xml', product: ONE_LEVEL, kind: 'page' },
  { shop: 'ultratech.com.bd', sitemap: 'https://www.ultratech.com.bd/index.php?route=feed/sitemaps', product: ONE_LEVEL, kind: 'page' },
  { shop: 'smartbd.com', sitemap: 'https://smartbd.com/sitemap_index.xml', product: /\/product\/[^/]+\/?$/, kind: 'page' },
  { shop: 'ucc.com.bd', sitemap: 'https://www.ucc.com.bd/sitemap.xml', product: ONE_LEVEL, kind: 'page' },
  { shop: 'vertech.com.bd', sitemap: 'https://www.vertech.com.bd/sitemap.xml', product: /\/products\/[^/]+\/?$/, kind: 'page' },
  { shop: 'kryinternational.com', sitemap: 'https://kryinternational.com/sitemap.xml', product: /\/products\/[^/]+\/?$/, kind: 'page' },
  { shop: 'diamu.com.bd', sitemap: 'https://diamu.com.bd/sitemap_index.xml', product: /\/product\/[^/]+\/?$/, kind: 'page' },
  { shop: 'gadgetmart.com.bd', sitemap: 'https://gadgetmart.com.bd/sitemap_index.xml', product: /\/product\/[^/]+\/?$/, kind: 'page' },
  { shop: 'transcomdigital.com', sitemap: 'https://transcomdigital.com/sitemap.xml', product: ONE_LEVEL, kind: 'page' },

  /* Added 2026-11-23, found by the live web search (they priced "Baseus Bowie MA10"), after the
     same check: T-Tech 12/12 and 20/20 (earphones and gadgets; many out of stock, shown as such),
     Shopz 12/12 and 20/20 (gadgets and lifestyle: fans, bags, umbrellas). Both have a cart. */
  { shop: 't-tech.com.bd', sitemap: 'https://t-tech.com.bd/sitemap_index.xml', product: /\/product\/[^/]+\/?$/, kind: 'page' },
  { shop: 'shopz.com.bd', sitemap: 'https://www.shopz.com.bd/sitemap.xml', product: /\/product\/[^/]+\/?$/, kind: 'page' },
  /* Gadgetz: 11/12 and 19/20 priced, with a cart; small (295 product pages: chargers, hubs, mice). */
  { shop: 'gadgetz.com.bd', sitemap: 'https://gadgetz.com.bd/sitemap_index.xml', product: /\/product\/[^/]+\/?$/, kind: 'page' },

  /* Added 2026-11-24 after the same 12-page check (priced of 12, all with photos and a cart):
     Motion View 12/12 (788 pages: smartwatches, earbuds, gadgets), Custom Mac BD 11/12 (949 pages:
     Apple, phones, consoles), Universal Computer BD 11/12 (1,465 pages: laptops, SSDs, adapters),
     Sell Tech BD 10/12 (6,522 pages: PC components, monitors, laptops), MC Solution BD 9/12
     (2,179 pages: laptops, MacBooks, monitors), Vibe Gaming 9/12 (5,096 pages: gaming mice,
     keyboards, headsets, GPUs). */
  { shop: 'motionview.com.bd', sitemap: 'https://www.motionview.com.bd/sitemap.xml', product: /\/product\/[^/]+\/?$/, kind: 'page' },
  { shop: 'custommacbd.com', sitemap: 'https://www.custommacbd.com/sitemap.xml', product: /\/products\/[^/]+\/?$/, kind: 'page' },
  { shop: 'mcsolution.com.bd', sitemap: 'https://www.mcsolution.com.bd/sitemap_index.xml', product: ONE_LEVEL, kind: 'page' },
  { shop: 'vibegaming.com.bd', sitemap: 'https://www.vibegaming.com.bd/sitemap_index.xml', product: /\/product\/[^/]+\/?$/, kind: 'page' },
  { shop: 'universal.com.bd', sitemap: 'https://www.universal.com.bd/sitemap.xml', product: ONE_LEVEL, kind: 'page' },
  { shop: 'selltech.com.bd', sitemap: 'https://www.selltech.com.bd/sitemap.xml', product: ONE_LEVEL, kind: 'page' }
];
