/* Decides whether a page is the product someone searched for, and which version of it.
   Only pages of the same version get compared, so ৳53,500 for an i3 laptop is never called
   cheaper than ৳68,000 for an i7. When in doubt a page stays out of the comparison. */

const NOISE = new Set(['price', 'prices', 'in', 'bd', 'bangladesh', 'buy', 'online', 'best', 'the', 'for', 'of', 'new', 'original', 'latest', 'cheap', 'cheapest']);

/* A page containing one of these is a different product unless the search asked for it. */
const OTHER_PRODUCT = new Set([
  'pro', 'plus', 'max', 'mini', 'ultra', 'lite', 'series',
  'case', 'cover', 'protector', 'glass', 'strap', 'cable', 'charger', 'adapter', 'pouch', 'skin', 'battery', 'replacement', 'parts',
  'used', 'refurbished', 'preowned', 'secondhand', 'renewed'
]);

const GENERIC_BRAND = new Set(['premium', 'fresh', 'pure', 'local', 'organic', 'special', 'best', 'buy', 'new', 'original', 'quality', 'super', 'loose']);

const joinUnits = text => text
  .toLowerCase()
  .replace(/pre[\s-]owned/g, 'preowned')
  .replace(/second[\s-]hand/g, 'secondhand')
  .replace(/(\d)\s+(kg|gm|g|ltr|litre|liter|l|ml|gb|tb)\b/g, '$1$2');

const tokensOf = text => joinUnits(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean);

export function queryTokens(query) {
  return tokensOf(query).filter(token => !NOISE.has(token));
}

export function matchesQuery(name, query) {
  const wanted = queryTokens(query);
  if (!wanted.length) return false;
  const tokens = new Set(tokensOf(name));
  const compact = [...tokensOf(name)].join('');
  const asked = new Set(tokensOf(query));

  /* Model codes get written apart ("F-91W" for "f91w"), but a bare number must match
     whole: "15" is not in "2015". */
  const found = wanted.every(token => tokens.has(token) || (/\p{L}/u.test(token) && /\d/.test(token) && token.length >= 4 && compact.includes(token)));
  if (!found) return false;
  return ![...tokens].some(token => OTHER_PRODUCT.has(token) && !asked.has(token));
}

const UNIT = { kg: 'kg', gm: 'g', g: 'g', ltr: 'L', litre: 'L', liter: 'L', l: 'L', ml: 'ml' };

function packOf(text) {
  const match = joinUnits(text).match(/(?:^|[^\p{L}\p{N}.])(\d+(?:\.\d+)?)(kg|gm|g|ltr|litre|liter|l|ml)(?![\p{L}\p{N}])/u);
  return match ? `${match[1]}${UNIT[match[2]]}` : '';
}

function brandOf(name, query) {
  const skip = new Set(tokensOf(query));
  const [first] = name.trim().split(/\s+/);
  const clean = (first ?? '').replace(/[^\p{L}\p{N}]/gu, '');
  if (!clean || /\d/.test(clean)) return '';
  const lower = clean.toLowerCase();
  return skip.has(lower) || GENERIC_BRAND.has(lower) ? '' : clean;
}

function cpuOf(text) {
  const match = text.match(/\b(?:core\s*)?(i[3579])\b|\b(ryzen)\s*([3579])\b|\b(celeron|pentium)\b|\b(m[1-5])\s*(?:chip|pro|max)?\b/i);
  if (!match) return '';
  if (match[1]) return `Core ${match[1].toLowerCase()}`;
  if (match[2]) return `Ryzen ${match[3]}`;
  if (match[4]) return match[4][0].toUpperCase() + match[4].slice(1).toLowerCase();
  return match[5].toUpperCase();
}

function memoryOf(text) {
  const lower = joinUnits(text);
  const pair = lower.match(/\b(\d{1,2})\s*\/\s*(\d{2,4})\s*gb\b/);
  if (pair) return { ram: `${pair[1]}GB`, storage: `${pair[2]}GB` };

  let ram = '';
  let storage = '';
  for (const [, size, unit] of lower.matchAll(/\b(\d+)(gb|tb)\b/g)) {
    if (unit === 'tb' || Number(size) >= 64) storage ||= `${size}${unit.toUpperCase()}`;
    else ram ||= `${size}GB`;
  }
  return { ram, storage };
}

/** The version a page describes. `clear` is false when nothing tells versions apart. */
export function variantOf(name, query) {
  const pack = packOf(name);
  /* Packaged goods differ by brand and size; everything else by its specification. */
  if (pack) {
    const brand = brandOf(name, query);
    if (!brand) return { key: '', label: 'Version not clear', clear: false };
    return { key: `${brand.toLowerCase()}|${pack}`, label: `${brand} · ${pack}`, clear: true };
  }

  const cpu = cpuOf(name);
  const generation = name.match(/\b(\d{1,2})(?:st|nd|rd|th)[\s-]*gen/i)?.[1];
  const { ram, storage } = memoryOf(name);
  const stock = name.match(/\b(unofficial|official)\b/i)?.[1];

  const parts = [
    cpu,
    generation && `${generation}th gen`,
    ram && `${ram} RAM`,
    storage,
    stock && stock[0].toUpperCase() + stock.slice(1).toLowerCase()
  ].filter(Boolean);

  if (!parts.length) return { key: '', label: 'Version not clear', clear: false };
  return { key: parts.join('|').toLowerCase(), label: parts.join(' · '), clear: true };
}
