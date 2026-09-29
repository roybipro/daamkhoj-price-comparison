import { STORES } from '../data/stores.js';
import { PRODUCTS } from '../data/products.js';
import { RAW_OFFERS } from '../data/offers.js';
import { CATEGORIES, TRUST_WEIGHTS } from '../data/meta.js';
import type {
  Catalog, MarketStats, Offer, Shop, ShopProfile, TrustInput
} from '../types.js';
import { clamp } from './format.js';
import { scoreTrust } from './trust.js';
import { productLink, iconUrl } from './links.js';
import { priceHistory } from './price-history.js';

/** A joined listing before any derived numbers exist. */
type Listing = Omit<Offer, 'landed' | 'market' | 'trust' | 'savedVsMarket' | 'value' | 'history' | 'suppressed'>;

const EMPTY_MARKET: MarketStats = { min: 0, median: 0, max: 0, count: 0 };

function median(values: number[]): number {
  return values.length ? values[Math.floor((values.length - 1) / 2)] : 0;
}

/* Market stats ignore shops that no longer trade, so a dead site's bargain price
   never drags the average the living ones are measured against. */
function marketStats(listings: readonly Listing[]): Map<string, MarketStats> {
  const stats = new Map<string, MarketStats>();
  for (const product of PRODUCTS) {
    const prices = listings
      .filter(l => l.productId === product.id && !l.store.closed)
      .map(l => l.price + l.ship)
      .sort((a, b) => a - b);
    stats.set(product.id, {
      min: prices[0] ?? 0,
      median: median(prices),
      max: prices[prices.length - 1] ?? 0,
      count: prices.length
    });
  }
  return stats;
}

function decorate(listing: Listing, market: MarketStats): Offer {
  const landed = listing.price + listing.ship;
  const trust = scoreTrust(listing.store, listing, market.median, TRUST_WEIGHTS);
  const savedVsMarket = market.median ? clamp((market.median - landed) / market.median, -1, 1) : 0;
  const savingsScore = clamp(savedVsMarket / 0.18, 0, 1) * 100;
  const speedScore = clamp(1 - listing.eta / 12, 0, 1) * 100;
  return {
    ...listing,
    landed,
    market,
    trust,
    savedVsMarket,
    value: listing.store.closed ? -1 : Math.round(trust.score * 0.5 + savingsScore * 0.35 + speedScore * 0.15),
    history: priceHistory(listing.id, listing.price),
    suppressed: Boolean(listing.store.closed)
  };
}

function shopProfile(store: Shop, offers: readonly Offer[]): ShopProfile {
  const own = offers.filter(o => o.storeId === store.id);
  const sample: TrustInput = {
    price: median(own.map(o => o.price).sort((a, b) => a - b)),
    seller: '',
    eta: own.length ? Math.min(...own.map(o => o.eta)) : 12,
    ship: 0
  };
  const rating = scoreTrust(store, sample, 0, TRUST_WEIGHTS);
  return {
    ...store,
    icon: iconUrl(store),
    offerCount: own.length,
    bestPrice: own.length ? Math.min(...own.map(o => o.landed)) : 0,
    signals: own.length ? rating.signals : null,
    score: rating.score,
    tier: rating.tier
  };
}

export function buildCatalog(): Catalog {
  const storesById = new Map(STORES.map(s => [s.id, s] as const));
  const productsById = new Map(PRODUCTS.map(p => [p.id, p] as const));

  const listings: Listing[] = RAW_OFFERS.map(
    ([productId, storeId, price, mrp, eta, ship, seller, sellerRating, sellerReviews], index) => {
      const product = productsById.get(productId);
      const store = storesById.get(storeId);
      if (!product) throw new Error(`listing ${index} points at an unknown product "${productId}"`);
      if (!store) throw new Error(`listing ${index} points at an unknown shop "${storeId}"`);
      return {
        id: `${productId}--${storeId}--${index}`,
        index, productId, storeId, price, mrp, eta, ship,
        seller, sellerRating, sellerReviews,
        product, store,
        link: productLink(store, product),
        icon: iconUrl(store)
      };
    }
  );

  const stats = marketStats(listings);
  const offers = listings.map(listing => decorate(listing, stats.get(listing.productId) ?? EMPTY_MARKET));

  const byProduct = new Map<string, Offer[]>();
  for (const offer of offers) {
    const bucket = byProduct.get(offer.productId);
    if (bucket) bucket.push(offer);
    else byProduct.set(offer.productId, [offer]);
  }

  return {
    offers,
    byProduct,
    products: PRODUCTS,
    stores: STORES.map(store => shopProfile(store, offers)),
    categories: new Map(CATEGORIES.map(c => [c.id, c] as const)),
    totals: { offers: offers.length, stores: STORES.length, products: PRODUCTS.length }
  };
}
