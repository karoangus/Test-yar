// ── مخزن وضعیت برنامه و اکشن‌های دامنه ───────────────────────────────────────
// تنها نقطه‌ای که آزمون‌ها را تغییر می‌دهد؛ هر تغییر بلافاصله persist می‌شود
// تا هیچ پاسخی گم نشود. منطق تایمر و محاسبات از اینجا جدا و خالص است.

import { STATUS, createExam, validateExamInput, canAnswer, currentPhase } from './model.js';
import { scheduledEndsAt, isExpired } from './timer.js';
import { computeResults, findMissingKeys, isValidOption } from './scoring.js';
import { createStorageAdapter, loadExams, persistExams } from './storage.js';

export class DomainError extends Error {
  constructor(message, errors = null) {
    super(message);
    this.name = 'DomainError';
    this.errors = errors;
  }
}

export function createAppStore({ storage = null, now = () => Date.now() } = {}) {
  const adapter = createStorageAdapter(storage);
  let exams = loadExams(adapter);
  const listeners = new Set();

  function emit() {
    for (const fn of listeners) {
      try {
        fn();
      } catch {
        /* خطای یک شنونده نباید بقیه را متوقف کند */
      }
    }
  }

  function persist() {
    return persistExams(adapter, exams);
  }

  /** همگام‌سازی وضعیت با ساعت واقعی: آزمون جاری‌ای که زمانش گذشته، قفل می‌شود */
  function syncExpired() {
    const t = now();
    let changed = false;
    for (const exam of exams) {
      if (exam.status === STATUS.IN_PROGRESS && isExpired(exam, t)) {
        exam.status = STATUS.TIME_UP;
        exam.endedAt = scheduledEndsAt(exam.startedAt, exam.durationMinutes);
        changed = true;
      }
    }
    if (changed) {
      persist();
      emit();
    }
  }

  syncExpired();

  function find(id) {
    return exams.find((e) => e.id === id) ?? null;
  }

  function update(id, mutate) {
    const exam = find(id);
    if (!exam) throw new DomainError('آزمون پیدا نشد.');
    mutate(exam);
    persist();
    emit();
    return exam;
  }

  return {
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    get persistent() {
      return adapter.persistent;
    },

    refresh: syncExpired,

    all() {
      syncExpired();
      return [...exams].sort((a, b) => b.createdAt - a.createdAt);
    },

    get(id) {
      syncExpired();
      return find(id);
    },

    addExam(input) {
      const check = validateExamInput(input);
      if (!check.ok) {
        throw new DomainError('ورودی‌های فرم نامعتبر است.', check.errors);
      }
      const exam = createExam(check.values, now());
      exams.push(exam);
      persist();
      emit();
      return exam;
    },

    startExam(id) {
      return update(id, (exam) => {
        if (exam.status !== STATUS.CREATED) {
          throw new DomainError('این آزمون قبلاً شروع شده است.');
        }
        const t = now();
        exam.status = STATUS.IN_PROGRESS;
        exam.startedAt = t;
        exam.endedAt = null;
      });
    },

    /** ثبت/تغییر پاسخ کاربر — فقط تا پیش از پایان زمان معتبر است */
    setAnswer(id, questionIndex, optionId) {
      const t = now();
      return update(id, (exam) => {
        if (!canAnswer(exam, t)) {
          throw new DomainError('امکان تغییر پاسخ وجود ندارد؛ آزمون قفل شده است.');
        }
        if (!Number.isInteger(questionIndex) || questionIndex < 0 || questionIndex >= exam.questionCount) {
          throw new DomainError('شمارهٔ سوال نامعتبر است.');
        }
        if (optionId == null) delete exam.answers[questionIndex];
        else {
          if (!isValidOption(optionId)) throw new DomainError('گزینهٔ نامعتبر است.');
          exam.answers[questionIndex] = optionId;
        }
      });
    },

    /** پایان دستی آزمون توسط کاربر */
    endExamManually(id) {
      const t = now();
      return update(id, (exam) => {
        if (exam.status !== STATUS.IN_PROGRESS) {
          throw new DomainError('آزمون در حال برگزاری نیست.');
        }
        exam.endedAt = t;
        exam.status = STATUS.AWAITING_GRADING;
      });
    },

    /** ورود به تصحیح‌کننده پس از پایان زمان */
    enterGrading(id) {
      return update(id, (exam) => {
        const phase = currentPhase(exam, now());
        if (phase !== 'expired') {
          throw new DomainError('زمان آزمون هنوز تمام نشده است.');
        }
        exam.status = STATUS.AWAITING_GRADING;
        if (exam.endedAt == null) {
          exam.endedAt = scheduledEndsAt(exam.startedAt, exam.durationMinutes);
        }
      });
    },

    /** ثبت یک مورد از کلید صحیح */
    setKeyEntry(id, questionIndex, optionId) {
      return update(id, (exam) => {
        if (exam.status !== STATUS.AWAITING_GRADING) {
          throw new DomainError('آزمون در حالت تصحیح نیست.');
        }
        if (!Number.isInteger(questionIndex) || questionIndex < 0 || questionIndex >= exam.questionCount) {
          throw new DomainError('شمارهٔ سوال نامعتبر است.');
        }
        if (optionId == null) delete exam.key[questionIndex];
        else {
          if (!isValidOption(optionId)) throw new DomainError('گزینهٔ نامعتبر است.');
          exam.key[questionIndex] = optionId;
        }
      });
    },

    missingKeys(id) {
      const exam = find(id);
      if (!exam) throw new DomainError('آزمون پیدا نشد.');
      return findMissingKeys(exam.questionCount, exam.key);
    },

    /**
     * اتمام تصحیح: اگر کلیدی جا افتاده باشد { ok:false, missing }؛
     * در غیر این صورت محاسبهٔ دقیق نتایج و ذخیرهٔ آن‌ها.
     */
    finishGrading(id) {
      const exam = find(id);
      if (!exam) throw new DomainError('آزمون پیدا نشد.');
      const missing = findMissingKeys(exam.questionCount, exam.key);
      if (missing.length > 0) {
        return { ok: false, missing };
      }
      const results = computeResults({
        total: exam.questionCount,
        answers: exam.answers,
        key: exam.key,
      });
      update(id, (e) => {
        e.status = STATUS.GRADED;
        e.gradedAt = now();
        e.result = {
          total: results.total,
          correct: results.correct,
          wrong: results.wrong,
          unanswered: results.unanswered,
          percentWithoutNegative: results.percentWithoutNegative,
          percentWithNegative: results.percentWithNegative,
          perQuestion: results.perQuestion,
        };
      });
      return { ok: true, result: find(id).result };
    },

    removeExam(id) {
      const before = exams.length;
      exams = exams.filter((e) => e.id !== id);
      if (exams.length !== before) {
        persist();
        emit();
        return true;
      }
      return false;
    },
  };
}
