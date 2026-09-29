/* Catalogue metadata: snapshot date, categories and the trust weight table.
   Retailer identities are real; prices, ratings and policies are sample data for the demo. */

import type { Category, Snapshot, TrustWeight } from '../types.js';

export const SNAPSHOT: Snapshot = {
  date: '2026-09-27',
  label: 'Sample data · 27 September 2026',
  note: 'sample'
};

export const CATEGORIES: Category[] = [
  { id: 'phones', en: 'Mobile phones', bn: 'মোবাইল ফোন' },
  { id: 'computers', en: 'Laptops & PCs', bn: 'ল্যাপটপ ও কম্পিউটার' },
  { id: 'accessories', en: 'Gadgets & accessories', bn: 'গ্যাজেট ও এক্সেসরিজ' },
  { id: 'appliances', en: 'Home appliances', bn: 'গৃহউপকরণ' },
  { id: 'grocery', en: 'Groceries', bn: 'মুদি ও নিত্যপণ্য' },
  { id: 'beauty', en: 'Beauty & personal care', bn: 'বিউটি ও পার্সোনাল কেয়ার' },
  { id: 'fashion', en: 'Clothing & lifestyle', bn: 'পোশাক ও লাইফস্টাইল' },
  { id: 'books', en: 'Books & stationery', bn: 'বই ও স্টেশনারি' }
];

/* Weights are shown verbatim in the How it works tab so a shop can dispute a number. */
export const TRUST_WEIGHTS: TrustWeight[] = [
  { id: 'identity', label: 'Verified business & history', check: 'Trade licence, years trading and whether physical shops exist behind the website', weight: 20 },
  { id: 'feedback', label: 'Buyer rating & review volume', check: 'Rating of the shop — or of the exact seller on a marketplace — weighted by how many reviews stand behind it', weight: 20 },
  { id: 'payment', label: 'Payment & refund safety', check: 'Card gateway, bKash or Nagad, and whether the platform holds the money until delivery', weight: 15 },
  { id: 'returns', label: 'Return & exchange window', check: 'How many days you have to send the item back, and whether that window is published', weight: 15 },
  { id: 'authenticity', label: 'Authenticity & warranty', check: 'Authorised distribution, official warranty, and how far the price sits under the market', weight: 15 },
  { id: 'logistics', label: 'Delivery coverage & speed', check: 'Districts served and the days quoted for the item you are looking at', weight: 5 },
  { id: 'support', label: 'Reachable support', check: 'A hotline that answers, plus a service desk you can physically walk into', weight: 10 }
];
