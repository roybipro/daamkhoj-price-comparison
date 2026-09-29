/* Verified per-shop search URL templates, with {q} as the encoded query.
   Shops missing here fall back to a site-scoped search in core/links.js.
   Retailer identities are real; prices, ratings and policies are sample data for the demo. */

import type { Shop } from '../types.js';

export const SEARCH_PATTERNS: Record<Shop['id'], string | undefined> = {
  'daraz': 'https://www.daraz.com.bd/catalog/?q={q}',
  'pickaboo': 'https://www.pickaboo.com/?s={q}',
  'ajkerdeal': 'https://www.ajkerdeal.com/?s={q}',
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
  'rokomari': 'https://www.rokomari.com/book/search?query={q}',
  'nuffar': 'https://nuffar.com/?s={q}'
};
