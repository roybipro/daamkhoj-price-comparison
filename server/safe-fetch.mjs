/* The server opens URLs it learned from search results, so those URLs are untrusted. This
   keeps them from reaching anything private (the host's own network, cloud metadata), and
   caps how long and how much any one page can cost. */

import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import { Readable } from 'node:stream';
import zlib from 'node:zlib';

export const USER_AGENT = 'Mozilla/5.0 (compatible; DaamKhojBot/0.1; price comparison)';

function isPrivateIPv4(ip) {
  const [a, b, c] = ip.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 192 && b === 0 && (c === 0 || c === 2))
    || (a === 198 && (b === 18 || b === 19))
    || (a === 198 && b === 51 && c === 100)
    || (a === 203 && b === 0 && c === 113);
}

/** The eight 16-bit groups of an IPv6 address, with any dotted IPv4 tail turned into two. */
function ipv6Groups(ip) {
  let text = ip;
  const tail = text.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (tail) {
    const [a, b, c, d] = tail[1].split('.').map(Number);
    text = text.slice(0, -tail[1].length) + `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, rest] = text.split('::');
  const left = head ? head.split(':') : [];
  const right = rest ? rest.split(':') : [];
  const missing = rest === undefined ? 0 : 8 - left.length - right.length;
  return [...left, ...new Array(missing).fill('0'), ...right].map(group => parseInt(group, 16));
}

const ipv4From = (high, low) => [high >> 8, high & 255, low >> 8, low & 255].join('.');

export function isPrivateAddress(address) {
  const ip = address.toLowerCase().replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  if (isIP(ip) === 4) return isPrivateIPv4(ip);
  if (isIP(ip) !== 6) return true;

  const groups = ipv6Groups(ip);
  const zeros = count => groups.slice(0, count).every(group => group === 0);
  /* An IPv4 address can ride inside an IPv6 one ("::ffff:127.0.0.1" is written "::ffff:7f00:1"),
     and then it is the IPv4 address that decides. */
  if ((zeros(5) && groups[5] === 0xffff) || zeros(6)) {
    if (zeros(8) || (zeros(7) && groups[7] === 1)) return true;
    return isPrivateIPv4(ipv4From(groups[6], groups[7]));
  }
  if (groups[0] === 0x64 && groups[1] === 0xff9b) return isPrivateIPv4(ipv4From(groups[6], groups[7]));
  if (groups[0] === 0x2002) return isPrivateIPv4(ipv4From(groups[1], groups[2]));
  const first = groups[0];
  return (first & 0xfe00) === 0xfc00 /* unique local */
    || (first & 0xffc0) === 0xfe80 /* link local */
    || (first & 0xff00) === 0xff00 /* multicast */
    || (first === 0x2001 && groups[1] === 0x0db8) /* documentation */
    || (first === 0x0100 && groups[1] === 0 && groups[2] === 0 && groups[3] === 0); /* discard */
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

/* Checking an address and then letting fetch look the name up again leaves a gap: a host can
   answer the check with a public address and the connection with a private one. Here the
   address is checked at the moment of connecting, on the very answer the socket uses. */
function checkedLookup(resolve, isPrivate) {
  return (hostname, options, callback) => {
    resolve(hostname, { all: true }).then(addresses => {
      if (!addresses.length || addresses.some(({ address }) => isPrivate(address))) {
        throw Object.assign(new Error('private host'), { code: 'EPRIVATE' });
      }
      if (options?.all) return callback(null, addresses.map(({ address, family }) => ({ address, family: family ?? isIP(address) })));
      const [{ address, family }] = addresses;
      return callback(null, address, family ?? isIP(address));
    }).catch(error => callback(error));
  };
}

const DECODERS = { gzip: zlib.createGunzip, 'x-gzip': zlib.createGunzip, deflate: zlib.createInflate, br: zlib.createBrotliDecompress };

/**
 * A fetch-shaped GET over node:http, with no redirects followed, whose connections can only
 * reach public addresses. It answers with a standard Response.
 */
export function publicRequest(raw, init = {}, { resolve = lookup, isPrivate = isPrivateAddress } = {}) {
  const url = new URL(raw);
  const client = url.protocol === 'https:' ? https : http;
  return new Promise((done, fail) => {
    const request = client.get(url, {
      headers: { 'accept-encoding': 'gzip, deflate, br', ...init.headers },
      lookup: checkedLookup(resolve, isPrivate),
      signal: init.signal,
      /* A shared pool could hand back a socket opened under an older answer. */
      agent: false
    }, response => {
      const headers = new Headers();
      for (const [name, value] of Object.entries(response.headers)) {
        for (const one of [].concat(value ?? [])) headers.append(name, String(one));
      }
      const status = response.statusCode ?? 502;
      const decode = DECODERS[String(response.headers['content-encoding'] ?? '').trim().toLowerCase()];
      const stream = decode ? response.pipe(decode()) : response;
      if (decode) response.on('error', error => stream.destroy(error));
      headers.delete('content-encoding');
      headers.delete('content-length');
      const empty = status === 204 || status === 304 || (status >= 300 && status < 400);
      if (empty) response.resume();
      done(new Response(empty ? null : Readable.toWeb(stream), { status: status < 200 || status > 599 ? 502 : status, headers }));
    });
    request.on('error', fail);
  });
}

/** Follows redirects by hand, so each hop has to pass the same check. */
export async function fetchPublic(raw, options = {}) {
  const { resolve = lookup, maxRedirects = 3, maxBytes = 2_000_000, timeoutMs = 15_000 } = options;
  const { fetchImpl = (url, init) => publicRequest(url, init, { resolve }) } = options;
  const signal = AbortSignal.timeout(timeoutMs);
  let current = raw;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertPublicUrl(current, resolve);
    const response = await fetchImpl(current, {
      redirect: 'manual', /* for a fetch passed in; publicRequest never follows one */
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
  /* A redirect can be relative ("/url?q=…"); that one stays on Google, so read the body instead. */
  const location = response.headers.get('location');
  const next = location ? new URL(location, link).href : null;
  if (next && !isGoogle(next)) {
    await response.body?.cancel().catch(() => {});
    return next;
  }

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
