import { SNAPSHOT, TRUST_WEIGHTS } from './data/meta.js';
import { buildCatalog, byBestValue } from './core/catalog.js';
import { loadShownHistory } from './core/history.js';
import {
  basketItems, clearBasket, dismissAdvice, fetchAdvice, loadBasketPrices, removeFromBasket, toggleBasket, useAdvice,
  type AdviceUse, type BasketItem, type BasketOffer
} from './core/basket.js';
import { forgetAllSaved, loadSavedPrices, savedItems, toggleSaved, type SavedItem } from './core/saved.js';
import { applyFresh, fetchBrowse, fetchLive } from './core/live.js';
import { createSearch } from './core/search.js';
import { decodeState, encodeState } from './core/urlstate.js';
import { toggleTheme } from './core/theme.js';
import type { Group, LiveState, Offer, RenderContext, SortKey, State, ViewName } from './types.js';
import { basketView } from './ui/basket.js';
import { howView, resultsView, storesView, suggestionsView, toolbarView, trayView } from './ui/views.js';

const catalog = buildCatalog();
const search = createSearch(catalog);
const offersById = new Map(catalog.offers.map(offer => [offer.id, offer] as const));

const SORTS: Record<SortKey, (a: Offer, b: Offer) => number> = {
  value: byBestValue,
  price: (a, b) => a.landed - b.landed,
  trust: (a, b) => b.trust.score - a.trust.score,
  eta: (a, b) => a.eta - b.eta || a.landed - b.landed
};

const VIEWS: Record<ViewName, (ctx: RenderContext) => string> = {
  results: resultsView, stores: storesView, compare: resultsView, how: howView, build: basketView
};

const state: State = {
  q: '',
  view: 'results',
  sort: 'value',
  sortLabels: {
    value: 'Best value (price + safety)',
    price: 'Lowest price',
    trust: 'Most trusted',
    eta: 'Fastest delivery'
  },
  minTrust: 0,
  codOnly: false,
  storeId: '',
  open: new Set<string>(),
  compare: [],
  maxCompare: 4,
  showAll: false,
  suggest: [],
  suggestIndex: -1,
  linkCopied: false,
  trend: null,
  live: { status: 'idle' },
  browse: { status: 'loading' },
  shelf: '',
  shelfLimit: 40,
  product: '',
  resultLimit: 40,
  liveSuggest: []
};

function must<T extends Element>(selector: string): T {
  const found = document.querySelector(selector);
  if (!found) throw new Error(`missing required element ${selector}`);
  return found as T;
}

const dom = {
  form: must<HTMLFormElement>('#sform'),
  input: must<HTMLInputElement>('#q'),
  out: must<HTMLElement>('#out'),
  tray: must<HTMLElement>('#tray'),
  tabs: must<HTMLElement>('#tabs'),
  suggest: must<HTMLElement>('#suggest-wrap')
};

/* A pasted link is a supported entry point, so read it before the first render. */
const urlValid = {
  stores: new Set(catalog.stores.map(store => store.id)),
  /* A closed shop can't be shortlisted by hand, so it can't be by link either. */
  offers: new Set(catalog.offers.filter(offer => !offer.suppressed).map(offer => offer.id)),
  maxCompare: state.maxCompare
};
Object.assign(state, decodeState(window.location.search, urlValid));
if (state.q) dom.input.value = state.q;

function passesFilters(offer: Offer): boolean {
  return (!state.minTrust || offer.trust.score >= state.minTrust) &&
    (!state.codOnly || offer.store.cod) &&
    (!state.storeId || offer.storeId === state.storeId);
}

/* One group per product: live offers sorted by the active sort, plus the listings
   excluded by the trust rules, which stay visible but never move the median. An explicit filter applies to them too. */
function buildGroups(): Group[] {
  const hits = state.q ? search.products(state.q) : catalog.products.map(product => ({ product }));
  const groups: Group[] = [];

  for (const { product } of hits) {
    const all = catalog.byProduct.get(product.id) ?? [];
    const live = all.filter(o => !o.suppressed && passesFilters(o)).sort(SORTS[state.sort]);
    const dropped = all.filter(o => o.suppressed && passesFilters(o));
    if (!live.length && !dropped.length) continue;

    const landed = live.map(o => o.landed).sort((a, b) => a - b);
    const category = catalog.categories.get(product.cat);
    if (!category) continue;

    groups.push({
      product,
      category,
      live,
      dropped,
      stats: {
        min: landed[0] ?? 0,
        max: landed[landed.length - 1] ?? 0
      },
      market: all[0].market,
      best: live.length ? [...live].sort(SORTS.value)[0] : null
    });
  }

  if (!state.q) groups.sort((a, b) => (b.best ? b.best.value : -1) - (a.best ? a.best.value : -1));
  return groups;
}

function context(): RenderContext {
  return { state, catalog, search, groups: buildGroups(), weights: TRUST_WEIGHTS, snapshot: SNAPSHOT, offersById, input: dom.input };
}

function syncControls(): void {
  const sort = document.querySelector<HTMLSelectElement>('#sort');
  const minTrust = document.querySelector<HTMLSelectElement>('#minTrust');
  const shop = document.querySelector<HTMLSelectElement>('#storeId');
  if (sort) sort.value = state.sort;
  if (minTrust) minTrust.value = String(state.minTrust);
  if (shop) shop.value = state.storeId;
}

function renderSuggestions(ctx: RenderContext): void {
  dom.suggest.innerHTML = suggestionsView(ctx);
  dom.input.setAttribute('aria-expanded', String(Boolean(document.querySelector('#suggest'))));
  if (ctx.state.suggestIndex < 0) dom.input.removeAttribute('aria-activedescendant');
}

/* Each step someone takes (opening a card or a product, a search, a tab, a category, starting
   to type into an empty box) is its own history entry, so the back button undoes it instead of
   leaving the site. The keypresses after the first replace the entry rather than piling up.
   The open product and category aren't in the address, so they ride in the entry's state. */
interface HistoryEntry { product: string; shelf: string }
let stepTaken = false;
const takeStep = (): void => { stepTaken = true; };
function syncUrl(): void {
  const query = encodeState(state);
  const next = query ? `${window.location.pathname}?${query}` : window.location.pathname;
  const entry: HistoryEntry = { product: state.product, shelf: state.shelf };
  const kept = (window.history.state ?? {}) as Partial<HistoryEntry>;
  const here = `${window.location.pathname}${window.location.search}`;
  const step = stepTaken;
  stepTaken = false;
  if (here === next && kept.product === entry.product && kept.shelf === entry.shelf) return;
  const startedTyping = !new URLSearchParams(window.location.search).has('q') && Boolean(state.q);
  if (step || (startedTyping && here !== next)) {
    window.history.pushState(entry, '', next);
  } else {
    window.history.replaceState(entry, '', next);
  }
}

/* Back and forward put the page back the way that entry left it. */
window.addEventListener('popstate', () => {
  const from = decodeState(window.location.search, urlValid);
  const saved = (window.history.state ?? {}) as Partial<HistoryEntry>;
  const query = from.q ?? '';
  const queryChanged = query !== state.q;
  state.q = query;
  dom.input.value = query;
  state.view = from.view ?? 'results';
  state.shelf = saved.shelf ?? '';
  state.shelfLimit = 40;
  state.suggestIndex = -1;
  stepTaken = false;
  if (queryChanged && query && state.view === 'results') {
    void startLive().then(() => {
      if (saved.product && state.q === query) { state.product = saved.product; render(); }
    });
    return;
  }
  if (queryChanged) { liveRequest?.abort(); state.live = { status: 'idle' }; }
  state.product = saved.product ?? '';
  render();
});

/* The web search costs money per run, so it starts only when someone submits a search, never
   on a keystroke; typing only asks the free price list. A newer search cancels the one in flight. */
let liveRequest: AbortController | undefined;

/**
 * Reads the prices on screen again from the shops (one product's, when `product` names it) and
 * applies them in place. Runs beside whatever else is loading; anything newer cancels it.
 */
async function recheckShown(request: AbortController, product = ''): Promise<void> {
  const shown = state.live;
  if (shown.status !== 'done' || request.signal.aborted || !shown.result.groups.length) return;
  state.live = { ...shown, checking: true };
  render();
  const fresh = await fetchLive(shown.result.query, request.signal, 'recheck', { product });
  if (request.signal.aborted) return;
  const current = state.live;
  if (current.status !== 'done') return;
  state.live = fresh.status === 'done'
    ? { ...current, checking: false, result: { ...applyFresh(current.result, fresh.result), rechecked: fresh.result.rechecked } }
    : { ...current, checking: false };
  render();
}

function clearLive(): void {
  liveRequest?.abort();
  state.live = { status: 'idle' };
}

async function startLive(webSearch = false): Promise<void> {
  const query = state.q.trim();
  clearTimeout(typing);
  clearTimeout(checkPause);
  liveRequest?.abort();
  if (!query) {
    state.live = { status: 'idle' };
    render();
    return;
  }
  const request = new AbortController();
  liveRequest = request;
  state.product = '';
  state.resultLimit = 40;
  state.view = 'results';

  /* The price list answers in milliseconds, so it goes first: if it corrected the spelling
     ("onplus" → "oneplus"), the paid web search runs with the corrected words too. */
  const hasPrices = (answer: LiveState): answer is Extract<LiveState, { status: 'done' }> =>
    answer.status === 'done' && answer.result.groups.length > 0;
  if (webSearch && !hasPrices(state.live)) {
    state.live = { status: 'loading', query };
    render();
  }
  /* The list answers in a fraction of a second, but not on every connection: if it hasn't after
     300 ms, a quiet "Searching…" line says something is happening, over the results still shown.
     The answer's render replaces it. */
  const busy = setTimeout(() => {
    if (liveRequest !== request || request.signal.aborted || webSearch) return;
    dom.out.setAttribute('aria-busy', 'true');
    dom.out.insertAdjacentHTML('afterbegin', '<p class="checking searching" role="status"><i aria-hidden="true"></i>Searching…</p>');
  }, 300);
  const listed = await fetchLive(query, request.signal, 'quick', { partial: !webSearch }).finally(() => {
    clearTimeout(busy);
    dom.out.removeAttribute('aria-busy');
  });
  if (request.signal.aborted) return;

  let searched = query;
  let typed: string | undefined;
  if (listed.status === 'done') {
    state.liveSuggest = listed.result.suggestions ?? [];
    if (listed.result.correctedFrom) {
      typed = listed.result.correctedFrom;
      searched = listed.result.query;
      state.q = searched;
      dom.input.value = searched;
    }
  }
  if (!webSearch && listed.status !== 'unavailable') {
    if (listed.status === 'done') {
      state.live = { ...listed, pending: false, instant: false, typed };
      render();
      void recheckShown(request);
    } else {
      state.live = listed;
      render();
    }
    return;
  }

  state.live = hasPrices(listed) ? { ...listed, pending: true, typed } : { status: 'loading', query: searched };
  render();
  /* While the web search runs, the list's prices are read again from the shops. */
  void recheckShown(request);

  const web = await fetchLive(searched, request.signal, 'web');
  if (request.signal.aborted) return;
  const current = state.live.status === 'done' ? state.live : listed;
  if (web.status === 'done' && (web.result.groups.length || !hasPrices(listed))) {
    state.live = { ...web, typed };
  } else if (current.status === 'done') {
    const note = web.status === 'done'
      ? `The web search found no other shop prices for “${searched}”.`
      : web.status === 'error'
        ? `Other shops could not be checked: ${web.message}`
        : !hasPrices(listed)
          ? 'Live web search is not set up on this server; only our price list was searched.'
          : undefined;
    state.live = { ...current, pending: false, typed, ...(note && { note }) };
  } else {
    state.live = web;
  }
  render();
}

/* Rendering replaces the markup, so keyboard focus has to be carried across by hand. */
function focusedControl(): string | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !(dom.out.contains(active) || dom.tray.contains(active))) return null;
  /* Escaped, because a suggested search can hold a quote, and a bad selector stops the render. */
  if (active.id) return `#${CSS.escape(active.id)}`;
  const { act, id, view, q } = active.dataset;
  if (!act) return null;
  const attr = (name: string, value: string | undefined): string | false =>
    value !== undefined && value !== '' && `[data-${name}="${CSS.escape(value)}"]`;
  return [attr('act', act), attr('id', id), attr('view', view), attr('q', q)].filter(Boolean).join('');
}

function render(): void {
  const focused = focusedControl();
  const ctx = context();
  dom.out.innerHTML = `${toolbarView()}${VIEWS[state.view](ctx)}`;
  dom.tray.innerHTML = trayView();
  /* Once a search is submitted, or another tab is open, the headline steps aside so the content
     starts on the first screen. Not while typing: the box would jump under the reader's thumb. */
  const typedResults = state.live.status === 'done' && state.live.instant;
  document.body.dataset.mode = (state.live.status === 'idle' || typedResults) && state.view === 'results' ? 'home' : 'search';
  dom.tabs.querySelectorAll<HTMLButtonElement>('button[data-view]').forEach(tab =>
    tab.setAttribute('aria-selected', String(tab.dataset.view === state.view)));
  renderSuggestions(ctx);
  syncControls();
  syncUrl();
  if (focused) (document.querySelector<HTMLElement>(focused) ?? dom.out).focus({ preventScroll: true });
  /* An open product page gets its price history, once; the chart appears when it arrives. */
  loadShownHistory(dom.out, render);
  /* Saved products on the home page get today's price, once per visit. */
  if (dom.out.querySelector('.saved-shelf')) loadSavedPrices(render);
  /* The build's products get their shop prices when the Build tab is open. */
  if (state.view === 'build') loadBasketPrices(render);
  const count = dom.tabs.querySelector<HTMLElement>('button[data-view="build"] .tab-count');
  if (count) {
    const items = basketItems().length;
    count.hidden = items === 0;
    count.textContent = String(items);
  }
}

/* Opens a product from the Saved shelf or the build: its search, then its page once prices are in. */
function openProduct(q: string, key: string): void {
  takeStep();
  state.q = q;
  dom.input.value = q;
  window.scrollTo({ top: 0 });
  void startLive().then(() => {
    if (state.live.status !== 'done' || state.q !== q) return;
    state.product = key;
    render();
    liveRequest?.abort();
    liveRequest = new AbortController();
    void recheckShown(liveRequest, key);
  });
}

/* Results follow the typing: the price list answers in milliseconds, so each pause in typing
   shows real prices for what is in the box, a half-typed last word completed the way the
   suggestions are. A moment later those prices are read again from the shops. */
let checkPause: ReturnType<typeof setTimeout> | undefined;
async function searchAsTyped(value: string): Promise<void> {
  liveRequest?.abort();
  const request = new AbortController();
  liveRequest = request;
  const answer = await fetchLive(value.trim(), request.signal, 'quick', { partial: !/\s$/.test(value) });
  if (request.signal.aborted) return;
  if (answer.status !== 'done') {
    /* No price list here (a static host), or it failed: the demo answers as it always has. */
    state.live = { status: 'idle' };
    state.liveSuggest = [];
    render();
    return;
  }
  state.liveSuggest = answer.result.suggestions ?? [];
  state.product = '';
  state.resultLimit = 40;
  state.live = { ...answer, instant: true };
  render();
  clearTimeout(checkPause);
  checkPause = setTimeout(() => void recheckShown(request), 1000);
}

/* Rendering leaves the input alone, so it keeps focus and the caret while typing. */
let typing: ReturnType<typeof setTimeout> | undefined;
function onQueryChange(value: string): void {
  state.q = value;
  state.view = 'results';
  state.suggestIndex = -1;
  liveRequest?.abort();
  clearTimeout(typing);
  clearTimeout(checkPause);
  if (value.trim().length < 2) {
    state.live = { status: 'idle' };
    state.liveSuggest = [];
    typing = setTimeout(render, 50);
    return;
  }
  typing = setTimeout(() => void searchAsTyped(value), 50);
}

function chooseSuggestion(item: State['suggest'][number]): void {
  if (item.kind === 'live') { state.q = item.label; }
  else if (item.kind === 'store') { state.storeId = item.id; state.q = ''; }
  else { state.q = item.label; state.open.add(item.id); state.showAll = true; }
  dom.input.value = state.q;
  state.suggestIndex = -1;
  dom.input.blur();
  takeStep();
  void startLive();
}

function toggleCompare(id: string): void {
  const offer = offersById.get(id);
  if (!offer || offer.suppressed) return;
  const sameProduct = state.compare.every(other => offersById.get(other)?.productId === offer.productId);
  if (!sameProduct) state.compare = [];
  const index = state.compare.indexOf(id);
  if (index >= 0) state.compare.splice(index, 1);
  else if (state.compare.length < state.maxCompare) state.compare.push(id);
  render();
}

function setView(next: string | undefined): void {
  if (next !== 'results' && next !== 'stores' && next !== 'compare' && next !== 'how' && next !== 'build') return;
  takeStep();
  state.view = next;
  render();
  window.scrollTo({ top: 0 });
}

const actions: Record<string, (trigger: HTMLElement) => void> = {
  theme: () => { toggleTheme(); },
  view: trigger => setView(trigger.dataset.view),
  compare: trigger => toggleCompare(trigger.dataset.id ?? ''),
  remove: trigger => toggleCompare(trigger.dataset.id ?? ''),
  clear: () => { state.compare = []; render(); },
  expand: trigger => {
    const id = trigger.dataset.id ?? '';
    if (state.open.has(id)) state.open.delete(id);
    else state.open.add(id);
    render();
  },
  trend: trigger => {
    const id = trigger.dataset.id ?? '';
    state.trend = state.trend === id ? null : id;
    render();
  },
  all: () => { state.showAll = true; render(); },
  query: trigger => { takeStep(); state.q = trigger.dataset.q ?? ''; state.view = 'results'; dom.input.value = state.q; void startLive(); window.scrollTo({ top: 0 }); },
  shelf: trigger => { takeStep(); state.shelf = trigger.dataset.id ?? ''; state.shelfLimit = 40; render(); },
  moreCards: () => { state.shelfLimit += 40; render(); },
  product: trigger => {
    takeStep();
    state.product = trigger.dataset.id ?? '';
    render();
    window.scrollTo({ top: 0 });
    /* Opening a product reads every shop's price for it again. */
    liveRequest?.abort();
    liveRequest = new AbortController();
    void recheckShown(liveRequest, state.product);
  },
  save: trigger => {
    try {
      toggleSaved(JSON.parse(trigger.dataset.item ?? '') as SavedItem);
    } catch {
      return;
    }
    render();
  },
  openSaved: trigger => {
    const item = savedItems().find(saved => saved.key === trigger.dataset.id);
    if (item) openProduct(item.q, item.key);
  },
  build: trigger => {
    try {
      const { item, offers } = JSON.parse(trigger.dataset.item ?? '') as { item: BasketItem; offers: BasketOffer[] };
      toggleBasket(item, offers);
    } catch {
      return;
    }
    render();
  },
  openBuild: trigger => {
    const item = basketItems().find(saved => saved.key === trigger.dataset.id);
    if (item) openProduct(item.q, item.product);
  },
  buildRemove: trigger => { removeFromBasket(trigger.dataset.id ?? ''); render(); },
  buildClear: () => { clearBasket(); render(); },
  advise: () => {
    const budget = Number(document.querySelector<HTMLInputElement>('#adv-budget')?.value);
    const use = (document.querySelector<HTMLSelectElement>('#adv-use')?.value ?? 'gaming') as AdviceUse;
    void fetchAdvice(Math.round(budget) || 0, use, render);
  },
  useAdvice: () => { if (useAdvice()) { render(); window.scrollTo({ top: 0 }); } },
  dismissAdvice: () => { dismissAdvice(); render(); },
  clearSaved: () => { forgetAllSaved(); render(); },
  searchWeb: () => { void startLive(true); },
  allResults: () => { takeStep(); state.product = ''; render(); },
  moreResults: () => { state.resultLimit += 40; render(); },
  focusSearch: () => { window.scrollTo({ top: 0 }); dom.input.focus(); },
  retryLive: () => { void startLive(false); },
  shop: trigger => {
    state.storeId = trigger.dataset.id ?? '';
    state.q = '';
    dom.input.value = '';
    clearLive();
    state.view = 'results';
    state.showAll = true;
    render();
    window.scrollTo({ top: 0 });
  },
  cod: () => { state.codOnly = !state.codOnly; render(); },
  copyLink: () => {
    /* The label only flips on a real success; a rejected clipboard write leaves the
       button saying "Copy link", which is the truth about what just happened. */
    /* The clipboard only exists on https or localhost; elsewhere there is nothing to do. */
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(window.location.href).then(() => {
      state.linkCopied = true;
      render();
      setTimeout(() => { state.linkCopied = false; render(); }, 1600);
    }, () => { state.linkCopied = false; });
  },
  reset: () => { state.codOnly = false; state.minTrust = 0; state.storeId = ''; render(); },
  clearQuery: () => { state.q = ''; dom.input.value = ''; clearLive(); render(); dom.input.focus(); },
  retry: () => loadBrowse(true)
};

dom.input.addEventListener('input', event => onQueryChange((event.target as HTMLInputElement).value));
dom.input.addEventListener('focus', render);
dom.input.addEventListener('blur', () => setTimeout(() => {
  state.suggestIndex = -1;
  dom.suggest.innerHTML = '';
}, 120));

dom.input.addEventListener('keydown', event => {
  const count = state.suggest.length;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    if (!count) return;
    state.suggestIndex = (state.suggestIndex + (event.key === 'ArrowDown' ? 1 : -1) + count) % count;
    renderSuggestions(context());
    dom.input.setAttribute('aria-activedescendant', `opt-${state.suggestIndex}`);
  } else if (event.key === 'Enter') {
    event.preventDefault();
    const chosen = state.suggest[state.suggestIndex];
    if (state.suggestIndex >= 0 && chosen) chooseSuggestion(chosen);
    else { dom.input.blur(); void startLive(); }
  } else if (event.key === 'Escape') {
    state.suggest = [];
    state.suggestIndex = -1;
    dom.suggest.innerHTML = '';
    dom.input.setAttribute('aria-expanded', 'false');
    dom.input.removeAttribute('aria-activedescendant');
  }
});

dom.form.addEventListener('submit', event => {
  event.preventDefault();
  const chosen = state.suggest[state.suggestIndex];
  if (state.suggestIndex >= 0 && chosen) {
    chooseSuggestion(chosen);
    return;
  }
  dom.input.blur();
  takeStep();
  void startLive();
});

/* Holding focus through the press: the blur handler clears the list after 120 ms, and a
   slower click would otherwise land on nothing. */
document.addEventListener('mousedown', event => {
  if (event.target instanceof Element && event.target.closest('[role="option"]')) event.preventDefault();
});

document.addEventListener('click', event => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const option = target.closest<HTMLElement>('[role="option"]');
  if (option) {
    const chosen = state.suggest[Number(option.dataset.i)];
    if (chosen) chooseSuggestion(chosen);
    return;
  }
  const trigger = target.closest<HTMLElement>('[data-act]');
  if (!trigger) return;
  actions[trigger.dataset.act ?? '']?.(trigger);
});

document.addEventListener('change', event => {
  const target = event.target instanceof HTMLSelectElement ? event.target : null;
  if (!target) return;
  if (target.id === 'sort') { state.sort = target.value as SortKey; render(); }
  if (target.id === 'minTrust') { state.minTrust = Number(target.value); render(); }
  if (target.id === 'storeId') { state.storeId = target.value; render(); }
});

dom.tabs.addEventListener('click', event => {
  const tab = event.target instanceof Element ? event.target.closest<HTMLElement>('button[data-view]') : null;
  if (tab) setView(tab.dataset.view);
});

/* A server that is restarting (it does on every deploy) answers nothing for a minute or so, so the
   placeholders stay up while the shelves are asked for again; only after that does the page say
   prices couldn't be loaded. `thenSearch` re-runs the search on screen once they arrive. */
const BROWSE_RETRY_MS = [3_000, 6_000, 10_000, 15_000, 20_000, 30_000];
let browseLoad = 0;
function loadBrowse(thenSearch: boolean): void {
  const load = ++browseLoad;
  state.browse = { status: 'loading' };
  render();
  const attempt = (tries: number): void => {
    void fetchBrowse().then(browse => {
      if (load !== browseLoad) return;
      if (browse.status === 'unavailable' && tries < BROWSE_RETRY_MS.length) {
        setTimeout(() => attempt(tries + 1), BROWSE_RETRY_MS[tries]);
        return;
      }
      state.browse = browse;
      if (thenSearch && state.q) void startLive(); else render();
    });
  };
  attempt(0);
}
loadBrowse(false);

/* A shared search link runs the same live search as typing it would. */
if (state.q && state.view === 'results') void startLive();
else render();
