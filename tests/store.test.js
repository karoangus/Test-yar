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

// ── قابلیت‌های نسخهٔ ۲: توقف/ادامه، تراکنشی‌بودن، کپی‌ها، پشتیبان، بازگردانی ──

test('توقف و ادامهٔ تایمر: زمان توقف از وقت آزمون کم نمی‌شود', () => {
  const clock = { value: T0 };
  const { store } = makeStore(clock);
  const exam = store.addExam({ ...valid, durationMinutes: 10 });
  store.startExam(exam.id);

  clock.value = T0 + 2 * 60_000;
  const paused = store.pauseExam(exam.id);
  assert.equal(paused.pausedAt, T0 + 2 * 60_000);
  assert.equal(paused.pauseCount, 1);
  assert.equal(store.get(exam.id).status, STATUS.IN_PROGRESS);

  // در حین توقف، ثبت پاسخ ممکن نیست
  assert.throws(() => store.setAnswer(exam.id, 0, 'A'), DomainError);
  // توقف دوباره هم مجاز نیست
  assert.throws(() => store.pauseExam(exam.id), DomainError);
  // توقف، زمان را مصرف نمی‌کند
  clock.value = T0 + 30 * 60_000;
  assert.equal(store.remainingMs(exam.id), 8 * 60_000);

  const resumed = store.resumeExam(exam.id);
  assert.equal(resumed.pausedAt, null);
  assert.equal(resumed.pausedTotalMs, 28 * 60_000);
  store.setAnswer(exam.id, 0, 'A'); // پس از ادامه، پاسخ‌دهی آزاد است

  // مهلت جدید = شروع + ۱۰ دقیقه + ۲۸ دقیقه توقف
  clock.value = T0 + 38 * 60_000;
  assert.equal(store.remainingMs(exam.id), 0);
  store.refresh();
  const finished = store.get(exam.id);
  assert.equal(finished.status, STATUS.TIME_UP);
  assert.equal(finished.endedAt, T0 + 38 * 60_000);
  assert.throws(() => store.resumeExam(exam.id), DomainError);
});

test('پایان دستی در حین توقف، توقف باز را می‌بندد و آمار را درست نگه می‌دارد', () => {
  const clock = { value: T0 };
  const { store } = makeStore(clock);
  const exam = store.addExam({ ...valid, durationMinutes: 10 });
  store.startExam(exam.id);
  clock.value = T0 + 60_000;
  store.pauseExam(exam.id);
  clock.value = T0 + 4 * 60_000;
  const ended = store.endExamManually(exam.id);
  assert.equal(ended.status, STATUS.AWAITING_GRADING);
  assert.equal(ended.pausedAt, null);
  assert.equal(ended.pausedTotalMs, 3 * 60_000);
  assert.equal(ended.endedAt, T0 + 4 * 60_000);
});

test('هر تغییر تراکنشی است: خطای میان راه، وضعیت را برنمی‌گرداند به عقب', () => {
  const clock = { value: T0 };
  const { backend, store } = makeStore(clock);
  const exam = store.addExam(valid);
  store.startExam(exam.id);
  store.setAnswer(exam.id, 0, 'A');

  // ایندکس نامعتبر → خطا و هیچ تغییری (نه در حافظه و نه در ذخیره‌سازی)
  assert.throws(() => store.setAnswer(exam.id, 999, 'B'), DomainError);
  assert.deepEqual(store.get(exam.id).answers, { 0: 'A' });
  const saved = JSON.parse(backend.getItem(STORAGE_KEY));
  assert.deepEqual(saved[0].answers, { 0: 'A' });
  assert.equal(saved.length, 1);
});

test('وضعیت داخلی به بیرون درز نمی‌کند (تغییر کپی، ذخیره‌سازی را خراب نمی‌کند)', () => {
  const clock = { value: T0 };
  const { store } = makeStore(clock);
  const exam = store.addExam(valid);
  const copy = store.get(exam.id);
  copy.name = 'دست‌کاری';
  copy.answers[0] = 'D';
  assert.equal(store.get(exam.id).name, valid.name);
  assert.deepEqual(store.get(exam.id).answers, {});
  const list = store.all();
  list[0].status = 'graded';
  assert.equal(store.get(exam.id).status, STATUS.CREATED);
});

test('حذف پاسخ و فهرست نزده‌ها', () => {
  const clock = { value: T0 };
  const { store } = makeStore(clock);
  const exam = store.addExam(valid);
  store.startExam(exam.id);
  store.setAnswer(exam.id, 0, 'A');
  store.setAnswer(exam.id, 1, 'B');
  assert.deepEqual(store.unansweredIndexes(exam.id).slice(0, 3), [2, 3, 4]);
  assert.equal(store.unansweredIndexes(exam.id).length, 18);
  store.clearAnswer(exam.id, 0);
  assert.deepEqual(store.get(exam.id).answers, { 1: 'B' });
});

test('ویرایش نام/دسته‌بندی فقط پیش از شروع و تکرار آزمون', () => {
  const clock = { value: T0 };
  const { store } = makeStore(clock);
  const exam = store.addExam(valid);
  const updated = store.updateExamMeta(exam.id, { name: 'آزمون ویرایش‌شده', category: 'تاریخ' });
  assert.equal(updated.name, 'آزمون ویرایش‌شده');
  assert.equal(updated.category, 'تاریخ');
  assert.throws(() => store.updateExamMeta(exam.id, { name: '', category: 'تاریخ' }), DomainError);

  store.startExam(exam.id);
  assert.throws(() => store.updateExamMeta(exam.id, { name: 'دیر شده', category: 'تاریخ' }), DomainError);

  const copy = store.duplicateExam(exam.id);
  assert.notEqual(copy.id, exam.id);
  assert.match(copy.name, /تکرار/);
  assert.equal(copy.status, STATUS.CREATED);
  assert.deepEqual(copy.answers, {});
  assert.equal(copy.questionCount, exam.questionCount);
  assert.equal(copy.durationMinutes, exam.durationMinutes);
  assert.equal(store.all().length, 2);
});

test('حذف آزمون با بازگردانی', () => {
  const clock = { value: T0 };
  const { store } = makeStore(clock);
  const first = store.addExam({ ...valid, name: 'اول' });
  const second = store.addExam({ ...valid, name: 'دوم' });
  assert.equal(store.canUndoRemove(), false);
  assert.equal(store.removeExam(first.id), true);
  assert.equal(store.canUndoRemove(), true);
  assert.equal(store.undoRemove(), true);
  assert.ok(store.get(first.id));
  assert.equal(store.canUndoRemove(), false);
  assert.equal(store.undoRemove(), false);
  assert.equal(store.removeExam('ناموجود'), false);
  assert.equal(store.get(second.id).name, 'دوم');
});

test('پشتیبان‌گیری و بازگردانی از مسیر مخزن (ادغام و جایگزینی)', () => {
  const clock = { value: T0 };
  const { store } = makeStore(clock);
  const exam = store.addExam(valid);
  store.startExam(exam.id);
  store.setAnswer(exam.id, 0, 'A');
  const backup = store.exportBackup();
  assert.match(backup, /testyar\.backup/);

  // ادغام روی همان مخزن: تکراری نادیده گرفته می‌شود
  const merged = store.importBackup(backup, { mode: 'merge' });
  assert.equal(merged.ok, true);
  assert.equal(merged.imported, 0);
  assert.equal(merged.skipped, 1);
  assert.equal(store.all().length, 1);

  // مخزن تازه: آزمون از پشتیبان بازگردانده می‌شود
  const freshBackend = memBackend();
  const fresh = createAppStore({ storage: freshBackend, now: () => clock.value });
  const res = fresh.importBackup(backup, { mode: 'merge' });
  assert.equal(res.imported, 1);
  const restored = fresh.get(exam.id);
  assert.equal(restored.answers[0], 'A');
  assert.equal(restored.status, STATUS.IN_PROGRESS);

  // جایگزینی کامل
  const replaced = fresh.importBackup(backup, { mode: 'replace' });
  assert.equal(replaced.ok, true);
  assert.equal(fresh.all().length, 1);

  // فایل خراب → خطای واضح و بدون تغییر داده
  const bad = fresh.importBackup('این فایل پشتیبان نیست', { mode: 'merge' });
  assert.equal(bad.ok, false);
  assert.equal(bad.error.length > 0, true);
  assert.equal(fresh.all().length, 1);
});

test('آمار داشبورد از دادهٔ واقعی محاسبه می‌شود', () => {
  const clock = { value: T0 };
  const { store } = makeStore(clock);
  let stats = store.stats();
  assert.equal(stats.total, 0);
  assert.equal(stats.averagePercent, null);

  const exam = store.addExam({ ...valid, questionCount: 4, durationMinutes: 10 });
  store.startExam(exam.id);
  store.setAnswer(exam.id, 0, 'A');
  store.setAnswer(exam.id, 1, 'A');
  store.setAnswer(exam.id, 2, 'B');
  clock.value = T0 + 60_000;
  store.pauseExam(exam.id);
  clock.value = T0 + 3 * 60_000; // ۲ دقیقه استراحت
  store.endExamManually(exam.id);
  store.setKeyEntry(exam.id, 0, 'A');
  store.setKeyEntry(exam.id, 1, 'A');
  store.setKeyEntry(exam.id, 2, 'A');
  store.setKeyEntry(exam.id, 3, 'A');
  store.finishGrading(exam.id);

  stats = store.stats();
  assert.equal(stats.total, 1);
  assert.equal(stats.graded, 1);
  assert.equal(stats.averagePercent, ((2 - 1 / 3) / 4) * 100);
  assert.equal(stats.bestPercent, stats.averagePercent);
  const graded = store.get(exam.id);
  assert.equal(graded.result.pauseCount, 1);
  assert.equal(graded.result.pausedTotalMs, 2 * 60_000);
  assert.equal(graded.endedAt, T0 + 3 * 60_000);
  assert.equal(graded.result.durationMinutes, 10);
});

test('آزمون فعال و آزمون‌های متوقف‌شده قابل شناسایی هستند', () => {
  const clock = { value: T0 };
  const { store } = makeStore(clock);
  const a = store.addExam({ ...valid, name: 'الف' });
  const b = store.addExam({ ...valid, name: 'ب' });
  store.startExam(a.id);
  clock.value = T0 + 1000;
  store.startExam(b.id);
  assert.equal(store.activeExam().id, b.id);
  clock.value = T0 + 2000;
  store.pauseExam(b.id);
  assert.equal(store.pausedExams().length, 1);
  assert.equal(store.pausedExams()[0].id, b.id);
  clock.value = T0 + 3000;
  store.resumeExam(b.id);
  assert.equal(store.pausedExams().length, 0);
  assert.equal(store.get(b.id).pauseCount, 1);
});

// ── شمارهٔ اولین سوال در اکشن‌های مخزن ──────────────────────────────────────

test('ساخت، تکرار و ویرایش آزمون شمارهٔ شروع را درست مدیریت می‌کند', () => {
  const { store } = makeStore({ value: T0 });
  const exam = store.addExam({ ...valid, questionCount: 11, startNumber: 52 });
  assert.equal(exam.startNumber, 52);

  const copy = store.duplicateExam(exam.id);
  assert.equal(copy.startNumber, 52, 'تکرار آزمون همان شمارهٔ شروع را می‌گیرد');

  const updated = store.updateExamMeta(exam.id, { name: 'آزمون ویرایش‌شده', category: 'عربی', startNumber: 71 });
  assert.equal(updated.startNumber, 71);

  const kept = store.updateExamMeta(exam.id, { name: 'آزمون ویرایش‌شده ۲', category: 'عربی' });
  assert.equal(kept.startNumber, 71, 'اگر شمارهٔ شروع فرستاده نشود تغییر نمی‌کند');

  assert.throws(
    () => store.updateExamMeta(exam.id, { name: 'x', category: 'عربی', startNumber: '۰' }),
    DomainError,
  );
  assert.equal(store.get(exam.id).startNumber, 71, 'ویرایش ناموفق چیزی را خراب نمی‌کند');
});

test('آزمون بدون شمارهٔ شروع (دادهٔ قدیمی) با شمارهٔ ۱ خوانده می‌شود', () => {
  const backend = memBackend();
  backend.setItem(
    STORAGE_KEY,
    JSON.stringify([{ id: 'old-1', name: 'قدیمی', category: 'عربی', questionCount: 5, durationMinutes: 10, status: 'created', createdAt: 1 }]),
  );
  const store = createAppStore({ storage: backend, now: () => T0 });
  assert.equal(store.get('old-1').startNumber, 1);
});
