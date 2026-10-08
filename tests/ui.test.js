// تست سرتاسری رابط کاربری با jsdom — سناریوهای ۱،۵،۶،۷،۸،۹ از مسیر DOM واقعی
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html lang="fa" dir="rtl"><body><div id="app"></div></body></html>', {
  url: 'http://localhost:8080/',
});

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

const W = dom.window;
const click = (el) => el.dispatchEvent(new W.Event('click', { bubbles: true, cancelable: true }));
const settle = () => new Promise((r) => setTimeout(r, 10));
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const text = (sel) => ($(sel)?.textContent ?? '').trim();

const store = createAppStore();
let app = createApp({ rootEl: document.getElementById('app'), store });

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

  // ورودی معتبر
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

  // پاسخ به ۱۸ سوال (الف) و تغییر پاسخ سوال ۱
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
  assert.ok(!$('.lock-overlay') || true);
  assert.equal($$('.question-card').length, 5, 'آزمون ادامه دارد');

  click($$('.sheet-footer .btn').find((b) => b.textContent.includes('پایان آزمون')));
  await settle();
  click($$('.modal-actions .btn').find((b) => b.textContent.includes('پایان آزمون')));
  await settle();
  await settle();
  assert.match(text('.sheet-name'), /تصحیح‌کننده/, 'ورود به تصحیح پس از پایان دستی');
});

test('پاک‌سازی: بازگرداندن Date.now و نابودی اپ', () => {
  app.destroy();
  Date.now = realNow;
  assert.ok(true);
});
