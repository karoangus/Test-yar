// ── قابلیت نصب، سرویس‌ورکر و اعلان نسخهٔ جدید ───────────────────────────────

let deferredPrompt = null;
let registration = null;
let updateReady = false;
let applyingUpdate = false;
const promptListeners = new Set();
const updateListeners = new Set();

export function canInstall() {
  return deferredPrompt != null;
}

export function onInstallAvailable(cb) {
  promptListeners.add(cb);
  return () => promptListeners.delete(cb);
}

export async function promptInstall() {
  if (!deferredPrompt) return false;
  deferredPrompt.prompt();
  try {
    const choice = await deferredPrompt.userChoice;
    const accepted = choice?.outcome === 'accepted';
    if (accepted) deferredPrompt = null;
    return accepted;
  } catch {
    return false;
  }
}

/** آیا نسخهٔ تازه‌ای از برنامه آمادهٔ فعال‌سازی است؟ */
export function isUpdateReady() {
  return updateReady;
}

export function onUpdateReady(cb) {
  updateListeners.add(cb);
  if (updateReady) {
    try {
      cb();
    } catch {
      /* ignore */
    }
  }
  return () => updateListeners.delete(cb);
}

function notifyUpdateReady() {
  if (updateReady) return;
  updateReady = true;
  for (const cb of [...updateListeners]) {
    try {
      cb();
    } catch {
      /* ignore */
    }
  }
}

/** فعال‌سازی نسخهٔ جدید و بازخوانی صفحه */
export function applyUpdate() {
  applyingUpdate = true;
  try {
    registration?.waiting?.postMessage({ type: 'SKIP_WAITING' });
  } catch {
    /* ignore */
  }
  // اگر سرویس‌ورکر در انتظار نبود، همان‌جا بازخوانی می‌کنیم
  window.location.reload();
}

export function initPwa() {
  if (typeof window === 'undefined') return;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    for (const cb of [...promptListeners]) {
      try {
        cb();
      } catch {
        /* ignore */
      }
    }
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
  });

  if (!('serviceWorker' in navigator)) return;

  // پس از فعال‌شدن سرویس‌ورکر تازه، صفحه یک‌بار بازخوانی می‌شود
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (applyingUpdate) window.location.reload();
  });

  window.addEventListener('load', async () => {
    try {
      registration = await navigator.serviceWorker.register('./sw.js');
      if (registration.waiting && navigator.serviceWorker.controller) notifyUpdateReady();
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) notifyUpdateReady();
        });
      });
    } catch {
      /* نصب SW اختیاری است؛ برنامه بدون آن هم کار می‌کند */
    }
  });
}
