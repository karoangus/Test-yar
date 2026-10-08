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
  normalizeStartNumber,
  questionNumber,
  formatQuestionNo,
  formatRange,
  formatAnswerCount,
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

// ── شماره‌گذاری سوال‌ها از شمارهٔ دلخواه (قابلیت «شمارهٔ اولین سوال») ──────────

test('نرمال‌سازی شمارهٔ شروع: خالی/نامعتبر → ۱ و ارقام فارسی پذیرفته می‌شود', () => {
  assert.equal(normalizeStartNumber(''), 1);
  assert.equal(normalizeStartNumber(undefined), 1);
  assert.equal(normalizeStartNumber('abc'), 1);
  assert.equal(normalizeStartNumber('0'), 1);
  assert.equal(normalizeStartNumber('-4'), 1);
  assert.equal(normalizeStartNumber('52'), 52);
  assert.equal(normalizeStartNumber('۵۲'), 52);
  assert.equal(normalizeStartNumber(52), 52);
});

test('شمارهٔ نمایشی سوال‌ها = شمارهٔ شروع + ایندکس', () => {
  assert.equal(questionNumber(0, 1), 1);
  assert.equal(questionNumber(9, 1), 10);
  assert.equal(questionNumber(0, 52), 52);
  assert.equal(questionNumber(10, 52), 62);
  assert.equal(formatQuestionNo(10, 52), 'سوال ۶۲');
});

test('بازهٔ شمارهٔ سوال‌ها درست ساخته می‌شود', () => {
  assert.equal(formatRange(1, 10), '۱ تا ۱۰');
  assert.equal(formatRange(52, 11), '۵۲ تا ۶۲');
  assert.equal(formatRange(52, 1), '۵۲ تا ۵۲');
  assert.equal(formatRange(undefined, 3), '۱ تا ۳');
});

test('شمارندهٔ پاسخ‌ها در آزمون‌های با شمارهٔ شروع دلخواه بازه را هم نشان می‌دهد', () => {
  assert.equal(formatAnswerCount(0, 10, 1), '۰ از ۱۰');
  assert.equal(formatAnswerCount(18, 20, 1), '۱۸ از ۲۰');
  assert.equal(formatAnswerCount(3, 11, 52), '۳ از ۱۱ (سوال ۵۲ تا ۶۲)');
});
