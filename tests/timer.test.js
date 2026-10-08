import test from 'node:test';
import assert from 'node:assert/strict';
import {
  scheduledEndsAt,
  scheduledEndOfExam,
  effectiveEndsAt,
  remainingMs,
  remainingSeconds,
  isExpired,
  isPaused,
  elapsedRatio,
  activeElapsedSeconds,
  pauseDurationMs,
} from '../src/core/timer.js';
import { formatClock } from '../src/core/format.js';

const T0 = 1_700_000_000_000;
const exam = (over = {}) => ({ startedAt: T0, durationMinutes: 30, endedAt: null, ...over });

test('پایان برنامه‌ریزی‌شده از روی شروع + مدت محاسبه می‌شود', () => {
  assert.equal(scheduledEndsAt(T0, 30), T0 + 30 * 60_000);
  assert.equal(scheduledEndsAt(T0, 0.5), T0 + 30_000);
});

test('زمان باقی‌مانده از ساعت واقعی کم می‌شود و هرگز منفی نیست', () => {
  const e = exam();
  assert.equal(remainingMs(e, T0), 1_800_000);
  assert.equal(remainingMs(e, T0 + 60_000), 1_740_000);
  assert.equal(remainingMs(e, T0 + 1_800_000), 0);
  assert.equal(remainingMs(e, T0 + 9_999_999), 0);
  assert.equal(remainingSeconds(e, T0 + 60_000), 1740);
  assert.equal(formatClock(remainingSeconds(e, T0 + 60_000)), '۲۹:۰۰');
});

test('انقضا دقیقاً در لحظهٔ پایان و بعد از آن', () => {
  const e = exam();
  assert.equal(isExpired(e, T0 + 1_799_999), false);
  assert.equal(isExpired(e, T0 + 1_800_000), true);
  assert.equal(isExpired(e, T0 + 1_800_001), true);
});

test('پایان دستی زودتر از موعد، مهلت مؤثر را جلو می‌اندازد', () => {
  const e = exam({ endedAt: T0 + 600_000 });
  assert.equal(effectiveEndsAt(e), T0 + 600_000);
  assert.equal(isExpired(e, T0 + 600_000), true);
  assert.equal(remainingMs(e, T0 + 600_000), 0);
});

test('سناریو ۶: بستن و بازکردن برنامه وسط آزمون — زمان از ساعت واقعی', () => {
  // آزمون ۱۰ دقیقه‌ای که ۴ دقیقه پیش شروع شده
  const e = exam({ durationMinutes: 10, startedAt: T0 });
  assert.equal(isExpired(e, T0 + 4 * 60_000), false);
  assert.equal(remainingSeconds(e, T0 + 4 * 60_000), 360); // ۶ دقیقه باقی
});

test('سناریو ۷: بازکردن برنامه بعد از تمام‌شدن زمان — منقضی', () => {
  const e = exam({ durationMinutes: 10, startedAt: T0 });
  assert.equal(isExpired(e, T0 + 11 * 60_000), true);
  assert.equal(remainingMs(e, T0 + 11 * 60_000), 0);
});

test('نسبت زمان سپری‌شده محدود به بازهٔ ۰ تا ۱', () => {
  const e = exam();
  assert.equal(elapsedRatio(e, T0), 0);
  assert.equal(elapsedRatio(e, T0 + 900_000), 0.5);
  assert.equal(elapsedRatio(e, T0 + 9_000_000), 1);
});

// ── توقف و ادامهٔ تایمر ──────────────────────────────────────────────────────

test('توقف تایمر زمان را مصرف نمی‌کند و مهلت را جلو می‌برد', () => {
  const e = exam({ durationMinutes: 10 });
  // ۲ دقیقه از آزمون گذشته و تایمر متوقف شده
  const paused = { ...e, pausedAt: T0 + 2 * 60_000, pausedTotalMs: 0, pauseCount: 1 };
  assert.equal(isPaused(paused), true);
  assert.equal(remainingSeconds(paused, T0 + 2 * 60_000), 480);
  // ۱۰ دقیقه بعد هم که برگردیم، همان ۸ دقیقه باقی است (زمان فریز)
  assert.equal(remainingSeconds(paused, T0 + 12 * 60_000), 480);
  assert.equal(isExpired(paused, T0 + 12 * 60_000), false);
  assert.equal(pauseDurationMs(paused, T0 + 3 * 60_000), 60_000);

  // ادامه: زمان توقف به مهلت اضافه می‌شود
  const resumed = { ...paused, pausedAt: null, pausedTotalMs: 10 * 60_000 };
  assert.equal(remainingSeconds(resumed, T0 + 12 * 60_000), 480);
  assert.equal(isExpired(resumed, T0 + 12 * 60_000), false);
  assert.equal(remainingSeconds(resumed, T0 + 20 * 60_000), 0);
  assert.equal(isExpired(resumed, T0 + 20 * 60_000), true);
  assert.equal(pauseDurationMs(resumed, T0 + 20 * 60_000), 10 * 60_000);
});

test('چند توقف پشت‌سرهم مجموع توقف‌ها را درست جمع می‌زند', () => {
  const e = exam({ durationMinutes: 5 });
  const first = { ...e, pausedAt: T0 + 60_000, pausedTotalMs: 0 };
  const second = { ...first, pausedAt: null, pausedTotalMs: 2 * 60_000 };
  const third = { ...second, pausedAt: T0 + 4 * 60_000, pausedTotalMs: 2 * 60_000 };
  assert.equal(remainingSeconds(third, T0 + 3 * 60_000), 240); // ۱ دقیقه فعال مصرف شده
  assert.equal(pauseDurationMs(third, T0 + 4 * 60_000 + 30_000), 2 * 60_000 + 30_000);
});

test('نسبت زمان سپری‌شده بر پایهٔ زمان فعال (بدون توقف) است', () => {
  const e = exam({ durationMinutes: 10 });
  const paused = { ...e, pausedAt: T0 + 3 * 60_000, pausedTotalMs: 60_000 };
  assert.equal(elapsedRatio(paused, T0 + 5 * 60_000), 0.2); // ۲ دقیقه فعال از ۱۰ دقیقه
  assert.equal(activeElapsedSeconds(paused, T0 + 9 * 60_000), 120);
});

test('آزمون متوقف هرگز منقضی نمی‌شود', () => {
  const e = exam({ durationMinutes: 1 });
  const paused = { ...e, pausedAt: T0 + 30_000, pausedTotalMs: 0 };
  assert.equal(isExpired(paused, T0 + 999_999), false);
  assert.equal(scheduledEndOfExam(paused), T0 + 60_000);
  assert.equal(effectiveEndsAt(paused), T0 + 60_000);
});
