const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Store } = require('../src/store');

function tmpStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-browser-test-'));
  return { store: new Store(dir), dir };
}

test('Store: save/list round-trip and proxy type validation', () => {
  const { store } = tmpStore();
  const p = store.saveProfile({
    name: 'Work',
    proxy: { type: 'bogus', host: 'proxy.example', port: 8080 },
  });
  assert.ok(p.id);
  assert.equal(p.proxy.type, 'none'); // Unknown types are rejected, not stored.
  assert.equal(store.listProfiles().length, 1);
  assert.equal(store.getProfile(p.id).name, 'Work');
});

test('Store: settings round-trip', () => {
  const { store } = tmpStore();
  store.saveSettings({ browserPath: 'C:\\Chrome\\chrome.exe' });
  assert.equal(store.getSettings().browserPath, 'C:\\Chrome\\chrome.exe');
});

test('Store: deleteProfile removes the profile and its data dir', () => {
  const { store, dir } = tmpStore();
  const p = store.saveProfile({ name: 'Temp' });
  assert.ok(fs.existsSync(path.join(dir, 'profiles', p.id)));
  store.deleteProfile(p.id);
  assert.equal(store.listProfiles().length, 0);
  assert.ok(!fs.existsSync(path.join(dir, 'profiles', p.id)));
});
