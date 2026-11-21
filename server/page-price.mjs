/* Reads one clear price from a shop's HTML. Pages are untrusted text: they are parsed here
   and never executed. Anything ambiguous returns no price, because a missing price is
   better than a wrong one on a comparison site. */

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', raquo: '»', laquo: '«' };

export function decodeEntities(text) {
  return String(text)
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (whole, name) => ENTITIES[name.toLowerCase()] ?? whole);
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

function stockOf(availability) {
  const value = String(availability ?? '').toLowerCase();
  if (/instock|in_stock|limitedavailability/.test(value)) return true;
  if (/outofstock|out_of_stock|soldout|discontinued/.test(value)) return false;
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
    inStock: stock.size === 1 ? [...stock][0] : null
  };
}

function readMeta(html) {
  const tag = name => {
    const before = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i'));
    const after = html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${name}["']`, 'i'));
    return (before ?? after)?.[1];
  };
  const price = tag('product:price:amount') ?? tag('og:price:amount');
  if (!price) return null;
  const currency = tag('product:price:currency') ?? tag('og:price:currency') ?? '';
  return { source: 'meta', price: toNumber(price), currency: currency.toUpperCase(), name: '', inStock: stockOf(tag('product:availability')) };
}

function readMicrodata(html) {
  const prices = [...html.matchAll(/itemprop=["']price["'][^>]*content=["']([\d.,]+)["']/gi)];
  if (prices.length !== 1) return prices.length ? { ambiguous: true } : null;
  const currency = html.match(/itemprop=["']priceCurrency["'][^>]*content=["'](\w+)["']/i)?.[1] ?? '';
  return { source: 'microdata', price: toNumber(prices[0][1]), currency: currency.toUpperCase(), name: '', inStock: null };
}

/** The page's clear taka price, or null with the reason it could not be trusted. */
export function readPage(html) {
  const title = decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').replace(/\s+/g, ' ').trim();
  const found = readJsonLd(html) ?? readMeta(html) ?? readMicrodata(html);

  if (!found) return { title, price: null, reason: 'no-price' };
  if (found.ambiguous !== undefined) return { title, price: null, reason: 'ambiguous' };
  if (!Number.isFinite(found.price) || found.price <= 0) return { title, price: null, reason: 'no-price' };
  /* A price with no stated currency might not be taka, so it does not count. */
  if (found.currency !== 'BDT') return { title, price: null, reason: 'not-taka' };

  /* Some shops write their own marketing around the name: "Shop X at Shop.com". */
  const name = found.name.replace(/\s+/g, ' ').trim().replace(/^shop\s+/i, '').replace(/\s+at\s+\S+\.[a-z]+$/i, '');
  return { title, name, price: found.price, inStock: found.inStock, source: found.source };
}
