/* The home page's shelves: every product in the price list that at least two shops sell, found
   by grouping listings under their product's name and sorted into categories by what they are.
   Nothing here is picked by hand, so new shops and new products appear on their own. */

/* Checked in order: a charger for an iPhone is a charger, a Galaxy Watch is a watch. */
export const CATEGORY_RULES = [
  { id: 'power', label: 'Chargers & power', test: /\b(charger|chargers|adapter|cable|power ?bank|magsafe|hub|dock|wireless charging)\b/ },
  { id: 'audio', label: 'Earbuds & speakers', test: /\b(airpods|buds|earbuds|earphones?|headphones?|headset|speakers?|soundbar|neckband|tws|airdots|soundcore|marshall)\b/ },
  { id: 'watches', label: 'Smartwatches', test: /\b(watch|band)\b/ },
  { id: 'tablets', label: 'Tablets', test: /\b(ipad|tab|pad|tablet)\b/ },
  { id: 'laptops', label: 'Laptops', test: /\b(macbook|laptop|notebook|vivobook|zenbook|ideapad|thinkpad|thinkbook|inspiron|vostro|latitude|pavilion|victus|omen|envy|elitebook|probook|aspire|nitro|swift|predator|legion|loq|tuf|rog|chromebook)\b/ },
  { id: 'gaming', label: 'Cameras & gaming', test: /\b(camera|cam|gimbal|insta360|gopro|osmo|drone|controller|gamepad|playstation|ps5|ps4|xbox|console|nintendo|switch 2)\b/ },
  { id: 'screens', label: 'Monitors & TVs', test: /\b(monitor|tv|television|projector)\b/ },
  { id: 'pc', label: 'PC & accessories', test: /\b(ssd|hdd|nvme|ram|ddr4|ddr5|motherboard|processor|ryzen|graphics|rtx|gtx|radeon|psu|casing|cooler|keyboard|mouse|router|ups|webcam|printer|scanner|pendrive|flash drive|memory card)\b/ },
  { id: 'phones', label: 'Phones', test: /\b(iphone|galaxy|redmi|poco|pixel|oneplus|honor|vivo|oppo|realme|infinix|tecno|motorola|moto|nokia|nothing phone|xiaomi \d+|symphony|walton primo|meizu|zte|nubia|huawei|itel|lava|tcl|blackview|ulefone|doogee|oukitel|cmf phone|galaxy [asmz]\\d+)\b/ },
  { id: 'more', label: 'More', test: /./ }
];

const COLOURS = /\b(black|white|blue|red|green|gold|silver|gray|grey|pink|purple|orange|yellow|titanium|natural|desert|midnight|starlight|graphite|space|cosmic|deep|light|dark|mint|lavender|cream|ultramarine|teal|sage|jet|navy|beige|brown|violet|coral|rose|phantom|awesome|icy|iceblue|onyx|mist|sky|cloud|sand|olive|peach|lilac|aqua|ocean|forest|arctic|polar|frost|mocha|burgundy|champagne|ivory|charcoal|steel|copper|bronze|crimson|amber|emerald|sapphire|ruby|pearl|glacier|moonlight|sunset|aurora|cyan|turquoise|magenta|lime|khaki|marble|obsidian|porcelain|hazel|jade|denim|smoke|shadow|storm|thunder|blush)\b/g;
const SIZE = /\b\d+(\.\d+)?[\s-]*(gb|tb|mah|w|mm|inch|inches|hz|"|”)(?![a-z0-9])/;
const SIZE_ON = new RegExp(`${SIZE.source}.*$`);
/* "Samsung Galaxy A16" and "Galaxy A16" are one phone: a brand before its own line is dropped. */
const BRAND_LINE = /^(apple|samsung|xiaomi|mi|google|oneplus)\s+(?=(iphone|ipad|macbook|imac|airpods|galaxy|redmi|poco|pixel|nord)\b)/;
/* Words that tell versions apart, not products: the product page compares those versions. */
const FILLER = /\b(new|original|official|unofficial|global|version|edition|price|in|bd|bangladesh|buy|online|best|gps|cellular|lte|5g|4g|wifi|wi fi|esim|dual sim|nfc)\b/g;

/** The product a listing is for: its name up to the first detail, without colours or sizes. */
export function productKey(name) {
  return String(name).toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .split(/\s[-|–]\s|,|\swith\s|\sfor\s/)[0]
    .replace(COLOURS, ' ')
    .replace(/\s+/g, ' ').trim()
    .replace(BRAND_LINE, '')
    /* From the first size on is detail (256GB, 13.6-inch, 15", 5000mAh), unless the size comes
       before the model, as in "Samsung 55 inch Crystal UHD TV": then only the size goes. */
    .replace(SIZE_ON, (...found) => {
      const [match] = found;
      const before = found.at(-1).slice(0, found.at(-2)).trim();
      return before.split(/\s+/).length >= 2 ? ' ' : match.replace(SIZE, ' ');
    })
    .replace(/\d+\s*\/\s*\d+.*$/, ' ')
    .replace(FILLER, ' ')
    .replace(/[^a-z0-9+ ]+/g, ' ')
    .replace(/\s+/g, ' ').trim()
    .split(' ').slice(0, 6).join(' ');
}

/** A key written the way the shops write it: "apple airpods pro" → "Apple AirPods Pro". */
function displayName(key, names) {
  const words = names.flatMap(name => name.split(/[\s,()/|]+/));
  return key.split(' ').map(token =>
    words.find(word => word.toLowerCase().replace(/[^a-z0-9+]/g, '') === token) ?? token).join(' ');
}

/**
 * Candidate products from the listings: keys at least two shops share, with two or more words,
 * most widely sold first. Each becomes a search; buildBrowse keeps it only if that search, the
 * card's own page, also finds two shops.
 */
export function discoverCategories(entries, rules = CATEGORY_RULES) {
  const groups = new Map();
  for (const entry of entries) {
    const key = productKey(entry.name);
    if (key.split(' ').length < 2 || key.length < 5) continue;
    const group = groups.get(key) ?? { shops: new Set(), names: [], count: 0 };
    group.shops.add(entry.shop);
    if (group.names.length < 5) group.names.push(entry.name);
    group.count++;
    groups.set(key, group);
  }
  const shared = [...groups].filter(([, group]) => group.shops.size >= 2)
    .sort((a, b) => b[1].shops.size - a[1].shops.size || b[1].count - a[1].count);

  return rules.map(rule => ({
    id: rule.id,
    label: rule.label,
    products: shared.filter(([key]) => rules.find(other => other.test.test(key)) === rule)
      .map(([key, group]) => displayName(key, group.names))
  })).filter(category => category.products.length);
}

/** Every product the shelves would show, for tools that need the same list. */
export const browseQueries = categories => categories.flatMap(category => category.products);

/**
 * One card per product: the lowest price of any version, how many shops sell it, the shop with
 * that price, and a photo. The product's own page compares versions; a card only says where to
 * start, which is why its price reads "from".
 */
export function buildBrowse(search, shopCounts, categories) {
  /* Two names can find the same listings ("iPhone 14" and "Apple iPhone 14"): one card each. */
  const seen = new Set();
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
      const signature = offers.map(offer => offer.url).sort().join(' ');
      if (seen.has(signature)) continue;
      seen.add(signature);
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
    cards.sort((a, b) => b.shops - a.shops);
    return { id: category.id, label: category.label, cards };
  }).filter(shelf => shelf.cards.length);

  return {
    shelves,
    shops: Object.entries(shopCounts).map(([shop, prices]) => ({ shop, prices })).sort((a, b) => b.prices - a.prices),
    prices: Object.values(shopCounts).reduce((sum, count) => sum + count, 0)
  };
}
