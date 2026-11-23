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

export interface ShopLink {
  url: string;
  /** True when it opens the shop's own search for the product, false for its home page. */
  searches: boolean;
}

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
  /** When the shop's website was last found not to exist (no DNS, or a parked domain). */
  siteDown?: string;
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
  /** Where "Visit shop" goes; null when there is nowhere safe to send anyone. */
  link: ShopLink | null;
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

export interface LiveOffer {
  shop: string; url: string; title: string; price: number; inStock: boolean | null;
  /** When this price was read, for prices from the price list rather than this search. */
  checkedAt?: string;
  /** The product photo the shop's page publishes. */
  image?: string;
  /** Which product this price is for, so results can show one card per product. */
  product?: string;
}

/** One product on a home-page shelf: where its price starts, and how many shops sell it. */
export interface BrowseCard {
  name: string;
  from: number;
  shop: string;
  shops: number;
  versions: number;
  image?: string;
  checkedAt: string;
}
export interface BrowseShelf { id: string; label: string; cards: BrowseCard[] }
export interface BrowseData { shelves: BrowseShelf[]; shops: { shop: string; prices: number }[]; prices: number }
/* A static host has no price list, so "unavailable" is normal: the home page then shows the demo. */
export type BrowseState = { status: 'loading' } | { status: 'ready'; data: BrowseData } | { status: 'unavailable' };
export interface LiveGroup {
  label: string;
  /** False when the pages don't say which version they sell, so no comparison is drawn. */
  comparable: boolean;
  /** The url of the cheapest buyable offer, when there is a real choice between them. */
  lowest: string | null;
  offers: LiveOffer[];
}
export interface LiveResult {
  query: string;
  /** 'index' when the answer came from the saved price list alone. */
  source?: 'index';
  /** What was typed, when the price list corrected its spelling to `query`. */
  correctedFrom?: string;
  /** What was typed, when a half-typed word was completed to make `query`. */
  completedFrom?: string;
  /** Real products whose names start the way the search does, while it is being typed. */
  suggestions?: LiveSuggestion[];
  /** How many shop pages a live re-check just read. */
  rechecked?: number;
  /** How many of the prices came from the price list, in a web search's answer. */
  indexed?: number;
  checkedAt: string;
  cached: boolean;
  found: number;
  priced: number;
  skipped: { notShop: number; blocked: number; noPrice: number; otherProduct: number; failed: number };
  groups: LiveGroup[];
}
export type LiveState =
  | { status: 'idle' }
  | { status: 'loading'; query: string }
  | { status: 'unavailable'; query: string }
  | { status: 'error'; query: string; message: string }
  /** `pending` while the web search is still running behind a price-list answer; `note` when it failed;
      `typed` when the search ran with its spelling corrected from what was typed. */
  | { status: 'done'; query: string; result: LiveResult; pending?: boolean; note?: string; typed?: string;
      /** Shown while typing, before the search was submitted. */
      instant?: boolean;
      /** While the prices on screen are being read again from the shops. */
      checking?: boolean };

export interface LiveSuggestion { name: string; shops: number }

export type ViewName = 'results' | 'stores' | 'compare' | 'how';
export type SortKey = 'value' | 'price' | 'trust' | 'eta';
/** 'live' items come from the price list; 'product' and 'store' from the sample demo. */
export interface SuggestItem { kind: 'product' | 'store' | 'live'; id: string; label: string; sub: string }

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
  linkCopied: boolean;
  /** Only one product's trend chart is open at a time; a wall of charts reads as noise. */
  trend: string | null;
  live: LiveState;
  browse: BrowseState;
  /** The home page's chosen category, or '' for all of them. */
  shelf: string;
  /** How many of the chosen category's cards are shown; "Show more" adds a page. */
  shelfLimit: number;
  /** The search result opened from its card, or '' for the grid of all results. */
  product: string;
  /** How many result cards are shown. */
  resultLimit: number;
  /** The price list's suggestions for what is being typed. */
  liveSuggest: LiveSuggestion[];
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
