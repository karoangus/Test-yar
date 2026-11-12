import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html lang="fa"><body><div id="offline-banner"></div><div id="app"><header class="app-header"></header></div><section id="offline-settings"></section></body></html>', { url: 'https://example.test/project/' });
global.window = dom.window;
global.document = dom.window.document;
global.Node = dom.window.Node;
global.MutationObserver = dom.window.MutationObserver;
global.localStorage = dom.window.localStorage;
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
window.matchMedia = () => ({ matches: false });
let result = { version: '4.1.1', missing: ['./offline.html'] };
let repairResult = { version: '4.1.1', missing: [] };
const calls = [];
Object.defineProperty(navigator, 'serviceWorker', { value: {
  controller: { postMessage(data, ports) { calls.push(data.type); ports[0].postMessage(data.type === 'OFFLINE_REPAIR' ? repairResult : result); } },
  register: async () => ({}), ready: Promise.resolve({}),
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
  result = { version: '4.1.1', missing: ['./offline.html'] };
  repairResult = { version: '4.1.1', error: 'repair_failed' };
  document.getElementById('test-offline').click(); await settle();
  assert.match(toastText(), /ناقص‌اند/);
  assert.equal(await window.lpEnsureOfflineReady(), false);
  assert.match(toastText(), /کامل نشد/);
  assert.equal(document.getElementById('save-offline').disabled, false);
});
