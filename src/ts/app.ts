import { SNAPSHOT, TRUST_WEIGHTS } from './data/meta.js';
import { buildCatalog, byBestValue } from './core/catalog.js';
import { fetchLive } from './core/live.js';
import { createSearch } from './core/search.js';
import { decodeState, encodeState } from './core/urlstate.js';
import { toggleTheme } from './core/theme.js';
import type { Group, Offer, RenderContext, SortKey, State, ViewName } from './types.js';
import { compareView, howView, resultsView, storesView, suggestionsView, toolbarView, trayView } from './ui/views.js';

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
  results: resultsView, stores: storesView, compare: compareView, how: howView
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
  live: { status: 'idle' }
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
Object.assign(state, decodeState(window.location.search, {
  stores: new Set(catalog.stores.map(store => store.id)),
  /* A closed shop can't be shortlisted by hand, so it can't be by link either. */
  offers: new Set(catalog.offers.filter(offer => !offer.suppressed).map(offer => offer.id)),
  maxCompare: state.maxCompare
}));
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

/* replaceState, not pushState: filtering is one continuous view, and the back button
   should leave the site, not walk back through every keypress. */
function syncUrl(): void {
  const query = encodeState(state);
  const next = query ? `${window.location.pathname}?${query}` : window.location.pathname;
  if (`${window.location.pathname}${window.location.search}` !== next) {
    window.history.replaceState(null, '', next);
  }
}

/* Live search costs money per run, so it starts only when someone submits a search, never
   on a keystroke. A newer search cancels the one in flight. */
let liveRequest: AbortController | undefined;

function clearLive(): void {
  liveRequest?.abort();
  state.live = { status: 'idle' };
}

async function startLive(): Promise<void> {
  const query = state.q.trim();
  liveRequest?.abort();
  if (!query) {
    state.live = { status: 'idle' };
    render();
    return;
  }
  const request = new AbortController();
  liveRequest = request;
  state.view = 'results';
  state.live = { status: 'loading', query };
  render();
  const next = await fetchLive(query, request.signal);
  if (request.signal.aborted) return;
  state.live = next;
  render();
}

/* Rendering replaces the markup, so keyboard focus has to be carried across by hand. */
function focusedControl(): string | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !(dom.out.contains(active) || dom.tray.contains(active))) return null;
  if (active.id) return `#${active.id}`;
  const { act, id, view, q } = active.dataset;
  if (!act) return null;
  return [`[data-act="${act}"]`, id && `[data-id="${id}"]`, view && `[data-view="${view}"]`, q && `[data-q="${q}"]`]
    .filter(Boolean).join('');
}

function render(): void {
  const focused = focusedControl();
  const ctx = context();
  dom.out.innerHTML = `${toolbarView(ctx)}${VIEWS[state.view](ctx)}`;
  dom.tray.innerHTML = trayView(ctx);
  dom.tabs.querySelectorAll<HTMLButtonElement>('button[data-view]').forEach(tab =>
    tab.setAttribute('aria-selected', String(tab.dataset.view === state.view)));
  renderSuggestions(ctx);
  syncControls();
  syncUrl();
  if (focused) (document.querySelector<HTMLElement>(focused) ?? dom.out).focus({ preventScroll: true });
}

/* Rendering leaves the input alone, so it keeps focus and the caret while typing. */
let typing: ReturnType<typeof setTimeout> | undefined;
function onQueryChange(value: string): void {
  state.q = value;
  state.view = 'results';
  clearLive();
  state.suggestIndex = -1;
  clearTimeout(typing);
  typing = setTimeout(render, 90);
}

function chooseSuggestion(item: State['suggest'][number]): void {
  if (item.kind === 'store') { state.storeId = item.id; state.q = ''; }
  else { state.q = item.label; state.open.add(item.id); state.showAll = true; }
  dom.input.value = state.q;
  state.suggestIndex = -1;
  dom.input.blur();
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
  if (next !== 'results' && next !== 'stores' && next !== 'compare' && next !== 'how') return;
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
  query: trigger => { state.q = trigger.dataset.q ?? ''; state.view = 'results'; dom.input.value = state.q; void startLive(); },
  retryLive: () => { void startLive(); },
  shop: trigger => { state.storeId = trigger.dataset.id ?? ''; state.view = 'results'; state.showAll = true; render(); window.scrollTo({ top: 0 }); },
  cod: () => { state.codOnly = !state.codOnly; render(); },
  copyLink: () => {
    /* The label only flips on a real success; a rejected clipboard write leaves the
       button saying "Copy link", which is the truth about what just happened. */
    navigator.clipboard.writeText(window.location.href).then(() => {
      state.linkCopied = true;
      render();
      setTimeout(() => { state.linkCopied = false; render(); }, 1600);
    }, () => { state.linkCopied = false; });
  },
  reset: () => { state.codOnly = false; state.minTrust = 0; state.storeId = ''; render(); },
  clearQuery: () => { state.q = ''; dom.input.value = ''; clearLive(); render(); dom.input.focus(); }
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
    state.suggestIndex = -1;
    renderSuggestions(context());
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

/* A shared search link runs the same live search as typing it would. */
if (state.q && state.view === 'results') void startLive();
else render();
