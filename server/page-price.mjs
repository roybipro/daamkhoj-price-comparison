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

function readJsonLd(html) {
  const products = [];
  for (const match of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      findProducts(JSON.parse(match[1].trim()), products);
    } catch {
      /* A malformed block says nothing either way. */
    }
  }
  if (!products.length) return null;
  /* Several products usually means a listing or "related items"; which price is ours? */
  if (products.length > 1) return { ambiguous: true };

  const [product] = products;
  const offers = [].concat(product.offers ?? []).flatMap(offer =>
    (Array.isArray(offer.offers) ? offer.offers : [offer]));
  const prices = new Set(offers.filter(offer => offer.price !== undefined).map(offer => toNumber(offer.price)));
  if (prices.size > 1) return { ambiguous: true };
  if (!prices.size) return null;

  const offer = offers.find(item => item.price !== undefined);
  return {
    source: 'json-ld',
    price: [...prices][0],
    currency: String(offer.priceCurrency ?? '').toUpperCase(),
    name: decodeEntities(product.name ?? ''),
    inStock: stockOf(offer.availability)
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

  return { title, name: found.name.replace(/\s+/g, ' ').trim(), price: found.price, inStock: found.inStock, source: found.source };
}
