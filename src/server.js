import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { dirname, join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, '..');
const PORT = process.env.PORT || 3456;
const HOST = process.env.HOST || '0.0.0.0';

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const path = url.pathname;
    const method = req.method || 'GET';

    if (method !== 'GET' && method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Method Not Allowed');
      return;
    }

    // Health check
    if (path === '/healthz' || path === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, app: 'vianocna-posta', status: 'online' }));
      return;
    }

    // Static assets (/assets/*)
    if (path.startsWith('/assets/')) {
      const fileName = decodeURIComponent(path.replace('/assets/', ''));
      const safeFile = join(ROOT_DIR, 'public', 'lovable-app', 'assets', fileName);
      if (resolve(safeFile).startsWith(join(ROOT_DIR, 'public', 'lovable-app', 'assets'))) {
        try {
          const ext = extname(safeFile).toLowerCase();
          const mime =
            ext === '.css'
              ? 'text/css; charset=utf-8'
              : ext === '.js'
                ? 'application/javascript; charset=utf-8'
                : ext === '.png'
                  ? 'image/png'
                  : ext === '.jpg' || ext === '.jpeg'
                    ? 'image/jpeg'
                    : ext === '.mp3'
                      ? 'audio/mpeg'
                      : ext === '.json'
                        ? 'application/json; charset=utf-8'
                        : 'application/octet-stream';

          const fileData = await readFile(safeFile);
          res.writeHead(200, {
            'Content-Type': mime,
            'Cache-Control': 'public, max-age=86400',
            'X-Content-Type-Options': 'nosniff'
          });
          res.end(fileData);
          return;
        } catch {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Asset not found');
          return;
        }
      }
    }

    // Santa audio/media assets (/santa/assets-sk/*)
    if (path.startsWith('/santa/assets-sk/') || path.startsWith('/santa/assets/')) {
      const isSk = path.startsWith('/santa/assets-sk/');
      const prefix = isSk ? '/santa/assets-sk/' : '/santa/assets/';
      const subDir = isSk ? 'assets-sk' : 'assets';
      const fileName = decodeURIComponent(path.replace(prefix, ''));
      const safeFile = join(ROOT_DIR, 'public', 'santa', subDir, fileName);
      if (resolve(safeFile).startsWith(join(ROOT_DIR, 'public', 'santa', subDir))) {
        try {
          const ext = extname(safeFile).toLowerCase();
          const mime =
            ext === '.png'
              ? 'image/png'
              : ext === '.jpg' || ext === '.jpeg'
                ? 'image/jpeg'
                : ext === '.mp3'
                  ? 'audio/mpeg'
                  : ext === '.m4a'
                    ? 'audio/mp4'
                    : ext === '.webm'
                      ? 'audio/webm'
                      : 'application/octet-stream';

          const fileStat = await stat(safeFile);
          const totalSize = fileStat.size;
          const range = req.headers.range;

          if (range) {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
            const chunkSize = end - start + 1;

            res.writeHead(206, {
              'Content-Range': `bytes ${start}-${end}/${totalSize}`,
              'Accept-Ranges': 'bytes',
              'Content-Length': chunkSize,
              'Content-Type': mime,
              'Cache-Control': 'public, max-age=86400'
            });
            createReadStream(safeFile, { start, end }).pipe(res);
            return;
          }

          res.writeHead(200, {
            'Content-Type': mime,
            'Content-Length': totalSize,
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'public, max-age=86400'
          });
          createReadStream(safeFile).pipe(res);
          return;
        } catch {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Asset not found');
          return;
        }
      }
    }

    // Telemetry stub
    if (path.startsWith('/__l5e/')) {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      res.end('/* lovable telemetry disabled */');
      return;
    }

    // Live Voice Call (/hovor)
    if (path === '/hovor' || path === '/hovor.html' || path === '/call' || path === '/sk/hovor') {
      const html = await readFile(join(ROOT_DIR, 'public', 'lovable-app', 'hovor.html'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(method === 'HEAD' ? undefined : html);
      return;
    }

    // Rodicia info (/rodicia)
    if (path === '/rodicia' || path === '/rodicia.html') {
      const html = await readFile(join(ROOT_DIR, 'public', 'lovable-app', 'rodicia.html'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(method === 'HEAD' ? undefined : html);
      return;
    }

    // IndexNow validation key
    if (path === '/c7e2b834918f4a1fa327e58914ba98de.txt') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('c7e2b834918f4a1fa327e58914ba98de');
      return;
    }

    // Sitemap & robots
    if (path === '/robots.txt') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end("User-agent: *\nAllow: /\nSitemap: https://vianocna-posta.onrender.com/sitemap.xml\n");
      return;
    }

    // Main Slovak Landing Page (ROOT `/`, `/sk`, `/vianocna-posta`)
    const html = await readFile(join(ROOT_DIR, 'public', 'lovable-app', 'index.html'), 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(method === 'HEAD' ? undefined : html);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Internal Server Error: ' + err.message);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Vianočná pošta beží na http://${HOST}:${PORT}`);
});
