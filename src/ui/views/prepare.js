// ── صفحهٔ آماده‌سازی: قبل از شروع، تایمر اجرا نمی‌شود ────────────────────────

import { h, clearEl } from '../dom.js';
import { icon, confirmDialog, toast } from '../components.js';
import { formatNumber, formatDuration, formatRange, normalizeStartNumber } from '../../core/format.js';
import { OPTIONS } from '../../core/scoring.js';
import {
  CATEGORIES,
  STATUS,
  startNumberOf,
  hasCompleteKey,
  isAutoGradeReady,
  isTimed,
  MAX_START_NUMBER,
} from '../../core/model.js';
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

    const timed = isTimed(current);
    const startBtn = h(
      'button',
      {
        class: 'btn btn-primary btn-xl btn-block',
        onClick: async () => {
          const ok = await confirmDialog({
            title: 'آماده‌ای؟',
            message: timed
              ? 'با شروع آزمون تایمر بلافاصله آغاز می‌شود. در صورت نیاز می‌توانید وسط آزمون تایمر را متوقف کنید و بعد ادامه دهید؛ زمان توقف از وقت آزمون کم نمی‌شود.'
              : 'این آزمون بدون محدودیت زمانی است و تایمر ندارد؛ هر زمان که خودتان دکمهٔ «پایان آزمون» را بزنید آزمون تمام می‌شود.',
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

    const autoGrade = isAutoGradeReady(current);
    const card = h(
      'section',
      { class: 'card prepare-card' },
      h('div', { class: 'prepare-orb' }, icon('play', 24)),
      h('span', { class: 'prepare-eyebrow' }, autoGrade ? 'کلید تصحیح آماده است' : 'همه‌چیز آمادهٔ شروع'),
      h('h3', { class: 'prepare-title' }, current.name),
      h('span', { class: 'prepare-cat' }, current.category),
      h(
        'div',
        { class: 'info-grid' },
        infoRow('تعداد سوالات', `${formatNumber(current.questionCount)} سوال`),
        infoRow('شمارهٔ سوال‌ها', `${formatRange(startNumberOf(current), current.questionCount)}`),
        infoRow('زمان آزمون', formatDuration(current.durationMinutes)),
        infoRow('گزینه‌ها', OPTIONS.map((o) => o.label).join(' · ')),
        infoRow(
          'توقف تایمر',
          timed ? 'فعال — زمان در حین توقف مصرف نمی‌شود' : 'ندارد — آزمون بدون تایمر است و با پایان دستی تمام می‌شود',
        ),
        infoRow(
          'تصحیح',
          autoGrade ? 'خودکار · کلید آزمون قبلی' : current.keyOrigin ? 'دستی · کلید ناقص' : 'دستی · ورود کلید پس از پایان',
        ),
      ),
      h(
        'p',
        { class: 'hint' },
        timed
          ? 'تا زمانی که دکمهٔ «شروع آزمون» را نزنید، تایمر آغاز نمی‌شود.'
          : 'این آزمون بدون محدودیت زمانی است؛ هر زمان آماده بودید شروع کنید و هر وقت خواستید آزمون را تمام کنید.',
      ),
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
        editing ? ' بستن ویرایش' : ' ویرایش نام، دسته‌بندی و شمارهٔ سوال‌ها',
      ),
    );

    const inheritCard = inheritedKeyCard(current);
    const editForm = editing ? editCard(current) : null;

    container.append(
      h(
        'header',
        { class: 'page-header' },
        h('a', { class: 'btn btn-ghost btn-sm', href: '#/' }, '→ بازگشت'),
        h('h2', null, 'آماده‌ای؟'),
      ),
      h('main', { class: 'page' }, card, inheritCard, editForm),
    );
  }

  /**
   * اطلاع‌رسانی کلید به‌ارث‌رسیده: کاربر می‌داند که پس از پایان آزمون
   * کلیدها را دوباره وارد نمی‌کند و کارنامه خودکار ساخته می‌شود.
   */
  function inheritedKeyCard(current) {
    const origin = current.keyOrigin;
    if (!origin) return null;
    const complete = hasCompleteKey(current);
    const sourceName = origin.examName || 'آزمون قبلی';
    return h(
      'section',
      { class: `card inherit-card${complete ? '' : ' is-incomplete'}` },
      h('span', { class: 'inherit-icon' }, icon(complete ? 'zap' : 'warning', 22)),
      h(
        'div',
        { class: 'inherit-body' },
        h('h3', null, complete ? 'کلید تصحیح از قبل آماده است' : 'کلید به‌ارث‌رسیده کامل نیست'),
        h(
          'p',
          null,
          complete
            ? `کلید صحیح ${formatNumber(current.questionCount)} سوال از آزمون «${sourceName}» به ارث رسیده است؛ نیازی به وارد کردن دوبارهٔ کلیدها نیست. با پایان آزمون، کارنامه به‌صورت خودکار ساخته می‌شود.`
            : `این آزمون از روی «${sourceName}» تکرار شده اما کلید کامل نیست؛ پس از پایان، تصحیح‌کننده باز می‌شود و باید کلیدها را وارد کنید.`,
        ),
        h(
          'button',
          {
            class: 'btn btn-ghost btn-sm',
            type: 'button',
            onClick: async () => {
              const ok = await confirmDialog({
                title: 'ورود کلید جدید',
                message: complete
                  ? 'کلید به‌ارث‌رسیده پاک شود؟ در این صورت پس از پایان آزمون باید پاسخ صحیح همهٔ سوال‌ها را خودتان وارد کنید.'
                  : 'کلید به‌ارث‌رسیده پاک شود؟',
                confirmLabel: 'پاک کردن کلید',
                cancelLabel: 'انصراف',
                danger: true,
              });
              if (!ok) return;
              try {
                store.clearInheritedKey(current.id);
                toast('کلید پاک شد؛ تصحیح این آزمون دستی خواهد بود.', 'info');
              } catch (err) {
                toast(err.message ?? 'پاک کردن کلید ممکن نشد.', 'error');
              }
            },
          },
          icon('key', 15),
          ' وارد کردن کلید جدید',
        ),
      ),
    );
  }

  function editCard(current) {
    const nameInput = h('input', {
      class: 'input',
      type: 'text',
      id: 'e-name',
      value: current.name,
      attrs: { maxlength: '80' },
    });
    const startInput = h('input', {
      class: 'input',
      type: 'text',
      id: 'e-start',
      inputmode: 'numeric',
      value: String(startNumberOf(current)),
      attrs: { autocomplete: 'off' },
    });
    const categorySelect = h(
      'select',
      { class: 'input select', id: 'e-category' },
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
            store.updateExamMeta(current.id, {
              name: nameInput.value,
              category: categorySelect.value,
              startNumber: startInput.value,
            });
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
      h('div', { class: 'field' }, h('label', { for: 'e-name' }, 'نام آزمون'), nameInput),
      h('div', { class: 'field' }, h('label', { for: 'e-category' }, 'دسته‌بندی'), categorySelect),
      h(
        'div',
        { class: 'field' },
        h('label', { for: 'e-start' }, 'شمارهٔ اولین سوال'),
        startInput,
        h(
          'span',
          { class: 'field-hint' },
          `شمارهٔ سوال‌ها: ${formatRange(normalizeStartNumber(startInput.value), current.questionCount)} (حداکثر ${formatNumber(MAX_START_NUMBER)})`,
        ),
      ),
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
