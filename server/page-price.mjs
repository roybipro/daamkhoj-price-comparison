/* Reads one clear price from a shop's HTML. Pages are untrusted text: they are parsed here
   and never executed. Anything ambiguous returns no price, because a missing price is
   better than a wrong one on a comparison site. */

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', raquo: '»', laquo: '«' };

/* A page can write any number here; one past Unicode's range must not lose the whole page. */
const character = (whole, code) => (code <= 0x10ffff ? String.fromCodePoint(code) : whole);

const decodeOnce = text => text
  .replace(/&#(\d+);/g, (whole, code) => character(whole, Number(code)))
  .replace(/&#x([\da-f]+);/gi, (whole, code) => character(whole, parseInt(code, 16)))
  .replace(/&([a-z]+);/gi, (whole, name) => ENTITIES[name.toLowerCase()] ?? whole);

/* Some shops encode twice: "RTX&amp;#x2122;" decoded once still read "RTX&#x2122;", and
   "2.5&amp;quot;" read "2.5&quot;". Decoded until nothing changes, three times at most. */
export function decodeEntities(text) {
  let decoded = String(text);
  for (let round = 0; round < 3 && decoded.includes('&'); round++) {
    const next = decodeOnce(decoded);
    if (next === decoded) break;
    decoded = next;
  }
  return decoded;
}

const toNumber = value => Number(String(value).replace(/,/g, ''));

function findProducts(node, found = []) {
  if (Array.isArray(node)) {
    for (const item of node) findProducts(item, found);
  } else if (node && typeof node === 'object') {
    if ([].concat(node['@type'] ?? []).some(type => /product/i.test(String(type)))) found.push(node);
    for (const value of Object.values(node)) {
      if (value && typeof value === 'object') findProducts(value, found);
    }
  }
  return found;
}

export function stockOf(availability) {
  const value = String(availability ?? '').toLowerCase();
  if (/out[\s_-]*of[\s_-]*stock|stock[\s_-]*out|sold[\s_-]*out|discontinued|pre[\s_-]*order|pre[\s_-]*sale|back[\s_-]*order|up[\s_-]*coming|\btba\b/.test(value)) return false;
  if (/in[\s_-]*stock|limited[\s_-]*availability|online[\s_-]*only|in[\s_-]*store[\s_-]*only/.test(value)) return true;
  return null;
}

/** Where the object starting at `start` closes, or -1 if it never does. */
function closingBrace(text, start) {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (char === '\\') i++;
      else if (char === '"') inString = false;
    } else if (char === '"') inString = true;
    else if (char === '{') depth++;
    else if (char === '}' && --depth === 0) return i;
  }
  return -1;
}

/* Next.js pages can carry their structured data inside a script payload instead of a tag. */
function embeddedBlocks(html) {
  let payload = '';
  for (const match of html.matchAll(/self\.__next_f\.push\(\[1,("[^"\\]*(?:\\.[^"\\]*)*")\]\)/g)) {
    try {
      payload += JSON.parse(match[1]);
    } catch {
      /* A malformed chunk says nothing either way. */
    }
  }
  const blocks = [];
  const starts = payload.matchAll(/\{"(?:@context":"https?:\/\/schema\.org\/?"|@type":"Product")/g);
  for (const { index } of [...starts].slice(0, 50)) {
    const end = closingBrace(payload, index);
    if (end === -1) continue;
    try {
      blocks.push(JSON.parse(payload.slice(index, end + 1)));
    } catch {
      /* As above. */
    }
  }
  return blocks;
}

function offersOf(product) {
  return [].concat(product.offers ?? product.Offers ?? [])
    .filter(offer => offer && typeof offer === 'object')
    .flatMap(offer => (Array.isArray(offer.offers) ? offer.offers : [offer]));
}

function quotesOf(offer) {
  if (offer.price !== undefined) return [{ price: offer.price, currency: offer.priceCurrency }];
  return [].concat(offer.priceSpecification ?? [])
    .filter(spec => spec?.price !== undefined)
    .map(spec => ({ price: spec.price, currency: spec.priceCurrency ?? offer.priceCurrency }));
}

/** The first usable photo address in a schema.org image field: a string, a list, or an object. */
function firstImage(value) {
  for (const item of [].concat(value ?? [])) {
    const url = typeof item === 'string' ? item : item?.url ?? item?.contentUrl;
    if (typeof url === 'string' && url.trim()) return url.trim();
  }
  return '';
}

const sameName = name => decodeEntities(name ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

function readJsonLd(html) {
  const products = [];
  for (const match of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      findProducts(JSON.parse(match[1].trim()), products);
    } catch {
      /* A malformed block says nothing either way. */
    }
  }
  findProducts(embeddedBlocks(html), products);
  if (!products.length) return null;
  /* Different products usually means a listing or "related items"; which price is ours? The
     same product described twice, as some shop plugins do, is fine if the details agree. */
  if (new Set(products.map(product => sameName(product.name))).size > 1) return { ambiguous: true };

  /* A range means several versions or a deposit, so its low end is not this product's price. */
  const isRange = offer => offer.lowPrice !== undefined && toNumber(offer.lowPrice) !== toNumber(offer.highPrice ?? offer.lowPrice);
  if (products.some(product => [].concat(product.offers ?? product.Offers ?? []).some(offer => offer && isRange(offer)))) return { ambiguous: true };

  const offers = products.flatMap(offersOf);
  const quotes = offers.flatMap(quotesOf);
  const prices = new Set(quotes.map(quote => toNumber(quote.price)));
  const currencies = new Set(quotes.map(quote => String(quote.currency ?? '').toUpperCase()));
  if (prices.size > 1 || currencies.size > 1) return { ambiguous: true };
  if (!prices.size) return null;

  const stock = new Set(offers.map(offer => stockOf(offer.availability)).filter(value => value !== null));
  return {
    source: 'json-ld',
    price: [...prices][0],
    currency: [...currencies][0],
    name: decodeEntities(products[0].name ?? ''),
    image: firstImage(products.flatMap(product => [].concat(product.image ?? []))),
    inStock: stock.size === 1 ? [...stock][0] : null
  };
}

function metaContent(html, name) {
  const before = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i'));
  const after = html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${name}["']`, 'i'));
  return (before ?? after)?.[1];
}

/** A photo address made absolute against its page, or '' when it is not an ordinary web address. */
export function absoluteImage(image, pageUrl) {
  if (!image) return '';
  try {
    const url = new URL(image.startsWith('//') ? `https:${image}` : image, pageUrl);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch {
    return '';
  }
}

function readMeta(html) {
  const tag = name => metaContent(html, name);
  const price = tag('product:price:amount') ?? tag('og:price:amount');
  if (!price) return null;
  const currency = tag('product:price:currency') ?? tag('og:price:currency') ?? '';
  return { source: 'meta', price: toNumber(price), currency: currency.toUpperCase(), name: '', image: '', inStock: stockOf(tag('product:availability') ?? tag('og:availability') ?? tag('availability')) };
}

function readMicrodata(html) {
  const prices = [...html.matchAll(/itemprop=["']price["'][^>]*content=["']([\d.,]+)["']/gi)];
  if (prices.length !== 1) return prices.length ? { ambiguous: true } : null;
  const currency = html.match(/itemprop=["']priceCurrency["'][^>]*content=["'](\w+)["']/i)?.[1] ?? '';
  const avail = [...html.matchAll(/itemprop=["']availability["'][^>]*?(?:href|content)=["']([^"']+)["']/gi)]
    .map(match => stockOf(match[1]))
    .filter(value => value !== null);
  const uniqueAvail = new Set(avail);
  return { source: 'microdata', price: toNumber(prices[0][1]), currency: currency.toUpperCase(), name: '', image: '', inStock: uniqueAvail.size === 1 ? [...uniqueAvail][0] : null };
}

/** Stock signals stated in meta tags, microdata, or the product header's own status badge.
    Some OpenCart shops hardcode schema.org/InStock in JSON-LD even when the product's own
    meta tag or status cell says "Out of Stock", so an explicit false here overrides JSON-LD. */
export function readStock(html) {
  const meta = stockOf(
    metaContent(html, 'product:availability') ??
    metaContent(html, 'og:availability') ??
    metaContent(html, 'availability') ??
    (/content=["']Availability["']/i.test(html) ? metaContent(html, 'twitter:data2') : undefined)
  );
  if (meta !== null) return meta;

  const itemprops = [...html.matchAll(/itemprop=["']availability["'][^>]*?(?:href|content)=["']([^"']+)["']/gi)]
    .map(match => stockOf(match[1]))
    .filter(value => value !== null);
  if (new Set(itemprops).size === 1) return itemprops[0];

  const body = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  const badges = [
    body.match(/<td[^>]*class=["'][^"']*\bproduct-status\b[^"']*["'][^>]*>([^<]+)</i)?.[1],
    body.match(/<li[^>]*class=["'][^"']*\bproduct-stock\b[^"']*["'][^>]*>[\s\S]{0,120}?<span>([^<]+)</i)?.[1],
    body.match(/id=["']product-available["'][^>]*>([^<]+)</i)?.[1],
    body.match(/class=["'][^"']*\bstock-badge\b[^"']*["'][^>]*>([^<]+)</i)?.[1]
  ].map(stockOf).filter(value => value !== null);
  return new Set(badges).size === 1 ? badges[0] : null;
}

/** Strips shop SEO boilerplate ("… Price in Bangladesh | Star Tech") and rejects template tokens. */
export function cleanProductTitle(raw) {
  const cleaned = String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^shop\s+/i, '')
    .replace(/\s+at\s+\S+\.[a-z]+$/i, '')
    .replace(/\s+(?:best\s+|latest\s+)?price\s+in\s+(?:bangladesh|bd)(?:\s+20\d\d)?(?:\s*[|–—-].*)?$/i, '')
    .replace(/\s*[|–—-]\s*(?:price\s+in\s+(?:bangladesh|bd)|buy\s+online).*$/i, '')
    .trim();
  if (!cleaned || /%%[a-z_]+%%/i.test(cleaned) || /^(?:price\s+in\s+(?:bangladesh|bd)|home|welcome)\b/i.test(cleaned)) return '';
  return cleaned;
}

function readHeading(html) {
  const headings = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)]
    .map(match => cleanProductTitle(decodeEntities(match[1].replace(/<[^>]+>/g, ' '))))
    .filter(Boolean);
  return headings.length === 1 ? headings[0] : '';
}

const GENERIC_TITLE_WORDS = new Set([
  'shop', 'store', 'online', 'official', 'original', 'bangladesh', 'price', 'prices', 'best', 'buy',
  'latest', 'new', 'product', 'products', 'item', 'items', 'the', 'and', 'with', 'for', 'offer',
  'special', 'deal', 'edition', 'version', 'series', 'model', 'pack', 'inch', 'black', 'white',
  'blue', 'silver', 'gray', 'grey', 'gold', 'green', 'pink', 'purple'
]);
const SLUG_SYNONYMS = { ps5: 'playstation', ps4: 'playstation', gpu: 'graphics', cpu: 'processor', mobo: 'motherboard', psu: 'power' };
const latinWords = text => [...String(text).toLowerCase().matchAll(/[a-z0-9]{3,}/g)]
  .map(match => match[0])
  .filter(word => /[a-z]/.test(word) && !GENERIC_TITLE_WORDS.has(word))
  .flatMap(word => (SLUG_SYNONYMS[word] ? [word, SLUG_SYNONYMS[word]] : [word]));

function contradictsTitle(name, pageTitle) {
  if (!name || !pageTitle || /[^\x00-\x7f]/.test(name) || /[^\x00-\x7f]/.test(pageTitle)) return false;
  const strippedTitle = cleanProductTitle(pageTitle.split(/\s*[|–—]\s*/)[0]);
  const a = latinWords(name);
  const b = latinWords(strippedTitle);
  if (a.length < 2 || b.length < 2) return false;
  const compactA = a.join('');
  const compactB = b.join('');
  return !a.some(word => b.includes(word) || compactB.includes(word)) &&
    !b.some(word => a.includes(word) || compactA.includes(word));
}

/** False when a product URL's path is a broken tracking parameter, root page, or clearly for a
    different English product than `name` (such as a server-rack slug serving a router's JSON-LD). */
export function isPlausibleProductPage(url, name) {
  const cleanName = cleanProductTitle(name);
  if (!url || !cleanName) return false;
  let pathname;
  try {
    ({ pathname } = new URL(url));
  } catch {
    return false;
  }
  if (/^\/?$/.test(pathname) || /\/srsltid=/i.test(pathname)) return false;
  if (/[^\x00-\x7f]/.test(cleanName)) return true;
  const slug = decodeURIComponent(pathname).replace(/\/+$/, '').split('/').pop() ?? '';
  const slugWords = latinWords(slug);
  const nameWords = latinWords(cleanName);
  if (slugWords.length < 2 || nameWords.length < 2) return true;
  const slugCompact = slug.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const nameCompact = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return slugWords.some(word => nameWords.includes(word) || nameCompact.includes(word)) ||
    nameWords.some(word => word.length >= 4 && slugCompact.includes(word));
}

/** A page's product photo, as written: its structured data's image, else its sharing image. */
export function readImage(html) {
  const products = [];
  for (const match of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      findProducts(JSON.parse(match[1].trim()), products);
    } catch {
      /* A malformed block has no photo to give. */
    }
  }
  findProducts(embeddedBlocks(html), products);
  return decodeEntities(firstImage(products.flatMap(product => [].concat(product.image ?? []))) || metaContent(html, 'og:image') || '');
}

/* Model numbers: three to five digits standing alone, as in "RTX 4060" or "HP 250 G9". Not a
   size ("20000mAh"), a code glued to letters ("HN7306") or a year ("Digipod 2026"). */
const modelNumbers = text => new Set((String(text).match(/(?<![\p{L}\d.,])\d{3,5}(?![\d.,]|\s*(?:mah|w|gb|tb|mm|hz|mhz|ghz|dpi|lumens|ml|g|v)\b)/giu) ?? [])
  .filter(number => !(number >= 2015 && number <= 2035)));

/** True when the page's only heading names model numbers and none of them are in the name. */
function headingContradicts(html, name) {
  const headings = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)];
  if (headings.length !== 1) return false;
  const inHeading = modelNumbers(decodeEntities(headings[0][1].replace(/<[^>]+>/g, ' ')));
  const inName = modelNumbers(name);
  return inHeading.size > 0 && inName.size > 0 && ![...inHeading].some(number => inName.has(number));
}

/** The page's clear taka price, or null with the reason it could not be trusted. */
export function readPage(html) {
  const rawTitle = decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').replace(/\s+/g, ' ').trim();
  const title = cleanProductTitle(rawTitle);
  const htmlStock = readStock(html);
  const found = readJsonLd(html) ?? readMeta(html) ?? readMicrodata(html);

  if (!found) return { title, price: null, inStock: htmlStock, reason: 'no-price' };
  if (found.ambiguous !== undefined) return { title, price: null, inStock: htmlStock, reason: 'ambiguous' };
  if (!Number.isFinite(found.price) || found.price <= 0) return { title, price: null, inStock: htmlStock, reason: 'no-price' };
  /* A price with no stated currency might not be taka, so it does not count. */
  if (found.currency !== 'BDT') return { title, price: null, inStock: htmlStock, reason: 'not-taka' };

  const structuredName = cleanProductTitle(found.name);
  if (structuredName && contradictsTitle(structuredName, rawTitle)) {
    return { title, price: null, inStock: htmlStock, reason: 'ambiguous' };
  }
  /* A page whose one heading names another model than its data or title is half edited: Star
     Tech's "RTX 4060" title and price sat over an "RTX 5060" heading. Which is sold is unclear. */
  if (headingContradicts(html, structuredName || title)) return { title, price: null, inStock: htmlStock, reason: 'ambiguous' };
  const name = structuredName || readHeading(html);
  const inStock = htmlStock === false ? false : (found.inStock ?? htmlStock);
  /* The product photo: the structured data's own, else the page's sharing image. */
  const image = decodeEntities(found.image || metaContent(html, 'og:image') || '');
  return { title, name, price: found.price, inStock, source: found.source, image };
}
