import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppStore, DomainError } from '../src/core/store.js';
import { STATUS } from '../src/core/model.js';
import { STORAGE_KEY } from '../src/core/storage.js';

const T0 = 1_700_000_000_000;

function memBackend() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, v),
    removeItem: (k) => m.delete(k),
  };
}

function makeStore(fakeClock) {
  const backend = memBackend();
  const store = createAppStore({ storage: backend, now: () => fakeClock.value });
  return { backend, store };
}

const valid = { name: 'آزمون عربی', questionCount: 20, durationMinutes: 30, category: 'عربی' };

test('ساخت آزمون با ورودی نامعتبر خطای دامنه با جزئیات می‌دهد', () => {
  const { store } = makeStore({ value: T0 });
  assert.throws(() => store.addExam({ ...valid, name: '' }), DomainError);
  try {
    store.addExam({ ...valid, questionCount: 'abc' });
    assert.fail('باید خطا می‌داد');
  } catch (e) {
    assert.ok(e.errors.questionCount);
  }
});

test('هر تغییر بلافاصله persist می‌شود (پاسخ‌ها گم نمی‌شوند)', () => {
  const clock = { value: T0 };
  const { backend, store } = makeStore(clock);
  const exam = store.addExam(valid);
  store.startExam(exam.id);
  store.setAnswer(exam.id, 0, 'A');
  const saved = JSON.parse(backend.getItem(STORAGE_KEY));
  assert.equal(saved.length, 1);
  assert.equal(saved[0].status, STATUS.IN_PROGRESS);
  assert.equal(saved[0].answers['0'], 'A');
  assert.equal(saved[0].startedAt, T0);
});

test('سناریو ۵: پس از پایان زمان، قفل کامل و رد تغییر پاسخ', () => {
  const clock = { value: T0 };
  const { store } = makeStore(clock);
  const exam = store.addExam(valid);
  store.startExam(exam.id);
  store.setAnswer(exam.id, 0, 'A');

  clock.value = T0 + 31 * 60_000; // زمان تمام شد
  store.refresh();
  const locked = store.get(exam.id);
  assert.equal(locked.status, STATUS.TIME_UP);
  assert.equal(locked.endedAt, T0 + 30 * 60_000);

  assert.throws(() => store.setAnswer(exam.id, 0, 'B'), DomainError);
  assert.throws(() => store.setAnswer(exam.id, 5, 'C'), DomainError);
  assert.equal(store.get(exam.id).answers[0], 'A'); // پاسخ دست‌نخورده
});

test('سناریو ۶/۷: راه‌اندازی مجدد مخزن، وضعیت را با ساعت واقعی همگام می‌کند', () => {
  const backend = memBackend();
  const clock = { value: T0 };
  const store1 = createAppStore({ storage: backend, now: () => clock.value });
  const exam = store1.addExam(valid);
  store1.startExam(exam.id);
  store1.setAnswer(exam.id, 3, 'C');

  // برنامه بسته شد؛ ۴۰ دقیقه بعد باز می‌شود
  clock.value = T0 + 40 * 60_000;
  const store2 = createAppStore({ storage: backend, now: () => clock.value });
  const reopened = store2.get(exam.id);
  assert.equal(reopened.status, STATUS.TIME_UP);
  assert.equal(reopened.answers[3], 'C');
});

test('سناریو ۸: پایان دستی پیش از موعد به تصحیح می‌رود', () => {
  const clock = { value: T0 };
  const { store } = makeStore(clock);
  const exam = store.addExam(valid);
  store.startExam(exam.id);
  clock.value = T0 + 5 * 60_000;
  store.endExamManually(exam.id);
  const e = store.get(exam.id);
  assert.equal(e.status, STATUS.AWAITING_GRADING);
  assert.equal(e.endedAt, T0 + 5 * 60_000);
});

test('چرخهٔ کامل تصحیح: هشدار کلید ناقص، سپس محاسبهٔ دقیق', () => {
  const clock = { value: T0 };
  const { store } = makeStore(clock);
  const exam = store.addExam(valid);
  store.startExam(exam.id);
  for (let i = 0; i < 18; i += 1) store.setAnswer(exam.id, i, 'A');
  clock.value = T0 + 31 * 60_000;
  store.refresh();
  store.enterGrading(exam.id);
  assert.equal(store.get(exam.id).status, STATUS.AWAITING_GRADING);

  // کلید ناقص → هشدار
  store.setKeyEntry(exam.id, 0, 'A');
  const first = store.finishGrading(exam.id);
  assert.equal(first.ok, false);
  assert.equal(first.missing.length, 19);

  // تکمیل کلید: ۱۴ درست، ۴ غلط، ۲ نزده (کلید همهٔ ۲۰ سوال)
  for (let i = 0; i < 20; i += 1) store.setKeyEntry(exam.id, i, 'A');
  for (let i = 14; i < 18; i += 1) store.setKeyEntry(exam.id, i, 'B');
  const done = store.finishGrading(exam.id);
  assert.equal(done.ok, true);
  assert.equal(done.result.correct, 14);
  assert.equal(done.result.wrong, 4);
  assert.equal(done.result.unanswered, 2);
  assert.equal(done.result.percentWithoutNegative, 70);
  assert.equal(done.result.percentWithNegative, ((14 - 4 / 3) / 20) * 100);

  const graded = store.get(exam.id);
  assert.equal(graded.status, STATUS.GRADED);
  assert.equal(graded.gradedAt, T0 + 31 * 60_000);
  // پس از تصحیح، کلید قابل تغییر نیست
  assert.throws(() => store.setKeyEntry(exam.id, 0, 'C'), DomainError);
});

test('حذف آزمون', () => {
  const clock = { value: T0 };
  const { store } = makeStore(clock);
  const exam = store.addExam(valid);
  assert.equal(store.removeExam(exam.id), true);
  assert.equal(store.get(exam.id), null);
  assert.equal(store.removeExam(exam.id), false);
});

test('دادهٔ خراب در حافظه، راه‌اندازی را خراب نمی‌کند', () => {
  const backend = memBackend();
  backend.setItem(
    STORAGE_KEY,
    JSON.stringify([
      { id: 'x1', name: 'سالم', questionCount: 5, durationMinutes: 10, status: 'created', createdAt: 1 },
      { id: 'x2', name: '', questionCount: 5 }, // نامعتبر
      'رشتهٔ نامعتبر',
      { id: 'x3', name: 'با پاسخ', questionCount: 2, durationMinutes: 5, status: 'in_progress', startedAt: 10, answers: { 0: 'A', 9: 'Z' }, key: { 0: 'A' } },
    ]),
  );
  const store = createAppStore({ storage: backend, now: () => T0 });
  const all = store.all();
  assert.equal(all.length, 2);
  const withAnswers = all.find((e) => e.id === 'x3');
  assert.deepEqual(withAnswers.answers, { 0: 'A' }); // گزینهٔ نامعتبر و ایندکس خارج محدوده حذف شد
});
