// ── مخزن وضعیت برنامه و اکشن‌های دامنه ───────────────────────────────────────
// تنها نقطه‌ای که آزمون‌ها را تغییر می‌دهد؛ هر تغییر بلافاصله persist می‌شود
// تا هیچ پاسخی گم نشود. منطق تایمر و محاسبات از اینجا جدا و خالص است.
//
// اصول مهم این لایه:
//   ۱) هیچ شیء داخلی به بیرون درز نمی‌کند (get/all نسخهٔ کپی برمی‌گردانند)
//      تا UI نتواند ناخواسته وضعیت را بدون persist تغییر دهد.
//   ۲) هر تغییر تراکنشی است؛ اگر در میانهٔ تغییر خطایی رخ دهد، آزمون به حالت
//      قبلی برمی‌گردد و حافظه با localStorage ناهم‌خوان نمی‌شود.

import { STATUS, createExam, validateExamInput, validateExamMeta, canAnswer, currentPhase, PHASE } from './model.js';
import { scheduledEndsAt, isExpired, isPaused, pausedTotalMs, remainingMs, activeElapsedMs } from './timer.js';
import { computeResults, findMissingKeys, isValidOption, findUnanswered } from './scoring.js';
import {
  createStorageAdapter,
  loadExams,
  persistExams,
  serializeBackup,
  parseBackup,
  mergeExamsById,
} from './storage.js';

export class DomainError extends Error {
  constructor(message, errors = null) {
    super(message);
    this.name = 'DomainError';
    this.errors = errors;
  }
}

/** کپی عمیق دادهٔ ساده (برای جلوگیری از درز شیء داخلی به UI) */
function clone(value) {
  if (value == null) return value;
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      /* داده غیرقابل کپی → روش JSON */
    }
  }
  return JSON.parse(JSON.stringify(value));
}

export function createAppStore({ storage = null, now = () => Date.now() } = {}) {
  const adapter = createStorageAdapter(storage);
  let exams = loadExams(adapter);
  let lastRemoved = null; // { exam, index } برای بازگردانی حذف
  const listeners = new Set();

  function emit() {
    for (const fn of [...listeners]) {
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

  function commit() {
    persist();
    emit();
  }

  /** همگام‌سازی وضعیت با ساعت واقعی: آزمون جاری‌ای که زمانش گذشته، قفل می‌شود */
  function syncExpired() {
    const t = now();
    let changed = false;
    for (const exam of exams) {
      if (exam.status === STATUS.IN_PROGRESS && isExpired(exam, t)) {
        exam.status = STATUS.TIME_UP;
        exam.pausedAt = null;
        exam.endedAt = scheduledEndsAt(exam.startedAt, exam.durationMinutes, pausedTotalMs(exam));
        changed = true;
      }
    }
    if (changed) commit();
  }

  syncExpired();

  function find(id) {
    return exams.find((e) => e.id === id) ?? null;
  }

  /** تغییر تراکنشی: در صورت خطا، آزمون دقیقاً به حالت قبلی برمی‌گردد */
  function update(id, mutate) {
    const index = exams.findIndex((e) => e.id === id);
    if (index < 0) throw new DomainError('آزمون پیدا نشد.');
    const backup = clone(exams[index]);
    try {
      mutate(exams[index]);
    } catch (err) {
      exams[index] = backup;
      throw err;
    }
    commit();
    return exams[index];
  }

  /** برآورد آماری برای داشبورد صفحهٔ اصلی (همه از روی دادهٔ واقعی ذخیره‌شده) */
  function computeStats() {
    const t = now();
    let graded = 0;
    let inProgress = 0;
    let ready = 0;
    let awaiting = 0;
    let questions = 0;
    let sum = 0;
    let best = null;
    let worst = null;
    let totalPausedMs = 0;

    for (const exam of exams) {
      questions += exam.questionCount;
      totalPausedMs += pausedTotalMs(exam) + (isPaused(exam) ? Math.max(0, t - exam.pausedAt) : 0);
      if (exam.status === STATUS.GRADED && exam.result) {
        graded += 1;
        const percent = exam.result.percentWithNegative;
        sum += percent;
        if (best == null || percent > best) best = percent;
        if (worst == null || percent < worst) worst = percent;
      } else if (exam.status === STATUS.IN_PROGRESS) inProgress += 1;
      else if (exam.status === STATUS.CREATED) ready += 1;
      else awaiting += 1;
    }

    return {
      total: exams.length,
      graded,
      inProgress,
      ready,
      awaiting,
      questions,
      averagePercent: graded > 0 ? sum / graded : null,
      bestPercent: best,
      worstPercent: worst,
      totalPausedMs,
    };
  }

  /** فهرست آزمون‌هایی که در این لحظه تایمرشان متوقف است */
  function collectPausedExams() {
    return exams.filter((e) => e.status === STATUS.IN_PROGRESS && isPaused(e));
  }

  function setAnswerImpl(id, questionIndex, optionId) {
    const t = now();
    return clone(
      update(id, (exam) => {
        if (currentPhase(exam, t) === PHASE.PAUSED) {
          throw new DomainError('تایمر آزمون متوقف است؛ برای پاسخ‌دادن، آزمون را ادامه دهید.');
        }
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
      }),
    );
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

    /** همهٔ آزمون‌ها به‌ترتیب تازه‌ترین (نسخهٔ کپی) */
    all() {
      syncExpired();
      return [...exams].sort((a, b) => b.createdAt - a.createdAt).map(clone);
    },

    /** آزمون با شناسه (نسخهٔ کپی) یا null */
    get(id) {
      syncExpired();
      const exam = find(id);
      return exam ? clone(exam) : null;
    },

    /** آزمون در حال برگزاری (اگر چند تا باشد، تازه‌ترین) */
    activeExam() {
      syncExpired();
      const list = exams
        .filter((e) => e.status === STATUS.IN_PROGRESS)
        .sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
      const exam = list[0] ?? null;
      return exam ? clone(exam) : null;
    },

    pausedExams() {
      syncExpired();
      return collectPausedExams().map(clone);
    },

    stats() {
      syncExpired();
      return computeStats();
    },

    addExam(input) {
      const check = validateExamInput(input);
      if (!check.ok) {
        throw new DomainError('ورودی‌های فرم نامعتبر است.', check.errors);
      }
      const exam = createExam(check.values, now());
      exams.push(exam);
      commit();
      return clone(exam);
    },

    /** ویرایش نام/دسته‌بندی — فقط پیش از شروع آزمون */
    updateExamMeta(id, input) {
      const check = validateExamMeta(input);
      if (!check.ok) {
        throw new DomainError('اطلاعات آزمون نامعتبر است.', check.errors);
      }
      const updated = update(id, (exam) => {
        if (exam.status !== STATUS.CREATED) {
          throw new DomainError('پس از شروع آزمون، ویرایش اطلاعات ممکن نیست.');
        }
        exam.name = check.values.name;
        exam.category = check.values.category;
        if (check.values.startNumber != null) exam.startNumber = check.values.startNumber;
      });
      return clone(updated);
    },

    /** تکرار آزمون: آزمون تازه با همان تنظیمات و بدون پاسخ/کلید */
    duplicateExam(id, { nameSuffix = ' (تکرار)' } = {}) {
      const source = find(id);
      if (!source) throw new DomainError('آزمون پیدا نشد.');
      const copy = createExam(
        {
          name: `${source.name}${nameSuffix}`.slice(0, 80).trim(),
          category: source.category,
          questionCount: source.questionCount,
          durationMinutes: source.durationMinutes,
          startNumber: source.startNumber,
        },
        now(),
      );
      exams.push(copy);
      commit();
      return clone(copy);
    },

    startExam(id) {
      return clone(
        update(id, (exam) => {
          if (exam.status !== STATUS.CREATED) {
            throw new DomainError('این آزمون قبلاً شروع شده است.');
          }
          const t = now();
          exam.status = STATUS.IN_PROGRESS;
          exam.startedAt = t;
          exam.endedAt = null;
          exam.pausedAt = null;
          exam.pausedTotalMs = 0;
          exam.pauseCount = 0;
        }),
      );
    },

    /** ثبت/تغییر/حذف پاسخ کاربر — فقط تا پیش از پایان زمان و در حالت اجرا */
    setAnswer: setAnswerImpl,

    /** حذف پاسخ یک سوال */
    clearAnswer(id, questionIndex) {
      return setAnswerImpl(id, questionIndex, null);
    },

    /** توقف تایمر؛ زمان آزمون در حین توقف مصرف نمی‌شود */
    pauseExam(id) {
      const t = now();
      return clone(
        update(id, (exam) => {
          if (exam.status !== STATUS.IN_PROGRESS) {
            throw new DomainError('فقط آزمون در حال برگزاری را می‌توان متوقف کرد.');
          }
          if (isPaused(exam)) throw new DomainError('تایمر آزمون از قبل متوقف است.');
          if (isExpired(exam, t)) throw new DomainError('زمان آزمون تمام شده است.');
          exam.pausedAt = Math.max(t, exam.startedAt);
          exam.pauseCount = (exam.pauseCount ?? 0) + 1;
        }),
      );
    },

    /** ادامهٔ آزمون پس از توقف؛ زمان توقف به مهلت آزمون اضافه می‌شود */
    resumeExam(id) {
      const t = now();
      return clone(
        update(id, (exam) => {
          if (exam.status !== STATUS.IN_PROGRESS) {
            throw new DomainError('آزمون در حال برگزاری نیست.');
          }
          if (!isPaused(exam)) throw new DomainError('تایمر آزمون متوقف نیست.');
          exam.pausedTotalMs = pausedTotalMs(exam) + Math.max(0, t - exam.pausedAt);
          exam.pausedAt = null;
        }),
      );
    },

    /** پایان دستی آزمون توسط کاربر (حتی در حالت توقف) */
    endExamManually(id) {
      const t = now();
      return clone(
        update(id, (exam) => {
          if (exam.status !== STATUS.IN_PROGRESS) {
            throw new DomainError('آزمون در حال برگزاری نیست.');
          }
          if (isPaused(exam)) {
            // توقف باز، پیش از پایان دستی بسته می‌شود تا آمار زمان درست بماند
            exam.pausedTotalMs = pausedTotalMs(exam) + Math.max(0, t - exam.pausedAt);
            exam.pausedAt = null;
          }
          exam.endedAt = Math.min(t, scheduledEndsAt(exam.startedAt, exam.durationMinutes, pausedTotalMs(exam)));
          exam.status = STATUS.AWAITING_GRADING;
        }),
      );
    },

    /** ورود به تصحیح‌کننده پس از پایان زمان */
    enterGrading(id) {
      return clone(
        update(id, (exam) => {
          const t = now();
          if (currentPhase(exam, t) !== PHASE.EXPIRED) {
            throw new DomainError('زمان آزمون هنوز تمام نشده است.');
          }
          exam.status = STATUS.AWAITING_GRADING;
          exam.pausedAt = null;
          if (exam.endedAt == null) {
            exam.endedAt = scheduledEndsAt(exam.startedAt, exam.durationMinutes, pausedTotalMs(exam));
          }
        }),
      );
    },

    /** ثبت یک مورد از کلید صحیح */
    setKeyEntry(id, questionIndex, optionId) {
      return clone(
        update(id, (exam) => {
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
        }),
      );
    },

    missingKeys(id) {
      const exam = find(id);
      if (!exam) throw new DomainError('آزمون پیدا نشد.');
      return findMissingKeys(exam.questionCount, exam.key);
    },

    /** شمارهٔ سوال‌های بی‌پاسخ (برای فهرست «نزده‌ها») */
    unansweredIndexes(id) {
      const exam = find(id);
      if (!exam) throw new DomainError('آزمون پیدا نشد.');
      return findUnanswered(exam.questionCount, exam.answers);
    },

    /**
     * اتمام تصحیح: اگر کلیدی جا افتاده باشد { ok:false, missing }؛
     * در غیر این صورت محاسبهٔ دقیق نتایج و ذخیرهٔ آن‌ها.
     */
    finishGrading(id) {
      const exam = find(id);
      if (!exam) throw new DomainError('آزمون پیدا نشد.');
      if (exam.status !== STATUS.AWAITING_GRADING) {
        throw new DomainError('آزمون در حالت تصحیح نیست.');
      }
      const missing = findMissingKeys(exam.questionCount, exam.key);
      if (missing.length > 0) {
        return { ok: false, missing };
      }
      const results = computeResults({
        total: exam.questionCount,
        answers: exam.answers,
        key: exam.key,
      });
      const graded = update(id, (e) => {
        e.status = STATUS.GRADED;
        e.gradedAt = now();
        e.pausedAt = null;
        e.result = {
          total: results.total,
          correct: results.correct,
          wrong: results.wrong,
          unanswered: results.unanswered,
          percentWithoutNegative: results.percentWithoutNegative,
          percentWithNegative: results.percentWithNegative,
          perQuestion: results.perQuestion,
          // آمار زمان (بدون توقف‌ها) برای صفحهٔ نتیجه
          durationMinutes: e.durationMinutes,
          activeElapsedMs: Math.min(activeElapsedMs(e, e.endedAt ?? now()), e.durationMinutes * 60_000),
          pausedTotalMs: pausedTotalMs(e),
          pauseCount: e.pauseCount ?? 0,
        };
      });
      return { ok: true, result: clone(graded.result) };
    },

    /** حذف آزمون؛ امکان بازگردانی با undoRemove() */
    removeExam(id) {
      const index = exams.findIndex((e) => e.id === id);
      if (index < 0) return false;
      lastRemoved = { exam: clone(exams[index]), index };
      exams = exams.filter((e) => e.id !== id);
      commit();
      return true;
    },

    canUndoRemove() {
      return lastRemoved != null;
    },

    /** بازگردانی آخرین آزمون حذف‌شده */
    undoRemove() {
      if (!lastRemoved) return false;
      const { exam, index } = lastRemoved;
      lastRemoved = null;
      if (find(exam.id)) return false;
      const at = Math.min(Math.max(0, index), exams.length);
      exams.splice(at, 0, exam);
      commit();
      return true;
    },

    /** متن پشتیبان JSON از همهٔ آزمون‌ها */
    exportBackup() {
      syncExpired();
      return serializeBackup(exams, now());
    },

    /**
     * بازگردانی پشتیبان.
     * mode='merge' (پیش‌فرض): فقط آزمون‌های جدید اضافه می‌شوند.
     * mode='replace': همهٔ آزمون‌های فعلی با محتوای پشتیبان جایگزین می‌شوند.
     */
    importBackup(text, { mode = 'merge' } = {}) {
      const parsed = parseBackup(text);
      if (!parsed.ok) return { ok: false, error: parsed.error, imported: 0, skipped: 0 };

      if (mode === 'replace') {
        exams = parsed.exams.map(clone);
        lastRemoved = null;
        commit();
        return { ok: true, imported: exams.length, skipped: 0, invalid: parsed.invalid, replaced: true };
      }

      const { added, skipped } = mergeExamsById(exams, parsed.exams);
      exams.push(...added);
      if (added.length > 0) commit();
      return { ok: true, imported: added.length, skipped, invalid: parsed.invalid, replaced: false };
    },

    /** زمان باقی‌ماندهٔ یک آزمون به میلی‌ثانیه (برای نمایش‌های همزمان‌شده) */
    remainingMs(id, at = now()) {
      const exam = find(id);
      if (!exam) return 0;
      return remainingMs(exam, at);
    },
  };
}
