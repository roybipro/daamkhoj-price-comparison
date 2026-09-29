/* Products in the sample catalogue. `bn` and `aliases` feed search, not the UI.
   Retailer identities are real; prices, ratings and policies are sample data for the demo. */

import type { Product } from '../types.js';

export const PRODUCTS: Product[] = [
  { id: 'realme-note-60', name: 'Realme Note 60 (6/128GB)', bn: 'রিয়ালমি নোট ৬০', brand: 'Realme', cat: 'phones', spec: '6.74" 90Hz · 6GB RAM · 5000mAh', aliases: ['mobile', 'phone', 'smartphone', 'মোবাইল', 'ফোন', 'রিয়ালমি', 'realme', 'not 60', '৬০'] },
  { id: 'redmi-14c', name: 'Xiaomi Redmi 14C (8/256GB)', bn: 'শাওমি রেডমি ১৪সি', brand: 'Xiaomi', cat: 'phones', spec: '6.88" 120Hz · 8GB RAM · 5160mAh', aliases: ['xiaomi', 'redmi', 'mi', 'mobile', 'phone', 'শাওমি', 'রেডমি', 'মোবাইল', 'ফোন', 'স্মার্টফোন'] },
  { id: 'galaxy-a16', name: 'Samsung Galaxy A16 5G (8/256GB)', bn: 'স্যামসাং গ্যালাক্সি এ১৬', brand: 'Samsung', cat: 'phones', spec: '6.7" AMOLED · 5G · 6-year updates', aliases: ['samsung', 'galaxy', 'a16', 'mobile', 'phone', 'স্যামসাং', 'গ্যালাক্সি', 'মোবাইল', 'ফোন'] },
  { id: 'walton-primo-rx8', name: 'Walton Primo RX8+ (4/128GB)', bn: 'ওয়ালটন প্রিমো আরএক্স৮+', brand: 'Walton', cat: 'phones', spec: '6.6" HD+ · Made in Bangladesh', aliases: ['walton', 'primo', 'mobile', 'phone', 'ওয়ালটন', 'প্রিমো', 'মোবাইল', 'ফোন', 'দেশি'] },
  { id: 'iphone-15', name: 'iPhone 15 (128GB)', bn: 'আইফোন ১৫', brand: 'Apple', cat: 'phones', spec: '6.1" OLED · USB-C · Official BD warranty', aliases: ['iphone', 'apple', 'mobile', 'phone', 'আইফোন', 'অ্যাপল', 'মোবাইল', 'ফোন', '১৫'] },
  { id: 'hp-250-g9', name: 'HP 250 G9 (i5-1335U · 8GB · 512GB)', bn: 'এইচপি ২৫০ জি৯', brand: 'HP', cat: 'computers', spec: '15.6" FHD · 13th-gen i5 · Win 11', aliases: ['laptop', 'hp', 'notebook', 'ল্যাপটপ', 'নোটবুক', 'কম্পিউটার'] },
  { id: 'ideapad-slim-3', name: 'Lenovo IdeaPad Slim 3 (Ryzen 5 7530U)', bn: 'লেনোভো আইডিয়াপ্যাড স্লিম ৩', brand: 'Lenovo', cat: 'computers', spec: '15.6" FHD · 16GB · 512GB SSD', aliases: ['laptop', 'lenovo', 'ideapad', 'লেনোভো', 'ল্যাপটপ'] },
  { id: 'lenovo-qct-2504', name: 'Lenovo QCT-2504 TWS Earbuds', bn: 'লেনোভো কিউসিটি-২৫০৪ ইয়ারবাডস', brand: 'Lenovo', cat: 'accessories', spec: 'Bluetooth 5.3 · ENC mic · 24h case', aliases: ['earbud', 'tws', 'headphone', 'airpod', 'ইয়ারবাড', 'হেডফোন', 'ব্লুটুথ'] },
  { id: 'edifier-w800bt', name: 'Edifier W800BT Plus Headphones', bn: 'এডিফায়ার ডব্লিউ৮০০বিটি প্লাস', brand: 'Edifier', cat: 'accessories', spec: 'Over-ear · 50h battery · aptX', aliases: ['headphone', 'edifier', 'হেডফোন', 'অডিও', 'কান'] },
  { id: 'romoss-20000', name: 'Romoss Sense 4 Power Bank 20000mAh', bn: 'রমোস পাওয়ার ব্যাংক ২০০০০', brand: 'Romoss', cat: 'accessories', spec: '22.5W PD · 4 ports', aliases: ['power bank', 'charger', 'পাওয়ার ব্যাংক', 'চার্জার'] },
  { id: 'tplink-archer-c6', name: 'TP-Link Archer C6 AC1200 Router', bn: 'টিপি-লিংক আর্চার সি৬ রাউটার', brand: 'TP-Link', cat: 'accessories', spec: 'Dual band · 4 antennas · MU-MIMO', aliases: ['router', 'wifi', 'modem', 'রাউটার', 'মডেম', 'ইন্টারনেট'] },
  { id: 'wd-sn580-1tb', name: 'WD Blue SN580 1TB NVMe SSD', bn: 'ডব্লিউডি ব্লু এসএন৫৮০ ১টিবি', brand: 'WD', cat: 'computers', spec: 'PCIe 4.0 · up to 4,150 MB/s', aliases: ['ssd', 'nvme', 'storage', 'এসএসডি', 'হার্ড'] },
  { id: 'walton-43-led', name: 'Walton 43" Reactiv Full HD LED TV', bn: 'ওয়ালটন ৪৩ ইঞ্চি এলইডি টিভি', brand: 'Walton', cat: 'appliances', spec: '43" 1080p · HDMI x3 · 2-year service', aliases: ['tv', 'television', 'টিভি', 'ওয়ালটন', 'এলইডি'] },
  { id: 'miniket-rice-5kg', name: 'Miniket Rice 5kg (Nazirshail)', bn: 'মিনিকেট চাল ৫ কেজি', brand: 'Loose mill', cat: 'grocery', spec: 'Premium miniket · 5kg bag', aliases: ['rice', 'bhat', 'chaul', 'চাল', 'মিনিকেট', 'নাজিরশাইল', 'mudiman'] },
  { id: 'soybean-oil-5l', name: 'Soybean Oil 5 Litre', bn: 'সয়াবিন তেল ৫ লিটার', brand: 'Bashundhara', cat: 'grocery', spec: 'Refined · 5L pouch', aliases: ['oil', 'tel', 'সয়াবিন', 'তেল', 'কুকিং অয়েল'] },
  { id: 'farm-eggs-12', name: 'Farm Eggs 12 Pcs', bn: 'ফার্মের ডিম ১২ পিস', brand: 'Local farm', cat: 'grocery', spec: 'Grade A · 12 pieces', aliases: ['egg', 'dim', 'ডিম', 'ফার্মের ডিম'] },
  { id: 'masoor-dal-1kg', name: 'Masoor Dal 1kg', bn: 'মসুর ডাল ১ কেজি', brand: 'Local mill', cat: 'grocery', spec: 'Sorting quality · 1kg', aliases: ['dal', 'lentil', 'ডাল', 'মসুর'] },
  { id: 'nuffar-lipstick', name: 'Nuffar Velvet Matte Lipstick', bn: 'নাফার ভেলেট ম্যাট লিপস্টিক', brand: 'Nuffar', cat: 'beauty', spec: 'Transfer-proof · 8 shades', aliases: ['lipstick', 'makeup', 'cosmetic', 'লিপস্টিক', 'মেকআপ', 'নাফার', 'কসমেটিক'] },
  { id: 'aarong-panjabi', name: 'Aarong Embossed Cotton Panjabi', bn: 'আড়ং এমবসড কটন পাঞ্জাবি', brand: 'Aarong', cat: 'fashion', spec: '100% cotton · M–XXL', aliases: ['panjabi', 'kurta', 'shirt', 'পাঞ্জাবি', 'কুর্তা', 'জামা', 'eid'] },
  { id: 'feluda-samagro', name: 'Feluda Samagro (hardcover)', bn: 'ফেলুদা সমগ্র', brand: 'Ananda Publishers', cat: 'books', spec: 'Complete Feluda · 720 pages', aliases: ['book', 'boi', 'feluda', 'byapkore', 'বই', 'ফেলুদা', 'ব্যোমকেশ', 'রকমারি'] },
  { id: 'casio-f91w', name: 'Casio F-91W Digital Watch', bn: 'ক্যাসিও এফ-৯১ডব্লিউ ঘড়ি', brand: 'Casio', cat: 'accessories', spec: 'Resin strap · 7-year battery', aliases: ['watch', 'clock', 'ঘড়ি', 'ক্যাসিও'] }
];
