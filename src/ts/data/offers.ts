/* One row per product/shop listing, as a tuple to keep the file readable.
   Retailer identities are real; prices, ratings and policies are sample data for the demo. */

import type { RawOffer } from '../types.js';

export const RAW_OFFERS: RawOffer[] = [
  ['realme-note-60', 'daraz', 13490, 15990, 3, 0, 'Mobile Bazaar Official', 4.5, 2140],
  ['realme-note-60', 'star-tech', 13990, 14490, 2, 0, '', 0, 0],
  ['realme-note-60', 'pickaboo', 13250, 15500, 4, 60, 'Dhaka Gadget House', 3.6, 88],
  ['realme-note-60', 'ryans', 14490, 14490, 2, 0, '', 0, 0],
  ['realme-note-60', 'othoba', 13100, 15200, 7, 0, 'Phone Hub BD', 3.2, 41],
  ['realme-note-60', 'evaly', 11500, 14990, 14, 0, '', 0, 0],

  ['redmi-14c', 'star-tech', 18990, 19990, 2, 0, '', 0, 0],
  ['redmi-14c', 'ryans', 19490, 19490, 3, 0, '', 0, 0],
  ['redmi-14c', 'daraz', 18450, 20990, 3, 0, 'Xiaomi Authorized BD', 4.6, 970],
  ['redmi-14c', 'techtrify', 19900, 19900, 4, 0, '', 0, 0],
  ['redmi-14c', 'pickaboo', 17990, 20500, 5, 60, 'Best Price Telecom', 2.9, 63],
  ['redmi-14c', 'app-bazar', 18750, 18750, 2, 0, '', 0, 0],

  ['galaxy-a16', 'star-tech', 29990, 31990, 2, 0, '', 0, 0],
  ['galaxy-a16', 'ryans', 30500, 31990, 2, 0, '', 0, 0],
  ['galaxy-a16', 'daraz', 28900, 32990, 4, 0, 'Samsung Partner Store', 4.7, 1530],
  ['galaxy-a16', 'othoba', 28400, 32000, 8, 0, 'Gadget Mart', 3.0, 22],
  ['galaxy-a16', 'app-bazar', 30200, 30200, 3, 0, '', 0, 0],

  ['walton-primo-rx8', 'daraz', 9990, 11490, 3, 0, 'Walton Official Store', 4.6, 820],
  ['walton-primo-rx8', 'pickaboo', 10490, 11490, 4, 60, 'Primo Point', 3.9, 130],
  ['walton-primo-rx8', 'ajkerdeal', 9900, 11990, 5, 80, 'Dhaka Mobile Store', 4.1, 240],
  ['walton-primo-rx8', 'ryans', 10990, 10990, 3, 0, '', 0, 0],
  ['walton-primo-rx8', 'othoba', 9650, 11990, 9, 0, 'Mobile Bazar BD', 2.7, 19],

  ['iphone-15', 'brands-world', 94900, 99900, 2, 0, '', 0, 0],
  ['iphone-15', 'star-tech', 92500, 97000, 2, 0, '', 0, 0],
  ['iphone-15', 'ryans', 97500, 99900, 3, 0, '', 0, 0],
  ['iphone-15', 'daraz', 89000, 104900, 5, 0, 'iStore Premium', 3.4, 96],
  ['iphone-15', 'app-bazar', 102000, 102000, 2, 0, '', 0, 0],
  ['iphone-15', 'evaly', 74500, 99900, 21, 0, '', 0, 0],

  ['hp-250-g9', 'star-tech', 78500, 82000, 2, 0, '', 0, 0],
  ['hp-250-g9', 'ryans', 80900, 84900, 3, 0, '', 0, 0],
  ['hp-250-g9', 'computer-source', 76900, 81500, 3, 0, '', 0, 0],
  ['hp-250-g9', 'techtrify', 79400, 79400, 4, 0, '', 0, 0],
  ['hp-250-g9', 'daraz', 74500, 86000, 6, 0, 'Laptop Bazaar', 3.3, 54],

  ['ideapad-slim-3', 'ryans', 62900, 66900, 2, 0, '', 0, 0],
  ['ideapad-slim-3', 'star-tech', 64500, 66900, 2, 0, '', 0, 0],
  ['ideapad-slim-3', 'computer-source', 61200, 66000, 4, 0, '', 0, 0],
  ['ideapad-slim-3', 'techtrify', 63900, 63900, 5, 0, '', 0, 0],
  ['ideapad-slim-3', 'othoba', 58900, 68000, 10, 0, 'Import Tech BD', 2.6, 31],

  ['lenovo-qct-2504', 'daraz', 899, 1490, 3, 0, 'Audio Village', 4.2, 3400],
  ['lenovo-qct-2504', 'pickaboo', 1190, 1590, 3, 60, 'Gadget Zone', 4.0, 420],
  ['lenovo-qct-2504', 'app-bazar', 1490, 1490, 2, 0, '', 0, 0],
  ['lenovo-qct-2504', 'ajkerdeal', 990, 1690, 5, 80, 'Smart Shop BD', 3.5, 210],
  ['lenovo-qct-2504', 'othoba', 799, 1800, 9, 0, 'Trendy Mart', 2.4, 47],
  ['lenovo-qct-2504', 'evaly', 620, 1500, 20, 0, '', 0, 0],

  ['edifier-w800bt', 'daraz', 4290, 4990, 3, 0, 'Edifier Official BD', 4.6, 780],
  ['edifier-w800bt', 'app-bazar', 4690, 4990, 2, 0, '', 0, 0],
  ['edifier-w800bt', 'pickaboo', 4990, 5490, 4, 60, 'Sound Hub', 3.8, 90],
  ['edifier-w800bt', 'othoba', 4450, 5200, 8, 0, 'Audio Mart', 3.1, 26],

  ['romoss-20000', 'daraz', 2190, 2990, 3, 0, 'Power Station BD', 4.3, 1900],
  ['romoss-20000', 'app-bazar', 2450, 2790, 2, 0, '', 0, 0],
  ['romoss-20000', 'pickaboo', 2299, 2990, 4, 60, 'Mobile Accessory House', 3.7, 150],
  ['romoss-20000', 'ajkerdeal', 2590, 2990, 5, 80, 'Charger Ghar', 4.0, 88],

  ['tplink-archer-c6', 'star-tech', 2790, 3100, 2, 0, '', 0, 0],
  ['tplink-archer-c6', 'ryans', 2950, 3100, 2, 0, '', 0, 0],
  ['tplink-archer-c6', 'daraz', 2650, 3400, 3, 0, 'Networking World', 4.1, 610],
  ['tplink-archer-c6', 'computer-source', 2890, 3100, 3, 0, '', 0, 0],
  ['tplink-archer-c6', 'techtrify', 3050, 3050, 4, 0, '', 0, 0],

  ['wd-sn580-1tb', 'star-tech', 6790, 7400, 2, 0, '', 0, 0],
  ['wd-sn580-1tb', 'ryans', 7150, 7400, 2, 0, '', 0, 0],
  ['wd-sn580-1tb', 'computer-source', 6450, 7200, 3, 0, '', 0, 0],
  ['wd-sn580-1tb', 'daraz', 6290, 7900, 4, 0, 'Storage Point', 3.2, 74],
  ['wd-sn580-1tb', 'techtrify', 6990, 6990, 4, 0, '', 0, 0],

  ['walton-43-led', 'daraz', 30900, 34900, 5, 0, 'Walton Official Store', 4.6, 820],
  ['walton-43-led', 'ajkerdeal', 32500, 35900, 6, 250, 'Appliance Bazar', 4.0, 160],
  ['walton-43-led', 'pickaboo', 31490, 35900, 5, 200, 'TV House BD', 3.5, 74],
  ['walton-43-led', 'othoba', 33900, 36900, 11, 0, 'Home Living BD', 2.8, 18],

  ['miniket-rice-5kg', 'chaldal', 545, 580, 1, 0, '', 0, 0],
  ['miniket-rice-5kg', 'shokh', 520, 560, 1, 0, '', 0, 0],
  ['miniket-rice-5kg', 'meena-bazar', 575, 600, 2, 0, '', 0, 0],
  ['miniket-rice-5kg', 'daraz', 599, 700, 3, 40, 'Maa Rice Mill', 3.9, 320],
  ['miniket-rice-5kg', 'evaly', 430, 620, 12, 0, '', 0, 0],

  ['soybean-oil-5l', 'chaldal', 1225, 1290, 1, 0, '', 0, 0],
  ['soybean-oil-5l', 'shokh', 1199, 1280, 1, 0, '', 0, 0],
  ['soybean-oil-5l', 'meena-bazar', 1260, 1290, 2, 0, '', 0, 0],
  ['soybean-oil-5l', 'daraz', 1310, 1420, 3, 40, 'Grocery Point', 4.0, 210],

  ['farm-eggs-12', 'chaldal', 178, 190, 1, 0, '', 0, 0],
  ['farm-eggs-12', 'shokh', 165, 185, 1, 0, '', 0, 0],
  ['farm-eggs-12', 'meena-bazar', 189, 189, 2, 0, '', 0, 0],

  ['masoor-dal-1kg', 'shokh', 145, 160, 1, 0, '', 0, 0],
  ['masoor-dal-1kg', 'chaldal', 152, 165, 1, 0, '', 0, 0],
  ['masoor-dal-1kg', 'meena-bazar', 159, 165, 2, 0, '', 0, 0],
  ['masoor-dal-1kg', 'daraz', 168, 190, 3, 40, 'Dal Ghor', 3.6, 95],

  ['nuffar-lipstick', 'nuffar', 390, 450, 2, 0, '', 0, 0],
  ['nuffar-lipstick', 'daraz', 450, 590, 3, 0, 'Beauty Bazar BD', 4.1, 640],
  ['nuffar-lipstick', 'shokh', 420, 460, 2, 0, '', 0, 0],
  ['nuffar-lipstick', 'ajkerdeal', 340, 520, 5, 60, 'Cosmetic Corner', 2.8, 52],

  ['aarong-panjabi', 'aarong', 2190, 2190, 3, 0, '', 0, 0],
  ['aarong-panjabi', 'daraz', 1980, 2600, 4, 0, 'Panjabi House', 3.7, 140],
  ['aarong-panjabi', 'pickaboo', 2350, 2600, 4, 60, 'Fashion Point BD', 3.9, 60],

  ['feluda-samagro', 'rokomari', 850, 950, 2, 0, '', 0, 0],
  ['feluda-samagro', 'daraz', 920, 1100, 4, 40, 'Boi Bhandar', 4.2, 310],
  ['feluda-samagro', 'othoba', 790, 1050, 9, 0, 'Book Station', 2.9, 24],

  ['casio-f91w', 'daraz', 2650, 3200, 3, 0, 'Watch Bazaar', 4.0, 480],
  ['casio-f91w', 'ajkerdeal', 2890, 3300, 5, 60, 'Style Hub', 3.4, 66],
  ['casio-f91w', 'app-bazar', 2790, 2990, 2, 0, '', 0, 0],

  ['iphone-15', 'apple-gadgets', 91900, 99900, 2, 0, '', 0, 0],
  ['iphone-15', 'istock', 93500, 99900, 2, 0, '', 0, 0],
  ['iphone-15', 'gadget-gear', 95000, 99900, 3, 0, '', 0, 0],
  ['iphone-15', 'applex', 88500, 99900, 4, 0, '', 0, 0],
  ['iphone-15', 'dizmo', 90500, 99900, 5, 0, '', 0, 0],

  ['realme-note-60', 'global-brand', 13790, 14490, 2, 0, '', 0, 0],
  ['redmi-14c', 'global-brand', 18690, 19990, 3, 0, '', 0, 0],
  ['galaxy-a16', 'global-brand', 29490, 31990, 2, 0, '', 0, 0],
  ['walton-primo-rx8', 'global-brand', 9890, 10990, 3, 60, '', 0, 0],

  ['hp-250-g9', 'techland', 77500, 82000, 3, 0, '', 0, 0],
  ['hp-250-g9', 'trusttech', 76200, 81000, 4, 0, '', 0, 0],
  ['hp-250-g9', 'binary-logic', 78900, 82000, 3, 0, '', 0, 0],
  ['ideapad-slim-3', 'techland', 62400, 66000, 4, 0, '', 0, 0],
  ['ideapad-slim-3', 'trusttech', 61900, 65000, 3, 0, '', 0, 0],

  ['wd-sn580-1tb', 'binary-logic', 6590, 7200, 3, 0, '', 0, 0],
  ['wd-sn580-1tb', 'techland', 6690, 7200, 3, 0, '', 0, 0],
  ['tplink-archer-c6', 'techland', 2750, 3100, 3, 0, '', 0, 0],

  ['edifier-w800bt', 'gadget-gear', 4590, 4990, 3, 0, '', 0, 0],
  ['romoss-20000', 'applex', 2350, 2790, 3, 0, '', 0, 0],
  ['romoss-20000', 'dizmo', 2150, 2790, 4, 0, '', 0, 0],
  ['lenovo-qct-2504', 'applex', 950, 1290, 4, 0, '', 0, 0],
  ['lenovo-qct-2504', 'dizmo', 890, 1290, 5, 0, '', 0, 0]
];
