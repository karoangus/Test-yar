/* تست‌یار: پوستهٔ کامل آفلاین، مستقل از مسیر نصب */
const LP_APP_VERSION = '4.1.2';
const CACHE_NAME = `testyar-v${LP_APP_VERSION}`;
const RUNTIME_CACHE = `${CACHE_NAME}-runtime`;
const NETWORK_TIMEOUT_MS = 4000;
const SHELL = [
  './', './index.html', './offline.html', './app-version.json',
  `./manifest.webmanifest?v=${LP_APP_VERSION}`, './manifest.webmanifest',
  `./assets/favicon.svg?v=${LP_APP_VERSION}`, `./assets/icons/apple-touch-180.png?v=${LP_APP_VERSION}`,
  './assets/icons/icon-192.png', './assets/icons/icon-512.png', './assets/icons/maskable-512.png',
  `./assets/fonts/fonts.css?v=${LP_APP_VERSION}`, './assets/fonts/Vazirmatn-Regular.woff2',
  './assets/fonts/Vazirmatn-Medium.woff2', './assets/fonts/Vazirmatn-Bold.woff2',
  `./src/styles/app.css?v=${LP_APP_VERSION}`, `./css/offline.css?v=${LP_APP_VERSION}`,
  `./src/main.js?v=${LP_APP_VERSION}`, `./js/offline.js?v=${LP_APP_VERSION}`,
  './src/core/format.js', './src/core/scoring.js', './src/core/timer.js',
  './src/core/model.js', './src/core/storage.js', './src/core/store.js',
  './src/ui/dom.js', './src/ui/theme.js', './src/ui/keyboard.js', './src/ui/components.js',
  './src/ui/router.js', './src/ui/pwa.js', './src/ui/app.js',
  './src/ui/views/home.js', './src/ui/views/create.js', './src/ui/views/prepare.js',
  './src/ui/views/answersheet.js', './src/ui/views/corrector.js', './src/ui/views/result.js',
  './src/ui/views/history.js',
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // همهٔ فایل‌ها باید ذخیره شوند؛ شکست ناقص هرگز آماده گزارش نمی‌شود.
    await cache.addAll(SHELL.map(url => new Request(url, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('testyar-v') && key !== CACHE_NAME && key !== RUNTIME_CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
async function missingShell(cache) {
  const missing = [];
  for (const url of SHELL) if (!await cache.match(url)) missing.push(url);
  return missing;
}

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (!['OFFLINE_STATUS', 'OFFLINE_REPAIR'].includes(event.data?.type) || !event.ports[0]) return;
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE_NAME);
      let missing = await missingShell(cache);
      if (event.data.type === 'OFFLINE_REPAIR' && missing.length) {
        // Never mix an old shell with files from a newer deployment.
        const response = await fetch(new Request('./app-version.json', { cache: 'reload' }));
        if (!response.ok) throw new Error('network');
        const published = await response.json();
        if (published.version !== LP_APP_VERSION || event.data.version !== LP_APP_VERSION) {
          event.ports[0].postMessage({ version: LP_APP_VERSION, missing, error: 'version' });
          return;
        }
        // addAll is atomic: a failed download leaves the existing cache untouched.
        await cache.addAll(missing.map(url => new Request(url, { cache: 'reload' })));
        missing = await missingShell(cache);
      }
      event.ports[0].postMessage({ version: LP_APP_VERSION, missing });
    } catch {
      event.ports[0].postMessage({ version: LP_APP_VERSION, error: 'repair_failed' });
    }
  })());
});
self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const navigation = request.mode === 'navigate';
  const isHtml = navigation || /\.html$/i.test(url.pathname);
  const networkFirst = isHtml || /\.(?:css|js|mjs|json|webmanifest)$/i.test(url.pathname);
  event.respondWith((async () => {
    const shell = await caches.open(CACHE_NAME);
    const runtime = await caches.open(RUNTIME_CACHE);
    // Do not overwrite the installed shell with files from a different deployment.
    const network = async (timeout = false) => {
      const controller = new AbortController();
      const timer = timeout ? setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS) : null;
      try {
        const response = await fetch(request, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('Network response not OK');
        await runtime.put(request, response.clone()).catch(() => {});
        return response;
      } finally { if (timer) clearTimeout(timer); }
    };
    if (networkFirst) {
      try { return await network(true); } catch {
        // A navigation always falls back to the coherent, installed app shell.
        if (navigation) return await shell.match(request) || await shell.match('./index.html') || await shell.match('./offline.html') || Response.error();
        return await shell.match(request) || await runtime.match(request) || Response.error();
      }
    }
    return await shell.match(request) || await runtime.match(request) || await network().catch(() => Response.error());
  })());
});
