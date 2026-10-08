// ── صفحهٔ آماده‌سازی: قبل از شروع، تایمر اجرا نمی‌شود ────────────────────────

import { h } from '../dom.js';
import { icon } from '../components.js';
import { formatNumber, formatDuration } from '../../core/format.js';
import { confirmDialog } from '../components.js';

export function prepareView({ rootEl, store, navigate, exam }) {
  const container = h('div', { class: 'view' });
  rootEl.append(container);

  const infoRow = (label, value) =>
    h('div', { class: 'info-row' }, h('span', { class: 'info-label' }, label), h('strong', null, value));

  const startBtn = h(
    'button',
    {
      class: 'btn btn-primary btn-xl btn-block',
      onClick: async () => {
        const ok = await confirmDialog({
          title: 'آماده‌ای؟',
          message: 'با شروع آزمون، تایمر بلافاصله آغاز می‌شود و تا پایان زمان متوقف نخواهد شد.',
          confirmLabel: 'شروع آزمون',
          cancelLabel: 'هنوز نه',
        });
        if (!ok) return;
        store.startExam(exam.id);
        navigate(`/exam/${exam.id}`);
      },
    },
    'شروع آزمون',
  );

  container.append(
    h(
      'header',
      { class: 'page-header' },
      h('a', { class: 'btn btn-ghost btn-sm', href: '#/' }, '→ بازگشت'),
      h('h2', null, 'آماده‌ای؟'),
    ),
    h(
      'main',
      { class: 'page' },
      h(
        'section',
        { class: 'card prepare-card' },
        h('h3', { class: 'prepare-title' }, exam.name),
        h('span', { class: 'prepare-cat' }, exam.category),
        h(
          'div',
          { class: 'info-grid' },
          infoRow('تعداد سوالات', `${formatNumber(exam.questionCount)} سوال`),
          infoRow('زمان آزمون', formatDuration(exam.durationMinutes)),
          infoRow('گزینه‌ها', 'الف · ب · ج · د'),
        ),
        h('p', { class: 'hint' }, 'تا زمانی که دکمهٔ «شروع آزمون» را نزنید، تایمر آغاز نمی‌شود.'),
        startBtn,
      ),
    ),
  );

  const unsub = store.subscribe(() => {
    const current = store.get(exam.id);
    if (!current || current.status !== 'created') {
      navigate(`/exam/${exam.id}`);
    }
  });

  return () => {
    unsub();
    container.remove();
  };
}
