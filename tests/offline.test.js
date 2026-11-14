import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';

function worker() {
  const handlers = {}, entries = new Map();
  const base = 'https://example.test/project/';
  const key = value => new URL(typeof value === 'string' ? value : value.url, base).href;
  let fetches = 0, online = true, version = '4.1.2', failAdd = false;
  const runtimeEntries = new Map();
  const cache = {
    async addAll(requests) {
      for (const r of requests) assert.equal(r.cache, 'reload');
      if (failAdd || !online) throw Error('download failed');
      for (const r of requests) entries.set(key(r), new Response('cached:' + key(r)));
    },
    async match(req) { return entries.get(key(req))?.clone(); },
    async put(req, response) { entries.set(key(req), response); },
  };
  const context = {
    URL, Response, AbortController, setTimeout, clearTimeout, Request: class { constructor(url, options) { this.url = key(url); this.cache = options.cache; } },
    self: { location: new URL(base), addEventListener(type, fn) { handlers[type] = fn; }, skipWaiting: async () => {}, clients: { claim: async () => {} } },
    caches: { open: async name => name.endsWith('-runtime') ? { match: async req => runtimeEntries.get(key(req))?.clone(), put: async (req, res) => { runtimeEntries.set(key(req), res); } } : cache, keys: async () => [], delete: async () => {} },
    fetch: async req => { fetches++; if (!online) throw Error('offline'); if (key(req).endsWith('/app-version.json')) return Response.json({ version }); return new Response('network'); },
  };
  vm.runInNewContext(readFileSync('sw.js', 'utf8'), context);
  return { handlers, entries, runtimeEntries, key, setOnline: v => { online = v; }, setVersion: v => { version = v; }, setFailAdd: v => { failAdd = v; }, fetches: () => fetches };
}
async function event(handlers, name, obj = {}) { let promise; handlers[name]({ ...obj, waitUntil: p => { promise = p; }, respondWith: p => { promise = p; } }); return promise; }

test('precache covers files, uses reload, and offline fetch works under a subpath', async () => {
  const w = worker(); await event(w.handlers, 'install');
  for (const url of w.entries.keys()) {
    const p = new URL(url).pathname.replace('/project/', '') || 'index.html';
    assert.ok(existsSync(p), `missing ${p}`);
  }
  w.setOnline(false);
  for (const file of ['','src/main.js?v=4.1.2','src/ui/views/history.js','assets/icons/icon-192.png','offline.html']) {
    const response = await event(w.handlers, 'fetch', { request: { method:'GET', url: w.key(file), mode: file === '' ? 'navigate' : 'same-origin' } });
    assert.equal(response.ok, true, file);
  }
  const response = await event(w.handlers, 'fetch', { request: { method:'GET', url: w.key('missing.js'), mode:'same-origin' } });
  assert.equal(response.type, 'error');
});

test('network-first code, cache-first icons and status detects missing files', async () => {
  const w = worker(); await event(w.handlers, 'install');
  const request = file => ({ method:'GET', url:w.key(file), mode:'same-origin' });
  assert.equal(await (await event(w.handlers, 'fetch', { request:request('src/main.js?v=4.1.2') })).text(), 'network');
  const count = w.fetches();
  await event(w.handlers, 'fetch', { request:request('assets/icons/icon-192.png') });
  assert.equal(w.fetches(), count);
  w.entries.delete(w.key('offline.html'));
  let result;
  await event(w.handlers, 'message', { data:{ type:'OFFLINE_STATUS' }, ports:[{ postMessage: value => { result = value; } }] });
  assert.ok(result.missing.includes('./offline.html'));
});

test('shell includes every static module dependency and index reference', async () => {
  const w = worker(); await event(w.handlers, 'install');
  const index = readFileSync('index.html', 'utf8');
  for (const match of index.matchAll(/(?:src|href)="(\.\/[^\"]+)"/g)) {
    assert.ok(w.entries.has(w.key(match[1])), `index reference absent: ${match[1]}`);
  }
  const seen = new Set();
  function modules(file) {
    if (seen.has(file)) return;
    seen.add(file);
    const src = readFileSync(file, 'utf8');
    for (const match of src.matchAll(/(?:import|export)\s[^'"]*?from\s+['"](\.[^'"]+)['"]/g)) {
      const target = new URL(match[1], w.key(file)).pathname.replace('/project/', '');
      assert.ok(w.entries.has(w.key(target)), `module absent: ${target}`);
      modules(target);
    }
  }
  modules('src/main.js'); modules('js/offline.js');
});

async function message(w, type, version = '4.1.2') {
  let result;
  await event(w.handlers, 'message', { data: { type, version }, ports: [{ postMessage: value => { result = value; } }] });
  return result;
}

test('repair fills missing files without deleting cached shell', async () => {
  const w = worker(); await event(w.handlers, 'install');
  w.entries.delete(w.key('offline.html'));
  const original = await w.entries.get(w.key('src/core/store.js')).clone().text();
  assert.ok((await message(w, 'OFFLINE_STATUS')).missing.includes('./offline.html'));
  const result = await message(w, 'OFFLINE_REPAIR');
  assert.equal(result.missing.length, 0);
  assert.equal(await w.entries.get(w.key('src/core/store.js')).clone().text(), original);
});

test('repair fails safely offline or on download failure, and succeeds on retry', async () => {
  const w = worker(); await event(w.handlers, 'install');
  w.entries.delete(w.key('offline.html'));
  w.setOnline(false);
  assert.equal((await message(w, 'OFFLINE_REPAIR')).error, 'repair_failed');
  assert.ok((await message(w, 'OFFLINE_STATUS')).missing.includes('./offline.html'));
  w.setOnline(true); w.setFailAdd(true);
  assert.equal((await message(w, 'OFFLINE_REPAIR')).error, 'repair_failed');
  assert.ok((await message(w, 'OFFLINE_STATUS')).missing.includes('./offline.html'));
  w.setFailAdd(false);
  assert.equal((await message(w, 'OFFLINE_REPAIR')).missing.length, 0);
});

test('repair refuses mismatched server or client versions', async () => {
  const w = worker(); await event(w.handlers, 'install');
  w.entries.delete(w.key('offline.html'));
  w.setVersion('4.2.0');
  assert.equal((await message(w, 'OFFLINE_REPAIR')).error, 'version');
  w.setVersion('4.1.2');
  assert.equal((await message(w, 'OFFLINE_REPAIR', '4.1.0')).error, 'version');
  assert.ok((await message(w, 'OFFLINE_STATUS')).missing.includes('./offline.html'));
});


test('network responses cannot overwrite the offline shell; offline navigation and code stay coherent', async () => {
  const w = worker(); await event(w.handlers, 'install');
  const req = (file, mode = 'same-origin') => ({ method: 'GET', url: w.key(file), mode });
  for (const file of ['', 'src/main.js?v=4.1.2', 'src/ui/app.js', 'src/styles/app.css?v=4.1.2']) {
    assert.equal(await (await event(w.handlers, 'fetch', { request: req(file, file === '' ? 'navigate' : 'same-origin') })).text(), 'network');
  }
  w.setOnline(false);
  for (const file of ['', 'src/main.js?v=4.1.2', 'src/ui/app.js', 'src/styles/app.css?v=4.1.2']) {
    const response = await event(w.handlers, 'fetch', { request: req(file, file === '' ? 'navigate' : 'same-origin') });
    assert.match(await response.text(), /^cached:/);
  }
});

test('navigation falls back to offline page only when the shell index is missing', async () => {
  const w = worker(); await event(w.handlers, 'install');
  w.entries.delete(w.key('')); w.entries.delete(w.key('index.html')); w.setOnline(false);
  const response = await event(w.handlers, 'fetch', { request: { method:'GET', url:w.key(''), mode:'navigate' } });
  assert.match(await response.text(), /offline.html/);
});
