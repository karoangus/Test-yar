// ── صفحه نتیجه: آمار دقیق و نمودار نسبت پاسخ‌ها ─────────────────────────────

import { h } from '../dom.js';
import { icon, splitBar } from '../components.js';
import { formatNumber, formatPercent, formatDateTime, formatDuration } from '../../core/format.js';
import { optionLabel, QUESTION_STATUS } from '../../core/scoring.js';

export function resultView({ rootEl, store, navigate, exam }) {
  const container = h('div', { class: 'view' });
  rootEl.append(container);

  const current = store.get(exam.id);
  const result = current?.result;

  if (!current || !result) {
    container.append(
      h(
        'main',
        { class: 'page' },
        h('div', { class: 'empty-state' }, h('h2', null, 'نتیجه‌ای ثبت نشده است'), h('a', { class: 'btn btn-primary', href: '#/' }, 'بازگشت به خانه')),
      ),
    );
    return () => container.remove();
  }

  const statCard = (emoji, label, value, tone) =>
    h(
      'div',
      { class: `stat-card ${tone}` },
      h('span', { class: 'stat-emoji' }, emoji),
      h('strong', { class: 'stat-value' }, value),
      h('span', { class: 'stat-label' }, label),
    );

  const reviewRows = result.perQuestion.map((q) => {
    const statusText =
      q.status === QUESTION_STATUS.CORRECT ? 'درست' : q.status === QUESTION_STATUS.WRONG ? 'غلط' : 'نزده';
    const statusClass =
      q.status === QUESTION_STATUS.CORRECT ? 'st-correct' : q.status === QUESTION_STATUS.WRONG ? 'st-wrong' : 'st-none';
    return h(
      'li',
      { class: 'review-row' },
      h('span', { class: 'review-index' }, formatNumber(q.index + 1)),
      h('span', { class: 'review-answers' }, `شما: ${q.userAnswer ? optionLabel(q.userAnswer) : '—'} · صحیح: ${optionLabel(q.correctAnswer)}`),
      h('span', { class: `review-status ${statusClass}` }, statusText),
    );
  });

  container.append(
    h(
      'header',
      { class: 'page-header' },
      h('a', { class: 'btn btn-ghost btn-sm', href: '#/' }, '→ بازگشت'),
      h('h2', null, 'نتیجه آزمون'),
    ),
    h(
      'main',
      { class: 'page' },
      h(
        'section',
        { class: 'card result-hero' },
        h('h3', { class: 'result-name' }, current.name),
        h('div', { class: 'card-meta' }, h('span', null, current.category), h('span', { class: 'dot' }, '·'), h('span', null, formatDateTime(current.gradedAt))),
        h(
          'div',
          { class: 'stat-grid' },
          statCard('📝', 'تعداد سوالات', formatNumber(result.total), 'tone-neutral'),
          statCard('✅', 'درست', formatNumber(result.correct), 'tone-correct'),
          statCard('❌', 'غلط', formatNumber(result.wrong), 'tone-wrong'),
          statCard('⚪', 'نزده', formatNumber(result.unanswered), 'tone-none'),
        ),
      ),
      h(
        'section',
        { class: 'percent-grid' },
        h(
          'div',
          { class: 'card percent-card' },
          h('span', { class: 'percent-title' }, 'درصد بدون نمره منفی'),
          h('strong', { class: 'percent-value' }, formatPercent(result.percentWithoutNegative)),
        ),
        h(
          'div',
          { class: 'card percent-card percent-card-main' },
          h('span', { class: 'percent-title' }, 'درصد با نمره منفی'),
          h('strong', { class: 'percent-value' }, formatPercent(result.percentWithNegative)),
        ),
      ),
      h(
        'section',
        { class: 'card' },
        h('span', { class: 'percent-title' }, 'نسبت پاسخ‌ها'),
        splitBar(result),
        h(
          'div',
          { class: 'legend' },
          h('span', null, h('i', { class: 'dot-lg seg-correct' }), ` درست ${formatNumber(result.correct)}`),
          h('span', null, h('i', { class: 'dot-lg seg-wrong' }), ` غلط ${formatNumber(result.wrong)}`),
          h('span', null, h('i', { class: 'dot-lg seg-none' }), ` نزده ${formatNumber(result.unanswered)}`),
        ),
      ),
      h(
        'details',
        { class: 'card review-card' },
        h('summary', null, 'مرور پاسخ‌ها'),
        h('ul', { class: 'review-list' }, reviewRows),
      ),
      h(
        'div',
        { class: 'result-actions' },
        h('a', { class: 'btn btn-primary', href: '#/' }, icon('home', 18), ' صفحه اصلی'),
        h('a', { class: 'btn btn-ghost', href: '#/history' }, icon('chart', 18), ' تاریخچه'),
      ),
    ),
  );

  return () => container.remove();
}
