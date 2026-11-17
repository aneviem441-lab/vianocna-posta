import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/server.js';

test('Santa English app routes /santa and /santa/call return 200 with English title', async () => {
  const { server } = createApp();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    const resHome = await fetch(`http://127.0.0.1:${port}/santa`);
    assert.equal(resHome.status, 200);
    const htmlHome = await resHome.text();
    assert.ok(htmlHome.includes("Santa's Direct North Pole Hotline"));
    assert.ok(htmlHome.includes("DH auto s.r.o."));

    const resCall = await fetch(`http://127.0.0.1:${port}/santa/call`);
    assert.equal(resCall.status, 200);
    const htmlCall = await resCall.text();
    assert.ok(htmlCall.includes("Live Call with Santa Claus"));
    assert.ok(htmlCall.includes("Download Official Certificate (PNG)"));
    assert.ok(htmlCall.includes("North Pole Nice List"));

    const resScript = await fetch(`http://127.0.0.1:${port}/santa/js/santa-core.min.js`);
    assert.equal(resScript.status, 200);
    assert.equal(resScript.headers.get('content-type'), 'application/javascript; charset=utf-8');
    const scriptContent = await resScript.text();
    assert.ok(scriptContent.includes('SantaVoice'));
    assert.ok(scriptContent.includes('SantaAudio'));

    const resCallScript = await fetch(`http://127.0.0.1:${port}/santa/js/call.min.js`);
    assert.equal(resCallScript.status, 200);
  } finally {
    server.close();
  }
});
