import test from 'node:test';
import assert from 'node:assert/strict';
import { validateExamInput, createExam, currentPhase, canAnswer, STATUS, CATEGORIES } from '../src/core/model.js';

const T0 = 1_700_000_000_000;
const valid = { name: 'آزمون عربی', questionCount: '20', durationMinutes: '30', category: 'عربی' };

test('ورودی معتبر پذیرفته و نرمال می‌شود', () => {
  const res = validateExamInput(valid);
  assert.equal(res.ok, true);
  assert.deepEqual(res.values, { name: 'آزمون عربی', questionCount: 20, durationMinutes: 30, category: 'عربی' });
});

test('نام خالی رد می‌شود', () => {
  const res = validateExamInput({ ...valid, name: '   ' });
  assert.equal(res.ok, false);
  assert.ok(res.errors.name);
});

test('تعداد سوالات: فقط عدد صحیح مثبت', () => {
  for (const bad of ['0', '-3', 'abc', '1.5', '', '۰']) {
    const res = validateExamInput({ ...valid, questionCount: bad });
    assert.equal(res.ok, false, `باید رد شود: ${bad}`);
    assert.ok(res.errors.questionCount);
  }
  const ok = validateExamInput({ ...valid, questionCount: '۲۰' });
  assert.equal(ok.ok, true);
  assert.equal(ok.values.questionCount, 20);
});

test('زمان آزمون: فقط عدد مثبت', () => {
  for (const bad of ['0', '-10', 'xyz', '', null]) {
    const res = validateExamInput({ ...valid, durationMinutes: bad });
    assert.equal(res.ok, false, `باید رد شود: ${bad}`);
    assert.ok(res.errors.duration);
  }
  const ok = validateExamInput({ ...valid, durationMinutes: '۴۵' });
  assert.equal(ok.ok, true);
  assert.equal(ok.values.durationMinutes, 45);
});

test('دسته‌بندی باید از فهرست معتبر باشد و «سایر» هم هست', () => {
  assert.ok(CATEGORIES.includes('سایر'));
  assert.equal(validateExamInput({ ...valid, category: 'ناموجود' }).ok, false);
  assert.equal(validateExamInput({ ...valid, category: 'سایر' }).ok, true);
});

test('آزمون جدید با وضعیت ساخته‌شده و بدون پاسخ/کلید', () => {
  const exam = createExam(valid, T0);
  assert.equal(exam.status, STATUS.CREATED);
  assert.equal(exam.createdAt, T0);
  assert.equal(exam.startedAt, null);
  assert.deepEqual(exam.answers, {});
  assert.deepEqual(exam.key, {});
  assert.equal(exam.result, null);
  assert.throws(() => createExam({ ...valid, name: '' }, T0));
});

test('فاز جاری و مجوز پاسخ‌دهی در هر وضعیت', () => {
  const base = createExam(valid, T0);

  const running = { ...base, status: STATUS.IN_PROGRESS, startedAt: T0 };
  assert.equal(currentPhase(running, T0 + 1000), 'running');
  assert.equal(canAnswer(running, T0 + 1000), true);

  assert.equal(currentPhase(running, T0 + 30 * 60_000), 'expired');
  assert.equal(canAnswer(running, T0 + 30 * 60_000), false);

  const timeUp = { ...base, status: STATUS.TIME_UP, startedAt: T0 };
  assert.equal(currentPhase(timeUp, T0), 'expired');

  const grading = { ...base, status: STATUS.AWAITING_GRADING };
  assert.equal(currentPhase(grading, T0), 'grading');
  assert.equal(canAnswer(grading, T0), false);

  const graded = { ...base, status: STATUS.GRADED };
  assert.equal(currentPhase(graded, T0), 'graded');

  assert.equal(currentPhase(base, T0), 'ready');
  assert.equal(canAnswer(base, T0), false);
});
