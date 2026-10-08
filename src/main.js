// ── نقطهٔ ورود برنامه ───────────────────────────────────────────────────────

import { createAppStore } from './core/store.js';
import { createApp } from './ui/app.js';
import { initPwa } from './ui/pwa.js';
import { initTheme } from './ui/theme.js';

initTheme(); // تم پیش از نخستین رندر اعمال می‌شود تا پرش رنگ نداشته باشیم

const store = createAppStore();
initPwa();
createApp({ rootEl: document.getElementById('app'), store });
