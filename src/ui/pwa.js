// ── قابلیت نصب و سرویس‌ورکر ──────────────────────────────────────────────────

let deferredPrompt = null;
const promptListeners = new Set();

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

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {
        /* نصب SW اختیاری است؛ برنامه بدون آن هم کار می‌کند */
      });
    });
  }
}
