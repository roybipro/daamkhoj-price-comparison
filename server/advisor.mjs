/* The build advisor: a budget and a use ("gaming", "editing", "office") in, a PC whose parts fit
   together out, each part a real in-stock listing from the price list at its real price.

   No AI: the budget is split by fixed shares, and each part is the best one that fits its share
   and the parts already chosen (a Ryzen 7600 needs an AM5 board and DDR5; an RTX 5070 needs a
   650 W supply). Nothing is invented: every name, price and link is a listing's own. */

import { partKey } from './browse.mjs';

export const USES = ['gaming', 'editing', 'office'];
export const MIN_BUDGET = 25_000;
export const MAX_BUDGET = 1_500_000;

/* How much of the budget each part may take, by use. An office PC has no graphics card. */
const SHARES = {
  gaming: { gpu: 0.38, cpu: 0.19, board: 0.13, ram: 0.08, ssd: 0.08, psu: 0.08, case: 0.06 },
  editing: { gpu: 0.25, cpu: 0.27, board: 0.13, ram: 0.13, ssd: 0.10, psu: 0.06, case: 0.06 },
  office: { cpu: 0.30, board: 0.22, ram: 0.14, ssd: 0.14, psu: 0.10, case: 0.10 }
};

export const ROLES = { cpu: 'Processor', board: 'Motherboard', ram: 'RAM', gpu: 'Graphics card', ssd: 'SSD', psu: 'Power supply', case: 'Casing' };

/* Each chipset's socket. */
const CHIPSETS = {
  AM4: ['a320', 'b450', 'a520', 'b550', 'x570'],
  AM5: ['a620', 'b650', 'b650e', 'x670', 'x670e', 'b840', 'b850', 'x870', 'x870e'],
  LGA1700: ['h610', 'b660', 'h670', 'z690', 'b760', 'h770', 'z790'],
  LGA1851: ['h810', 'b860', 'z890'],
  LGA1200: ['h410', 'b460', 'h470', 'z490', 'h510', 'b560', 'h570', 'z590']
};
const SOCKET_OF_CHIPSET = new Map(Object.entries(CHIPSETS).flatMap(([socket, chipsets]) => chipsets.map(chipset => [chipset, socket])));
/* The memory each socket takes; LGA1700 boards come in both, so the board decides. */
const MEMORY = { AM4: 'ddr4', AM5: 'ddr5', LGA1851: 'ddr5', LGA1200: 'ddr4', LGA1700: null };

/** A processor's socket and whether it has graphics of its own, from its part key. */
export function cpuFacts(key) {
  let found = key.match(/^amd ryzen (?:threadripper|[3579])(?: pro)? (\d)(\d{3})([a-z0-9]*)$/);
  if (found) {
    const [, series, , suffix] = found;
    /* 1000–5000 desktop chips are AM4, 7000 and 9000 are AM5; 8000G is AM5 and 8000 without G is not sold here. */
    const socket = Number(series) >= 7 ? 'AM5' : Number(series) <= 5 ? 'AM4' : null;
    if (!socket) return null;
    const graphics = socket === 'AM5' ? !suffix.includes('f') : suffix.includes('g');
    return { socket, graphics, generation: Number(series) };
  }
  found = key.match(/^intel core (?:i[3579] (\d{2})(\d{3})([a-z]*)|ultra [579] (2)\d{2}([a-z]*))$/);
  if (found) {
    if (found[4]) return { socket: 'LGA1851', graphics: !found[5].includes('f'), generation: 15 };
    const generation = Number(found[1]);
    const socket = generation >= 12 && generation <= 14 ? 'LGA1700' : generation >= 10 && generation <= 11 ? 'LGA1200' : null;
    return socket ? { socket, graphics: !found[3].includes('f'), generation } : null;
  }
  return null;
}

/* Roughly how fast each graphics chip is (an RTX 4060 is 50), to pick the fastest the money buys.
   Only used to rank chips against each other, never shown. */
const GPU_SCORE = {
  'gtx 1650': 18, 'rtx 3050': 28, 'rx 6500 xt': 20, 'rx 6600': 38, 'arc a750': 40, 'rtx 3060': 40, 'rx 6650 xt': 43,
  'rx 7600': 47, 'rtx 4060': 50, 'arc b570': 46, 'arc b580': 52, 'rx 7600 xt': 51, 'rtx 3060 ti': 52, 'rtx 5050': 48,
  'rtx 5060': 58, 'rtx 4060 ti': 60, 'rx 6750 xt': 56, 'rx 7700 xt': 66, 'rtx 5060 ti': 68, 'rtx 3070': 58,
  'rtx 4070': 72, 'rx 7800 xt': 76, 'rx 9060 xt': 66, 'rtx 5070': 80, 'rtx 4070 super': 82, 'rx 7900 gre': 82,
  'rx 9070': 86, 'rtx 4070 ti': 86, 'rtx 4070 ti super': 92, 'rtx 5070 ti': 96, 'rx 9070 xt': 97, 'rx 7900 xt': 95,
  'rtx 4080': 104, 'rtx 4080 super': 106, 'rx 7900 xtx': 108, 'rtx 5080': 112, 'rtx 4090': 135, 'rtx 5090': 165
};
/* What the whole PC draws with that card, so the supply has room: its wattage must be at least this. */
const psuFor = score => (score === 0 ? 450 : score <= 52 ? 550 : score <= 82 ? 650 : score <= 106 ? 750 : score <= 135 ? 850 : 1000);

const PSU_BRANDS = /\b(corsair|deepcool|antec|cooler master|gigabyte|msi|thermaltake|xigmatek|asus|seasonic|montech|1st ?player|lian li|fsp|be quiet|nzxt|gamdias|aerocool|super flower|silverstone|cougar|segotep|darkflash|ant esports|apexgaming)\b/;

/** One part's candidates: listings with these words, cheapest offer per product, each with its key. */
function candidates(index, words, test, limit = 6000) {
  const byProduct = new Map();
  for (const listing of index.listingsWith(words, limit)) {
    const name = listing.name.toLowerCase();
    if (!test(name, listing)) continue;
    const key = listing.product || name;
    const list = byProduct.get(key) ?? [];
    byProduct.set(key, list);
    list.push(listing);
  }
  const best = [];
  for (const listings of byProduct.values()) {
    /* A price far under what other shops ask for the same product is a typo or a wrong page
       (one RX 9070 at ৳53,000 where others ask ৳109,000), so it is never picked. */
    const prices = listings.map(listing => listing.price).sort((a, b) => a - b);
    const typical = prices[Math.floor(prices.length / 2)];
    const believable = listings.filter(listing => prices.length < 3 || listing.price >= typical * 0.6);
    /* A page saying "in stock" beats one that doesn't say, at the same price. */
    const cheapest = believable.reduce((low, listing) =>
      (!low || listing.price < low.price || (listing.price === low.price && listing.inStock && !low.inStock) ? listing : low), null);
    if (cheapest) best.push(cheapest);
  }
  return best.sort((a, b) => a.price - b.price);
}

/** The best of `options` that costs at most `money`, by `score` (the price when none is given);
    the cheapest when none fits. */
const within = (options, money) => options.some(option => option.price <= money);

function pick(options, money, score = option => option.price) {
  const fitting = options.filter(option => option.price <= money);
  if (!fitting.length) return options[0] ?? null;
  return fitting.reduce((best, option) => (score(option) > score(best) || (score(option) === score(best) && option.price < best.price) ? option : best));
}

const gb = name => {
  const kit = name.match(/\b(\d)\s*x\s*(\d+)\s*gb\b/);
  if (kit) return Number(kit[1]) * Number(kit[2]);
  const single = name.match(/\b(\d+)\s*gb\b/);
  return single ? Number(single[1]) : 0;
};
const tb = name => {
  const size = name.match(/\b(\d+(?:\.\d+)?)\s*(tb|gb)\b/);
  return size ? Number(size[1]) / (size[2] === 'gb' ? 1000 : 1) : 0;
};

const NOT_DESKTOP_RAM = /\b(laptop|notebook|sodimm|so-dimm|so dimm|server|ecc|reg|registered|macbook|imac|pc|processor|core|ryzen|ssd|motherboard|combo|bundle)\b/;

/** Every part's candidates, read once per build. */
function shopFor(index) {
  const cpus = [...candidates(index, ['ryzen'], name => partKey(name)?.startsWith('amd ryzen')),
    ...candidates(index, ['intel', 'core'], name => partKey(name)?.startsWith('intel core'))]
    .map(listing => ({ ...listing, facts: cpuFacts(partKey(listing.name)) }))
    .filter(listing => listing.facts && listing.facts.generation >= (listing.facts.socket.startsWith('AM') ? 3 : 12))
    /* AM4 and Intel 10th/11th gen are only offered when nothing newer fits the money. */
    .sort((a, b) => a.price - b.price);

  /* "MSI PRO B650M-A WIFI": the chipset is the first word that names one, with or without its "M". */
  const boards = candidates(index, ['motherboard'], name => !/\b(combo|bundle|with|laptop|cpu|processor)\b|\+/.test(name))
    .map(listing => {
      const name = listing.name.toLowerCase();
      const chipset = name.split(/[^a-z0-9]+/).map(word => word.replace(/^([abhxz]\d{3}e?)m?$/, '$1')).find(word => SOCKET_OF_CHIPSET.has(word));
      const socket = chipset ? SOCKET_OF_CHIPSET.get(chipset) : null;
      const memory = /\bddr4\b|\bd4\b/.test(name) ? 'ddr4' : /\bddr5\b|\bd5\b/.test(name) ? 'ddr5' : socket ? MEMORY[socket] : null;
      return { ...listing, socket, memory };
    })
    .filter(board => board.socket && board.memory);

  const ram = ['ddr4', 'ddr5'].flatMap(memory =>
    candidates(index, [memory], name => /\b(ram|desktop|dimm|memory)\b/.test(name) && !NOT_DESKTOP_RAM.test(name) && gb(name) >= 8)
      .map(listing => ({ ...listing, memory, size: gb(listing.name.toLowerCase()) })));

  const gpus = candidates(index, ['graphics'], name => /\b(rtx|gtx|rx|arc)\s*a?\d{3,4}/.test(name) && !/\b(laptop|notebook|pc|combo)\b/.test(name))
    .map(listing => {
      const key = partKey(listing.name) ?? '';
      const chip = key.match(/\b(rtx|gtx|rx|arc) (a?\d{3,4})(?: (ti super|ti|super|xtx|xt|gre))?/);
      return { ...listing, score: chip ? GPU_SCORE[chip.slice(1).filter(Boolean).join(' ')] ?? 0 : 0 };
    })
    .filter(gpu => gpu.score > 0);

  const ssds = candidates(index, ['nvme'], name => /\bssd\b/.test(name) && !/\b(enclosure|external|portable|case|adapter|heatsink only|laptop)\b/.test(name) && tb(name) >= 0.25)
    .map(listing => ({ ...listing, size: tb(listing.name.toLowerCase()) }));

  const psus = candidates(index, ['power', 'supply'], name => PSU_BRANDS.test(name) && !/\b(ups|adapter|laptop|charger|cable|casing|case)\b/.test(name))
    .map(listing => ({ ...listing, watts: Number(listing.name.match(/\b(\d{3,4})\s*w(att)?\b/i)?.[1] ?? 0) }))
    .map(psu => ({ ...psu, rated: /80\s*\+|80\s*plus/i.test(psu.name) }))
    .filter(psu => psu.watts >= 400 && psu.watts <= 1600);

  const cases = candidates(index, ['casing'], name => /\b(atx|tower|gaming|mid|micro|matx|itx)\b/.test(name)
    && !/\b(psu|power supply|with psu|fan only|phone|mobile|laptop|hdd|ssd|enclosure|bag|cover|watch|airpods|pc)\b/.test(name));

  return { cpus, boards, ram, gpus, ssds, psus, cases };
}

/**
 * A PC for `budget` taka and `use`, from the price list in `index`: its parts, their total, and
 * notes saying why they go together. Parts with nothing in stock are left out and named.
 */
export function adviseBuild(index, { budget, use }) {
  const money = Math.round(Number(budget));
  if (!USES.includes(use)) throw new RangeError(`use must be one of ${USES.join(', ')}`);
  if (!(money >= MIN_BUDGET && money <= MAX_BUDGET)) throw new RangeError(`budget must be between ${MIN_BUDGET} and ${MAX_BUDGET} taka`);
  const shop = shopFor(index);
  const share = SHARES[use];
  const notes = [];

  /* When even the cheapest graphics card is well over its share, the PC uses the processor's own
     graphics instead, and the card's share goes to the rest. */
  const cheapestCard = shop.gpus.reduce((low, card) => Math.min(low, card.price), Infinity);
  const noCard = Boolean(share.gpu) && cheapestCard > share.gpu * money * 1.3;

  function build(extra) {
    const allow = part => (share[part] ?? 0) * money + (extra[part] ?? 0) + (noCard && part === 'cpu' ? share.gpu * money * 0.5 : 0);
    /* An office PC, or one with no card, uses the processor's own graphics. */
    const cpuOptions = use === 'office' || noCard ? shop.cpus.filter(cpu => cpu.facts.graphics) : shop.cpus;
    /* Newer platforms first: an older chip only when nothing newer fits. */
    const modern = cpuOptions.filter(cpu => cpu.facts.socket === 'AM5' || cpu.facts.socket === 'LGA1851' || cpu.facts.socket === 'LGA1700');
    const cpu = pick(modern.some(option => option.price <= allow('cpu')) ? modern : cpuOptions, allow('cpu'));
    if (!cpu) return null;
    const boardOptions = shop.boards.filter(board => board.socket === cpu.facts.socket);
    const board = pick(boardOptions, allow('board'));
    const memory = board?.memory ?? MEMORY[cpu.facts.socket] ?? 'ddr5';
    const wantRam = use === 'editing' || money >= 150_000 ? 32 : 16;
    const ramOptions = shop.ram.filter(stick => stick.memory === memory && stick.size >= wantRam && stick.size <= wantRam * 2);
    const anyRam = shop.ram.filter(stick => stick.memory === memory);
    const ram = within(ramOptions, allow('ram')) ? pick(ramOptions, allow('ram'), stick => stick.size * 1e6 - stick.price) : pick(anyRam, allow('ram'), stick => stick.size * 1e6 - stick.price);
    const gpu = share.gpu && !noCard ? pick(shop.gpus, allow('gpu'), card => card.score) : null;
    const wantSsd = use === 'office' ? 0.5 : money >= 150_000 ? 2 : 1;
    const ssdOptions = shop.ssds.filter(drive => drive.size >= wantSsd && drive.size <= wantSsd * 2);
    const ssd = pick(within(ssdOptions, allow('ssd')) ? ssdOptions : shop.ssds, allow('ssd'), drive => drive.size * 1e6 - drive.price);
    const watts = psuFor(gpu?.score ?? 0);
    /* A graphics card gets an 80 Plus rated supply; the cheapest unrated ones are left to office PCs. */
    const supplies = shop.psus.filter(supply => supply.watts >= watts && supply.watts <= watts + 300 && (!gpu || supply.rated));
    const psu = pick(supplies, allow('psu'), supply => -supply.price);
    const casing = pick(shop.cases, allow('case'), item => -Math.abs(item.price - allow('case') * 0.8));
    const parts = { cpu, board, ram, gpu, ssd, psu, case: casing };
    const total = Object.values(parts).reduce((sum, part) => sum + (part?.price ?? 0), 0);
    return { parts, total, watts };
  }

  /* First pass at the shares; then what is left goes to the part that matters most for the use. */
  let result = build({});
  if (!result) return { budget: money, use, total: 0, parts: [], missing: Object.keys(share), notes: ['No processor in stock fits this budget.'] };
  const lead = use === 'gaming' ? 'gpu' : 'cpu';
  for (let round = 0; round < 3; round++) {
    const left = money - result.total;
    if (left < 1000) break;
    const better = build({ [lead]: left + (result.parts[lead]?.price ?? 0) - (share[lead] ?? 0) * money });
    if (!better || better.total > money || better.total <= result.total) break;
    result = better;
  }

  const { parts, total, watts } = result;
  const cpu = parts.cpu;
  notes.push(`${cpu.facts.socket} platform: the motherboard takes this processor${parts.ram ? `, and ${parts.board?.memory?.toUpperCase() ?? parts.ram.memory.toUpperCase()} memory` : ''}.`);
  if (!parts.gpu && use === 'office') notes.push("No graphics card: the processor's own graphics run office work and video.");
  if (noCard) notes.push("No graphics card fits this budget: the processor's own graphics play lighter games. Add a card later.");
  if (parts.gpu) notes.push(`A ${watts} W or larger power supply, for the graphics card.`);
  if (cpu.facts.socket === 'AM4' || cpu.facts.socket === 'LGA1200') notes.push('An older platform: nothing newer fit the budget.');
  notes.push(/\btray\b/i.test(cpu.name) ? 'This processor is a tray chip with no cooler: add one.' : 'Boxed processors usually include a cooler; check the listing.');
  if (total > money) notes.push(`Over budget by ৳${(total - money).toLocaleString('en-US')}: no cheaper part was in stock for every slot.`);

  const missing = Object.keys(share).filter(role => !parts[role] && !(role === 'gpu' && noCard));
  const order = ['cpu', 'board', 'ram', 'gpu', 'ssd', 'psu', 'case'];
  return {
    budget: money,
    use,
    total,
    parts: order.filter(role => parts[role]).map(role => {
      const { shop: seller, url, name, price, image, product, inStock, checkedAt } = parts[role];
      return { role, label: ROLES[role], name, price, shop: seller, url, image: image ?? null, product, inStock, checkedAt };
    }),
    missing: missing.map(role => ROLES[role]),
    notes
  };
}
