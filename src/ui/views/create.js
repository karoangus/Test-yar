// ── صفحهٔ ساخت آزمون جدید ───────────────────────────────────────────────────

import { h, clearEl } from '../dom.js';
import { icon, toast } from '../components.js';
import { CATEGORIES, MAX_QUESTIONS, MAX_START_NUMBER } from '../../core/model.js';
import { DomainError } from '../../core/store.js';
import { toFa, formatNumber, formatRange, normalizeStartNumber, normalizeDigits } from '../../core/format.js';

const DURATION_PRESETS = [10, 20, 30, 45, 60, 90];
const COUNT_PRESETS = [10, 20, 30, 50, 100];
const START_PRESETS = [1, 51, 101, 201];

export function createView({ rootEl, store, navigate }) {
  const container = h('div', { class: 'view' });
  rootEl.append(container);

  const nameInput = h('input', {
    class: 'input',
    type: 'text',
    id: 'f-name',
    placeholder: 'مثلاً: آزمون درس اول عربی',
    attrs: { autocomplete: 'off', maxlength: '80' },
  });
  const countInput = h('input', {
    class: 'input',
    type: 'text',
    id: 'f-count',
    inputmode: 'numeric',
    placeholder: 'مثلاً: 20',
    attrs: { autocomplete: 'off' },
  });
  const startInput = h('input', {
    class: 'input',
    type: 'text',
    id: 'f-start',
    inputmode: 'numeric',
    placeholder: 'مثلاً: ۵۲ — خالی یعنی از سوال ۱',
    attrs: { autocomplete: 'off' },
  });
  const durationInput = h('input', {
    class: 'input',
    type: 'text',
    id: 'f-duration',
    inputmode: 'decimal',
    placeholder: 'مثلاً: 30',
    attrs: { autocomplete: 'off' },
  });
  const categorySelect = h(
    'select',
    { class: 'input select', id: 'f-category' },
    ...CATEGORIES.map((c) => h('option', { value: c }, c)),
  );

  const errEls = {};
  const fieldError = (key) =>
    (errEls[key] = h('p', { class: 'field-error', attrs: { 'aria-live': 'polite', role: 'alert', hidden: 'hidden' } }));

  /** چیدمان چیپ‌های پیشنهادی مقدار (زمان یا تعداد سوال) */
  function presetChips(values, input, format) {
    const wrap = h('div', { class: 'preset-chips' });
    for (const value of values) {
      wrap.append(
        h('button', {
          class: 'chip chip-btn',
          type: 'button',
          text: format(value),
          onClick: (e) => {
            input.value = String(value);
            syncActive(wrap, input, format);
            showErrors({});
            e.currentTarget.blur();
          },
        }),
      );
    }
    const syncActive = () => {
      const current = input.value.trim();
      for (const btn of wrap.children) {
        btn.classList.toggle('chip-active', btn.textContent.trim() === format(current));
      }
    };
    input.addEventListener('input', () => syncActive());
    input.addEventListener('blur', () => syncActive());
    return { wrap, syncActive };
  }

  const countPresets = presetChips(COUNT_PRESETS, countInput, (v) => `${toFa(v)} سوال`);
  const startPresets = presetChips(START_PRESETS, startInput, (v) => `از ${toFa(v)}`);
  const durationPresets = presetChips(DURATION_PRESETS, durationInput, (v) => `${toFa(v)} دقیقه`);

  /**
   * پیش‌نمایش زندهٔ شمارهٔ سوال‌ها؛ همان چیزی که در پاسخ‌برگ و تصحیح‌کننده می‌بینید.
   * این تنها راهی است که کاربر می‌فهمد آزمونش از سوال ۵۲ تا ۶۲ است، نه ۱ تا ۱۰.
   */
  const rangePreview = h('span', { class: 'range-preview', dataset: { rangePreview: '1' } });
  function refreshRangePreview() {
    const count = Number(normalizeDigits(countInput.value));
    const start = normalizeStartNumber(startInput.value);
    rangePreview.textContent =
      Number.isInteger(count) && count > 0
        ? `شمارهٔ سوال‌ها: ${formatRange(start, count)}`
        : 'تعداد سوال‌ها را وارد کنید تا بازهٔ شماره‌ها را ببینید.';
  }
  countInput.addEventListener('input', refreshRangePreview);
  startInput.addEventListener('input', refreshRangePreview);
  refreshRangePreview();

  const form = h(
    'form',
    {
      class: 'card form-card',
      onSubmit: (e) => {
        e.preventDefault();
        submit();
      },
    },
    h('div', { class: 'field' }, h('label', { for: 'f-name' }, 'نام آزمون'), nameInput, fieldError('name')),
    h(
      'div',
      { class: 'field' },
      h('label', { for: 'f-count' }, 'تعداد سوالات'),
      countPresets.wrap,
      countInput,
      h('span', { class: 'field-hint' }, `حداکثر ${formatNumber(MAX_QUESTIONS)} سوال`),
      fieldError('questionCount'),
    ),
    h(
      'div',
      { class: 'field' },
      h('label', { for: 'f-start' }, 'شمارهٔ اولین سوال'),
      startPresets.wrap,
      startInput,
      h(
        'span',
        { class: 'field-hint' },
        `اگر آزمون شما از سوال ۱ شروع نمی‌شود شمارهٔ سوال اول را بنویسید (مثلاً ۵۲)؛ حداکثر ${formatNumber(MAX_START_NUMBER)}.`,
      ),
      rangePreview,
      fieldError('startNumber'),
    ),
    h(
      'div',
      { class: 'field' },
      h('label', { for: 'f-duration' }, 'زمان آزمون (دقیقه)'),
      durationPresets.wrap,
      durationInput,
      h('span', { class: 'field-hint' }, 'زمان دقیق است و می‌توانید وسط آزمون تایمر را متوقف کنید.'),
      fieldError('duration'),
    ),
    h(
      'div',
      { class: 'field' },
      h('label', { for: 'f-category' }, 'دسته‌بندی'),
      categorySelect,
      fieldError('category'),
    ),
    h('button', { class: 'btn btn-primary btn-block btn-xl', type: 'submit' }, icon('plus', 18), ' ساخت آزمون'),
  );

  function submit() {
    try {
      const exam = store.addExam({
        name: nameInput.value,
        questionCount: countInput.value,
        startNumber: startInput.value,
        durationMinutes: durationInput.value,
        category: categorySelect.value,
      });
      toast('آزمون ساخته شد.', 'success');
      navigate(`/exam/${exam.id}`);
    } catch (err) {
      if (err instanceof DomainError && err.errors) {
        showErrors(err.errors);
        toast('ورودی‌ها را بررسی کنید.', 'error');
      } else {
        toast('خطا در ساخت آزمون.', 'error');
      }
    }
  }

  function showErrors(next = {}) {
    for (const key of Object.keys(errEls)) {
      const message = next[key] ?? '';
      errEls[key].textContent = message;
      errEls[key].hidden = message.length === 0;
    }
    const order = ['name', 'questionCount', 'startNumber', 'duration', 'category'];
    const firstKey = order.find((k) => next[k]);
    if (firstKey) {
      const inputs = {
        name: nameInput,
        questionCount: countInput,
        startNumber: startInput,
        duration: durationInput,
        category: categorySelect,
      };
      inputs[firstKey].focus();
    }
  }

  container.append(
    h(
      'header',
      { class: 'page-header' },
      h('a', { class: 'btn btn-ghost btn-sm', href: '#/' }, '→ بازگشت'),
      h('h2', null, 'ساخت آزمون جدید'),
    ),
    h('main', { class: 'page' }, form),
  );

  nameInput.focus();

  return () => {
    clearEl(container);
    container.remove();
  };
}
