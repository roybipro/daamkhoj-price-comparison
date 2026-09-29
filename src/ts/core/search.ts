import type { Category, CategoryId, Product, SearchApi, ShopProfile } from '../types.js';
import { normalise } from './format.js';

const WEIGHTS = { name: 6, localized: 6, brand: 4, alias: 4, category: 2 } as const;

/** Every term must match something, so "iphone 15 pro" narrows rather than drifting. */
function scoreProduct(product: Product, terms: string[], categories: Map<CategoryId, Category>): number | null {
  const haystacks: [string, number][] = [
    [normalise(product.name), WEIGHTS.name],
    [normalise(product.bn), WEIGHTS.localized],
    [normalise(product.brand), WEIGHTS.brand],
    ...product.aliases.map((alias): [string, number] => [normalise(alias), WEIGHTS.alias]),
    [normalise(categories.get(product.cat)?.en ?? ''), WEIGHTS.category],
    [normalise(categories.get(product.cat)?.bn ?? ''), WEIGHTS.category]
  ];

  let score = 0;
  for (const term of terms) {
    let best = 0;
    for (const [text, weight] of haystacks) {
      if (!text) continue;
      if (text === term) best = Math.max(best, weight);
      else if (text.startsWith(term)) best = Math.max(best, weight - 1);
      else if (text.includes(term)) best = Math.max(best, Math.max(1, weight - 2));
    }
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
      return deps.products
        .map(product => ({ product, score: scoreProduct(product, terms, deps.categories) }))
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
