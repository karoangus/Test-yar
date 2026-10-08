// ── صفحهٔ آماده‌سازی: قبل از شروع، تایمر اجرا نمی‌شود ────────────────────────

import { h, clearEl } from '../dom.js';
import { icon, confirmDialog, toast } from '../components.js';
import { formatNumber, formatDuration } from '../../core/format.js';
import { OPTIONS } from '../../core/scoring.js';
import { CATEGORIES, STATUS } from '../../core/model.js';
import { DomainError } from '../../core/store.js';

export function prepareView({ rootEl, store, navigate, exam }) {
  const container = h('div', { class: 'view' });
  rootEl.append(container);
  let editing = false;

  function render() {
    clearEl(container);
    const current = store.get(exam.id);
    if (!current || current.status !== STATUS.CREATED) return;

    const infoRow = (label, value) =>
      h('div', { class: 'info-row' }, h('span', { class: 'info-label' }, label), h('strong', null, value));

    const startBtn = h(
      'button',
      {
        class: 'btn btn-primary btn-xl btn-block',
        onClick: async () => {
          const ok = await confirmDialog({
            title: 'آماده‌ای؟',
            message:
              'با شروع آزمون تایمر بلافاصله آغاز می‌شود. در صورت نیاز می‌توانید وسط آزمون تایمر را متوقف کنید و بعد ادامه دهید؛ زمان توقف از وقت آزمون کم نمی‌شود.',
            confirmLabel: 'شروع آزمون',
            cancelLabel: 'هنوز نه',
          });
          if (!ok) return;
          store.startExam(exam.id);
          navigate(`/exam/${exam.id}`);
        },
      },
      icon('play', 18),
      ' شروع آزمون',
    );

    const card = h(
      'section',
      { class: 'card prepare-card' },
      h('h3', { class: 'prepare-title' }, current.name),
      h('span', { class: 'prepare-cat' }, current.category),
      h(
        'div',
        { class: 'info-grid' },
        infoRow('تعداد سوالات', `${formatNumber(current.questionCount)} سوال`),
        infoRow('زمان آزمون', formatDuration(current.durationMinutes)),
        infoRow('گزینه‌ها', OPTIONS.map((o) => o.label).join(' · ')),
        infoRow('توقف تایمر', 'فعال — زمان در حین توقف مصرف نمی‌شود'),
      ),
      h('p', { class: 'hint' }, 'تا زمانی که دکمهٔ «شروع آزمون» را نزنید، تایمر آغاز نمی‌شود.'),
      startBtn,
      h(
        'button',
        {
          class: 'btn btn-ghost btn-sm',
          type: 'button',
          onClick: () => {
            editing = !editing;
            render();
          },
        },
        icon('edit', 16),
        editing ? ' بستن ویرایش' : ' ویرایش نام و دسته‌بندی',
      ),
    );

    const editForm = editing ? editCard(current) : null;

    container.append(
      h(
        'header',
        { class: 'page-header' },
        h('a', { class: 'btn btn-ghost btn-sm', href: '#/' }, '→ بازگشت'),
        h('h2', null, 'آماده‌ای؟'),
      ),
      h('main', { class: 'page' }, card, editForm),
    );
  }

  function editCard(current) {
    const nameInput = h('input', { class: 'input', type: 'text', value: current.name, attrs: { maxlength: '80' } });
    const categorySelect = h(
      'select',
      { class: 'input select' },
      ...CATEGORIES.map((c) => h('option', { value: c, selected: c === current.category }, c)),
    );
    const errorEl = h('p', { class: 'field-error', hidden: true });

    return h(
      'form',
      {
        class: 'card form-card',
        onSubmit: (e) => {
          e.preventDefault();
          try {
            store.updateExamMeta(current.id, { name: nameInput.value, category: categorySelect.value });
            editing = false;
            toast('اطلاعات آزمون به‌روزرسانی شد.', 'success');
            render();
          } catch (err) {
            if (err instanceof DomainError && err.errors) {
              errorEl.textContent = Object.values(err.errors)[0] ?? 'اطلاعات نامعتبر است.';
              errorEl.hidden = false;
            } else {
              toast('به‌روزرسانی ممکن نشد.', 'error');
            }
          }
        },
      },
      h('div', { class: 'field' }, h('label', null, 'نام آزمون'), nameInput),
      h('div', { class: 'field' }, h('label', null, 'دسته‌بندی'), categorySelect),
      errorEl,
      h(
        'div',
        { class: 'form-actions' },
        h('button', { class: 'btn btn-primary', type: 'submit' }, 'ذخیره'),
        h(
          'button',
          {
            class: 'btn btn-ghost',
            type: 'button',
            onClick: () => {
              editing = false;
              render();
            },
          },
          'انصراف',
        ),
      ),
    );
  }

  render();

  const unsub = store.subscribe(() => {
    const current = store.get(exam.id);
    if (!current || current.status !== STATUS.CREATED) {
      navigate(`/exam/${exam.id}`);
      return;
    }
    if (!editing) render();
  });

  return () => {
    unsub();
    container.remove();
  };
}
