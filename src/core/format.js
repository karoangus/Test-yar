// ── قالب‌بندی اعداد و متن فارسی ─────────────────────────────────────────────
// این ماژول کاملاً خالص است و به رابط کاربری وابسته نیست.

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

/** تبدیل ارقام لاتین یک رشته به ارقام فارسی (همراه با جداکنندهٔ اعشار و علامت منفی) */
export function toFa(value) {
  return String(value)
    .replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)])
    .replace(/\./g, '٫')
    .replace(/-/g, '−');
}

/** نرمال‌سازی ارقام فارسی/عربی ورودی به ارقام لاتین (برای parse کردن) */
export function normalizeDigits(value) {
  return String(value)
    .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/٫/g, '.')
    .trim();
}

/**
 * گرد کردن عدد با دقت مشخص بدون خطای اعشاری نقطه‌شناور.
 * مقدار خام جدا نگه داشته می‌شود؛ این تابع فقط برای مرحلهٔ نمایش استفاده می‌شود.
 */
export function roundTo(value, digits = 2) {
  if (!Number.isFinite(value)) return NaN;
  const factor = 10 ** digits;
  const shifted = Math.abs(value) * factor;
  // افزودن اپسیلون برای مقابله با خطای نمایش اعشاری (مثل 63.33499999...)
  const rounded = Math.round(shifted + Number.EPSILON * Math.max(1, shifted));
  const result = rounded / factor;
  return (value < 0 ? -1 : 1) * result;
}

/** قالب‌بندی درصد: حداکثر دو رقم اعشار، بدون صفرهای اضافی، با ارقام فارسی */
export function formatPercent(rawValue) {
  const rounded = roundTo(rawValue, 2);
  if (!Number.isFinite(rounded)) return '—';
  const cleaned = Object.is(rounded, -0) ? 0 : rounded;
  return `${toFa(String(cleaned))}٪`;
}

/** قالب‌بندی زمان به صورت mm:ss با ارقام فارسی */
export function formatClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return toFa(`${mm}:${ss}`);
}

/** قالب‌بندی مدت‌زمان بر حسب دقیقه به متن خوانا */
export function formatDuration(minutes) {
  const m = Math.round(Number(minutes) * 100) / 100;
  if (!Number.isFinite(m) || m <= 0) return '—';
  const hours = Math.floor(m / 60);
  const mins = Math.round(m % 60);
  if (hours === 0) return `${toFa(mins)} دقیقه`;
  if (mins === 0) return `${toFa(hours)} ساعت`;
  return `${toFa(hours)} ساعت و ${toFa(mins)} دقیقه`;
}

/** قالب‌بندی تاریخ/ساعت فارسی از یک timestamp */
export function formatDateTime(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat('fa-IR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  } catch {
    return toFa(date.toLocaleString());
  }
}

/** قالب‌بندی عدد صحیح با ارقام فارسی */
export function formatNumber(value) {
  return toFa(String(value));
}
