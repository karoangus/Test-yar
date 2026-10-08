// ── منطق خالص تصحیح و محاسبات آزمون ────────────────────────────────────────
// بدون هیچ وابستگی به رابط کاربری یا ذخیره‌سازی؛ ورودی/خروجی ساده.

// گزینه‌ها عددی نمایش داده می‌شوند: ۱ · ۲ · ۳ · ۴ (نه الف/ب/ج/د)
export const OPTIONS = Object.freeze([
  { id: 'A', label: '۱', number: 1 },
  { id: 'B', label: '۲', number: 2 },
  { id: 'C', label: '۳', number: 3 },
  { id: 'D', label: '۴', number: 4 },
]);

export const OPTION_IDS = Object.freeze(OPTIONS.map((o) => o.id));

const BY_ID = new Map(OPTIONS.map((o) => [o.id, o]));

// نگاشت میان‌بُرهای کیبورد (ارقام فارسی/لاتین و جایگزین‌های شناخته‌شده) به شناسهٔ گزینه
const KEY_TO_OPTION = new Map([
  ['1', 'A'],
  ['2', 'B'],
  ['3', 'C'],
  ['4', 'D'],
  ['۱', 'A'],
  ['۲', 'B'],
  ['۳', 'C'],
  ['۴', 'D'],
  ['a', 'A'],
  ['b', 'B'],
  ['c', 'C'],
  ['d', 'D'],
  ['a', 'A'],
]);

export function optionLabel(id) {
  return BY_ID.get(id)?.label ?? '—';
}

export function optionNumber(id) {
  return BY_ID.get(id)?.number ?? null;
}

/** برچسب کامل برای فناوری‌های کمکی: «گزینه ۲» */
export function optionTitle(id) {
  const label = optionLabel(id);
  return label === '—' ? 'گزینه' : `گزینه ${label}`;
}

/** تبدیل کلید فشرده‌شدهٔ کیبورد به شناسهٔ گزینه (در غیر این صورت null) */
export function optionFromKey(key) {
  if (key == null) return null;
  return KEY_TO_OPTION.get(String(key).trim().toLowerCase()) ?? null;
}

export const QUESTION_STATUS = Object.freeze({
  CORRECT: 'correct',
  WRONG: 'wrong',
  UNANSWERED: 'unanswered',
});

export function isValidOption(value) {
  return OPTION_IDS.includes(value);
}

/**
 * وضعیت یک سوال بر اساس پاسخ کاربر و کلید صحیح.
 * قانون: پاسخ کاربر === کلید → درست؛ پاسخ کاربر هست ولی متفاوت → غلط؛
 * پاسخ کاربر نیست → نزده.
 */
export function gradeQuestion(userAnswer, correctAnswer) {
  if (userAnswer == null || userAnswer === '') return QUESTION_STATUS.UNANSWERED;
  if (!isValidOption(correctAnswer)) {
    throw new Error('کلید صحیح برای این سوال وارد نشده است');
  }
  return userAnswer === correctAnswer ? QUESTION_STATUS.CORRECT : QUESTION_STATUS.WRONG;
}

/** شمارهٔ سوال‌هایی (ایندکس صفر-مبنا) که کلید صحیح ندارند یا نامعتبر است */
export function findMissingKeys(total, key) {
  const missing = [];
  for (let i = 0; i < total; i += 1) {
    if (!isValidOption(key == null ? undefined : key[i])) missing.push(i);
  }
  return missing;
}

/** شمارهٔ سوال‌های بدون پاسخ کاربر (برای فهرست «نزده‌ها») */
export function findUnanswered(total, answers) {
  const list = [];
  for (let i = 0; i < total; i += 1) {
    if (!isValidOption(answers == null ? undefined : answers[i])) list.push(i);
  }
  return list;
}

/**
 * محاسبهٔ دقیق نتایج آزمون.
 * مقادیر درصد به‌صورت خام (float کامل) برگردانده می‌شوند؛ گرد کردن فقط در
 * لایهٔ نمایش (formatPercent) انجام می‌گیرد.
 *
 * فرمول‌ها:
 *   درصد بدون نمره منفی = (درست ÷ کل) × ۱۰۰
 *   درصد با نمره منفی  = ((درست − غلط ÷ ۳) ÷ کل) × ۱۰۰
 */
export function computeResults({ total, answers = {}, key = {} }) {
  if (!Number.isInteger(total) || total < 1) {
    throw new Error('تعداد کل سوالات نامعتبر است');
  }
  const missing = findMissingKeys(total, key);
  if (missing.length > 0) {
    throw new Error('کلید همهٔ سوالات وارد نشده است');
  }

  const perQuestion = [];
  let correct = 0;
  let wrong = 0;
  let unanswered = 0;

  for (let i = 0; i < total; i += 1) {
    const userAnswer = answers[i] ?? null;
    const correctAnswer = key[i];
    const status = gradeQuestion(userAnswer, correctAnswer);
    if (status === QUESTION_STATUS.CORRECT) correct += 1;
    else if (status === QUESTION_STATUS.WRONG) wrong += 1;
    else unanswered += 1;
    perQuestion.push({ index: i, userAnswer, correctAnswer, status });
  }

  const percentWithoutNegative = (correct / total) * 100;
  const percentWithNegative = ((correct - wrong / 3) / total) * 100;

  return {
    total,
    correct,
    wrong,
    unanswered,
    percentWithoutNegative,
    percentWithNegative,
    perQuestion,
  };
}
