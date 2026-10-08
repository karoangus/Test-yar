// ── کامپوننت‌های مشترک UI: تیکر سراسری، مودال، توست، نشان وضعیت ─────────────

import { h, clearEl } from './dom.js';
import { STATUS_LABEL } from '../core/model.js';

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

/** ثبت یک کالبک تیک؛ برآیند اشتراک برای توقف خودکار برمی‌گردد */
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
    let settled = false;
    const onKey = (e) => {
      if (e.key === 'Escape') settle(false);
    };
    const settle = (value) => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      resolve(value);
    };

    const confirmBtn = h(
      'button',
      {
        class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`,
        onClick: () => settle(true),
      },
      confirmLabel,
    );
    const cancelBtn = h('button', { class: 'btn btn-ghost', onClick: () => settle(false) }, cancelLabel);

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
    document.addEventListener('keydown', onKey);
    document.body.append(overlay);
    confirmBtn.focus();
  });
}

// ── توست ─────────────────────────────────────────────────────────────────────
export function toast(message, tone = 'info') {
  const el = h('div', { class: `toast toast-${tone}`, role: 'status' }, message);
  document.body.append(el);
  window.setTimeout(() => el.classList.add('toast-show'), 10);
  window.setTimeout(() => {
    el.classList.remove('toast-show');
    window.setTimeout(() => el.remove(), 300);
  }, 2600);
}

// ── نشان وضعیت آزمون ─────────────────────────────────────────────────────────
export function statusBadge(status) {
  const toneClass = {
    created: 'tone-ready',
    in_progress: 'tone-running',
    time_up: 'tone-finished',
    awaiting_grading: 'tone-finished',
    graded: 'tone-graded',
  }[status] || 'tone-ready';
  return h('span', { class: `badge ${toneClass}` }, STATUS_LABEL[status] ?? status);
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

// ── آیکن‌های SVG ─────────────────────────────────────────────────────────────
export function icon(name, size = 20) {
  const paths = {
    plus: 'M12 5v14M5 12h14',
    clock: 'M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
    list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
    home: 'M3 10.5 12 3l9 7.5M5 9.5V21h5v-6h4v6h5V9.5',
    trash: 'M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13',
    check: 'M4 12.5 9.5 18 20 6.5',
    doc: 'M7 3h7l5 5v13H7zM14 3v5h5',
    chart: 'M4 20V10M10 20V4M16 20v-8M20 20H2',
  };
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
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', paths[name] || '');
  svg.append(p);
  return svg;
}
