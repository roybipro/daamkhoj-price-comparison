/* A build: several products a shopper wants together (a PC's parts, say), and what they cost in
   all, two ways: each from whichever shop sells it cheapest, or everything from one shop. Kept in
   this browser only; each product's shop prices come from the price list, like its search. */

import { priceIn } from './saved.js';

export interface BasketItem {
  /** This entry's own id: the product, and the version when its page lists several. */
  key: string;
  /** The product's key in search answers. */
  product: string;
  /** The version (a search answer's group label), when the product's page lists several. */
  version?: string;
  /** The search that showed it. */
  q: string;
  title: string;
  image: string | null;
}

export interface BasketOffer { shop: string; url: string; title: string; price: number; inStock: boolean | null }

/** A product's buyable offers today, cheapest first, or why there are none. */
export type BasketPrices = { status: 'loading' } | { status: 'done'; offers: BasketOffer[] } | { status: 'unknown' };

const STORAGE_KEY = 'daamkhoj.basket.v1';
export const MAX_BASKET = 15;
const prices = new Map<string, BasketPrices>();

const isItem = (value: unknown): value is BasketItem => {
  const item = value as BasketItem;
  return Boolean(item) && typeof item.key === 'string' && typeof item.product === 'string'
    && typeof item.q === 'string' && typeof item.title === 'string';
};

export function basketItems(): BasketItem[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as unknown;
    return Array.isArray(parsed) ? parsed.filter(isItem).slice(0, MAX_BASKET) : [];
  } catch {
    return [];
  }
}

function store(items: BasketItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_BASKET)));
  } catch {
    /* Storage blocked: nothing is kept. */
  }
}

export const inBasket = (key: string): boolean => basketItems().some(item => item.key === key);

/** Buyable offers only, cheapest first: an out-of-stock price can't be part of a build's cost. */
const buyable = (offers: BasketOffer[]): BasketOffer[] =>
  offers.filter(offer => offer.inStock !== false && offer.price > 0).sort((a, b) => a.price - b.price);

/** Adds the product (with the offers its page shows, so the build is priced at once), or takes it
    out when it is already in. Says whether it is in the build now. A full build adds nothing. */
export function toggleBasket(item: BasketItem, offers: BasketOffer[] = []): boolean {
  const items = basketItems();
  if (items.some(saved => saved.key === item.key)) {
    store(items.filter(saved => saved.key !== item.key));
    return false;
  }
  if (items.length >= MAX_BASKET) return false;
  store([...items, { key: item.key, product: item.product, version: item.version, q: item.q, title: item.title, image: item.image }]);
  if (offers.length) prices.set(item.key, { status: 'done', offers: buyable(offers) });
  return true;
}

export function removeFromBasket(key: string): void {
  store(basketItems().filter(item => item.key !== key));
}

export function clearBasket(): void {
  store([]);
}

export const basketPrices = (key: string): BasketPrices | undefined => prices.get(key);

/** Asks the price list for each product in the build that has no prices yet, the way its search
    did, and calls `rerender` when they have all answered. */
export function loadBasketPrices(rerender: () => void): void {
  const waiting = basketItems().filter(item => !prices.has(item.key));
  if (!waiting.length) return;
  for (const item of waiting) prices.set(item.key, { status: 'loading' });
  void Promise.all(waiting.map(async item => {
    try {
      const response = await fetch(`api/search/quick?${new URLSearchParams({ q: item.q })}`, {
        signal: AbortSignal.timeout(15_000), headers: { accept: 'application/json' }
      });
      if (!response.ok) throw new Error(String(response.status));
      const body = await response.json() as { groups?: { label?: string; offers: (BasketOffer & { product?: string })[] }[] };
      /* Only the version that was added, when it was one of several. */
      const groups = (Array.isArray(body.groups) ? body.groups : []).filter(group => item.version === undefined || group.label === item.version);
      const offers = groups.flatMap(group => group.offers).filter(offer => (offer.product || offer.title.toLowerCase()) === item.product);
      prices.set(item.key, priceIn(groups, item.product) === undefined ? { status: 'unknown' } : { status: 'done', offers: buyable(offers) });
    } catch {
      prices.set(item.key, { status: 'unknown' });
    }
  })).then(rerender);
}

export interface ShopTotal {
  shop: string;
  /** This shop's cheapest buyable offer for each product it has, by product key. */
  picks: Map<string, BasketOffer>;
  total: number;
}

export interface BasketPlan {
  /** Each product from its cheapest shop; products no shop has in stock are left out of it. */
  mix: { picks: Map<string, BasketOffer>; total: number; shops: number };
  /** Products with no buyable offer anywhere. */
  missing: string[];
  /** Shops by how many of the products they have in stock, then by their total for those. */
  shops: ShopTotal[];
  /** The cheapest shop that has every product, if any does. */
  oneShop: ShopTotal | null;
}

/** The build's cost both ways, from each product's buyable offers (by product key). */
export function planBasket(keys: string[], offersByKey: Map<string, BasketOffer[]>): BasketPlan {
  const picks = new Map<string, BasketOffer>();
  const missing: string[] = [];
  const byShop = new Map<string, ShopTotal>();
  for (const key of keys) {
    const offers = buyable(offersByKey.get(key) ?? []);
    if (!offers.length) { missing.push(key); continue; }
    picks.set(key, offers[0]);
    for (const offer of offers) {
      const shop = byShop.get(offer.shop) ?? { shop: offer.shop, picks: new Map(), total: 0 };
      byShop.set(offer.shop, shop);
      const held = shop.picks.get(key);
      if (!held || offer.price < held.price) {
        shop.total += offer.price - (held?.price ?? 0);
        shop.picks.set(key, offer);
      }
    }
  }
  const shops = [...byShop.values()].sort((a, b) => b.picks.size - a.picks.size || a.total - b.total);
  const priced = keys.length - missing.length;
  return {
    mix: {
      picks,
      total: [...picks.values()].reduce((sum, offer) => sum + offer.price, 0),
      shops: new Set([...picks.values()].map(offer => offer.shop)).size
    },
    missing,
    shops,
    oneShop: priced > 0 && shops[0]?.picks.size === keys.length ? shops[0] : null
  };
}

/* ---------- the build advisor (/api/advisor) ---------- */

export type AdviceUse = 'gaming' | 'editing' | 'office';

export interface AdvicePart {
  role: string; label: string; name: string; price: number; shop: string; url: string;
  image: string | null; product: string; inStock: boolean | null;
}

export interface Advice {
  budget: number; use: AdviceUse; total: number; parts: AdvicePart[]; missing: string[]; notes: string[];
}

export type AdviceState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; advice: Advice }
  | { status: 'error'; message: string };

/** What the form last asked for, kept so a re-render shows the same choice. */
export const adviceForm: { budget: number; use: AdviceUse } = { budget: 80_000, use: 'gaming' };
let advice: AdviceState = { status: 'idle' };
export const currentAdvice = (): AdviceState => advice;

export async function fetchAdvice(budget: number, use: AdviceUse, rerender: () => void): Promise<void> {
  adviceForm.budget = budget;
  adviceForm.use = use;
  advice = { status: 'loading' };
  rerender();
  try {
    const response = await fetch(`api/advisor?${new URLSearchParams({ budget: String(budget), use })}`, {
      signal: AbortSignal.timeout(30_000), headers: { accept: 'application/json' }
    });
    const body = await response.json() as Partial<Advice> & { error?: string };
    advice = response.ok && Array.isArray(body.parts)
      ? { status: 'done', advice: body as Advice }
      : { status: 'error', message: body.error ?? 'The build could not be made. Please try again.' };
  } catch {
    advice = { status: 'error', message: 'The build could not be made. Check your connection and try again.' };
  }
  rerender();
}

/** Puts the suggested parts in the build, in place of what was there. */
export function useAdvice(): boolean {
  if (advice.status !== 'done') return false;
  store(advice.advice.parts.map(part => ({ key: part.product, product: part.product, q: part.name, title: part.name, image: part.image })));
  for (const part of advice.advice.parts) prices.delete(part.product);
  advice = { status: 'idle' };
  return true;
}

export function dismissAdvice(): void {
  advice = { status: 'idle' };
}
