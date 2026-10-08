// ── منطق خالص تایمر مبتنی بر زمان واقعی (دیواری) ────────────────────────────
// تایمر هرگز با کاهش یک متغیر در UI کار نمی‌کند؛ همه‌چیز از روی
// startedAt و endsAt مطلق نسبت به ساعت واقعی محاسبه می‌شود تا با
// رندر مجدد، بستن برنامه یا رفتن به پس‌زمینه دقیق بماند.

export const MINUTE_MS = 60_000;

/** زمان پایان برنامه‌ریزی‌شدهٔ آزمون (timestamp مطلق) */
export function scheduledEndsAt(startedAt, durationMinutes) {
  return startedAt + Math.round(durationMinutes * MINUTE_MS);
}

/**
 * مهلت مؤثر پایان آزمون: اگر کاربر زودتر دستی تمام کرده باشد، همان لحظهٔ
 * پایان دستی؛ در غیر این صورت پایان برنامه‌ریزی‌شده.
 */
export function effectiveEndsAt(exam) {
  const scheduled = scheduledEndsAt(exam.startedAt, exam.durationMinutes);
  if (exam.endedAt != null) return Math.min(scheduled, exam.endedAt);
  return scheduled;
}

/** میلی‌ثانیهٔ باقی‌مانده (هرگز منفی نمی‌شود) */
export function remainingMs(exam, now) {
  if (exam.startedAt == null) return exam.durationMinutes * MINUTE_MS;
  return Math.max(0, effectiveEndsAt(exam) - now);
}

/** آیا زمان آزمون (بر اساس ساعت واقعی) تمام شده است؟ */
export function isExpired(exam, now) {
  if (exam.startedAt == null) return false;
  return now >= effectiveEndsAt(exam);
}

/** نسبت زمان سپری‌شده بین ۰ تا ۱ (برای نوار پیشرفت زمان) */
export function elapsedRatio(exam, now) {
  const totalMs = exam.durationMinutes * MINUTE_MS;
  if (totalMs <= 0) return 1;
  const remaining = remainingMs(exam, now);
  return Math.min(1, Math.max(0, 1 - remaining / totalMs));
}

/** ثانیه‌های باقی‌مانده برای نمایش mm:ss — همیشه از clock واقعی */
export function remainingSeconds(exam, now) {
  return Math.ceil(remainingMs(exam, now) / 1000);
}
