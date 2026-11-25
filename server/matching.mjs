/* Decides whether a page is the product someone searched for, and which version of it.
   Only pages of the same version get compared, so ৳53,500 for an i3 laptop is never called
   cheaper than ৳68,000 for an i7. When in doubt a page stays out of the comparison. */

const NOISE = new Set(['price', 'prices', 'in', 'bd', 'bangladesh', 'buy', 'online', 'best', 'the', 'for', 'of', 'new', 'original', 'latest', 'cheap', 'cheapest']);

/* A page containing one of these is a different product unless the search asked for it. */
const OTHER_PRODUCT = new Set([
  'pro', 'plus', 'max', 'mini', 'ultra', 'lite', 'series', 'fe', 'neo',
  'case', 'cover', 'protector', 'glass', 'strap', 'cable', 'charger', 'adapter', 'pouch', 'skin', 'battery', 'replacement', 'parts',
  'sleeve', 'film', 'lens', 'folio', 'keyboard', 'pen', 'pencil', 'stylus', 'tip', 'tips', 'loop', 'holder', 'mount', 'stand', 'dock', 'hub', 'bag', 'guard', 'shield',
  'used', 'refurbished', 'preowned', 'secondhand', 'renewed'
]);

const GENERIC_BRAND = new Set(['premium', 'fresh', 'pure', 'local', 'organic', 'special', 'best', 'buy', 'new', 'original', 'quality', 'super', 'loose']);

const PACK_UNIT = { kg: 'kg', kgs: 'kg', g: 'g', gm: 'g', gms: 'g', gram: 'g', grams: 'g', l: 'l', ltr: 'l', ltrs: 'l', litre: 'l', litres: 'l', liter: 'l', liters: 'l', ml: 'ml' };

/* Shops write one size and one word many ways, so all of them reduce to a single spelling. */
const joinUnits = text => text
  .toLowerCase()
  .replace(/([\p{L}\p{N}])\+(?![\p{L}\p{N}])/gu, '$1 plus')
  .replace(/pre[\s-]owned/g, 'preowned')
  .replace(/second[\s-]hand/g, 'secondhand')
  .replace(/\bsoya\s?bean\b/g, 'soybean')
  .replace(/(\d)\s*(kgs?|gms?|grams?|g|ltrs?|litres?|liters?|l|ml)\b/g, (_, digit, unit) => `${digit}${PACK_UNIT[unit]}`)
  .replace(/(\d)\s+(gb|tb)\b/g, '$1$2');

const tokensOf = text => joinUnits(text).split(/[^\p{L}\p{N}.]+|(?<!\d)\.|\.(?!\d)/u).filter(Boolean);

export function queryTokens(query) {
  return tokensOf(query).filter(token => !NOISE.has(token));
}

/** A cheap check on a search result, so pages about something else are never opened. Sizes and
    model numbers are left to the page itself, as results often leave them out. */
export function mentionsProduct(text, query) {
  return mentionsInTokens(wordSet(text), query);
}

/** The words of a text, worked out once so a long list can be checked against many searches. */
export const wordSet = text => new Set(tokensOf(text));

/** The words a search requires: every word of it that is not a number or a size. */
export const requiredWords = query => queryTokens(query).filter(token => !/\d/.test(token));

/** mentionsProduct, for words already split by wordSet. */
export function mentionsInTokens(tokens, query) {
  return queryTokens(query).filter(token => !/\d/.test(token)).every(token => tokens.has(token));
}

const UNIT_AFTER = /^(mah|w|gb|tb|mm|hz|kg|g|l|ml|inch|in)$/;

export function matchesQuery(name, query) {
  const wanted = queryTokens(query);
  if (!wanted.length) return false;
  const list = tokensOf(name);
  const tokens = new Set(list);
  const joined = new Set();
  for (let i = 0; i < list.length - 1; i++) {
    joined.add(list[i] + list[i + 1]);
    if (i < list.length - 2) joined.add(list[i] + list[i + 1] + list[i + 2]);
  }
  const asked = new Set(tokensOf(query));

  if (!asked.has('for') && /\s(?:for|compatible\s+with)\s/i.test(name)) {
    const [subject, ...rest] = name.split(/\s+(?:for|compatible\s+with)\s+/i);
    const subjectTokens = new Set(tokensOf(subject));
    const restTokens = new Set(tokensOf(rest.join(' ')));
    if (!wanted.some(token => subjectTokens.has(token) && !restTokens.has(token))) return false;
  }

  const wantedCpu = cpuOf(query);
  const nameCpu = cpuOf(name);
  if (wantedCpu && nameCpu && wantedCpu !== nameCpu) return false;

  /* Model codes get written apart ("F-91W" for "f91w"), but a bare number must match
     whole: "15" is not in "2015". */
  /* A bare number also matches the same number with its unit: "20000" is "20000mah", "65" is "65w". */
  const withUnit = token => /^\d+$/.test(token) && [...tokens].some(word => word.startsWith(token) && UNIT_AFTER.test(word.slice(token.length)));
  const found = wanted.every(token => tokens.has(token) || withUnit(token) || (/\p{L}/u.test(token) && /\d/.test(token) && token.length >= 4 && joined.has(token)));
  if (!found) return false;
  return ![...tokens].some(token => OTHER_PRODUCT.has(token) && !asked.has(token));
}

const UNIT_LABEL = { kg: 'kg', g: 'g', l: 'L', ml: 'ml' };

function packOf(text) {
  /* "5G" on a phone is its network, not five grams. */
  const match = joinUnits(text).match(/(?:^|[^\p{L}\p{N}.])(?![2-6]g(?![\p{L}\p{N}]))(\d+(?:\.\d+)?)(kg|g|l|ml)(?![\p{L}\p{N}])/u);
  return match ? `${match[1]}${UNIT_LABEL[match[2]]}` : '';
}

function brandOf(name, query) {
  const skip = new Set(tokensOf(query));
  const [first] = name.trim().split(/\s+/);
  /* "Pran-Latina" is Pran: joining the pieces would split one brand into two. */
  const [clean = ''] = (first ?? '').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (!clean || /\d/.test(clean)) return '';
  const lower = clean.toLowerCase();
  return skip.has(lower) || GENERIC_BRAND.has(lower) ? '' : clean;
}

function cpuOf(text) {
  const match = text.match(/\b(?:core\s*)?(i[3579])\b|\b(ryzen)\s*([3579])\b|\b(celeron|pentium)\b|\b(m[1-5])(?:\s+(pro|max|ultra))?\b(?:\s*chip)?/i);
  if (!match) return '';
  if (match[1]) return `Core ${match[1].toLowerCase()}`;
  if (match[2]) return `Ryzen ${match[3]}`;
  if (match[4]) return match[4][0].toUpperCase() + match[4].slice(1).toLowerCase();
  return match[6] ? `${match[5].toUpperCase()} ${match[6][0].toUpperCase()}${match[6].slice(1).toLowerCase()}` : match[5].toUpperCase();
}

function memoryOf(text) {
  const lower = joinUnits(text);
  const pair = lower.match(/\b(\d{1,3})(?:gb)?\s*\/\s*(\d{1,4})\s*(gb|tb)\b/);
  if (pair && (pair[3] === 'tb' || Number(pair[1]) < Number(pair[2]))) {
    return { ram: `${pair[1]}GB`, storage: `${pair[2]}${pair[3].toUpperCase()}` };
  }

  let ram = '';
  let storage = '';
  const sizes = [...lower.matchAll(/\b(\d+)(gb|tb)(\s*ram\b)?/g)];
  if (sizes.length === 2 && !sizes[0][3] && !sizes[1][3] && sizes[0][2] === 'gb') {
    const a = Number(sizes[0][1]);
    const b = sizes[1][2] === 'tb' ? Number(sizes[1][1]) * 1024 : Number(sizes[1][1]);
    if (a < b) return { ram: `${a}GB`, storage: `${sizes[1][1]}${sizes[1][2].toUpperCase()}` };
  }
  for (const [, size, unit, isRam] of sizes) {
    if (isRam) ram ||= `${size}${unit.toUpperCase()}`;
    else if (unit === 'tb' || Number(size) >= 64) storage ||= `${size}${unit.toUpperCase()}`;
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
    storage
  ].filter(Boolean);

  if (!parts.length) return { key: '', label: 'Version not clear', clear: false };
  if (stock) parts.push(stock[0].toUpperCase() + stock.slice(1).toLowerCase());
  /* 5G splits versions, but alone it doesn't identify one: the memory could still differ. */
  if (/\b5g\b/i.test(name)) parts.push('5G');
  return { key: parts.join('|').toLowerCase(), label: parts.join(' · '), clear: true };
}

/** Edit distance where swapping two neighbouring letters counts as one slip. */
function editDistance(a, b, limit) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let before = null;
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      let cost = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (before && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cost = Math.min(cost, before[j - 2] + 1);
      row.push(cost);
      best = Math.min(best, cost);
    }
    if (best > limit) return limit + 1;
    before = previous;
    previous = row;
  }
  return previous[b.length];
}

/** Adds a name's words to a speller's counts, for a caller that reads the names one at a time. */
export function countSpellings(name, counts) {
  for (const token of tokensOf(name)) {
    if (/^\p{L}{3,}$/u.test(token)) counts.set(token, (counts.get(token) ?? 0) + 1);
  }
}

/**
 * A spelling corrector for searches, learned from the product names it will search: a word the
 * names never use is swapped for the closest one they do ("onplus" → "oneplus"), the commonest
 * when several are as close. Words with digits are model numbers and sizes, and stay as typed.
 */
export function createSpeller(names, counts = new Map()) {
  for (const name of names) countSpellings(name, counts);
  const known = [...counts].sort((a, b) => b[1] - a[1]).map(([token]) => token);

  const fix = token => {
    if (counts.has(token) || NOISE.has(token) || token.length < 4 || !/^\p{L}+$/u.test(token)) return token;
    const limit = token.length >= 8 ? 2 : 1;
    let best = token;
    let bestDistance = limit + 1;
    for (const word of known) {
      const distance = editDistance(token, word, Math.min(limit, bestDistance - 1));
      if (distance < bestDistance) {
        best = word;
        bestDistance = distance;
        if (distance === 1) break;
      }
    }
    return best;
  };

  /** The query with its misspelt words corrected, or the query itself when nothing needed it. */
  return query => {
    const words = String(query).trim().split(/\s+/);
    const fixed = words.map(word => {
      const lower = word.toLowerCase();
      const corrected = fix(lower);
      return corrected === lower ? word : corrected;
    });
    return fixed.join(' ');
  };
}
