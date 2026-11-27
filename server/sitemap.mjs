/* Shops list their product pages in a sitemap, so the price list can be built from those pages
   instead of a paid web search. Either the file lists pages, or it lists further sitemaps. */

const decode = text => text
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'")
  .replace(/&amp;/g, '&');

/** { maps: further sitemaps, pages: [{ url, lastmod }] } from one sitemap file. */
export function parseSitemap(xml) {
  const text = String(xml ?? '');
  const entries = block => [...text.matchAll(new RegExp(`<${block}\\b[^>]*>([\\s\\S]*?)</${block}>`, 'gi'))]
    .map(([, inner]) => ({
      /* Some shops (OpenCart, PrestaShop) wrap the address in <![CDATA[ ]]>. */
      url: decode((inner.match(/<loc>\s*(?:<!\[CDATA\[\s*)?([^<\s\]]+)\s*(?:\]\]>\s*)?<\/loc>/i) ?? [])[1] ?? ''),
      lastmod: (inner.match(/<lastmod>\s*([^<\s]+)\s*<\/lastmod>/i) ?? [])[1] ?? null
    }))
    .filter(entry => /^https?:\/\//i.test(entry.url));
  return { maps: entries('sitemap').map(entry => entry.url), pages: entries('url') };
}

const siteOf = url => new URL(url).hostname.replace(/^www\./, '');

/**
 * Every product page a shop's sitemaps list, in their order and without repeats.
 * Where an index offers a choice, only sitemaps that look like product ones are followed, and
 * only pages on the shop's own site that `isProduct` accepts are kept.
 */
export async function productPages(start, { fetchPage, isProduct, maxMaps = 50 }) {
  const site = siteOf(start);
  const queue = [start];
  const visited = new Set();
  const pages = new Map();

  while (queue.length && visited.size < maxMaps) {
    const next = queue.shift();
    if (visited.has(next)) continue;
    visited.add(next);

    const response = await fetchPage(next);
    if (!response.ok) continue;
    const { maps, pages: listed } = parseSitemap(response.text);

    const productMaps = maps.filter(url => /product/i.test(url));
    queue.push(...(productMaps.length ? productMaps : maps));
    for (const page of listed) {
      try {
        if (siteOf(page.url) === site && isProduct(page.url) && !pages.has(page.url)) pages.set(page.url, page);
      } catch {
        /* Not a usable address. */
      }
    }
  }
  return [...pages.values()];
}
