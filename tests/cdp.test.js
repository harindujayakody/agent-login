const test = require('node:test');
const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');
const { createPipeTransport, attachOverrides } = require('../src/cdp');

function pair() {
  // writeStream: what the transport writes (browser's fd 3).
  // readStream: what the transport reads (browser's fd 4).
  return { writeStream: new PassThrough(), readStream: new PassThrough() };
}

test('createPipeTransport: parses NUL-delimited JSON frames', async () => {
  const { writeStream, readStream } = pair();
  const transport = createPipeTransport(writeStream, readStream);
  const seen = [];
  transport.onMessage((m) => seen.push(m));
  readStream.write(JSON.stringify({ id: 1, result: {} }) + '\0');
  readStream.write(JSON.stringify({ id: 2, method: 'Target.attachedToTarget' }) + '\0');
  await new Promise((r) => setImmediate(r));
  assert.equal(seen.length, 2);
  assert.equal(seen[0].id, 1);
  assert.equal(seen[1].method, 'Target.attachedToTarget');
});

test('createPipeTransport: handles a frame split across chunks', async () => {
  const { writeStream, readStream } = pair();
  const transport = createPipeTransport(writeStream, readStream);
  const seen = [];
  transport.onMessage((m) => seen.push(m));
  const frame = JSON.stringify({ id: 7, result: { ok: true } }) + '\0';
  readStream.write(frame.slice(0, 10));
  readStream.write(frame.slice(10));
  await new Promise((r) => setImmediate(r));
  assert.equal(seen.length, 1);
  assert.equal(seen[0].id, 7);
});

test('createPipeTransport: skips malformed frames without breaking the pipe', async () => {
  const { writeStream, readStream } = pair();
  const transport = createPipeTransport(writeStream, readStream);
  const seen = [];
  transport.onMessage((m) => seen.push(m));
  readStream.write('not-json\0' + JSON.stringify({ id: 3 }) + '\0');
  await new Promise((r) => setImmediate(r));
  assert.equal(seen.length, 1);
  assert.equal(seen[0].id, 3);
});

test('createPipeTransport: send writes NUL-terminated JSON', async () => {
  const { writeStream, readStream } = pair();
  const transport = createPipeTransport(writeStream, readStream);
  const chunks = [];
  writeStream.on('data', (d) => chunks.push(d));
  transport.send({ id: 1, method: 'Browser.getVersion' });
  await new Promise((r) => setImmediate(r));
  const raw = Buffer.concat(chunks).toString('utf8');
  assert.ok(raw.endsWith('\0'));
  assert.deepEqual(JSON.parse(raw.slice(0, -1)), { id: 1, method: 'Browser.getVersion' });
});

test('attachOverrides: rejects when pipe streams are missing', async () => {
  await assert.rejects(() => attachOverrides(null, null, { timezone: 'Asia/Colombo' }));
});

test('attachOverrides: sends timezone override on Target.attachedToTarget', async () => {
  const { writeStream, readStream } = pair();
  const out = [];
  writeStream.on('data', (d) => out.push(d.toString('utf8')));
  await attachOverrides(writeStream, readStream, {
    timezone: 'Asia/Colombo',
    startUrl: 'https://example.com',
  });
  // Initial auto-attach on the browser target.
  assert.ok(out.join('').includes('Target.setAutoAttach'));
  // Simulate a page target attaching.
  readStream.write(
    JSON.stringify({
      method: 'Target.attachedToTarget',
      params: { sessionId: 's1', targetInfo: { type: 'page' } },
    }) + '\0',
  );
  await new Promise((r) => setImmediate(r));
  const sent = out.join('');
  assert.ok(sent.includes('Emulation.setTimezoneOverride'));
  assert.ok(sent.includes('Asia/Colombo'));
  assert.ok(sent.includes('Page.navigate'));
  assert.ok(sent.includes('https://example.com'));
});
