/* Per-shop search URL templates, with {q} as the encoded query, last requested 2026-11-04.
   Nuffar and AjkerDeal did not respond then, so they use the fallback for now.
   Shops missing here link to their home page (core/links.ts).
   Retailer identities are real; prices, ratings and policies are sample data for the demo. */

import type { Shop } from '../types.js';

export const SEARCH_PATTERNS: Record<Shop['id'], string | undefined> = {
  /* Checked in a browser on 2026-11-23: each showed matching products with prices. */
  'star-tech': 'https://www.startech.com.bd/product/search?search={q}',
  'techland': 'https://www.techlandbd.com/index.php?route=product/search&search={q}',
  'dizmo': 'https://www.dizmo.com.bd/?s={q}&post_type=product',
  'chaldal': 'https://chaldal.com/search/{q}',
  'meena-bazar': 'https://meenabazaronline.com/search/{q}',
  'daraz': 'https://www.daraz.com.bd/catalog/?q={q}',
  'pickaboo': 'https://www.pickaboo.com/?s={q}',
  'othoba': 'https://othoba.com/?s={q}',
  'techtrify': 'https://www.techtrify.com/?s={q}',
  'computer-source': 'https://computersource.com.bd/?s={q}',
  'global-brand': 'https://www.globalbrand.com.bd/?s={q}',
  'binary-logic': 'https://binarylogic.com.bd/?s={q}',
  'trusttech': 'https://trusttechbd.com/?s={q}',
  'apple-gadgets': 'https://www.applegadgetsbd.com/?s={q}',
  'gadget-gear': 'https://gadgetandgear.com/?s={q}',
  'applex': 'https://www.applex.com.bd/?s={q}',
  'istock': 'https://istockbd.com/search?q={q}',
  'rokomari': 'https://www.rokomari.com/search?term={q}',
  'sumash-tech': 'https://www.sumashtech.com/search?q={q}',
  'dazzle': 'https://dazzle.com.bd/search?q={q}',
  'pc-house': 'https://www.pchouse.com.bd/product/search?search={q}',
  'ultra-tech': 'https://www.ultratech.com.bd/product/search?search={q}',
  'ucc': 'https://www.ucc.com.bd/catalogsearch/result/?q={q}',
  'smart-bd': 'https://smartbd.com/?s={q}&post_type=product',
  'transcom-digital': 'https://transcomdigital.com/search?q={q}',
  'vertech': 'https://www.vertech.com.bd/products?search={q}',
  'kry-international': 'https://kryinternational.com/search?q={q}',
  'diamu': 'https://diamu.com.bd/?s={q}&post_type=product',
  'gadget-breeze': 'https://gadgetbreeze.com.bd/?s={q}&post_type=product',
  'gadget-mart': 'https://gadgetmart.com.bd/?s={q}&post_type=product',
  't-tech': 'https://t-tech.com.bd/?s={q}&post_type=product',
  'shopz': 'https://www.shopz.com.bd/?s={q}&post_type=product',
  'gadgetz': 'https://gadgetz.com.bd/?s={q}&post_type=product',
  'motion-view': 'https://motionview.com.bd/search?q={q}',
  'custom-mac': 'https://www.custommacbd.com/search?q={q}',
  'mc-solution': 'https://www.mcsolution.com.bd/?s={q}&post_type=product',
  'vibe-gaming': 'https://www.vibegaming.com.bd/?s={q}&post_type=product',
  'universal-computer': 'https://www.universal.com.bd/index.php?route=product/search&search={q}',
  'sell-tech': 'https://www.selltech.com.bd/index.php?route=product/search&search={q}'
};
