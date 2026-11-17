import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/server.js';
import { JsonLedgerStore } from '../src/storage/jsonStore.js';
import { LeadStore } from '../src/storage/leadStore.js';

test('public quote/lead intake works while lead listing and status updates enforce RBAC', async () => {
  const { server } = createApp({
    store: new JsonLedgerStore(null),
    leadStore: new LeadStore(null),
    config: {
      port: 0,
      processorMode: 'simulator',
      defaultCurrency: 'EUR',
      holdTtlDays: 7,
      viewerApiKey: 'v-key',
      operatorApiKey: 'o-key',
      adminApiKey: 'a-key'
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Public prospect submits quote request without API key
    const submitRes = await fetch(`${baseUrl}/api/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Peter Kováč',
        company: 'RentCar SK s.r.o.',
        email: 'peter@rentcarsk.sk',
        monthlyVolume: '40000 EUR',
        notes: 'Potrebujeme blokácie kaucie a CSV export.'
      })
    });
    assert.equal(submitRes.status, 201);
    const created = await submitRes.json();
    assert.equal(created.lead.status, 'NEW');

    // 2. Unauthenticated user cannot list leads
    const unauthList = await fetch(`${baseUrl}/api/leads`);
    assert.equal(unauthList.status, 401);

    // 3. Viewer can list leads
    const viewerList = await fetch(`${baseUrl}/api/leads`, {
      headers: { 'X-API-Key': 'v-key' }
    });
    assert.equal(viewerList.status, 200);
    const listed = await viewerList.json();
    assert.equal(listed.items.length, 1);
    assert.equal(listed.items[0].email, 'peter@rentcarsk.sk');

    // 4. Operator updates lead status to DEMO_SCHEDULED
    const patchRes = await fetch(`${baseUrl}/api/leads/${created.lead.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'o-key' },
      body: JSON.stringify({ status: 'DEMO_SCHEDULED' })
    });
    assert.equal(patchRes.status, 200);
    const patched = await patchRes.json();
    assert.equal(patched.lead.status, 'DEMO_SCHEDULED');

    // 5. Public contact inquiry endpoint works and records reply
    const contactRes = await fetch(`${baseUrl}/api/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Michal Investor',
        company: 'Venture Capital Fund',
        email: 'michal@investor.com',
        type: 'contact_msg',
        message: 'Máme záujem o seed kolo 150k EUR.'
      })
    });
    assert.equal(contactRes.status, 201);
    const contactData = await contactRes.json();
    assert.equal(contactData.lead.type, 'contact_msg');

    // Operator replies to contact inquiry
    const replyRes = await fetch(`${baseUrl}/api/leads/${contactData.lead.id}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'o-key' },
      body: JSON.stringify({
        reply: 'Dobrý deň, radi vám pošleme investičný teaser a term sheet.',
        status: 'CONTACTED'
      })
    });
    assert.equal(replyRes.status, 200);
    const repliedData = await replyRes.json();
    assert.equal(repliedData.lead.reply, 'Dobrý deň, radi vám pošleme investičný teaser a term sheet.');
    assert.equal(repliedData.lead.status, 'CONTACTED');
  } finally {
    server.close();
  }
});
