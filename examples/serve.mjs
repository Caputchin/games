// Minimal static server for the local dev harness.
// Serves the caputchin-games repo root over http://localhost:5173.
// No-cache headers so tsup --watch rebuilds reflect on browser reload.

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT ?? 5173);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.map': 'application/json',
};

const server = http.createServer(async (req, res) => {
  try {
    const requested = decodeURIComponent((req.url ?? '/').split('?')[0]);
    let filePath = path.join(ROOT, requested === '/' ? 'examples/host.html' : requested);
    const absRoot = path.resolve(ROOT);
    if (!filePath.startsWith(absRoot)) {
      res.statusCode = 403;
      res.end('Forbidden');
      return;
    }

    let stats;
    try {
      stats = await stat(filePath);
    } catch {
      res.statusCode = 404;
      res.end('Not found: ' + requested);
      return;
    }

    if (stats.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    const body = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] ?? 'application/octet-stream';

    res.writeHead(200, {
      'content-type': type,
      'cache-control': 'no-store, must-revalidate',
    });
    res.end(body);
  } catch (err) {
    res.statusCode = 500;
    res.end('Server error: ' + String(err));
  }
});

server.listen(PORT, () => {
  console.log(`leaf-memory dev harness → http://localhost:${PORT}/examples/host.html`);
});
