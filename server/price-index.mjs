/* The saved price list, and the instant search over it. The file holds what the crawler read:

     { version: 1, shops: { "dazzle.com.bd": { crawledAt, stats, entries: [
         { shop, url, name, price, inStock, checkedAt } ] } } }

   with times as ISO strings. Searching it needs no network and no paid request. */

import { readFile, rename, stat, writeFile } from 'node:fs/promises';
import { fromBangla } from './bangla.mjs';
import { cleanQuery, dropSuspiciousPrices, groupOffers, mergeGroups, validQuery } from './live-search.mjs';
import { buildBrowse, discoverCategories, displayName, productKey } from './browse.mjs';
import { createSpeller, matchesQuery, mentionsInTokens, requiredWords, variantOf, wordSet } from './matching.mjs';

const EMPTY = { version: 1, shops: {} };

/** The saved list, or an empty one if there is none yet. A damaged file is an error, not empty. */
export async function loadIndexFile(file) {
  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return structuredClone(EMPTY);
    throw error;
  }
  const data = JSON.parse(text);
  if (data?.version !== 1 || typeof data.shops !== 'object') throw new Error(`${file} is not a price list`);
  return data;
}

/** How new a list is: its last save, or failing that its latest crawl. ISO times sort as text. */
export const listVersion = data => [data?.updatedAt ?? '', ...Object.values(data?.shops ?? {}).map(shop => shop.crawledAt ?? '')]
  .reduce((latest, time) => (time > latest ? time : latest), '');

/** Written beside the real file and then swapped in, so a crash never leaves half a list. */
export async function saveIndexFile(file, data) {
  data.updatedAt = new Date().toISOString();
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(data));
  await rename(temporary, file);
}

/**
 * Fetches a published copy of the list (the one the nightly crawl commits) and saves it over the
 * local file when it is newer, so a server that is never redeployed still gets each night's
 * prices. A download that is not a price list, or not newer, leaves the file alone. Says whether
 * it changed.
 */
export async function pullIndexFile(url, file, { fetchImpl = fetch, timeoutMs = 60_000, maxBytes = 100_000_000 } = {}) {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`price list download answered ${response.status}`);
  const text = await response.text();
  if (text.length > maxBytes) throw new Error('price list download is too large');
  const data = JSON.parse(text);
  if (data?.version !== 1 || typeof data.shops !== 'object' || data.shops === null) throw new Error('the download is not a price list');
  /* Only ever forward: a cache can hand back yesterday's copy, which must not replace a newer
     list deployed with the site. */
  const current = await readFile(file, 'utf8').then(JSON.parse).catch(() => null);
  if (current && listVersion(data) <= listVersion(current)) return false;
  const temporary = `${file}.${process.pid}.pull.tmp`;
  await writeFile(temporary, text);
  await rename(temporary, file);
  return true;
}

/**
 * Instant search over a loaded list. Prices older than `maxAgeMs` are left out rather than
 * shown as current, and at most `maxOffers` are returned, cheapest first within each version.
 */
export function createPriceIndex(data, { now = Date.now, maxAgeMs = 7 * 24 * 60 * 60 * 1000, maxOffers = 300 } = {}) {
  const entries = Object.values(data?.shops ?? {}).flatMap(shop => shop.entries ?? []);
  let shelves = null;
  let shelvedAt = -Infinity;
  /* Set when a re-check changed a price, so the shelves catch up within minutes, not an hour. */
  let shelvesStale = false;
  /* Each entry's words, split once, and for each word the entries that use it: a search starts
     from its rarest word's entries instead of reading every name in the list. */
  let words = null;
  let postings = null;
  const candidates = query => {
    if (!words) {
      words = entries.map(entry => wordSet(`${entry.name} ${entry.url}`));
      postings = new Map();
      words.forEach((set, i) => {
        for (const word of set) {
          const list = postings.get(word);
          if (list) list.push(i);
          else postings.set(word, [i]);
        }
      });
    }
    const lists = requiredWords(query).map(word => postings.get(word) ?? []);
    if (!lists.length) return entries.map((_, i) => i);
    return lists.reduce((smallest, list) => (list.length < smallest.length ? list : smallest));
  };
  let speller = null;

  /** Prices whose names hold every word of the query, freshest list only. */
  function searchExactly(rawQuery) {
    const query = validQuery(rawQuery);
    const oldest = now() - maxAgeMs;
    const matched = candidates(query)
      .filter(i => mentionsInTokens(words[i], query) && Date.parse(entries[i].checkedAt) >= oldest && matchesQuery(entries[i].name, query))
      .map(i => entries[i]);

    const offers = matched.map(entry => ({
      shop: entry.shop,
      url: entry.url,
      title: entry.name,
      price: entry.price,
      inStock: entry.inStock,
      checkedAt: entry.checkedAt,
      image: entry.image,
      variant: variantOf(entry.name, query)
    }));
    const { kept, dropped } = dropSuspiciousPrices(offers);
    const shown = kept.sort((a, b) => a.price - b.price).slice(0, maxOffers);
    const groups = groupOffers(shown);
    const listed = groups.flatMap(group => group.offers);
    const newest = listed.reduce((latest, offer) => (offer.checkedAt > latest ? offer.checkedAt : latest), '');

    return {
      query,
      source: 'index',
      checkedAt: newest || new Date(now()).toISOString(),
      cached: true,
      found: matched.length,
      priced: listed.length,
      skipped: { notShop: 0, blocked: 0, noPrice: dropped, otherProduct: 0, failed: 0 },
      groups
    };
  }

  /* How many product names use each word, for telling known words from slips. */
  let wordCounts = null;
  const countOf = word => {
    if (!wordCounts) {
      wordCounts = new Map();
      for (let i = 0; i < entries.length; i++) for (const name of namesOf(i)) wordCounts.set(name, (wordCounts.get(name) ?? 0) + 1);
    }
    return wordCounts.get(word) ?? 0;
  };

  /** Words shops write both joined and apart, written the other way: "powerbank" → "power bank",
      "ear buds" → "earbuds". Only words the list's names use count. */
  function respace(query) {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const out = [];
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const next = words[i + 1];
      if (next && countOf(word + next) >= 2) {
        out.push(word + next);
        i++;
        continue;
      }
      let best = null;
      /* Tried even when the joined word is known: this runs only when the search found nothing,
         and one shop's "Powerbank" is another's "Power Bank". */
      if (word.length >= 6 && /^\p{L}+$/u.test(word)) {
        for (let cut = 3; cut <= word.length - 3; cut++) {
          const score = Math.min(countOf(word.slice(0, cut)), countOf(word.slice(cut)));
          if (score >= 2 && score >= countOf(word) && (!best || score > best.score)) {
            best = { score, words: [word.slice(0, cut), word.slice(cut)] };
          }
        }
      }
      out.push(...(best?.words ?? [word]));
    }
    return out.join(' ');
  }

  /* A search that finds nothing is tried again with words joined or split the way the list's
     names write them, then with its spelling corrected, and says so. A search that finds
     something is never "corrected", though compound variants ("powerbank" / "power bank") merge. */
  function searchCorrecting(rawQuery) {
    const answer = searchExactly(rawQuery);
    const respaced = respace(answer.query);
    if (respaced !== answer.query.toLowerCase()) {
      const retried = searchExactly(respaced);
      if (!answer.found && retried.found) return { ...retried, correctedFrom: answer.query };
      if (answer.found && retried.found) {
        const groups = mergeGroups(answer.groups, retried.groups);
        const listed = groups.flatMap(group => group.offers);
        return { ...answer, found: answer.found + retried.found, priced: listed.length, groups };
      }
    }
    if (answer.found) return answer;
    speller ??= createSpeller(entries.map(entry => entry.name));
    const corrected = speller(answer.query);
    if (corrected.toLowerCase() === answer.query.toLowerCase()) return answer;
    const retried = searchExactly(corrected);
    return retried.found ? { ...retried, correctedFrom: answer.query } : answer;
  }

  /* When nothing matches, the closest thing the list has: the search with one word left out,
     keeping the narrowest that still finds something ("apple smartwatch" → "apple watch", not
     every smart watch). The answer says it is a broader search, so the page can say so while the
     web search looks for the real thing. */
  function searchClosest(rawQuery) {
    const answer = searchCorrecting(rawQuery);
    if (answer.found) return answer;
    const words = respace(answer.query).split(/\s+/);
    if (words.length < 2) return answer;
    const pickBest = indices => {
      let best = null;
      for (const skip of indices) {
        let broader;
        try {
          broader = searchCorrecting(words.filter((_, i) => i !== skip).join(' '));
        } catch {
          continue;
        }
        if (broader.found && (!best || broader.found < best.found)) best = broader;
      }
      return best;
    };
    const all = words.map((_, i) => i);
    const sizes = all.filter(i => /^\d+(?:\.\d+)?(?:gb|tb|mah|w|mm|inch)$/i.test(words[i]));
    const rest = all.filter(i => i > 0 && !sizes.includes(i));
    const best = (sizes.length && pickBest(sizes)) || (rest.length && pickBest(rest)) || pickBest([0]);
    return best ? { ...best, broadenedFrom: answer.query } : answer;
  }

  /* Each listing's words as its name uses them (URLs left out, so "prod" never becomes "product"
     from every shop's web address), worked out when a half-typed word first needs them. */
  let nameWords = null;
  const namesOf = i => {
    nameWords ??= new Array(entries.length);
    return (nameWords[i] ??= wordSet(entries[i].name));
  };

  /** The commonest word that starts with `start` (itself included) among the listings holding
      every word in `before`: "a1" after "galaxy" is "a16", while "ip" alone is "iphone". */
  function completeWord(start, before) {
    candidates('');
    let pool = before.length
      ? before.map(word => postings.get(word) ?? []).reduce((smallest, list) => (list.length < smallest.length ? list : smallest))
      : null;
    pool = pool?.filter(i => before.every(word => words[i].has(word)));
    if (!pool?.length) pool = entries.map((_, i) => i);
    const counts = new Map();
    for (const i of pool) {
      for (const word of namesOf(i)) {
        if (word.startsWith(start) && !before.includes(word)) counts.set(word, (counts.get(word) ?? 0) + 1);
      }
    }
    let best = start;
    let bestCount = 0;
    for (const [word, count] of counts) {
      if (count > bestCount || (count === bestCount && word.length < best.length)) { best = word; bestCount = count; }
    }
    return best;
  }

  /* Every product in the list, for suggestions: its name as shops write it, its words, how many
     shops sell it and how many listings it has. */
  let products = null;
  function suggest(typed) {
    if (!products) {
      const groups = new Map();
      for (const entry of entries) {
        const key = productKey(entry.name);
        if (key.length < 3) continue;
        const group = groups.get(key) ?? { key, names: [], shops: new Set(), count: 0 };
        if (group.names.length < 3) group.names.push(entry.name);
        group.shops.add(entry.shop);
        group.count++;
        groups.set(key, group);
      }
      products = [...groups.values()]
        .map(group => ({ name: displayName(group.key, group.names), words: group.key.split(' '), shops: group.shops.size, count: group.count }))
        .sort((a, b) => b.shops - a.shops || b.count - a.count);
    }
    const typedWords = String(typed).toLowerCase().split(/[^\p{L}\p{N}+]+/u).filter(Boolean);
    if (!typedWords.length) return [];
    const last = typedWords.pop();
    const found = [];
    for (const product of products) {
      if (typedWords.every(word => product.words.includes(word)) && product.words.some(word => word.startsWith(last))) {
        found.push(product);
        if (found.length === 6) break;
      }
    }
    return found;
  }

  /* While a word is still being typed, it is completed to the commonest word that starts that
     way ("iph" → "iphone", "galaxy a1" → "galaxy a16"), and the answer says what was typed. */
  function searchAsTyped(rawQuery, closest) {
    const fallback = closest ? searchClosest : searchCorrecting;
    const typed = String(rawQuery ?? '').trim();
    const words = typed.split(/\s+/);
    const last = words.at(-1).toLowerCase();
    const before = [...wordSet(words.slice(0, -1).join(' '))];
    const suggested = suggest(typed);
    /* Completions to try, best first: the word the top suggestion uses, so the results agree
       with the list under the box, then the commonest word that starts that way. The first that
       finds prices wins; if none does, the search runs as typed. */
    const suggestions = suggested.map(({ name, shops }) => ({ name, shops }));
    if (!/^[\p{L}\p{N}]+$/u.test(last) || (last.length < 2 && !before.length)) return { ...fallback(typed), suggestions };
    const options = [
      suggested[0]?.words.find(word => word.startsWith(last) && !before.includes(word)),
      completeWord(last, before)
    ].filter((word, i, all) => word && word !== last && all.indexOf(word) === i);
    for (const word of options) {
      const completed = [...words.slice(0, -1), word].join(' ');
      const answer = searchCorrecting(completed);
      if (answer.found) return { ...answer, completedFrom: typed, suggestions };
    }
    return { ...fallback(typed), suggestions };
  }

  /* Prices re-read from the shops' pages, applied to the list in memory until the next one loads. */
  let byUrl = null;
  function update(fresh) {
    byUrl ??= new Map(entries.map(entry => [entry.url, entry]));
    let changed = 0;
    let pictured = 0;
    for (const item of fresh) {
      const entry = byUrl.get(item.url);
      if (!entry || !(item.price > 0)) continue;
      if (entry.price !== item.price || entry.inStock !== item.inStock) changed++;
      entry.price = item.price;
      entry.inStock = item.inStock ?? null;
      entry.checkedAt = item.checkedAt;
      if (item.image && !entry.image) {
        entry.image = item.image;
        pictured++;
      }
    }
    if (changed || pictured) shelvesStale = true;
    return changed;
  }

  const index = {
    size: entries.length,
    shops: Object.keys(data?.shops ?? {}).length,

    /** `partial` while the last word may still be half typed; `closest` to fall back to a broader
        search rather than nothing, for a shopper (never for merging with a web search). */
    search: (rawQuery, { partial = false, closest = false } = {}) => {
      /* A search typed in Bangla runs in the shops' English and says what it was read as, the way
         a spelling correction does: "আইফোন ১৫" → "iphone 15". */
      const typed = cleanQuery(rawQuery);
      const query = fromBangla(typed, { partial });
      const answer = partial ? searchAsTyped(query, closest) : closest ? searchClosest(query) : searchCorrecting(query);
      return query === typed ? answer : { ...answer, correctedFrom: typed };
    },
    update,

    /** Builds the shelves again at the next ask, as after a batch of photos arrives. */
    reshelve() {
      shelves = null;
      shelvedAt = now();
      shelvesStale = false;
    },

    /** The home page's shelves. Rebuilt hourly: the list doesn't change, but prices age out of it,
        and a card must never offer a price its own search would leave out. */
    browse() {
      if (now() - shelvedAt >= 60 * 60 * 1000 || (shelvesStale && now() - shelvedAt >= 5 * 60 * 1000)) {
        shelves = null;
        shelvedAt = now();
        shelvesStale = false;
      }
      if (!shelves) {
        const fresh = now() - maxAgeMs;
        const counts = Object.fromEntries(Object.entries(data?.shops ?? {}).map(([shop, { entries: listed = [] }]) =>
          [shop, listed.filter(entry => Date.parse(entry.checkedAt) >= fresh).length]));
        shelves = buildBrowse(query => searchExactly(query), counts,
          discoverCategories(entries.filter(entry => Date.parse(entry.checkedAt) >= fresh)));
      }
      return shelves;
    }
  };
  return index;
}

/**
 * Search over the saved list that follows new crawls without a restart. The file is checked at
 * most once per `checkEveryMs`, and a damaged one is skipped: the last good list keeps serving.
 */
export function watchIndexFile(file, { now = Date.now, checkEveryMs = 30_000, log = () => {}, onLoad = () => {}, ...options } = {}) {
  let index = createPriceIndex(null, { now, ...options });
  let loadedVersion = null;
  let checkedAt = -Infinity;
  let refreshing = null;

  async function doRefresh() {
    checkedAt = now();
    const version = await stat(file).then(info => `${info.mtimeMs}:${info.size}`, () => 'none');
    if (version === loadedVersion) return;
    try {
      index = createPriceIndex(await loadIndexFile(file), { now, ...options });
      loadedVersion = version;
      log(`price list: ${index.size} prices from ${index.shops} shops`);
      /* Shelve now, in the background, so the first visitor's home page doesn't wait for it. */
      const loaded = index;
      setTimeout(() => {
        try {
          loaded.browse();
        } catch {
          /* Reported when asked for. */
        }
        /* Then whatever should follow a new list, such as finding photos its cards lack. */
        Promise.resolve().then(() => onLoad(loaded)).catch(error => log(`after loading the price list: ${error.message}`));
      }, 0).unref?.();
    } catch (error) {
      log(`price list not reloaded: ${error.message}`);
    }
  }

  function refresh() {
    if (refreshing) return refreshing;
    if (now() - checkedAt < checkEveryMs) return Promise.resolve();
    refreshing = doRefresh().finally(() => { refreshing = null; });
    return refreshing;
  }

  const search = async (rawQuery, options) => {
    await refresh();
    return index.search(rawQuery, options);
  };
  search.browse = async () => {
    await refresh();
    return index.browse();
  };
  /** The list being served, for work that changes it in memory, such as a price re-check. */
  search.index = async () => {
    await refresh();
    return index;
  };
  return search;
}
