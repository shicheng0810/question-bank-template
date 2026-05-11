import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const siteDir = path.join(rootDir, 'dist');
const extractorDir = path.join(rootDir, 'dist', 'extractor');
const port = Number(process.env.PORT || 4179);

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.qbpack': 'application/json; charset=utf-8',
};

function safeResolve(baseDir, relativePath) {
  const resolved = path.resolve(baseDir, `.${relativePath}`);
  if (!resolved.startsWith(baseDir)) return null;
  return resolved;
}

function findFile(requestPath) {
  const normalizedPath = requestPath === '/' ? '/index.html' : requestPath;
  const candidates = normalizedPath.startsWith('/extractor/')
    ? [
        safeResolve(extractorDir, normalizedPath.replace('/extractor/', '/extractor/')),
        safeResolve(siteDir, normalizedPath.replace('/extractor', '')),
      ]
    : [
        safeResolve(siteDir, normalizedPath),
        safeResolve(extractorDir, normalizedPath),
      ];

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

const server = http.createServer((request, response) => {
  const parsed = new URL(request.url || '/', `http://${request.headers.host || '127.0.0.1'}`);
  const filePath = findFile(parsed.pathname);
  if (!filePath) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  response.writeHead(200, { 'content-type': mimeTypes[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(response);
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`E2E server listening on http://127.0.0.1:${port}\n`);
});
