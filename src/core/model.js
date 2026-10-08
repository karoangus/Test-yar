// ── مدل دادهٔ آزمون، وضعیت‌ها و اعتبارسنجی ───────────────────────────────────

import { normalizeDigits } from './format.js';
import { isExpired, isPaused } from './timer.js';

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
  IN_PROGRESS: 'in_progress',       // در حال برگزاری (می‌تواند متوقف باشد)
  TIME_UP: 'time_up',               // زمان تمام‌شده
  AWAITING_GRADING: 'awaiting_grading', // در انتظار تصحیح
  GRADED: 'graded',                 // تصحیح‌شده
});

/** فاز اجرایی آزمون (دقیق‌تر از وضعیت ذخیره‌شده؛ «متوقف» را هم شامل می‌شود) */
export const PHASE = Object.freeze({
  READY: 'ready',
  RUNNING: 'running',
  PAUSED: 'paused',
  EXPIRED: 'expired',
  GRADING: 'grading',
  GRADED: 'graded',
});

/** برچسب فارسی وضعیت برای نمایش */
export const STATUS_LABEL = Object.freeze({
  [STATUS.CREATED]: 'آماده شروع',
  [STATUS.IN_PROGRESS]: 'در حال انجام',
  [STATUS.TIME_UP]: 'تمام‌شده',
  [STATUS.AWAITING_GRADING]: 'تمام‌شده · در انتظار تصحیح',
  [STATUS.GRADED]: 'تصحیح‌شده',
});

/** برچسب فارسی فاز (برای نشان‌ها و فهرست‌ها) */
export const PHASE_LABEL = Object.freeze({
  [PHASE.READY]: 'آماده شروع',
  [PHASE.RUNNING]: 'در حال انجام',
  [PHASE.PAUSED]: 'تایمر متوقف',
  [PHASE.EXPIRED]: 'تمام‌شده',
  [PHASE.GRADING]: 'در انتظار تصحیح',
  [PHASE.GRADED]: 'تصحیح‌شده',
});

export const MAX_QUESTIONS = 500;
export const MAX_DURATION_MINUTES = 24 * 60;
export const MAX_NAME_LENGTH = 80;

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

function validateName(raw) {
  const name = String(raw ?? '').trim();
  if (name.length === 0) return { error: 'نام آزمون نباید خالی باشد.' };
  if (name.length > MAX_NAME_LENGTH) return { error: `نام آزمون حداکثر ${MAX_NAME_LENGTH} نویسه است.` };
  return { value: name };
}

/**
 * اعتبارسنجی ورودی ساخت آزمون.
 * خروجی: { ok, values?, errors: { name?, questionCount?, duration?, category? } }
 */
export function validateExamInput(input) {
  const errors = {};

  const nameCheck = validateName(input?.name);
  if (nameCheck.error) errors.name = nameCheck.error;

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
  return { ok: true, values: { name: nameCheck.value, questionCount, durationMinutes, category } };
}

/** validateExamInput فقط با اجازهٔ تغییر متادیتا (نام و دسته‌بندی) */
export function validateExamMeta(input) {
  const errors = {};
  const nameCheck = validateName(input?.name);
  if (nameCheck.error) errors.name = nameCheck.error;
  const category = String(input?.category ?? '');
  if (!CATEGORIES.includes(category)) errors.category = 'یک دسته‌بندی معتبر انتخاب کنید.';
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, values: { name: nameCheck.value, category } };
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
    pausedAt: null,       // لحظهٔ شروع توقف جاری
    pausedTotalMs: 0,     // مجموع توقف‌های تمام‌شده
    pauseCount: 0,        // تعداد دفعات توقف
    answers: {},
    key: {},
    result: null,
  };
}

/**
 * فاز اجرایی فعلی آزمون نسبت به ساعت واقعی:
 * ready | running | paused | expired | grading | graded
 */
export function currentPhase(exam, now = Date.now()) {
  if (!exam) return PHASE.READY;
  switch (exam.status) {
    case STATUS.IN_PROGRESS:
      // دادهٔ ترمیم‌نشده (در حال انجام بدون زمان شروع) → «آماده شروع»
      if (exam.startedAt == null) return PHASE.READY;
      if (isPaused(exam)) return PHASE.PAUSED;
      return isExpired(exam, now) ? PHASE.EXPIRED : PHASE.RUNNING;
    case STATUS.TIME_UP:
      return PHASE.EXPIRED;
    case STATUS.AWAITING_GRADING:
      return PHASE.GRADING;
    case STATUS.GRADED:
      return PHASE.GRADED;
    default:
      return PHASE.READY;
  }
}

/** آیا کاربر در این لحظه مجاز به ثبت/تغییر پاسخ است؟ (در توقف: خیر) */
export function canAnswer(exam, now = Date.now()) {
  return exam != null && exam.status === STATUS.IN_PROGRESS && currentPhase(exam, now) === PHASE.RUNNING;
}

/** آیا آزمون قفل شده است (زمان تمام شده یا پایان دستی/تصحیح)؟ */
export function isLocked(exam, now = Date.now()) {
  const phase = currentPhase(exam, now);
  return phase === PHASE.EXPIRED || phase === PHASE.GRADING || phase === PHASE.GRADED;
}

/** آیا آزمون در حال برگزاری است (چه در حال اجرا، چه متوقف)؟ */
export function isLive(exam) {
  return exam != null && exam.status === STATUS.IN_PROGRESS && exam.startedAt != null;
}
