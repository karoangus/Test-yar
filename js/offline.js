import { canInstall, onInstallAvailable, promptInstall } from '../src/ui/pwa.js';
import { toast } from '../src/ui/components.js';

const LP_APP_VERSION = '4.1.0';
window.LP_APP_VERSION = LP_APP_VERSION;
const en = document.documentElement.lang.startsWith('en');
const t = (fa, english) => en ? english : fa;
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const banner = document.getElementById('offline-banner');
const settings = document.getElementById('offline-settings');
settings.innerHTML = `<details><summary>${t('⚙️ آفلاین و اینترنت ملی','⚙️ Offline and national internet')}</summary>
<p>${t('در اینترنت ملی ممکن است github.io فیلتر باشد؛ تغییر دامنه به ایرانی از داخل برنامه ممکن نیست. پیش از قطع اینترنت برنامه را ذخیره و نصب کنید و سپس از آیکون آن باز کنید.','github.io may be blocked on the national network; the app cannot change its domain to an Iranian one. Save and install the app before disconnection, then open it from its icon.')}</p>
<p>${t('مرورگر می‌تواند داده‌ها را حذف کند، به‌خصوص در حالت خصوصی یا پس از پاک‌کردن داده‌ها. از تاریخچه پشتیبان بگیرید.','The browser may remove data, especially in private mode or after clearing site data. Export a backup from History.')}</p>
<p id="storage-status"></p><p id="settingsVersion"></p>
<div class="offline-actions"><button class="btn btn-primary" id="save-offline">✅ ${t('ذخیره آفلاین','Save offline')}</button><button class="btn btn-ghost" id="test-offline">🧪 ${t('تست آفلاین','Test offline')}</button><button class="btn btn-ghost" id="install-offline">📲 ${t('نصب روی گوشی','Install on phone')}</button></div>
<p id="install-guide">${t('برای نصب: در اندروید از منوی مرورگر «نصب برنامه» و در آیفون از Share سپس Add to Home Screen استفاده کنید.','To install: use Install app in the Android browser menu, or Share then Add to Home Screen on iPhone.')}</p></details>`;
document.getElementById('settingsVersion').textContent = `${t('نسخه','Version')}: ${LP_APP_VERSION}`;
function connectivity() {
  const offline = navigator.onLine === false;
  banner.hidden = !offline;
  banner.textContent = t('📴 آفلاین هستید؛ تغییرات روی همین دستگاه ذخیره می‌شوند.', '📴 You are offline; changes are stored on this device.');
  const header = document.querySelector('.app-header');
  if (header && !header.querySelector('.offline-badge')) {
    const badge = document.createElement('span'); badge.className = 'offline-badge'; badge.textContent = t('آفلاین','Offline'); header.append(badge);
  }
  document.querySelectorAll('.offline-badge').forEach(b => { b.hidden = !offline; });
}
window.addEventListener('online', connectivity); window.addEventListener('offline', connectivity);
window.addEventListener('hashchange', () => setTimeout(connectivity, 0));
// نمای خانه هنگام تغییر تم نیز بازسازی می‌شود.
new MutationObserver(() => {
  const header = document.querySelector('.app-header');
  if (header && !header.querySelector('.offline-badge')) connectivity();
}).observe(document.getElementById('app'), { childList: true, subtree: true });
connectivity();
async function persistence(request = false) {
  let persistent = false;
  try {
    if (request && navigator.storage?.persist) await navigator.storage.persist();
    persistent = !!(await navigator.storage?.persisted?.());
    localStorage.setItem('testyar.storage.persisted', String(persistent));
  } catch { try { localStorage.setItem('testyar.storage.persisted', 'false'); } catch {} }
  document.getElementById('storage-status').textContent = persistent
    ? t('حافظهٔ پایدار توسط مرورگر تأیید شده است.','Persistent storage granted by the browser.')
    : t('حافظهٔ پایدار تأیید نشده است؛ مرورگر ممکن است داده‌ها را پاک کند.','Persistent storage not granted; the browser may remove data.');
  return persistent;
}
async function status() {
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) throw Error('no controller');
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); reject(Error('timeout')); }, 5000);
    channel.port1.onmessage = e => { clearTimeout(timer); channel.port1.close(); resolve(e.data); };
    navigator.serviceWorker.controller.postMessage({ type:'OFFLINE_STATUS' }, [channel.port2]);
  });
}
async function check() {
  const result = await status();
  return result.version === LP_APP_VERSION && Array.isArray(result.missing) && result.missing.length === 0;
}
window.lpEnsureOfflineReady = async () => {
  await persistence(true);
  try {
    if (!('serviceWorker' in navigator)) throw Error('unsupported');
    const registration = await navigator.serviceWorker.register('./sw.js');
    if (navigator.onLine) await registration.update().catch(() => {});
    await Promise.race([navigator.serviceWorker.ready, new Promise((_, reject) => setTimeout(() => reject(Error('timeout')), 10000))]);
    if (!navigator.serviceWorker.controller) await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { navigator.serviceWorker.removeEventListener('controllerchange', changed); reject(Error('timeout')); }, 10000);
      function changed() { clearTimeout(timer); navigator.serviceWorker.removeEventListener('controllerchange', changed); resolve(); }
      navigator.serviceWorker.addEventListener('controllerchange', changed);
      if (navigator.serviceWorker.controller) changed();
    });
    if (!await check()) throw Error('incomplete');
    toast(t('فایل‌های آفلاین آماده‌اند. برای اطمینان اینترنت را قطع و برنامه را از آیکون باز کنید.','Offline files are ready. Disconnect and reopen from the icon to verify.'), 'success');
    return true;
  } catch {
    toast(t('آماده‌سازی کامل نشد؛ اتصال و پشتیبانی مرورگر را بررسی و دوباره تلاش کنید.','Preparation failed; check your connection and browser support, then retry.'), 'error');
    return false;
  }
};
document.getElementById('save-offline').onclick = window.lpEnsureOfflineReady;
document.getElementById('test-offline').onclick = async () => {
  try {
    const ok = await check();
    toast(ok ? t('فایل‌های لازم در کش هستند؛ آزمون واقعی: اینترنت را قطع و از آیکون باز کنید.','Required files are cached; for a real test disconnect and reopen from the icon.') : t('کش ناقص یا نسخه ناسازگار است؛ ذخیره آفلاین را دوباره بزنید.','Cache incomplete or version mismatch; save offline again.'), ok ? 'success' : 'error');
  } catch { toast(t('سرویس آفلاین فعال نیست؛ ابتدا ذخیره آفلاین را بزنید.','Offline service is not active; save offline first.'), 'error'); }
};
const install = document.getElementById('install-offline');
function updateInstall() { install.hidden = standalone(); }
install.onclick = async () => {
  if (!canInstall()) { document.getElementById('install-guide').scrollIntoView({block:'nearest'}); toast(t('از راهنمای نصب زیر استفاده کنید.','Use the installation guide below.'), 'info'); return; }
  const ok = await promptInstall();
  toast(ok ? t('درخواست نصب پذیرفته شد.','Install request accepted.') : t('نصب انجام نشد.','Installation was not completed.'), ok ? 'success' : 'info');
  updateInstall();
};
onInstallAvailable(updateInstall); window.addEventListener('appinstalled', updateInstall); updateInstall();
persistence(true);
