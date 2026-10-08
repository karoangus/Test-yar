// ── صفحه اصلی: فهرست آزمون‌ها ────────────────────────────────────────────────

import { h, clearEl } from '../dom.js';
import { statusBadge, icon, splitBar, onTick } from '../components.js';
import { formatNumber, formatDuration, formatPercent, formatClock } from '../../core/format.js';
import { STATUS, currentPhase } from '../../core/model.js';
import { remainingSeconds } from '../../core/timer.js';
import { canInstall, onInstallAvailable, promptInstall } from '../pwa.js';
import { toast } from '../components.js';

export function homeView({ rootEl, store, navigate }) {
  const container = h('div', { class: 'view' });
  rootEl.append(container);

  let installBtn = null;
  const refreshInstall = () => {
    if (installBtn) installBtn.hidden = !canInstall();
  };
  const unsubInstall = onInstallAvailable(refreshInstall);

  function render() {
    clearEl(container);
    const exams = store.all();
    const graded = exams.filter((e) => e.status === STATUS.GRADED).length;

    const header = h(
      'header',
      { class: 'app-header' },
      h('div', { class: 'brand' }, h('span', { class: 'brand-mark' }, icon('check', 18)), h('h1', null, 'تست‌یار')),
      h(
        'nav',
        { class: 'header-actions' },
        (installBtn = h(
          'button',
          {
            class: 'btn btn-ghost btn-sm',
            hidden: !canInstall(),
            onClick: async () => {
              const ok = await promptInstall();
              toast(ok ? 'اپلیکیشن نصب شد.' : 'نصب انجام نشد.', ok ? 'success' : 'info');
            },
          },
          'نصب اپلیکیشن',
        )),
        h('a', { class: 'btn btn-ghost btn-sm', href: '#/history' }, icon('chart', 16), ' تاریخچه'),
      ),
    );

    const summary =
      exams.length > 0
        ? h(
            'div',
            { class: 'summary-chips' },
            h('span', { class: 'chip' }, `آزمون‌ها: ${formatNumber(exams.length)}`),
            h('span', { class: 'chip' }, `تصحیح‌شده: ${formatNumber(graded)}`),
          )
        : null;

    const list = h('section', { class: 'exam-list' });
    if (exams.length === 0) {
      list.append(
        h(
          'div',
          { class: 'empty-state' },
          h('div', { class: 'empty-icon' }, icon('doc', 40)),
          h('h2', null, 'هنوز آزمونی نساخته‌اید'),
          h('p', null, 'با دکمهٔ «ساخت آزمون جدید» اولین آزمون خود را بسازید.'),
        ),
      );
    } else {
      for (const exam of exams) list.append(examCard(exam));
    }

    const fab = h(
      'button',
      { class: 'fab', attrs: { 'aria-label': 'ساخت آزمون جدید' }, onClick: () => navigate('/new') },
      icon('plus', 26),
    );
    const newBtn = h(
      'button',
      { class: 'btn btn-primary btn-block', onClick: () => navigate('/new') },
      icon('plus', 18),
      ' ساخت آزمون جدید',
    );

    container.append(header, summary, h('main', { class: 'page' }, list, exams.length === 0 ? newBtn : null), fab);

    // تیک برای نمایش زمان باقی‌ماندهٔ آزمون‌های در حال انجام
    const running = exams.filter((e) => e.status === STATUS.IN_PROGRESS);
    if (running.length > 0) {
      return onTick(() => {
        for (const exam of running) {
          const el = container.querySelector(`[data-remaining="${exam.id}"]`);
          if (el) {
            const phase = currentPhase(exam, Date.now());
            el.textContent =
              phase === 'running' ? `⏱ ${formatClock(remainingSeconds(exam, Date.now()))}` : 'زمان تمام شد';
          }
        }
      });
    }
    return null;
  }

  function examCard(exam) {
    const meta = h(
      'div',
      { class: 'card-meta' },
      h('span', null, `${formatNumber(exam.questionCount)} سوال`),
      h('span', { class: 'dot' }, '·'),
      h('span', null, formatDuration(exam.durationMinutes)),
      exam.status === STATUS.IN_PROGRESS
        ? h('span', { class: 'meta-remaining', dataset: { remaining: exam.id } }, '')
        : null,
    );

    const gradedInfo =
      exam.status === STATUS.GRADED && exam.result
        ? h(
            'div',
            { class: 'card-result' },
            h('strong', { class: 'result-percent' }, formatPercent(exam.result.percentWithNegative)),
            splitBar(exam.result),
          )
        : null;

    const card = h(
      'article',
      {
        class: 'card exam-card',
        attrs: { role: 'link', tabindex: '0', 'aria-label': exam.name },
        onClick: () => navigate(`/exam/${exam.id}`),
        onKeydown: (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            navigate(`/exam/${exam.id}`);
          }
        },
      },
      h('div', { class: 'card-top' }, h('h3', { class: 'card-title' }, exam.name), statusBadge(exam.status)),
      h('div', { class: 'card-cat' }, exam.category),
      meta,
      gradedInfo,
    );
    return card;
  }

  let tickerCleanup = render();
  const unsubStore = store.subscribe(() => {
    if (tickerCleanup) {
      tickerCleanup();
      tickerCleanup = null;
    }
    tickerCleanup = render();
  });

  return () => {
    unsubStore();
    unsubInstall();
    if (tickerCleanup) tickerCleanup();
    container.remove();
  };
}
