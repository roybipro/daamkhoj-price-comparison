/* The server opens URLs it learned from search results, so those URLs are untrusted. This
   keeps them from reaching anything private (the host's own network, cloud metadata), and
   caps how long and how much any one page can cost. */

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export const USER_AGENT = 'Mozilla/5.0 (compatible; DaamKhojBot/0.1; price comparison)';

export function isPrivateAddress(address) {
  const ip = address.toLowerCase().replace(/^::ffff:/, '');
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 198 && (b === 18 || b === 19));
  }
  return ip === '::' || ip === '::1' || /^f[cd]/.test(ip) || /^fe[89ab]/.test(ip) || ip.startsWith('ff');
}

export async function assertPublicUrl(raw, resolve = lookup) {
  const url = new URL(raw);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('unsupported protocol');
  if (url.username || url.password) throw new Error('credentials in URL');
  if (url.port && url.port !== '80' && url.port !== '443') throw new Error('unusual port');

  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('private host');
  }
  const addresses = isIP(host) ? [{ address: host }] : await resolve(host, { all: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) throw new Error('private host');
  return url;
}

async function readCapped(response, maxBytes) {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks = [];
  let total = 0;
  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  await reader.cancel().catch(() => {});
  return Buffer.concat(chunks).subarray(0, maxBytes).toString('utf8');
}

/** Follows redirects by hand, so each hop has to pass the same check. */
export async function fetchPublic(raw, options = {}) {
  const { fetchImpl = fetch, resolve = lookup, maxRedirects = 3, maxBytes = 2_000_000, timeoutMs = 15_000 } = options;
  const signal = AbortSignal.timeout(timeoutMs);
  let current = raw;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertPublicUrl(current, resolve);
    const response = await fetchImpl(current, {
      redirect: 'manual',
      signal,
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,text/plain;q=0.9,*/*;q=0.1' }
    });
    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      await response.body?.cancel().catch(() => {});
      current = new URL(location, current).href;
      continue;
    }
    const type = response.headers.get('content-type') ?? '';
    const readable = !type || /text|html|xml/i.test(type);
    return { ok: response.ok, status: response.status, url: current, text: readable ? await readCapped(response, maxBytes) : '' };
  }
  throw new Error('too many redirects');
}

/** Google wraps result links in its own redirect; this finds where they really go. */
export async function resolveResultLink(link, options = {}) {
  const { fetchImpl = fetch, timeoutMs = 15_000 } = options;
  const url = new URL(link);
  if (!/(^|\.)google\.[a-z.]+$/.test(url.hostname)) return link;

  const response = await fetchImpl(link, {
    redirect: 'manual',
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'user-agent': USER_AGENT }
  });
  const isGoogle = target => /(^|\.)google\.[a-z.]+$/.test(new URL(target).hostname);
  const location = response.headers.get('location');
  if (location && !isGoogle(location)) return location;

  const body = await readCapped(response, 200_000);
  for (const [found] of body.matchAll(/https?:\/\/[^"'<>\s\\]+/g)) {
    const target = found.replace(/&amp;/g, '&');
    try {
      if (!isGoogle(target) && !/(gstatic|googleusercontent|w3\.org)\./.test(target)) return target;
    } catch {
      /* Not a usable URL; keep looking. */
    }
  }
  return null;
}
