import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduledEndsAt, effectiveEndsAt, remainingMs, remainingSeconds, isExpired, elapsedRatio } from '../src/core/timer.js';
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
