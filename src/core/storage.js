// ── لایهٔ ذخیره‌سازی پایدار (localStorage با fallback ایمن) ──────────────────
// شامل بازسازی ایمن دادهٔ خراب، اعتبارسنجی نتیجهٔ ذخیره‌شده و پشتیبان‌گیری JSON.

import { STATUS, CATEGORIES } from './model.js';
import { isValidOption, findMissingKeys, computeResults, QUESTION_STATUS } from './scoring.js';

export const STORAGE_KEY = 'testyar.exams.v1';
export const BACKUP_FORMAT = 'testyar.backup';
export const BACKUP_VERSION = 2;

/** آداپتور ذخیره‌سازی: ابتدا localStorage، در صورت عدم دسترسی حافظهٔ موقت */
export function createStorageAdapter(backend) {
  const memory = new Map();
  let engine = backend;
  if (engine == null) {
    try {
      const probe = '__testyar_probe__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      engine = window.localStorage;
    } catch {
      engine = null;
    }
  }
  if (engine == null) {
    return {
      persistent: false,
      getItem: (k) => (memory.has(k) ? memory.get(k) : null),
      setItem: (k, v) => memory.set(k, v),
      removeItem: (k) => memory.delete(k),
    };
  }
  return {
    persistent: true,
    getItem: (k) => {
      try {
        return engine.getItem(k);
      } catch {
        return memory.has(k) ? memory.get(k) : null;
      }
    },
    setItem: (k, v) => {
      try {
        engine.setItem(k, v);
      } catch {
        memory.set(k, v);
      }
    },
    removeItem: (k) => {
      try {
        engine.removeItem(k);
      } catch {
        memory.delete(k);
      }
    },
  };
}

function sanitizeAnswerMap(raw, total) {
  const out = {};
  if (raw == null || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw)) {
    const idx = Number(k);
    if (Number.isInteger(idx) && idx >= 0 && idx < total && isValidOption(v)) {
      out[idx] = v;
    }
  }
  return out;
}

const RESULT_STATUSES = Object.values(QUESTION_STATUS);

/** محاسبهٔ نتیجه از پاسخ و کلید (برای ترمیم نتیجهٔ خراب) — در صورت خطا null */
function recomputeResult(total, answers, key) {
  if (findMissingKeys(total, key).length > 0) return null;
  try {
    const results = computeResults({ total, answers, key });
    return {
      total: results.total,
      correct: results.correct,
      wrong: results.wrong,
      unanswered: results.unanswered,
      percentWithoutNegative: results.percentWithoutNegative,
      percentWithNegative: results.percentWithNegative,
      perQuestion: results.perQuestion,
    };
  } catch {
    return null;
  }
}

/**
 * اعتبارسنجی نتیجهٔ ذخیره‌شده؛ شکل نامعتبر هرگز به UI نمی‌رسد
 * (چون صفحهٔ نتیجه به perQuestion وابسته است و نتیجهٔ ناقص آن را می‌شکست).
 */
function sanitizeResult(raw, total, answers, key) {
  if (raw == null || typeof raw !== 'object') return null;
  if (!Array.isArray(raw.perQuestion) || raw.perQuestion.length !== total) {
    return recomputeResult(total, answers, key);
  }
  if (
    !Number.isInteger(raw.total) ||
    raw.total !== total ||
    !Number.isInteger(raw.correct) ||
    raw.correct < 0 ||
    !Number.isInteger(raw.wrong) ||
    raw.wrong < 0 ||
    !Number.isInteger(raw.unanswered) ||
    raw.unanswered < 0 ||
    raw.correct + raw.wrong + raw.unanswered !== total ||
    !Number.isFinite(raw.percentWithoutNegative) ||
    !Number.isFinite(raw.percentWithNegative)
  ) {
    return recomputeResult(total, answers, key);
  }

  const perQuestion = [];
  for (let i = 0; i < total; i += 1) {
    const item = raw.perQuestion[i];
    const correctAnswer = item?.correctAnswer;
    if (!isValidOption(correctAnswer)) return recomputeResult(total, answers, key);
    const userAnswer = isValidOption(item?.userAnswer) ? item.userAnswer : null;
    perQuestion.push({
      index: i,
      userAnswer,
      correctAnswer,
      status: RESULT_STATUSES.includes(item?.status)
        ? item.status
        : userAnswer == null
          ? QUESTION_STATUS.UNANSWERED
          : userAnswer === correctAnswer
            ? QUESTION_STATUS.CORRECT
            : QUESTION_STATUS.WRONG,
    });
  }

  return {
    total,
    correct: raw.correct,
    wrong: raw.wrong,
    unanswered: raw.unanswered,
    percentWithoutNegative: raw.percentWithoutNegative,
    percentWithNegative: raw.percentWithNegative,
    perQuestion,
  };
}

/** بازسازی ایمن یک آزمون از دادهٔ خام؛ در صورت خراب بودن null برمی‌گرداند */
export function sanitizeExam(raw) {
  if (raw == null || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' && raw.id.length > 0 ? raw.id : null;
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : null;
  const questionCount = Number.isInteger(raw.questionCount) ? raw.questionCount : NaN;
  const durationMinutes = Number.isFinite(raw.durationMinutes) ? raw.durationMinutes : NaN;
  if (!id || !name || !Number.isInteger(questionCount) || questionCount < 1) return null;
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return null;

  const category = CATEGORIES.includes(raw.category) ? raw.category : 'سایر';
  const answers = sanitizeAnswerMap(raw.answers, questionCount);
  const key = sanitizeAnswerMap(raw.key, questionCount);
  const result = sanitizeResult(raw.result, questionCount, answers, key);

  let status = Object.values(STATUS).includes(raw.status) ? raw.status : STATUS.CREATED;
  const startedAt = Number.isFinite(raw.startedAt) ? raw.startedAt : null;
  const endedAt = Number.isFinite(raw.endedAt) ? raw.endedAt : null;

  // ترمیم دادهٔ ناسازگار: آزمون بدون زمان شروع نباید «در حال انجام» یا «تمام‌شده» بماند
  // (وگرنه تایمر با NaN هرگز تمام نمی‌شد).
  if (startedAt == null && status !== STATUS.GRADED) status = STATUS.CREATED;
  if (status === STATUS.GRADED && result == null) status = STATUS.AWAITING_GRADING;

  let pausedTotalMs = Number.isFinite(raw.pausedTotalMs) && raw.pausedTotalMs > 0 ? raw.pausedTotalMs : 0;
  let pauseCount = Number.isInteger(raw.pauseCount) && raw.pauseCount > 0 ? raw.pauseCount : 0;
  let pausedAt = Number.isFinite(raw.pausedAt) ? raw.pausedAt : null;

  if (pausedAt != null) {
    const validPause = status === STATUS.IN_PROGRESS && startedAt != null && pausedAt >= startedAt;
    if (validPause) {
      pausedTotalMs = Math.max(0, pausedTotalMs);
      pauseCount = Math.max(1, pauseCount);
    } else {
      // توقف بی‌معنا (آزمون تمام‌شده یا بدون شروع) پاک می‌شود تا قفل/تایمر خراب نشود
      pausedAt = null;
    }
  }

  return {
    id,
    name,
    category,
    questionCount,
    durationMinutes,
    status,
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
    startedAt,
    endedAt: status === STATUS.GRADED || status === STATUS.AWAITING_GRADING || status === STATUS.TIME_UP ? endedAt : null,
    gradedAt: Number.isFinite(raw.gradedAt) ? raw.gradedAt : null,
    pausedAt,
    pausedTotalMs,
    pauseCount,
    answers,
    key,
    result,
  };
}

export function loadExams(adapter) {
  const text = adapter.getItem(STORAGE_KEY);
  if (!text) return [];
  return parseExams(text).exams;
}

/** تبدیل متن JSON به فهرست آزمون‌های سالم (دادهٔ خراب حذف می‌شود) */
export function parseExams(text) {
  try {
    const parsed = JSON.parse(text);
    const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.exams) ? parsed.exams : null;
    if (!list) return { exams: [], invalid: 0 };
    const exams = [];
    let invalid = 0;
    for (const item of list) {
      const exam = sanitizeExam(item);
      if (exam) exams.push(exam);
      else invalid += 1;
    }
    return { exams, invalid };
  } catch {
    return { exams: [], invalid: 0 };
  }
}

/** ذخیرهٔ هم‌زمان همهٔ آزمون‌ها؛ در صورت موفقیت true */
export function persistExams(adapter, exams) {
  try {
    adapter.setItem(STORAGE_KEY, JSON.stringify(exams));
    return true;
  } catch {
    return false;
  }
}

// ── پشتیبان‌گیری و بازگردانی ─────────────────────────────────────────────────

/** ساخت متن پشتیبان از همهٔ آزمون‌ها */
export function serializeBackup(exams, now = Date.now()) {
  return JSON.stringify(
    {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      app: 'testyar',
      exportedAt: new Date(now).toISOString(),
      count: exams.length,
      exams,
    },
    null,
    2,
  );
}

/**
 * خواندن متن پشتیبان (فایل پشتیبان تست‌یار یا آرایهٔ خام قدیمی).
 * خروجی: { ok, exams, invalid } یا { ok:false, error }
 */
export function parseBackup(text) {
  if (typeof text !== 'string' || text.trim().length === 0) {
    return { ok: false, error: 'فایل پشتیبان خالی است.' };
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'فایل پشتیبان خوانا نیست (JSON نامعتبر).' };
  }
  const list = Array.isArray(parsed) ? parsed : parsed?.exams;
  if (!Array.isArray(list)) {
    return { ok: false, error: 'ساختار فایل پشتیبان نامعتبر است.' };
  }
  const exams = [];
  const seen = new Set();
  let invalid = 0;
  for (const item of list) {
    const exam = sanitizeExam(item);
    if (!exam) {
      invalid += 1;
      continue;
    }
    if (seen.has(exam.id)) {
      // آخرین نسخهٔ همان شناسه برنده است
      const idx = exams.findIndex((e) => e.id === exam.id);
      if (idx >= 0) exams[idx] = exam;
      continue;
    }
    seen.add(exam.id);
    exams.push(exam);
  }
  if (exams.length === 0 && invalid === 0) {
    return { ok: false, error: 'هیچ آزمونی در فایل پشتیبان پیدا نشد.' };
  }
  return { ok: true, exams, invalid };
}

/** ادغام آزمون‌های پشتیبان با آزمون‌های موجود (بدون بازنویسی تکراری‌ها) */
export function mergeExamsById(existing, incoming) {
  const byId = new Set(existing.map((e) => e.id));
  const added = [];
  let skipped = 0;
  for (const exam of incoming) {
    if (byId.has(exam.id)) {
      skipped += 1;
      continue;
    }
    byId.add(exam.id);
    added.push(exam);
  }
  return { added, skipped };
}
