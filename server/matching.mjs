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

const GPU_TIER = new Set(['ti', 'xt', 'xtx', 'gre']);

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
  .replace(/(\d)\s+(gb|tb)\b(?![/\s]*s\b)/g, '$1$2');

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

const UNIT_AFTER = /^(mah|w|gb|tb|mm|hz|kg|ml|inch|in)$/;

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

  /* "RTX 4070 Super" and "RTX 5060 Ti" / "RX 7600 XT" are distinct GPU tiers unless asked for. */
  if ([...tokens].some(token => GPU_TIER.has(token) && !asked.has(token))) return false;
  if (!asked.has('super') && /\b(?:rtx|gtx)\b/i.test(query) && /\b(?:rtx|gtx)\s*\d{3,4}(?:\s*ti)?\s+super\b/i.test(name)) {
    return false;
  }

  /* Full PC builds, laptops, and multi-part hardware bundles must not stand in for a single part. */
  const asksSystem = /\b(pc|computer|build|combo|bundle|rig|desktop\s+system)\b/i.test(query);
  if (!asksSystem && /\b(gaming\s+pc|desktop\s+pc|office\s+pc|budget\s+pc(?:[\s-]deal)?|full\s+pc|mini\s+pc|all[\s-]+in[\s-]+one\s+pc|desktop\s+computer|gaming\s+desktop|(?:gaming|productivity|pc)\s+build|pc\s+bundle|with\s+(?:full\s+)?pc|only\s+for\s+pc\s+bundle)\b/i.test(name)) {
    return false;
  }
  const asksPortableOrAio = /\b(laptop|notebook|macbook|imac|chromebook|vivobook|zenbook|ideapad|thinkpad|thinkbook|legion|loq|victus|omen|nitro|predator|rog|tuf|inspiron|pavilion|aspire|katana|cyborg|stealth|raider|vector|helios|strix|zephyrus)\b/i.test(query);
  if (!asksPortableOrAio &&
    /\b(laptop|notebook|macbook|imac|chromebook)\b/i.test(name) &&
    /\b(rtx|gtx|radeon|rx|graphics|processor|ryzen|motherboard|ssd|nvme|mouse|keyboard|monitor|psu|cooler)\b/i.test(query) &&
    !(asked.has('for') || /\s(?:for|compatible\s+with)\s/i.test(name))) {
    return false;
  }
  /* A standalone GPU never has an Intel/Ryzen CPU, and a standalone CPU never has an SSD/HDD. */
  if (!asksSystem && !asksPortableOrAio) {
    const asksGpuOnly = /\b(rtx|gtx|radeon|rx\s*\d{3,4}|arc\s*[ab]\d{3})\b/i.test(query) &&
      !/\b(ryzen|core|intel|i[3579])\b/i.test(query);
    if (asksGpuOnly && (cpuOf(name) || /\b(core\s+(?:ultra\s+)?[3579]|i[3579][-\s]\d{4,5})\b/i.test(name))) {
      return false;
    }
    const asksCpuOnly = /\b(ryzen\s*[3579]|core\s*i[3579]|processor)\b/i.test(query) &&
      !/\b(ssd|nvme|hdd|ram|rtx|gtx)\b/i.test(query);
    if (asksCpuOnly && /\b(\d+\s*(?:gb|tb)\s*(?:nvme\s*|m\.?2\s*)?ssd|\d+\s*tb\s*hdd)\b/i.test(name)) {
      return false;
    }
  }
  if (!asksSystem) {
    const partKinds = Number(/\bprocessor\b/i.test(name)) +
      Number(/\bmotherboard\b/i.test(name)) +
      Number(/\b(desktop\s+ram|gaming\s+ram)\b/i.test(name)) +
      Number(/\b(cpu\s+cooler|liquid\s+cooler)\b/i.test(name));
    if (partKinds >= 2) {
      const askedKinds = Number(/\b(processor|ryzen|core\s*i[3579])\b/i.test(query)) +
        Number(/\b(motherboard|[abxz]\d{3}m?)\b/i.test(query)) +
        Number(/\b(ram|vengeance|fury)\b/i.test(query)) +
        Number(/\b(cooler|ak\d{3}|masterliquid)\b/i.test(query));
      if (askedKinds < 2) return false;
    }
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
const TECH_ITEM = /\b(ryzen|intel|core|processor|cpu|geforce|radeon|rtx|gtx|graphics|gpu|gddr\d|ddr\d|motherboard|ssd|nvme|hdd|ram|dimm|laptop|notebook|macbook|monitor|router|lan|wifi|ethernet|gbps|gb\/s|mhz|ghz|mouse|keyboard|headset|earbuds|watch|phone|iphone|galaxy|redmi|poco|ipad|ups|psu|cooler)\b/i;

function packOf(text) {
  if (TECH_ITEM.test(text)) return '';
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
  const lower = joinUnits(text).replace(/\b\d+(?:\.\d+)?\s*(?:gb|tb)\s*\/\s*s\b|\b\d+(?:\.\d+)?\s*gbps\b/g, ' ');
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
  if (!ram && !storage && /\b(rtx|gtx|radeon|rx|arc|graphics|gddr\d)\b/i.test(text)) {
    const vram = text.match(/\b(4|6|8|10|12|16|20|24|32)g\b/i)?.[1];
    if (vram) ram = `${vram}GB`;
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
  const isStandaloneRam = !cpu && !storage && Boolean(ram) && /\b(ram|dimm|sodimm)\b/i.test(name) &&
    !/\b(laptop\b(?!\s*ram)|notebook|macbook|iphone|galaxy|redmi|poco|ipad|tablet|phone)\b/i.test(name);
  const isStandaloneGpu = !cpu && !storage && Boolean(ram) && /\b(graphics\s+card|gddr\d|geforce\s+rtx|geforce\s+gtx|radeon\s+rx)\b/i.test(name) &&
    !/\b(laptop|notebook|macbook|pc)\b/i.test(name);
  const ddr = isStandaloneRam ? name.match(/\b(ddr[345])\b/i)?.[1]?.toUpperCase() : undefined;
  const mhz = isStandaloneRam ? name.match(/\b(\d{4})\s*(?:mhz|mt\/s)\b/i)?.[1] : undefined;
  const form = isStandaloneRam && /\b(laptop\s+ram|sodimm|so-dimm)\b/i.test(name) ? 'Laptop' : undefined;
  const ramLabel = isStandaloneGpu
    ? `${ram} VRAM`
    : isStandaloneRam
      ? [ram, ddr, mhz && `${mhz}MHz`, form, 'RAM'].filter(Boolean).join(' ')
      : ram && `${ram} RAM`;

  const parts = [
    cpu,
    generation && `${generation}th gen`,
    ramLabel,
    storage
  ].filter(Boolean);

  if (!parts.length) {
    if (/\b(power\s+supply|psu|ups)\b/i.test(name)) {
      const power = name.match(/\b(\d{3,4})\s*(w|watt|va)\b/i);
      if (power) parts.push(`${power[1]}${power[2].toLowerCase().startsWith('w') ? 'W' : 'VA'}`);
    } else if (/\b(liquid\s+(?:cpu\s+)?cooler|aio)\b/i.test(name)) {
      const radiator = name.match(/\b(120|240|280|360|420)\s*mm\b/i);
      if (radiator) parts.push(`${radiator[1]}mm`);
    } else if (/\b(monitor|television|\btv\b)\b/i.test(name)) {
      const screen = name.match(/\b(\d{2}(?:\.\d+)?)\s*(?:inch|inches|"|”)/i);
      const hz = /\bmonitor\b/i.test(name) ? name.match(/\b(\d{2,3})\s*hz\b/i)?.[1] : undefined;
      if (screen) parts.push(`${screen[1]}"`);
      if (hz) parts.push(`${hz}Hz`);
    }
  }

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
