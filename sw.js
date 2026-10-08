/* سرویس‌ورکر تست‌یار — قابلیت نصب و کارکرد آفلاین */
const VERSION = 'testyar-v2';
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/favicon.svg',
  './assets/fonts/fonts.css',
  './assets/fonts/Vazirmatn-Regular.woff2',
  './assets/fonts/Vazirmatn-Medium.woff2',
  './assets/fonts/Vazirmatn-Bold.woff2',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/maskable-512.png',
  './assets/icons/apple-touch-180.png',
  './src/styles/app.css',
  './src/main.js',
  './src/core/format.js',
  './src/core/scoring.js',
  './src/core/timer.js',
  './src/core/model.js',
  './src/core/storage.js',
  './src/core/store.js',
  './src/ui/dom.js',
  './src/ui/theme.js',
  './src/ui/keyboard.js',
  './src/ui/components.js',
  './src/ui/router.js',
  './src/ui/pwa.js',
  './src/ui/app.js',
  './src/ui/views/home.js',
  './src/ui/views/create.js',
  './src/ui/views/prepare.js',
  './src/ui/views/answersheet.js',
  './src/ui/views/corrector.js',
  './src/ui/views/result.js',
  './src/ui/views/history.js',
];

function putInCache(request, response) {
  if (!response || !response.ok || response.type === 'opaque') return response;
  const copy = response.clone();
  caches.open(VERSION).then((cache) => cache.put(request, copy)).catch(() => {});
  return response;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(CORE))
      // اگر یکی از فایل‌ها نبود، نصب کل سرویس‌ورکر شکست نمی‌خورد
      .catch(() => Promise.allSettled(CORE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isCode = /\.(?:js|mjs|css)$/.test(url.pathname);
  const isDocument = request.mode === 'navigate' || url.pathname.endsWith('.html');

  // کد و صفحات: شبکه اول (تا هیچ‌وقت نسخهٔ قدیمی گیر نکنیم)، fallback کش
  if (isDocument || isCode) {
    event.respondWith(
      fetch(request)
        .then((res) => putInCache(request, res))
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          return caches.match('./index.html');
        }),
    );
    return;
  }

  // فونت/آیکن/سایر دارایی‌ها: کش اول با به‌روزرسانی در پس‌زمینه
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        fetch(request)
          .then((res) => putInCache(request, res))
          .catch(() => {});
        return cached;
      }
      return fetch(request)
        .then((res) => putInCache(request, res))
        .catch(() => caches.match('./index.html'));
    }),
  );
});
