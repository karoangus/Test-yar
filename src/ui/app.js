// ── پوستهٔ اصلی برنامه و اتصال مسیریاب به نماها ─────────────────────────────

import { parseHash, navigate } from './router.js';
import { clearEl, h } from './dom.js';
import { currentPhase, PHASE } from '../core/model.js';
import { homeView } from './views/home.js';
import { createView } from './views/create.js';
import { prepareView } from './views/prepare.js';
import { answersheetView } from './views/answersheet.js';
import { correctorView } from './views/corrector.js';
import { resultView } from './views/result.js';
import { historyView } from './views/history.js';

function notFoundView({ rootEl }) {
  const el = h(
    'main',
    { class: 'page' },
    h(
      'div',
      { class: 'empty-state' },
      h('h2', null, 'صفحه پیدا نشد'),
      h('p', null, 'نشانی وارد‌شده معتبر نیست.'),
      h('a', { class: 'btn btn-primary', href: '#/' }, 'بازگشت به خانه'),
    ),
  );
  rootEl.append(el);
  return () => el.remove();
}

export function createApp({ rootEl, store }) {
  let destroy = null;

  function render() {
    if (destroy) {
      destroy();
      destroy = null;
    }
    clearEl(rootEl);
    const route = parseHash(window.location.hash);
    const ctx = { rootEl, store, navigate, rerender: render };

    if (route.name === 'home') destroy = homeView(ctx);
    else if (route.name === 'new') destroy = createView(ctx);
    else if (route.name === 'history') destroy = historyView(ctx);
    else if (route.name === 'result') destroy = resultView({ ...ctx, exam: store.get(route.id) });
    else if (route.name === 'exam') {
      const exam = store.get(route.id);
      if (!exam) {
        destroy = notFoundView(ctx);
      } else {
        const phase = currentPhase(exam, Date.now());
        if (phase === PHASE.READY) destroy = prepareView({ ...ctx, exam });
        else if (phase === PHASE.RUNNING || phase === PHASE.PAUSED || phase === PHASE.EXPIRED) {
          destroy = answersheetView({ ...ctx, exam });
        } else if (phase === PHASE.GRADING) destroy = correctorView({ ...ctx, exam });
        else destroy = resultView({ ...ctx, exam });
      }
    } else destroy = notFoundView(ctx);

    try {
      if (typeof window.scrollTo === 'function') window.scrollTo({ top: 0, behavior: 'auto' });
    } catch {
      /* محیط‌های بدون اسکرول (مثل تست) */
    }
  }

  const onHash = () => render();
  window.addEventListener('hashchange', onHash);
  render();

  return {
    destroy() {
      window.removeEventListener('hashchange', onHash);
      if (destroy) destroy();
      destroy = null;
    },
  };
}
