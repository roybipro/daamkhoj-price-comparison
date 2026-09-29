import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'dist');
const host = '127.0.0.1';
const port = Number(process.env.PORT || 5173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

/* ES modules need an http(s) origin, so this stands in for the static host locally. */
createServer(async (req, res) => {
  const url = new URL(req.url, `http://${host}`);
  const target = path.resolve(dir, '.' + decodeURIComponent(url.pathname));
  if (target !== dir && !target.startsWith(dir + path.sep)) {
    res.writeHead(403, { 'content-type': 'text/plain' }).end('forbidden');
    return;
  }

  const found = await stat(target).catch(() => null);
  const file = found?.isDirectory() ? path.join(target, 'index.html') : target;
  const info = await stat(file).catch(() => null);
  if (!info) {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
    return;
  }

  res.writeHead(200, {
    'content-type': TYPES[path.extname(file)] || 'application/octet-stream',
    'content-length': info.size,
    'cache-control': 'no-store'
  });
  createReadStream(file).pipe(res);
}).listen(port, host, () => {
  console.log(`DaamKhoj — serving dist/ at http://${host}:${port}/`);
});
