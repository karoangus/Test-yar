/* تست‌یار: پوستهٔ کامل آفلاین، مستقل از مسیر نصب */
const LP_APP_VERSION = '4.1.0';
const CACHE_NAME = `testyar-v${LP_APP_VERSION}`;
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
    await Promise.all(keys.filter(key => key.startsWith('testyar-v') && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'OFFLINE_STATUS' && event.ports[0]) {
    event.waitUntil((async () => {
      const cache = await caches.open(CACHE_NAME);
      const missing = [];
      for (const url of SHELL) if (!await cache.match(url)) missing.push(url);
      event.ports[0].postMessage({ version: LP_APP_VERSION, missing });
    })());
  }
});
self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const navigation = request.mode === 'navigate';
  const networkFirst = navigation || /\.(?:html|css|js|mjs|json|webmanifest)$/i.test(url.pathname);
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = () => cache.match(request);
    const network = async () => {
      const response = await fetch(request);
      if (!response.ok) throw new Error('Network response not OK');
      await cache.put(request, response.clone()).catch(() => {});
      return response;
    };
    if (networkFirst) {
      try { return await network(); } catch {
        return await cached() || (navigation && (await cache.match('./index.html') || await cache.match('./offline.html'))) || Response.error();
      }
    }
    return await cached() || await network().catch(() => Response.error());
  })());
});
