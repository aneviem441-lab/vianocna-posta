import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/server.js';
import { JsonLedgerStore } from '../src/storage/jsonStore.js';

async function startAuthServer() {
  const store = new JsonLedgerStore(null);
  const { server } = createApp({
    store,
    config: {
      port: 0,
      processorMode: 'simulator',
      defaultCurrency: 'EUR',
      holdTtlDays: 7,
      viewerApiKey: 'key-viewer-1',
      operatorApiKey: 'key-operator-2',
      adminApiKey: 'key-admin-3'
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

test('API Key RBAC enforces viewer/operator/admin roles and exports CSV/XML', async () => {
  const { server, baseUrl } = await startAuthServer();
  try {
    // 1. Unauthenticated request to /api/preauths returns 401
    const unauth = await fetch(`${baseUrl}/api/preauths`);
    assert.equal(unauth.status, 401);

    // 2. Viewer cannot create a pre-auth (403)
    const viewerCreate = await fetch(`${baseUrl}/api/preauths`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'key-viewer-1' },
      body: JSON.stringify({ amount: 300, currency: 'EUR', reference: 'ERP-001' })
    });
    assert.equal(viewerCreate.status, 403);

    // 3. Operator creates pre-auth (201) and actor is recorded in auditLog
    const opCreate = await fetch(`${baseUrl}/api/preauths`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'key-operator-2' },
      body: JSON.stringify({
        amount: 300,
        currency: 'EUR',
        reference: 'ERP-001',
        customerLabel: 'Kovovýroba, s.r.o.'
      })
    });
    assert.equal(opCreate.status, 201);
    const created = await opCreate.json();
    assert.equal(created.record.auditLog[0].actor, 'operator:operator-key');

    // 4. Operator cannot void (requires admin -> 403)
    const opVoid = await fetch(`${baseUrl}/api/preauths/${created.record.id}/void`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'key-operator-2' },
      body: '{}'
    });
    assert.equal(opVoid.status, 403);

    // 5. Viewer can export CSV (with proper quoting for comma in customerLabel) and XML
    const csvRes = await fetch(`${baseUrl}/api/export/csv`, {
      headers: { 'X-API-Key': 'key-viewer-1' }
    });
    assert.equal(csvRes.status, 200);
    const csvText = await csvRes.text();
    assert.ok(csvText.includes('approvalCode'));
    assert.ok(csvText.includes('"Kovovýroba, s.r.o."'));

    const xmlRes = await fetch(`${baseUrl}/api/export/xml`, {
      headers: { 'X-API-Key': 'key-viewer-1' }
    });
    assert.equal(xmlRes.status, 200);
    const xmlText = await xmlRes.text();
    assert.ok(xmlText.includes('<PreAuthBatchExport'));
    assert.ok(xmlText.includes(`<approvalCode>${created.record.approvalCode}</approvalCode>`));

    // 6. Admin can void (200)
    const adminVoid = await fetch(`${baseUrl}/api/preauths/${created.record.id}/void`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'key-admin-3' },
      body: '{}'
    });
    assert.equal(adminVoid.status, 200);
  } finally {
    server.close();
  }
});
