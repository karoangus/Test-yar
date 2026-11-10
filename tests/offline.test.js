import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';

function worker() {
  const handlers = {}, entries = new Map();
  const base = 'https://example.test/project/';
  const key = value => new URL(typeof value === 'string' ? value : value.url, base).href;
  const cache = {
    async addAll(requests) { for (const r of requests) { assert.equal(r.cache, 'reload'); entries.set(key(r), new Response('cached:' + key(r))); } },
    async match(req) { return entries.get(key(req))?.clone(); },
    async put(req, response) { entries.set(key(req), response); },
  };
  let fetches = 0, online = true;
  const context = {
    URL, Response, Request: class { constructor(url, options) { this.url = key(url); this.cache = options.cache; } },
    self: { location: new URL(base), addEventListener(type, fn) { handlers[type] = fn; }, skipWaiting: async () => {}, clients: { claim: async () => {} } },
    caches: { open: async () => cache, keys: async () => [], delete: async () => {} },
    fetch: async () => { fetches++; if (!online) throw Error('offline'); return new Response('network'); },
  };
  vm.runInNewContext(readFileSync('sw.js', 'utf8'), context);
  return { handlers, entries, key, setOnline: v => { online = v; }, fetches: () => fetches };
}
async function event(handlers, name, obj = {}) { let promise; handlers[name]({ ...obj, waitUntil: p => { promise = p; }, respondWith: p => { promise = p; } }); return promise; }

test('precache covers files, uses reload, and offline fetch works under a subpath', async () => {
  const w = worker(); await event(w.handlers, 'install');
  for (const url of w.entries.keys()) {
    const p = new URL(url).pathname.replace('/project/', '') || 'index.html';
    assert.ok(existsSync(p), `missing ${p}`);
  }
  w.setOnline(false);
  for (const file of ['','src/main.js?v=4.1.0','src/ui/views/history.js','assets/icons/icon-192.png','offline.html']) {
    const response = await event(w.handlers, 'fetch', { request: { method:'GET', url: w.key(file), mode: file === '' ? 'navigate' : 'same-origin' } });
    assert.equal(response.ok, true, file);
  }
  const response = await event(w.handlers, 'fetch', { request: { method:'GET', url: w.key('missing.js'), mode:'same-origin' } });
  assert.equal(response.type, 'error');
});

test('network-first code, cache-first icons and status detects missing files', async () => {
  const w = worker(); await event(w.handlers, 'install');
  const request = file => ({ method:'GET', url:w.key(file), mode:'same-origin' });
  assert.equal(await (await event(w.handlers, 'fetch', { request:request('src/main.js?v=4.1.0') })).text(), 'network');
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
