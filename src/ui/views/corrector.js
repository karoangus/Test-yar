// ── تصحیح‌کننده: دریافت کلید صحیح، جدا از پاسخ‌های کاربر ─────────────────────
// سوال فعال با کادر زرد متحرک هایلایت می‌شود و بعد از انتخاب کلید، خودکار به
// سوال بعدی می‌رود؛ حالت رد شدن هم مشابه پاسخ‌برگ پشتیبانی می‌شود.

import { h, clearEl, scrollToEl, srOnly } from '../dom.js';
import { toast, icon, kbd, segmented } from '../components.js';
import { OPTIONS, optionTitle, findMissingKeys } from '../../core/scoring.js';
import { STATUS, startNumberOf } from '../../core/model.js';
import { recordedElapsedSeconds } from '../../core/timer.js';
import { formatNumber, formatQuestionNo, formatRange, formatAnswerCount, formatSeconds } from '../../core/format.js';
import { attachQuestionShortcuts } from '../keyboard.js';

export function correctorView({ rootEl, store, navigate, exam }) {
  const container = h('div', { class: 'view' });
  rootEl.append(container);

  let onlyMissing = false;
  let shortcuts = null;
  let pendingMissing = null;
  let currentActiveIndex = 0;
  const skippedSet = new Set();

  function cardEl(index) {
    return container.querySelector(`.question-card[data-key-q="${index}"]`);
  }

  function activateQuestion(index, { scroll = true } = {}) {
    currentActiveIndex = index;
    if (shortcuts) shortcuts.setActive(index, { scroll });
    else if (scroll) {
      const el = cardEl(index);
      if (el) scrollToEl(el);
    }
    syncActiveHighlight();
  }

  function syncActiveHighlight() {
    for (const card of container.querySelectorAll('.question-card[data-key-q]')) {
      const idx = Number(card.getAttribute('data-key-q'));
      card.classList.toggle('question-active', idx === currentActiveIndex);
    }
  }

  function skipQuestion(index) {
    const fresh = store.get(exam.id);
    if (!fresh) return;
    if (fresh.key[index] == null) {
      skippedSet.add(index);
      const card = cardEl(index);
      if (card) {
        card.classList.add('question-skipped');
        const badge = card.querySelector('[data-skip-badge-key]');
        if (badge) badge.hidden = false;
        const btn = card.querySelector('[data-skip-key]');
        if (btn) btn.hidden = true;
      }
    }
    const max = fresh.questionCount - 1;
    if (index < max) activateQuestion(index + 1, { scroll: true });
    else {
      const [firstMissing] = findMissingKeys(fresh.questionCount, fresh.key);
      if (firstMissing != null && firstMissing !== index) activateQuestion(firstMissing, { scroll: true });
      else activateQuestion(index, { scroll: false });
    }
  }

  function render() {
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

    const missing = findMissingKeys(current.questionCount, current.key);
    const start = startNumberOf(current);
    const keyCountEl = h('span', { dataset: { keyCount: '1' } }, '');

    // ── هشدار کلید ناقص ──
    const warning = h('div', { class: 'warning-banner', hidden: true, attrs: { role: 'alert' } });
    function showWarning(list) {
      clearEl(warning);
      warning.hidden = list.length === 0;
      if (list.length === 0) return;
      warning.append(
        h('strong', null, 'کلید همهٔ سوالات را وارد نکرده‌اید.'),
        h('p', null, 'سوال‌های بدون کلید:'),
        h(
          'div',
          { class: 'missing-chips' },
          list.map((i) =>
            h('button', {
              class: 'nav-chip chip-missing',
              type: 'button',
              text: formatNumber(start + i),
              onClick: () => activateQuestion(i, { scroll: true }),
            }),
          ),
        ),
      );
    }
    if (pendingMissing) showWarning(pendingMissing);

    const recordedSecs = recordedElapsedSeconds(current);
    const top = h(
      'div',
      { class: 'sheet-top' },
      h(
        'div',
        { class: 'sheet-top-row' },
        h('span', { class: 'sheet-name' }, `تصحیح‌کننده · ${current.name}`),
        h('span', { class: 'sheet-badge' }, icon('check', 16)),
      ),
      h(
        'div',
        { class: 'sheet-top-row' },
        h(
          'span',
          { class: 'sheet-sub' },
          `کلید صحیح هر سوال را انتخاب کنید · شمارهٔ ${formatRange(start, current.questionCount)}${recordedSecs != null ? ` · زمان ثبت‌شده: ${formatSeconds(recordedSecs)}` : ''}`,
        ),
        h('span', { class: 'sheet-shortcuts' }, kbd('۱'), kbd('۲'), kbd('۳'), kbd('۴'), kbd('۰'), srOnly('میان‌بُر — ۰ برای رد کردن')),
      ),
    );

    const inheritedBanner = current.keyOrigin
      ? h(
          'div',
          { class: 'info-banner', attrs: { role: 'status' } },
          h('span', { class: 'info-banner-icon' }, icon('zap', 18)),
          h(
            'div',
            null,
            h('strong', null, 'کلید از آزمون قبلی آماده است'),
            h(
              'p',
              null,
              `کلید «${current.keyOrigin.examName || 'آزمون قبلی'}» به این آزمون منتقل شده است؛ نیازی به وارد کردن دوباره نیست. برای ساخت کارنامه مستقیم «اتمام تصحیح» را بزنید.`,
            ),
          ),
        )
      : null;

    const filterBar = h(
      'div',
      { class: 'toolbar' },
      segmented({
        label: 'نمایش سوال‌ها',
        value: onlyMissing ? 'missing' : 'all',
        options: [
          { value: 'all', label: `همه (${formatNumber(current.questionCount)})` },
          { value: 'missing', label: `بدون کلید (${formatNumber(missing.length)})` },
        ],
        onChange: (value) => {
          onlyMissing = value === 'missing';
          render();
        },
      }),
      h(
        'button',
        {
          class: 'btn btn-ghost btn-sm',
          type: 'button',
          onClick: () => {
            const [index] = findMissingKeys(current.questionCount, current.key);
            if (index == null) {
              toast('کلید همهٔ سوال‌ها وارد شده است.', 'success');
              return;
            }
            activateQuestion(index, { scroll: true });
          },
        },
        icon('target', 16),
        ' اولین سوال بدون کلید',
      ),
    );

    const indexes = [];
    for (let i = 0; i < current.questionCount; i += 1) {
      if (!onlyMissing || current.key[i] == null) indexes.push(i);
    }

    const list = h('div', { class: 'question-list' });
    if (indexes.length === 0) {
      list.append(
        h('div', { class: 'empty-state' }, icon('check', 32), h('h2', null, 'کلید همهٔ سوال‌ها وارد شده است')),
      );
    } else {
      for (const i of indexes) list.append(keyCard(current, i, start));
    }

    const finishBtn = h(
      'button',
      {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const res = store.finishGrading(exam.id);
          if (!res.ok) {
            pendingMissing = res.missing;
            onlyMissing = false;
            showWarning(res.missing);
            render();
            scrollToEl(container.querySelector('.warning-banner'));
            toast('کلید همهٔ سوالات را وارد نکرده‌اید.', 'error');
            return;
          }
          navigate(`/exam/${exam.id}/result`);
        },
      },
      'اتمام تصحیح',
    );

    const footer = h('div', { class: 'sheet-footer' }, keyCountEl, finishBtn);

    // append(null) متن «null» را چاپ می‌کند؛ پس فقط عناصر واقعی اضافه می‌شوند
    container.append(top, ...(inheritedBanner ? [inheritedBanner] : []), warning, h('main', { class: 'page sheet-page' }, filterBar, list), footer);
    refreshKeyCount();
    if (currentActiveIndex >= current.questionCount) currentActiveIndex = 0;

    function refreshKeyCount() {
      const fresh = store.get(exam.id);
      if (!fresh) return;
      const entered = fresh.questionCount - findMissingKeys(fresh.questionCount, fresh.key).length;
      keyCountEl.textContent = `کلید واردشده: ${formatAnswerCount(entered, fresh.questionCount, startNumberOf(fresh))}`;
      // همگام‌سازی حالت رد شده روی چیپ‌ها/کارت‌ها
      for (let i = 0; i < fresh.questionCount; i += 1) {
        const card = cardEl(i);
        const isSkipped = skippedSet.has(i) && fresh.key[i] == null;
        if (card) {
          card.classList.toggle('question-skipped', isSkipped);
          const badge = card.querySelector('[data-skip-badge-key]');
          if (badge) badge.hidden = !isSkipped;
          const skipBtn = card.querySelector('[data-skip-key]');
          if (skipBtn) skipBtn.hidden = fresh.key[i] != null;
        }
      }
    }

    function selectKey(index, optionId) {
      try {
        store.setKeyEntry(exam.id, index, optionId);
      } catch (err) {
        toast(err.message ?? 'ثبت کلید ممکن نشد.', 'error');
        return;
      }
      const card = container.querySelector(`.question-card[data-key-q="${index}"]`);
      if (card) {
        for (const btn of card.querySelectorAll('.option-btn')) {
          const isSelected = btn.dataset.opt === optionId;
          btn.classList.toggle('option-selected', isSelected);
          btn.setAttribute('aria-checked', isSelected ? 'true' : 'false');
        }
        const clearBtn = card.querySelector('[data-clear-key]');
        if (clearBtn) clearBtn.hidden = optionId == null;
        const skipBtn = card.querySelector('[data-skip-key]');
        if (skipBtn) skipBtn.hidden = optionId != null;
        if (optionId != null) {
          skippedSet.delete(index);
          card.classList.remove('question-skipped');
          const badge = card.querySelector('[data-skip-badge-key]');
          if (badge) badge.hidden = true;
        }
      }
      const fresh = store.get(exam.id);
      const stillMissing = findMissingKeys(fresh.questionCount, fresh.key);
      if (stillMissing.length === 0) {
        pendingMissing = null;
        showWarning([]);
      }
      refreshKeyCount();
      if (optionId != null) {
        const isActive = index === currentActiveIndex;
        const total = fresh.questionCount;
        const next = index + 1 < total ? index + 1 : null;
        if (isActive && next != null && indexes.includes(next)) {
          setTimeout(() => activateQuestion(next, { scroll: true }), 320);
        } else if (isActive && next == null) {
          const [firstMissing] = findMissingKeys(fresh.questionCount, fresh.key);
          if (firstMissing != null && firstMissing !== index) {
            setTimeout(() => activateQuestion(firstMissing, { scroll: true }), 320);
          }
        } else if (isActive && next != null && !indexes.includes(next)) {
          // فیلتر «بدون کلید» فعال است و سوال بعدی در لیست نیست — به اولین بدون کلید برو
          const [firstMissing] = stillMissing;
          if (firstMissing != null) setTimeout(() => activateQuestion(firstMissing, { scroll: true }), 320);
        }
      } else {
        activateQuestion(index, { scroll: false });
      }
    }

    function keyCard(currentExam, index, start) {
      const selectedKey = currentExam.key[index] ?? null;
      const isSkipped = skippedSet.has(index) && selectedKey == null;
      const optionBtns = OPTIONS.map((opt) =>
        h(
          'button',
          {
            class: `option-btn option-key${selectedKey === opt.id ? ' option-selected' : ''}`,
            type: 'button',
            dataset: { keyQ: String(index), opt: opt.id },
            attrs: { role: 'radio', 'aria-checked': selectedKey === opt.id ? 'true' : 'false', 'aria-label': optionTitle(opt.id) },
            onClick: () => selectKey(index, opt.id),
          },
          h('span', { class: 'option-radio' }),
          h('span', { class: 'option-num' }, opt.label),
          srOnly(optionTitle(opt.id)),
        ),
      );
      return h(
        'section',
        { class: `card question-card${isSkipped ? ' question-skipped' : ''}${index === currentActiveIndex ? ' question-active' : ''}`, dataset: { keyQ: String(index) } },
        h(
          'div',
          { class: 'q-head' },
          h('h3', { class: 'q-title' }, formatQuestionNo(index, start)),
          h(
            'div',
            { class: 'q-actions' },
            h('span', { class: 'skip-badge', dataset: { skipBadgeKey: String(index) }, hidden: !isSkipped }, 'رد شد'),
            h(
              'button',
              {
                class: 'btn-skip',
                type: 'button',
                hidden: selectedKey != null,
                dataset: { skipKey: String(index) },
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
                hidden: selectedKey == null,
                dataset: { clearKey: String(index) },
                attrs: { 'aria-label': `پاک‌کردن کلید ${formatQuestionNo(index, start)}` },
                onClick: () => selectKey(index, null),
              },
              'پاک کردن',
            ),
          ),
        ),
        h('p', { class: 'key-prompt' }, 'پاسخ صحیح را انتخاب کنید:'),
        h(
          'div',
          { class: 'option-grid', attrs: { role: 'radiogroup', 'aria-label': `کلید ${formatQuestionNo(index, start)}` } },
          optionBtns,
        ),
      );
    }

    shortcuts = attachQuestionShortcuts({
      container,
      indexAttr: 'keyQ',
      initialIndex: currentActiveIndex,
      onPick: (index, optionId) => selectKey(index, optionId),
      onSkip: (index) => skipQuestion(index),
      onMove: (next) => {
        currentActiveIndex = next;
        syncActiveHighlight();
      },
    });
    syncActiveHighlight();

    return refreshKeyCount;
  }

  render();

  const unsub = store.subscribe(() => {
    const fresh = store.get(exam.id);
    if (!fresh) {
      navigate('/');
      return;
    }
    if (fresh.status === STATUS.GRADED) {
      navigate(`/exam/${exam.id}/result`);
    }
  });

  return () => {
    unsub();
    if (shortcuts) shortcuts.destroy();
    container.remove();
  };
}
