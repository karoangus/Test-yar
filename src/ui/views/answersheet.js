// ── پاسخ‌برگ: ثبت پاسخ‌ها با تایمر واقعی، توقف/ادامه و قفل کامل پس از پایان ──
// از سوال اول شروع می‌کند، دور سوال فعال یک کادر زرد متحرک می‌کشد، بعد از
// پاسخ خودکار به سوال بعدی اسکرول می‌کند و امکان رد کردن سوال بدون پاسخ را
// با حالت «رد شد» (dashed + نشان) فراهم می‌کند.

import { h, clearEl, scrollToEl, srOnly } from '../dom.js';
import { onTick, confirmDialog, toast, icon, kbd } from '../components.js';
import { OPTIONS, optionTitle } from '../../core/scoring.js';
import { canAnswer, currentPhase, PHASE, startNumberOf, isAutoGradeReady, isTimed } from '../../core/model.js';
import {
  remainingSeconds,
  activeElapsedSeconds,
  isExpired,
  elapsedRatio,
  pauseDurationMs,
} from '../../core/timer.js';
import {
  formatNumber,
  formatClock,
  formatSeconds,
  formatQuestionNo,
  formatRange,
  formatAnswerCount,
} from '../../core/format.js';
import { attachQuestionShortcuts } from '../keyboard.js';

export function answersheetView({ rootEl, store, navigate, rerender, exam }) {
  const container = h('div', { class: 'view' });
  rootEl.append(container);
  let tickerCleanup = null;
  let shortcuts = null;
  let lastPhase = null;
  let currentActiveIndex = 0;
  const skippedSet = new Set();

  function cardEl(index) {
    return container.querySelector(`.question-card[data-q="${index}"]`);
  }

  function activateQuestion(index, { scroll = true } = {}) {
    currentActiveIndex = index;
    if (shortcuts) {
      shortcuts.setActive(index, { scroll });
    } else if (scroll) {
      const el = cardEl(index);
      if (el) scrollToEl(el);
    }
    // اگر بعد از رندر هنوز shortcuts ساخته نشده، هایلایت را دستی هم بزنیم
    syncActiveHighlight();
  }

  function syncActiveHighlight() {
    for (const card of container.querySelectorAll('.question-card[data-q]')) {
      const idx = Number(card.getAttribute('data-q'));
      card.classList.toggle('question-active', idx === currentActiveIndex);
    }
    for (const chip of container.querySelectorAll('[data-chip]')) {
      const idx = Number(chip.getAttribute('data-chip'));
      chip.classList.toggle('chip-active', idx === currentActiveIndex);
    }
  }

  function skipQuestion(index) {
    const fresh = store.get(exam.id);
    if (!fresh) return;
    const phase = currentPhase(fresh, Date.now());
    if (phase === PHASE.PAUSED) {
      toast('تایمر متوقف است؛ برای ادامه، آزمون را از سر بگیرید.', 'error');
      return;
    }
    if (!canAnswer(fresh, Date.now())) {
      toast('آزمون قفل شده است.', 'error');
      return;
    }
    if (fresh.answers[index] == null) {
      skippedSet.add(index);
      const card = cardEl(index);
      if (card) {
        card.classList.add('question-skipped');
        const badge = card.querySelector('[data-skip-badge]');
        if (badge) badge.hidden = false;
        const skipBtn = card.querySelector('[data-skip]');
        if (skipBtn) skipBtn.hidden = true;
      }
      const chip = container.querySelector(`[data-chip="${index}"]`);
      if (chip) chip.classList.add('chip-skipped');
    }
    if (index + 1 < fresh.questionCount) {
      activateQuestion(index + 1, { scroll: true });
    } else {
      const [firstUnanswered] = store.unansweredIndexes(exam.id);
      if (firstUnanswered != null && firstUnanswered !== index) {
        activateQuestion(firstUnanswered, { scroll: true });
      } else {
        // آخر آزمون هستیم و همه دیده شده‌اند — همان جا بمانیم
        activateQuestion(index, { scroll: false });
        toast('به آخر آزمون رسیدید — می‌توانید از ناوبری به «رد شده‌ها» برگردید.', 'info');
      }
    }
    refreshDynamic(store.get(exam.id), Date.now());
  }

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
    const timed = isTimed(current);
    const start = startNumberOf(current);
    const autoGrade = isAutoGradeReady(current);
    lastPhase = phase;

    const clockEl = h(
      'span',
      {
        class: 'sheet-timer',
        dataset: { clock: '1', ...(timed ? {} : { stopwatch: '1' }) },
        attrs: { title: timed ? 'زمان باقی‌مانده' : 'کرنومتر · زمان سپری‌شده' },
      },
      '',
    );
    const answersFill = h('div', { class: 'progress-fill' });
    const timeFill = h('div', { class: 'progress-fill time-fill' });
    const progressLabel = h('span', { class: 'sheet-sub', dataset: { progressLabel: '1' } }, '');
    const countEl = h('span', { class: 'sheet-count', dataset: { count: '1' } }, '');

    const top = h(
      'div',
      { class: 'sheet-top' },
      h(
        'div',
        { class: 'sheet-top-row' },
        h('span', { class: 'sheet-name' }, current.name),
        h(
          'span',
          { class: 'sheet-top-tools' },
          autoGrade
            ? h(
                'span',
                {
                  class: 'auto-badge',
                  dataset: { autoGrade: '1' },
                  attrs: { title: 'کلید تصحیح آماده است؛ پس از پایان آزمون کارنامه خودکار ساخته می‌شود.' },
                },
                icon('zap', 12),
                ' کلید آماده',
              )
            : null,
          clockEl,
        ),
      ),
      h(
        'div',
        { class: 'sheet-top-row' },
        progressLabel,
        h('span', { class: 'sheet-shortcuts' }, kbd('۱'), kbd('۲'), kbd('۳'), kbd('۴'), kbd('۰'), srOnly('میان‌بُر — ۰ برای رد کردن سوال فعال')),
      ),
      h('div', { class: 'progress' }, answersFill),
      timed ? h('div', { class: 'progress progress-thin' }, timeFill) : null,
    );

    // ── ناوش سوال‌ها ──
    const navGrid = h('div', { class: 'nav-grid' });
    for (let i = 0; i < current.questionCount; i += 1) {
      const chip = h('button', {
        class: 'nav-chip',
        type: 'button',
        dataset: { chip: String(i) },
        text: formatNumber(start + i),
        onClick: () => activateQuestion(i, { scroll: true }),
      });
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
          activateQuestion(index, { scroll: true });
        },
      },
      icon('target', 16),
      ' اولین سوال بی‌پاسخ',
    );
    const nextSkippedBtn = h(
      'button',
      {
        class: 'btn btn-ghost btn-sm',
        type: 'button',
        dataset: { nextSkipped: '1' },
        onClick: () => {
          const skipped = [...skippedSet].filter((i) => store.get(exam.id)?.answers[i] == null).sort((a, b) => a - b);
          if (skipped.length === 0) {
            toast('سوال رد شده‌ای ندارید.', 'info');
            return;
          }
          activateQuestion(skipped[0], { scroll: true });
        },
      },
      icon('skip', 16),
      ' سوال‌های رد شده',
    );
    const navigator = h(
      'details',
      { class: 'qnav card' },
      h('summary', null, `پرش به سوال · شمارهٔ ${formatRange(start, current.questionCount)}`),
      h('div', { class: 'toolbar', style: { marginBottom: '8px' } }, nextUnansweredBtn, nextSkippedBtn),
      navGrid,
    );

    // ── سوال‌ها ──
    const list = h('div', { class: 'question-list' });
    for (let i = 0; i < current.questionCount; i += 1) {
      list.append(questionCard(current, i, locked, start));
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
            message: autoGrade
              ? 'پس از پایان، پاسخ‌ها با کلید آزمون قبلی تصحیح می‌شوند و کارنامه به‌صورت خودکار ساخته می‌شود.'
              : 'پس از پایان، امکان تغییر پاسخ‌ها وجود ندارد و به تصحیح‌کننده می‌روید.',
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

    if (paused) container.append(pausedOverlay(current, autoGrade));
    else if (locked && phase === PHASE.EXPIRED) container.append(timeUpOverlay(current, autoGrade));

    refreshDynamic(current, now);
    // سوال فعال اولیه: اگر آزمون از قبل پاسخ دارد، از اولین بی‌پاسخ شروع نکنیم — طبق درخواست «از سوال اول شروع کنه»
    // اما اگر کاربر قبلاً تا سوالی پیش رفته و صفحه رفرش شده، فعال را روی ۰ نگه می‌داریم تا تجربه یکسان بماند.
    // currentActiveIndex قبلاً مقداردهی شده (۰ در ابتدای جلسه)
    if (currentActiveIndex >= current.questionCount) currentActiveIndex = 0;
    // تنظیم هایلایت اولیه بدون اسکرول (تا کاربر خودش اسکرول نکند، پرش نداشته باشیم)
    shortcuts = attachQuestionShortcuts({
      container,
      initialIndex: currentActiveIndex,
      onPick: (index, optionId) => selectOption(index, optionId),
      onSkip: (index) => skipQuestion(index),
      isDisabled: () => !canAnswer(store.get(exam.id), Date.now()),
      onMove: (next) => {
        currentActiveIndex = next;
        syncActiveHighlight();
        // وقتی با کیبورد یا کلیک جابه‌جا شد، حالت‌های بصری را به‌روز کن
        for (let i = 0; i < current.questionCount; i += 1) {
          const c = cardEl(i);
          if (!c) continue;
          const isSkipped = skippedSet.has(i) && store.get(exam.id)?.answers[i] == null;
          c.classList.toggle('question-skipped', isSkipped);
        }
      },
    });
    // همگام‌سازی هایلایت زرد روی لود اول
    syncActiveHighlight();
    for (let i = 0; i < current.questionCount; i += 1) {
      const isSkipped = skippedSet.has(i) && current.answers[i] == null;
      const card = cardEl(i);
      if (card) card.classList.toggle('question-skipped', isSkipped);
      const chip = container.querySelector(`[data-chip="${i}"]`);
      if (chip) chip.classList.toggle('chip-skipped', isSkipped);
    }

    // ── تیکر: نمایش زمان واقعی (شمارش معکوس تایمر یا شمارش رو به بالای کرنومتر) ──
    tickerCleanup = onTick(() => {
      const t = Date.now();
      const fresh = store.get(exam.id);
      if (!fresh) return;
      if (canAnswer(fresh, t)) {
        if (isExpired(fresh, t)) {
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
    const timed = isTimed(current);
    const secs = timed ? remainingSeconds(current, now) : activeElapsedSeconds(current, now);

    const clockEl = container.querySelector('[data-clock]');
    if (clockEl) {
      clockEl.textContent = paused ? `⏸ ${formatClock(secs)}` : `⏱ ${formatClock(secs)}`;
      clockEl.classList.toggle('timer-danger', timed && secs <= 60 && !locked && !paused);
      clockEl.classList.toggle('timer-paused', paused);
      clockEl.classList.toggle('timer-locked', locked);
      clockEl.classList.toggle('timer-stopwatch', !timed);
    }

    const answered = Object.keys(current.answers).length;
    const total = Math.max(1, current.questionCount);
    const start = startNumberOf(current);
    // سربرگ چسبان: شمارنده + بازهٔ شمارهٔ سوال‌ها (کاربر همیشه می‌بیند کجای آزمون است)
    const labelEl = container.querySelector('[data-progress-label]');
    if (labelEl) labelEl.textContent = `پاسخ‌داده: ${formatAnswerCount(answered, current.questionCount, start)}`;
    // نوار پایین: کوتاه بماند تا دکمه‌ها جا شوند (اطلاعات کامل در سربرگ هست)
    const countEl = container.querySelector('[data-count]');
    if (countEl) countEl.textContent = `پاسخ‌داده: ${formatAnswerCount(answered, current.questionCount, 1)}`;
    const answersFill = container.querySelector('.progress-fill:not(.time-fill)');
    if (answersFill) answersFill.style.width = `${(answered / total) * 100}%`;
    const timeFill = container.querySelector('.time-fill');
    if (timeFill && timed) {
      timeFill.style.width = `${elapsedRatio(current, now) * 100}%`;
      timeFill.classList.toggle('time-fill-danger', secs <= 60 && !locked && !paused);
    }

    const unanswered = [];
    for (let i = 0; i < current.questionCount; i += 1) {
      const chip = container.querySelector(`[data-chip="${i}"]`);
      const isAnswered = current.answers[i] != null;
      const isSkipped = skippedSet.has(i) && !isAnswered;
      if (chip) {
        chip.classList.toggle('chip-answered', isAnswered);
        chip.classList.toggle('chip-skipped', isSkipped);
      }
      if (!isAnswered) unanswered.push(i);
      const card = cardEl(i);
      if (card) {
        card.classList.toggle('question-skipped', isSkipped);
        const skipBadge = card.querySelector('[data-skip-badge]');
        if (skipBadge) skipBadge.hidden = !isSkipped;
        const skipBtn = card.querySelector('[data-skip]');
        if (skipBtn) skipBtn.hidden = isAnswered || locked;
        const clearBtn = card.querySelector(`[data-clear="${i}"]`);
        if (clearBtn) clearBtn.hidden = !isAnswered;
      }
    }
    for (const chip of container.querySelectorAll('[data-chip]')) chip.classList.remove('chip-next');
    if (unanswered.length > 0) {
      const chip = container.querySelector(`[data-chip="${unanswered[0]}"]`);
      if (chip) chip.classList.add('chip-next');
    }

    // دکمهٔ «پاک‌کردن» و «رد کردن» هر کارت — همگام با skipped
    // توضیح توقف در overlay
    const pauseStats = container.querySelector('[data-pause-stats]');
    if (pauseStats && paused) {
      pauseStats.textContent = `مدت توقف: ${formatSeconds(pauseDurationMs(current, now) / 1000)} · تعداد توقف‌ها: ${formatNumber(current.pauseCount ?? 1)}`;
    }
  }

  function questionCard(current, index, locked, start) {
    const selected = current.answers[index] ?? null;
    const isSkipped = skippedSet.has(index) && selected == null;
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
      { class: `card question-card${isSkipped ? ' question-skipped' : ''}${index === currentActiveIndex ? ' question-active' : ''}`, dataset: { q: String(index) } },
      h(
        'div',
        { class: 'q-head' },
        h('h3', { class: 'q-title' }, formatQuestionNo(index, start)),
        h(
          'div',
          { class: 'q-actions' },
          h('span', { class: 'skip-badge', dataset: { skipBadge: String(index) }, hidden: !isSkipped }, 'رد شد'),
          h(
            'button',
            {
              class: 'btn-skip',
              type: 'button',
              dataset: { skip: String(index) },
              hidden: selected != null || locked,
              attrs: { 'aria-label': `رد کردن ${formatQuestionNo(index, start)}` },
              onClick: () => skipQuestion(index),
            },
            'رد کردن →',
          ),
          h(
            'button',
            {
              class: 'btn-clear',
              type: 'button',
              hidden: selected == null,
              dataset: { clear: String(index) },
              attrs: { 'aria-label': `پاک‌کردن پاسخ ${formatQuestionNo(index, start)}` },
              onClick: () => selectOption(index, null),
            },
            'پاک کردن',
          ),
        ),
      ),
      h(
        'div',
        {
          class: 'option-grid',
          attrs: { role: 'radiogroup', 'aria-label': `گزینه‌های ${formatQuestionNo(index, start)}` },
        },
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
    const card = cardEl(index);
    if (card) {
      for (const btn of card.querySelectorAll('.option-btn')) {
        const isSelected = btn.dataset.opt === optId;
        btn.classList.toggle('option-selected', isSelected);
        btn.setAttribute('aria-checked', isSelected ? 'true' : 'false');
      }
      // پاک کردن حالت رد شده اگر جواب داد
      if (optId != null) {
        skippedSet.delete(index);
        card.classList.remove('question-skipped');
        const badge = card.querySelector('[data-skip-badge]');
        if (badge) badge.hidden = true;
        const chip = container.querySelector(`[data-chip="${index}"]`);
        if (chip) chip.classList.remove('chip-skipped');
      }
    }
    refreshDynamic(store.get(exam.id), Date.now());

    if (optId != null) {
      // اگر سوال فعال را جواب داد، خودکار برو سوال بعدی و هایلایتش کن
      const isActiveQuestion = index === currentActiveIndex;
      const total = store.get(exam.id)?.questionCount ?? 0;
      const next = index + 1 < total ? index + 1 : null;
      if (isActiveQuestion && next != null) {
        // تاخیر کوتاه تا کاربر انتخابش را ببیند، بعد اسکرول نرم
        setTimeout(() => {
          // ممکن است در این فاصله آزمون قفل شده باشد
          const still = store.get(exam.id);
          if (!still || !canAnswer(still, Date.now())) return;
          activateQuestion(next, { scroll: true });
        }, 340);
      } else if (isActiveQuestion && next == null) {
        // سوال آخر را جواب داد — اگر بی‌پاسخی مانده، به اولین بی‌پاسخ ببر (طراحی برای «بدون پاسخ گذاشتن»)
        const [firstUnanswered] = store.unansweredIndexes(exam.id);
        if (firstUnanswered != null && firstUnanswered !== index) {
          setTimeout(() => activateQuestion(firstUnanswered, { scroll: true }), 340);
        }
      }
    } else {
      // پاک کردن پاسخ → همین سوال را فعال نگه دار (کاربر می‌خواهد دوباره جواب دهد)
      activateQuestion(index, { scroll: false });
    }
  }

  function pausedOverlay(current, autoGrade = false) {
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
          autoGrade ? 'پایان آزمون و دیدن کارنامه' : 'پایان آزمون و رفتن به تصحیح',
        ),
      ),
    );
  }

  function timeUpOverlay(current, autoGrade = false) {
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
        h(
          'p',
          null,
          autoGrade
            ? 'پاسخ‌گویی به پایان رسید. کارنامه با کلید آزمون قبلی خودکار ساخته می‌شود.'
            : 'پاسخ‌گویی به پایان رسید.',
        ),
        h(
          'button',
          {
            class: 'btn btn-primary btn-xl',
            onClick: () => {
              try {
                store.enterGrading(current.id);
              } catch (err) {
                toast(err.message ?? 'ورود به تصحیح ممکن نشد.', 'error');
              }
            },
          },
          autoGrade ? 'دیدن کارنامه' : 'ورود به تصحیح‌کننده',
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
