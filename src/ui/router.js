// ── مسیریاب مبتنی بر hash ────────────────────────────────────────────────────

export function parseHash(hash) {
  const clean = String(hash || '').replace(/^#/, '');
  const parts = clean.split('/').filter(Boolean);
  if (parts.length === 0) return { name: 'home' };
  if (parts[0] === 'new') return { name: 'new' };
  if (parts[0] === 'history') return { name: 'history' };
  if (parts[0] === 'exam' && parts[1]) {
    const id = decodeURIComponent(parts[1]);
    if (parts[2] === 'result') return { name: 'result', id };
    return { name: 'exam', id };
  }
  return { name: 'home' };
}

export function navigate(path) {
  const target = path.startsWith('#') ? path : `#${path}`;
  if (window.location.hash === target) {
    window.dispatchEvent(new Event('hashchange'));
  } else {
    window.location.hash = target;
  }
}
