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
  return String(value ?? '')
    .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[٫،,]/g, '.')
    .replace(/[−–—]/g, '-')
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

/**
 * قالب‌بندی مدت‌زمان بر حسب دقیقه به متن خوانا.
 * ابتدا کل دقیقه‌ها گرد می‌شوند تا هرگز «۶۰ دقیقه» یا «۱ ساعت و ۶۰ دقیقه» دیده نشود.
 */
export function formatDuration(minutes) {
  const total = Number(minutes);
  if (!Number.isFinite(total) || total <= 0) return '—';
  const totalMinutes = Math.round(total);
  if (totalMinutes < 1) return 'کمتر از یک دقیقه';
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours === 0) return `${toFa(mins)} دقیقه`;
  if (mins === 0) return `${toFa(hours)} ساعت`;
  return `${toFa(hours)} ساعت و ${toFa(mins)} دقیقه`;
}

/**
 * قالب‌بندی ثانیه‌ها به متن خوانا (برای زمان توقف‌ها و زمان صرف‌شده).
 * مثال: ۹۰ → «۱ دقیقه و ۳۰ ثانیه»
 */
export function formatSeconds(totalSeconds) {
  const seconds = Math.max(0, Math.round(Number(totalSeconds) || 0));
  if (seconds < 60) return `${toFa(seconds)} ثانیه`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return rest === 0 ? `${toFa(minutes)} دقیقه` : `${toFa(minutes)} دقیقه و ${toFa(rest)} ثانیه`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins === 0 ? `${toFa(hours)} ساعت` : `${toFa(hours)} ساعت و ${toFa(mins)} دقیقه`;
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

/** فاصلهٔ زمانی نسبت به حالا: «۳ دقیقه پیش»، «دیروز» و … */
export function formatRelativeTime(timestamp, now = Date.now()) {
  const diff = Number(now) - Number(timestamp);
  if (!Number.isFinite(diff)) return '—';
  if (diff < 0) return 'همین حالا';
  if (diff < 45_000) return 'همین حالا';
  const minutes = Math.round(diff / 60_000);
  if (minutes < 60) return `${toFa(minutes)} دقیقه پیش`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${toFa(hours)} ساعت پیش`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'دیروز';
  if (days < 30) return `${toFa(days)} روز پیش`;
  return formatDateTime(timestamp);
}

/** قالب‌بندی عدد صحیح با ارقام فارسی */
export function formatNumber(value) {
  return toFa(String(value));
}

/** تبدیل درصد به نمرهٔ ۲۰ (فقط برای نمایش؛ مقدار خام درصد دست‌نخورده می‌ماند) */
export function formatScoreOutOf20(percent) {
  const score = roundTo(Number(percent) / 5, 2);
  if (!Number.isFinite(score)) return '—';
  return `${toFa(String(Object.is(score, -0) ? 0 : score))} از ۲۰`;
}
