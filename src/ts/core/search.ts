import type { Category, CategoryId, Product, SearchApi, ShopProfile } from '../types.js';
import { normalise } from './format.js';

const WEIGHTS = { name: 6, localized: 6, brand: 4, alias: 4, category: 2, spec: 2, typo: 1 } as const;

/** Edit distance where swapping two neighbouring letters counts as one slip. */
function editDistance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
      }
    }
  }
  return rows[a.length][b.length];
}

/* Short words and anything with a digit must match exactly: "16gb" is not "15gb". */
function typoAllowance(term: string): number {
  if (term.length < 4 || /\d/.test(term)) return 0;
  return term.length >= 8 ? 2 : 1;
}

function isTypoOf(term: string, text: string): boolean {
  const allowance = typoAllowance(term);
  if (!allowance) return false;
  return text.split(/[^\p{L}\p{M}\p{N}]+/u).some(word =>
    !/\d/.test(word) && Math.abs(word.length - term.length) <= allowance && editDistance(term, word) <= allowance);
}

type Haystack = [text: string, weight: number];

function haystacksOf(product: Product, categories: Map<CategoryId, Category>): Haystack[] {
  return [
    [normalise(product.name), WEIGHTS.name],
    [normalise(product.bn), WEIGHTS.localized],
    [normalise(product.brand), WEIGHTS.brand],
    [normalise(product.spec), WEIGHTS.spec],
    ...product.aliases.map((alias): Haystack => [normalise(alias), WEIGHTS.alias]),
    [normalise(categories.get(product.cat)?.en ?? ''), WEIGHTS.category],
    [normalise(categories.get(product.cat)?.bn ?? ''), WEIGHTS.category]
  ];
}

function exactScore(term: string, haystacks: Haystack[]): number {
  let best = 0;
  for (const [text, weight] of haystacks) {
    if (!text) continue;
    if (text === term) best = Math.max(best, weight);
    else if (text.startsWith(term)) best = Math.max(best, weight - 1);
    else if (text.includes(term)) best = Math.max(best, Math.max(1, weight - 2));
  }
  return best;
}

/** Every term must match something, so "iphone 15 pro" narrows rather than drifting. */
function scoreProduct(haystacks: Haystack[], terms: string[], typos: ReadonlySet<string>): number | null {
  let score = 0;
  for (const term of terms) {
    const best = exactScore(term, haystacks)
      || (typos.has(term) && haystacks.some(([text]) => isTypoOf(term, text)) ? WEIGHTS.typo : 0);
    if (best === 0) return null;
    score += best;
  }
  return score;
}

/** Tolerant by design: English, Bangla and Banglish all reach the same product. */
export function createSearch(deps: {
  products: Product[];
  categories: Map<CategoryId, Category>;
  stores: ShopProfile[];
}): SearchApi {
  return {
    products(query: string) {
      const terms = normalise(query).split(/\s+/).filter(Boolean);
      if (!terms.length) return [];
      const indexed = deps.products.map(product => ({ product, haystacks: haystacksOf(product, deps.categories) }));
      /* A word the catalogue knows is not a typo: "iphone" must not fall back to "phone". */
      const typos = new Set(terms.filter(term => !indexed.some(({ haystacks }) => exactScore(term, haystacks))));
      return indexed
        .map(({ product, haystacks }) => ({ product, score: scoreProduct(haystacks, terms, typos) }))
        .filter((hit): hit is { product: Product; score: number } => hit.score !== null)
        .sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name));
    },

    stores(query: string) {
      const term = normalise(query);
      if (term.length < 2) return [];
      return deps.stores.filter(store =>
        normalise(store.name).includes(term) || normalise(store.bn).includes(term) || normalise(store.url).includes(term));
    }
  };
}
