import assert from 'node:assert/strict';
import test from 'node:test';
import { adviseBuild, cpuFacts } from '../server/advisor.mjs';
import { productKey } from '../server/browse.mjs';
import { wordSet } from '../server/matching.mjs';

/* A stand-in for the price list: listingsWith() as the real one answers it. */
function fakeIndex(listings) {
  const rows = listings.map(([name, price, shop = 'a.bd', inStock = true]) =>
    ({ shop, url: `https://${shop}/${encodeURIComponent(name)}`, name, price, inStock, image: null, product: productKey(name), checkedAt: '2026-11-28T00:00:00.000Z' }));
  return {
    listingsWith: words => rows
      .filter(row => row.inStock !== false && words.every(word => wordSet(`${row.name} ${row.url}`).has(word)))
      .sort((a, b) => a.price - b.price)
  };
}

const SHOP = [
  ['AMD Ryzen 5 7600 Processor', 21000],
  ['AMD Ryzen 5 8600G Processor with Radeon Graphics', 18000],
  ['Intel Core i5-12400F Processor', 14000],
  ['Intel Core i3-12100 Processor', 10500],
  ['MSI PRO B650M-A WIFI AM5 Motherboard', 16000],
  ['ASUS PRIME H610M-E D4 Motherboard', 9500],
  ['Gigabyte A620M S2H DDR5 AM5 Motherboard', 10000],
  ['G.Skill 16GB DDR5 6000MHz Desktop RAM', 6500],
  ['Corsair 32GB (2x16GB) DDR5 6000MHz Desktop RAM', 12500],
  ['Team T-Force 16GB DDR4 3200MHz Desktop RAM', 4200],
  ['Corsair 16GB DDR5 5600 Laptop RAM', 3000],
  ['MSI GeForce RTX 5060 8G Ventus 2X OC Graphics Card', 40000],
  ['MSI GeForce RTX 5060 8G Ventus 2X OC Graphics Card', 41000, 'b.bd'],
  ['MSI GeForce RTX 5060 8G Ventus 2X OC Graphics Card', 18000, 'c.bd'],
  ['Gigabyte RTX 4060 Eagle OC 8G Graphics Card', 34000],
  ['Kingston NV3 1TB M.2 NVMe SSD', 7500],
  ['Kingston NV3 500GB M.2 NVMe SSD', 4500],
  ['UGREEN M.2 NVMe SSD Enclosure', 1500],
  ['Corsair CX550 550W 80 Plus Bronze Power Supply', 6000],
  ['Corsair CX650 650W 80 Plus Bronze Power Supply', 7000],
  ['Deepcool PF450 450W Power Supply', 3000],
  ['Xigmatek Gaming X Mid Tower ATX Casing', 4500],
  ['Value-Top Micro ATX Casing With PSU', 2000]
];

test('cpuFacts knows each processor\'s socket and graphics', () => {
  assert.deepEqual(cpuFacts('amd ryzen 5 7600'), { socket: 'AM5', graphics: true, generation: 7 });
  assert.equal(cpuFacts('amd ryzen 5 5600')?.graphics, false);
  assert.equal(cpuFacts('amd ryzen 5 5600g')?.graphics, true);
  assert.equal(cpuFacts('intel core i5 12400f')?.socket, 'LGA1700');
  assert.equal(cpuFacts('intel core i5 12400f')?.graphics, false);
  assert.equal(cpuFacts('intel core ultra 7 265k')?.socket, 'LGA1851');
  assert.equal(cpuFacts('intel core i5 10400')?.socket, 'LGA1200');
});

test('a gaming build has parts that fit together and stays within budget', () => {
  const build = adviseBuild(fakeIndex(SHOP), { budget: 90000, use: 'gaming' });
  const part = role => build.parts.find(item => item.role === role);
  assert.ok(build.total <= 90000, `total ${build.total}`);
  assert.deepEqual(build.parts.map(item => item.role), ['cpu', 'board', 'ram', 'gpu', 'ssd', 'psu', 'case']);
  const socket = cpuFacts(productKey(part('cpu').name)).socket;
  assert.match(part('board').name, socket === 'AM5' ? /B650|A620/ : /H610/);
  assert.match(part('ram').name, socket === 'AM5' ? /DDR5/ : /DDR4/);
  assert.doesNotMatch(part('ram').name, /laptop/i);
  /* The ৳18,000 RTX 5060 is far under the other shops' price: a wrong page, never picked. */
  assert.notEqual(part('gpu').price, 18000);
  /* A card gets an 80 Plus supply big enough for it, and the case comes without one. */
  assert.match(part('psu').name, /80 Plus/);
  assert.doesNotMatch(part('case').name, /PSU/);
  assert.doesNotMatch(part('ssd').name, /Enclosure/);
});

test('an office build uses the processor\'s own graphics', () => {
  const build = adviseBuild(fakeIndex(SHOP), { budget: 50000, use: 'office' });
  assert.ok(!build.parts.some(item => item.role === 'gpu'));
  assert.equal(cpuFacts(productKey(build.parts[0].name)).graphics, true);
  assert.ok(build.notes.some(note => /own graphics/.test(note)));
});

test('a gaming budget no card fits drops the card and says so', () => {
  const build = adviseBuild(fakeIndex(SHOP), { budget: 30000, use: 'gaming' });
  assert.ok(!build.parts.some(item => item.role === 'gpu'));
  assert.ok(build.notes.some(note => /No graphics card fits/.test(note)));
  assert.equal(cpuFacts(productKey(build.parts[0].name)).graphics, true);
});

test('a budget or use out of range is refused', () => {
  assert.throws(() => adviseBuild(fakeIndex(SHOP), { budget: 5000, use: 'gaming' }), RangeError);
  assert.throws(() => adviseBuild(fakeIndex(SHOP), { budget: 80000, use: 'mining' }), RangeError);
});
