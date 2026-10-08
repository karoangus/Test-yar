// ── تاریخچهٔ آزمون‌ها: جست‌وجو، فیلتر، مرتب‌سازی و پشتیبان‌گیری ─────────────

import { h, clearEl } from '../dom.js';
import {
  statusBadge,
  confirmDialog,
  toast,
  icon,
  segmented,
  downloadTextFile,
  pickTextFile,
  copyToClipboard,
} from '../components.js';
import {
  formatNumber,
  formatDuration,
  formatPercent,
  formatDateTime,
  formatRelativeTime,
  formatClock,
  formatRange,
} from '../../core/format.js';
import { STATUS, PHASE, currentPhase } from '../../core/model.js';
import { remainingSeconds } from '../../core/timer.js';

const STATUS_FILTERS = [
  { value: 'all', label: 'همه' },
  { value: STATUS.CREATED, label: 'آماده' },
  { value: STATUS.IN_PROGRESS, label: 'در جریان' },
  { value: STATUS.AWAITING_GRADING, label: 'در انتظار تصحیح' },
  { value: STATUS.GRADED, label: 'تصحیح‌شده' },
];

const SORTS = [
  { value: 'newest', label: 'تازه‌ترین' },
  { value: 'oldest', label: 'قدیمی‌ترین' },
  { value: 'best', label: 'بالاترین درصد' },
  { value: 'worst', label: 'پایین‌ترین درصد' },
];

export function historyView({ rootEl, store, navigate }) {
  const container = h('div', { class: 'view' });
  rootEl.append(container);

  let filter = 'all';
  let sort = 'newest';
  let query = '';

  function matches(exam) {
    if (filter !== 'all' && exam.status !== filter) return false;
    const q = query.trim();
    if (!q) return true;
    return exam.name.includes(q) || exam.category.includes(q);
  }

  function sortExams(list) {
    const copy = [...list];
    if (sort === 'newest') copy.sort((a, b) => b.createdAt - a.createdAt);
    else if (sort === 'oldest') copy.sort((a, b) => a.createdAt - b.createdAt);
    else if (sort === 'best') copy.sort((a, b) => (b.result?.percentWithNegative ?? -Infinity) - (a.result?.percentWithNegative ?? -Infinity));
    else if (sort === 'worst') copy.sort((a, b) => (a.result?.percentWithNegative ?? Infinity) - (b.result?.percentWithNegative ?? Infinity));
    return copy;
  }

  async function exportBackup() {
    const text = store.exportBackup();
    const stamp = new Date().toISOString().slice(0, 10);
    const ok = downloadTextFile(`testyar-backup-${stamp}.json`, text);
    if (ok) {
      toast('فایل پشتیبان ساخته شد.', 'success');
      return;
    }
    // جایگزین: کپی متن پشتیبان
    const copied = await copyToClipboard(text);
    toast(copied ? 'متن پشتیبان در کلیپ‌بورد کپی شد.' : 'ساخت پشتیبان ممکن نشد.', copied ? 'success' : 'error');
  }

  async function importBackup() {
    const file = await pickTextFile();
    if (!file) return;
    const ok = await confirmDialog({
      title: 'بازگردانی پشتیبان',
      message: `آزمون‌های فایل «${file.name}» به فهرست فعلی اضافه می‌شوند. آزمون‌های تکراری نادیده گرفته می‌شوند و چیزی حذف نمی‌شود.`,
      confirmLabel: 'بازگردانی',
      cancelLabel: 'انصراف',
    });
    if (!ok) return;
    const res = store.importBackup(file.text, { mode: 'merge' });
    if (!res.ok) {
      toast(res.error, 'error');
      return;
    }
    const extra = res.skipped > 0 ? ` (${formatNumber(res.skipped)} تکراری نادیده گرفته شد)` : '';
    toast(`بازگردانی انجام شد: ${formatNumber(res.imported)} آزمون${extra}`, res.imported > 0 ? 'success' : 'info');
  }

  function render() {
    clearEl(container);
    const all = store.all();
    const visible = sortExams(all.filter(matches));

    const searchInput = h('input', {
      class: 'input search-input',
      type: 'search',
      placeholder: 'جست‌وجو در نام یا دسته‌بندی…',
      value: query,
      attrs: { 'aria-label': 'جست‌وجو در آزمون‌ها' },
      onInput: (e) => {
        query = e.target.value;
        render();
        const next = container.querySelector('.search-input');
        if (next) {
          next.focus();
          next.setSelectionRange(next.value.length, next.value.length);
        }
      },
    });

    const list = h('section', { class: 'history-list' });
    if (all.length === 0) {
      list.append(
        h(
          'div',
          { class: 'empty-state' },
          h('h2', null, 'تاریخچه‌ای وجود ندارد'),
          h('a', { class: 'btn btn-primary', href: '#/new' }, 'ساخت آزمون'),
        ),
      );
    } else if (visible.length === 0) {
      list.append(h('div', { class: 'empty-state' }, h('h2', null, 'آزمونی با این فیلتر پیدا نشد')));
    } else {
      for (const exam of visible) list.append(historyCard(exam));
    }

    const toolbar = h(
      'div',
      { class: 'toolbar toolbar-wrap' },
      h(
        'button',
        { class: 'btn btn-ghost btn-sm', type: 'button', onClick: exportBackup },
        icon('download', 16),
        ' پشتیبان‌گیری',
      ),
      h(
        'button',
        { class: 'btn btn-ghost btn-sm', type: 'button', onClick: importBackup },
        icon('upload', 16),
        ' بازگردانی پشتیبان',
      ),
    );

    container.append(
      h(
        'header',
        { class: 'page-header' },
        h('a', { class: 'btn btn-ghost btn-sm', href: '#/' }, '→ بازگشت'),
        h('h2', null, 'تاریخچه آزمون‌ها'),
        h('span', { class: 'chip' }, `${formatNumber(all.length)} آزمون`),
      ),
      h(
        'main',
        { class: 'page' },
        h(
          'div',
          { class: 'filters card' },
          searchInput,
          segmented({ options: STATUS_FILTERS, value: filter, onChange: (v) => { filter = v; render(); }, label: 'فیلتر وضعیت' }),
          h(
            'div',
            { class: 'sort-row' },
            h('label', { class: 'sort-label', attrs: { for: 'sort-select' } }, 'مرتب‌سازی'),
            h(
              'select',
              {
                class: 'input select select-sm',
                id: 'sort-select',
                value: sort,
                onChange: (e) => {
                  sort = e.target.value;
                  render();
                },
              },
              ...SORTS.map((s) => h('option', { value: s.value, selected: s.value === sort }, s.label)),
            ),
          ),
        ),
        list,
        toolbar,
      ),
    );

    refreshTimers();
  }

  function refreshTimers() {
    const now = Date.now();
    for (const el of container.querySelectorAll('[data-history-timer]')) {
      const exam = store.get(el.dataset.examId ?? '');
      if (!exam) continue;
      const phase = currentPhase(exam, now);
      if (phase === PHASE.RUNNING) el.textContent = `⏱ ${formatClock(remainingSeconds(exam, now))}`;
      else if (phase === PHASE.PAUSED) el.textContent = `⏸ ${formatClock(remainingSeconds(exam, now))}`;
      else el.textContent = 'زمان تمام شد';
    }
  }

  function historyCard(exam) {
    const rows = [
      ['دسته‌بندی', exam.category],
      ['تاریخ ایجاد', `${formatDateTime(exam.createdAt)} · ${formatRelativeTime(exam.createdAt)}`],
      ['تعداد سوال', formatNumber(exam.questionCount)],
      ['شمارهٔ سوال‌ها', formatRange(exam.startNumber, exam.questionCount)],
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
    if (exam.status === STATUS.IN_PROGRESS) {
      rows.push(['وضعیت تایمر', exam.pausedAt != null ? 'متوقف' : 'در حال اجرا']);
      rows.push(['تعداد توقف‌ها', formatNumber(exam.pauseCount ?? 0)]);
    }

    const delBtn = h(
      'button',
      {
        class: 'btn btn-ghost btn-sm btn-icon',
        attrs: { 'aria-label': `حذف آزمون ${exam.name}` },
        onClick: async (e) => {
          e.stopPropagation();
          const ok = await confirmDialog({
            title: 'حذف آزمون',
            message: `آزمون «${exam.name}» حذف شود؟ اگر اشتباه کردید، چند ثانیه فرصت بازگردانی دارید.`,
            confirmLabel: 'حذف',
            cancelLabel: 'انصراف',
            danger: true,
          });
          if (!ok) return;
          const removed = store.removeExam(exam.id);
          if (!removed) {
            toast('آزمون پیدا نشد.', 'error');
            return;
          }
          toast('آزمون حذف شد.', 'success', {
            action: {
              label: 'بازگردانی',
              onClick: () => {
                const restored = store.undoRemove();
                toast(restored ? 'آزمون بازگردانده شد.' : 'بازگردانی ممکن نشد.', restored ? 'success' : 'error');
              },
            },
          });
        },
      },
      icon('trash', 16),
    );

    const dupBtn = h(
      'button',
      {
        class: 'btn btn-ghost btn-sm btn-icon',
        attrs: { 'aria-label': `تکرار آزمون ${exam.name}` },
        onClick: (e) => {
          e.stopPropagation();
          const copy = store.duplicateExam(exam.id);
          toast('آزمون تازه ساخته شد.', 'success');
          navigate(`/exam/${copy.id}`);
        },
      },
      icon('copy', 16),
    );

    const timerChip =
      exam.status === STATUS.IN_PROGRESS
        ? h('span', { class: 'meta-remaining', dataset: { historyTimer: '1', examId: exam.id } }, '')
        : null;

    return h(
      'article',
      {
        class: 'card history-card',
        attrs: { role: 'button', tabindex: '0', 'aria-label': exam.name },
        onClick: () => navigate(`/exam/${exam.id}${exam.status === STATUS.GRADED ? '/result' : ''}`),
        onKeydown: (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            navigate(`/exam/${exam.id}${exam.status === STATUS.GRADED ? '/result' : ''}`);
          }
        },
      },
      h(
        'div',
        { class: 'card-top' },
        h('h3', { class: 'card-title' }, exam.name),
        h('div', { class: 'history-actions' }, timerChip, statusBadge(exam), dupBtn, delBtn),
      ),
      h('div', { class: 'card-cat' }, exam.category),
      h('dl', { class: 'history-grid' }, rows.flatMap(([label, value]) => [h('dt', null, label), h('dd', null, String(value))])),
      exam.result ? h('div', { class: 'history-bar' }, h('div', { class: 'progress' }, h('div', { class: 'progress-fill', attrs: { style: `width:${Math.max(0, Math.min(100, exam.result.percentWithoutNegative))}%` } }))) : null,
    );
  }

  render();
  const unsub = store.subscribe(render);
  const timer = window.setInterval(refreshTimers, 500);

  return () => {
    unsub();
    window.clearInterval(timer);
    container.remove();
  };
}
