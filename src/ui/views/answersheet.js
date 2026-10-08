// ── پاسخ‌برگ: ثبت پاسخ‌ها با تایمر واقعی و قفل کامل پس از پایان زمان ─────────

import { h, clearEl, scrollToEl } from '../dom.js';
import { onTick, confirmDialog, toast, icon } from '../components.js';
import { OPTIONS } from '../../core/scoring.js';
import { canAnswer, currentPhase } from '../../core/model.js';
import { remainingSeconds, effectiveEndsAt } from '../../core/timer.js';
import { formatNumber, formatClock } from '../../core/format.js';

export function answersheetView({ rootEl, store, navigate, rerender, exam }) {
  const container = h('div', { class: 'view' });
  rootEl.append(container);
  let tickerCleanup = null;
  let lastPhase = null;

  function render() {
    if (tickerCleanup) {
      tickerCleanup();
      tickerCleanup = null;
    }
    clearEl(container);
    const current = store.get(exam.id);
    const now = Date.now();
    const locked = !canAnswer(current, now);
    lastPhase = currentPhase(current, now);

    const clockEl = h('span', { class: 'sheet-timer', dataset: { clock: '1' } }, '');
    const progressFill = h('div', { class: 'progress-fill' });
    const progressLabel = h('span', { class: 'sheet-sub', dataset: { progressLabel: '1' } }, '');
    const countEl = h('span', { class: 'sheet-count', dataset: { count: '1' } }, '');
    const chips = [];

    const top = h(
      'div',
      { class: 'sheet-top' },
      h(
        'div',
        { class: 'sheet-top-row' },
        h('span', { class: 'sheet-name' }, current.name),
        clockEl,
      ),
      h('div', { class: 'sheet-top-row' }, progressLabel),
      h('div', { class: 'progress' }, progressFill),
    );

    // ── ناوش سوال‌ها ──
    const navGrid = h('div', { class: 'nav-grid' });
    for (let i = 0; i < current.questionCount; i += 1) {
      const chip = h('button', {
        class: 'nav-chip',
        type: 'button',
        dataset: { chip: String(i) },
        text: formatNumber(i + 1),
        onClick: () => scrollToEl(container.querySelector(`[data-q="${i}"]`)),
      });
      chips.push(chip);
      navGrid.append(chip);
    }
    const navigator = h(
      'details',
      { class: 'qnav' },
      h('summary', null, 'پرش به سوال'),
      navGrid,
    );

    // ── سوال‌ها ──
    const list = h('div', { class: 'question-list' });
    for (let i = 0; i < current.questionCount; i += 1) {
      list.append(questionCard(current, i, locked));
    }

    const endBtn = h(
      'button',
      {
        class: 'btn btn-danger',
        disabled: locked,
        onClick: async () => {
          const ok = await confirmDialog({
            title: 'آیا مطمئن هستید که می‌خواهید آزمون را پایان دهید؟',
            confirmLabel: 'پایان آزمون',
            cancelLabel: 'ادامه آزمون',
            danger: true,
          });
          if (!ok) return;
          store.endExamManually(exam.id);
        },
      },
      'پایان آزمون',
    );

    const footer = h(
      'div',
      { class: 'sheet-footer' },
      countEl,
      endBtn,
    );

    container.append(top, h('main', { class: 'page sheet-page' }, navigator, list), footer);

    if (locked && lastPhase === 'expired') {
      container.append(timeUpOverlay());
    }

    refreshDynamic(current, now);

    // ── تیکر: نمایش زمان واقعی ──
    tickerCleanup = onTick(() => {
      const t = Date.now();
      const fresh = store.get(exam.id);
      if (canAnswer(fresh, t)) {
        refreshDynamic(fresh, t);
        if (t >= effectiveEndsAt(fresh)) {
          store.refresh(); // وضعیت به time_up می‌رود → emit → رندر مجدد با overlay
        }
      }
    });
  }

  function refreshDynamic(current, now) {
    const locked = !canAnswer(current, now);
    const clockEl = container.querySelector('[data-clock]');
    if (clockEl) {
      const secs = remainingSeconds(current, now);
      clockEl.textContent = `⏱ ${formatClock(secs)}`;
      clockEl.classList.toggle('timer-danger', secs <= 60 && !locked);
      clockEl.classList.toggle('timer-locked', locked);
    }
    const answered = Object.keys(current.answers).length;
    const label = container.querySelector('[data-progress-label]');
    if (label) label.textContent = `پاسخ‌داده: ${formatNumber(answered)} از ${formatNumber(current.questionCount)}`;
    const fill = container.querySelector('.progress-fill');
    if (fill) fill.style.width = `${(answered / Math.max(1, current.questionCount)) * 100}%`;
    const count = container.querySelector('[data-count]');
    if (count) count.textContent = `پاسخ‌داده: ${formatNumber(answered)} از ${formatNumber(current.questionCount)}`;
    for (let i = 0; i < current.questionCount; i += 1) {
      const chip = container.querySelector(`[data-chip="${i}"]`);
      if (chip) chip.classList.toggle('chip-answered', current.answers[i] != null);
    }
  }

  function questionCard(current, index, locked) {
    const selected = current.answers[index] ?? null;
    const optionBtns = OPTIONS.map((opt) =>
      h(
        'button',
        {
          class: `option-btn${selected === opt.id ? ' option-selected' : ''}`,
          type: 'button',
          disabled: locked,
          dataset: { q: String(index), opt: opt.id },
          attrs: { role: 'radio', 'aria-checked': selected === opt.id ? 'true' : 'false' },
          onClick: () => selectOption(index, opt.id),
        },
        h('span', { class: 'option-radio' }),
        h('span', { class: 'option-label' }, opt.label),
      ),
    );
    return h(
      'section',
      { class: 'card question-card', dataset: { q: String(index) } },
      h('h3', { class: 'q-title' }, `سوال ${formatNumber(index + 1)}`),
      h('div', { class: 'option-grid', attrs: { role: 'radiogroup', 'aria-label': `گزینه‌های سوال ${index + 1}` } }, optionBtns),
    );
  }

  function selectOption(index, optId) {
    const fresh = store.get(exam.id);
    if (!canAnswer(fresh, Date.now())) {
      toast('آزمون قفل شده است؛ امکان تغییر پاسخ نیست.', 'error');
      return;
    }
    store.setAnswer(exam.id, index, optId);
    // به‌روزرسانی درجا بدون رندر کامل (حفظ اسکرول)
    const card = container.querySelector(`[data-q="${index}"].question-card`);
    if (card) {
      for (const btn of card.querySelectorAll('.option-btn')) {
        const isSel = btn.dataset.opt === optId;
        btn.classList.toggle('option-selected', isSel);
        btn.setAttribute('aria-checked', isSel ? 'true' : 'false');
      }
    }
    refreshDynamic(fresh, Date.now());
  }

  function timeUpOverlay() {
    return h(
      'div',
      {
        class: 'lock-overlay',
        attrs: { role: 'alertdialog', 'aria-modal': 'true', 'aria-label': 'زمان آزمون تمام شد' },
      },
      h(
        'div',
        { class: 'lock-card' },
        h('div', { class: 'lock-icon' }, icon('clock', 44)),
        h('h2', null, 'زمان آزمون تمام شد'),
        h('p', null, 'پاسخ‌گویی به پایان رسید.'),
        h(
          'button',
          {
            class: 'btn btn-primary btn-xl',
            onClick: () => {
              store.enterGrading(exam.id);
            },
          },
          'ورود به تصحیح‌کننده',
        ),
      ),
    );
  }

  render();

  const unsub = store.subscribe(() => {
    const fresh = store.get(exam.id);
    const phase = currentPhase(fresh, Date.now());
    if (phase === 'grading' || phase === 'graded') {
      rerender(); // خروج از پاسخ‌برگ
      return;
    }
    if (phase !== lastPhase) {
      render(); // مثلاً رسیدن به time_up → نمایش overlay
    }
  });

  return () => {
    unsub();
    if (tickerCleanup) tickerCleanup();
    container.remove();
  };
}
