// ── صفحه اصلی: داشبورد، آزمون در حال انجام و فهرست آزمون‌ها ──────────────────

import { h, clearEl } from '../dom.js';
import { statusBadge, icon, splitBar, onTick, toast } from '../components.js';
import { formatNumber, formatDuration, formatPercent, formatClock, formatSeconds, formatRelativeTime } from '../../core/format.js';
import { STATUS, PHASE, currentPhase } from '../../core/model.js';
import { remainingSeconds, pauseDurationMs } from '../../core/timer.js';
import { canInstall, onInstallAvailable, promptInstall } from '../pwa.js';
import { toggleTheme, getResolvedTheme, onThemeChange } from '../theme.js';

const RECENT_LIMIT = 6;

export function homeView({ rootEl, store, navigate }) {
  const container = h('div', { class: 'view' });
  rootEl.append(container);

  let installBtn = null;
  const refreshInstall = () => {
    if (installBtn) installBtn.hidden = !canInstall();
  };
  const unsubInstall = onInstallAvailable(refreshInstall);
  const unsubTheme = onThemeChange(() => render());
  let tickerCleanup = null;

  function themeButton() {
    const dark = getResolvedTheme() === 'dark';
    return h(
      'button',
      {
        class: 'btn btn-ghost btn-sm btn-icon',
        attrs: { 'aria-label': dark ? 'روشن‌کردن ظاهر' : 'تیره‌کردن ظاهر', title: 'تغییر ظاهر' },
        onClick: () => toggleTheme(),
      },
      icon(dark ? 'sun' : 'moon', 18),
    );
  }

  function render() {
    clearEl(container);
    if (tickerCleanup) {
      tickerCleanup();
      tickerCleanup = null;
    }
    const exams = store.all();
    const stats = store.stats();
    const active = store.activeExam();

    const header = h(
      'header',
      { class: 'app-header' },
      h('div', { class: 'brand' }, h('span', { class: 'brand-mark' }, icon('check', 18)), h('h1', null, 'تست‌یار')),
      h(
        'nav',
        { class: 'header-actions' },
        themeButton(),
        h('a', { class: 'btn btn-ghost btn-sm', href: '#/history' }, icon('chart', 16), ' تاریخچه'),
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
          'نصب',
        )),
      ),
    );

    const hero = active ? activeExamCard(active) : null;

    const summary =
      exams.length > 0
        ? h(
            'section',
            { class: 'stats-row' },
            statChip('📚', 'آزمون‌ها', formatNumber(stats.total)),
            statChip('✅', 'تصحیح‌شده', formatNumber(stats.graded)),
            statChip('📈', 'میانگین', stats.averagePercent == null ? '—' : formatPercent(stats.averagePercent)),
            statChip('🏆', 'بهترین', stats.bestPercent == null ? '—' : formatPercent(stats.bestPercent)),
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
      const recent = exams.slice(0, RECENT_LIMIT);
      list.append(h('div', { class: 'section-head' }, h('h2', { class: 'section-title' }, 'آزمون‌های اخیر'), exams.length > RECENT_LIMIT ? h('a', { class: 'link', href: '#/history' }, `همهٔ ${formatNumber(exams.length)} آزمون`) : null));
      for (const exam of recent) list.append(examCard(exam));
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

    container.append(header, h('main', { class: 'page' }, hero, summary, list, newBtn), fab);

    refreshDynamic();
    if (active) tickerCleanup = onTick(refreshDynamic);
    return undefined;
  }

  /** به‌روزرسانی زندهٔ تایمر آزمون در حال انجام (بدون رندر کامل) */
  function refreshDynamic() {
    const now = Date.now();
    // تایمر کوچک روی کارت‌های فهرست
    for (const el of container.querySelectorAll('[data-remaining]')) {
      const exam = store.get(el.dataset.remaining ?? '');
      if (!exam) continue;
      const phase = currentPhase(exam, now);
      el.textContent =
        phase === PHASE.RUNNING
          ? `⏱ ${formatClock(remainingSeconds(exam, now))}`
          : phase === PHASE.PAUSED
            ? `⏸ ${formatClock(remainingSeconds(exam, now))}`
            : 'زمان تمام شد';
    }

    const live = container.querySelector('[data-live-timer]');
    if (!live) return;
    const exam = store.get(live.dataset.examId ?? '');
    if (!exam) return;
    const phase = currentPhase(exam, now);
    if (phase === PHASE.EXPIRED) {
      live.textContent = 'زمان تمام شد';
      live.classList.add('timer-locked');
      return;
    }
    live.classList.toggle('timer-paused', phase === PHASE.PAUSED);
    live.textContent = phase === PHASE.PAUSED ? `⏸ ${formatClock(remainingSeconds(exam, now))}` : `⏱ ${formatClock(remainingSeconds(exam, now))}`;
    const pauseNote = container.querySelector('[data-pause-note]');
    if (pauseNote) {
      const total = pauseDurationMs(exam, now);
      pauseNote.textContent = total > 0 ? `مجموع توقف: ${formatSeconds(total / 1000)}` : '';
      pauseNote.hidden = total <= 0;
    }
  }

  function statChip(emoji, label, value) {
    return h(
      'div',
      { class: 'stat-chip' },
      h('span', { class: 'stat-chip-emoji' }, emoji),
      h('span', { class: 'stat-chip-body' }, h('strong', null, value), h('span', { class: 'stat-chip-label' }, label)),
    );
  }

  function activeExamCard(exam) {
    const phase = currentPhase(exam, Date.now());
    const answered = Object.keys(exam.answers).length;
    const paused = phase === PHASE.PAUSED;
    return h(
      'section',
      { class: `card running-hero${paused ? ' is-paused' : ''}` },
      h(
        'div',
        { class: 'running-hero-top' },
        h('div', null, h('span', { class: 'running-hero-label' }, 'آزمون در جریان'), h('h3', { class: 'running-hero-title' }, exam.name)),
        h('span', { class: 'sheet-timer', dataset: { liveTimer: '1', examId: exam.id } }, '⏱ --:--'),
      ),
      h('p', { class: 'running-hero-sub' }, `${formatNumber(answered)} از ${formatNumber(exam.questionCount)} پاسخ داده شده`),
      h('p', { class: 'running-hero-note', dataset: { pauseNote: '1' }, hidden: true }),
      h(
        'div',
        { class: 'running-hero-actions' },
        h('button', { class: 'btn btn-primary', onClick: () => navigate(`/exam/${exam.id}`) }, paused ? 'بازگشت به آزمون' : 'ادامهٔ آزمون'),
        paused
          ? h(
              'button',
              {
                class: 'btn btn-ghost',
                onClick: () => {
                  store.resumeExam(exam.id);
                  toast('تایمر آزمون از سر گرفته شد.', 'success');
                },
              },
              icon('play', 16),
              ' ادامهٔ تایمر',
            )
          : h(
              'button',
              {
                class: 'btn btn-ghost',
                onClick: () => {
                  store.pauseExam(exam.id);
                  toast('تایمر آزمون متوقف شد.', 'info');
                },
              },
              icon('pause', 16),
              ' توقف تایمر',
            ),
      ),
    );
  }

  function examCard(exam) {
    const graded = exam.status === STATUS.GRADED && exam.result;
    const meta = h(
      'div',
      { class: 'card-meta' },
      h('span', null, `${formatNumber(exam.questionCount)} سوال`),
      h('span', { class: 'dot' }, '·'),
      h('span', null, formatDuration(exam.durationMinutes)),
      h('span', { class: 'dot' }, '·'),
      h('span', null, formatRelativeTime(exam.createdAt)),
    );

    const gradedInfo = graded
      ? h(
          'div',
          { class: 'card-result' },
          h('strong', { class: 'result-percent' }, formatPercent(exam.result.percentWithNegative)),
          splitBar(exam.result),
        )
      : exam.status === STATUS.IN_PROGRESS
        ? h('div', { class: 'card-live' }, h('span', { class: 'card-live-timer', dataset: { remaining: exam.id } }, ''))
        : null;

    return h(
      'article',
      {
        class: 'card exam-card',
        attrs: { role: 'button', tabindex: '0', 'aria-label': exam.name },
        onClick: () => navigate(`/exam/${exam.id}${graded ? '/result' : ''}`),
        onKeydown: (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            navigate(`/exam/${exam.id}${graded ? '/result' : ''}`);
          }
        },
      },
      h('div', { class: 'card-top' }, h('h3', { class: 'card-title' }, exam.name), statusBadge(exam)),
      h('div', { class: 'card-cat' }, exam.category),
      meta,
      gradedInfo,
    );
  }

  render();
  const unsubStore = store.subscribe(() => render());

  return () => {
    unsubStore();
    unsubInstall();
    unsubTheme();
    if (tickerCleanup) tickerCleanup();
    container.remove();
  };
}
