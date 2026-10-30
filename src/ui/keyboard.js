// ── میان‌بُرهای کیبورد و مدیریت سوال فعال برای پاسخ‌برگ و تصحیح‌کننده ───────────
// ۱ تا ۴ (یا 1 تا 4) → انتخاب گزینه برای سوال فعال
// ۰ (یا 0)           → رد کردن سوال فعلی (بدون پاسخ) و رفتن به سوال بعدی
// ↑ / ↓ (یا k / j)    → جابه‌جایی بین سوال‌ها
// سوال فعال با کلاس question-active (کادر زرد متحرک) برجسته می‌شود.

import { optionFromKey } from '../core/scoring.js';

const MOVE_NEXT = new Set(['ArrowDown', 'j', 'J']);
const MOVE_PREV = new Set(['ArrowUp', 'k', 'K']);
const SKIP_KEYS = new Set(['0', '۰', '٠']);

function isTypingTarget(target) {
  if (!target || typeof target !== 'object') return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return target.isContentEditable === true;
}

/**
 * نصب میان‌بُرها و ردیابی سوال فعال روی یک کانتینر.
 * @param {object} options
 * @param {HTMLElement} options.container کانتینر نما
 * @param {string} [options.cardSelector] انتخابگر کارت سوال
 * @param {string} [options.indexAttr] نام dataset برای ایندکس سوال
 * @param {number} [options.initialIndex] شمارهٔ سوال اولیه (پیش‌فرض ۰ = سوال اول)
 * @param {(index:number, optionId:string)=>void} options.onPick انتخاب گزینه
 * @param {(index:number)=>void} [options.onSkip] رد کردن سوال فعلی بدون پاسخ
 * @param {()=>boolean} [options.isDisabled] آیا میان‌بُرها غیرفعال باشند؟
 * @param {(nextIndex:number, prevIndex:number)=>void} [options.onMove] پس از جابه‌جایی سوال فعال
 */
export function attachQuestionShortcuts({
  container,
  cardSelector = '.question-card',
  indexAttr = 'q',
  initialIndex = 0,
  onPick,
  onSkip = null,
  isDisabled = () => false,
  onMove = null,
}) {
  let activeIndex = Number.isInteger(initialIndex) && initialIndex >= 0 ? initialIndex : 0;
  let ignoreScrollUntil = 0;

  function allCards() {
    return Array.from(container.querySelectorAll(cardSelector));
  }

  function maxIndex() {
    let max = 0;
    for (const card of allCards()) {
      const idx = Number(card.getAttribute(`data-${indexAttr}`));
      if (Number.isInteger(idx) && idx > max) max = idx;
    }
    return max;
  }

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
    for (const card of allCards()) {
      const index = Number(card.getAttribute(`data-${indexAttr}`));
      card.classList.toggle('question-active', index === activeIndex);
    }
  }

  function setActive(index, { scroll = false } = {}) {
    const prevIndex = activeIndex;
    const clamped = Math.max(0, Math.min(maxIndex(), Number.isInteger(index) && index >= 0 ? index : 0));
    activeIndex = clamped;
    paint();
    if (scroll) {
      ignoreScrollUntil = Date.now() + 600;
      const card = cardAt(activeIndex);
      if (card && typeof card.scrollIntoView === 'function') {
        try {
          card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch {
          /* محیط‌های بدون پشتیبانی */
        }
      }
    }
    if (onMove && prevIndex !== activeIndex) onMove(activeIndex, prevIndex);
  }

  const onPointer = (event) => {
    // اگر روی دکمهٔ رد کردن کلیک شده، اجازه بده هندلر خود دکمه به سوال بعدی برود
    if (event.target instanceof Element && event.target.closest('[data-skip]')) return;
    const index = cardIndexFromEvent(event);
    if (index != null) setActive(index);
  };

  const onScroll = () => {
    if (Date.now() < ignoreScrollUntil) return;
    if (isDisabled()) return;
    const cards = allCards();
    if (cards.length === 0) return;
    const firstRect = cards[0].getBoundingClientRect?.();
    if (!firstRect || firstRect.height === 0) return; // در محیط‌های غیرگرافیکی (JSDOM) نادیده بگیر
    const viewportH = window.innerHeight || document.documentElement.clientHeight || 800;
    for (const card of cards) {
      const rect = card.getBoundingClientRect();
      if (rect.bottom > 155 && rect.top < viewportH * 0.68) {
        const idx = Number(card.getAttribute(`data-${indexAttr}`));
        if (Number.isInteger(idx) && idx !== activeIndex) {
          setActive(idx, { scroll: false });
        }
        break;
      }
    }
  };

  const onKeyDown = (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (isTypingTarget(event.target)) return;
    if (isDisabled()) return;

    if (SKIP_KEYS.has(event.key)) {
      event.preventDefault();
      if (onSkip) onSkip(activeIndex);
      else setActive(activeIndex + 1, { scroll: true });
      return;
    }
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
      const targetIndex = activeIndex;
      onPick(targetIndex, optionId);
    }
  };

  container.addEventListener('focusin', onPointer);
  container.addEventListener('pointerdown', onPointer);
  document.addEventListener('keydown', onKeyDown);
  window.addEventListener('scroll', onScroll, { passive: true });
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
      window.removeEventListener('scroll', onScroll);
    },
  };
}
