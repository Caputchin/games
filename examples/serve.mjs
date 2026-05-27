// Minimal static server for the local dev harness.
// Serves the caputchin-games repo root over http://localhost:5173 by default,
// or https://localhost:5173 when a mkcert-generated cert pair is present at
// examples/.cert/localhost.pem + examples/.cert/localhost-key.pem.
//
// HTTPS is required when exercising examples/host.html (the published widget
// rejects http: game-src as invalid-config). examples/direct-mount.html works
// over plain HTTP - it bypasses the widget iframe path entirely.
//
// To enable HTTPS:
//   brew install mkcert nss   # or your platform equivalent - see README
//   mkcert -install            # one-time, adds local CA to trust stores
//   cd examples && mkdir -p .cert && cd .cert
//   mkcert -cert-file localhost.pem -key-file localhost-key.pem localhost 127.0.0.1
//
// No-cache headers so tsup --watch rebuilds reflect on browser reload.

import http from 'node:http';
import https from 'node:https';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT ?? 5173);
const CERT_DIR = path.join(__dirname, '.cert');
const CERT_FILE = path.join(CERT_DIR, 'localhost.pem');
const KEY_FILE = path.join(CERT_DIR, 'localhost-key.pem');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.map': 'application/json',
};

async function loadTls() {
  try {
    const [cert, key] = await Promise.all([readFile(CERT_FILE), readFile(KEY_FILE)]);
    return { cert, key };
  } catch {
    return null;
  }
}

async function handler(req, res) {
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
}

const tls = await loadTls();
const scheme = tls ? 'https' : 'http';
const server = tls
  ? https.createServer({ cert: tls.cert, key: tls.key }, handler)
  : http.createServer(handler);

server.listen(PORT, () => {
  console.log(`leaf-memory dev harness → ${scheme}://localhost:${PORT}/examples/host.html`);
  if (!tls) {
    console.log(
      '(HTTP mode: host.html will hit invalid-config on the widget. Use direct-mount.html for HTTP testing, or set up mkcert to enable HTTPS.)',
    );
  }
});
