/* The home page's shelves: popular products by category, each answered from the price list.
   A product shows only when at least two shops sell it, because one shop is not a comparison.
   Each name is a search, checked against the list on 2026-11-23; opening a card runs it. */

export const BROWSE_CATEGORIES = [
  { id: 'phones', label: 'Phones', products: [
    'iPhone 17 Pro Max', 'iPhone 17 Pro', 'iPhone 17', 'iPhone Air', 'iPhone 16 Pro Max', 'iPhone 16', 'iPhone 16e', 'iPhone 15', 'iPhone 13',
    'Galaxy S25 Ultra', 'Galaxy S25', 'Galaxy S25 FE', 'Galaxy A56', 'Galaxy A36', 'Galaxy A26', 'Galaxy A17', 'Galaxy A16',
    'Redmi Note 14 Pro', 'Redmi Note 14', 'Redmi 15', 'Redmi 15C', 'Poco X7 Pro', 'Poco F7', 'Pixel 10 Pro', 'Pixel 10', 'Pixel 9a',
    'Nothing Phone 3a', 'Honor X9c', 'Honor 400', 'Realme 15'
  ] },
  { id: 'laptops', label: 'Laptops', products: [
    'MacBook Air M4', 'MacBook Air M3', 'MacBook Air M2', 'MacBook Pro M4', 'MacBook Pro M5', 'Lenovo IdeaPad Slim 3', 'Lenovo LOQ',
    'HP Victus', 'Asus Vivobook 15', 'Asus TUF Gaming', 'Acer Aspire 7'
  ] },
  { id: 'tablets', label: 'Tablets', products: [
    'iPad Air M3', 'iPad Pro M5', 'iPad mini 7', 'iPad 11', 'Galaxy Tab S10 FE', 'Galaxy Tab A9', 'Xiaomi Pad 7', 'Redmi Pad 2', 'Redmi Pad SE'
  ] },
  { id: 'audio', label: 'Earbuds & speakers', products: [
    'AirPods Pro 3', 'AirPods 4', 'Galaxy Buds 3', 'Sony WH-1000XM5', 'Sony WH-1000XM6', 'JBL Flip 7', 'JBL Flip 6', 'JBL Go 4', 'JBL Charge 6',
    'Redmi Buds 6', 'Soundcore Q20i', 'Nothing Ear', 'QCY T13', 'Marshall Emberton III', 'Bose QuietComfort Ultra'
  ] },
  { id: 'watches', label: 'Smartwatches', products: [
    'Apple Watch Series 11', 'Apple Watch Series 10', 'Apple Watch SE 3', 'Apple Watch Ultra 3', 'Apple Watch Ultra 2',
    'Amazfit Active 2', 'Amazfit Bip 6', 'Redmi Watch 5', 'CMF Watch Pro 2'
  ] },
  { id: 'accessories', label: 'Accessories', products: [
    'MagSafe Charger', 'Apple Pencil Pro', 'Apple Pencil USB-C', 'Magic Mouse', 'Logitech MX Master 3S'
  ] }
];

/** Every product the shelves show, for tools that need the same list. */
export const browseQueries = (categories = BROWSE_CATEGORIES) => categories.flatMap(category => category.products);

/**
 * One card per product: the lowest price of any version, how many shops sell it, the shop with
 * that price, and a photo. The product's own page compares versions; a card only says where to
 * start, which is why its price reads "from".
 */
export function buildBrowse(search, shopCounts, categories = BROWSE_CATEGORIES) {
  const shelves = categories.map(category => {
    const cards = [];
    for (const name of category.products) {
      let answer;
      try {
        answer = search(name);
      } catch {
        continue;
      }
      const offers = answer.groups.flatMap(group => group.offers);
      const shops = new Set(offers.map(offer => offer.shop));
      if (shops.size < 2) continue;
      const cheapest = offers.reduce((low, offer) => (offer.price < low.price ? offer : low));
      const pictured = [cheapest, ...offers].find(offer => offer.image);
      cards.push({
        name,
        from: cheapest.price,
        shop: cheapest.shop,
        shops: shops.size,
        versions: answer.groups.length,
        ...(pictured && { image: pictured.image }),
        checkedAt: offers.reduce((latest, offer) => (offer.checkedAt > latest ? offer.checkedAt : latest), '')
      });
    }
    return { id: category.id, label: category.label, cards };
  }).filter(shelf => shelf.cards.length);

  return {
    shelves,
    shops: Object.entries(shopCounts).map(([shop, prices]) => ({ shop, prices })).sort((a, b) => b.prices - a.prices),
    prices: Object.values(shopCounts).reduce((sum, count) => sum + count, 0)
  };
}
