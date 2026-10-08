import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeResults,
  findMissingKeys,
  findUnanswered,
  gradeQuestion,
  isValidOption,
  optionFromKey,
  optionLabel,
  optionNumber,
  optionTitle,
  OPTIONS,
} from '../src/core/scoring.js';
import { formatPercent, roundTo } from '../src/core/format.js';

/** ساخت پاسخ/کلید برای سناریوی ۱: ۱۴ درست، ۴ غلط، ۲ نزده */
function scenario1() {
  const answers = {};
  const key = {};
  for (let i = 0; i < 20; i += 1) key[i] = 'A'; // کلید برای همهٔ سوالات
  for (let i = 0; i < 14; i += 1) answers[i] = 'A'; // ۱۴ درست
  for (let i = 14; i < 18; i += 1) answers[i] = 'B'; // ۴ غلط
  // ۱۸ و ۱۹ بدون پاسخ کاربر → نزده
  return { answers, key };
}

test('سناریو ۱: ۲۰ سوال، ۱۴ درست، ۴ غلط، ۲ نزده', () => {
  const { answers, key } = scenario1();
  const res = computeResults({ total: 20, answers, key });
  assert.equal(res.correct, 14);
  assert.equal(res.wrong, 4);
  assert.equal(res.unanswered, 2);
  assert.equal(res.percentWithoutNegative, 70);
  assert.equal(res.percentWithNegative, ((14 - 4 / 3) / 20) * 100);
  // نمایش: حداکثر دو رقم اعشار
  assert.equal(formatPercent(res.percentWithoutNegative), '۷۰٪');
  assert.equal(formatPercent(res.percentWithNegative), '۶۳٫۳۳٪');
});

test('سناریو ۲: همه درست', () => {
  const answers = {};
  const key = {};
  for (let i = 0; i < 20; i += 1) {
    answers[i] = 'C';
    key[i] = 'C';
  }
  const res = computeResults({ total: 20, answers, key });
  assert.equal(res.correct, 20);
  assert.equal(res.wrong, 0);
  assert.equal(res.unanswered, 0);
  assert.equal(res.percentWithoutNegative, 100);
  assert.equal(res.percentWithNegative, 100);
  assert.equal(formatPercent(res.percentWithNegative), '۱۰۰٪');
});

test('سناریو ۳: همه غلط', () => {
  const answers = {};
  const key = {};
  for (let i = 0; i < 20; i += 1) {
    answers[i] = 'D';
    key[i] = 'A';
  }
  const res = computeResults({ total: 20, answers, key });
  assert.equal(res.correct, 0);
  assert.equal(res.wrong, 20);
  assert.equal(res.unanswered, 0);
  assert.equal(res.percentWithoutNegative, 0);
  assert.equal(res.percentWithNegative, ((0 - 20 / 3) / 20) * 100);
  assert.equal(formatPercent(res.percentWithNegative), '−۳۳٫۳۳٪');
});

test('سناریو ۴: همه نزده', () => {
  const key = {};
  for (let i = 0; i < 20; i += 1) key[i] = 'A';
  const res = computeResults({ total: 20, answers: {}, key });
  assert.equal(res.correct, 0);
  assert.equal(res.wrong, 0);
  assert.equal(res.unanswered, 20);
  assert.equal(res.percentWithoutNegative, 0);
  assert.equal(res.percentWithNegative, 0);
});

test('سناریو ۹: دقت اعشاری و جدایی مقدار خام از نمایش', () => {
  const { answers, key } = scenario1();
  const res = computeResults({ total: 20, answers, key });
  // مقدار خام کامل نگه داشته می‌شود
  assert.notEqual(res.percentWithNegative, roundTo(res.percentWithNegative, 2));
  // گرد کردن فقط در نمایش
  assert.equal(roundTo(0.1 + 0.2, 2), 0.3);
  assert.equal(roundTo(66.66666666666667, 2), 66.67);
  assert.equal(roundTo(63.333333333333336, 2), 63.33);
  assert.equal(roundTo(99.999, 2), 100);
  assert.equal(formatPercent(68.333333333), '۶۸٫۳۳٪');
  assert.equal(formatPercent(33.335 + 0.0000001, ), '۳۳٫۳۴٪');
});

test('وضعیت هر سوال طبق قانون درست/غلط/نزده', () => {
  assert.equal(gradeQuestion('A', 'A'), 'correct');
  assert.equal(gradeQuestion('B', 'A'), 'wrong');
  assert.equal(gradeQuestion(null, 'A'), 'unanswered');
  assert.equal(gradeQuestion(undefined, 'A'), 'unanswered');
  assert.throws(() => gradeQuestion('A', undefined));
});

test('کلید ناقص شناسایی و محاسبه رد می‌شود', () => {
  assert.deepEqual(findMissingKeys(3, { 0: 'A' }), [1, 2]);
  assert.deepEqual(findMissingKeys(3, { 0: 'A', 1: 'X', 2: 'C' }), [1]);
  assert.throws(() => computeResults({ total: 3, answers: {}, key: { 0: 'A' } }));
  assert.throws(() => computeResults({ total: 0, answers: {}, key: {} }));
});

test('گزینه‌ها عددی هستند: ۱ · ۲ · ۳ · ۴ (نه الف/ب/ج/د)', () => {
  assert.deepEqual(OPTIONS.map((o) => o.label), ['۱', '۲', '۳', '۴']);
  assert.deepEqual(OPTIONS.map((o) => o.id), ['A', 'B', 'C', 'D']);
  assert.equal(optionLabel('A'), '۱');
  assert.equal(optionLabel('D'), '۴');
  assert.equal(optionLabel('X'), '—');
  assert.equal(optionNumber('C'), 3);
  assert.equal(optionTitle('B'), 'گزینه ۲');
  for (const opt of OPTIONS) {
    assert.equal(isValidOption(opt.id), true);
  }
  assert.equal(isValidOption('الف'), false);
});

test('میان‌بُر کیبورد ارقام فارسی و لاتین را به گزینه تبدیل می‌کند', () => {
  assert.equal(optionFromKey('1'), 'A');
  assert.equal(optionFromKey('۴'), 'D');
  assert.equal(optionFromKey('d'), 'D');
  assert.equal(optionFromKey('9'), null);
  assert.equal(optionFromKey(''), null);
  assert.equal(optionFromKey(null), null);
});

test('فهرست سوال‌های بی‌پاسخ', () => {
  assert.deepEqual(findUnanswered(4, { 0: 'A', 2: 'C' }), [1, 3]);
  assert.deepEqual(findUnanswered(3, { 0: 'X' }), [0, 1, 2]);
  assert.deepEqual(findUnanswered(2, {}), [0, 1]);
});
