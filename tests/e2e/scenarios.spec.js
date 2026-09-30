// TESTS §1 BDD 情境 S01–S08（S09、S10 屬 P2，這期不寫）＋ P1 字卡行為。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { openApp, readText, tap, word } from './helpers.js';

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (e) => { throw e; });
  await openApp(page);
});

test('S01 名詞顯示冠詞、複數與解釋', async ({ page }) => {
  await readText(page, 'Das Haus ist groß.');
  const card = await tap(page, 'Haus');
  await expect(card).toContainText('das Haus');
  await expect(card).toContainText('Häuser');
  await expect(card).toContainText('house');
});

test('S02 變化形顯示原形與變化說明', async ({ page }) => {
  await readText(page, 'Wir gingen nach Hause.');
  const card = await tap(page, 'gingen');
  await expect(card.locator('.lemma').first()).toHaveText('gehen');
  await expect(card).toContainText('past tense');
  await expect(card).toContainText('to go');
});

test('S03 同形多義全部列出', async ({ page }) => {
  await readText(page, 'Die Bank ist geschlossen.');
  const card = await tap(page, 'Bank');
  // 兩個讀法都在第一屏（不是收在「其他讀法」裡）
  const main = card.locator('.reading:not(.other)');
  await expect(main.filter({ hasText: 'bench' })).toHaveCount(1);
  await expect(main.filter({ hasText: 'bank (financial' })).toHaveCount(1);
});

test('S04 句首大寫的動詞也查得到', async ({ page }) => {
  await readText(page, 'Kommst du morgen?');
  const card = await tap(page, 'Kommst');
  await expect(card.locator('.lemma').first()).toHaveText('kommen');
});

test('S05 可分離動詞提示', async ({ page }) => {
  await readText(page, 'Ich rufe dich morgen an.');
  const card = await tap(page, 'rufe');
  const hint = card.locator('.separable-hint');
  await expect(hint).toContainText('anrufen');
  await expect(hint).toContainText('to call');
  // "an" 用虛線連回 "rufe"
  const an = word(page, 'an');
  await expect(an).toHaveClass(/sep-prefix/);
  await expect(word(page, 'rufe')).toHaveClass(/sep-verb/);
  const line = page.locator('#sep-line path');
  await expect(line).toHaveCount(1);
  await expect(line).toHaveAttribute('stroke-dasharray', /\d/);
});

test('S06 查不到的字不編造', async ({ page }) => {
  await readText(page, 'Hallo Jonas 😊 https://x.de 15 Uhr');
  const card = await tap(page, 'Jonas');
  await expect(card).toHaveAttribute('data-state', 'notfound');
  await expect(card).toContainText('Not in dictionary');
  await expect(card.locator('.field, .reading')).toHaveCount(0);
  // 表情符號、網址、數字都不能點
  await expect(page.locator('#text .w')).toHaveText(['Hallo', 'Jonas', 'Uhr']);
  for (const t of ['😊', 'https://x.de', '15']) {
    const el = page.locator('#text .nw', { hasText: t }).first();
    await expect(el).toBeVisible();
    await expect(el).not.toHaveAttribute('role', 'button');
  }
  await page.locator('#close').click();
  await page.locator('#text .nw', { hasText: '😊' }).first().click();
  await expect(page.locator('#card')).toBeHidden();
});

// S07 在 offline.spec.js（需要先裝好 service worker 再斷網）

test.fixme('S08 存生字以原形去重 — 生字本屬 P4（Charles 指示 P1 存生字按鈕先放著不接）', async () => {});

test('P1 字卡 ◀ ▶ 逐字移動，跳過表情與數字', async ({ page }) => {
  await readText(page, 'Das Haus 😊 15 ist groß.');
  const card = await tap(page, 'Haus');
  await page.locator('#next').click();
  await expect(card).toHaveAttribute('data-token', 'ist');
  await page.locator('#prev').click();
  await expect(card).toHaveAttribute('data-token', 'Haus');
  await page.locator('#prev').click();
  await expect(card).toHaveAttribute('data-token', 'Das');
  await expect(page.locator('#prev')).toBeDisabled();
});

test('P1 字卡 擋到被點的字就移到上方', async ({ page }) => {
  const long = Array.from({ length: 40 }, (_, k) => `Zeile ${k} Das Haus ist groß.`).join('\n');
  await readText(page, long);
  // 把字捲到畫面最下緣（底部卡片一定會蓋到它）
  const last = word(page, 'groß', 25);
  await last.evaluate((el) => el.scrollIntoView({ block: 'end' }));
  await last.click();
  await expect(page.locator('#card')).toHaveClass(/\btop\b/);
  // 卡片不可蓋住被點的字
  const w = await last.boundingBox();
  const c = await page.locator('#card').boundingBox();
  expect(w.y >= c.y + c.height || w.y + w.height <= c.y).toBe(true);
  // 關掉卡片，點畫面上方的字 → 卡片在底部
  await page.locator('#close').click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await word(page, 'Das', 0).click();
  await expect(page.locator('#card')).not.toHaveClass(/\btop\b/);
});

// 9/28 Sherry：「Setting Safari 打不開」—— SW 把所有沒快取的頁面都換成 App 本體
test('9/28 已裝好 Wortlupe（SW 接管）後，設定教學頁照樣打得開', async ({ page }) => {
  await openApp(page);
  await page.goto('/setting.html');
  await expect(page).toHaveTitle('Wortlupe 設定教學');
  await expect(page.locator('h1')).toContainText('輕點手機背面兩下');
});

// 9/29 Sherry：「wortlupe setting 加一個英文版」—— 中英兩頁互相連得到，About 兩個都連
test('9/29 設定教學頁有英文版，中英互連、About 兩個都有', async ({ page }) => {
  await openApp(page);
  await expect(page.locator('#about a[href="setting-en.html"]')).toHaveText('English');
  await expect(page.locator('#about a[href="setting.html"]')).toHaveText('中文');
  await page.goto('/setting.html');
  await page.locator('a[href="setting-en.html"]').click();
  await expect(page).toHaveTitle('Wortlupe Setup Guide');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('h1')).toContainText('tap the back of your phone twice');
  await page.locator('a[href="setting.html"]').click();
  await expect(page).toHaveTitle('Wortlupe 設定教學');
});

test('9/28 About 顯示這支手機裝好的版本', async ({ page }) => {
  await openApp(page);
  const sw = readFileSync(join(process.cwd(), 'sw.js'), 'utf8');
  const version = sw.match(/const VERSION = `wortlupe-([^$]+)\$\{DATA_BUILD\}`/)[1] + sw.match(/const DATA_BUILD = '([^']+)'/)[1];
  await page.reload();
  await expect(page.locator('#version')).toHaveText(version);
});

test('P1 字卡 欄位順序照 SPEC §4.1（原形→形→詞性→名詞→動詞→…→解釋）', async ({ page }) => {
  await readText(page, 'Ich will dich anrufen.');
  const card = await tap(page, 'anrufen');
  const order = await card.locator('.reading').first().locator('[data-field]').evaluateAll((els) => els.map((e) => e.dataset.field));
  const spec = ['lemma', 'form', 'usage-hit', 'pos', 'noun', 'verb', 'adj', 'prep', 'compound', 'glosses', 'usage']; // usage：P2.6 SPEC §4.5 B
  const idx = order.map((f) => spec.indexOf(f));
  expect(idx.every((v) => v >= 0)).toBe(true);
  expect([...idx].sort((a, b) => a - b)).toEqual(idx);
  await expect(card.locator('[data-field="verb"]').first()).toContainText('separable');
  await expect(card.locator('[data-field="verb"]').first()).toContainText('angerufen');
});

test('P1 字卡 存生字按鈕存在但尚未啟用（P4）', async ({ page }) => {
  await readText(page, 'Das Haus ist groß.');
  await tap(page, 'Haus');
  await expect(page.locator('#save')).toBeDisabled();
});

test('P1 候選排序 heute 第一個讀法是副詞', async ({ page }) => {
  await readText(page, 'Ich komme heute.');
  const card = await tap(page, 'heute');
  const first = card.locator('.reading').first();
  await expect(first.locator('.lemma')).toHaveText('heute');
  await expect(first.locator('[data-field="pos"]')).toHaveText('adverb');
});

test('P1 候選排序 fahren 首要義項含 drive／ride／travel', async ({ page }) => {
  await readText(page, 'Wir fahren morgen.');
  const card = await tap(page, 'fahren');
  await expect(card.locator('.reading').first().locator('[data-field="glosses"] li').first()).toHaveText(/drive|ride|travel/);
});

test('P1 冠詞 Die 顯示 the ＋性別、格、數', async ({ page }) => {
  await readText(page, 'Die Bank ist geschlossen.');
  const card = await tap(page, 'Die');
  const first = card.locator('.reading').first();
  await expect(first.locator('[data-field="glosses"]')).toHaveText(/^\s*the\s*$/);
  await expect(first.locator('[data-field="form"]')).toContainText('feminine · nominative · singular');
});

test('P1 介系詞第 7 欄 mit → dative', async ({ page }) => {
  await readText(page, 'Ich fahre mit dem Bus.');
  const card = await tap(page, 'mit');
  await expect(card.locator('[data-field="prep"]').first()).toContainText('dative');
});
