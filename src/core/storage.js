// ── لایهٔ ذخیره‌سازی پایدار (localStorage با fallback ایمن) ──────────────────

import { STATUS, CATEGORIES } from './model.js';
import { isValidOption } from './scoring.js';

export const STORAGE_KEY = 'testyar.exams.v1';

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

/** بازسازی ایمن یک آزمون از دادهٔ خام؛ در صورت خراب بودن null برمی‌گرداند */
export function sanitizeExam(raw) {
  if (raw == null || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' && raw.id.length > 0 ? raw.id : null;
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : null;
  const questionCount = Number.isInteger(raw.questionCount) ? raw.questionCount : NaN;
  const durationMinutes = Number.isFinite(raw.durationMinutes) ? raw.durationMinutes : NaN;
  if (!id || !name || !Number.isInteger(questionCount) || questionCount < 1) return null;
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return null;

  const status = Object.values(STATUS).includes(raw.status) ? raw.status : STATUS.CREATED;
  const category = CATEGORIES.includes(raw.category) ? raw.category : 'سایر';

  return {
    id,
    name,
    category,
    questionCount,
    durationMinutes,
    status,
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
    startedAt: Number.isFinite(raw.startedAt) ? raw.startedAt : null,
    endedAt: Number.isFinite(raw.endedAt) ? raw.endedAt : null,
    gradedAt: Number.isFinite(raw.gradedAt) ? raw.gradedAt : null,
    answers: sanitizeAnswerMap(raw.answers, questionCount),
    key: sanitizeAnswerMap(raw.key, questionCount),
    result:
      raw.result != null && typeof raw.result === 'object' && Number.isFinite(raw.result.percentWithNegative)
        ? raw.result
        : null,
  };
}

export function loadExams(adapter) {
  const text = adapter.getItem(STORAGE_KEY);
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitizeExam).filter(Boolean);
  } catch {
    return [];
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
