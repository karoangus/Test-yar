// ── کامپوننت‌های مشترک UI: تیکر، مودال، توست، نشان وضعیت، آیکن‌ها ────────────

import { h, clearEl } from './dom.js';
import { STATUS_LABEL, PHASE, PHASE_LABEL, currentPhase } from '../core/model.js';

// ── تیکر سراسری برای به‌روزرسانی تایمرها ────────────────────────────────────
let tickerHandle = null;
const tickerCallbacks = new Set();

function tick() {
  for (const cb of [...tickerCallbacks]) {
    try {
      cb();
    } catch {
      /* ignore */
    }
  }
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) tick();
  });
}

/** ثبت یک کال‌بک تیک؛ برآیند اشتراک برای توقف خودکار برمی‌گردد */
export function onTick(cb) {
  tickerCallbacks.add(cb);
  if (tickerHandle == null) tickerHandle = setInterval(tick, 250);
  return () => {
    tickerCallbacks.delete(cb);
    if (tickerCallbacks.size === 0 && tickerHandle != null) {
      clearInterval(tickerHandle);
      tickerHandle = null;
    }
  };
}

// ── مودال تأیید ──────────────────────────────────────────────────────────────
export function confirmDialog({
  title,
  message,
  confirmLabel = 'تأیید',
  cancelLabel = 'انصراف',
  danger = false,
} = {}) {
  return new Promise((resolve) => {
    const previouslyFocused = document.activeElement;
    let settled = false;

    const confirmBtn = h(
      'button',
      {
        class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`,
        type: 'button',
        onClick: () => settle(true),
      },
      confirmLabel,
    );
    const cancelBtn = h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => settle(false) }, cancelLabel);
    const focusables = [cancelBtn, confirmBtn];

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        settle(false);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        settle(true);
        return;
      }
      if (e.key === 'Tab') {
        // نگه‌داشتن تمرکز داخل مودال
        e.preventDefault();
        const current = document.activeElement;
        const idx = focusables.indexOf(current);
        const next = e.shiftKey ? focusables[(idx <= 0 ? focusables.length : idx) - 1] : focusables[(idx + 1) % focusables.length];
        next.focus();
      }
    };

    const settle = (value) => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      try {
        previouslyFocused?.focus?.();
      } catch {
        /* بی‌اهمیت */
      }
      resolve(value);
    };

    const overlay = h(
      'div',
      { class: 'modal-overlay', role: 'dialog', attrs: { 'aria-modal': 'true', 'aria-label': title } },
      h(
        'div',
        { class: 'modal-card' },
        h('h3', { class: 'modal-title' }, title),
        message ? h('p', { class: 'modal-message' }, message) : null,
        h('div', { class: 'modal-actions' }, cancelBtn, confirmBtn),
      ),
    );
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) settle(false);
    });
    document.addEventListener('keydown', onKey, true);
    document.body.append(overlay);
    confirmBtn.focus();
  });
}

// ── توست ─────────────────────────────────────────────────────────────────────
function toastStack() {
  let stack = document.getElementById('toast-stack');
  if (!stack) {
    stack = h('div', { class: 'toast-stack', attrs: { 'aria-live': 'polite', 'aria-atomic': 'false' } });
    document.body.append(stack);
  }
  return stack;
}

/**
 * نمایش پیام کوتاه. متن‌ها روی هم انبار می‌شوند و با کلیک بسته می‌شوند.
 * @param {string} message
 * @param {'info'|'success'|'error'} tone
 * @param {{duration?:number, action?:{label:string, onClick:Function}}} options
 * @returns {() => void} تابع بستن دستی
 */
export function toast(message, tone = 'info', { duration = 3200, action = null } = {}) {
  const el = h('div', {
    class: `toast toast-${tone}`,
    attrs: { role: 'status' },
  });
  el.append(h('span', { class: 'toast-text' }, message));
  let closed = false;
  let hideTimer = null;
  const close = () => {
    if (closed) return;
    closed = true;
    if (hideTimer) window.clearTimeout(hideTimer);
    el.classList.remove('toast-show');
    window.setTimeout(() => el.remove(), 260);
  };
  el.addEventListener('click', () => close());
  if (action) {
    el.append(
      h(
        'button',
        {
          class: 'toast-action',
          type: 'button',
          onClick: (e) => {
            e.stopPropagation();
            try {
              action.onClick();
            } finally {
              close();
            }
          },
        },
        action.label,
      ),
    );
    // پیام دارای دکمه دیرتر بسته می‌شود تا فرصت واکنش بماند
    duration = Math.max(duration, 6000);
  }
  toastStack().append(el);
  window.setTimeout(() => el.classList.add('toast-show'), 10);
  hideTimer = window.setTimeout(close, duration);
  return close;
}

// ── نشان وضعیت آزمون (وضعیت + فاز توقف) ─────────────────────────────────────
const PHASE_TONE = {
  [PHASE.READY]: 'tone-ready',
  [PHASE.RUNNING]: 'tone-running',
  [PHASE.PAUSED]: 'tone-paused',
  [PHASE.EXPIRED]: 'tone-finished',
  [PHASE.GRADING]: 'tone-finished',
  [PHASE.GRADED]: 'tone-graded',
};

export function statusBadge(examOrStatus, now = Date.now()) {
  const isExam = examOrStatus != null && typeof examOrStatus === 'object';
  const phase = isExam ? currentPhase(examOrStatus, now) : null;
  const status = isExam ? examOrStatus.status : examOrStatus;
  const tone = phase ? PHASE_TONE[phase] ?? 'tone-ready' : { created: 'tone-ready', in_progress: 'tone-running', time_up: 'tone-finished', awaiting_grading: 'tone-finished', graded: 'tone-graded' }[status] ?? 'tone-ready';
  const label = phase && PHASE_LABEL[phase] ? PHASE_LABEL[phase] : STATUS_LABEL[status] ?? status;
  return h('span', { class: `badge ${tone}` }, label);
}

// ── نوار پیشرفت تقسیم‌بندی‌شده (درست/غلط/نزده) ─────────────────────────────
export function splitBar({ correct, wrong, unanswered, total }) {
  const safeTotal = Math.max(1, total);
  return h(
    'div',
    { class: 'split-bar', attrs: { role: 'img', 'aria-label': 'نسبت پاسخ‌ها' } },
    h('div', { class: 'seg seg-correct', attrs: { style: `width:${(correct / safeTotal) * 100}%` } }),
    h('div', { class: 'seg seg-wrong', attrs: { style: `width:${(wrong / safeTotal) * 100}%` } }),
    h('div', { class: 'seg seg-none', attrs: { style: `width:${(unanswered / safeTotal) * 100}%` } }),
  );
}

/** گروه چیپ‌های انتخابی (برای فیلترها و مرتب‌سازی) */
export function segmented({ options, value, onChange, label = 'فیلتر' }) {
  const wrap = h('div', { class: 'segmented', attrs: { role: 'group', 'aria-label': label } });
  for (const opt of options) {
    const btn = h(
      'button',
      {
        class: `segmented-btn${opt.value === value ? ' is-active' : ''}`,
        type: 'button',
        dataset: { value: opt.value },
        attrs: { 'aria-pressed': opt.value === value ? 'true' : 'false' },
        onClick: () => onChange(opt.value),
      },
      opt.label,
    );
    wrap.append(btn);
  }
  return wrap;
}

/** نمایش یک کلید کیبورد */
export function kbd(label) {
  return h('kbd', { class: 'kbd' }, label);
}

// ── آیکن‌های SVG ─────────────────────────────────────────────────────────────
const ICON_PATHS = {
  plus: 'M12 5v14M5 12h14',
  clock: 'M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  home: 'M3 10.5 12 3l9 7.5M5 9.5V21h5v-6h4v6h5V9.5',
  trash: 'M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13',
  check: 'M4 12.5 9.5 18 20 6.5',
  doc: 'M7 3h7l5 5v13H7zM14 3v5h5',
  chart: 'M4 20V10M10 20V4M16 20v-8M20 20H2',
  pause: 'M9 5v14M15 5v14',
  play: 'M7 4.5 19 12 7 19.5z',
  search: 'M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM20 20l-4-4',
  download: 'M12 3v12m0 0 4.5-4.5M12 15l-4.5-4.5M4 19h16',
  upload: 'M12 15V3m0 0L7.5 7.5M12 3l4.5 4.5M4 19h16',
  sun: 'M12 5.5V3M12 21v-2.5M5.5 12H3M21 12h-2.5M7.4 7.4 5.6 5.6M18.4 18.4l-1.8-1.8M7.4 16.6l-1.8 1.8M18.4 5.6l-1.8 1.8M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8z',
  moon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  refresh: 'M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5',
  close: 'M6 6l12 12M18 6 6 18',
  edit: 'M4 20h4l10-10-4-4L4 16zM14.5 5.5l4 4',
  filter: 'M4 5h16l-6 7v6l-4 2v-8z',
  target: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0 3.5h.01',
  warning: 'M12 4 2.5 20h19zM12 10v4m0 3h.01',
  zap: 'M13 2 4 14h6l-1 8 9-12h-6z',
  undo: 'M4 10h9a5 5 0 0 1 0 10H8M4 10l4-4M4 10l4 4',
  flag: 'M6 21V4h12l-2.5 5L18 14H6',
  eye: 'M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12zm9.5-2.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z',
  menu: 'M4 7h16M4 12h16M4 17h16',
  sparkles: 'M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8zM18.5 15l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z',
};

export function icon(name, size = 20) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', ICON_PATHS[name] || '');
  svg.append(p);
  return svg;
}

// ── ابزارهای کاربردی ─────────────────────────────────────────────────────────

/** کپی متن در کلیپ‌بورد با بازگشت موفقیت */
export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* ادامه با روش جایگزین */
  }
  try {
    const area = h('textarea', { class: 'sr-only', attrs: { readonly: 'readonly' } });
    area.value = text;
    document.body.append(area);
    area.select();
    const ok = document.execCommand?.('copy');
    area.remove();
    return Boolean(ok);
  } catch {
    return false;
  }
}

/** دانلود یک فایل متنی (برای پشتیبان‌گیری) */
export function downloadTextFile(filename, text, mime = 'application/json;charset=utf-8') {
  try {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = h('a', { href: url, download: filename });
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  } catch {
    return false;
  }
}

/** انتخاب یک فایل متنی و خواندن محتوای آن */
export function pickTextFile(accept = '.json,application/json') {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', class: 'sr-only', attrs: { accept } });
    document.body.append(input);
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) {
        resolve(null);
        return;
      }
      try {
        resolve({ name: file.name, text: await file.text() });
      } catch {
        resolve(null);
      }
    });
    input.click();
  });
}

/** پاک‌سازی محتوای یک ظرف بدون حذف خود ظرف */
export { clearEl };

