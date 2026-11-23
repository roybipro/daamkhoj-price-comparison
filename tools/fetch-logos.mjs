/* npm run fetch-logos

   Saves each price-list shop's own icon into src/assets/shops/ and writes
   src/ts/data/shop-logos.ts, so the site shows real shop logos from its own host instead of a
   favicon service's small or blank guesses. Run it again when a shop is added. Prefers the
   largest apple-touch-icon a home page names, then its largest icon of 64px or more, then any
   icon, then /apple-touch-icon.png, then /favicon.ico. */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { INDEX_SHOPS } from '../server/index-shops.mjs';
import { USER_AGENT } from '../server/safe-fetch.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(root, 'src', 'assets', 'shops');
const EXTENSIONS = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/x-icon': 'ico', 'image/vnd.microsoft.icon': 'ico', 'image/gif': 'gif' };

const get = url => fetch(url, { headers: { 'user-agent': USER_AGENT }, redirect: 'follow', signal: AbortSignal.timeout(20_000) });

/** Icon addresses a page names, best first. */
function iconsOf(html, base) {
  const found = [];
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    const rel = tag.match(/\brel=["']([^"']+)["']/i)?.[1]?.toLowerCase() ?? '';
    const href = tag.match(/\bhref=["']([^"']+)["']/i)?.[1];
    if (!href || !/icon/.test(rel) || /mask-icon/.test(rel)) continue;
    const size = Math.max(0, ...[...(tag.match(/\bsizes=["']([^"']+)["']/i)?.[1] ?? '').matchAll(/(\d+)x\d+/g)].map(m => Number(m[1])));
    const score = (/apple-touch-icon/.test(rel) ? 10_000 : 0) + (size || (/\.svg(\?|$)/i.test(href) ? 512 : 32));
    try {
      found.push({ url: new URL(href.replace(/&amp;/g, '&'), base).href, score });
    } catch {
      /* Not a usable address. */
    }
  }
  return found.sort((a, b) => b.score - a.score).map(icon => icon.url);
}

await mkdir(assets, { recursive: true });
const logos = {};
for (const shop of INDEX_SHOPS) {
  const home = new URL(shop.sitemap).origin + '/';
  try {
    const page = await get(home);
    const html = page.ok ? await page.text() : '';
    /* Shopify's image server sizes on request: ask for a sharp one instead of the 32px it names. */
    const sharper = url => url.replace(/([?&]width=)\d+/, '$1180');
    const candidates = [...iconsOf(html, page.url || home).map(sharper), new URL('/apple-touch-icon.png', home).href, new URL('/favicon.ico', home).href];
    let saved = '';
    for (const url of candidates) {
      const response = await get(url).catch(() => null);
      const type = response?.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? '';
      if (!response?.ok || !EXTENSIONS[type]) continue;
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length < 200) continue;
      saved = `${shop.shop}.${EXTENSIONS[type]}`;
      await writeFile(path.join(assets, saved), bytes);
      console.log(`${shop.shop}: ${url} (${bytes.length} bytes)`);
      break;
    }
    if (saved) logos[shop.shop] = `assets/shops/${saved}`;
    else console.log(`${shop.shop}: no icon found`);
  } catch (error) {
    console.log(`${shop.shop}: ${error.message}`);
  }
}

const lines = Object.entries(logos).sort().map(([shop, file]) => `  '${shop}': '${file}'`).join(',\n');
await writeFile(path.join(root, 'src', 'ts', 'data', 'shop-logos.ts'), `/* Written by \`npm run fetch-logos\`: each price-list shop's own icon, served from this site. */

export const SHOP_LOGOS: Readonly<Record<string, string>> = {
${lines}
};
`);
console.log(`${Object.keys(logos).length} of ${INDEX_SHOPS.length} logos saved`);
