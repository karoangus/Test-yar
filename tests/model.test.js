import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateExamInput,
  validateExamMeta,
  createExam,
  currentPhase,
  canAnswer,
  isLocked,
  isLive,
  startNumberOf,
  STATUS,
  CATEGORIES,
  MAX_START_NUMBER,
} from '../src/core/model.js';

const T0 = 1_700_000_000_000;
const valid = { name: 'آزمون عربی', questionCount: '20', durationMinutes: '30', category: 'عربی' };

test('ورودی معتبر پذیرفته و نرمال می‌شود', () => {
  const res = validateExamInput(valid);
  assert.equal(res.ok, true);
  assert.deepEqual(res.values, {
    name: 'آزمون عربی',
    questionCount: 20,
    durationMinutes: 30,
    category: 'عربی',
    startNumber: 1,
  });
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

test('فاز «متوقف» و قواعد پاسخ‌دهی در حین توقف', () => {
  const base = createExam(valid, T0);
  const paused = { ...base, status: STATUS.IN_PROGRESS, startedAt: T0, pausedAt: T0 + 60_000, pausedTotalMs: 0 };
  assert.equal(currentPhase(paused, T0 + 10 * 60_000), 'paused');
  assert.equal(canAnswer(paused, T0 + 10 * 60_000), false);
  assert.equal(isLocked(paused, T0 + 10 * 60_000), false, 'توقف قفل دائمی نیست');
  assert.equal(isLive(paused), true);

  // پس از ادامه، فاز اجرا برمی‌گردد
  const resumed = { ...paused, pausedAt: null, pausedTotalMs: 5 * 60_000 };
  assert.equal(currentPhase(resumed, T0 + 11 * 60_000), 'running');
  assert.equal(canAnswer(resumed, T0 + 11 * 60_000), true);
  // پایان مهلت با احتساب ۵ دقیقه توقف: ۳۰ + ۵ = ۳۵ دقیقه پس از شروع
  assert.equal(currentPhase(resumed, T0 + 34 * 60_000), 'running');
  assert.equal(currentPhase(resumed, T0 + 35 * 60_000), 'expired');
});

test('آزمون «در حال انجام» بدون زمان شروع به‌عنوان آماده در نظر گرفته می‌شود', () => {
  const base = createExam(valid, T0);
  const broken = { ...base, status: STATUS.IN_PROGRESS, startedAt: null };
  assert.equal(currentPhase(broken, T0), 'ready');
  assert.equal(canAnswer(broken, T0), false);
  assert.equal(isLive(broken), false);
});

test('اعتبارسنجی متادیتا برای ویرایش نام و دسته‌بندی', () => {
  assert.equal(validateExamMeta({ name: 'نام تازه', category: 'تاریخ' }).ok, true);
  const bad = validateExamMeta({ name: '   ', category: 'تاریخ' });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.name);
  assert.equal(validateExamMeta({ name: 'خ', category: 'ندارد' }).ok, false);
  const longName = 'ا'.repeat(81);
  assert.equal(validateExamMeta({ name: longName, category: 'تاریخ' }).ok, false);
  assert.equal(validateExamInput({ ...valid, name: longName }).ok, false);
});

test('آزمون جدید فیلدهای توقف را با مقدار پاک شروع می‌کند', () => {
  const exam = createExam(valid, T0);
  assert.equal(exam.pausedAt, null);
  assert.equal(exam.pausedTotalMs, 0);
  assert.equal(exam.pauseCount, 0);
});

// ── شمارهٔ اولین سوال ───────────────────────────────────────────────────────

test('شمارهٔ اولین سوال: پیش‌فرض ۱، فقط عدد صحیح مثبت و با سقف مشخص', () => {
  assert.equal(validateExamInput(valid).values.startNumber, 1);
  assert.equal(validateExamInput({ ...valid, startNumber: '' }).values.startNumber, 1);
  assert.equal(validateExamInput({ ...valid, startNumber: '۵۲' }).values.startNumber, 52);
  assert.equal(validateExamInput({ ...valid, startNumber: 1 }).values.startNumber, 1);
  assert.equal(validateExamInput({ ...valid, startNumber: String(MAX_START_NUMBER) }).values.startNumber, MAX_START_NUMBER);

  for (const bad of ['0', '-5', 'abc', '2.5', String(MAX_START_NUMBER + 1)]) {
    const res = validateExamInput({ ...valid, startNumber: bad });
    assert.equal(res.ok, false, `باید رد شود: ${bad}`);
    assert.ok(res.errors.startNumber);
  }
});

test('آزمون ساخته‌شده شمارهٔ شروع را نگه می‌دارد و شمارهٔ نمایشی می‌دهد', () => {
  const exam = createExam({ ...valid, questionCount: 11, startNumber: '52' }, T0);
  assert.equal(exam.startNumber, 52);
  assert.equal(startNumberOf(exam), 52);
  // دادهٔ قدیمی بدون startNumber → شماره‌ها از ۱ شروع می‌شوند
  assert.equal(startNumberOf({ questionCount: 3 }), 1);
  assert.equal(startNumberOf({ startNumber: 0 }), 1);
  assert.equal(startNumberOf(null), 1);
});

test('ویرایش متادیتا: شمارهٔ شروع اختیاری است و فقط وقتی فرستاده شود تغییر می‌کند', () => {
  const keep = validateExamMeta({ name: 'آزمون', category: 'عربی' });
  assert.equal(keep.ok, true);
  assert.equal('startNumber' in keep.values, false, 'اگر فرستاده نشود دست‌نخورده می‌ماند');

  const change = validateExamMeta({ name: 'آزمون', category: 'عربی', startNumber: '۱۰۱' });
  assert.equal(change.ok, true);
  assert.equal(change.values.startNumber, 101);

  const bad = validateExamMeta({ name: 'آزمون', category: 'عربی', startNumber: '۰' });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.startNumber);
});
