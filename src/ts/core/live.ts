/* Browser side of live search: one request, reduced to a state the UI can render. A static
   host has no /api/search, so "unavailable" is a normal answer and the demo keeps working. */

import type { BrowseData, BrowseState, LiveGroup, LiveOffer, LiveResult, LiveState } from '../types.js';

/* The server's worst case: 100 seconds searching, then up to 90 reading pages. */
const TIMEOUT_MS = 200_000;
/* Generous enough to ride through a cold container spin-up on a small cloud host. */
const QUICK_TIMEOUT_MS = 25_000;

/* Re-reading a few shop pages takes seconds, not minutes. */
const RECHECK_TIMEOUT_MS = 30_000;

const PATHS = { quick: 'api/search/quick', web: 'api/search', recheck: 'api/recheck' } as const;
const LIMITS = { quick: QUICK_TIMEOUT_MS, web: TIMEOUT_MS, recheck: RECHECK_TIMEOUT_MS } as const;

/**
 * `quick` asks the saved price list, which is instant (`partial` while the last word is still
 * being typed); `recheck` reads the shops' pages behind those results again (`product` for one
 * product's); `web` runs the full search as well.
 */
export async function fetchLive(
  query: string, cancel: AbortSignal, kind: 'quick' | 'web' | 'recheck' = 'web',
  options: { partial?: boolean; product?: string } = {}
): Promise<LiveState> {
  const params = new URLSearchParams({ q: query });
  if (options.partial) params.set('partial', '1');
  if (options.product) params.set('product', options.product);
  const attempts = kind === 'quick' ? 2 : 1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(`${PATHS[kind]}?${params}`, {
        signal: AbortSignal.any([cancel, AbortSignal.timeout(LIMITS[kind])]),
        headers: { accept: 'application/json' }
      });
      if (response.status === 404 || response.status === 503) return { status: 'unavailable', query };

      const body = await response.json() as Partial<LiveResult> & { error?: string };
      if (!response.ok) return { status: 'error', query, message: body.error ?? 'Live search could not finish.' };
      if (!Array.isArray(body.groups)) return { status: 'error', query, message: 'Live search sent an unexpected answer.' };
      return { status: 'done', query, result: body as LiveResult };
    } catch (error) {
      if (cancel.aborted) return { status: 'error', query, message: 'Search cancelled.' };
      if (error instanceof SyntaxError) return { status: 'unavailable', query };
      if (attempt + 1 < attempts) {
        await new Promise(resolve => setTimeout(resolve, 500));
        continue;
      }
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        return { status: 'error', query, message: 'Live search took too long. Please try again.' };
      }
      return { status: 'error', query, message: 'Could not reach live search. Check your connection and try again.' };
    }
  }
  return { status: 'error', query, message: 'Live search could not finish.' };
}

/** Shop pages supply these links, so only ordinary web addresses become clickable. */
export function safeHttpUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

/** The home page's shelves from the price list. Anything but a clear answer means "show the demo". */
export async function fetchBrowse(): Promise<BrowseState> {
  try {
    const response = await fetch('api/browse', { signal: AbortSignal.timeout(QUICK_TIMEOUT_MS), headers: { accept: 'application/json' } });
    if (!response.ok) return { status: 'unavailable' };
    const data = await response.json() as Partial<BrowseData>;
    return Array.isArray(data.shelves) && data.shelves.length ? { status: 'ready', data: data as BrowseData } : { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
}

/**
 * Prices just re-read from the shops, applied to what is on screen: each offer takes its page's
 * new price, stock and time, each version re-sorts cheapest first, and the lowest is re-named.
 */
export function applyFresh(current: LiveResult, fresh: LiveResult): LiveResult {
  const byUrl = new Map(fresh.groups.flatMap(group => group.offers).map(offer => [offer.url, offer] as const));
  const slotKey = (group: LiveGroup, offer: LiveOffer) =>
    `${group.comparable}|${group.label.toLowerCase()}|${offer.shop}|${offer.product ?? ''}`;
  const bySlot = new Map(fresh.groups.flatMap(group =>
    group.offers.map(offer => [slotKey(group, offer), offer] as const)));
  const dropGone = current.source === 'index' && fresh.source === 'index';
  const groups = current.groups
    .map(group => {
      const offers = group.offers
        .filter(offer => !dropGone || byUrl.has(offer.url) || bySlot.has(slotKey(group, offer)))
        .map(offer => {
          const read = byUrl.get(offer.url) ?? bySlot.get(slotKey(group, offer));
          return read
            ? { ...offer, url: read.url, price: read.price, inStock: read.inStock, checkedAt: read.checkedAt, image: offer.image ?? read.image }
            : offer;
        })
        .sort((a, b) => a.price - b.price);
      const buyable = offers.filter(offer => offer.inStock !== false);
      return { ...group, offers, lowest: group.comparable && buyable.length > 1 ? buyable[0].url : null };
    })
    .filter(group => group.offers.length > 0);
  return { ...current, groups };
}

/** How long ago a price was read, in words: "just now", "5 min ago", "2 days ago". */
export function ago(iso: string | undefined, now = Date.now()): string {
  const minutes = iso ? Math.round((now - Date.parse(iso)) / 60_000) : NaN;
  if (!Number.isFinite(minutes)) return '';
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}
