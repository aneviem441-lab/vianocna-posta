import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { dirname, join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PayPalAdapter } from './adapters/paypalAdapter.js';
import { SimulatorAdapter } from './adapters/simulatorAdapter.js';
import { StripeAdapter } from './adapters/stripeAdapter.js';
import { ApiAuthenticator } from './auth/apiAuth.js';
import { loadConfig } from './config.js';
import { DomainError } from './domain/errors.js';
import { PreAuthService } from './domain/preauthService.js';
import { exportToCsv, exportToXml } from './export/erpExport.js';
import { JsonLedgerStore } from './storage/jsonStore.js';
import { LeadStore } from './storage/leadStore.js';
import { PayPalStore } from './storage/paypalStore.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, '..');

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

async function readJsonBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > 2 * 1024 * 1024) {
      throw new DomainError('Request payload too large', 413, 'PAYLOAD_TOO_LARGE');
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new DomainError('Invalid JSON request body', 400, 'INVALID_JSON');
  }
}

export function createApp(options = {}) {
  const config = options.config || loadConfig(ROOT_DIR);
  const store =
    options.store ||
    new JsonLedgerStore(options.ledgerPath !== undefined ? options.ledgerPath : join(ROOT_DIR, 'data', 'ledger.json'));

  const leadStore =
    options.leadStore ||
    new LeadStore(options.leadsPath !== undefined ? options.leadsPath : join(ROOT_DIR, 'data', 'leads.json'));

  const paypalStore =
    options.paypalStore ||
    new PayPalStore(
      options.paypalEventsPath !== undefined ? options.paypalEventsPath : join(ROOT_DIR, 'data', 'paypal_events.json')
    );

  const paypalSandbox = new PayPalAdapter({
    clientId: config.paypalClientId,
    clientSecret: config.paypalClientSecret,
    sandbox: true,
    returnUrl: config.paypalReturnUrl,
    cancelUrl: config.paypalCancelUrl,
    fetchImpl: options.fetchImpl
  });

  const paypalLive = new PayPalAdapter({
    clientId: config.paypalClientId,
    clientSecret: config.paypalClientSecret,
    sandbox: false,
    returnUrl: config.paypalReturnUrl,
    cancelUrl: config.paypalCancelUrl,
    fetchImpl: options.fetchImpl
  });

  const stripe = new StripeAdapter({
    secretKey: config.stripeSecretKey,
    holdTtlDays: config.holdTtlDays,
    fetchImpl: options.fetchImpl
  });

  const adapters = {
    simulator: new SimulatorAdapter({ holdTtlDays: config.holdTtlDays }),
    paypal_sandbox: paypalSandbox,
    paypal_live: paypalLive,
    stripe
  };

  const auth = options.auth || ApiAuthenticator.fromConfig(config);

  const service = new PreAuthService({
    store,
    adapters,
    defaultProcessor: config.processorMode,
    defaultCurrency: config.defaultCurrency
  });

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      const path = url.pathname;
      const method = req.method || 'GET';

      if (method === 'GET' && (path === '/' || path === '/index.html')) {
        const html = await readFile(join(ROOT_DIR, 'public', 'index.html'), 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
      }

      if (method === 'GET' && (path === '/santa' || path === '/santa/' || path === '/santa/index.html' || path === '/us' || path === '/us/' || path === '/en' || path === '/en/')) {
        const html = await readFile(join(ROOT_DIR, 'public', 'santa', 'index.html'), 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
      }

      if (method === 'GET' && (path === '/sk' || path === '/sk/' || path === '/sk/index.html' || path === '/vianocna-posta' || path === '/vianocna-posta/')) {
        const html = await readFile(join(ROOT_DIR, 'public', 'santa', 'sk.html'), 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
      }

      if (method === 'GET' && (path === '/santa/call' || path === '/santa/call.html' || path === '/us/call' || path === '/en/call')) {
        const html = await readFile(join(ROOT_DIR, 'public', 'santa', 'call.html'), 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
      }

      if (method === 'GET' && (path === '/sk/hovor' || path === '/sk/hovor.html' || path === '/hovor' || path === '/hovor.html' || path === '/santa/call-sk.html')) {
        const html = await readFile(join(ROOT_DIR, 'public', 'santa', 'call-sk.html'), 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
      }

      if (method === 'GET' && path.startsWith('/santa/js/')) {
        const fileName = decodeURIComponent(path.replace('/santa/js/', ''));
        const safeFile = join(ROOT_DIR, 'public', 'santa', 'js', fileName);
        if (resolve(safeFile).startsWith(join(ROOT_DIR, 'public', 'santa', 'js'))) {
          try {
            const fileData = await readFile(safeFile);
            res.writeHead(200, {
              'Content-Type': 'application/javascript; charset=utf-8',
              'X-Content-Type-Options': 'nosniff',
              'Cache-Control': 'public, max-age=3600'
            });
            res.end(fileData);
            return;
          } catch {
            sendJson(res, 404, { error: 'Script not found', code: 'SCRIPT_NOT_FOUND' });
            return;
          }
        }
      }

      if (method === 'GET' && (path.startsWith('/santa/assets/') || path.startsWith('/santa/assets-sk/'))) {
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
            const rangeHeader = req.headers['range'];

            // Handle HTTP Range requests (crucial for iOS Safari and mobile media playback)
            if (rangeHeader && (ext === '.mp3' || ext === '.m4a' || ext === '.webm' || ext === '.mp4')) {
              const parts = rangeHeader.replace(/bytes=/, '').split('-');
              const start = parseInt(parts[0], 10);
              const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

              if (start >= totalSize || end >= totalSize || start > end) {
                res.writeHead(416, { 'Content-Range': `bytes */${totalSize}` });
                res.end();
                return;
              }

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
            sendJson(res, 404, { error: 'Asset not found', code: 'ASSET_NOT_FOUND' });
            return;
          }
        }
      }

      if (method === 'GET' && path === '/api/health') {
        sendJson(res, 200, {
          ok: true,
          defaultProcessor: config.processorMode,
          defaultCurrency: config.defaultCurrency,
          paypalConfigured: paypalSandbox.isConfigured(),
          stripeConfigured: stripe.isConfigured(),
          authEnabled: auth.enabled,
          availableProcessors: Object.keys(adapters)
        });
        return;
      }

      if (method === 'GET' && path === '/api/summary') {
        auth.authenticate(req, 'viewer');
        sendJson(res, 200, await service.getSummary());
        return;
      }

      if (method === 'GET' && path === '/api/preauths') {
        auth.authenticate(req, 'viewer');
        const status = url.searchParams.get('status') || undefined;
        const q = url.searchParams.get('q') || undefined;
        const items = await service.listPreAuths({ status, q });
        sendJson(res, 200, { items });
        return;
      }

      if (method === 'GET' && path === '/api/preauths/lookup') {
        auth.authenticate(req, 'viewer');
        const code = url.searchParams.get('code') || '';
        const record = await service.lookup(code);
        sendJson(res, 200, { record });
        return;
      }

      if (method === 'GET' && (path === '/api/export/csv' || path === '/api/export/xml')) {
        auth.authenticate(req, 'viewer');
        const status = url.searchParams.get('status') || undefined;
        const q = url.searchParams.get('q') || undefined;
        const items = await service.listPreAuths({ status, q });
        if (path === '/api/export/csv') {
          const csv = exportToCsv(items);
          res.writeHead(200, {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="preauth-export.csv"'
          });
          res.end(csv);
        } else {
          const xml = exportToXml(items);
          res.writeHead(200, {
            'Content-Type': 'application/xml; charset=utf-8',
            'Content-Disposition': 'attachment; filename="preauth-export.xml"'
          });
          res.end(xml);
        }
        return;
      }

      if (method === 'POST' && path === '/api/preauths') {
        const { actor } = auth.authenticate(req, 'operator');
        const body = await readJsonBody(req);
        const headerIdemp = req.headers['idempotency-key'];
        if (headerIdemp && !body.idempotencyKey) {
          body.idempotencyKey = String(headerIdemp);
        }
        const result = await service.createPreAuth({ ...body, actor });
        sendJson(res, result.replayed ? 200 : 201, result);
        return;
      }

      if (method === 'POST' && path === '/api/preauths/batch') {
        const { actor } = auth.authenticate(req, 'admin');
        const body = await readJsonBody(req);
        const result = await service.batchCreatePreAuth(body.items, { actor });
        sendJson(res, 200, result);
        return;
      }

      if (method === 'POST' && path === '/api/preauths/batch-capture') {
        const { actor } = auth.authenticate(req, 'admin');
        const body = await readJsonBody(req);
        const result = await service.batchCapture(body.items, { actor });
        sendJson(res, 200, result);
        return;
      }

      if (method === 'GET' && path === '/api/leads') {
        auth.authenticate(req, 'viewer');
        const items = await leadStore.list();
        sendJson(res, 200, { items });
        return;
      }

      if (method === 'POST' && (path === '/api/leads' || path === '/api/contact')) {
        const body = await readJsonBody(req);
        if (path === '/api/contact' && !body.source) body.source = 'contact_form';
        const lead = await leadStore.create(body);
        sendJson(res, 201, { ok: true, lead });
        return;
      }

      const leadReplyMatch = path.match(/^\/api\/leads\/([^/]+)\/reply$/);
      if (method === 'POST' && leadReplyMatch) {
        auth.authenticate(req, 'operator');
        const id = decodeURIComponent(leadReplyMatch[1]);
        const body = await readJsonBody(req);
        const lead = await leadStore.updateStatus(id, {
          reply: body.reply || '',
          status: body.status || 'CONTACTED'
        });
        sendJson(res, 200, { ok: true, lead });
        return;
      }

      const leadPatchMatch = path.match(/^\/api\/leads\/([^/]+)$/);
      if (method === 'PATCH' && leadPatchMatch) {
        auth.authenticate(req, 'operator');
        const id = decodeURIComponent(leadPatchMatch[1]);
        const body = await readJsonBody(req);
        const lead = await leadStore.updateStatus(id, body);
        sendJson(res, 200, { lead });
        return;
      }

      if (method === 'GET' && path === '/api/paypal/events') {
        auth.authenticate(req, 'viewer');
        const limit = Number(url.searchParams.get('limit') || 50);
        const events = await paypalStore.list({ limit });
        sendJson(res, 200, { events });
        return;
      }

      if (method === 'POST' && path === '/api/webhooks/paypal') {
        const body = await readJsonBody(req);
        const event = await paypalStore.recordEvent(body);
        sendJson(res, 200, { ok: true, eventId: event.id });
        return;
      }

      if (method === 'GET' && path === '/api/paypal/transactions') {
        auth.authenticate(req, 'viewer');
        const activeAdapter = config.processorMode.startsWith('paypal')
          ? adapters[config.processorMode]
          : paypalLive.isConfigured()
            ? paypalLive
            : paypalSandbox;

        if (!activeAdapter.isConfigured()) {
          const events = await paypalStore.list({ limit: 50 });
          sendJson(res, 200, {
            configured: false,
            message: 'PayPal credentials not set in local environment; returning stored events',
            transactions: [],
            events
          });
          return;
        }

        const startDate = url.searchParams.get('start_date') || undefined;
        const endDate = url.searchParams.get('end_date') || undefined;
        const result = await activeAdapter.listTransactions({ startDate, endDate });
        const events = await paypalStore.list({ limit: 50 });
        sendJson(res, 200, {
          configured: true,
          processor: activeAdapter.name,
          paypalReport: result,
          storedEvents: events
        });
        return;
      }

      const actionMatch = path.match(/^\/api\/preauths\/([^/]+)\/(authorize|capture|reauthorize|void)$/);
      if (method === 'POST' && actionMatch) {
        const idOrCode = decodeURIComponent(actionMatch[1]);
        const action = actionMatch[2];
        const { actor } = auth.authenticate(req, action === 'void' ? 'admin' : 'operator');
        const body = await readJsonBody(req);
        let record;
        if (action === 'authorize') {
          record = await service.authorizeOrder(idOrCode, { ...body, actor });
        } else if (action === 'capture') {
          record = await service.capturePreAuth(idOrCode, { ...body, actor });
        } else if (action === 'reauthorize') {
          record = await service.reauthorizePreAuth(idOrCode, { ...body, actor });
        } else {
          record = await service.voidPreAuth(idOrCode, { ...body, actor });
        }
        sendJson(res, 200, { record });
        return;
      }

      sendJson(res, 404, { error: 'Not found', code: 'NOT_FOUND' });
    } catch (err) {
      const statusCode = err instanceof DomainError ? err.statusCode : 500;
      const code = err instanceof DomainError ? err.code : 'INTERNAL_ERROR';
      sendJson(res, statusCode, { error: err.message || 'Internal server error', code });
    }
  });

  return { server, service, config, auth, leadStore, paypalStore };
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const { server, config } = createApp();
  const host = process.env.HOST || '127.0.0.1';
  server.listen(config.port, host, () => {
    console.log(`Pre-Auth Terminal listening on http://${host}:${config.port} (mode=${config.processorMode})`);
  });
}
