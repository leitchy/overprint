/**
 * Minimal static server for the built `dist/` over plain HTTP on localhost.
 *
 * The e2e PWA harness needs this instead of `vite preview`, because our preview
 * runs under a self-signed cert (basicSsl) and browsers refuse to register a
 * service worker when the script is fetched over a cert error. `http://127.0.0.1`
 * is a secure context for service workers, so this works where preview cannot.
 *
 * Usage: node scripts/serve-dist.mjs [port]
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'dist');
const PORT = Number(process.argv[2] ?? 4181);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ocd': 'application/octet-stream',
  '.overprint': 'application/json; charset=utf-8',
};

async function tryFile(path) {
  try {
    const s = await stat(path);
    if (s.isFile()) return await readFile(path);
  } catch {
    /* not found */
  }
  return null;
}

const server = createServer(async (req, res) => {
  // Strip query string and prevent path traversal outside dist.
  const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const safe = normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  const target = safe === '/' ? '/index.html' : safe;

  let body = await tryFile(join(DIST, target));
  let ext = extname(target);
  if (body === null) {
    // SPA fallback — mirror the SW's navigateFallback to index.html.
    body = await tryFile(join(DIST, 'index.html'));
    ext = '.html';
  }
  if (body === null) {
    res.writeHead(404).end('Not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
  res.end(body);
});

server.listen(PORT, '127.0.0.1', () => {
  // eslint-disable-next-line no-console
  console.log(`serving dist on http://127.0.0.1:${PORT}`);
});
