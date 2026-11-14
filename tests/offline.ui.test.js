import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html lang="fa"><body><div id="offlineBanner"></div><div id="app"><header class="app-header"></header></div><section id="offline-settings"></section></body></html>', { url: 'https://example.test/project/' });
global.window = dom.window;
global.document = dom.window.document;
global.Node = dom.window.Node;
global.MutationObserver = dom.window.MutationObserver;
global.localStorage = dom.window.localStorage;
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
window.matchMedia = () => ({ matches: false });
let result = { version: '4.1.2', missing: ['./offline.html'] };
let repairResult = { version: '4.1.2', missing: [] };
const calls = [];
Object.defineProperty(navigator, 'serviceWorker', { value: {
  controller: { postMessage(data, ports) { calls.push(data.type); ports[0].postMessage(data.type === 'OFFLINE_REPAIR' ? repairResult : result); } },
  register: async () => ({}), ready: Promise.resolve({}), addEventListener() {},
} });
Object.defineProperty(navigator, 'storage', { value: { persist: async () => true, persisted: async () => true } });
await import('../js/offline.js');
const toastText = () => [...document.querySelectorAll('.toast-text')].at(-1)?.textContent;
const settle = () => new Promise(resolve => setTimeout(resolve, 40));

test('save repairs missing cache and shows success', async () => {
  assert.equal(await window.lpEnsureOfflineReady(), true);
  assert.deepEqual(calls.slice(-2), ['OFFLINE_STATUS', 'OFFLINE_REPAIR']);
  assert.match(toastText(), /آماده‌اند/);
  assert.equal(localStorage.getItem('testyar.storage.persisted'), 'true');
});

test('version mismatch is reported and does not try repair', async () => {
  result = { version: '4.1.0', missing: [] };
  const before = calls.length;
  assert.equal(await window.lpEnsureOfflineReady(), false);
  assert.deepEqual(calls.slice(before), ['OFFLINE_STATUS']);
  assert.match(toastText(), /نسخهٔ صفحه/);
});

test('test button reports incomplete cache and save reports failed repair', async () => {
  result = { version: '4.1.2', missing: ['./offline.html'] };
  repairResult = { version: '4.1.2', error: 'repair_failed' };
  document.getElementById('test-offline').click(); await settle();
  assert.match(toastText(), /ناقص‌اند/);
  assert.equal(await window.lpEnsureOfflineReady(), false);
  assert.match(toastText(), /کامل نشد/);
  assert.equal(document.getElementById('save-offline').disabled, false);
});

test('offline and online events update the banner and announce changes', async () => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
  window.dispatchEvent(new window.Event('offline'));
  assert.equal(document.getElementById('offlineBanner').hidden, false);
  assert.equal(document.getElementById('offlineBadge').hidden, false);
  assert.match(toastText(), /قطع شد/);
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  window.dispatchEvent(new window.Event('online'));
  assert.equal(document.getElementById('offlineBanner').hidden, true);
  assert.equal(document.getElementById('offlineBadge').hidden, true);
  assert.match(toastText(), /برقرار شد/);
});

test('card displays cache and install state', async () => {
  result = { version: '4.1.2', missing: [] };
  document.querySelector('.offline-card').open = true;
  await settle();
  assert.match(document.getElementById('offlineStatusText').textContent, /آماده/);
  assert.match(document.getElementById('install-status').textContent, /مرورگر/);
  assert.equal(window.lpCanInstall(), false);
});
