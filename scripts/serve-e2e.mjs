// e2e 静态服务器：伺服 build-pages 产物 docs/（目录页 + 单文件播放器）。
// 跑 e2e 前先执行 `npm run build:pages`（playwright.config 的 webServer 会自动做）。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const siteDir = path.join(rootDir, process.env.E2E_DIR || 'docs');
const port = Number(process.env.PORT || 4179);

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
};

function safeResolve(baseDir, relativePath) {
  const resolved = path.resolve(baseDir, `.${relativePath}`);
  if (!resolved.startsWith(baseDir)) return null;
  return resolved;
}

const server = http.createServer((request, response) => {
  const parsed = new URL(request.url || '/', `http://${request.headers.host || '127.0.0.1'}`);
  const requestPath = parsed.pathname === '/' ? '/index.html' : parsed.pathname;
  const filePath = safeResolve(siteDir, requestPath);
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  response.writeHead(200, { 'content-type': mimeTypes[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(response);
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`E2E server listening on http://127.0.0.1:${port} (serving ${path.relative(rootDir, siteDir)}/)\n`);
});
