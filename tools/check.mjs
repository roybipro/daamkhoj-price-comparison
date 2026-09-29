/* Integrity gate: runs against the built artifact, so it catches what the browser will
   actually hit — broken references, dangling imports and a catalogue that doesn't line up. */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const errors = [];

const { STORES } = await import(path.join(dist, 'js/data/stores.js'));
const { PRODUCTS } = await import(path.join(dist, 'js/data/products.js'));
const { RAW_OFFERS } = await import(path.join(dist, 'js/data/offers.js'));
const { CATEGORIES, TRUST_WEIGHTS } = await import(path.join(dist, 'js/data/meta.js'));

/* 1. every emitted module's relative import resolves in dist/ */
async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.name.endsWith('.js')) yield full;
  }
}

let moduleCount = 0;
for await (const file of walk(path.join(dist, 'js'))) {
  moduleCount++;
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(/from\s+'(\.[^']+)'/g)) {
    await readFile(path.resolve(path.dirname(file), match[1]), 'utf8')
      .catch(() => errors.push(`unresolved import ${match[1]} in ${path.relative(dist, file)}`));
  }
}

/* 2. index.html only references files that exist */
const html = await readFile(path.join(dist, 'index.html'), 'utf8');
for (const match of html.matchAll(/(?:src|href)="((?!https?:|data:|#)[^"]+)"/g)) {
  const raw = match[1];
  /* A bare "./" is the home link, which resolves to index.html at runtime. */
  const target = raw.endsWith('/')
    ? path.join(dist, 'index.html')
    : path.join(dist, raw.replace(/^\.\//, ''));
  await readFile(target, 'utf8')
    .catch(() => errors.push(`index.html points at a missing file: ${raw}`));
}

/* 3. the catalogue hangs together */
const storeIds = new Set(STORES.map(s => s.id));
const productIds = new Set(PRODUCTS.map(p => p.id));
const categoryIds = new Set(CATEGORIES.map(c => c.id));
const signalIds = new Set(TRUST_WEIGHTS.map(w => w.id));
const weightTotal = TRUST_WEIGHTS.reduce((sum, w) => sum + w.weight, 0);

if (weightTotal !== 100) errors.push(`trust weights sum to ${weightTotal}, not 100`);
if (signalIds.size !== TRUST_WEIGHTS.length) errors.push('duplicate trust signal ids');

for (const store of STORES) {
  if (!store.categories.length) errors.push(`shop ${store.id} lists no categories`);
  if (store.since > store.closed) errors.push(`shop ${store.id} closed before it opened`);
  for (const category of store.categories) {
    if (!categoryIds.has(category)) errors.push(`shop ${store.id} uses unknown category ${category}`);
  }
}
for (const product of PRODUCTS) {
  if (!categoryIds.has(product.cat)) errors.push(`product ${product.id} uses unknown category ${product.cat}`);
}
RAW_OFFERS.forEach(([productId, storeId], i) => {
  if (!productIds.has(productId)) errors.push(`listing ${i} references unknown product "${productId}"`);
  if (!storeIds.has(storeId)) errors.push(`listing ${i} references unknown shop "${storeId}"`);
});

const orphanProducts = [...productIds].filter(id => !RAW_OFFERS.some(row => row[0] === id));
if (orphanProducts.length) errors.push(`products with no listing: ${orphanProducts.join(', ')}`);
const deadShops = STORES.filter(s => s.closed && !s.incidents.length);
if (deadShops.length) errors.push(`closed shops need a reason: ${deadShops.map(s => s.id).join(', ')}`);

if (errors.length) {
  console.error(`check failed — ${errors.length} problem(s):`);
  for (const error of errors) console.error('  •', error);
  process.exit(1);
}

console.log(`check passed — ${moduleCount} modules, ${STORES.length} shops, ${PRODUCTS.length} products, ${RAW_OFFERS.length} listings, ${weightTotal}/100 weights`);
