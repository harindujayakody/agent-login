const test = require('node:test');
const assert = require('node:assert/strict');
const { buildArgs } = require('../src/launcher');

test('buildArgs: timezone profile uses --remote-debugging-pipe, never a port', () => {
  const args = buildArgs({ timezone: 'Asia/Colombo', startUrl: 'https://example.com' }, '/tmp/x');
  assert.ok(args.includes('--remote-debugging-pipe'));
  assert.ok(!args.some((a) => a.includes('remote-debugging-port')));
  assert.ok(args.includes('about:blank'));
});

test('buildArgs: profile without timezone opens no DevTools channel', () => {
  const args = buildArgs({ startUrl: 'https://example.com' }, '/tmp/x');
  assert.ok(!args.includes('--remote-debugging-pipe'));
  assert.ok(!args.some((a) => a.includes('remote-debugging-port')));
  assert.ok(args.includes('https://example.com'));
});

test('buildArgs: proxy without credentials is passed through as --proxy-server', () => {
  const args = buildArgs(
    { proxy: { type: 'socks5', host: '127.0.0.1', port: 1080 } },
    '/tmp/x',
  );
  assert.ok(args.includes('--proxy-server=socks5://127.0.0.1:1080'));
});

test('buildArgs: proxy with missing host/port adds no proxy flag', () => {
  const args = buildArgs({ proxy: { type: 'http', host: '', port: 0 } }, '/tmp/x');
  assert.ok(!args.some((a) => a.startsWith('--proxy-server')));
});

test('buildArgs: always isolates the profile data dir and blocks WebRTC leaks', () => {
  const args = buildArgs({}, '/tmp/profiles/abc');
  assert.ok(args.includes('--user-data-dir=/tmp/profiles/abc'));
  assert.ok(args.includes('--force-webrtc-ip-handling-policy=disable_non_proxied_udp'));
});
