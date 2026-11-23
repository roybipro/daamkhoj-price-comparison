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
  'rokomari': 'https://www.rokomari.com/search?term={q}'
};
