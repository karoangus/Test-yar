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

/** آیا آزمون دارای محدودیت زمانی (تایمر) است؟ خالی بودن زمان یعنی بدون تایمر */
export function isTimed(exam) {
  const minutes = Number(exam?.durationMinutes);
  return exam?.durationMinutes != null && Number.isFinite(minutes) && minutes > 0;
}

/** مدت کل آزمون به میلی‌ثانیه (برای آزمون بدون زمان: ۰) */
export function durationMs(exam) {
  if (!isTimed(exam)) return 0;
  const minutes = Number(exam.durationMinutes);
  return Math.round(minutes * MINUTE_MS);
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
 * اگر زمان آزمون خالی باشد (`null`)، پایان برنامه‌ریزی‌شده وجود ندارد و `null` برمی‌گردد.
 * `extraPausedMs` مجموع زمان‌هایی است که آزمون متوقف بوده و به مهلت اضافه می‌شود.
 */
export function scheduledEndsAt(startedAt, durationMinutes, extraPausedMs = 0) {
  const minutes = Number(durationMinutes);
  if (durationMinutes == null || !Number.isFinite(minutes) || minutes <= 0) return null;
  const base = Math.round(minutes * MINUTE_MS);
  const extra = Number.isFinite(extraPausedMs) && extraPausedMs > 0 ? extraPausedMs : 0;
  return startedAt + base + extra;
}

/** زمان پایان برنامه‌ریزی‌شدهٔ یک آزمون (یا null اگر شروع نشده یا بدون زمان باشد) */
export function scheduledEndOfExam(exam) {
  if (exam?.startedAt == null || !isTimed(exam)) return null;
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
 * برای آزمون بدون زمان که هنوز تمام نشده است، `null` برمی‌گردد.
 */
export function effectiveEndsAt(exam) {
  const scheduled = scheduledEndOfExam(exam);
  if (scheduled == null) return exam?.endedAt ?? null;
  if (exam.endedAt != null) return Math.min(scheduled, exam.endedAt);
  return scheduled;
}

/** میلی‌ثانیهٔ باقی‌مانده (برای آزمون بدون زمان: null؛ در غیر این صورت هرگز منفی نمی‌شود) */
export function remainingMs(exam, now) {
  if (!isTimed(exam)) return null;
  if (exam.startedAt == null) return durationMs(exam);
  const endsAt = effectiveEndsAt(exam);
  return Math.max(0, endsAt - anchorNow(exam, now));
}

/** آیا زمان آزمون (بر اساس ساعت واقعی) تمام شده است؟ در آزمون بدون زمان یا حین توقف هرگز */
export function isExpired(exam, now) {
  if (exam?.startedAt == null) return false;
  if (!isTimed(exam)) return false;
  if (isPaused(exam)) return false;
  return now >= effectiveEndsAt(exam);
}

/**
 * زمان فعال صرف‌شده (بدون احتساب توقف‌ها) به میلی‌ثانیه.
 * در حالت توقف فریز می‌شود.
 */
export function activeElapsedMs(exam, now) {
  if (exam?.startedAt == null) return 0;
  const anchor = anchorNow(exam, now);
  return Math.max(0, anchor - exam.startedAt - pausedTotalMs(exam));
}

/** نسبت زمان سپری‌شده بین ۰ تا ۱ (برای نوار پیشرفت زمان؛ در آزمون بدون زمان: ۰) */
export function elapsedRatio(exam, now) {
  if (!isTimed(exam)) return 0;
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

/** ثانیه‌های باقی‌مانده برای نمایش mm:ss — همیشه از clock واقعی (برای آزمون بدون زمان: null) */
export function remainingSeconds(exam, now) {
  const ms = remainingMs(exam, now);
  return ms == null ? null : Math.ceil(ms / 1000);
}

/** زمان صرف‌شده روی آزمون به ثانیه (بدون توقف‌ها؛ مناسب نمایش کرنومتر) */
export function activeElapsedSeconds(exam, now) {
  return Math.floor(activeElapsedMs(exam, now) / 1000);
}

/**
 * زمان ثبت‌شدهٔ صرف‌شده در آزمون پایان‌یافته به میلی‌ثانیه.
 * اولویت با مقدار ثبت‌شده در result/exam است؛ در غیر این صورت از روی startedAt و endedAt محاسبه می‌شود.
 */
export function recordedElapsedMs(exam) {
  if (exam == null) return null;
  if (Number.isFinite(exam.result?.activeElapsedMs) && exam.result.activeElapsedMs >= 0) {
    return exam.result.activeElapsedMs;
  }
  if (Number.isFinite(exam.elapsedMs) && exam.elapsedMs >= 0) {
    return exam.elapsedMs;
  }
  if (exam.startedAt != null && exam.endedAt != null) {
    const raw = activeElapsedMs(exam, exam.endedAt);
    return isTimed(exam) ? Math.min(raw, durationMs(exam)) : raw;
  }
  return null;
}

/** زمان ثبت‌شدهٔ صرف‌شده در آزمون پایان‌یافته به ثانیه (یا null اگر هنوز تمام نشده باشد) */
export function recordedElapsedSeconds(exam) {
  const ms = recordedElapsedMs(exam);
  return ms == null ? null : Math.round(ms / 1000);
}
