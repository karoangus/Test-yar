// ── صفحهٔ ساخت آزمون جدید ───────────────────────────────────────────────────

import { h, clearEl } from '../dom.js';
import { icon, toast } from '../components.js';
import { CATEGORIES } from '../../core/model.js';
import { DomainError } from '../../core/store.js';
import { toFa } from '../../core/format.js';

const DURATION_PRESETS = [10, 20, 30, 45, 60, 90];

export function createView({ rootEl, store, navigate }) {
  const container = h('div', { class: 'view' });
  rootEl.append(container);

  const nameInput = h('input', {
    class: 'input',
    type: 'text',
    id: 'f-name',
    placeholder: 'مثلاً: آزمون درس اول عربی',
    attrs: { autocomplete: 'off' },
  });
  const countInput = h('input', {
    class: 'input',
    type: 'text',
    id: 'f-count',
    inputmode: 'numeric',
    placeholder: 'مثلاً: 20',
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
    (errEls[key] = h('p', { class: 'field-error', attrs: { 'aria-live': 'polite', role: 'alert' } }));

  const presetWrap = h('div', { class: 'preset-chips' });
  for (const p of DURATION_PRESETS) {
    presetWrap.append(
      h('button', {
        class: 'chip chip-btn',
        type: 'button',
        text: `${toFa(p)} دقیقه`,
        onClick: (e) => {
          durationInput.value = String(p);
          for (const b of presetWrap.children) b.classList.remove('chip-active');
          e.currentTarget.classList.add('chip-active');
          showErrors({});
        },
      }),
    );
  }
  durationInput.addEventListener('input', () => {
    for (const b of presetWrap.children) {
      b.classList.toggle('chip-active', b.textContent.trim() === `${toFa(durationInput.value.trim())} دقیقه`);
    }
  });

  const form = h(
    'form',
    {
      class: 'card form-card',
      onSubmit: (e) => {
        e.preventDefault();
        try {
          const exam = store.addExam({
            name: nameInput.value,
            questionCount: countInput.value,
            durationMinutes: durationInput.value,
            category: categorySelect.value,
          });
          toast('آزمون ساخته شد.', 'success');
          navigate(`/exam/${exam.id}`);
        } catch (err) {
          if (err instanceof DomainError && err.errors) {
            showErrors(err.errors);
          } else {
            toast('خطا در ساخت آزمون.', 'error');
          }
        }
      },
    },
    h('div', { class: 'field' }, h('label', { for: 'f-name' }, 'نام آزمون'), nameInput, fieldError('name')),
    h(
      'div',
      { class: 'field' },
      h('label', { for: 'f-count' }, 'تعداد سوالات'),
      countInput,
      fieldError('questionCount'),
    ),
    h(
      'div',
      { class: 'field' },
      h('label', { for: 'f-duration' }, 'زمان آزمون (دقیقه)'),
      presetWrap,
      durationInput,
      fieldError('duration'),
    ),
    h(
      'div',
      { class: 'field' },
      h('label', { for: 'f-category' }, 'دسته‌بندی'),
      categorySelect,
      fieldError('category'),
    ),
    h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'ساخت آزمون'),
  );

  function showErrors(next = {}) {
    for (const key of Object.keys(errEls)) {
      errEls[key].textContent = next[key] ?? '';
      errEls[key].hidden = !next[key];
    }
    const firstKey = ['name', 'questionCount', 'duration', 'category'].find((k) => next[k]);
    if (firstKey) {
      const inputs = { name: nameInput, questionCount: countInput, duration: durationInput, category: categorySelect };
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

  return () => container.remove();
}
