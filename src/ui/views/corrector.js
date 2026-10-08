// ── تصحیح‌کننده: دریافت کلید صحیح، جدا از پاسخ‌های کاربر ─────────────────────

import { h, clearEl, scrollToEl, srOnly } from '../dom.js';
import { toast, icon, kbd, segmented } from '../components.js';
import { OPTIONS, optionLabel, optionTitle, findMissingKeys } from '../../core/scoring.js';
import { STATUS, startNumberOf } from '../../core/model.js';
import { formatNumber, formatQuestionNo, formatRange, formatAnswerCount } from '../../core/format.js';
import { attachQuestionShortcuts } from '../keyboard.js';

export function correctorView({ rootEl, store, navigate, exam }) {
  const container = h('div', { class: 'view' });
  rootEl.append(container);

  let onlyMissing = false;
  let shortcuts = null;
  let pendingMissing = null;

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
              onClick: () => scrollToEl(container.querySelector(`.question-card[data-key-q="${i}"]`)),
            }),
          ),
        ),
      );
    }
    if (pendingMissing) showWarning(pendingMissing);

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
          `کلید صحیح هر سوال را انتخاب کنید · شمارهٔ ${formatRange(start, current.questionCount)}`,
        ),
        h('span', { class: 'sheet-shortcuts' }, kbd('۱'), kbd('۲'), kbd('۳'), kbd('۴'), srOnly('میان‌بُرهای کیبورد برای انتخاب کلید')),
      ),
    );

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
            scrollToEl(container.querySelector(`.question-card[data-key-q="${index}"]`));
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

    container.append(top, warning, h('main', { class: 'page sheet-page' }, filterBar, list), footer);
    refreshKeyCount();

    function refreshKeyCount() {
      const fresh = store.get(exam.id);
      if (!fresh) return;
      const entered = fresh.questionCount - findMissingKeys(fresh.questionCount, fresh.key).length;
      keyCountEl.textContent = `کلید واردشده: ${formatAnswerCount(entered, fresh.questionCount, startNumberOf(fresh))}`;
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
      }
      const fresh = store.get(exam.id);
      const stillMissing = findMissingKeys(fresh.questionCount, fresh.key);
      if (stillMissing.length === 0) {
        pendingMissing = null;
        showWarning([]);
      }
      refreshKeyCount();
    }

    function keyCard(currentExam, index, start) {
      const selectedKey = currentExam.key[index] ?? null;
      const userAnswer = currentExam.answers[index] ?? null;
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
        { class: 'card question-card', dataset: { keyQ: String(index) } },
        h(
          'div',
          { class: 'q-head' },
          h('h3', { class: 'q-title' }, formatQuestionNo(index, start)),
          h(
            'span',
            { class: `user-note ${userAnswer ? '' : 'user-note-empty'}` },
            userAnswer ? `پاسخ دانش‌آموز: ${optionLabel(userAnswer)}` : 'پاسخ دانش‌آموز: نزده',
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
      onPick: (index, optionId) => selectKey(index, optionId),
    });

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
