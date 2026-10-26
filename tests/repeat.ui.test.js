// تست سرتاسری «تکرار آزمون با کلید آماده» و نگهبان ظاهر تازه
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html lang="fa" dir="rtl"><body><div id="app"></div></body></html>', {
  url: 'http://localhost:8080/',
});

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

const W = dom.window;
const click = (el) => el.dispatchEvent(new W.Event('click', { bubbles: true, cancelable: true }));
const settle = () => new Promise((r) => setTimeout(r, 10));
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const text = (sel) => ($(sel)?.textContent ?? '').trim();
const buttonWith = (sel, label) => $$(sel).find((b) => b.textContent.includes(label));

let app = null;
let store = null;

function boot() {
  if (app) app.destroy();
  W.localStorage.clear();
  document.getElementById('app').innerHTML = '';
  store = createAppStore();
  app = createApp({ rootEl: document.getElementById('app'), store });
  return store;
}

/** آزمون ۴ سوالی تصحیح‌شده: کلید A/A/B/C و پاسخ A/B/B/نزده → ۲ درست، ۱ غلط، ۱ نزده */
function gradedSource() {
  const exam = store.addExam({ name: 'عربی درس ۲', questionCount: 4, durationMinutes: 10, category: 'عربی' });
  store.startExam(exam.id);
  fake += 60_000;
  store.setAnswer(exam.id, 0, 'A');
  store.setAnswer(exam.id, 1, 'B');
  store.setAnswer(exam.id, 2, 'B');
  store.endExamManually(exam.id);
  store.setKeyEntry(exam.id, 0, 'A');
  store.setKeyEntry(exam.id, 1, 'A');
  store.setKeyEntry(exam.id, 2, 'B');
  store.setKeyEntry(exam.id, 3, 'C');
  const done = store.finishGrading(exam.id);
  assert.equal(done.ok, true);
  return store.get(exam.id);
}

test('تکرار از کارنامه: کلید منتقل می‌شود و پایان آزمون مستقیم کارنامه می‌دهد', async () => {
  boot();
  const source = gradedSource();

  W.location.hash = `#/exam/${source.id}/result`;
  await settle();
  assert.match(text('.result-name'), /عربی درس ۲/);
  assert.ok($('.score-ring'), 'حلقهٔ نمره در کارنامهٔ تازه');

  click(buttonWith('.result-actions .btn', 'تکرار آزمون'));
  await settle();
  await settle();

  const copy = store.all().find((e) => e.id !== source.id);
  assert.ok(copy, 'آزمون تازه ساخته شد');
  assert.match(text('.prepare-title'), /تکرار/);
  assert.ok($('.inherit-card'), 'کارت کلید آماده در صفحهٔ آماده‌سازی دیده می‌شود');
  assert.match(text('.inherit-card'), /نیازی به وارد کردن دوباره/);
  assert.match(text('.inherit-card'), /عربی درس ۲/);
  assert.match(text('.info-grid'), /خودکار/);
  assert.equal(copy.keyOrigin.examId, source.id);

  // شروع آزمون تازه
  click(buttonWith('.prepare-card .btn', 'شروع آزمون'));
  await settle();
  click(buttonWith('.modal-actions .btn', 'شروع آزمون'));
  await settle();
  await settle();

  assert.equal($$('.question-card').length, 4);
  assert.ok($('[data-auto-grade]'), 'نشان «کلید آماده» در پاسخ‌برگ');

  const cards = $$('.question-card');
  click(cards[0].querySelector('.option-btn[data-opt="A"]'));
  click(cards[1].querySelector('.option-btn[data-opt="A"]'));
  click(cards[2].querySelector('.option-btn[data-opt="C"]'));
  await settle();

  // پایان آزمون: پیام تأیید باید به تصحیح خودکار اشاره کند
  click(buttonWith('.sheet-footer .btn', 'پایان آزمون'));
  await settle();
  assert.match(text('.modal-message'), /کلید آزمون قبلی/);
  click(buttonWith('.modal-actions .btn', 'پایان آزمون'));
  await settle();
  await settle();
  await settle();

  // مستقیم کارنامه، بدون تصحیح‌کننده و بدون وارد کردن کلید
  assert.equal($('.sheet-name'), null, 'وارد تصحیح‌کننده نمی‌شویم');
  assert.match(text('.page-header h2'), /نتیجه آزمون/);
  assert.match(text('.result-name'), /تکرار/);
  assert.equal(text('.inherit-note').includes('عربی درس ۲'), true, 'منبع کلید در کارنامه');
  assert.deepEqual(
    $$('.stat-value').map((el) => el.textContent.trim()),
    ['۴', '۲', '۱', '۱'],
  );

  const graded = store.get(copy.id);
  assert.equal(graded.status, 'graded');
  assert.equal(graded.keyOrigin.examId, source.id);
});

test('اتمام زمان در آزمون تکرارشده: دکمهٔ کارنامه بدون تصحیح دستی', async () => {
  boot();
  const source = gradedSource();
  const copy = store.duplicateExam(source.id);
  store.startExam(copy.id);
  store.setAnswer(copy.id, 0, 'A');

  W.location.hash = `#/exam/${copy.id}`;
  await settle();
  await settle();
  assert.ok($('[data-auto-grade]'));

  fake += 11 * 60_000;
  store.refresh();
  await settle();
  await settle();

  assert.ok($('.lock-overlay'));
  assert.match(text('.lock-card h2'), /زمان آزمون تمام شد/);
  const viewResult = buttonWith('.lock-card .btn', 'دیدن کارنامه');
  assert.ok(viewResult, 'دکمهٔ دیدن کارنامه به‌جای ورود به تصحیح‌کننده');
  click(viewResult);
  await settle();
  await settle();

  assert.match(text('.page-header h2'), /نتیجه آزمون/);
  assert.equal(store.get(copy.id).status, 'graded');
  assert.equal(store.get(copy.id).result.correct, 1);
});

test('«وارد کردن کلید جدید» تصحیح خودکار را خاموش می‌کند', async () => {
  boot();
  const source = gradedSource();
  const copy = store.duplicateExam(source.id);
  W.location.hash = `#/exam/${copy.id}`;
  await settle();

  assert.ok($('.inherit-card'));
  click(buttonWith('.inherit-card .btn', 'وارد کردن کلید جدید'));
  await settle();
  assert.match(text('.modal-title'), /ورود کلید جدید/);
  click(buttonWith('.modal-actions .btn', 'پاک کردن کلید'));
  await settle();
  await settle();

  assert.equal($('.inherit-card'), null, 'کارت کلید آماده پنهان می‌شود');
  assert.match(text('.info-grid'), /دستی/);
  assert.deepEqual(store.get(copy.id).key, {});
  assert.equal(store.get(copy.id).keyOrigin, null);

  // پس از پایان، این بار تصحیح‌کننده باز می‌شود (کلید خالی است)
  click(buttonWith('.prepare-card .btn', 'شروع آزمون'));
  await settle();
  click(buttonWith('.modal-actions .btn', 'شروع آزمون'));
  await settle();
  await settle();
  click(buttonWith('.sheet-footer .btn', 'پایان آزمون'));
  await settle();
  click(buttonWith('.modal-actions .btn', 'پایان آزمون'));
  await settle();
  await settle();
  assert.match(text('.sheet-name'), /تصحیح‌کننده/);
});

test('ظاهر تازه: کارت معرفی، آمار آیکونی، جست‌وجوی تاریخچه و حلقهٔ نمره', async () => {
  boot();
  store.addExam({ name: 'منطق فصل ۱', questionCount: 10, durationMinutes: 20, category: 'منطق' });
  W.location.hash = '#/';
  await settle();

  assert.ok($('.home-hero'), 'کارت معرفی در داشبورد');
  assert.ok($('.home-hero .btn-hero'));
  assert.ok($('.brand-sub'));
  assert.equal($$('.stat-chip').length, 4);
  assert.equal($$('.stat-chip-icon').length, 4, 'آمار با آیکن نمایش داده می‌شود');
  assert.ok($('.exam-card.is-ready'));

  W.location.hash = '#/history';
  await settle();
  assert.ok($('.search-wrap .search-input'), 'جست‌وجو با آیکن');
  assert.equal($$('.history-card').length, 1);
});

test('پاک‌سازی: بازگرداندن Date.now و نابودی اپ', () => {
  if (app) app.destroy();
  Date.now = realNow;
  assert.ok(true);
});
