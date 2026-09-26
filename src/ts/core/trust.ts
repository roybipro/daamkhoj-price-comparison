import type {
  Shop, SignalId, Signals, TrustAssessment, TrustInput, TrustSignal, TrustTier, TrustWeight
} from '../types.js';
import { clamp, money } from './format.js';

const CURRENT_YEAR = 2026;

type SignalFn = (shop: Shop, offer: TrustInput, marketMedian: number) => TrustSignal;

function identity(shop: Shop): TrustSignal {
  if (shop.closed) return { v: 0, why: `Traded ${shop.since}–${shop.closed}. ${incidentOf(shop)}` };
  const tenure = clamp((CURRENT_YEAR - shop.since) / 20, 0, 1);
  const footprint = clamp(shop.showrooms / 15, 0, 1);
  const kindBase = shop.kind === 'brand' ? 1 : shop.kind === 'retailer' ? 0.9 : 0.6;
  return {
    v: clamp(kindBase * 0.55 + tenure * 0.3 + footprint * 0.15, 0, 1),
    why: `${CURRENT_YEAR - shop.since} years trading · ${shop.showrooms ? `${shop.showrooms} physical showrooms` : 'online only, no showrooms'}`
  };
}

/* On a marketplace the seller is the one who ships your order, so their rating —
   not the platform's — carries this signal. */
function feedback(shop: Shop, offer: TrustInput): TrustSignal {
  const rating = offer.seller ? offer.sellerRating ?? shop.rating : shop.rating;
  const reviews = offer.seller ? offer.sellerReviews ?? shop.reviews : shop.reviews;
  const ratingPart = clamp((rating - 1) / 4, 0, 1);
  const volumePart = clamp(Math.log10(Math.max(reviews, 1)) / Math.log10(5000), 0, 1);
  const who = offer.seller || shop.name;
  return {
    v: clamp(ratingPart * 0.65 + volumePart * 0.35, 0, 1),
    why: `${who}: ${rating.toFixed(1)}/5 from ${reviews.toLocaleString('en-US')} reviews`
  };
}

function payment(shop: Shop): TrustSignal {
  if (shop.closed) return { v: 0, why: 'Payment channels are offline' };
  const gateway = shop.payments.includes('SSLCommerz') || shop.payments.includes('Card');
  const wallet = shop.payments.includes('bKash') || shop.payments.includes('Nagad');
  const held = shop.kind === 'marketplace' ? 0.85 : 0.65; // marketplace escrow vs direct payment to shop
  return {
    v: clamp((gateway ? 0.45 : 0.2) + (wallet ? 0.2 : 0) + held * 0.35, 0, 1),
    why: `Pays through ${shop.payments.length ? shop.payments.join(', ') : 'no online payment option'}${shop.cod ? ' · cash on delivery' : ''}`
  };
}

function returns(shop: Shop): TrustSignal {
  if (shop.closed) return { v: 0, why: 'No return route left open' };
  const tier = shop.returnsDays >= 14 ? 1 : shop.returnsDays >= 7 ? 0.85 : shop.returnsDays >= 3 ? 0.6 : 0.35;
  return { v: tier, why: shop.returnsDays ? `${shop.returnsDays}-day return or exchange window` : 'Return policy not published' };
}

/* Authenticity is where a suspiciously low price becomes a risk, not a bargain. */
function authenticity(shop: Shop, offer: TrustInput, marketMedian: number): TrustSignal {
  let v: number;
  let why: string;
  if (shop.kind === 'brand') { v = 1; why = 'Sold by the manufacturer itself'; }
  else if (shop.officialWarranty) { v = 0.92; why = 'Authorised distribution with official warranty'; }
  else if (shop.kind === 'retailer') { v = 0.65; why = 'Import-line stock — warranty needs checking'; }
  else {
    const official = /official|authorized|partner|store$/i.test(offer.seller);
    v = official ? 0.85 : 0.45;
    why = official ? 'Official or partner seller on the marketplace' : 'Third-party seller — not the platform’s own stock';
  }
  const gap = marketMedian ? (marketMedian - offer.price) / marketMedian : 0;
  if (gap > 0.22) { v *= 0.55; why += ` · priced ${Math.round(gap * 100)}% under the market`; }
  return { v: clamp(v, 0, 1), why };
}

function logistics(shop: Shop, offer: TrustInput): TrustSignal {
  if (shop.closed) return { v: 0, why: 'Delivery stopped' };
  const coverage = shop.coverage === 'nationwide' ? 1 : shop.coverage === 'none' ? 0 : 0.7;
  const speed = clamp(1 - offer.eta / 12, 0, 1);
  const area: Record<Shop['coverage'], string> = {
    nationwide: 'Nationwide',
    'dhaka-ctg-sylhet': 'Dhaka, Chattogram, Sylhet',
    dhaka: 'Dhaka only',
    none: 'No delivery'
  };
  const fee = offer.ship ? `, ${money(offer.ship)} delivery fee` : ', free delivery';
  return { v: coverage * 0.55 + speed * 0.45, why: `${area[shop.coverage]} · ${offer.eta} days${fee}` };
}

function support(shop: Shop): TrustSignal {
  if (shop.closed) return { v: 0, why: 'Helpline no longer answers' };
  return {
    v: shop.supportVerified ? (shop.showrooms ? 1 : 0.85) : 0.35,
    why: shop.supportVerified
      ? (shop.showrooms ? 'Working hotline plus in-store service desk' : 'Verified hotline')
      : 'No public hotline that answers'
  };
}

const SIGNALS: Record<SignalId, SignalFn> = {
  identity,
  feedback,
  payment,
  returns,
  authenticity,
  logistics,
  support
};

const incidentOf = (shop: Shop): string => shop.incidents[0]?.t ?? 'Business no longer trading';

export function trustTier(score: number, shop: Shop): TrustTier {
  if (shop.closed) return { id: 'closed', label: 'Closed', color: '#8fa39b' };
  if (score >= 82) return { id: 'strong', label: 'Trusted', color: '#34d399' };
  if (score >= 68) return { id: 'good', label: 'Good', color: '#2dd4bf' };
  if (score >= 50) return { id: 'caution', label: 'Caution', color: '#f0b429' };
  return { id: 'risk', label: 'Risky', color: '#ff6b6b' };
}

export function scoreTrust(shop: Shop, offer: TrustInput, marketMedian: number, weights: TrustWeight[]): TrustAssessment {
  const signals = {} as Signals;
  for (const weight of weights) signals[weight.id] = SIGNALS[weight.id](shop, offer, marketMedian);

  let score = weights.reduce((sum, weight) => sum + signals[weight.id].v * weight.weight, 0);
  const flags: string[] = [];

  for (const incident of shop.incidents) {
    if (incident.sev === 'fatal') { score = 0; flags.push(incident.t); }
    else score = Math.max(0, score - 25);
  }

  const gap = marketMedian ? (marketMedian - offer.price) / marketMedian : 0;
  if (!shop.closed && gap > 0.18) {
    flags.push(`${Math.round(gap * 100)}% under the market average — check warranty, seller and condition`);
  }
  if (offer.seller && offer.sellerReviews !== undefined && offer.sellerReviews < 60) {
    flags.push(`Only ${offer.sellerReviews} reviews on this seller`);
  }

  return { score: Math.round(score), signals, flags, tier: trustTier(score, shop) };
}
