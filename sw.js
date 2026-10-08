/* سرویس‌ورکر تست‌یار — قابلیت نصب و کارکرد آفلاین */
const VERSION = 'testyar-v1';
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

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(CORE))
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

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // ناوبری: شبکه اول با fallback به نسخهٔ کش‌شدهٔ ایندکس
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }

  // بقیه: cache اول با به‌روزرسانی در پس‌زمینه
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetched = fetch(request)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetched;
    }),
  );
});
