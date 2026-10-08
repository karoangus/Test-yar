// ── مدل دادهٔ آزمون، وضعیت‌ها و اعتبارسنجی ───────────────────────────────────

import { normalizeDigits } from './format.js';

export const CATEGORIES = Object.freeze([
  'عربی',
  'ادبیات',
  'علوم و فنون',
  'جامعه‌شناسی',
  'اقتصاد',
  'منطق',
  'فلسفه',
  'روان‌شناسی',
  'تاریخ',
  'جغرافیا',
  'دین و زندگی',
  'ریاضی و آمار',
  'زبان انگلیسی',
  'سایر',
]);

/** وضعیت‌های ذخیره‌شدهٔ آزمون */
export const STATUS = Object.freeze({
  CREATED: 'created',               // ساخته‌شده / آماده شروع
  IN_PROGRESS: 'in_progress',       // در حال برگزاری
  TIME_UP: 'time_up',               // زمان تمام‌شده
  AWAITING_GRADING: 'awaiting_grading', // در انتظار تصحیح
  GRADED: 'graded',                 // تصحیح‌شده
});

/** برچسب فارسی وضعیت برای نمایش */
export const STATUS_LABEL = Object.freeze({
  [STATUS.CREATED]: 'آماده شروع',
  [STATUS.IN_PROGRESS]: 'در حال انجام',
  [STATUS.TIME_UP]: 'تمام‌شده',
  [STATUS.AWAITING_GRADING]: 'تمام‌شده · در انتظار تصحیح',
  [STATUS.GRADED]: 'تصحیح‌شده',
});

export const MAX_QUESTIONS = 500;
export const MAX_DURATION_MINUTES = 24 * 60;

export function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `exam-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function toPositiveInt(raw) {
  const n = Number(normalizeDigits(raw));
  return Number.isInteger(n) && n > 0 ? n : NaN;
}

function toPositiveNumber(raw) {
  const n = Number(normalizeDigits(raw));
  return Number.isFinite(n) && n > 0 ? n : NaN;
}

/**
 * اعتبارسنجی ورودی ساخت آزمون.
 * خروجی: { ok, values?, errors: { name?, questionCount?, duration?, category? } }
 */
export function validateExamInput(input) {
  const errors = {};

  const name = String(input?.name ?? '').trim();
  if (name.length === 0) errors.name = 'نام آزمون نباید خالی باشد.';
  else if (name.length > 80) errors.name = 'نام آزمون حداکثر ۸۰ نویسه است.';

  const questionCount = toPositiveInt(input?.questionCount);
  if (!Number.isFinite(questionCount)) {
    errors.questionCount = 'تعداد سوالات باید یک عدد صحیح مثبت باشد.';
  } else if (questionCount > MAX_QUESTIONS) {
    errors.questionCount = `تعداد سوالات حداکثر ${MAX_QUESTIONS} است.`;
  }

  const durationMinutes = toPositiveNumber(input?.durationMinutes);
  if (!Number.isFinite(durationMinutes)) {
    errors.duration = 'زمان آزمون باید عددی بزرگ‌تر از صفر باشد.';
  } else if (durationMinutes > MAX_DURATION_MINUTES) {
    errors.duration = `زمان آزمون حداکثر ${MAX_DURATION_MINUTES} دقیقه است.`;
  }

  const category = String(input?.category ?? '');
  if (!CATEGORIES.includes(category)) {
    errors.category = 'یک دسته‌بندی معتبر انتخاب کنید.';
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, values: { name, questionCount, durationMinutes, category } };
}

/** ساخت آبجکت آزمون جدید با وضعیت «ساخته‌شده» */
export function createExam(input, now = Date.now()) {
  const { values } = validateExamInput(input);
  return {
    id: generateId(),
    name: values.name,
    category: values.category,
    questionCount: values.questionCount,
    durationMinutes: values.durationMinutes,
    status: STATUS.CREATED,
    createdAt: now,
    startedAt: null,
    endedAt: null,
    gradedAt: null,
    answers: {},
    key: {},
    result: null,
  };
}

/**
 * فاز اجرایی فعلی آزمون نسبت به ساعت واقعی:
 * ready | running | expired | grading | graded
 */
export function currentPhase(exam, now = Date.now()) {
  switch (exam.status) {
    case STATUS.IN_PROGRESS:
      return exam.startedAt != null && now >= startedEndsAt(exam) ? 'expired' : 'running';
    case STATUS.TIME_UP:
      return 'expired';
    case STATUS.AWAITING_GRADING:
      return 'grading';
    case STATUS.GRADED:
      return 'graded';
    default:
      return 'ready';
  }
}

function startedEndsAt(exam) {
  return exam.startedAt + Math.round(exam.durationMinutes * 60_000);
}

/** آیا کاربر در این لحظه مجاز به ثبت/تغییر پاسخ است؟ */
export function canAnswer(exam, now = Date.now()) {
  return exam.status === STATUS.IN_PROGRESS && currentPhase(exam, now) === 'running';
}

/** آیا آزمون قفل شده است (زمان تمام شده یا پایان دستی/تصحیح)؟ */
export function isLocked(exam, now = Date.now()) {
  const phase = currentPhase(exam, now);
  return phase === 'expired' || phase === 'grading' || phase === 'graded';
}
