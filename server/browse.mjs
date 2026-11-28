/* The home page's shelves: every product in the price list that at least two shops sell, found
   by grouping listings under their product's name and sorted into categories by what they are.
   Nothing here is picked by hand, so new shops and new products appear on their own. */

/* Checked in order: a charger for an iPhone is a charger, a Galaxy Watch is a watch. */
export const CATEGORY_RULES = [
  { id: 'power', label: 'Chargers & power', test: /\b(charger|chargers|adapter|cable|power ?bank|magsafe|hub|dock|wireless charging)\b/ },
  { id: 'audio', label: 'Earbuds & speakers', test: /\b(airpods|buds|earbuds|earphones?|headphones?|headset|speakers?|soundbar|neckband|tws|airdots|soundcore|marshall)\b/ },
  /* "Dual Band" is a Wi-Fi router, not a fitness band. */
  { id: 'watches', label: 'Smartwatches', test: /\b(watch|(?<!\b(single|dual|tri|quad) )band)\b/ },
  { id: 'tablets', label: 'Tablets', test: /\b(ipad|tab|pad|tablet)\b/ },
  { id: 'laptops', label: 'Laptops', test: /\b(macbook|laptop|notebook|vivobook|zenbook|ideapad|thinkpad|thinkbook|inspiron|vostro|latitude|pavilion|victus|omen|envy|elitebook|probook|aspire|nitro|swift|predator|legion|loq|tuf|rog|chromebook)\b/ },
  { id: 'gaming', label: 'Cameras & gaming', test: /\b(camera|cam|gimbal|insta360|gopro|osmo|drone|controller|gamepad|playstation|ps5|ps4|xbox|console|nintendo|switch 2)\b/ },
  { id: 'screens', label: 'Monitors & TVs', test: /\b(monitor|tv|television|projector)\b/ },
  { id: 'pc', label: 'PC & accessories', test: /\b(ssd|hdd|nvme|ram|ddr4|ddr5|motherboard|processor|ryzen|graphics|rtx|gtx|radeon|psu|casing|cooler|keyboard|mouse|router|mesh|access point|(dual|tri) band|wi fi|ups|webcam|printer|scanner|pendrive|flash drive|memory card)\b/ },
  { id: 'phones', label: 'Phones', test: /\b(iphone|galaxy|redmi|poco|pixel|oneplus|honor|vivo|oppo|realme|infinix|tecno|motorola|moto|nokia|nothing phone|xiaomi \d+|symphony|walton primo|meizu|zte|nubia|huawei|itel|lava|tcl|blackview|ulefone|doogee|oukitel|cmf phone)\b/ },
  { id: 'more', label: 'More', test: /./ }
];

const COLOURS = /\b(black|white|blue|red|green|gold|silver|gray|grey|pink|purple|orange|yellow|titanium|natural|desert|midnight|starlight|graphite|space|cosmic|deep|light|dark|mint|lavender|cream|ultramarine|teal|sage|jet|navy|beige|brown|violet|coral|rose|phantom|awesome|icy|iceblue|onyx|mist|sky|cloud|sand|olive|peach|lilac|aqua|ocean|forest|polar|frost|mocha|burgundy|champagne|ivory|charcoal|copper|bronze|crimson|amber|emerald|ruby|pearl|glacier|moonlight|sunset|aurora|cyan|turquoise|magenta|lime|khaki|marble|obsidian|porcelain|hazel|jade|denim|smoke|shadow|storm|thunder|blush|lake|stone|plum|slate|winter|lunar|alpine|trail|milanese)\b/g;
const SIZE = /\b\d+(\.\d+)?[\s-]*(gb|tb|mah|w|mm|inch|inches|hz|"|”)(?![a-z0-9])/;
const SIZE_ON = new RegExp(`${SIZE.source}.*$`);
/* "Samsung Galaxy A16" and "Galaxy A16" are one phone: a brand before its own line is dropped. */
const BRAND_LINE = /^(apple|samsung|xiaomi|mi|google|oneplus)\s+(?=(iphone|ipad|macbook|imac|airpods|galaxy|redmi|poco|pixel|nord)\b)/;
/* Words that tell versions apart, not products: the product page compares those versions. */
const FILLER = /\b(new|original|official|unofficial|global|version|edition|price|in|bd|bangladesh|buy|online|best|gps|cellular|lte|5g|4g|wifi|wi fi|esim|dual sim|nfc)\b/g;
const DEVICE_LINE = /\b(iphone|galaxy|redmi|poco|pixel|oneplus|xiaomi|vivo|oppo|realme|infinix|tecno|motorola|moto|nokia|honor|ipad|tab|pad|tablet|macbook|laptop|notebook|vivobook|zenbook|ideapad|thinkpad|thinkbook|legion|loq|victus|omen|imac|watch|tv|television)\b/;

/** Keeps standalone PC component kinds ("DDR5 RAM" vs "SSD") from collapsing onto one card when
    `SIZE_ON` cuts everything from the capacity ("16GB", "500GB") onwards. */
function preservedPartKind(before, tail) {
  if (DEVICE_LINE.test(`${before} ${tail}`)) return ' ';
  if (/\b(ram|dimm|sodimm)\b/.test(tail) && !/\b(ram|dimm|sodimm)\b/.test(before)) {
    const ddr = tail.match(/\b(ddr[345])\b/)?.[1];
    return ddr && !before.includes(ddr) ? ` ${ddr} ram ` : ' ram ';
  }
  if (/\b(ssd|nvme)\b/.test(tail) && !/\b(ssd|nvme)\b/.test(before)) return ' ssd ';
  if (/\bhdd\b|\bhard drive\b/.test(tail) && !/\bhdd\b|\bhard drive\b/.test(before)) return ' hdd ';
  return ' ';
}

/* A processor or graphics card sold on its own is named a dozen ways ("AMD Ryzen 5 7600 AM5
   Gaming Processor", "Ryzen 5 7600 3.8GHz 6-Core", "AMD Ryzen 5 7600 Tray"), and the generic key
   below kept each wording as its own product, so no card ever showed every shop. These get one
   name: the chip's own for a processor, and brand + chip + board line for a graphics card (an MSI
   Ventus and an MSI Gaming X are different cards at different prices, so the line stays).
   Anything that only contains one (a laptop, a PC, a combo, a cooler) keeps the generic key. */
const NOT_A_PART = /\b(pc|pcs|build|builds|combo|bundle|package|laptop|notebook|motherboard|mainboard|mini|all in one|aio|barebone|server|workstation|monitor|cooler|cooling|fan|fans|thermal|paste|riser|bracket|backplate|holder|cable|kit|desktop computer|computer|console|handheld)\b/;
const CPU = /\b(?:amd\s+)?ryzen\s*(threadripper\s+|[3579]\s+)(pro\s+)?(\d{4}[a-z0-9]{0,3})\b|\b(?:intel\s+)?(?:core\s*)?(?:(ultra)\s*([3579])\s*-?\s*(\d{3}[a-z]{0,2})|i([3579])[\s-]*(\d{4,5}[a-z]{0,2}))\b/;
/* A laptop chip (7520U, 12450H, 13980HX) is never sold on its own here. */
const MOBILE_CPU = /^\d+(u|h|hs|hx|p|g[1-7])$/;
const GPU = /\b(rtx|gtx|rx|arc)\s*(a?\d{3,4})(?:\s*(ti\s+super|ti|super|xtx|xt|gre))?\b/;
const GPU_BRAND = /\b(asus|msi|gigabyte|aorus|zotac|palit|galax|inno3d|colorful|sapphire|powercolor|xfx|asrock|pny|leadtek|gainward|biostar|maxsun|yeston|sparkle|intel|nvidia|amd)\b/;
/* Words that say what a graphics card is rather than which one. */
const GPU_FILLER = new Set(['geforce', 'nvidia', 'radeon', 'amd', 'graphics', 'graphic', 'card', 'video', 'gpu', 'gddr5', 'gddr6', 'gddr6x', 'gddr7',
  'pci', 'pcie', 'express', 'edition', 'bit', 'dlss', 'with', 'and', 'the', 'new', 'desktop', 'ray', 'tracing', 'triple', 'dual-fan', 'fan', 'fans', 'ddr6', 'ddr7', 'vram', 'memory',
  'price', 'in', 'bd', 'bangladesh', 'buy', 'best', 'online', 'official', 'original', 'warranty', 'year', 'years']);

/* A whole computer that names its chip: brand desktops, or a chip sold with RAM or storage. */
const A_SYSTEM = /\b(tower|thinkcentre|ideacentre|optiplex|vostro|prodesk|elitedesk|sff|veriton|nuc|imac|mac mini|full pc)\b|\b\d+\s*(gb|tb)\s*(ram|ddr\d?|ssd|hdd|nvme|storage)\b|(\band\b|\+|\bwith\b)\s*\d+\s*(gb|tb)\b/;
/* A graphics card's listing that also names a processor or a screen is a laptop or a PC. */
const SYSTEM_HINT = /\b(\d+(st|nd|rd|th) gen|core i[3579]|core ultra|ryzen|\d{2,3}\s*hz|fhd|qhd|uhd|oled|ips|inch)\b/;

export function partKey(raw) {
  const whole = raw.toLowerCase();
  if (A_SYSTEM.test(whole) || NOT_A_PART.test(whole)) return null;
  const name = whole.replace(/[™®©]/g, '').replace(/\(.*?\)|\[.*?\]/g, ' ').split(/\s[-|–]\s|,|\s\/\s/)[0].replace(/\s+/g, ' ').trim();
  if (NOT_A_PART.test(name) || DEVICE_LINE.test(name)) return null;
  const gpu = name.match(GPU);
  const cpu = gpu ? null : name.match(CPU);
  if (cpu) {
    if (cpu[1] !== undefined) {
      if (MOBILE_CPU.test(cpu[3])) return null;
      return `amd ryzen ${cpu[1].trim()}${cpu[2] ? ' pro' : ''} ${cpu[3]}`;
    }
    const [tier, model] = cpu[4] ? [`ultra ${cpu[5]}`, cpu[6]] : [`i${cpu[7]}`, cpu[8]];
    if (MOBILE_CPU.test(model)) return null;
    return `intel core ${tier} ${model}`;
  }
  if (!gpu || SYSTEM_HINT.test(name)) return null;
  const brand = name.match(GPU_BRAND)?.[1];
  if (!brand) return null;
  const chip = `${gpu[1]} ${gpu[2]}${gpu[3] ? ` ${gpu[3].replace(/\s+/g, ' ')}` : ''}`;
  /* "ZOTAC GAMING" is the brand's name and "TUF Gaming" a line's; MSI's and Gigabyte's "Gaming" names a line. */
  const line = name.replace(/\b(zotac|tuf|strix|rog)\s+gaming\b/g, '$1').replace(GPU, ' ').replace(COLOURS, ' ').replace(/\b\d+\s*(gb|g|mb)\b/g, ' ').replace(/\b\d+(\.\d+)?\s*(bit|mhz|ghz)\b/g, ' ')
    .replace(/[^a-z0-9+ ]+/g, ' ').split(' ')
    .filter(word => word && word !== brand && !GPU_FILLER.has(word) && !/^\d+$/.test(word));
  return [brand === 'aorus' ? 'gigabyte aorus' : brand, chip, ...line].join(' ').split(' ').slice(0, 8).join(' ');
}

const keyCache = new Map();

/** The product a listing is for: its name up to the first detail, without colours or sizes. */
export function productKey(name) {
  const raw = String(name);
  const cached = keyCache.get(raw);
  if (cached !== undefined) return cached;
  const computed = partKey(raw) ?? raw
    /* A model code's short capital prefix joins its number ("KM-205W", "F-91W" → "KM205W",
       "F91W"), so the number is not mistaken for a size ("205W" watts) and cut, which would
       put every Micropack KM-…W or Casio F-…W on one card. "Adapter-65W" is a size and stays. */
    .replace(/\b([A-Z]{1,4})-(?=\d+(?:\.\d+)?(?:[wW]|GB|gb|TB|tb|mAh|MAH|mah|mm|MM|Hz|HZ|hz)(?![A-Za-z0-9]))/g, '$1')
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .split(/\s[-|–]\s|,|\swith\s|\sfor\s/)[0]
    /* Protect WD sub-lines ("WD Blue", "WD Black") and ASRock "Steel Legend" before stripping colours. */
    .replace(/\b(wd|western digital)\s+(blue|black|green|red|purple|gold)\b/g, '$1_$2')
    .replace(/\bsteel(?=\s+legend\b)/g, 'steel_')
    .replace(COLOURS, ' ')
    .replace(/\b(wd|western digital)_(blue|black|green|red|purple|gold)\b/g, '$1 $2')
    .replace(/\bsteel_/g, 'steel')
    .replace(/\b\d+(\.\d+)?[\s-]*(inch|inches|"|”)(?![a-z0-9])/g, ' ')
    .replace(/\b\d+[\s-]*core\s*(cpu|gpu)\b/g, ' ')
    .replace(/\s+/g, ' ').trim()
    .replace(BRAND_LINE, '')
    .replace(/\b\d+\/\d+.*$/, ' ')
    /* From the first size on is detail (256GB, 13.6-inch, 15", 5000mAh), unless the size comes
       before the model, as in "Samsung 55 inch Crystal UHD TV": then only the size goes. */
    .replace(SIZE_ON, (...found) => {
      const [match] = found;
      const before = found.at(-1).slice(0, found.at(-2)).trim();
      return before.split(/\s+/).length >= 2 ? preservedPartKind(before, match) : match.replace(SIZE, ' ');
    })
    .replace(FILLER, ' ')
    .replace(/[^a-z0-9+ ]+/g, ' ')
    .replace(/\s+/g, ' ').trim()
    .split(' ').slice(0, 6).join(' ');
  if (keyCache.size >= 120_000) keyCache.clear();
  keyCache.set(raw, computed);
  return computed;
}

/**
 * A key written the way the shops write it: "apple airpods pro" → "Apple AirPods Pro",
 * "sony bravia 7 k 75xr70" → "Sony BRAVIA 7 K-75XR70", "t wolf g580" → "T-Wolf G580". The name is
 * also the card's search, so it must give back the same key; if it would not, each word is only
 * re-cased instead.
 */
export function displayName(key, names) {
  const plain = text => text.toLowerCase().replace(/[^a-z0-9+]/g, '');
  const words = names.flatMap(name => name.split(/[\s,()/|]+/)).filter(Boolean);
  /* Whole words first ("KM-205W" for "km205w"), then the parts of hyphenated ones ("Type", "C"). */
  const parts = words.flatMap(word => word.split('-').filter(Boolean).map((text, at, all) => ({ text, word, at, of: all.length })));
  const tokens = key.split(' ');
  const recased = tokens.map(token => words.find(word => plain(word) === token) ?? parts.find(part => plain(part.text) === token)?.text ?? token);

  const shown = [];
  for (let i = 0; i < tokens.length; i++) {
    /* Consecutive tokens that are, in order, all the parts of one hyphenated word: write the word. */
    const whole = parts.find(part => part.at === 0 && part.of > 1 && plain(part.text) === tokens[i] &&
      part.word.split('-').filter(Boolean).every((piece, j) => plain(piece) === tokens[i + j]));
    if (whole) {
      shown.push(whole.word);
      i += whole.of - 1;
    } else {
      shown.push(recased[i]);
    }
  }
  const name = shown.join(' ');
  return productKey(name) === key ? name : recased.join(' ');
}

/* The shelves read every listing and run a search per product: on a small server that is
   seconds of work. So the two steps are written as jobs that pause after each piece. runNow does
   a job at once (tests, tools); runInSlices does it a few milliseconds at a time, letting other
   requests in between, so a rebuild never freezes the site. */
export function runNow(job) {
  for (;;) {
    const step = job.next();
    if (step.done) return step.value;
  }
}

export async function runInSlices(job, sliceMs = 6) {
  let started = performance.now();
  for (;;) {
    const step = job.next();
    if (step.done) return step.value;
    if (performance.now() - started >= sliceMs) {
      /* Yield with a short timer rather than setImmediate alone so fractional-vCPU hosts keep
         CPU quota headroom for live search requests while shelves rebuild. */
      await new Promise(resolve => setTimeout(resolve, 3));
      started = performance.now();
    }
  }
}

/**
 * Candidate products from the listings: keys at least two shops share, with two or more words,
 * most widely sold first. Each becomes a search; buildBrowse keeps it only if that search, the
 * card's own page, also finds two shops.
 */
export function* discoverCategoriesSteps(entries, rules = CATEGORY_RULES) {
  const groups = new Map();
  for (const entry of entries) {
    yield;
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

  const categories = rules.map(rule => ({ id: rule.id, label: rule.label, products: [] }));
  for (const [key, group] of shared) {
    yield;
    const at = rules.findIndex(rule => rule.test.test(key));
    if (at >= 0) categories[at].products.push(displayName(key, group.names));
  }
  return categories.filter(category => category.products.length);
}

export const discoverCategories = (entries, rules = CATEGORY_RULES) => runNow(discoverCategoriesSteps(entries, rules));

/** Every product the shelves would show, for tools that need the same list. */
export const browseQueries = categories => categories.flatMap(category => category.products);

/**
 * One card per product: the lowest price of any version, how many shops sell it, the shop with
 * that price, and a photo. The product's own page compares versions; a card only says where to
 * start, which is why its price reads "from".
 */
export function* buildBrowseSteps(search, shopCounts, categories) {
  /* Two names can find the same listings ("iPhone 14" and "Apple iPhone 14"): one card each. */
  const seen = new Set();
  const shelves = [];
  for (const category of categories) {
    const cards = [];
    for (const name of category.products) {
      yield;
      let answer;
      try {
        answer = search(name);
      } catch {
        continue;
      }
      const key = productKey(name);
      const offers = answer.groups.flatMap(group => group.offers)
        .filter(offer => (offer.product ?? productKey(offer.title ?? '')) === key);
      const buyable = offers.filter(offer => offer.inStock !== false);
      if (!buyable.length) continue;
      const shops = new Set(buyable.map(offer => offer.shop));
      if (shops.size < 2) continue;
      const signature = offers.map(offer => offer.url).sort().join(' ');
      if (seen.has(signature)) continue;
      seen.add(signature);
      /* "From" is a price you can pay: the cheapest offer in stock. */
      const cheapest = buyable.reduce((low, offer) => (offer.price < low.price ? offer : low));
      const pictured = [cheapest, ...buyable, ...offers].find(offer => offer.image);
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
    if (cards.length) shelves.push({ id: category.id, label: category.label, cards });
  }

  return {
    shelves,
    shops: Object.entries(shopCounts).map(([shop, prices]) => ({ shop, prices })).sort((a, b) => b.prices - a.prices),
    prices: Object.values(shopCounts).reduce((sum, count) => sum + count, 0)
  };
}

export const buildBrowse = (search, shopCounts, categories) => runNow(buildBrowseSteps(search, shopCounts, categories));
