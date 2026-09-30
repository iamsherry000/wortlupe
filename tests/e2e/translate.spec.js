// P2.7（SPEC §4.6）：離線整句翻譯，放在閱讀頁每一段下面（Sherry 9/29）；Grammar 面板不再重複顯示。
// 模型 41 MB 只在按「Download translation」時下載；之後把伺服器關掉（真的斷網）照樣翻。
// 每支測試自己開一台伺服器（不同 port＝不同 origin，快取彼此獨立）。
import { test, expect } from '@playwright/test';
import { readText, waitForServiceWorker } from './helpers.js';
import { startServer } from './server.mjs';

test.describe.configure({ mode: 'serial' });

async function install(page, port) {
  const server = await startServer(port);
  await page.goto(server.url + '/');
  await expect(page.locator('html')).toHaveAttribute('data-ready', '1');
  await waitForServiceWorker(page);
  return server;
}

test('還沒下載：閱讀頁上方是下載按鈕，段落下面沒有翻譯；點字、按 Grammar 都不發網路請求（TN）', async ({ page }) => {
  const server = await install(page, 4191);
  server.reset();
  await readText(page, 'Wir freuen uns auf das Wochenende!');
  await expect(page.locator('#mt-banner button.mt-download')).toHaveText('Download translation (41 MB, once)');
  await expect(page.locator('#text .para-tr:visible')).toHaveCount(0);
  await page.locator('#text .g-btn').first().click();
  await expect(page.locator('#card')).toHaveAttribute('data-state', /^(rules|norule)$/);
  expect(server.state.count, server.state.paths.join(', ')).toBe(0);
  await server.close();
});

// Sherry 9/29：「Read 之後就有整句翻譯，然後可以繼續點字、點文法」「點 Grammar 之後就不要顯示 Translation」
test('下載一次 → 每段下面有英文；照樣點字、按 Grammar（面板裡沒有重複的翻譯）；Hide；口語先還原再翻；斷網照樣', async ({ page }) => {
  test.setTimeout(180_000);
  const server = await install(page, 4193);
  const text = 'Wir freuen uns auf das Wochenende! Bitte bringen Sie Ihre Karte mit.\nFreu mich drauf 😊';
  await readText(page, text);
  await page.locator('#mt-banner button.mt-download').click();
  const tr = page.locator('#text .para-tr');
  await expect(tr).toHaveCount(2);
  await expect(tr.nth(0)).toContainText(/look(ing)? forward to the weekend/i, { timeout: 120_000 });
  await expect(tr.nth(0)).toContainText(/card/i);
  // Freu mich drauf → 先還原成 Freue mich darauf 再翻（spike：不還原會翻成 "Fee looking forward to it"）
  await expect(tr.nth(1)).toContainText(/look(ing)? forward to it/i, { timeout: 60_000 });
  await expect(tr.nth(1)).not.toContainText(/fee/i);
  expect(server.state.paths).toContain('/mt/model.deen.intgemm.alphas.bin.part0');
  // 翻譯在原文那一段的下面
  const y = async (loc) => (await loc.boundingBox()).y;
  expect(await y(tr.nth(0))).toBeGreaterThan(await y(page.locator('#text .w', { hasText: /^Karte$/ })));
  expect(await y(tr.nth(0))).toBeLessThan(await y(page.locator('#text .w', { hasText: /^Freu$/ })));
  // 照樣點字
  await page.locator('#text .w', { hasText: /^freuen$/ }).click();
  await expect(page.locator('#card')).toContainText('present tense · 1st person · plural (wir)');
  await page.keyboard.press('Escape');
  // 照樣按 Grammar；面板裡不再重複翻譯
  await page.locator('#text .g-btn').nth(1).click();
  await expect(page.locator('#card')).toHaveAttribute('data-state', /^(rules|norule)$/);
  await expect(page.locator('#card [data-field="translation"]')).toHaveCount(0);
  await expect(page.locator('#card-body')).not.toContainText('Translation');
  await page.screenshot({ path: 'docs/screens/p27-reader-translation.png' });
  await page.keyboard.press('Escape');
  // Hide／Show
  await page.locator('#mt-toggle').click();
  await expect(tr.nth(0)).toBeHidden();
  await page.locator('#mt-toggle').click();
  await expect(tr.nth(0)).toBeVisible();
  await expect(page.locator('#card')).toBeHidden();
  await page.screenshot({ path: 'docs/screens/p27-reader-only.png' });
  // 真的斷網：重開、再貼，翻譯自動出來
  await server.close();
  await expect(fetch(server.url + '/index.html')).rejects.toThrow();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-ready', '1');
  await readText(page, 'Ich habe morgen leider keine Zeit.');
  await expect(page.locator('#text .para-tr').first()).toContainText(/time/i, { timeout: 60_000 });
  // 換 App 版本時翻譯模型不會被清掉：About 的版本只列 App 本身
  await expect(page.locator('#version')).not.toContainText('mt');
});
