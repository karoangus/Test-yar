import { canInstall, onInstallAvailable, promptInstall } from '../src/ui/pwa.js';
import { toast } from '../src/ui/components.js';

const LP_APP_VERSION = '4.1.2';
window.LP_APP_VERSION = LP_APP_VERSION;
const en = document.documentElement.lang.startsWith('en');
const t = (fa, english) => en ? english : fa;
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const banner = document.getElementById('offlineBanner');
const settings = document.getElementById('offline-settings');
function renderOfflineCard() {
settings.innerHTML = `<details class="offline-card"><summary>${t('⚙️ آفلاین و اینترنت ملی','⚙️ Offline and national internet')}</summary>
<p>${t('در اینترنت ملی ممکن است github.io فیلتر باشد؛ تغییر دامنه به ایرانی از داخل برنامه ممکن نیست. پیش از قطع اینترنت برنامه را ذخیره و نصب کنید و سپس از آیکون آن باز کنید.','github.io may be blocked on the national network; the app cannot change its domain to an Iranian one. Save and install the app before disconnection, then open it from its icon.')}</p>
<p>${t('مرورگر می‌تواند داده‌ها را حذف کند، به‌خصوص در حالت خصوصی یا پس از پاک‌کردن داده‌ها. از تاریخچه پشتیبان بگیرید.','The browser may remove data, especially in private mode or after clearing site data. Export a backup from History.')}</p>
<p id="storage-status" class="offline-status"></p><p id="offlineStatusText" class="offline-status" role="status"></p><p id="install-status" class="offline-status"></p><p id="settingsVersion"></p>
<div class="offline-actions"><button class="btn btn-primary" id="save-offline">✅ ${t('ذخیره آفلاین','Save offline')}</button><button class="btn btn-ghost" id="test-offline">🧪 ${t('تست آفلاین','Test offline')}</button><button class="btn btn-ghost" id="install-offline">📲 ${t('نصب روی گوشی','Install on phone')}</button></div>
<p id="install-guide">${t('برای نصب: در اندروید از منوی مرورگر «نصب برنامه» و در آیفون از Share سپس Add to Home Screen استفاده کنید.','To install: use Install app in the Android browser menu, or Share then Add to Home Screen on iPhone.')}</p></details>`;
document.getElementById('settingsVersion').textContent = `${t('نسخه','Version')}: ${LP_APP_VERSION}`;
}
renderOfflineCard();
function connectivity() {
  const offline = navigator.onLine === false;
  banner.hidden = !offline;
  banner.textContent = t('📴 آفلاین هستید؛ تغییرات روی همین دستگاه ذخیره می‌شوند.', '📴 You are offline; changes are stored on this device.');
  const header = document.querySelector('.app-header');
  if (header && !header.querySelector('.offline-badge')) {
    const badge = document.createElement('span'); badge.id = 'offlineBadge'; badge.className = 'offline-badge'; badge.textContent = t('آفلاین','Offline'); header.append(badge);
  }
  document.querySelectorAll('.offline-badge').forEach(b => { b.hidden = !offline; });
}
window.addEventListener('online', () => { connectivity(); toast(t('اتصال شبکه برقرار شد.', 'Network connection restored.'), 'info'); });
window.addEventListener('offline', () => { connectivity(); toast(t('اتصال شبکه قطع شد.', 'Network connection lost.'), 'info'); });
window.addEventListener('hashchange', () => setTimeout(connectivity, 0));
// نمای خانه هنگام تغییر تم نیز بازسازی می‌شود.
new MutationObserver(() => {
  const header = document.querySelector('.app-header');
  if (header && !header.querySelector('.offline-badge')) connectivity();
}).observe(document.getElementById('app'), { childList: true, subtree: true });
connectivity();
async function ensurePersist(request = false) {
  let persistent = false;
  try {
    if (request && navigator.storage?.persist) await navigator.storage.persist();
    persistent = !!(await navigator.storage?.persisted?.());
  } catch { persistent = false; }
  try { localStorage.setItem('testyar.storage.persisted', String(persistent)); } catch { /* storage unavailable */ }
  document.getElementById('storage-status').textContent = persistent
    ? t('حافظهٔ پایدار توسط مرورگر تأیید شده است.','Persistent storage granted by the browser.')
    : t('حافظهٔ پایدار تأیید نشده است؛ مرورگر ممکن است داده‌ها را پاک کند.','Persistent storage not granted; the browser may remove data.');
  return persistent;
}
async function workerMessage(type, timeout = 5000) {
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) throw Error('no_controller');
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); reject(Error('timeout')); }, timeout);
    channel.port1.onmessage = e => { clearTimeout(timer); channel.port1.close(); resolve(e.data); };
    try {
      navigator.serviceWorker.controller.postMessage({ type, version: LP_APP_VERSION }, [channel.port2]);
    } catch (err) { clearTimeout(timer); channel.port1.close(); reject(err); }
  });
}
function validate(result) {
  if (!result || result.error === 'version' || result.version !== LP_APP_VERSION) throw Error('version');
  if (result.error || !Array.isArray(result.missing)) throw Error('repair_failed');
  return result.missing;
}
function setCacheStatus(message) { document.getElementById('offlineStatusText').textContent = message; }
async function refreshCacheStatus() {
  try {
    const missing = validate(await workerMessage('OFFLINE_STATUS'));
    setCacheStatus(missing.length ? t('کش آفلاین ناقص است.', 'Offline cache is incomplete.') : t('فایل‌های آفلاین آماده‌اند.', 'Offline files are ready.'));
  } catch (error) {
    setCacheStatus(error.message === 'version' ? t('نسخهٔ صفحه و سرویس آفلاین متفاوت است.', 'Page and offline service versions differ.') : t('وضعیت کش در دسترس نیست.', 'Offline cache status unavailable.'));
  }
}
settings.querySelector('details').addEventListener('toggle', event => { if (event.target.open) { ensurePersist(false); refreshCacheStatus(); } });
if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('controllerchange', refreshCacheStatus);
function reportError(error) {
  const message = error.message === 'version'
    ? t('نسخهٔ صفحه و سرویس آفلاین متفاوت است. با اینترنت متصل برنامه را ببندید و دوباره باز کنید.', 'Page and offline service versions differ. Close and reopen the app while online.')
    : error.message === 'incomplete'
      ? t('کش هنوز ناقص است. اتصال اینترنت و فضای خالی دستگاه را بررسی و دوباره تلاش کنید.', 'The cache is still incomplete. Check your connection and free space, then retry.')
      : t('آماده‌سازی آفلاین کامل نشد. اتصال به سایت و فضای خالی دستگاه را بررسی و دوباره تلاش کنید.', 'Offline preparation failed. Check access to the site and free device space, then retry.');
  setCacheStatus(message);
  toast(message, 'error');
}
window.lpEnsureOfflineReady = async () => {
  const button = document.getElementById('save-offline');
  if (button.disabled) return false;
  button.disabled = true;
  try {
    await ensurePersist(true);
    if (!('serviceWorker' in navigator)) throw Error('unsupported');
    // Register without resetting the existing cache or the user's data.
    await navigator.serviceWorker.register('./sw.js');
    let readyTimer;
    try {
      await Promise.race([navigator.serviceWorker.ready, new Promise((_, reject) => { readyTimer = setTimeout(() => reject(Error('timeout')), 10000); })]);
    } finally { clearTimeout(readyTimer); }
    if (!navigator.serviceWorker.controller) await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { navigator.serviceWorker.removeEventListener('controllerchange', changed); reject(Error('timeout')); }, 10000);
      function changed() { clearTimeout(timer); navigator.serviceWorker.removeEventListener('controllerchange', changed); resolve(); }
      navigator.serviceWorker.addEventListener('controllerchange', changed);
      if (navigator.serviceWorker.controller) changed();
    });
    let missing = validate(await workerMessage('OFFLINE_STATUS'));
    if (missing.length) missing = validate(await workerMessage('OFFLINE_REPAIR', 60000));
    if (missing.length) throw Error('incomplete');
    setCacheStatus(t('فایل‌های آفلاین آماده‌اند.', 'Offline files are ready.'));
    toast(t('فایل‌های آفلاین آماده‌اند. برای اطمینان اینترنت را قطع و برنامه را از آیکون باز کنید.','Offline files are ready. Disconnect and reopen from the icon to verify.'), 'success');
    return true;
  } catch (error) {
    reportError(error);
    return false;
  } finally { button.disabled = false; }
};
document.getElementById('save-offline').onclick = window.lpEnsureOfflineReady;
window.lpTestOffline = async () => {
  try {
    const missing = validate(await workerMessage('OFFLINE_STATUS'));
    if (missing.length) {
      setCacheStatus(t('کش آفلاین ناقص است.', 'Offline cache is incomplete.'));
      toast(t('فایل‌های آفلاین ناقص‌اند؛ با اینترنت متصل «ذخیره آفلاین» را بزنید.', 'Offline files are missing; connect and select Save offline.'), 'error');
      return false;
    }
    setCacheStatus(t('فایل‌های آفلاین آماده‌اند.', 'Offline files are ready.'));
    toast(t('فایل‌های لازم در کش هستند؛ آزمون واقعی: اینترنت را قطع و از آیکون باز کنید.','Required files are cached; for a real test disconnect and reopen from the icon.'), 'success');
    return true;
  } catch (error) { reportError(error); return false; }
};
document.getElementById('test-offline').onclick = window.lpTestOffline;
const install = document.getElementById('install-offline');
window.lpCanInstall = () => !standalone() && canInstall();
function updateInstall() {
  install.hidden = standalone();
  document.getElementById('install-status').textContent = standalone()
    ? t('برنامه در حالت نصب‌شده باز است.', 'The app is running installed.')
    : t('برنامه در حالت مرورگر باز است؛ از راهنمای نصب استفاده کنید.', 'The app is running in the browser; see the installation guide.');
}
window.lpTriggerInstall = async () => {
  if (standalone()) return;
  if (!canInstall()) { document.getElementById('install-guide').scrollIntoView({block:'nearest'}); toast(t('از راهنمای نصب زیر استفاده کنید.','Use the installation guide below.'), 'info'); return; }
  const ok = await promptInstall();
  toast(ok ? t('درخواست نصب پذیرفته شد.','Install request accepted.') : t('نصب انجام نشد.','Installation was not completed.'), ok ? 'success' : 'info');
  updateInstall();
};
install.onclick = window.lpTriggerInstall;
onInstallAvailable(updateInstall); window.addEventListener('appinstalled', updateInstall); updateInstall();
ensurePersist(true);
