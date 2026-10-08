// ── میان‌بُرهای کیبورد برای پاسخ‌برگ و تصحیح‌کننده ────────────────────────────
// ۱ تا ۴ (یا 1 تا 4) → انتخاب گزینه برای سوال فعال
// ↑ / ↓ (یا k / j)    → جابه‌جایی بین سوال‌ها
// سوال فعال با کلاس question-active برجسته می‌شود.

import { optionFromKey } from '../core/scoring.js';

const MOVE_NEXT = new Set(['ArrowDown', 'j', 'J']);
const MOVE_PREV = new Set(['ArrowUp', 'k', 'K']);

function isTypingTarget(target) {
  if (!target || typeof target !== 'object') return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return target.isContentEditable === true;
}

/**
 * نصب میان‌بُرها روی یک کانتینر.
 * @param {object} options
 * @param {HTMLElement} options.container کانتینر نما
 * @param {string} options.cardSelector انتخابگر کارت سوال
 * @param {string} options.indexAttr نام dataset برای ایندکس سوال
 * @param {(index:number, optionId:string)=>void} options.onPick انتخاب گزینه
 * @param {()=>boolean} [options.isDisabled] آیا میان‌بُرها غیرفعال باشند؟
 * @param {(index:number)=>void} [options.onMove] پس از جابه‌جایی
 */
export function attachQuestionShortcuts({
  container,
  cardSelector = '.question-card',
  indexAttr = 'q',
  onPick,
  isDisabled = () => false,
  onMove = null,
}) {
  let activeIndex = 0;

  function cardAt(index) {
    return container.querySelector(`[data-${indexAttr}="${index}"]${cardSelector}`);
  }

  function cardIndexFromEvent(event) {
    const el = event.target instanceof Element ? event.target.closest(cardSelector) : null;
    if (!el || !container.contains(el)) return null;
    const raw = el.getAttribute(`data-${indexAttr}`);
    const index = Number(raw);
    return Number.isInteger(index) ? index : null;
  }

  function paint() {
    for (const card of container.querySelectorAll(cardSelector)) {
      const index = Number(card.getAttribute(`data-${indexAttr}`));
      card.classList.toggle('question-active', index === activeIndex);
    }
  }

  function setActive(index, { scroll = false } = {}) {
    activeIndex = Number.isInteger(index) && index >= 0 ? index : 0;
    paint();
    if (scroll) {
      const card = cardAt(activeIndex);
      if (card && typeof card.scrollIntoView === 'function') {
        try {
          card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch {
          /* محیط‌های بدون پشتیبانی */
        }
      }
    }
    if (onMove) onMove(activeIndex);
  }

  const onPointer = (event) => {
    const index = cardIndexFromEvent(event);
    if (index != null) setActive(index);
  };

  const onKeyDown = (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (isTypingTarget(event.target)) return;
    if (isDisabled()) return;

    if (MOVE_NEXT.has(event.key)) {
      event.preventDefault();
      setActive(activeIndex + 1, { scroll: true });
      return;
    }
    if (MOVE_PREV.has(event.key)) {
      event.preventDefault();
      setActive(Math.max(0, activeIndex - 1), { scroll: true });
      return;
    }
    const optionId = optionFromKey(event.key);
    if (optionId) {
      event.preventDefault();
      setActive(activeIndex);
      onPick(activeIndex, optionId);
    }
  };

  container.addEventListener('focusin', onPointer);
  container.addEventListener('pointerdown', onPointer);
  document.addEventListener('keydown', onKeyDown);
  paint();

  return {
    setActive,
    get activeIndex() {
      return activeIndex;
    },
    destroy() {
      container.removeEventListener('focusin', onPointer);
      container.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKeyDown);
    },
  };
}
