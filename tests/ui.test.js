// تست سرتاسری رابط کاربری با jsdom — سناریوهای ۱ تا ۱۳ از مسیر DOM واقعی
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html lang="fa" dir="rtl"><body><div id="app"></div></body></html>', {
  url: 'http://localhost:8080/',
});

// jsdom اسکرول ندارد؛ این‌ها به‌جای پیاده‌سازی واقعی جایش می‌مانند
dom.window.scrollTo = () => {};
dom.window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {};

global.window = dom.window;
global.document = dom.window.document;
global.Node = dom.window.Node;
global.Event = dom.window.Event;
global.HTMLElement = dom.window.HTMLElement;
global.localStorage = dom.window.localStorage;

const realNow = Date.now;
let fake = 1_700_000_000_000;
Date.now = () => fake;

const { createAppStore } = await import('../src/core/store.js');
const { createApp } = await import('../src/ui/app.js');
const { THEME_KEY } = await import('../src/ui/theme.js');

const W = dom.window;
const click = (el) => el.dispatchEvent(new W.Event('click', { bubbles: true, cancelable: true }));
const key = (k) => document.dispatchEvent(new W.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
const settle = () => new Promise((r) => setTimeout(r, 10));
// انتظار واقعی برای رسیدن یک تیک تایمر (فاصلهٔ تیکر ۲۵۰ میلی‌ثانیه است)
const nextTick = () => new Promise((r) => setTimeout(r, 320));
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const text = (sel) => ($(sel)?.textContent ?? '').trim();
const buttonWith = (sel, label) => $$(sel).find((b) => b.textContent.includes(label));

const store = createAppStore();
let app = createApp({ rootEl: document.getElementById('app'), store });

/** مخزن تازه با حافظهٔ پاک (تا دادهٔ تست‌های قبلی روی هم انبار نشود) */
function freshStore() {
  W.localStorage.clear();
  return createAppStore();
}

test('سناریو کامل UI: ساخت → شروع → پاسخ → قفل → تصحیح → نتیجه → تاریخچه', async () => {
  // ── صفحه اصلی ──
  assert.equal(text('.brand h1'), 'تست‌یار');
  assert.ok($('.empty-state'), 'حالت خالی نمایش داده شود');

  // ── ساخت آزمون با اعتبارسنجی ──
  W.location.hash = '#/new';
  await settle();
  assert.ok($('#f-name'), 'فرم ساخت باز شود');

  // نام خالی → خطا
  $('#f-name').value = '';
  $('#f-count').value = '20';
  $('#f-duration').value = '30';
  $('.form-card').dispatchEvent(new W.Event('submit', { bubbles: true, cancelable: true }));
  await settle();
  assert.match(text('.field-error'), /نام آزمون/, 'خطای نام خالی');

  // ورودی معتبر (با استفاده از چیپ‌های آماده)
  $('#f-name').value = 'آزمون درس اول عربی';
  $('#f-count').value = '۲۰'; // ارقام فارسی هم پذیرفته شود
  $('#f-duration').value = '30';
  $('.form-card').dispatchEvent(new W.Event('submit', { bubbles: true, cancelable: true }));
  await settle();
  await settle();

  // ── صفحه آماده‌سازی: تایمر هنوز شروع نشده ──
  assert.match(text('.page-header h2'), /آماده‌ای؟/);
  const exams = store.all();
  assert.equal(exams.length, 1);
  const exam = exams[0];
  assert.equal(exam.status, 'created', 'پیش از شروع، وضعیت ساخته‌شده و تایمر صفر');
  assert.equal(exam.startedAt, null);
  assert.ok(text('.info-grid').includes('۱ · ۲ · ۳ · ۴'), 'گزینه‌ها عددی نمایش داده می‌شوند');

  // ── شروع آزمون با تأییدیه ──
  const startBtn = $$('.btn-xl').find((b) => b.textContent.includes('شروع آزمون'));
  click(startBtn);
  await settle();
  assert.match(text('.modal-title'), /آماده‌ای؟/, 'مودال تأیید شروع');
  const confirmStart = $$('.modal-actions .btn').find((b) => b.textContent.includes('شروع آزمون'));
  click(confirmStart);
  await settle();
  await settle();

  // ── پاسخ‌برگ ──
  assert.equal($$('.question-card').length, 20, 'بیست سوال رندر شود');
  assert.match(text('[data-clock]'), /⏱/, 'تایمر بالای صفحه');
  assert.match(text('[data-clock]'), /۳۰:۰۰|۲۹:۵۹/, 'شمارش معکوس از سی دقیقه');
  assert.deepEqual($$('.question-card')[0].querySelectorAll('.option-num').length && $$('.question-card')[0].querySelectorAll('.option-num'), $$('.question-card')[0].querySelectorAll('.option-num'), 'چهار گزینه');
  assert.deepEqual(
    [...$$('.question-card')[0].querySelectorAll('.option-num')].map((el) => el.textContent),
    ['۱', '۲', '۳', '۴'],
    'برچسب گزینه‌ها عددی است',
  );
  assert.equal(document.body.textContent.includes('گزینه الف'), false, 'حروف الف/ب/ج/د حذف شده‌اند');

  // پاسخ به ۱۸ سوال (گزینهٔ اول) و تغییر پاسخ سوال ۲
  const cards = $$('.question-card');
  for (let i = 0; i < 18; i += 1) {
    click(cards[i].querySelector('.option-btn[data-opt="A"]'));
  }
  // تغییر پاسخ سوال ۲ تا پیش از پایان مجاز است
  click(cards[1].querySelector('.option-btn[data-opt="C"]'));
  click(cards[1].querySelector('.option-btn[data-opt="A"]'));
  await settle();
  assert.match(text('[data-count]'), /۱۸/, 'شمارندهٔ پاسخ‌ها');
  assert.ok(cards[1].querySelector('.option-btn[data-opt="A"]').classList.contains('option-selected'));

  // ── سناریو ۵: پایان زمان → قفل و overlay ──
  fake += 31 * 60_000;
  store.refresh();
  await settle();
  assert.ok($('.lock-overlay'), 'اورلی تمام‌صفحه');
  assert.match(text('.lock-card h2'), /زمان آزمون تمام شد/);
  assert.match(text('.lock-card p'), /پاسخ‌گویی به پایان رسید/);
  assert.ok($$('.option-btn').every((b) => b.disabled), 'همهٔ گزینه‌ها غیرفعال');
  const before = { ...store.get(exam.id).answers };
  click($('.option-btn')); // تلاش برای تغییر پاسخ
  await settle();
  assert.deepEqual(store.get(exam.id).answers, before, 'پاسخ‌ها قابل تغییر نیستند');

  // ── ورود به تصحیح‌کننده ──
  click($$('.lock-card .btn').find((b) => b.textContent.includes('ورود به تصحیح‌کننده')));
  await settle();
  await settle();
  assert.match(text('.sheet-name'), /تصحیح‌کننده/);

  // اتمام تصحیح بدون کلید → هشدار با شمارهٔ سوال‌ها
  click($$('.sheet-footer .btn').find((b) => b.textContent.includes('اتمام تصحیح')));
  await settle();
  assert.match(text('.warning-banner strong'), /کلید همهٔ سوالات را وارد نکرده‌اید/);
  assert.equal($$('.missing-chips .nav-chip').length, 20, 'بیست سوال بدون کلید');

  // فیلتر «بدون کلید» و بازگشت به «همه»
  const missingFilter = $$('.segmented-btn').find((b) => b.textContent.includes('بدون کلید'));
  click(missingFilter);
  await settle();
  assert.equal($$('.question-card').length, 20, 'فیلتر بدون کلید همهٔ سوال‌ها را نشان می‌دهد');

  // وارد کردن کلید برای هر ۲۰ سوال: ۱۴ درست + ۴ غلط + ۲ سوالِ نزده با کلید
  const keyCards = $$('.question-card');
  for (let i = 0; i < 20; i += 1) click(keyCards[i].querySelector('.option-btn[data-opt="A"]'));
  for (let i = 14; i < 18; i += 1) click(keyCards[i].querySelector('.option-btn[data-opt="B"]'));
  await settle();
  assert.ok($('.warning-banner').hidden, 'با تکمیل کلید هشدار پنهان شود');

  click($$('.sheet-footer .btn').find((b) => b.textContent.includes('اتمام تصحیح')));
  await settle();
  await settle();

  // ── سناریو ۹ + صفحه نتیجه ──
  assert.match(text('.result-name'), /آزمون درس اول عربی/);
  assert.ok(document.body.textContent.includes('۷۰٪'), 'درصد بدون نمره منفی ۷۰٪');
  assert.ok(document.body.textContent.includes('۶۳٫۳۳٪'), 'درصد با نمره منفی ۶۳٫۳۳٪');
  const statValues = $$('.stat-value').map((e) => e.textContent.trim());
  assert.deepEqual(statValues, ['۲۰', '۱۴', '۴', '۲']);
  assert.ok($('.split-bar'), 'نمودار نسبت پاسخ‌ها');

  // ── تاریخچه ──
  W.location.hash = '#/history';
  await settle();
  const historyText = $('.history-list').textContent;
  assert.ok(historyText.includes('۶۳٫۳۳٪'), 'درصد در تاریخچه');
  assert.ok(historyText.includes('آزمون درس اول عربی'));
});

test('سناریو ۶ و ۷: بستن و بازکردن برنامه وسط آزمون و بعد از پایان', async () => {
  // آزمون دوم وسط جریان
  const exam2 = store.addExam({ name: 'ریاضی', questionCount: 10, durationMinutes: 30, category: 'ریاضی و آمار' });
  store.startExam(exam2.id);
  store.setAnswer(exam2.id, 0, 'B');
  fake += 5 * 60_000;

  // «بستن برنامه»: نابودی اپ و ساخت دوباره
  app.destroy();
  const store2 = createAppStore();
  app = createApp({ rootEl: document.getElementById('app'), store: store2 });
  W.location.hash = `#/exam/${exam2.id}`;
  await settle();
  await settle();
  assert.equal($$('.question-card').length, 10, 'ادامهٔ آزمون پس از بازگشایی');
  assert.match(text('[data-clock]'), /۲۵:۰۰|۲۴:۵۹/, 'زمان واقعی باقی‌مانده');
  assert.ok($('.option-btn[data-opt="B"]').classList.contains('option-selected'), 'پاسخ قبلی حفظ شده');

  // «بازکردن بعد از پایان زمان»: مستقیم قفل
  fake += 40 * 60_000;
  app.destroy();
  const store3 = createAppStore();
  app = createApp({ rootEl: document.getElementById('app'), store: store3 });
  W.location.hash = '#/';
  await settle();
  W.location.hash = `#/exam/${exam2.id}`;
  await settle();
  await settle();
  assert.ok($('.lock-overlay'), 'سناریو ۷: قفل فوری پس از بازگشایی');
  assert.match(text('.lock-card h2'), /زمان آزمون تمام شد/);
});

test('سناریو ۸: پایان دستی زودتر از موعد از مسیر UI', async () => {
  const created = store.addExam({ name: 'تاریخ', questionCount: 5, durationMinutes: 60, category: 'تاریخ' });
  // راه‌اندازی تازهٔ اپ تا مخزن جدید، آزمون را از حافظهٔ پایدار بخواند
  app.destroy();
  const store4 = createAppStore();
  app = createApp({ rootEl: document.getElementById('app'), store: store4 });
  const exam3 = store4.get(created.id);
  assert.ok(exam3);
  W.location.hash = `#/exam/${exam3.id}`;
  await settle();
  const startBtn = $$('.btn-xl').find((b) => b.textContent.includes('شروع آزمون'));
  click(startBtn);
  await settle();
  click($$('.modal-actions .btn').find((b) => b.textContent.includes('شروع آزمون')));
  await settle();
  await settle();

  // پایان آزمون + تأییدیه
  click($$('.sheet-footer .btn').find((b) => b.textContent.includes('پایان آزمون')));
  await settle();
  assert.match(text('.modal-title'), /مطمئن/);
  // گزینهٔ «ادامه آزمون» باید بسته نگه دارد
  click($$('.modal-actions .btn').find((b) => b.textContent.includes('ادامه آزمون')));
  await settle();
  assert.equal($$('.question-card').length, 5, 'آزمون ادامه دارد');

  click($$('.sheet-footer .btn').find((b) => b.textContent.includes('پایان آزمون')));
  await settle();
  click($$('.modal-actions .btn').find((b) => b.textContent.includes('پایان آزمون')));
  await settle();
  await settle();
  assert.match(text('.sheet-name'), /تصحیح‌کننده/, 'ورود به تصحیح پس از پایان دستی');
});

test('سناریو ۱۰: توقف و ادامهٔ تایمر از مسیر UI (زمان در حین توقف مصرف نمی‌شود)', async () => {
  app.destroy();
  const pauseStore = freshStore();
  app = createApp({ rootEl: document.getElementById('app'), store: pauseStore });

  const exam = pauseStore.addExam({ name: 'آزمون توقف', questionCount: 4, durationMinutes: 10, category: 'منطق' });
  pauseStore.startExam(exam.id);
  W.location.hash = `#/exam/${exam.id}`;
  await settle();
  await settle();
  assert.equal($$('.question-card').length, 4);

  // ۲ دقیقه پاسخ می‌دهیم، بعد تایمر را متوقف می‌کنیم
  fake += 2 * 60_000;
  pauseStore.setAnswer(exam.id, 0, 'A');
  click(buttonWith('.sheet-footer .btn', 'توقف تایمر'));
  await settle();
  await settle();

  assert.ok($('.pause-overlay'), 'اورلی توقف نمایش داده شود');
  assert.match(text('.pause-card h2'), /تایمر متوقف شد/);
  assert.match(text('[data-clock]'), /⏸/, 'نشانگر توقف روی تایمر');
  assert.ok($$('.option-btn').every((b) => b.disabled), 'در حین توقف پاسخ‌دهی ممکن نیست');
  assert.equal(pauseStore.get(exam.id).pausedAt, fake);

  // پاسخ‌دهی در حین توقف رد می‌شود
  pauseStore.setAnswer && assert.throws(() => pauseStore.setAnswer(exam.id, 1, 'B'));
  assert.equal(pauseStore.get(exam.id).answers[1], undefined);

  // ۲۰ دقیقه بعد برمی‌گردیم: همان ۸ دقیقه باقی است
  fake += 20 * 60_000;
  pauseStore.refresh();
  await nextTick();
  assert.match(text('[data-clock]'), /۰۸:۰۰|۰۷:۵۹/, 'زمان در حین توقف مصرف نشده');
  assert.equal(pauseStore.get(exam.id).status, 'in_progress', 'آزمون به‌خاطر توقف منقضی نشده');

  // ادامهٔ آزمون
  click(buttonWith('.pause-card .btn', 'ادامهٔ آزمون'));
  await settle();
  await settle();
  assert.equal($('.pause-overlay'), null, 'اورلی توقف بسته شود');
  assert.equal(pauseStore.get(exam.id).pausedAt, null);
  assert.equal(pauseStore.get(exam.id).pausedTotalMs, 20 * 60_000);
  assert.equal(pauseStore.get(exam.id).pauseCount, 1);
  assert.match(text('[data-clock]'), /۰۸:۰۰|۰۷:۵۹/);
  assert.equal($('.option-btn').disabled, false, 'پاسخ‌دهی دوباره آزاد است');

  // پاسخ جدید ثبت می‌شود و زمان جلو می‌رود
  click($$('.question-card')[1].querySelector('.option-btn[data-opt="B"]'));
  await settle();
  assert.equal(pauseStore.get(exam.id).answers[1], 'B');
  fake += 60_000;
  pauseStore.refresh();
  await nextTick();
  assert.match(text('[data-clock]'), /۰۷:۰۰|۰۶:۵۹/, 'شمارش معکوس پس از ادامه برمی‌گردد');

  // توقف دوم و پایان دستی از همان overlay
  click(buttonWith('.sheet-footer .btn', 'توقف تایمر'));
  await settle();
  await settle();
  assert.ok($('.pause-overlay'));
  click(buttonWith('.pause-card .btn', 'پایان آزمون'));
  await settle();
  click(buttonWith('.modal-actions .btn', 'پایان آزمون'));
  await settle();
  await settle();
  assert.match(text('.sheet-name'), /تصحیح‌کننده/, 'پس از پایان دستی به تصحیح می‌رویم');
  const finished = pauseStore.get(exam.id);
  assert.equal(finished.pausedAt, null);
  assert.equal(finished.pauseCount, 2);
});

test('سناریو ۱۱: میان‌بُرهای کیبورد ۱ تا ۴ و جابه‌جایی با کلید‌های جهت‌دار', async () => {
  app.destroy();
  const kbStore = freshStore();
  app = createApp({ rootEl: document.getElementById('app'), store: kbStore });

  const exam = kbStore.addExam({ name: 'آزمون کیبورد', questionCount: 3, durationMinutes: 20, category: 'منطق' });
  kbStore.startExam(exam.id);
  W.location.hash = `#/exam/${exam.id}`;
  await settle();
  await settle();

  assert.ok($$('.question-card')[0].classList.contains('question-active'), 'سوال فعال برجسته می‌شود');
  key('۳');
  await settle();
  assert.equal(kbStore.get(exam.id).answers[0], 'C', 'کلید ۳ گزینهٔ سوم را انتخاب می‌کند');
  key('۱');
  assert.equal(kbStore.get(exam.id).answers[0], 'A');

  key('ArrowDown');
  await settle();
  assert.ok($$('.question-card')[1].classList.contains('question-active'));
  key('۴');
  assert.equal(kbStore.get(exam.id).answers[1], 'D', 'گزینهٔ چهارم برای سوال فعال ثبت شد');
  key('ArrowUp');
  await settle();
  assert.ok($$('.question-card')[0].classList.contains('question-active'));
  assert.equal($$('.question-card')[1].classList.contains('question-active'), false);

  // کلید نامربوط کاری نمی‌کند
  const before = { ...kbStore.get(exam.id).answers };
  key('q');
  key('Enter');
  assert.deepEqual(kbStore.get(exam.id).answers, before);

  // پاک‌کردن پاسخ از دکمهٔ کارت
  click($$('.question-card')[0].querySelector('.btn-clear'));
  await settle();
  assert.equal(kbStore.get(exam.id).answers[0], undefined);
  assert.equal($$('.question-card')[0].querySelector('.btn-clear').hidden, true);
});

test('سناریو ۱۲: تغییر تم روشن/تیره و ماندگاری آن', async () => {
  app.destroy();
  const themeStore = freshStore();
  app = createApp({ rootEl: document.getElementById('app'), store: themeStore });
  W.location.hash = '#/';
  await settle();

  const before = document.documentElement.dataset.theme;
  click($('.app-header .btn-icon'));
  await settle();
  const after = document.documentElement.dataset.theme;
  assert.notEqual(after, before, 'تم تغییر می‌کند');
  assert.ok(['light', 'dark'].includes(after));
  assert.equal(W.localStorage.getItem(THEME_KEY), after, 'انتخاب کاربر ذخیره می‌شود');

  // صفحه‌های دیگر هم تم فعلی را نشان می‌دهند
  W.location.hash = '#/history';
  await settle();
  assert.equal(document.documentElement.dataset.theme, after, 'تم در ناوبری حفظ می‌شود');
});

test('سناریو ۱۳: جست‌وجو، فیلتر، تکرار و حذف با بازگردانی در تاریخچه', async () => {
  app.destroy();
  const hStore = freshStore();
  app = createApp({ rootEl: document.getElementById('app'), store: hStore });

  const a = hStore.addExam({ name: 'زیست‌شناسی فصل ۱', questionCount: 5, durationMinutes: 10, category: 'علوم و فنون' });
  hStore.addExam({ name: 'عربی درس ۳', questionCount: 6, durationMinutes: 12, category: 'عربی' });
  W.location.hash = '#/history';
  await settle();
  assert.equal($$('.history-card').length, 2, 'هر دو آزمون نمایش داده می‌شوند');

  // جست‌وجو
  const search = $('.search-input');
  search.value = 'عربی';
  search.dispatchEvent(new W.Event('input', { bubbles: true }));
  await settle();
  assert.equal($$('.history-card').length, 1);
  assert.match(text('.history-card .card-title'), /عربی درس ۳/);

  // پاک‌کردن جست‌وجو + فیلتر وضعیت
  const search2 = $('.search-input');
  search2.value = '';
  search2.dispatchEvent(new W.Event('input', { bubbles: true }));
  await settle();
  assert.equal($$('.history-card').length, 2);

  click($$('.segmented-btn').find((b) => b.textContent.includes('تصحیح‌شده')));
  await settle();
  assert.equal($$('.history-card').length, 0, 'آزمونی تصحیح نشده است');
  assert.match(text('.empty-state h2'), /پیدا نشد/);
  click($$('.segmented-btn').find((b) => b.textContent.trim() === 'همه'));
  await settle();
  assert.equal($$('.history-card').length, 2);

  // تکرار آزمون
  const dupButtons = $$('.history-actions .btn-icon').filter((b) => b.getAttribute('aria-label')?.startsWith('تکرار'));
  assert.equal(dupButtons.length, 2, 'برای هر کارت دکمهٔ تکرار هست');
  click(dupButtons[0]);
  await settle();
  await settle();
  assert.equal(hStore.all().length, 3, 'آزمون تکرار شد');
  assert.match(text('.prepare-title'), /تکرار/, 'به صفحهٔ آماده‌سازی آزمون تازه می‌رویم');

  // حذف + بازگردانی
  W.location.hash = '#/history';
  await settle();
  const delButtons = $$('.history-actions .btn-icon').filter((b) => b.getAttribute('aria-label')?.startsWith('حذف'));
  const targetName = delButtons[0].closest('.history-card').querySelector('.card-title').textContent;
  click(delButtons[0]);
  await settle();
  assert.match(text('.modal-title'), /حذف آزمون/);
  click(buttonWith('.modal-actions .btn', 'حذف'));
  await settle();
  await settle();
  assert.equal(hStore.all().length, 2, 'آزمون حذف شد');
  assert.equal(hStore.all().some((e) => e.name === targetName), false);

  const undo = buttonWith('.toast-action', 'بازگردانی');
  assert.ok(undo, 'پیام بازگردانی نمایش داده می‌شود');
  click(undo);
  await settle();
  assert.equal(hStore.all().length, 3, 'آزمون بازگردانده شد');
  assert.ok(hStore.all().some((e) => e.name === targetName));

  assert.ok(buttonWith('.toolbar .btn', 'پشتیبان‌گیری'), 'دکمهٔ پشتیبان‌گیری موجود است');
  assert.ok(buttonWith('.toolbar .btn', 'بازگردانی پشتیبان'), 'دکمهٔ بازگردانی پشتیبان موجود است');

  // آزمون در جریان با تایمر زنده روی کارت
  hStore.startExam(a.id);
  W.location.hash = '#/';
  await settle();
  W.location.hash = '#/history';
  await settle();
  assert.match(text('[data-history-timer]'), /⏱/, 'تایمر آزمون در جریان روی کارت تاریخچه');
});

test('سناریو ۱۴: آمار زمان و توقف‌ها در صفحهٔ نتیجه + تکرار آزمون', async () => {
  app.destroy();
  const rStore = freshStore();
  app = createApp({ rootEl: document.getElementById('app'), store: rStore });
  W.location.hash = '#/';
  await settle();

  const exam = rStore.addExam({ name: 'نتیجه با توقف', questionCount: 4, durationMinutes: 10, category: 'اقتصاد' });
  rStore.startExam(exam.id);
  rStore.setAnswer(exam.id, 0, 'A');
  rStore.setAnswer(exam.id, 1, 'B');
  rStore.setAnswer(exam.id, 2, 'C');
  fake += 60_000;
  rStore.pauseExam(exam.id);
  fake += 2 * 60_000;
  rStore.resumeExam(exam.id);
  fake += 30_000;
  rStore.endExamManually(exam.id);
  for (let i = 0; i < 4; i += 1) rStore.setKeyEntry(exam.id, i, i === 3 ? 'A' : i === 1 ? 'A' : ['A', 'A', 'C', 'A'][i]);
  const done = rStore.finishGrading(exam.id);
  assert.equal(done.ok, true);

  W.location.hash = `#/exam/${exam.id}/result`;
  await settle();
  const body = document.body.textContent;
  assert.match(body, /مجموع توقف تایمر/);
  assert.match(body, /۲ دقیقه/, 'مدت توقف در کارنامه');
  assert.match(body, /تعداد توقف‌ها/);
  assert.match(body, /نمره|از ۲۰/, 'نمرهٔ ۲۰ نمایش داده می‌شود');
  assert.equal($$('.stat-value').length, 4);

  // فیلتر مرور پاسخ‌ها
  click($$('.segmented-btn').find((b) => b.textContent.includes('نزده‌ها')));
  await settle();
  const visible = $$('.review-row').filter((r) => !r.hidden);
  assert.equal(visible.length, 1, 'فقط سوال بی‌پاسخ نمایش داده می‌شود');
  click($$('.segmented-btn').find((b) => b.textContent.includes('غلط‌ها')));
  await settle();
  assert.equal($$('.review-row').filter((r) => !r.hidden).length, 1, 'یک پاسخ غلط');
  click($$('.segmented-btn').find((b) => b.textContent.includes('درست‌ها')));
  await settle();
  assert.equal($$('.review-row').filter((r) => !r.hidden).length, 2, 'دو پاسخ درست');
  click($$('.segmented-btn').find((b) => b.textContent.trim() === 'همه'));
  await settle();
  assert.equal($$('.review-row').filter((r) => !r.hidden).length, 4);

  // تکرار آزمون از صفحهٔ نتیجه
  click(buttonWith('.result-actions .btn', 'تکرار آزمون'));
  await settle();
  await settle();
  assert.match(text('.prepare-title'), /تکرار|نتیجه/);
  assert.equal(rStore.all().length, 2);
});

test('پاک‌سازی: بازگرداندن Date.now و نابودی اپ', () => {
  app.destroy();
  Date.now = realNow;
  assert.ok(true);
});
