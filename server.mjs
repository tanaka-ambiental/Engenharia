import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/src/style.css', ['src/style.css', 'text/css; charset=utf-8']],
  ['/src/app.js', ['src/app.js', 'text/javascript; charset=utf-8']],
  ['/src/model.js', ['src/model.js', 'text/javascript; charset=utf-8']],
]);
export function createServer() {
  return http.createServer(async (req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    const asset = assets.get(path);
    if (!asset || !['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Não encontrado');
      return;
    }
    try {
      const data = await readFile(new URL(asset[0], import.meta.url));
      res.writeHead(200, {
        'Content-Type': asset[1], 'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch {
      res.writeHead(500); res.end('Falha ao ler o aplicativo.');
    }
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  createServer().listen(port, process.env.HOST || '0.0.0.0', () => {
    console.log(`Engenharia Hídrica disponível na porta ${port}`);
  });
}
