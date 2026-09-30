/* Domain model. The catalogue, the trust engine and the renderer all speak these types,
   which is what keeps a hand-maintained data file honest. */

export type CategoryId =
  | 'phones' | 'computers' | 'accessories' | 'appliances'
  | 'grocery' | 'beauty' | 'fashion' | 'books';

export type ShopKind = 'retailer' | 'marketplace' | 'brand';
export type Coverage = 'nationwide' | 'dhaka-ctg-sylhet' | 'dhaka' | 'none';
export type SignalId =
  | 'identity' | 'feedback' | 'payment' | 'returns' | 'authenticity' | 'logistics' | 'support';

export interface Category { id: CategoryId; en: string; bn: string }
export interface Incident { t: string; sev: 'fatal' | 'major' }
export interface TrustWeight { id: SignalId; label: string; check: string; weight: number }
export interface Snapshot { date: string; label: string; note: 'sample' | 'live' }

export interface Shop {
  id: string;
  name: string;
  /** Romanised Bangla name — used by search, never rendered in the English UI. */
  bn: string;
  monogram: string;
  accent: string;
  url: string;
  kind: ShopKind;
  since: number;
  closed?: number;
  categories: CategoryId[];
  cod: boolean;
  payments: string[];
  returnsDays: number;
  officialWarranty: boolean;
  coverage: Coverage;
  showrooms: number;
  rating: number;
  reviews: number;
  supportVerified: boolean;
  incidents: Incident[];
  blurb: string;
  sellerMatters?: boolean;
}

export interface Product {
  id: string;
  name: string;
  bn: string;
  brand: string;
  cat: CategoryId;
  spec: string;
  aliases: string[];
}

/** [product, shop, price, list price, delivery days, delivery fee, seller, seller rating, seller reviews] */
export type RawOffer = [string, string, number, number, number, number, string, number, number];

/** The listing facts scoring needs; a shop profile passes a representative one. */
export interface TrustInput {
  price: number;
  seller: string;
  eta: number;
  ship?: number;
  sellerRating?: number;
  sellerReviews?: number;
}

export type ThemeName = 'light' | 'dark';
export type TierId = 'closed' | 'strong' | 'good' | 'caution' | 'risk';

export interface TrustSignal { v: number; why: string }
export type Signals = Record<SignalId, TrustSignal>;
/** Tier colour lives in CSS so light and dark can tune contrast independently. */
export interface TrustTier { id: TierId; label: string }
export interface TrustAssessment { score: number; signals: Signals; flags: string[]; tier: TrustTier }

export interface MarketStats { min: number; median: number; max: number; count: number }

export interface Offer extends TrustInput {
  id: string;
  index: number;
  productId: string;
  storeId: string;
  price: number;
  mrp: number;
  eta: number;
  ship: number;
  seller: string;
  sellerRating: number;
  sellerReviews: number;
  product: Product;
  store: Shop;
  link: string;
  icon: string;
  landed: number;
  market: MarketStats;
  trust: TrustAssessment;
  savedVsMarket: number;
  value: number;
  history: number[];
  suppressed: boolean;
}

export interface ShopProfile extends Shop {
  icon: string;
  offerCount: number;
  bestPrice: number;
  signals: Signals | null;
  score: number;
  tier: TrustTier;
}

export interface Catalog {
  offers: Offer[];
  byProduct: Map<string, Offer[]>;
  products: Product[];
  stores: ShopProfile[];
  categories: Map<CategoryId, Category>;
  totals: { offers: number; stores: number; products: number };
}

export interface Group {
  product: Product;
  category: Category;
  live: Offer[];
  dropped: Offer[];
  /** Spread across the listings the current filters leave standing. */
  stats: { min: number; max: number };
  /** The product's market baseline: filter-independent, and the same figure the offer rows compare against. */
  market: MarketStats;
  best: Offer | null;
}

export type ViewName = 'results' | 'stores' | 'compare' | 'how';
export type SortKey = 'value' | 'price' | 'trust' | 'eta';
export interface SuggestItem { kind: 'product' | 'store'; id: string; label: string; sub: string }

export interface SearchApi {
  products(query: string): { product: Product; score: number }[];
  stores(query: string): ShopProfile[];
}

export interface State {
  q: string;
  view: ViewName;
  sort: SortKey;
  sortLabels: Record<SortKey, string>;
  minTrust: number;
  codOnly: boolean;
  storeId: string;
  open: Set<string>;
  compare: string[];
  maxCompare: number;
  showAll: boolean;
  suggest: SuggestItem[];
  suggestIndex: number;
}

/** Everything a view needs to render, passed in rather than reached for globally. */
export interface RenderContext {
  state: State;
  catalog: Catalog;
  search: SearchApi;
  groups: Group[];
  weights: TrustWeight[];
  snapshot: Snapshot;
  offersById: Map<string, Offer>;
  input: HTMLInputElement;
}
