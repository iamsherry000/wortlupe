// P2.3 S11 從網址片段打開（iOS 捷徑：…/#t=<URL 編碼的文字>）：文字出現、網址清掉、零網路請求（TN）、離線可用。
// 每支測試自己開一台伺服器（不同 port＝不同 origin，SW 彼此獨立）。
import { test, expect } from '@playwright/test';
import { tap, waitForServiceWorker } from './helpers.js';
import { startServer } from './server.mjs';

test.describe.configure({ mode: 'serial' });

const MSG = 'Hallo Sherry 😊\nKannst du heute die Kinder abholen?\nSchöne Grüße aus Köln';
// 捷徑的 URL 編碼有時把空白編成 +
const plus = (s) => encodeURIComponent(s).replace(/%20/g, '+');

async function install(page, port) {
  const server = await startServer(port);
  await page.goto(server.url + '/');
  await expect(page.locator('html')).toHaveAttribute('data-ready', '1');
  await waitForServiceWorker(page);
  return server;
}
// 閱讀頁的文字（拿掉 Grammar 按鈕）必須跟原文一字不差：換行、表情符號、變音字母都在
const shown = (page) => page.locator('#text').evaluate((el) => {
  const c = el.cloneNode(true);
  c.querySelectorAll('.g-btn').forEach((b) => b.remove());
  return c.textContent;
});
async function expectRead(page, text) {
  await expect(page.locator('#reader')).toBeVisible();
  await expect.poll(() => shown(page)).toBe(text);
}

test('S11 從網址片段打開：文字出現、網址清掉、沒有網路請求（TN）', async ({ page }) => {
  const server = await install(page, 4184);
  await page.goto('about:blank');
  server.reset();
  await page.goto(`${server.url}/#t=${plus(MSG)}`);
  await expectRead(page, MSG);
  expect(page.url()).toBe(`${server.url}/`);
  expect(await page.evaluate(() => location.hash)).toBe('');
  const card = await tap(page, 'Kinder');
  await expect(card).toContainText('Kind');
  // 已經開著的頁面：片段改變（不會重新載入）也要讀進來
  const second = 'Ich bin gleich da, warte kurz.';
  await page.evaluate((h) => { location.hash = h; }, `t=${encodeURIComponent(second)}`);
  await expectRead(page, second);
  expect(await page.evaluate(() => location.hash)).toBe('');
  const { paths } = server.state;
  await server.close();
  console.log(`S11 TN：SW 裝好後伺服器收到 ${paths.length} 個請求：${paths.join(', ') || '（無）'}`);
  expect(paths.filter((p) => p !== '/sw.js')).toEqual([]);
});

test('S11 離線時從網址片段打開', async ({ page }) => {
  const server = await install(page, 4185);
  await server.close();
  await expect(fetch(server.url + '/index.html')).rejects.toThrow();
  await page.goto('about:blank');
  const text = `Die Kleine hat Fieber. ${'Ich gehe heute nach Hause, weil ich müde bin. '.repeat(110)}Tschüss 👋`;
  expect(text.length).toBeGreaterThan(5000);
  await page.goto(`${server.url}/#t=${encodeURIComponent(text)}`);
  await expectRead(page, text);
  expect(await page.evaluate(() => location.hash)).toBe('');
  const card = await tap(page, 'Fieber');
  await expect(card).toContainText('das Fieber');
});

test('S11 片段解碼失敗：可讀的錯誤訊息，不白頁；空片段照常顯示輸入頁', async ({ page }) => {
  const server = await startServer(4186);
  await page.goto(`${server.url}/#t=Das%E0%A4%A`);
  await expect(page.locator('html')).toHaveAttribute('data-ready', '1');
  await expect(page.locator('#compose')).toBeVisible();
  await expect(page.locator('#hint')).toContainText('could not be read');
  expect(await page.evaluate(() => location.hash)).toBe('');
  await page.goto('about:blank');
  await page.goto(`${server.url}/#t=`);
  await expect(page.locator('html')).toHaveAttribute('data-ready', '1');
  await expect(page.locator('#compose')).toBeVisible();
  await expect(page.locator('#hint')).toBeHidden();
  await server.close();
});
