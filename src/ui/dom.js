// ── ابزار ساخت عناصر DOM ─────────────────────────────────────────────────────

/**
 * ساخت عنصر با props و فرزندان.
 * props پشتیبانی‌شده: class, dataset, attrs, text و هر رویداد onX.
 */
export function h(tag, props = null, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value == null) continue;
      if (key === 'class') el.className = value;
      else if (key === 'dataset') {
        for (const [dk, dv] of Object.entries(value)) el.dataset[dk] = dv;
      } else if (key === 'attrs') {
        for (const [ak, av] of Object.entries(value)) el.setAttribute(ak, av);
      } else if (key === 'text') el.textContent = value;
      else if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), value);
      } else el[key] = value;
    }
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

export function clearEl(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

/** پیمایش به یک عنصر با اسکرول نرم */
export function scrollToEl(el) {
  if (el && typeof el.scrollIntoView === 'function') {
    try {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch {
      /* محیط‌های بدون پشتیبانی اسکرول */
    }
  }
}
