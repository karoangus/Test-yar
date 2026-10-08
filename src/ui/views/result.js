// ── صفحه نتیجه: آمار دقیق، کارنامه و مرور سوال‌به‌سوال ───────────────────────

import { h, clearEl } from '../dom.js';
import { icon, splitBar, segmented, toast, copyToClipboard } from '../components.js';
import {
  formatNumber,
  formatPercent,
  formatDateTime,
  formatRelativeTime,
  formatDuration,
  formatSeconds,
  formatScoreOutOf20,
} from '../../core/format.js';
import { optionLabel, QUESTION_STATUS } from '../../core/scoring.js';

const REVIEW_FILTERS = [
  { value: 'all', label: 'همه' },
  { value: 'wrong', label: 'غلط‌ها' },
  { value: 'unanswered', label: 'نزده‌ها' },
  { value: 'correct', label: 'درست‌ها' },
];

const STATUS_TEXT = {
  [QUESTION_STATUS.CORRECT]: 'درست',
  [QUESTION_STATUS.WRONG]: 'غلط',
  [QUESTION_STATUS.UNANSWERED]: 'نزده',
};

const STATUS_CLASS = {
  [QUESTION_STATUS.CORRECT]: 'st-correct',
  [QUESTION_STATUS.WRONG]: 'st-wrong',
  [QUESTION_STATUS.UNANSWERED]: 'st-none',
};

export function resultView({ rootEl, store, navigate, exam }) {
  const container = h('div', { class: 'view' });
  rootEl.append(container);
  let filter = 'all';

  function render() {
    clearEl(container);
    const current = store.get(exam.id);
    const result = current?.result;

    if (!current || !result) {
      container.append(
        h(
          'main',
          { class: 'page' },
          h(
            'div',
            { class: 'empty-state' },
            h('h2', null, 'نتیجه‌ای ثبت نشده است'),
            h('a', { class: 'btn btn-primary', href: '#/' }, 'بازگشت به خانه'),
          ),
        ),
      );
      return;
    }

    const statCard = (emoji, label, value, tone) =>
      h(
        'div',
        { class: `stat-card ${tone}` },
        h('span', { class: 'stat-emoji' }, emoji),
        h('strong', { class: 'stat-value' }, value),
        h('span', { class: 'stat-label' }, label),
      );

    const reviewRows = result.perQuestion.map((q) =>
      h(
        'li',
        { class: 'review-row', dataset: { status: q.status } },
        h('span', { class: 'review-index' }, formatNumber(q.index + 1)),
        h(
          'span',
          { class: 'review-answers' },
          `شما: ${q.userAnswer ? optionLabel(q.userAnswer) : '—'} · صحیح: ${optionLabel(q.correctAnswer)}`,
        ),
        h('span', { class: `review-status ${STATUS_CLASS[q.status]}` }, STATUS_TEXT[q.status]),
      ),
    );

    const unansweredChips = result.perQuestion
      .filter((q) => q.status === QUESTION_STATUS.UNANSWERED)
      .map((q) => h('span', { class: 'nav-chip chip-unanswered' }, formatNumber(q.index + 1)));

    const durationMs = Number(current.result.durationMinutes ?? current.durationMinutes) * 60_000;
    const activeMs = Number.isFinite(current.result.activeElapsedMs)
      ? current.result.activeElapsedMs
      : current.endedAt != null && current.startedAt != null
        ? Math.max(0, current.endedAt - current.startedAt)
        : durationMs;

    const timeRows = [
      ['زمان کل آزمون', formatDuration(current.result.durationMinutes ?? current.durationMinutes)],
      ['زمان فعال پاسخ‌گویی', formatSeconds(activeMs / 1000)],
      [
        'مجموع توقف تایمر',
        current.result.pausedTotalMs > 0 ? formatSeconds(current.result.pausedTotalMs / 1000) : 'بدون توقف',
      ],
      ['تعداد توقف‌ها', formatNumber(current.result.pauseCount ?? 0)],
    ];

    const reviewList = h('ul', { class: 'review-list' }, reviewRows);
    const emptyReview = h('p', { class: 'hint', hidden: filter === 'all' }, 'موردی در این دسته نیست.');

    function applyFilter(next) {
      filter = next;
      let visible = 0;
      for (const row of reviewList.children) {
        const match = filter === 'all' || row.dataset.status === filter;
        row.hidden = !match;
        if (match) visible += 1;
      }
      emptyReview.hidden = visible > 0;
    }

    const hero = h(
      'section',
      { class: 'card result-hero' },
      h('h3', { class: 'result-name' }, current.name),
      h(
        'div',
        { class: 'card-meta' },
        h('span', null, current.category),
        h('span', { class: 'dot' }, '·'),
        h('span', null, formatDateTime(current.gradedAt)),
        h('span', { class: 'dot' }, '·'),
        h('span', null, formatRelativeTime(current.gradedAt)),
      ),
      h(
        'div',
        { class: 'stat-grid' },
        statCard('📝', 'تعداد سوالات', formatNumber(result.total), 'tone-neutral'),
        statCard('✅', 'درست', formatNumber(result.correct), 'tone-correct'),
        statCard('❌', 'غلط', formatNumber(result.wrong), 'tone-wrong'),
        statCard('⚪', 'نزده', formatNumber(result.unanswered), 'tone-none'),
      ),
    );

    const percents = h(
      'section',
      { class: 'percent-grid' },
      h(
        'div',
        { class: 'card percent-card percent-card-main' },
        h('span', { class: 'percent-title' }, 'درصد با نمره منفی'),
        h('strong', { class: 'percent-value' }, formatPercent(result.percentWithNegative)),
        h('span', { class: 'score-out-of-20' }, formatScoreOutOf20(result.percentWithNegative)),
      ),
      h(
        'div',
        { class: 'card percent-card' },
        h('span', { class: 'percent-title' }, 'درصد بدون نمره منفی'),
        h('strong', { class: 'percent-value' }, formatPercent(result.percentWithoutNegative)),
        h('span', { class: 'score-out-of-20' }, formatScoreOutOf20(result.percentWithoutNegative)),
      ),
    );

    const breakdown = h(
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
    );

    const timeCard = h(
      'section',
      { class: 'card time-card' },
      h('span', { class: 'percent-title' }, '⏱ زمان و توقف‌ها'),
      h(
        'dl',
        { class: 'history-grid' },
        timeRows.flatMap(([label, value]) => [h('dt', null, label), h('dd', null, String(value))]),
      ),
    );

    const unansweredCard =
      unansweredChips.length > 0
        ? h(
            'details',
            { class: 'card review-card' },
            h('summary', null, `سوال‌های بی‌پاسخ (${formatNumber(unansweredChips.length)})`),
            h('div', { class: 'missing-chips' }, unansweredChips),
          )
        : null;

    const summaryText = [
      `کارنامهٔ آزمون «${current.name}»`,
      `تعداد سوالات: ${formatNumber(result.total)} — درست: ${formatNumber(result.correct)} — غلط: ${formatNumber(result.wrong)} — نزده: ${formatNumber(result.unanswered)}`,
      `درصد با نمره منفی: ${formatPercent(result.percentWithNegative)} — بدون نمره منفی: ${formatPercent(result.percentWithoutNegative)}`,
      `نمره (از ۲۰): ${formatScoreOutOf20(result.percentWithNegative)}`,
      `زمان کل: ${formatDuration(current.result.durationMinutes ?? current.durationMinutes)} — زمان فعال: ${formatSeconds(activeMs / 1000)}`,
      `مجموع توقف تایمر: ${current.result.pausedTotalMs > 0 ? formatSeconds(current.result.pausedTotalMs / 1000) : 'بدون توقف'}`,
    ].join('\n');

    const actions = h(
      'div',
      { class: 'result-actions' },
      h(
        'button',
        {
          class: 'btn btn-primary',
          type: 'button',
          onClick: () => {
            const copy = store.duplicateExam(current.id);
            toast('آزمون تازه با همین تنظیمات ساخته شد.', 'success');
            navigate(`/exam/${copy.id}`);
          },
        },
        icon('copy', 16),
        ' تکرار آزمون',
      ),
      h(
        'button',
        {
          class: 'btn btn-ghost',
          type: 'button',
          onClick: async () => {
            const ok = await copyToClipboard(summaryText);
            toast(ok ? 'کارنامه در کلیپ‌بورد کپی شد.' : 'کپی ممکن نشد.', ok ? 'success' : 'error');
          },
        },
        icon('doc', 16),
        ' کپی کارنامه',
      ),
    );

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
        hero,
        percents,
        breakdown,
        timeCard,
        unansweredCard,
        h(
          'details',
          { class: 'card review-card', open: true },
          h('summary', null, 'مرور پاسخ‌ها'),
          segmented({ options: REVIEW_FILTERS, value: filter, onChange: applyFilter, label: 'فیلتر مرور پاسخ‌ها' }),
          reviewList,
          emptyReview,
        ),
        actions,
        h(
          'div',
          { class: 'result-actions' },
          h('a', { class: 'btn btn-ghost', href: '#/history' }, icon('chart', 18), ' تاریخچه'),
          h('a', { class: 'btn btn-ghost', href: '#/' }, icon('home', 18), ' صفحه اصلی'),
        ),
      ),
    );

    applyFilter(filter);
  }

  render();

  return () => {
    clearEl(container);
    container.remove();
  };
}
