/* Two copies of the price list, each with some shops read more recently than the other, made
   one: for every shop, the copy that crawled it last wins whole. A crawl drops prices for pages
   gone from a sitemap or no longer priced, so mixing a shop's entries from two crawls would bring
   those back; taking the newer crawl of each shop keeps both crawls' work and neither's leftovers.
   This is what lets a crawl run elsewhere (say, from a home connection for a shop that refuses
   GitHub's servers) be published while the nightly crawl is running, without either undoing the
   other. */

const crawled = record => {
  const time = Date.parse(record?.crawledAt ?? '');
  return Number.isFinite(time) ? time : -Infinity;
};

/**
 * @returns {{ list: object, taken: string[] }} `list` is base with each of incoming's shops that
 *   base lacks or crawled earlier; `taken` names those shops.
 */
export function mergeLists(base, incoming) {
  const shops = { ...(base?.shops ?? {}) };
  const taken = [];
  for (const [shop, record] of Object.entries(incoming?.shops ?? {})) {
    if (!shops[shop] || crawled(record) > crawled(shops[shop])) {
      shops[shop] = record;
      taken.push(shop);
    }
  }
  return { list: { ...base, version: base?.version ?? incoming?.version ?? 1, shops }, taken };
}
