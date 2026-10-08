import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeExam,
  parseBackup,
  serializeBackup,
  mergeExamsById,
  parseExams,
  BACKUP_FORMAT,
  STORAGE_KEY,
  createStorageAdapter,
} from '../src/core/storage.js';
import { STATUS } from '../src/core/model.js';

const base = {
  id: 'x1',
  name: 'آزمون',
  category: 'عربی',
  questionCount: 3,
  durationMinutes: 10,
  status: STATUS.CREATED,
  createdAt: 1000,
  startedAt: null,
  endedAt: null,
  gradedAt: null,
  answers: {},
  key: {},
  result: null,
};

test('دادهٔ نامعتبر یا خالی کنار گذاشته می‌شود', () => {
  assert.equal(sanitizeExam(null), null);
  assert.equal(sanitizeExam('متن'), null);
  assert.equal(sanitizeExam({ ...base, id: '' }), null);
  assert.equal(sanitizeExam({ ...base, name: '  ' }), null);
  assert.equal(sanitizeExam({ ...base, questionCount: 0 }), null);
  assert.equal(sanitizeExam({ ...base, durationMinutes: -1 }), null);
});

test('آزمون در حال انجام بدون زمان شروع ترمیم می‌شود (باگ تایمر همیشگی)', () => {
  const repaired = sanitizeExam({ ...base, status: STATUS.IN_PROGRESS, startedAt: null, answers: { 0: 'A' } });
  assert.equal(repaired.status, STATUS.CREATED);
  assert.deepEqual(repaired.answers, { 0: 'A' }); // پاسخ‌ها حفظ می‌شوند
});

test('نتیجهٔ ناقص (بدون perQuestion) باعث خطای صفحهٔ نتیجه نمی‌شود', () => {
  const exam = sanitizeExam({
    ...base,
    status: STATUS.GRADED,
    startedAt: 1,
    endedAt: 2,
    gradedAt: 3,
    key: { 0: 'A', 1: 'B', 2: 'C' },
    answers: { 0: 'A', 1: 'A' },
    result: { percentWithNegative: 10, percentWithoutNegative: 20 }, // ساختار خراب
  });
  assert.ok(exam.result, 'نتیجه باید از نو محاسبه شود');
  assert.equal(exam.result.perQuestion.length, 3);
  assert.equal(exam.result.correct, 1);
  assert.equal(exam.result.wrong, 1);
  assert.equal(exam.result.unanswered, 1);
});

test('آزمون تصحیح‌شده بدون نتیجهٔ سالم به «در انتظار تصحیح» برمی‌گردد', () => {
  const exam = sanitizeExam({ ...base, status: STATUS.GRADED, startedAt: 1, result: null, key: { 0: 'A' } });
  assert.equal(exam.status, STATUS.AWAITING_GRADING);
  assert.equal(exam.result, null);
});

test('توقف بی‌معنا روی آزمون تمام‌شده پاک می‌شود', () => {
  const exam = sanitizeExam({
    ...base,
    status: STATUS.AWAITING_GRADING,
    startedAt: 100,
    endedAt: 200,
    pausedAt: 150,
    pausedTotalMs: 5000,
    pauseCount: 1,
  });
  assert.equal(exam.pausedAt, null);
  assert.equal(exam.pausedTotalMs, 5000);
});

test('توقف معتبر روی آزمون در حال انجام حفظ می‌شود', () => {
  const exam = sanitizeExam({
    ...base,
    status: STATUS.IN_PROGRESS,
    startedAt: 100,
    pausedAt: 500,
    pausedTotalMs: 0,
    pauseCount: 0,
    answers: { 0: 'A', 9: 'Z', '-1': 'B' },
  });
  assert.equal(exam.pausedAt, 500);
  assert.equal(exam.pauseCount, 1);
  assert.deepEqual(exam.answers, { 0: 'A' }); // ایندکس خارج محدوده و گزینهٔ نامعتبر حذف شد
});

test('متن خراب، مخزن را خراب نمی‌کند', () => {
  assert.deepEqual(parseExams('{ not json').exams, []);
  assert.deepEqual(parseExams(JSON.stringify({ exams: 'no' })).exams, []);
  const { exams, invalid } = parseExams(JSON.stringify([base, { id: 'x2' }, null]));
  assert.equal(exams.length, 1);
  assert.equal(invalid, 2);
});

test('پشتیبان‌گیری و بازگردانی: ساختار، ادغام و خطاها', () => {
  const exam = sanitizeExam({ ...base, status: STATUS.IN_PROGRESS, startedAt: 100 });
  const text = serializeBackup([exam], 1_700_000_000_000);
  const parsed = JSON.parse(text);
  assert.equal(parsed.format, BACKUP_FORMAT);
  assert.equal(parsed.count, 1);
  assert.equal(parsed.exams.length, 1);

  const back = parseBackup(text);
  assert.equal(back.ok, true);
  assert.equal(back.exams.length, 1);
  assert.equal(back.exams[0].pausedAt, exam.pausedAt);

  // آرایهٔ خام قدیمی هم پذیرفته می‌شود
  assert.equal(parseBackup(JSON.stringify([base])).ok, true);
  assert.equal(parseBackup('[]').ok, false);
  assert.equal(parseBackup('not json').ok, false);
  assert.equal(parseBackup('').ok, false);
});

test('شناسه‌های تکراری در پشتیبان یکتا می‌شوند و ادغام تکراری‌ها را رد می‌کند', () => {
  const first = { ...base, name: 'نسخهٔ یک' };
  const second = { ...base, name: 'نسخهٔ دو' };
  const parsed = parseBackup(JSON.stringify({ exams: [first, second] }));
  assert.equal(parsed.exams.length, 1);
  assert.equal(parsed.exams[0].name, 'نسخهٔ دو');

  const existing = [sanitizeExam(base), sanitizeExam({ ...base, id: 'keep' })];
  const merged = mergeExamsById(existing, [sanitizeExam(base), sanitizeExam({ ...base, id: 'new' })]);
  assert.equal(merged.added.length, 1);
  assert.equal(merged.added[0].id, 'new');
  assert.equal(merged.skipped, 1);
});

test('آداپتور حافظه‌ای در نبود localStorage کار می‌کند', () => {
  const adapter = createStorageAdapter(null);
  assert.equal(adapter.persistent, false);
  adapter.setItem(STORAGE_KEY, 'x');
  assert.equal(adapter.getItem(STORAGE_KEY), 'x');
  adapter.removeItem(STORAGE_KEY);
  assert.equal(adapter.getItem(STORAGE_KEY), null);
});

// ── شمارهٔ شروع سوال‌ها در دادهٔ ذخیره‌شده ────────────────────────────────────

test('شمارهٔ شروع سالم می‌ماند و دادهٔ قدیمی/خراب با ۱ ترمیم می‌شود', () => {
  assert.equal(sanitizeExam({ ...base, startNumber: 52 }).startNumber, 52);
  assert.equal(sanitizeExam(base).startNumber, 1, 'دادهٔ نسخهٔ قبل startNumber ندارد');
  assert.equal(sanitizeExam({ ...base, startNumber: 0 }).startNumber, 1);
  assert.equal(sanitizeExam({ ...base, startNumber: -3 }).startNumber, 1);
  assert.equal(sanitizeExam({ ...base, startNumber: 'x' }).startNumber, 1);
  assert.equal(sanitizeExam({ ...base, startNumber: 1.5 }).startNumber, 1);
  assert.equal(sanitizeExam({ ...base, startNumber: 10 ** 9 }).startNumber, 1, 'بیش از سقف پذیرفته نمی‌شود');
});

test('پشتیبان‌گیری و بازگردانی شمارهٔ شروع را حفظ می‌کند', () => {
  const text = serializeBackup([{ ...base, startNumber: 62 }]);
  const parsed = parseBackup(text);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.exams[0].startNumber, 62);
});
