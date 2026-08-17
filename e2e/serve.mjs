// Serves the export the way the bucket does, so the guard tests what ships.
//
// hanzoai/static fronts the `tabs` bucket and resolves a directory to its
// index.html; trailingSlash: true in next.config.mjs is what makes every route a
// directory. This does the same two things and nothing else — a test server that
// resolves paths differently from production would pass on pages that 404 live.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';

const root = new URL('../out/', import.meta.url).pathname;
const port = Number(process.env.PORT || 4321);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = extname(path) ? path : join(path, 'index.html');
  try {
    const body = await readFile(join(root, file));
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    // The export has no 404 route of its own; a miss is a miss.
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found');
  }
}).listen(port, () => console.log(`serving out/ on ${port}`));
