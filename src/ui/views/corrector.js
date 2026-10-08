// ── تصحیح‌کننده: دریافت کلید صحیح، جدا از پاسخ‌های کاربر ─────────────────────

import { h, clearEl, scrollToEl } from '../dom.js';
import { toast, icon } from '../components.js';
import { OPTIONS, optionLabel, findMissingKeys } from '../../core/scoring.js';
import { STATUS } from '../../core/model.js';
import { formatNumber } from '../../core/format.js';

export function correctorView({ rootEl, store, navigate, exam }) {
  const container = h('div', { class: 'view' });
  rootEl.append(container);

  function render(missingAfterAttempt = null) {
    clearEl(container);
    const current = store.get(exam.id);

    const missingCount = findMissingKeys(current.questionCount, current.key).length;
    const keyCountEl = h('span', { dataset: { keyCount: '1' } }, '');

    // ── هشدار کلید ناقص ──
    const warning = h('div', { class: 'warning-banner', hidden: true, attrs: { role: 'alert' } });
    function showWarning(missing) {
      clearEl(warning);
      warning.hidden = missing.length === 0;
      if (missing.length === 0) return;
      warning.append(
        h('strong', null, 'کلید همهٔ سوالات را وارد نکرده‌اید.'),
        h('p', null, 'سوال‌های بدون کلید:'),
        h(
          'div',
          { class: 'missing-chips' },
          missing.map((i) =>
            h('button', {
              class: 'nav-chip chip-missing',
              type: 'button',
              text: formatNumber(i + 1),
              onClick: () => scrollToEl(container.querySelector(`[data-key-q="${i}"]`)),
            }),
          ),
        ),
      );
    }
    if (missingAfterAttempt) showWarning(missingAfterAttempt);

    const top = h(
      'div',
      { class: 'sheet-top' },
      h(
        'div',
        { class: 'sheet-top-row' },
        h('span', { class: 'sheet-name' }, `تصحیح‌کننده · ${current.name}`),
        h('span', { class: 'sheet-badge' }, icon('check', 16)),
      ),
      h('div', { class: 'sheet-top-row' }, 'پاسخ صحیح هر سوال را مشخص کنید؛ پاسخ‌های دانش‌آموز به‌عنوان کلید در نظر گرفته نمی‌شوند.'),
    );

    const list = h('div', { class: 'question-list' });
    for (let i = 0; i < current.questionCount; i += 1) {
      list.append(keyCard(current, i));
    }

    const finishBtn = h(
      'button',
      {
        class: 'btn btn-primary',
        onClick: () => {
          const res = store.finishGrading(exam.id);
          if (!res.ok) {
            showWarning(res.missing);
            scrollToEl(warning);
            toast('کلید همهٔ سوالات را وارد نکرده‌اید.', 'error');
            return;
          }
          navigate(`/exam/${exam.id}/result`);
        },
      },
      'اتمام تصحیح',
    );

    const footer = h('div', { class: 'sheet-footer' }, keyCountEl, finishBtn);

    container.append(top, warning, h('main', { class: 'page sheet-page' }, list), footer);
    refreshKeyCount();

    function refreshKeyCount() {
      const fresh = store.get(exam.id);
      const entered = fresh.questionCount - findMissingKeys(fresh.questionCount, fresh.key).length;
      keyCountEl.textContent = `کلید واردشده: ${formatNumber(entered)} از ${formatNumber(fresh.questionCount)}`;
    }

    function keyCard(currentExam, index) {
      const selectedKey = currentExam.key[index] ?? null;
      const userAnswer = currentExam.answers[index] ?? null;
      const optionBtns = OPTIONS.map((opt) =>
        h(
          'button',
          {
            class: `option-btn option-key${selectedKey === opt.id ? ' option-selected' : ''}`,
            type: 'button',
            dataset: { keyQ: String(index), opt: opt.id },
            attrs: { role: 'radio', 'aria-checked': selectedKey === opt.id ? 'true' : 'false' },
            onClick: () => {
              store.setKeyEntry(exam.id, index, opt.id);
              const card = container.querySelector(`[data-key-q="${index}"].question-card`);
              if (card) {
                for (const btn of card.querySelectorAll('.option-btn')) {
                  const isSel = btn.dataset.opt === opt.id;
                  btn.classList.toggle('option-selected', isSel);
                  btn.setAttribute('aria-checked', isSel ? 'true' : 'false');
                }
              }
              const fresh = store.get(exam.id);
              const missing = findMissingKeys(fresh.questionCount, fresh.key);
              if (missing.length === 0) showWarning([]);
              refreshKeyCount();
            },
          },
          h('span', { class: 'option-radio' }),
          h('span', { class: 'option-label' }, opt.label),
        ),
      );
      return h(
        'section',
        { class: 'card question-card', dataset: { keyQ: String(index) } },
        h(
          'div',
          { class: 'q-head' },
          h('h3', { class: 'q-title' }, `سوال ${formatNumber(index + 1)}`),
          h(
            'span',
            { class: `user-note ${userAnswer ? '' : 'user-note-empty'}` },
            userAnswer ? `پاسخ دانش‌آموز: ${optionLabel(userAnswer)}` : 'پاسخ دانش‌آموز: نزده',
          ),
        ),
        h('p', { class: 'key-prompt' }, 'پاسخ صحیح را انتخاب کنید:'),
        h('div', { class: 'option-grid', attrs: { role: 'radiogroup' } }, optionBtns),
      );
    }

    return refreshKeyCount;
  }

  render();

  const unsub = store.subscribe(() => {
    const fresh = store.get(exam.id);
    if (fresh.status === STATUS.GRADED) {
      navigate(`/exam/${exam.id}/result`);
    }
  });

  return () => {
    unsub();
    container.remove();
  };
}
