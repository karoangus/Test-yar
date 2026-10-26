// ── تکرار آزمون با کلید به‌ارث‌رسیده و تصحیح خودکار ──────────────────────────
// سناریو: آزمونی تصحیح شده، تکرار می‌شود و آزمون تازه بدون وارد کردن دوبارهٔ
// کلیدها، پس از پایان به‌صورت خودکار تصحیح می‌شود.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppStore, DomainError } from '../src/core/store.js';
import { STATUS, hasCompleteKey, isAutoGradeReady } from '../src/core/model.js';
import { sanitizeExam, sanitizeKeyOrigin, serializeBackup, parseBackup, BACKUP_VERSION } from '../src/core/storage.js';

const T0 = 1_700_000_000_000;

function memBackend() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, v),
    removeItem: (k) => m.delete(k),
  };
}

function makeStore() {
  const backend = memBackend();
  const clock = { value: T0 };
  const store = createAppStore({ storage: backend, now: () => clock.value });
  return { backend, clock, store };
}

/** یک آزمون ۳ سوالی کاملاً تصحیح‌شده می‌سازد: ۲ درست، ۱ غلط */
function createGradedExam(store, clock) {
  const exam = store.addExam({ name: 'عربی درس ۱', questionCount: 3, durationMinutes: 10, category: 'عربی' });
  store.startExam(exam.id);
  clock.value += 60_000;
  store.setAnswer(exam.id, 0, 'A');
  store.setAnswer(exam.id, 1, 'B');
  store.setAnswer(exam.id, 2, 'C');
  store.endExamManually(exam.id);
  store.setKeyEntry(exam.id, 0, 'A');
  store.setKeyEntry(exam.id, 1, 'A');
  store.setKeyEntry(exam.id, 2, 'C');
  const done = store.finishGrading(exam.id);
  assert.equal(done.ok, true);
  return store.get(exam.id);
}

test('تکرار آزمون تصحیح‌شده: کلید منتقل می‌شود، پاسخ‌ها نه', () => {
  const { store, clock } = makeStore();
  const source = createGradedExam(store, clock);

  const copy = store.duplicateExam(source.id);
  assert.equal(copy.status, STATUS.CREATED);
  assert.deepEqual(copy.answers, {}, 'پاسخ‌های آزمون قبلی منتقل نمی‌شوند');
  assert.deepEqual(copy.key, { 0: 'A', 1: 'A', 2: 'C' }, 'کلید کامل به ارث می‌رسد');
  assert.equal(copy.keyOrigin.examId, source.id);
  assert.equal(copy.keyOrigin.examName, source.name);
  assert.equal(copy.result, null);
  assert.equal(hasCompleteKey(copy), true);
  assert.equal(isAutoGradeReady(copy), true, 'آمادهٔ تصحیح خودکار');

  // مبدأ دست‌نخورده می‌ماند
  assert.equal(store.get(source.id).status, STATUS.GRADED);
  assert.equal(store.get(source.id).keyOrigin, null);
});

test('آزمون تکرارشده پس از پایان دستی بدون وارد کردن کلید خودکار تصحیح می‌شود', () => {
  const { store, clock, backend } = makeStore();
  const source = createGradedExam(store, clock);
  const copy = store.duplicateExam(source.id);

  store.startExam(copy.id);
  clock.value += 2 * 60_000;
  store.setAnswer(copy.id, 0, 'A'); // درست
  store.setAnswer(copy.id, 1, 'C'); // غلط
  // سوال ۳ نزده
  store.endExamManually(copy.id);

  const graded = store.get(copy.id);
  assert.equal(graded.status, STATUS.GRADED, 'بدون توقف در تصحیح‌کننده مستقیم تصحیح می‌شود');
  assert.equal(graded.result.correct, 1);
  assert.equal(graded.result.wrong, 1);
  assert.equal(graded.result.unanswered, 1);
  assert.equal(graded.result.percentWithoutNegative, (1 / 3) * 100);
  assert.equal(graded.result.perQuestion.length, 3);
  assert.equal(graded.keyOrigin.examId, source.id, 'منبع کلید در دادهٔ ذخیره‌شده می‌ماند');
  assert.ok(graded.gradedAt > 0);

  // پس از بستن و باز کردن برنامه، همه‌چیز حفظ می‌شود
  const reopened = createAppStore({ storage: backend, now: () => clock.value });
  const saved = reopened.get(copy.id);
  assert.equal(saved.status, STATUS.GRADED);
  assert.equal(saved.keyOrigin.examName, source.name);
  assert.equal(saved.result.correct, 1);
});

test('پس از اتمام زمان، «ورود به تصحیح‌کننده» آزمون تکرارشده را خودکار تصحیح می‌کند', () => {
  const { store, clock } = makeStore();
  const source = createGradedExam(store, clock);
  const copy = store.duplicateExam(source.id);

  store.startExam(copy.id);
  store.setAnswer(copy.id, 0, 'A');
  store.setAnswer(copy.id, 1, 'A');
  store.setAnswer(copy.id, 2, 'C');

  clock.value += 11 * 60_000;
  store.refresh();
  assert.equal(store.get(copy.id).status, STATUS.TIME_UP);

  store.enterGrading(copy.id);
  const graded = store.get(copy.id);
  assert.equal(graded.status, STATUS.GRADED);
  assert.equal(graded.result.correct, 3);
  assert.equal(graded.result.percentWithNegative, 100);
});

test('آزمون بدون کلید یا با کلید ناقص به‌ارث نمی‌رسد و تصحیح دستی می‌ماند', () => {
  const { store, clock } = makeStore();
  const raw = store.addExam({ name: 'بدون کلید', questionCount: 2, durationMinutes: 5, category: 'منطق' });
  store.startExam(raw.id);
  store.endExamManually(raw.id);

  const noKeyCopy = store.duplicateExam(raw.id);
  assert.equal(noKeyCopy.keyOrigin, null);
  assert.deepEqual(noKeyCopy.key, {});
  assert.equal(isAutoGradeReady(noKeyCopy), false);

  // تکرار بدون انتقال کلید، حتی وقتی مبدأ کلید کامل دارد
  const source = createGradedExam(store, clock);
  const optOut = store.duplicateExam(source.id, { inheritKey: false });
  assert.equal(optOut.keyOrigin, null);
  assert.deepEqual(optOut.key, {});
});

test('«ورود کلید جدید» کلید به‌ارث‌رسیده را پیش از شروع پاک می‌کند', () => {
  const { store, clock } = makeStore();
  const source = createGradedExam(store, clock);
  const copy = store.duplicateExam(source.id);

  const cleared = store.clearInheritedKey(copy.id);
  assert.deepEqual(cleared.key, {});
  assert.equal(cleared.keyOrigin, null);
  assert.equal(isAutoGradeReady(cleared), false);

  store.startExam(copy.id);
  assert.throws(() => store.clearInheritedKey(copy.id), DomainError, 'پس از شروع قابل تغییر نیست');
  store.endExamManually(copy.id);
  assert.equal(store.get(copy.id).status, STATUS.AWAITING_GRADING, 'با کلید خالی، تصحیح دستی است');
});

test('نام تکراری‌ها تودرتو نمی‌شود و شماره می‌گیرد', () => {
  const { store, clock } = makeStore();
  const source = createGradedExam(store, clock);
  const first = store.duplicateExam(source.id);
  const second = store.duplicateExam(first.id);

  assert.match(first.name, /\(تکرار\)$/);
  assert.match(second.name, /\(تکرار ۲\)$/);
  assert.equal(second.keyOrigin.examId, source.id, 'منبع اصلی کلید حفظ می‌شود');
});

test('کلید به‌ارث‌رسیده از فایل پشتیبان و دادهٔ ذخیره‌شده سالم برمی‌گردد', () => {
  const { store, clock } = makeStore();
  const source = createGradedExam(store, clock);
  const copy = store.duplicateExam(source.id);
  store.startExam(copy.id);
  store.endExamManually(copy.id);

  const text = store.exportBackup();
  const parsed = JSON.parse(text);
  assert.equal(parsed.version, BACKUP_VERSION);
  const back = parseBackup(text);
  assert.equal(back.ok, true);
  const restored = back.exams.find((e) => e.id === copy.id);
  assert.ok(restored);
  assert.equal(restored.keyOrigin.examId, source.id);
  assert.equal(restored.status, STATUS.GRADED);
  assert.deepEqual(restored.key, copy.key);
});

test('منبع کلید نامعتبر در دادهٔ خراب نادیده گرفته می‌شود', () => {
  assert.equal(sanitizeKeyOrigin(null), null);
  assert.equal(sanitizeKeyOrigin({}), null);
  assert.equal(sanitizeKeyOrigin({ examId: '' }), null);
  assert.equal(sanitizeKeyOrigin('x'), null);
  assert.equal(sanitizeKeyOrigin([]), null);

  const origin = sanitizeKeyOrigin({ examId: ' src ', examName: '  آزمون مبدأ ', at: 42 });
  assert.deepEqual(origin, { examId: 'src', examName: 'آزمون مبدأ', at: 42 });

  const base = {
    id: 'x1',
    name: 'آزمون',
    category: 'عربی',
    questionCount: 2,
    durationMinutes: 10,
    status: STATUS.CREATED,
    createdAt: 1000,
    answers: {},
    key: { 0: 'A', 1: 'B' },
    result: null,
  };
  assert.equal(sanitizeExam(base).keyOrigin, null, 'دادهٔ نسخهٔ قبل فیلد منبع کلید ندارد');
  const withOrigin = sanitizeExam({ ...base, keyOrigin: { examId: 'src', examName: 'قبلی', at: 5 } });
  assert.equal(withOrigin.keyOrigin.examId, 'src');
  assert.equal(isAutoGradeReady(withOrigin), true);
});

test('hasCompleteKey مرزها را درست تشخیص می‌دهد', () => {
  assert.equal(hasCompleteKey(null), false);
  assert.equal(hasCompleteKey({ questionCount: 2, key: { 0: 'A' } }), false);
  assert.equal(hasCompleteKey({ questionCount: 2, key: { 0: 'A', 1: 'D' } }), true);
  assert.equal(hasCompleteKey({ questionCount: 2, key: { 0: 'A', 1: 'Z' } }), false);
  assert.equal(isAutoGradeReady({ questionCount: 1, key: { 0: 'A' }, keyOrigin: null }), false);
  assert.equal(
    isAutoGradeReady({ questionCount: 1, key: { 0: 'A' }, keyOrigin: { examId: 's', examName: 's' } }),
    true,
  );
});
