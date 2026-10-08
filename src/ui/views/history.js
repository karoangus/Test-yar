// ── تاریخچهٔ آزمون‌ها ────────────────────────────────────────────────────────

import { h, clearEl } from '../dom.js';
import { statusBadge, confirmDialog, toast } from '../components.js';
import { formatNumber, formatDuration, formatPercent, formatDateTime } from '../../core/format.js';
import { STATUS } from '../../core/model.js';

export function historyView({ rootEl, store, navigate }) {
  const container = h('div', { class: 'view' });
  rootEl.append(container);

  function render() {
    clearEl(container);
    const exams = store.all();

    const list = h('section', { class: 'history-list' });
    if (exams.length === 0) {
      list.append(h('div', { class: 'empty-state' }, h('h2', null, 'تاریخچه‌ای وجود ندارد'), h('a', { class: 'btn btn-primary', href: '#/new' }, 'ساخت آزمون')));
    } else {
      for (const exam of exams) list.append(historyCard(exam));
    }

    container.append(
      h(
        'header',
        { class: 'page-header' },
        h('a', { class: 'btn btn-ghost btn-sm', href: '#/' }, '→ بازگشت'),
        h('h2', null, 'تاریخچه آزمون‌ها'),
      ),
      h('main', { class: 'page' }, list),
    );
  }

  function historyCard(exam) {
    const rows = [
      ['دسته‌بندی', exam.category],
      ['تاریخ ایجاد', formatDateTime(exam.createdAt)],
      ['تعداد سوال', formatNumber(exam.questionCount)],
      ['زمان', formatDuration(exam.durationMinutes)],
    ];
    if (exam.result) {
      rows.push(
        ['درست', formatNumber(exam.result.correct)],
        ['غلط', formatNumber(exam.result.wrong)],
        ['نزده', formatNumber(exam.result.unanswered)],
        ['درصد بدون نمره منفی', formatPercent(exam.result.percentWithoutNegative)],
        ['درصد با نمره منفی', formatPercent(exam.result.percentWithNegative)],
      );
      if (exam.gradedAt) rows.push(['تاریخ تصحیح', formatDateTime(exam.gradedAt)]);
    }

    const delBtn = h(
      'button',
      {
        class: 'btn btn-ghost btn-sm btn-icon',
        attrs: { 'aria-label': 'حذف آزمون' },
        onClick: async (e) => {
          e.stopPropagation();
          const ok = await confirmDialog({
            title: 'حذف آزمون',
            message: `آزمون «${exam.name}» برای همیشه حذف شود؟`,
            confirmLabel: 'حذف',
            cancelLabel: 'انصراف',
            danger: true,
          });
          if (ok) {
            store.removeExam(exam.id);
            toast('آزمون حذف شد.', 'success');
          }
        },
      },
      '🗑',
    );

    return h(
      'article',
      {
        class: 'card history-card',
        onClick: () => navigate(`/exam/${exam.id}${exam.status === STATUS.GRADED ? '/result' : ''}`),
      },
      h(
        'div',
        { class: 'card-top' },
        h('h3', { class: 'card-title' }, exam.name),
        h('div', { class: 'history-actions' }, statusBadge(exam.status), delBtn),
      ),
      h('dl', { class: 'history-grid' }, rows.flatMap(([label, value]) => [h('dt', null, label), h('dd', null, String(value))])),
    );
  }

  render();
  const unsub = store.subscribe(render);
  return () => {
    unsub();
    container.remove();
  };
}
