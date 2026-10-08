// ── پاسخ‌برگ: ثبت پاسخ‌ها با تایمر واقعی، توقف/ادامه و قفل کامل پس از پایان ──

import { h, clearEl, scrollToEl, srOnly } from '../dom.js';
import { onTick, confirmDialog, toast, icon, kbd } from '../components.js';
import { OPTIONS, optionTitle } from '../../core/scoring.js';
import { canAnswer, currentPhase, PHASE } from '../../core/model.js';
import { remainingSeconds, effectiveEndsAt, elapsedRatio, pauseDurationMs } from '../../core/timer.js';
import { formatNumber, formatClock, formatSeconds } from '../../core/format.js';
import { attachQuestionShortcuts } from '../keyboard.js';

export function answersheetView({ rootEl, store, navigate, rerender, exam }) {
  const container = h('div', { class: 'view' });
  rootEl.append(container);
  let tickerCleanup = null;
  let shortcuts = null;
  let lastPhase = null;

  function render() {
    if (tickerCleanup) {
      tickerCleanup();
      tickerCleanup = null;
    }
    if (shortcuts) {
      shortcuts.destroy();
      shortcuts = null;
    }
    clearEl(container);

    const current = store.get(exam.id);
    if (!current) {
      navigate('/');
      return;
    }
    const now = Date.now();
    const phase = currentPhase(current, now);
    const locked = !canAnswer(current, now);
    const paused = phase === PHASE.PAUSED;
    lastPhase = phase;

    const clockEl = h('span', { class: 'sheet-timer', dataset: { clock: '1' } }, '');
    const answersFill = h('div', { class: 'progress-fill' });
    const timeFill = h('div', { class: 'progress-fill time-fill' });
    const progressLabel = h('span', { class: 'sheet-sub', dataset: { progressLabel: '1' } }, '');
    const countEl = h('span', { class: 'sheet-count', dataset: { count: '1' } }, '');

    const top = h(
      'div',
      { class: 'sheet-top' },
      h('div', { class: 'sheet-top-row' }, h('span', { class: 'sheet-name' }, current.name), clockEl),
      h(
        'div',
        { class: 'sheet-top-row' },
        progressLabel,
        h('span', { class: 'sheet-shortcuts' }, kbd('۱'), kbd('۲'), kbd('۳'), kbd('۴'), srOnly('میان‌بُرهای کیبورد برای انتخاب گزینه')),
      ),
      h('div', { class: 'progress' }, answersFill),
      h('div', { class: 'progress progress-thin' }, timeFill),
    );

    // ── ناوش سوال‌ها ──
    const navGrid = h('div', { class: 'nav-grid' });
    const chips = [];
    for (let i = 0; i < current.questionCount; i += 1) {
      const chip = h('button', {
        class: 'nav-chip',
        type: 'button',
        dataset: { chip: String(i) },
        text: formatNumber(i + 1),
        onClick: () => scrollToEl(container.querySelector(`.question-card[data-q="${i}"]`)),
      });
      chips.push(chip);
      navGrid.append(chip);
    }
    const nextUnansweredBtn = h(
      'button',
      {
        class: 'btn btn-ghost btn-sm',
        type: 'button',
        dataset: { nextUnanswered: '1' },
        onClick: () => {
          const [index] = store.unansweredIndexes(exam.id);
          if (index == null) {
            toast('به همهٔ سوال‌ها پاسخ داده‌اید.', 'success');
            return;
          }
          scrollToEl(container.querySelector(`.question-card[data-q="${index}"]`));
        },
      },
      icon('target', 16),
      ' اولین سوال بی‌پاسخ',
    );
    const navigator = h(
      'details',
      { class: 'qnav card' },
      h('summary', null, 'پرش به سوال'),
      nextUnansweredBtn,
      navGrid,
    );

    // ── سوال‌ها ──
    const list = h('div', { class: 'question-list' });
    for (let i = 0; i < current.questionCount; i += 1) {
      list.append(questionCard(current, i, locked));
    }

    const pauseBtn = h(
      'button',
      {
        class: 'btn btn-ghost pause-btn',
        type: 'button',
        disabled: locked || paused,
        onClick: () => {
          try {
            store.pauseExam(exam.id);
            toast('تایمر متوقف شد. با خیال راحت نفس بگیر 🙂', 'info');
          } catch (err) {
            toast(err.message ?? 'توقف تایمر ممکن نشد.', 'error');
          }
        },
      },
      icon('pause', 16),
      ' توقف تایمر',
    );

    const endBtn = h(
      'button',
      {
        class: 'btn btn-danger',
        type: 'button',
        disabled: locked && !paused,
        onClick: async () => {
          const ok = await confirmDialog({
            title: 'آیا مطمئن هستید که می‌خواهید آزمون را پایان دهید؟',
            message: 'پس از پایان، امکان تغییر پاسخ‌ها وجود ندارد و به تصحیح‌کننده می‌روید.',
            confirmLabel: 'پایان آزمون',
            cancelLabel: 'ادامه آزمون',
            danger: true,
          });
          if (!ok) return;
          try {
            store.endExamManually(exam.id);
          } catch (err) {
            toast(err.message ?? 'پایان آزمون ممکن نشد.', 'error');
          }
        },
      },
      'پایان آزمون',
    );

    const footer = h('div', { class: 'sheet-footer' }, countEl, h('div', { class: 'sheet-footer-actions' }, pauseBtn, endBtn));

    container.append(top, h('main', { class: 'page sheet-page' }, navigator, list), footer);

    if (paused) container.append(pausedOverlay(current));
    else if (locked && phase === PHASE.EXPIRED) container.append(timeUpOverlay());

    refreshDynamic(current, now);
    shortcuts = attachQuestionShortcuts({
      container,
      onPick: (index, optionId) => selectOption(index, optionId),
      isDisabled: () => !canAnswer(store.get(exam.id), Date.now()),
    });

    // ── تیکر: نمایش زمان واقعی ──
    tickerCleanup = onTick(() => {
      const t = Date.now();
      const fresh = store.get(exam.id);
      if (!fresh) return;
      if (canAnswer(fresh, t)) {
        if (t >= effectiveEndsAt(fresh)) {
          store.refresh(); // وضعیت به time_up می‌رود → emit → رندر مجدد با overlay
          return;
        }
        refreshDynamic(fresh, t);
      } else if (currentPhase(fresh, t) === PHASE.PAUSED) {
        refreshDynamic(fresh, t);
      }
    });
  }

  /** به‌روزرسانی درجای زمان/شمارنده‌ها بدون رندر کامل (حفظ اسکرول) */
  function refreshDynamic(current, now) {
    const locked = !canAnswer(current, now);
    const paused = currentPhase(current, now) === PHASE.PAUSED;
    const secs = remainingSeconds(current, now);

    const clockEl = container.querySelector('[data-clock]');
    if (clockEl) {
      clockEl.textContent = paused ? `⏸ ${formatClock(secs)}` : `⏱ ${formatClock(secs)}`;
      clockEl.classList.toggle('timer-danger', secs <= 60 && !locked && !paused);
      clockEl.classList.toggle('timer-paused', paused);
      clockEl.classList.toggle('timer-locked', locked);
    }

    const answered = Object.keys(current.answers).length;
    const total = Math.max(1, current.questionCount);
    const label = `پاسخ‌داده: ${formatNumber(answered)} از ${formatNumber(current.questionCount)}`;
    const labelEl = container.querySelector('[data-progress-label]');
    if (labelEl) labelEl.textContent = label;
    const countEl = container.querySelector('[data-count]');
    if (countEl) countEl.textContent = label;
    const answersFill = container.querySelector('.progress-fill:not(.time-fill)');
    if (answersFill) answersFill.style.width = `${(answered / total) * 100}%`;
    const timeFill = container.querySelector('.time-fill');
    if (timeFill) {
      timeFill.style.width = `${elapsedRatio(current, now) * 100}%`;
      timeFill.classList.toggle('time-fill-danger', secs <= 60 && !locked && !paused);
    }

    const unanswered = [];
    for (let i = 0; i < current.questionCount; i += 1) {
      const chip = container.querySelector(`[data-chip="${i}"]`);
      const isAnswered = current.answers[i] != null;
      if (chip) chip.classList.toggle('chip-answered', isAnswered);
      if (!isAnswered) unanswered.push(i);
    }
    for (const chip of container.querySelectorAll('[data-chip]')) chip.classList.remove('chip-next');
    if (unanswered.length > 0) {
      const chip = container.querySelector(`[data-chip="${unanswered[0]}"]`);
      if (chip) chip.classList.add('chip-next');
    }

    // دکمهٔ «پاک‌کردن» هر کارت
    for (let i = 0; i < current.questionCount; i += 1) {
      const clearBtn = container.querySelector(`[data-clear="${i}"]`);
      if (clearBtn) clearBtn.hidden = current.answers[i] == null;
    }

    // توضیح توقف در overlay
    const pauseStats = container.querySelector('[data-pause-stats]');
    if (pauseStats && paused) {
      pauseStats.textContent = `مدت توقف: ${formatSeconds(pauseDurationMs(current, now) / 1000)} · تعداد توقف‌ها: ${formatNumber(current.pauseCount ?? 1)}`;
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
          attrs: { role: 'radio', 'aria-checked': selected === opt.id ? 'true' : 'false', 'aria-label': optionTitle(opt.id) },
          onClick: () => selectOption(index, opt.id),
        },
        h('span', { class: 'option-radio' }),
        h('span', { class: 'option-num' }, opt.label),
        srOnly(optionTitle(opt.id)),
      ),
    );

    return h(
      'section',
      { class: 'card question-card', dataset: { q: String(index) } },
      h(
        'div',
        { class: 'q-head' },
        h('h3', { class: 'q-title' }, `سوال ${formatNumber(index + 1)}`),
        h(
          'button',
          {
            class: 'btn-clear',
            type: 'button',
            hidden: selected == null,
            dataset: { clear: String(index) },
            attrs: { 'aria-label': `پاک‌کردن پاسخ سوال ${index + 1}` },
            onClick: () => selectOption(index, null),
          },
          'پاک کردن',
        ),
      ),
      h(
        'div',
        { class: 'option-grid', attrs: { role: 'radiogroup', 'aria-label': `گزینه‌های سوال ${index + 1}` } },
        optionBtns,
      ),
    );
  }

  function selectOption(index, optId) {
    const fresh = store.get(exam.id);
    const phase = currentPhase(fresh, Date.now());
    if (phase === PHASE.PAUSED) {
      toast('تایمر متوقف است؛ برای پاسخ‌دادن، آزمون را ادامه دهید.', 'error');
      return;
    }
    if (!canAnswer(fresh, Date.now())) {
      toast('آزمون قفل شده است؛ امکان تغییر پاسخ نیست.', 'error');
      return;
    }
    try {
      store.setAnswer(exam.id, index, optId);
    } catch (err) {
      toast(err.message ?? 'ثبت پاسخ ممکن نشد.', 'error');
      return;
    }
    // به‌روزرسانی درجا بدون رندر کامل (حفظ اسکرول)
    const card = container.querySelector(`.question-card[data-q="${index}"]`);
    if (card) {
      for (const btn of card.querySelectorAll('.option-btn')) {
        const isSelected = btn.dataset.opt === optId;
        btn.classList.toggle('option-selected', isSelected);
        btn.setAttribute('aria-checked', isSelected ? 'true' : 'false');
      }
    }
    refreshDynamic(store.get(exam.id), Date.now());
  }

  function pausedOverlay(current) {
    return h(
      'div',
      {
        class: 'lock-overlay pause-overlay',
        attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'تایمر متوقف است' },
      },
      h(
        'div',
        { class: 'lock-card pause-card' },
        h('div', { class: 'lock-icon pause-icon' }, icon('pause', 44)),
        h('h2', null, 'تایمر متوقف شد'),
        h('p', null, 'زمان آزمون در حین توقف مصرف نمی‌شود و پاسخ‌های شما محفوظ است.'),
        h('p', { class: 'pause-stats', dataset: { pauseStats: '1' } }, ''),
        h(
          'button',
          {
            class: 'btn btn-primary btn-xl',
            onClick: () => {
              try {
                store.resumeExam(exam.id);
                toast('ادامهٔ آزمون.', 'success');
              } catch (err) {
                toast(err.message ?? 'ادامه ممکن نشد.', 'error');
              }
            },
          },
          icon('play', 18),
          ' ادامهٔ آزمون',
        ),
        h(
          'button',
          {
            class: 'btn btn-ghost',
            onClick: async () => {
              const ok = await confirmDialog({
                title: 'پایان آزمون',
                message: 'همین‌جا آزمون را تمام می‌کنید؟ پس از پایان، امکان تغییر پاسخ‌ها نیست.',
                confirmLabel: 'پایان آزمون',
                cancelLabel: 'ادامه آزمون',
                danger: true,
              });
              if (!ok) return;
              try {
                store.endExamManually(exam.id);
              } catch (err) {
                toast(err.message ?? 'پایان آزمون ممکن نشد.', 'error');
              }
            },
          },
          'پایان آزمون و رفتن به تصحیح',
        ),
      ),
    );
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
              try {
                store.enterGrading(exam.id);
              } catch (err) {
                toast(err.message ?? 'ورود به تصحیح ممکن نشد.', 'error');
              }
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
    if (!fresh) {
      navigate('/');
      return;
    }
    const phase = currentPhase(fresh, Date.now());
    if (phase === PHASE.GRADING || phase === PHASE.GRADED) {
      rerender(); // خروج از پاسخ‌برگ
      return;
    }
    if (phase !== lastPhase || phase === PHASE.PAUSED) {
      render(); // تغییر فاز (توقف/شروع مجدد/پایان زمان) → رندر کامل با overlay درست
    }
  });

  return () => {
    unsub();
    if (tickerCleanup) tickerCleanup();
    if (shortcuts) shortcuts.destroy();
    container.remove();
  };
}
