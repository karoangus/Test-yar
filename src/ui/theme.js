// ── تم روشن/تیره با ذخیرهٔ ماندگار ───────────────────────────────────────────
// پیش‌فرض «خودکار» است (هم‌راستا با تنظیم سیستم‌عامل) و انتخاب کاربر در
// localStorage نگه داشته می‌شود. تم پیش از نخستین رندر اعمال می‌شود تا صفحه
// پرشِ رنگ نداشته باشد.

export const THEME_KEY = 'testyar.theme.v1';
export const PREF = Object.freeze({ AUTO: 'auto', LIGHT: 'light', DARK: 'dark' });

const listeners = new Set();

function readPref() {
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    if (stored === PREF.LIGHT || stored === PREF.DARK || stored === PREF.AUTO) return stored;
  } catch {
    /* دسترسی به حافظه ممکن نیست → خودکار */
  }
  return PREF.AUTO;
}

export function resolveTheme(pref = readPref()) {
  if (pref === PREF.LIGHT || pref === PREF.DARK) return pref;
  try {
    return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? PREF.DARK : PREF.LIGHT;
  } catch {
    return PREF.LIGHT;
  }
}

export function getResolvedTheme() {
  return resolveTheme();
}

/** اعمال تم روی <html> و متادیتای مرورگر */
export function applyTheme(pref = readPref(), { persist = true } = {}) {
  const resolved = resolveTheme(pref);
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === PREF.DARK ? '#0b1220' : '#1e3a8a');
  if (persist) {
    try {
      window.localStorage.setItem(THEME_KEY, pref);
    } catch {
      /* بی‌اهمیت: تم فقط برای همین نشست اعمال می‌شود */
    }
  }
  for (const cb of [...listeners]) {
    try {
      cb(resolved, pref);
    } catch {
      /* خطای یک شنونده بقیه را متوقف نکند */
    }
  }
  return resolved;
}

/** تغییر بین روشن و تیره بر پایهٔ تم فعلی */
export function toggleTheme() {
  const next = getResolvedTheme() === PREF.DARK ? PREF.LIGHT : PREF.DARK;
  return applyTheme(next);
}

export function onThemeChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** راه‌اندازی اولیه: اعمال تم و پیگیری تغییر تم سیستم در حالت «خودکار» */
export function initTheme() {
  if (typeof window === 'undefined') return;
  applyTheme(readPref(), { persist: false });
  try {
    window.matchMedia?.('(prefers-color-scheme: dark)')?.addEventListener?.('change', () => {
      if (readPref() === PREF.AUTO) applyTheme(PREF.AUTO, { persist: false });
    });
  } catch {
    /* مرورگرهای قدیمی */
  }
}
