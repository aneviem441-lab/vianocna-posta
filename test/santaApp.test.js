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
    assert.ok(htmlHome.includes("snowCanvas"));
    assert.ok(htmlHome.includes("playAudioPreview"));
    assert.ok(!htmlHome.includes("tryFreeTestBtn")); // 0 free access
    assert.ok(htmlHome.includes("DH auto s.r.o."));

    const resCall = await fetch(`http://127.0.0.1:${port}/santa/call`);
    assert.equal(resCall.status, 200);
    const htmlCall = await resCall.text();
    assert.ok(htmlCall.includes("Live Call with Santa Claus"));
    assert.ok(htmlCall.includes("Download Official Certificate (PNG)"));
    assert.ok(htmlCall.includes("Unlock Official Printable Diploma"));
    assert.ok(htmlCall.includes("North Pole Nice List"));
    assert.ok(htmlCall.includes("playSantaAudio"));

    const resMp3 = await fetch(`http://127.0.0.1:${port}/santa/assets/santa-ho-ho-ho.mp3`);
    assert.equal(resMp3.status, 200);
    assert.equal(resMp3.headers.get('content-type'), 'audio/mpeg');
    assert.equal(resMp3.headers.get('accept-ranges'), 'bytes');

    const resRange = await fetch(`http://127.0.0.1:${port}/santa/assets/santa-ho-ho-ho.mp3`, {
      headers: { Range: 'bytes=0-1' }
    });
    assert.equal(resRange.status, 206);
    assert.equal(resRange.headers.get('content-range'), 'bytes 0-1/109130');

    const resFarewell = await fetch(`http://127.0.0.1:${port}/santa/assets/santa-call-q6-farewell-milk-cookie.mp3`);
    assert.equal(resFarewell.status, 200);
    assert.equal(resFarewell.headers.get('content-type'), 'audio/mpeg');
    assert.equal(resFarewell.headers.get('accept-ranges'), 'bytes');

    const resM4a = await fetch(`http://127.0.0.1:${port}/santa/assets/santa-ho-ho-ho.m4a`);
    assert.equal(resM4a.status, 200);
    assert.equal(resM4a.headers.get('content-type'), 'audio/mp4');

    const resWebm = await fetch(`http://127.0.0.1:${port}/santa/assets/santa-ho-ho-ho.webm`);
    assert.equal(resWebm.status, 200);
    assert.equal(resWebm.headers.get('content-type'), 'audio/webm');
  } finally {
    server.close();
  }
});
