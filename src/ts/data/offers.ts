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

  ['galaxy-a16', 'star-tech', 29990, 31990, 2, 0, '', 0, 0],
  ['galaxy-a16', 'ryans', 30500, 31990, 2, 0, '', 0, 0],
  ['galaxy-a16', 'daraz', 28900, 32990, 4, 0, 'Samsung Partner Store', 4.7, 1530],
  ['galaxy-a16', 'othoba', 28400, 32000, 8, 0, 'Gadget Mart', 3.0, 22],

  ['walton-primo-rx8', 'daraz', 9990, 11490, 3, 0, 'Walton Official Store', 4.6, 820],
  ['walton-primo-rx8', 'pickaboo', 10490, 11490, 4, 60, 'Primo Point', 3.9, 130],
  ['walton-primo-rx8', 'ajkerdeal', 9900, 11990, 5, 80, 'Dhaka Mobile Store', 4.1, 240],
  ['walton-primo-rx8', 'ryans', 10990, 10990, 3, 0, '', 0, 0],
  ['walton-primo-rx8', 'othoba', 9650, 11990, 9, 0, 'Mobile Bazar BD', 2.7, 19],

  ['iphone-15', 'star-tech', 92500, 97000, 2, 0, '', 0, 0],
  ['iphone-15', 'ryans', 97500, 99900, 3, 0, '', 0, 0],
  ['iphone-15', 'daraz', 89000, 104900, 5, 0, 'iStore Premium', 3.4, 96],
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
  ['lenovo-qct-2504', 'ajkerdeal', 990, 1690, 5, 80, 'Smart Shop BD', 3.5, 210],
  ['lenovo-qct-2504', 'othoba', 749, 1800, 9, 0, 'Trendy Mart', 2.4, 47],
  ['lenovo-qct-2504', 'evaly', 620, 1500, 20, 0, '', 0, 0],

  ['edifier-w800bt', 'daraz', 4290, 4990, 3, 0, 'Edifier Official BD', 4.6, 780],
  ['edifier-w800bt', 'pickaboo', 4990, 5490, 4, 60, 'Sound Hub', 3.8, 90],
  ['edifier-w800bt', 'othoba', 4450, 5200, 8, 0, 'Audio Mart', 3.1, 26],

  ['romoss-20000', 'daraz', 2190, 2990, 3, 0, 'Power Station BD', 4.3, 1900],
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
  ['miniket-rice-5kg', 'meena-bazar', 575, 600, 2, 0, '', 0, 0],
  ['miniket-rice-5kg', 'daraz', 599, 700, 3, 40, 'Maa Rice Mill', 3.9, 320],
  ['miniket-rice-5kg', 'evaly', 430, 620, 12, 0, '', 0, 0],

  ['soybean-oil-5l', 'chaldal', 1225, 1290, 1, 0, '', 0, 0],
  ['soybean-oil-5l', 'meena-bazar', 1260, 1290, 2, 0, '', 0, 0],
  ['soybean-oil-5l', 'daraz', 1310, 1420, 3, 40, 'Grocery Point', 4.0, 210],

  ['farm-eggs-12', 'chaldal', 178, 190, 1, 0, '', 0, 0],
  ['farm-eggs-12', 'meena-bazar', 189, 189, 2, 0, '', 0, 0],

  ['masoor-dal-1kg', 'chaldal', 152, 165, 1, 0, '', 0, 0],
  ['masoor-dal-1kg', 'meena-bazar', 159, 165, 2, 0, '', 0, 0],
  ['masoor-dal-1kg', 'daraz', 168, 190, 3, 40, 'Dal Ghor', 3.6, 95],

  ['nuffar-lipstick', 'nuffar', 390, 450, 2, 0, '', 0, 0],
  ['nuffar-lipstick', 'daraz', 450, 590, 3, 0, 'Beauty Bazar BD', 4.1, 640],
  ['nuffar-lipstick', 'ajkerdeal', 340, 520, 5, 60, 'Cosmetic Corner', 2.8, 52],

  ['aarong-panjabi', 'aarong', 2190, 2190, 3, 0, '', 0, 0],
  ['aarong-panjabi', 'daraz', 1980, 2600, 4, 0, 'Panjabi House', 3.7, 140],
  ['aarong-panjabi', 'pickaboo', 2350, 2600, 4, 60, 'Fashion Point BD', 3.9, 60],

  ['feluda-samagro', 'rokomari', 850, 950, 2, 0, '', 0, 0],
  ['feluda-samagro', 'daraz', 920, 1100, 4, 40, 'Boi Bhandar', 4.2, 310],
  ['feluda-samagro', 'othoba', 790, 1050, 9, 0, 'Book Station', 2.9, 24],

  ['casio-f91w', 'daraz', 2650, 3200, 3, 0, 'Watch Bazaar', 4.0, 480],
  ['casio-f91w', 'ajkerdeal', 2890, 3300, 5, 60, 'Style Hub', 3.4, 66],

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
  ['lenovo-qct-2504', 'dizmo', 890, 1290, 5, 0, '', 0, 0],

  ['redmi-note-14', 'sumash-tech', 23990, 25990, 2, 0, '', 0, 0],
  ['redmi-note-14', 'apple-gadgets', 24200, 25990, 2, 0, '', 0, 0],
  ['redmi-note-14', 'dazzle', 24500, 25990, 3, 0, '', 0, 0],
  ['redmi-note-14', 'kry-international', 23800, 25500, 3, 0, '', 0, 0],
  ['redmi-note-14', 'diamu', 23500, 25500, 3, 0, '', 0, 0],

  ['galaxy-s24-ultra', 'sumash-tech', 118500, 129900, 2, 0, '', 0, 0],
  ['galaxy-s24-ultra', 'apple-gadgets', 117900, 129900, 2, 0, '', 0, 0],
  ['galaxy-s24-ultra', 'dazzle', 119000, 129900, 3, 0, '', 0, 0],
  ['galaxy-s24-ultra', 'istock', 119500, 129900, 2, 0, '', 0, 0],
  ['galaxy-s24-ultra', 'transcom-digital', 124900, 134900, 2, 0, '', 0, 0],

  ['macbook-air-m4', 'apple-gadgets', 136900, 145000, 2, 0, '', 0, 0],
  ['macbook-air-m4', 'istock', 137500, 145000, 2, 0, '', 0, 0],
  ['macbook-air-m4', 'vertech', 138000, 145000, 3, 0, '', 0, 0],
  ['macbook-air-m4', 'star-tech', 139500, 146000, 2, 0, '', 0, 0],
  ['macbook-air-m4', 'ryans', 141000, 146000, 2, 0, '', 0, 0],

  ['ipad-air-m3', 'apple-gadgets', 74500, 79900, 2, 0, '', 0, 0],
  ['ipad-air-m3', 'istock', 75000, 79900, 2, 0, '', 0, 0],
  ['ipad-air-m3', 'dazzle', 75500, 79900, 3, 0, '', 0, 0],
  ['ipad-air-m3', 'sumash-tech', 74900, 79900, 2, 0, '', 0, 0],
  ['ipad-air-m3', 'gadget-gear', 77500, 81900, 2, 0, '', 0, 0],

  ['ryzen-5-5600', 'star-tech', 12200, 13500, 2, 0, '', 0, 0],
  ['ryzen-5-5600', 'techland', 11900, 13200, 2, 0, '', 0, 0],
  ['ryzen-5-5600', 'pc-house', 11800, 13000, 2, 0, '', 0, 0],
  ['ryzen-5-5600', 'ultra-tech', 11850, 13000, 3, 0, '', 0, 0],
  ['ryzen-5-5600', 'ucc', 12400, 13500, 2, 0, '', 0, 0],
  ['ryzen-5-5600', 'smart-bd', 12300, 13500, 2, 0, '', 0, 0],

  ['airpods-pro-2', 'apple-gadgets', 25900, 28900, 2, 0, '', 0, 0],
  ['airpods-pro-2', 'istock', 26200, 28900, 2, 0, '', 0, 0],
  ['airpods-pro-2', 'sumash-tech', 25800, 28500, 2, 0, '', 0, 0],
  ['airpods-pro-2', 'gadget-gear', 27500, 29900, 2, 0, '', 0, 0],
  ['airpods-pro-2', 'dazzle', 26400, 28900, 3, 0, '', 0, 0],

  ['apple-watch-s10', 'apple-gadgets', 46500, 51000, 2, 0, '', 0, 0],
  ['apple-watch-s10', 'istock', 46900, 51000, 2, 0, '', 0, 0],
  ['apple-watch-s10', 'sumash-tech', 46800, 51000, 2, 0, '', 0, 0],
  ['apple-watch-s10', 'dazzle', 47200, 51500, 3, 0, '', 0, 0],
  ['apple-watch-s10', 'kry-international', 47000, 51000, 3, 0, '', 0, 0],

  ['anker-335-20000', 'apple-gadgets', 3450, 3990, 2, 0, '', 0, 0],
  ['anker-335-20000', 'sumash-tech', 3490, 3990, 2, 0, '', 0, 0],
  ['anker-335-20000', 'gadgetz', 3390, 3900, 3, 0, '', 0, 0],
  ['anker-335-20000', 't-tech', 3400, 3900, 3, 0, '', 0, 0],
  ['anker-335-20000', 'gadget-gear', 3790, 4200, 2, 0, '', 0, 0],

  ['jbl-flip-6', 'gadget-gear', 12900, 14500, 2, 0, '', 0, 0],
  ['jbl-flip-6', 'apple-gadgets', 12200, 13900, 2, 0, '', 0, 0],
  ['jbl-flip-6', 'sumash-tech', 12300, 13900, 2, 0, '', 0, 0],
  ['jbl-flip-6', 'gadget-breeze', 12400, 13900, 3, 0, '', 0, 0],
  ['jbl-flip-6', 'kry-international', 12500, 14000, 3, 0, '', 0, 0],

  ['jisulife-pro1', 'apple-gadgets', 3150, 3690, 2, 0, '', 0, 0],
  ['jisulife-pro1', 'sumash-tech', 3190, 3690, 2, 0, '', 0, 0],
  ['jisulife-pro1', 'kry-international', 3100, 3600, 3, 0, '', 0, 0],
  ['jisulife-pro1', 'shopz', 3250, 3750, 3, 0, '', 0, 0],
  ['jisulife-pro1', 'diamu', 3200, 3650, 3, 0, '', 0, 0],

  ['cudy-wr1300e', 'star-tech', 2350, 2650, 2, 0, '', 0, 0],
  ['cudy-wr1300e', 'techland', 2290, 2600, 2, 0, '', 0, 0],
  ['cudy-wr1300e', 'pc-house', 2250, 2600, 2, 0, '', 0, 0],
  ['cudy-wr1300e', 'ultra-tech', 2280, 2600, 3, 0, '', 0, 0],
  ['cudy-wr1300e', 'ryans', 2400, 2650, 2, 0, '', 0, 0],

  ['samsung-43-uhd-tv', 'transcom-digital', 44900, 49900, 2, 0, '', 0, 0],
  ['samsung-43-uhd-tv', 'star-tech', 43500, 48000, 3, 0, '', 0, 0],
  ['samsung-43-uhd-tv', 'ryans', 44200, 48500, 3, 0, '', 0, 0],
  ['samsung-43-uhd-tv', 'gadget-mart', 42900, 47500, 4, 0, '', 0, 0],

  ['poco-x7-pro', 'sumash-tech', 39990, 43990, 2, 0, '', 0, 0],
  ['poco-x7-pro', 'apple-gadgets', 40500, 43990, 2, 0, '', 0, 0],
  ['poco-x7-pro', 'dazzle', 40900, 43990, 3, 0, '', 0, 0],
  ['poco-x7-pro', 'kry-international', 39800, 43500, 3, 0, '', 0, 0],
  ['poco-x7-pro', 'custom-mac', 40200, 43990, 2, 0, '', 0, 0],

  ['honor-pad-x9', 'apple-gadgets', 23900, 26900, 2, 0, '', 0, 0],
  ['honor-pad-x9', 'sumash-tech', 24200, 26900, 2, 0, '', 0, 0],
  ['honor-pad-x9', 'star-tech', 24900, 27500, 2, 0, '', 0, 0],
  ['honor-pad-x9', 'ryans', 25200, 27500, 2, 0, '', 0, 0],
  ['honor-pad-x9', 'mc-solution', 24500, 27000, 3, 0, '', 0, 0],

  ['msi-pro-mp223', 'star-tech', 10800, 11800, 2, 0, '', 0, 0],
  ['msi-pro-mp223', 'techland', 10500, 11500, 2, 0, '', 0, 0],
  ['msi-pro-mp223', 'pc-house', 10400, 11500, 2, 0, '', 0, 0],
  ['msi-pro-mp223', 'ucc', 10900, 11800, 2, 0, '', 0, 0],
  ['msi-pro-mp223', 'sell-tech', 10600, 11500, 3, 0, '', 0, 0],
  ['msi-pro-mp223', 'universal-computer', 10550, 11500, 3, 0, '', 0, 0],

  ['corsair-vengeance-16gb', 'star-tech', 4200, 4800, 2, 0, '', 0, 0],
  ['corsair-vengeance-16gb', 'techland', 4050, 4600, 2, 0, '', 0, 0],
  ['corsair-vengeance-16gb', 'pc-house', 3990, 4500, 2, 0, '', 0, 0],
  ['corsair-vengeance-16gb', 'ultra-tech', 4100, 4600, 3, 0, '', 0, 0],
  ['corsair-vengeance-16gb', 'sell-tech', 4000, 4500, 3, 0, '', 0, 0],
  ['corsair-vengeance-16gb', 'universal-computer', 4050, 4550, 3, 0, '', 0, 0],

  ['logitech-g304', 'vibe-gaming', 3650, 4200, 2, 0, '', 0, 0],
  ['logitech-g304', 'star-tech', 3850, 4300, 2, 0, '', 0, 0],
  ['logitech-g304', 'techland', 3750, 4200, 2, 0, '', 0, 0],
  ['logitech-g304', 'pc-house', 3700, 4200, 2, 0, '', 0, 0],
  ['logitech-g304', 'ryans', 3900, 4300, 2, 0, '', 0, 0],

  ['razer-deathadder-v2x', 'vibe-gaming', 4450, 5200, 2, 0, '', 0, 0],
  ['razer-deathadder-v2x', 'star-tech', 4650, 5300, 2, 0, '', 0, 0],
  ['razer-deathadder-v2x', 'techland', 4550, 5200, 2, 0, '', 0, 0],
  ['razer-deathadder-v2x', 'pc-house', 4500, 5200, 2, 0, '', 0, 0],
  ['razer-deathadder-v2x', 'sell-tech', 4600, 5200, 3, 0, '', 0, 0],

  ['amazfit-bip-5', 'motion-view', 6490, 7490, 2, 0, '', 0, 0],
  ['amazfit-bip-5', 'apple-gadgets', 6550, 7490, 2, 0, '', 0, 0],
  ['amazfit-bip-5', 'sumash-tech', 6590, 7490, 2, 0, '', 0, 0],
  ['amazfit-bip-5', 'gadget-gear', 6990, 7690, 2, 0, '', 0, 0],
  ['amazfit-bip-5', 'star-tech', 6750, 7500, 2, 0, '', 0, 0],

  ['soundcore-r50i', 'motion-view', 1850, 2290, 2, 0, '', 0, 0],
  ['soundcore-r50i', 'apple-gadgets', 1790, 2250, 2, 0, '', 0, 0],
  ['soundcore-r50i', 'sumash-tech', 1820, 2250, 2, 0, '', 0, 0],
  ['soundcore-r50i', 'gadgetz', 1800, 2200, 3, 0, '', 0, 0],
  ['soundcore-r50i', 't-tech', 1780, 2200, 3, 0, '', 0, 0],

  ['ugreen-65w-gan', 'gadgetz', 2950, 3500, 3, 0, '', 0, 0],
  ['ugreen-65w-gan', 'apple-gadgets', 2990, 3500, 2, 0, '', 0, 0],
  ['ugreen-65w-gan', 'sumash-tech', 3050, 3550, 2, 0, '', 0, 0],
  ['ugreen-65w-gan', 'custom-mac', 3100, 3600, 2, 0, '', 0, 0],
  ['ugreen-65w-gan', 'motion-view', 3090, 3590, 2, 0, '', 0, 0],

  ['ps5-slim-disc', 'custom-mac', 63500, 69900, 2, 0, '', 0, 0],
  ['ps5-slim-disc', 'apple-gadgets', 62900, 69900, 2, 0, '', 0, 0],
  ['ps5-slim-disc', 'sumash-tech', 63200, 69900, 2, 0, '', 0, 0],
  ['ps5-slim-disc', 'dazzle', 63900, 69900, 3, 0, '', 0, 0],
  ['ps5-slim-disc', 'star-tech', 65500, 71000, 2, 0, '', 0, 0],

  ['macbook-air-m4', 'custom-mac', 136500, 145000, 2, 0, '', 0, 0],
  ['macbook-air-m4', 'mc-solution', 136800, 145000, 2, 0, '', 0, 0]
];
