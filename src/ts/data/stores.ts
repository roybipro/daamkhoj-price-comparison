/* Every shop DaamKhoj tracks, with the signals behind its trust score.
   Retailer identities are real; prices, ratings and policies are sample data for the demo. */

import type { Shop } from '../types.js';

export const STORES: Shop[] = [
  {
    id: 'star-tech', name: 'Star Tech', bn: 'স্টার টেক', monogram: 'ST', accent: '#1F5FA8',
    url: 'startech.com.bd', kind: 'retailer', since: 2002,
    categories: ['phones', 'computers', 'accessories'],
    cod: true, payments: ['Card', 'bKash', 'Nagad', 'SSLCommerz'], returnsDays: 7,
    officialWarranty: true, coverage: 'nationwide', showrooms: 20, rating: 4.5, reviews: 41200,
    supportVerified: true, incidents: [],
    blurb: 'Dhaka-based IT retailer with brand-authorised warranties and physical showrooms.'
  },
  {
    id: 'ryans', name: 'Ryans Computers', bn: 'রায়ান্স', monogram: 'RC', accent: '#0E7C66',
    url: 'ryans.com', kind: 'retailer', since: 2002,
    categories: ['phones', 'computers', 'accessories'],
    cod: true, payments: ['Card', 'bKash', 'Nagad', 'SSLCommerz'], returnsDays: 7,
    officialWarranty: true, coverage: 'nationwide', showrooms: 12, rating: 4.4, reviews: 33800,
    supportVerified: true, incidents: [],
    blurb: 'Long-running computer retailer; service centre and authorised distributor lines.'
  },
  {
    id: 'computer-source', name: 'Computer Source', bn: 'কম্পিউটার সোর্স', monogram: 'CS', accent: '#5A4A9E',
    url: 'computersource.com.bd', kind: 'retailer', since: 2003,
    categories: ['computers', 'accessories', 'phones'],
    cod: true, payments: ['Card', 'bKash', 'SSLCommerz'], returnsDays: 5,
    officialWarranty: true, coverage: 'nationwide', showrooms: 8, rating: 4.2, reviews: 12400,
    supportVerified: true, incidents: [],
    blurb: 'Component and laptop specialist, active in the enthusiast community.'
  },
  {
    id: 'techtrify', name: 'TechTrify', bn: 'টেকট্রিফাই', monogram: 'TT', accent: '#B25A1F',
    url: 'techtrify.com', kind: 'retailer', since: 2019,
    categories: ['computers', 'accessories', 'phones'],
    cod: true, payments: ['Card', 'bKash', 'Nagad'], returnsDays: 3,
    officialWarranty: true, coverage: 'nationwide', showrooms: 2, rating: 4.0, reviews: 4600,
    supportVerified: true, incidents: [],
    blurb: 'Younger IT storefront; competitive on builds, thinner return window.'
  },
  {
    id: 'app-bazar', name: 'App Bazar', bn: 'অ্যাপ বাজার', monogram: 'AB', accent: '#C0392B',
    url: 'appbazar.com', kind: 'retailer', since: 2015,
    categories: ['accessories', 'phones'],
    cod: true, payments: ['Card', 'bKash', 'Nagad'], returnsDays: 7,
    officialWarranty: false, coverage: 'nationwide', showrooms: 3, rating: 4.1, reviews: 9800,
    supportVerified: true, incidents: [],
    blurb: 'Gadget and accessory retailer; import-line stock, warranty varies by item.'
  },
  {
    id: 'brands-world', name: "Brand's World", bn: 'ব্র্যান্ডস ওয়ার্ল্ড', monogram: 'BW', accent: '#111827',
    url: 'brandsworld.com.bd', kind: 'retailer', since: 2011,
    categories: ['phones', 'accessories'],
    cod: false, payments: ['Card', 'bKash', 'SSLCommerz'], returnsDays: 15,
    officialWarranty: true, coverage: 'nationwide', showrooms: 10, rating: 4.3, reviews: 7300,
    supportVerified: true, incidents: [],
    blurb: 'Apple-focused reseller chain; bills and official warranty on every device.'
  },
  {
    id: 'daraz', name: 'Daraz Bangladesh', bn: 'দারাজ', monogram: 'DZ', accent: '#F57224',
    url: 'daraz.com.bd', kind: 'marketplace', since: 2018,
    categories: ['phones', 'computers', 'accessories', 'appliances', 'grocery', 'beauty', 'fashion', 'books'],
    cod: true, payments: ['Card', 'bKash', 'Nagad', 'Rocket', 'SSLCommerz'], returnsDays: 10,
    officialWarranty: false, coverage: 'nationwide', showrooms: 0, rating: 4.2, reviews: 180000,
    supportVerified: true, incidents: [],
    blurb: 'Largest marketplace in Bangladesh. Trust depends on the seller behind the listing.',
    sellerMatters: true
  },
  {
    id: 'pickaboo', name: 'Pickaboo', bn: 'পিকাবু', monogram: 'PB', accent: '#00A0B0',
    url: 'pickaboo.com', kind: 'marketplace', since: 2017,
    categories: ['phones', 'accessories', 'appliances', 'fashion', 'beauty'],
    cod: true, payments: ['Card', 'bKash', 'Nagad'], returnsDays: 7,
    officialWarranty: false, coverage: 'nationwide', showrooms: 0, rating: 4.0, reviews: 21500,
    supportVerified: true, incidents: [],
    blurb: 'Marketplace for electronics and lifestyle, with a mix of official and third-party sellers.',
    sellerMatters: true
  },
  {
    id: 'ajkerdeal', name: 'AjkerDeal', bn: 'আজকের ডিল', monogram: 'AD', accent: '#D62828',
    url: 'ajkerdeal.com', kind: 'marketplace', since: 2013,
    categories: ['phones', 'accessories', 'appliances', 'fashion'],
    cod: true, payments: ['Card', 'bKash', 'Nagad'], returnsDays: 5,
    officialWarranty: false, coverage: 'nationwide', showrooms: 0, rating: 3.8, reviews: 15600,
    supportVerified: true, incidents: [],
    blurb: 'One of the oldest local marketplaces; delivery speed varies by seller.',
    sellerMatters: true
  },
  {
    id: 'othoba', name: 'Othoba', bn: 'অথবা', monogram: 'OT', accent: '#7A5AF8',
    url: 'othoba.com', kind: 'marketplace', since: 2023,
    categories: ['phones', 'accessories', 'appliances', 'beauty', 'fashion', 'books'],
    cod: true, payments: ['Card', 'bKash', 'Nagad'], returnsDays: 7,
    officialWarranty: false, coverage: 'nationwide', showrooms: 0, rating: 3.9, reviews: 6400,
    supportVerified: false, incidents: [],
    blurb: 'Newer marketplace. Short operating history means less complaint history to learn from.',
    sellerMatters: true
  },
  {
    id: 'evaly', name: 'Evaly', bn: 'এভ্যালি', monogram: 'EV', accent: '#6B7280',
    url: 'evaly.com.bd', kind: 'marketplace', since: 2020, closed: 2021,
    categories: ['phones', 'accessories', 'appliances', 'grocery', 'beauty', 'fashion'],
    cod: false, payments: [], returnsDays: 0,
    officialWarranty: false, coverage: 'none', showrooms: 0, rating: 1.2, reviews: 44000,
    supportVerified: false,
    incidents: [
      { t: 'Shut down in 2021 — customer refunds and seller payouts were never completed', sev: 'fatal' }
    ],
    blurb: 'Collapsed in 2021. Kept in the index as a live reminder that the cheapest price is not always the safest price.'
  },
  {
    id: 'chaldal', name: 'Chaldal', bn: 'চালডাল', monogram: 'CD', accent: '#16803A',
    url: 'chaldal.com', kind: 'retailer', since: 2015,
    categories: ['grocery', 'beauty'],
    cod: true, payments: ['Card', 'bKash', 'Nagad'], returnsDays: 3,
    officialWarranty: false, coverage: 'dhaka-ctg-sylhet', showrooms: 4, rating: 4.4, reviews: 52000,
    supportVerified: true, incidents: [],
    blurb: 'Inventory-held grocery delivery, so listed price is what you pay — no seller roulette.'
  },
  {
    id: 'shokh', name: 'Shokh', bn: 'শখ', monogram: 'SH', accent: '#C2410C',
    url: 'shokh.com.bd', kind: 'retailer', since: 2016,
    categories: ['grocery', 'beauty', 'fashion'],
    cod: true, payments: ['bKash', 'Nagad', 'Card'], returnsDays: 3,
    officialWarranty: false, coverage: 'dhaka', showrooms: 2, rating: 4.1, reviews: 11800,
    supportVerified: true, incidents: [],
    blurb: 'Grocery arm backed by a large local food group; strongest on staple foods.'
  },
  {
    id: 'meena-bazar', name: 'Meena Bazar', bn: 'মীনা বাজার', monogram: 'MB', accent: '#0F766E',
    url: 'meenabazar.com', kind: 'retailer', since: 2011,
    categories: ['grocery', 'beauty'],
    cod: false, payments: ['Card', 'bKash'], returnsDays: 2,
    officialWarranty: false, coverage: 'dhaka', showrooms: 20, rating: 4.0, reviews: 8700,
    supportVerified: true, incidents: [],
    blurb: 'Supermarket chain; online ordering with in-store price matching on weekly flyers.'
  },
  {
    id: 'rokomari', name: 'Rokomari', bn: 'রকমারি', monogram: 'RK', accent: '#B45309',
    url: 'rokomari.com', kind: 'retailer', since: 2010,
    categories: ['books', 'accessories'],
    cod: true, payments: ['Card', 'bKash', 'Nagad', 'SSLCommerz'], returnsDays: 7,
    officialWarranty: false, coverage: 'nationwide', showrooms: 3, rating: 4.6, reviews: 63000,
    supportVerified: true, incidents: [],
    blurb: 'The country’s book retailer. Publisher-direct sourcing, so printed editions are verifiable.'
  },
  {
    id: 'aarong', name: 'Aarong', bn: 'আড়ং', monogram: 'AR', accent: '#7C2D12',
    url: 'aarong.com', kind: 'retailer', since: 1978,
    categories: ['fashion', 'beauty'],
    cod: true, payments: ['Card', 'bKash'], returnsDays: 14,
    officialWarranty: false, coverage: 'nationwide', showrooms: 40, rating: 4.5, reviews: 27000,
    supportVerified: true, incidents: [],
    blurb: 'Forty-seven-year retail brand with the longest traceable service history in this index.'
  },
  {
    id: 'nuffar', name: 'Nuffar', bn: 'নাফার', monogram: 'NF', accent: '#BE185D',
    url: 'nuffar.com', kind: 'brand', since: 2015,
    categories: ['beauty'],
    cod: true, payments: ['Card', 'bKash', 'Nagad'], returnsDays: 7,
    officialWarranty: false, coverage: 'nationwide', showrooms: 6, rating: 4.3, reviews: 19200,
    supportVerified: true, incidents: [],
    blurb: 'Bangladeshi cosmetics maker — buying direct removes the counterfeit risk that grey market beauty carries.'
  },
  {
    id: 'techland', name: 'TechLand BD', bn: 'টেকল্যান্ড', monogram: 'TL', accent: '#1D4ED8',
    url: 'techlandbd.com', kind: 'retailer', since: 2009,
    categories: ['computers', 'accessories', 'phones'],
    cod: true, payments: ['Card', 'bKash', 'Nagad', 'SSLCommerz'], returnsDays: 5,
    officialWarranty: true, coverage: 'nationwide', showrooms: 5, rating: 4.3, reviews: 9100,
    supportVerified: true, incidents: [],
    blurb: 'Long-running Dhaka computer retailer, strong on laptops and build components.'
  },
  {
    id: 'global-brand', name: 'Global Brand', bn: 'গ্লোবাল ব্র্যান্ড', monogram: 'GB', accent: '#1E3A8A',
    url: 'globalbrand.com.bd', kind: 'retailer', since: 2008,
    categories: ['phones', 'accessories'],
    cod: true, payments: ['Card', 'bKash', 'Nagad', 'SSLCommerz'], returnsDays: 7,
    officialWarranty: true, coverage: 'nationwide', showrooms: 25, rating: 4.2, reviews: 14300,
    supportVerified: true, incidents: [],
    blurb: 'Brand-authorised mobile and appliance retailer with counters in malls across the country.'
  },
  {
    id: 'trusttech', name: 'TrustTech', bn: 'ট্রাস্টটেক', monogram: 'TT', accent: '#065F46',
    url: 'trusttechbd.com', kind: 'retailer', since: 2018,
    categories: ['computers', 'accessories'],
    cod: true, payments: ['Card', 'bKash', 'Nagad'], returnsDays: 3,
    officialWarranty: true, coverage: 'nationwide', showrooms: 2, rating: 4.1, reviews: 2600,
    supportVerified: true, incidents: [],
    blurb: 'Laptop-focused retailer that publishes warranty and service terms on every product page.'
  },
  {
    id: 'binary-logic', name: 'Binary Logic', bn: 'বাইনারি লজিক', monogram: 'BL', accent: '#7C3AED',
    url: 'binarylogic.com.bd', kind: 'retailer', since: 2012,
    categories: ['computers', 'accessories'],
    cod: true, payments: ['Card', 'bKash', 'SSLCommerz'], returnsDays: 5,
    officialWarranty: true, coverage: 'nationwide', showrooms: 3, rating: 4.2, reviews: 3400,
    supportVerified: true, incidents: [],
    blurb: 'Component and workstation specialist with an enthusiast service background.'
  },
  {
    id: 'apple-gadgets', name: 'Apple Gadgets BD', bn: 'অ্যাপল গ্যাজেটস', monogram: 'AG', accent: '#111827',
    url: 'applegadgetsbd.com', kind: 'retailer', since: 2016,
    categories: ['phones', 'accessories'],
    cod: false, payments: ['Card', 'bKash', 'Nagad', 'SSLCommerz'], returnsDays: 7,
    officialWarranty: true, coverage: 'nationwide', showrooms: 4, rating: 4.4, reviews: 5200,
    supportVerified: true, incidents: [],
    blurb: 'Apple-only retailer — devices come with bills and international warranty registration.'
  },
  {
    id: 'istock', name: 'iStock BD', bn: 'আইস্টক', monogram: 'IS', accent: '#0F172A',
    url: 'istockbd.com', kind: 'retailer', since: 2017,
    categories: ['phones', 'accessories'],
    cod: true, payments: ['Card', 'bKash', 'Nagad'], returnsDays: 7,
    officialWarranty: true, coverage: 'nationwide', showrooms: 6, rating: 4.3, reviews: 4100,
    supportVerified: true, incidents: [],
    blurb: 'Apple and premium gadget retailer with in-exchange pricing on old phones.'
  },
  {
    id: 'gadget-gear', name: 'Gadget & Gear', bn: 'গ্যাজেট অ্যান্ড গিয়ার', monogram: 'GG', accent: '#9333EA',
    url: 'gadgetandgear.com', kind: 'retailer', since: 2013,
    categories: ['phones', 'accessories'],
    cod: true, payments: ['Card', 'bKash', 'Nagad', 'SSLCommerz'], returnsDays: 7,
    officialWarranty: true, coverage: 'nationwide', showrooms: 8, rating: 4.2, reviews: 6800,
    supportVerified: true, incidents: [],
    blurb: 'Gadget chain in Bashundhara Residential; runs its own Apple counter and accessory bar.'
  },
  {
    id: 'applex', name: 'Applex', bn: 'অ্যাপলেক্স', monogram: 'AX', accent: '#B91C1C',
    url: 'applex.com.bd', kind: 'retailer', since: 2019,
    categories: ['phones', 'accessories'],
    cod: true, payments: ['Card', 'bKash', 'Nagad'], returnsDays: 5,
    officialWarranty: false, coverage: 'nationwide', showrooms: 3, rating: 4.0, reviews: 2900,
    supportVerified: true, incidents: [],
    blurb: 'Premium smartphone retailer; grey-import stock is common, so check warranty coverage.'
  },
  {
    id: 'dizmo', name: 'Dizmo', bn: 'ডিজমো', monogram: 'DZ', accent: '#334155',
    url: 'dizmo.com.bd', kind: 'retailer', since: 2020,
    categories: ['phones', 'accessories'],
    cod: true, payments: ['Card', 'bKash', 'Nagad'], returnsDays: 3,
    officialWarranty: false, coverage: 'dhaka', showrooms: 1, rating: 3.9, reviews: 1400,
    supportVerified: false, incidents: [],
    blurb: 'Young Apple reseller. Short history and one outlet means less complaint record to learn from.'
  }
];
