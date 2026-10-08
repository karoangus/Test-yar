// ── منطق خالص تصحیح و محاسبات آزمون ────────────────────────────────────────
// بدون هیچ وابستگی به رابط کاربری یا ذخیره‌سازی؛ ورودی/خروجی ساده.

export const OPTIONS = Object.freeze([
  { id: 'A', label: 'الف' },
  { id: 'B', label: 'ب' },
  { id: 'C', label: 'ج' },
  { id: 'D', label: 'د' },
]);

export const OPTION_IDS = Object.freeze(OPTIONS.map((o) => o.id));

export function optionLabel(id) {
  const found = OPTIONS.find((o) => o.id === id);
  return found ? found.label : '—';
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
