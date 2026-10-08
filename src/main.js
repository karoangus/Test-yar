// ── نقطهٔ ورود برنامه ───────────────────────────────────────────────────────

import { createAppStore } from './core/store.js';
import { createApp } from './ui/app.js';
import { initPwa } from './ui/pwa.js';

const store = createAppStore();
initPwa();
createApp({ rootEl: document.getElementById('app'), store });
