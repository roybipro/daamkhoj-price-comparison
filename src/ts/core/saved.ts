/* Products a shopper saved, kept in this browser only (no account), with the price each had when
   saved. The home page shows them with today's price from the price list, so a drop since
   saving is easy to spot. Storage can be missing or blocked (private windows), so every read
   and write is guarded and the site works the same without it. */

export interface SavedItem {
  /** The product's key in search answers, so the saved card can reopen the same product. */
  key: string;
  /** The search that showed it. */
  q: string;
  title: string;
  image: string | null;
  /** The lowest price shown when it was saved. */
  price: number;
  savedAt: string;
  /** Its shop pages. */
  urls: string[];
}

/** Today's lowest from the price list: a number, null when out of stock everywhere. */
export type SavedNow = { status: 'loading' } | { status: 'done'; price: number | null } | { status: 'unknown' };

const STORAGE_KEY = 'daamkhoj.saved.v1';
const MAX_ITEMS = 30;
const MAX_URLS = 40;
const now = new Map<string, SavedNow>();

const isItem = (value: unknown): value is SavedItem => {
  const item = value as SavedItem;
  return Boolean(item) && typeof item.key === 'string' && typeof item.q === 'string' && typeof item.title === 'string'
    && typeof item.price === 'number' && Array.isArray(item.urls);
};

export function savedItems(): SavedItem[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as unknown;
    return Array.isArray(parsed) ? parsed.filter(isItem).slice(0, MAX_ITEMS) : [];
  } catch {
    return [];
  }
}

function store(items: SavedItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
  } catch {
    /* Storage blocked: nothing is kept. */
  }
}

export const isSaved = (key: string): boolean => savedItems().some(item => item.key === key);

/** Saves the product, or forgets it when it is already saved. Says whether it is saved now. */
export function toggleSaved(item: SavedItem): boolean {
  const items = savedItems();
  if (items.some(saved => saved.key === item.key)) {
    store(items.filter(saved => saved.key !== item.key));
    return false;
  }
  store([{ ...item, urls: item.urls.slice(0, MAX_URLS) }, ...items]);
  now.set(item.key, { status: 'done', price: item.price });
  return true;
}

export function forgetAllSaved(): void {
  store([]);
}

export const savedNow = (key: string): SavedNow | undefined => now.get(key);

/** The product's lowest buyable price in a search answer, as its result card shows it: null when
    every shop has it out of stock, undefined when the answer doesn't have it any more. */
export function priceIn(groups: { offers: { product?: string; title: string; price: number; inStock: boolean | null }[] }[], key: string): number | null | undefined {
  const offers = groups.flatMap(group => group.offers).filter(offer => (offer.product || offer.title.toLowerCase()) === key);
  if (!offers.length) return undefined;
  const buyable = offers.filter(offer => offer.inStock !== false);
  return buyable.length ? Math.min(...buyable.map(offer => offer.price)) : null;
}

/** Asks the price list for each saved product's price today, once per page load, the same way
    its search did (so it matches what the product page shows), and calls `rerender` when they
    have all answered. */
export function loadSavedPrices(rerender: () => void): void {
  const waiting = savedItems().filter(item => !now.has(item.key));
  if (!waiting.length) return;
  for (const item of waiting) now.set(item.key, { status: 'loading' });
  void Promise.all(waiting.map(async item => {
    try {
      const params = new URLSearchParams({ q: item.q });
      const response = await fetch(`api/search/quick?${params}`, { signal: AbortSignal.timeout(15_000), headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(String(response.status));
      const body = await response.json() as { groups?: Parameters<typeof priceIn>[0] };
      const price = Array.isArray(body.groups) ? priceIn(body.groups, item.key) : undefined;
      now.set(item.key, price === undefined ? { status: 'unknown' } : { status: 'done', price });
    } catch {
      now.set(item.key, { status: 'unknown' });
    }
  })).then(rerender);
}
