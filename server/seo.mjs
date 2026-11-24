/**
 * What search engines read: robots.txt, a sitemap of every product on the home page, and for each
 * page a title, description, canonical link and structured data built from the real price list.
 * The page a visitor's browser renders shows the same products and prices, so nothing here is
 * shown only to crawlers.
 */

const SITE_NAME = 'DaamKhoj';
const MAX_SITEMAP_URLS = 45_000;

const escapeAttr = value => String(value)
  .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeXml = escapeAttr;
const taka = amount => `৳${Math.round(amount).toLocaleString('en-US')}`;
/* JSON inside a <script> must not be able to close the tag. */
const jsonForScript = value => JSON.stringify(value).replace(/</g, '\\u003c');

/* One address per search, whatever its capitals: "iPhone 17" and "iphone 17" are the same page. */
export const searchUrl = (base, query) => `${base}/?q=${encodeURIComponent(query.trim().toLowerCase().replace(/\s+/g, ' ')).replace(/%20/g, '+')}`;

export function robotsTxt(base) {
  return `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${base}/sitemap.xml\n`;
}

/** The home page, the Shops and How it works tabs, and one search page per product card. */
export function sitemapXml(base, browse) {
  const lastmod = browse?.updatedAt ? `<lastmod>${escapeXml(browse.updatedAt.slice(0, 10))}</lastmod>` : '';
  const urls = [`${base}/`, `${base}/?view=stores`, `${base}/?view=how`];
  const seen = new Set();
  for (const shelf of browse?.shelves ?? []) {
    for (const card of shelf.cards ?? []) {
      const key = card.name.toLowerCase();
      if (seen.has(key) || urls.length >= MAX_SITEMAP_URLS) continue;
      seen.add(key);
      urls.push(searchUrl(base, card.name));
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map(loc => `<url><loc>${escapeXml(loc)}</loc>${lastmod}</url>`).join('\n')}\n</urlset>\n`;
}

/** Title, description, canonical and structured data for the page at `url`. */
export async function pageMeta(url, { base, search }) {
  const view = url.searchParams.get('view');
  const query = (url.searchParams.get('q') ?? '').trim().slice(0, 120);
  if (view === 'stores') {
    return {
      title: `Online shops in Bangladesh we compare prices from | ${SITE_NAME}`,
      description: 'The Bangladeshi online shops whose prices DaamKhoj reads every night, and how many prices each one lists.',
      canonical: `${base}/?view=stores`
    };
  }
  if (view === 'how') {
    return {
      title: `How DaamKhoj compares prices | ${SITE_NAME}`,
      description: 'Where DaamKhoj prices come from, how they are kept current, and how the same product is matched across shops.',
      canonical: `${base}/?view=how`
    };
  }
  if (!query) {
    return {
      title: `${SITE_NAME} — compare prices across Bangladesh's online shops | দামখোঁজ`,
      description: "Find the lowest price for phones, laptops, gadgets and more. DaamKhoj lines up prices from 30 Bangladeshi online shops, read from each shop's own website.",
      canonical: `${base}/`,
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: SITE_NAME,
        alternateName: 'দামখোঁজ',
        url: `${base}/`,
        potentialAction: {
          '@type': 'SearchAction',
          target: { '@type': 'EntryPoint', urlTemplate: `${base}/?q={search_term_string}` },
          'query-input': 'required name=search_term_string'
        }
      }
    };
  }

  const answer = await search(query, { closest: true }).catch(() => null);
  const offers = (answer?.groups ?? []).flatMap(group => group.offers).filter(offer => offer.price > 0);
  const name = answer?.query && !answer.broadenedFrom ? answer.query : query;
  if (!offers.length) {
    /* A search with no prices is a thin page: it can be visited but isn't listed. */
    return {
      title: `${query} price in Bangladesh | ${SITE_NAME}`,
      description: `Compare ${query} prices across Bangladesh's online shops on ${SITE_NAME}.`,
      canonical: searchUrl(base, query),
      noindex: true
    };
  }
  const prices = offers.map(offer => offer.price);
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const shops = new Set(offers.map(offer => offer.shop)).size;
  const cheapest = offers.find(offer => offer.price === low);
  const display = displayQuery(name, offers.map(offer => offer.title ?? ''));
  const image = offers.find(offer => offer.image)?.image;
  return {
    title: `${display} price in Bangladesh — from ${taka(low)} at ${shops} ${shops === 1 ? 'shop' : 'shops'} | ${SITE_NAME}`,
    description: `${display}: ${offers.length} ${offers.length === 1 ? 'price' : 'prices'} from ${shops} Bangladeshi ${shops === 1 ? 'shop' : 'shops'}, lowest ${taka(low)} at ${cheapest.shop}. Each price is read from the shop's own website, with the time it was checked.`,
    canonical: searchUrl(base, query),
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: display,
      ...(image ? { image } : {}),
      offers: {
        '@type': 'AggregateOffer',
        priceCurrency: 'BDT',
        lowPrice: low,
        highPrice: high,
        offerCount: offers.length,
        offers: offers.slice(0, 20).map(offer => ({
          '@type': 'Offer',
          url: offer.url,
          price: offer.price,
          priceCurrency: 'BDT',
          availability: offer.inStock === false ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
          seller: { '@type': 'Organization', name: offer.shop }
        }))
      }
    }
  };
}

/* "lg monitor" → "LG Monitor": each word as the shops' own listings write it most often, else
   with a capital first letter. */
function displayQuery(query, titles) {
  const forms = new Map();
  for (const title of titles) {
    for (const word of title.split(/[^\p{L}\p{N}+-]+/u)) {
      const key = word.toLowerCase();
      const counts = forms.get(key) ?? new Map();
      counts.set(word, (counts.get(word) ?? 0) + 1);
      forms.set(key, counts);
    }
  }
  return query.split(/\s+/).filter(Boolean).map(word => {
    const counts = forms.get(word.toLowerCase());
    if (counts) return [...counts].sort((a, b) => b[1] - a[1])[0][0];
    return word[0].toUpperCase() + word.slice(1);
  }).join(' ');
}

/** The page's HTML with its head filled from `meta`. */
export function withMeta(html, meta) {
  const title = escapeAttr(meta.title);
  const description = escapeAttr(meta.description);
  const extra = [
    `<link rel="canonical" href="${escapeAttr(meta.canonical)}">`,
    `<meta property="og:url" content="${escapeAttr(meta.canonical)}">`,
    meta.noindex ? '<meta name="robots" content="noindex">' : '',
    meta.jsonLd ? `<script type="application/ld+json">${jsonForScript(meta.jsonLd)}</script>` : ''
  ].filter(Boolean).join('\n');
  return html
    .replace(/<title>[^<]*<\/title>/, () => `<title>${title}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, () => `<meta name="description" content="${description}">`)
    .replace(/<meta property="og:title" content="[^"]*">/, () => `<meta property="og:title" content="${title}">`)
    .replace(/<meta property="og:description" content="[^"]*">/, () => `<meta property="og:description" content="${description}">`)
    .replace('</head>', () => `${extra}\n</head>`);
}
