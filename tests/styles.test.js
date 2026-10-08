// تست نگهبان CSS — باگی که «سوال‌های آخر» را پنهان می‌کرد
//
// ریشهٔ باگ: انیمیشن ورود نماها با `animation-fill-mode: both` یک
// `transform: matrix(1,0,0,1,0,0)` (ماتریس همانی، نه `none`) روی `.view`
// باقی می‌گذاشت. هر عنصر دارای transform «حاوی‌کنندهٔ» عناصر position: fixed
// می‌شود؛ پس نوار پایین (`.sheet-footer`)، اورلی توقف/پایان زمان و دکمهٔ
// ساخت آزمون به انتهای کل سند پرت می‌شدند: آخرین سوال‌ها زیر نوار پنهان
// می‌شدند و دکمهٔ «پایان آزمون»/«اتمام تصحیح» در دید کاربر نبود.
//
// این تست همان قرارداد را تضمین می‌کند تا باگ برنگردد.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(path.join(ROOT, 'src/styles/app.css'), 'utf8');

/** متن یک قانون CSS با انتخابگر دقیق */
function rule(selector) {
  const re = new RegExp(`(^|\\})\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'm');
  const m = css.match(re);
  return m ? m[2] : null;
}

/** متن یک @keyframes با نام دقیق */
function keyframes(name) {
  const m = css.match(new RegExp(`@keyframes\\s+${name}\\s*\\{([\\s\\S]*?)\\n\\}`, 'm'));
  return m ? m[1] : null;
}

test('انیمیشن ورود نما هیچ transform روی .view نمی‌گذارد (باگ پنهان‌شدن سوال‌های آخر)', () => {
  const view = rule('.view');
  assert.ok(view, 'قانون .view پیدا شود');
  assert.equal(
    /(^|[;{\s])transform\s*:/.test(view),
    false,
    'transform روی .view ممنوع است؛ وگرنه نوار پایین و اورلی‌ها به انتهای سند پرت می‌شوند',
  );

  const frames = keyframes('view-in');
  assert.ok(frames, 'کی‌فریم view-in پیدا شود');
  assert.equal(
    /transform\s*:/.test(frames),
    false,
    'کی‌فریم ورود نباید transform داشته باشد (باقی‌ماندنش با fill-mode: both باعث باگ چیدمان می‌شد)',
  );
  assert.match(frames, /opacity/, 'ورود نما با شفافیت انجام می‌شود');
});

test('نوار پایین و اورلی‌ها واقعاً به پنجره می‌چسبند', () => {
  for (const selector of ['.sheet-footer', '.lock-overlay', '.fab']) {
    const block = rule(selector);
    assert.ok(block, `قانون ${selector} پیدا شود`);
    assert.match(block, /position\s*:\s*fixed/, `${selector} باید fixed باشد`);
  }
});

test('پایین صفحه برای نوار شناور جا باز می‌کند (آخرین سوال زیر نوار نرود)', () => {
  const app = rule('#app');
  assert.ok(app, 'قانون #app پیدا شود');
  const padding = app.match(/padding-bottom:\s*([^;]+);/)?.[1] ?? '';
  assert.match(padding, /\d+(px|rem)/, 'پدینگ پایین باید مقداری مشخص داشته باشد');
});

test('نوار پایین و سربرگ چسبان فضای امن موبایل را رعایت می‌کنند', () => {
  assert.match(rule('.sheet-footer') ?? '', /env\(safe-area-inset-bottom\)/);
  assert.match(rule('.sheet-top') ?? '', /position\s*:\s*sticky/);
});
