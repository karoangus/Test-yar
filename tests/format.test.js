import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatDuration,
  formatSeconds,
  formatClock,
  formatPercent,
  formatScoreOutOf20,
  formatRelativeTime,
  normalizeDigits,
  roundTo,
  toFa,
} from '../src/core/format.js';

const T0 = 1_700_000_000_000;

test('قالب‌بندی مدت هرگز «۶۰ دقیقه» یا «۱ ساعت و ۶۰ دقیقه» نمی‌دهد', () => {
  // باگ قدیمی: Math.round(m % 60) می‌توانست ۶۰ شود
  assert.equal(formatDuration(59.6), '۱ ساعت');
  assert.equal(formatDuration(59.7), '۱ ساعت');
  assert.equal(formatDuration(119.6), '۲ ساعت');
  assert.equal(formatDuration(90), '۱ ساعت و ۳۰ دقیقه');
  assert.equal(formatDuration(45), '۴۵ دقیقه');
  assert.equal(formatDuration(0.4), 'کمتر از یک دقیقه');
  assert.equal(formatDuration(0), '—');
  assert.equal(formatDuration(-5), '—');
  assert.equal(formatDuration(NaN), '—');
  assert.equal(formatDuration(24 * 60), '۲۴ ساعت');
});

test('قالب‌بندی ثانیه برای زمان‌های توقف', () => {
  assert.equal(formatSeconds(0), '۰ ثانیه');
  assert.equal(formatSeconds(45), '۴۵ ثانیه');
  assert.equal(formatSeconds(60), '۱ دقیقه');
  assert.equal(formatSeconds(90), '۱ دقیقه و ۳۰ ثانیه');
  assert.equal(formatSeconds(3600), '۱ ساعت');
  assert.equal(formatSeconds(3660), '۱ ساعت و ۱ دقیقه');
});

test('ساعت و درصد با ارقام فارسی', () => {
  assert.equal(formatClock(1799), '۲۹:۵۹');
  assert.equal(formatClock(-10), '۰۰:۰۰');
  assert.equal(formatPercent(63.335), '۶۳٫۳۴٪');
  assert.equal(formatPercent(NaN), '—');
  assert.equal(toFa(-1.5), '−۱٫۵');
});

test('نرمال‌سازی ارقام فارسی/عربی و جداکننده‌های مختلف', () => {
  assert.equal(normalizeDigits('۱۲۳'), '123');
  assert.equal(normalizeDigits('٤٥٦'), '456');
  assert.equal(normalizeDigits(' ۲۵ '), '25');
  assert.equal(normalizeDigits('۳٫۵'), '3.5');
  assert.equal(normalizeDigits('۳,۵'), '3.5');
  assert.equal(normalizeDigits(null), '');
});

test('نمرهٔ ۲۰ و فاصلهٔ زمانی نسبی', () => {
  assert.equal(formatScoreOutOf20(100), '۲۰ از ۲۰');
  assert.equal(formatScoreOutOf20(70), '۱۴ از ۲۰');
  assert.equal(formatScoreOutOf20(0), '۰ از ۲۰');
  assert.equal(formatRelativeTime(T0 - 30_000, T0), 'همین حالا');
  assert.equal(formatRelativeTime(T0 - 3 * 60_000, T0), '۳ دقیقه پیش');
  assert.equal(formatRelativeTime(T0 - 5 * 3600_000, T0), '۵ ساعت پیش');
  assert.equal(formatRelativeTime(T0 - 26 * 3600_000, T0), 'دیروز');
  assert.equal(formatRelativeTime(T0 - 3 * 24 * 3600_000, T0), '۳ روز پیش');
});

test('گرد کردن بدون خطای اعشاری', () => {
  assert.equal(roundTo(0.1 + 0.2, 2), 0.3);
  assert.equal(roundTo(-63.335, 2), -63.34);
  assert.ok(Number.isNaN(roundTo(NaN)));
});
