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

test('Santa Slovak app routes /sk, /vianocna-posta, /sk/hovor and /hovor return 200 with Slovak content', async () => {
  const { server } = createApp();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    const resSk = await fetch(`http://127.0.0.1:${port}/sk`);
    assert.equal(resSk.status, 200);
    const htmlSk = await resSk.text();
    assert.ok(htmlSk.includes("Vianočná pošta"));
    assert.ok(htmlSk.includes("DH auto s.r.o."));
    assert.ok(htmlSk.includes("Apple Pay"));
    assert.ok(htmlSk.includes("enable-funding=card,applepay,venmo"));
    assert.ok(htmlSk.includes("currency=EUR"));
    assert.ok(htmlSk.includes("4,99 €"));
    assert.ok(htmlSk.includes("5,99 €"));
    assert.ok(!htmlSk.includes("30 sekúnd zadarmo")); // 0 free preview

    const resVianocna = await fetch(`http://127.0.0.1:${port}/vianocna-posta`);
    assert.equal(resVianocna.status, 200);

    const resHovor = await fetch(`http://127.0.0.1:${port}/sk/hovor`);
    assert.equal(resHovor.status, 200);
    const htmlHovor = await resHovor.text();
    assert.ok(htmlHovor.includes("Živý hovor so Santom Clausom"));
    assert.ok(htmlHovor.includes("Prijať hovor od Santu"));
    assert.ok(htmlHovor.includes("Santa počul:"));
    assert.ok(htmlHovor.includes("Odomknúť a stiahnuť oficiálny diplom (1,00 €)"));
    assert.ok(htmlHovor.includes("santa-sk-q6-farewell-milk-cookie.mp3"));

    const resHovorAlias = await fetch(`http://127.0.0.1:${port}/hovor`);
    assert.equal(resHovorAlias.status, 200);

    // Test Slovak audio asset serving
    const resSkAudio = await fetch(`http://127.0.0.1:${port}/santa/assets-sk/santa-sk-q0-greeting.mp3`);
    assert.equal(resSkAudio.status, 200);
    assert.equal(resSkAudio.headers.get('content-type'), 'audio/mpeg');
    assert.equal(resSkAudio.headers.get('accept-ranges'), 'bytes');

    // Test Range request for mobile iOS/Android
    const resRangeSk = await fetch(`http://127.0.0.1:${port}/santa/assets-sk/santa-sk-q6-farewell-milk-cookie.mp3`, {
      headers: { Range: 'bytes=0-10' }
    });
    assert.equal(resRangeSk.status, 206);
    assert.equal(resRangeSk.headers.get('content-range'), 'bytes 0-10/176400');
  } finally {
    server.close();
  }
});
