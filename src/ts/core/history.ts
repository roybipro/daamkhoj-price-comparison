/* A product's real price history, from /api/history: the lowest price its shops asked each day,
   as the crawls read their pages. Fetched once per product while the page is open, and kept,
   so a re-render never asks again. */

export interface PriceHistory {
  /** [Bangladesh date, lowest price that day], oldest first; null on a day every shop was out of stock. */
  days: [string, number | null][];
  since?: string;
  current?: number | null;
  lowest?: { price: number; day: string };
  highest?: { price: number; day: string };
}

type Entry = { status: 'loading' } | { status: 'done'; history: PriceHistory } | { status: 'failed' };

const HISTORY_TIMEOUT_MS = 15_000;
const MAX_URLS = 40;
const cache = new Map<string, Entry>();

/** The history fetched for a product, or undefined while it loads or when there is none. */
export function historyFor(key: string): PriceHistory | undefined {
  const entry = cache.get(key);
  return entry?.status === 'done' ? entry.history : undefined;
}

/**
 * Looks in `root` for the product page's history box and, the first time a product is shown,
 * fetches its history and calls `rerender` once it arrives. A failed fetch just leaves no chart.
 */
export function loadShownHistory(root: ParentNode, rerender: () => void): void {
  const box = root.querySelector<HTMLElement>('[data-history]');
  const key = box?.dataset.history;
  if (!box || !key || cache.has(key)) return;
  let urls: string[];
  try {
    urls = (JSON.parse(box.dataset.urls ?? '[]') as unknown[]).filter((url): url is string => typeof url === 'string').slice(0, MAX_URLS);
  } catch {
    return;
  }
  if (!urls.length) return;
  cache.set(key, { status: 'loading' });
  const params = new URLSearchParams();
  for (const url of urls) params.append('url', url);
  fetch(`api/history?${params}`, { signal: AbortSignal.timeout(HISTORY_TIMEOUT_MS), headers: { accept: 'application/json' } })
    .then(async response => {
      if (!response.ok) throw new Error(String(response.status));
      const body = await response.json() as PriceHistory;
      if (!Array.isArray(body.days)) throw new Error('unexpected answer');
      cache.set(key, { status: 'done', history: body });
      if (body.days.length > 1) rerender();
    })
    .catch(() => { cache.set(key, { status: 'failed' }); });
}
