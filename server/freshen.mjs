/**
 * Keeps the prices people look at most current between nightly crawls. Each tick re-reads the
 * shop pages behind two home-page products: one from the most-stocked (so each of those is
 * checked every hour or so) and one from the rest (each in turn, about once a day). The re-check
 * skips pages read in the last half hour and shops that are refusing this server.
 */

const POPULAR = 80;

/** The home page's products, most-stocked first, and the rest in shelf order, without repeats. */
export function freshenOrder(shelves) {
  const seen = new Set();
  const cards = [];
  for (const shelf of shelves ?? []) {
    for (const card of shelf.cards ?? []) {
      const key = card.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      cards.push(card);
    }
  }
  const popular = [...cards].sort((a, b) => b.shops - a.shops).slice(0, POPULAR);
  const chosen = new Set(popular.map(card => card.name.toLowerCase()));
  return { popular: popular.map(card => card.name), rest: cards.filter(card => !chosen.has(card.name.toLowerCase())).map(card => card.name) };
}

/**
 * @param recheck (index, query) => Promise<{ rechecked, changed }>, as server/recheck.mjs makes
 * @param getIndex () => Promise<the price list being served>
 */
export function createFreshener({ recheck, getIndex, log = () => {}, now = Date.now }) {
  let turn = 0;
  let running = false;
  const totals = { products: 0, pages: 0, changed: 0, since: now() };

  async function tick() {
    if (running) return;
    running = true;
    try {
      const index = await getIndex();
      const { popular, rest } = freshenOrder((await index.browseSoon()).shelves);
      const picks = [popular.length ? popular[turn % popular.length] : null, rest.length ? rest[turn % rest.length] : null].filter(Boolean);
      turn++;
      for (const name of picks) {
        try {
          const answer = await recheck(index, name);
          totals.products++;
          totals.pages += answer.rechecked ?? 0;
          totals.changed += answer.changed ?? 0;
        } catch {
          /* A product that no longer searches cleanly is skipped this turn. */
        }
      }
      if (now() - totals.since >= 60 * 60 * 1000) {
        log(`fresh prices: re-read ${totals.pages} pages for ${totals.products} products in the last hour; ${totals.changed} prices changed`);
        Object.assign(totals, { products: 0, pages: 0, changed: 0, since: now() });
      }
    } catch {
      /* No list yet: the next tick tries again. */
    } finally {
      running = false;
    }
  }

  return {
    tick,
    start(everyMs = 60_000) {
      return setInterval(tick, everyMs).unref?.();
    }
  };
}
