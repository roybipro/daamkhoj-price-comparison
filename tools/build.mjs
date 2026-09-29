import { spawnSync } from 'node:child_process';
import { cp, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'src');
const out = path.join(root, 'dist');
const tsc = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');

/* Clean before tsc runs, or the compile output gets deleted along with the old build. */
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

const args = process.argv.includes('--no-emit') ? ['--noEmit'] : [];
const result = spawnSync(process.execPath, [tsc, ...args], { cwd: root, stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status ?? 1);

if (process.argv.includes('--no-emit')) {
  console.log('typecheck passed');
  process.exit(0);
}

/* tsc emitted dist/js; the rest of src/ is copied through untouched. */
for (const entry of ['index.html', 'styles', 'assets']) {
  await cp(path.join(src, entry), path.join(out, entry), { recursive: true });
}

const index = await stat(path.join(out, 'index.html')).catch(() => null);
if (!index) {
  console.error('build failed: dist/index.html was not produced');
  process.exit(1);
}
console.log('built dist/ — TypeScript compiled to dist/js, static files copied.');
