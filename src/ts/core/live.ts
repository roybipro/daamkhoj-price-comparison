/* Browser side of live search: one request, reduced to a state the UI can render. A static
   host has no /api/search, so "unavailable" is a normal answer and the demo keeps working. */

import type { LiveResult, LiveState } from '../types.js';

const TIMEOUT_MS = 150_000;

export async function fetchLive(query: string, cancel: AbortSignal): Promise<LiveState> {
  try {
    const response = await fetch(`api/search?q=${encodeURIComponent(query)}`, {
      signal: AbortSignal.any([cancel, AbortSignal.timeout(TIMEOUT_MS)]),
      headers: { accept: 'application/json' }
    });
    if (response.status === 404 || response.status === 503) return { status: 'unavailable', query };

    const body = await response.json() as Partial<LiveResult> & { error?: string };
    if (!response.ok) return { status: 'error', query, message: body.error ?? 'Live search could not finish.' };
    if (!Array.isArray(body.groups)) return { status: 'error', query, message: 'Live search sent an unexpected answer.' };
    return { status: 'done', query, result: body as LiveResult };
  } catch (error) {
    if (error instanceof SyntaxError) return { status: 'unavailable', query };
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      return { status: 'error', query, message: 'Live search took too long. Please try again.' };
    }
    return { status: 'error', query, message: 'Could not reach live search. Check your connection and try again.' };
  }
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
