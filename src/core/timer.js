// ── منطق خالص تایمر مبتنی بر زمان واقعی (دیواری) ────────────────────────────
// تایمر هرگز با کاهش یک متغیر در UI کار نمی‌کند؛ همه‌چیز از روی
// startedAt و مدت آزمون به‌علاوهٔ زمان‌های توقف محاسبه می‌شود تا با رندر
// مجدد، بستن برنامه یا رفتن به پس‌زمینه دقیق بماند.
//
// قابلیت توقف/ادامه:
//   pausedAt      → لحظهٔ شروع توقف جاری (null یعنی در حال اجرا)
//   pausedTotalMs → مجموع میلی‌ثانیه‌های توقف‌های تمام‌شده
// مهلت مؤثر = startedAt + مدت آزمون + pausedTotalMs
// و در حالت توقف، «حالا» روی لحظهٔ توقف فریز می‌شود؛ پس زمان آزمون
// هرگز در حین توقف مصرف نمی‌شود.

export const MINUTE_MS = 60_000;

/** مدت کل آزمون به میلی‌ثانیه */
export function durationMs(exam) {
  const minutes = Number(exam?.durationMinutes);
  return Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes * MINUTE_MS) : 0;
}

/** مجموع توقف‌های تمام‌شده (همیشه عددی و نامنفی) */
export function pausedTotalMs(exam) {
  const value = Number(exam?.pausedTotalMs);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/** آیا تایمر همین حالا متوقف است؟ */
export function isPaused(exam) {
  if (exam == null || exam.pausedAt == null) return false;
  return Number.isFinite(Number(exam.pausedAt));
}

/**
 * زمان پایان برنامه‌ریزی‌شدهٔ آزمون (timestamp مطلق).
 * `extraPausedMs` مجموع زمان‌هایی است که آزمون متوقف بوده و به مهلت اضافه می‌شود.
 */
export function scheduledEndsAt(startedAt, durationMinutes, extraPausedMs = 0) {
  const base = Math.round(Number(durationMinutes) * MINUTE_MS);
  const extra = Number.isFinite(extraPausedMs) && extraPausedMs > 0 ? extraPausedMs : 0;
  return startedAt + base + extra;
}

/** زمان پایان برنامه‌ریزی‌شدهٔ یک آزمون (یا null اگر هنوز شروع نشده باشد) */
export function scheduledEndOfExam(exam) {
  if (exam?.startedAt == null) return null;
  return scheduledEndsAt(exam.startedAt, exam.durationMinutes, pausedTotalMs(exam));
}

/**
 * «حالا»ی مؤثر: در حالت توقف، لحظهٔ توقف؛ در غیر این صورت ساعت واقعی.
 * این تابع تضمین می‌کند زمان در حین توقف مصرف نشود.
 */
export function anchorNow(exam, now) {
  if (!isPaused(exam)) return now;
  return Math.min(now, Number(exam.pausedAt));
}

/**
 * مهلت مؤثر پایان آزمون: اگر کاربر زودتر دستی تمام کرده باشد، همان لحظهٔ
 * پایان دستی؛ در غیر این صورت پایان برنامه‌ریزی‌شده (با احتساب توقف‌ها).
 */
export function effectiveEndsAt(exam) {
  const scheduled = scheduledEndOfExam(exam);
  if (scheduled == null) return null;
  if (exam.endedAt != null) return Math.min(scheduled, exam.endedAt);
  return scheduled;
}

/** میلی‌ثانیهٔ باقی‌مانده (هرگز منفی نمی‌شود و در حین توقف فریز است) */
export function remainingMs(exam, now) {
  if (exam.startedAt == null) return durationMs(exam);
  const endsAt = effectiveEndsAt(exam);
  return Math.max(0, endsAt - anchorNow(exam, now));
}

/** آیا زمان آزمون (بر اساس ساعت واقعی) تمام شده است؟ در حین توقف هرگز */
export function isExpired(exam, now) {
  if (exam.startedAt == null) return false;
  if (isPaused(exam)) return false;
  return now >= effectiveEndsAt(exam);
}

/**
 * زمان فعال صرف‌شده (بدون احتساب توقف‌ها) به میلی‌ثانیه.
 * در حالت توقف فریز می‌شود.
 */
export function activeElapsedMs(exam, now) {
  if (exam.startedAt == null) return 0;
  const anchor = anchorNow(exam, now);
  return Math.max(0, anchor - exam.startedAt - pausedTotalMs(exam));
}

/** نسبت زمان سپری‌شده بین ۰ تا ۱ (برای نوار پیشرفت زمان) */
export function elapsedRatio(exam, now) {
  const total = durationMs(exam);
  if (total <= 0) return 1;
  return Math.min(1, Math.max(0, activeElapsedMs(exam, now) / total));
}

/**
 * کل زمان توقف (توقف‌های تمام‌شده + توقف جاری) به میلی‌ثانیه.
 * برخلاف تایمر آزمون، شمارندهٔ توقف با ساعت واقعی جلو می‌رود تا کاربر
 * ببیند چقدر در حال استراحت بوده است.
 */
export function pauseDurationMs(exam, now) {
  const base = pausedTotalMs(exam);
  if (!isPaused(exam)) return base;
  return base + Math.max(0, now - Number(exam.pausedAt));
}

/** ثانیه‌های باقی‌مانده برای نمایش mm:ss — همیشه از clock واقعی */
export function remainingSeconds(exam, now) {
  return Math.ceil(remainingMs(exam, now) / 1000);
}

/** زمان صرف‌شده روی آزمون به ثانیه (بدون توقف‌ها) */
export function activeElapsedSeconds(exam, now) {
  return Math.round(activeElapsedMs(exam, now) / 1000);
}
